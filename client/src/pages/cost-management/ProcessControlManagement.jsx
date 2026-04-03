import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tree,
  Typography,
  Upload,
  message,
} from "antd";
import {
  PaperClipOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { http } from "../../api/http.js";
import { getTablePagination } from "../../utils/tablePagination.js";

import classTree from "../../../../class.json";

function flattenSubjects(
  nodes,
  parentId = null,
  level = 0,
  acc = [],
  sortIndex = { i: 1 }
) {
  if (!Array.isArray(nodes)) return acc;
  for (const node of nodes) {
    const id = Number(node.id);
    const name = String(node.name ?? "");
    const children = Array.isArray(node.children) ? node.children : [];
    const isLeaf = children.length === 0;
    acc.push({
      id,
      name,
      parentId,
      isLeaf,
      level,
      sortOrder: sortIndex.i++,
    });
    if (!isLeaf) flattenSubjects(children, id, level + 1, acc, sortIndex);
  }
  return acc;
}

function toAntTreeData(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => ({
    title: n.name,
    key: String(n.id),
    children:
      n.children?.length > 0 ? toAntTreeData(n.children) : undefined,
  }));
}

/** 按标题过滤树：命中节点保留整棵子树；否则仅保留匹配的子分支 */
function filterTreeData(nodes, searchLower) {
  if (!searchLower) return nodes;
  const out = [];
  for (const node of nodes) {
    const title = String(node.title ?? "");
    const match = title.toLowerCase().includes(searchLower);
    const children = node.children ? filterTreeData(node.children, searchLower) : [];
    if (match) {
      out.push({ ...node });
    } else if (children.length) {
      out.push({ ...node, children });
    }
  }
  return out;
}

function randInt(min, max, seed) {
  const x = Math.sin(seed) * 10000;
  const r = x - Math.floor(x);
  return Math.floor(min + r * (max - min + 1));
}

function money(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const emptyMonth = () => ({
  internal: 0,
  estimate: 0,
  actual: 0,
  paid: 0,
  unpaid: 0,
});

/** 统计周期：第 0 月为 2025-12，第 11 月为 2026-11 */
function periodYearMonth(monthIndex) {
  const d = new Date(2025, 11 + monthIndex, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

/** 确定性测试数据：预估发生金额默认等于内控金额 */
function testMonthValues(projectId, leafId, month) {
  const seed = projectId * 7919 + leafId * 9973 + month * 104729;
  const wave = 0.82 + 0.18 * Math.sin(((month + 1) / 12) * Math.PI * 2);
  const base = 2800 + (Math.abs(seed) % 14000) * 0.12;
  const internal = Math.round(base * wave * 100) / 100;
  const estimate = internal;
  const actual =
    Math.round(estimate * (0.86 + (month % 6) * 0.018) * 100) / 100;
  let paid =
    Math.round(actual * (0.32 + (seed % 11) * 0.045) * 100) / 100;
  if (paid > actual) paid = actual;
  const unpaid = Math.round(Math.max(0, actual - paid) * 100) / 100;
  return { internal, estimate, actual, paid, unpaid };
}

const DEFAULT_ROOT_SUBJECT_KEY = classTree[0] ? String(classTree[0].id) : null;

export default function ProcessControlManagement() {
  const { t } = useTranslation();

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectId, setProjectId] = useState(undefined);

  const [selectedKeys, setSelectedKeys] = useState(() =>
    DEFAULT_ROOT_SUBJECT_KEY ? [DEFAULT_ROOT_SUBJECT_KEY] : []
  );
  const [subjectSearch, setSubjectSearch] = useState("");
  /** key: `${projectId}_${leafId}_${month0-11}` */
  const [leafMonthData, setLeafMonthData] = useState({});
  /** 实付追加弹框 */
  const [paidModal, setPaidModal] = useState({
    open: false,
    monthIndex: null,
  });
  const [paidForm] = Form.useForm();
  const [fileListForPaidModal, setFileListForPaidModal] = useState([]);

  /** 每行附件展示：key 同上，value 为 fileList */
  const [rowAttachments, setRowAttachments] = useState({});

  const allSubjects = useMemo(() => {
    const flat = flattenSubjects(classTree);
    flat.sort((a, b) => a.sortOrder - b.sortOrder);
    return flat;
  }, []);

  const subjectById = useMemo(() => {
    const m = new Map();
    for (const s of allSubjects) m.set(String(s.id), s);
    return m;
  }, [allSubjects]);

  const childrenByParent = useMemo(() => {
    const m = new Map();
    for (const s of allSubjects) {
      const key = s.parentId === null ? "__ROOT__" : String(s.parentId);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(s);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [allSubjects]);

  const treeData = useMemo(() => toAntTreeData(classTree), []);

  const filteredTreeData = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return filterTreeData(treeData, q);
  }, [treeData, subjectSearch]);

  const leaves = useMemo(
    () => allSubjects.filter((s) => s.isLeaf),
    [allSubjects]
  );

  const leafKey = useCallback((proj, leafId, month) => {
    return `${proj}_${leafId}_${month}`;
  }, []);

  /** 某节点某月聚合（父=子之和） */
  const aggregateMonthForNode = useCallback(
    (proj, nodeIdStr, month) => {
      if (proj == null || proj === undefined) return emptyMonth();
      const sub = subjectById.get(nodeIdStr);
      if (!sub) return emptyMonth();
      if (sub.isLeaf) {
        const k = leafKey(proj, sub.id, month);
        return leafMonthData[k] ? { ...leafMonthData[k] } : emptyMonth();
      }
      const kids = childrenByParent.get(nodeIdStr) || [];
      const acc = emptyMonth();
      for (const ch of kids) {
        const v = aggregateMonthForNode(proj, String(ch.id), month);
        acc.internal += v.internal;
        acc.estimate += v.estimate;
        acc.actual += v.actual;
        acc.paid += v.paid;
        acc.unpaid += v.unpaid;
      }
      return acc;
    },
    [subjectById, childrenByParent, leafMonthData, leafKey]
  );

  /** 选中节点：默认一级科目；12 个月始终展示（无项目或无数据时为 0） */
  const selectedNodeId =
    selectedKeys[0] ?? DEFAULT_ROOT_SUBJECT_KEY ?? undefined;
  const selectedSubject = selectedNodeId
    ? subjectById.get(String(selectedNodeId))
    : null;
  const isLeafSelected = selectedSubject?.isLeaf ?? false;

  const monthlyRowsForSelection = useMemo(() => {
    const nodeId = selectedNodeId ? String(selectedNodeId) : null;
    const rows = [];
    for (let m = 0; m < 12; m++) {
      if (!nodeId) {
        rows.push({ monthIndex: m, ...emptyMonth() });
        continue;
      }
      const v = projectId
        ? aggregateMonthForNode(projectId, nodeId, m)
        : emptyMonth();
      rows.push({ monthIndex: m, ...v });
    }
    return rows;
  }, [projectId, selectedNodeId, aggregateMonthForNode]);

  const summaryForSelection = useMemo(() => {
    const acc = emptyMonth();
    for (const r of monthlyRowsForSelection) {
      acc.internal += r.internal;
      acc.estimate += r.estimate;
      acc.actual += r.actual;
      acc.paid += r.paid;
      acc.unpaid += r.unpaid;
    }
    return acc;
  }, [monthlyRowsForSelection]);

  /** 项目级顶部 6 项：对所有叶子 12 个月汇总 + 预算 mock */
  const projectTopStats = useMemo(() => {
    if (!projectId) {
      return {
        budget: 0,
        internal: 0,
        estimate: 0,
        actual: 0,
        paid: 0,
        unpaid: 0,
      };
    }
    const acc = emptyMonth();
    for (const leaf of leaves) {
      for (let m = 0; m < 12; m++) {
        const v = aggregateMonthForNode(projectId, String(leaf.id), m);
        acc.internal += v.internal;
        acc.estimate += v.estimate;
        acc.actual += v.actual;
        acc.paid += v.paid;
        acc.unpaid += v.unpaid;
      }
    }
    const budget = acc.internal * 1.08 + randInt(10000, 50000, projectId);
    return {
      budget,
      internal: acc.internal,
      estimate: acc.estimate,
      actual: acc.actual,
      paid: acc.paid,
      unpaid: acc.unpaid,
    };
  }, [projectId, leaves, aggregateMonthForNode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      try {
        const res = await http.get("/api/settings/projects");
        const list = Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data)
            ? res.data
            : [];
        if (cancelled) return;
        setProjects(list);
        if (list.length && projectId === undefined) {
          setProjectId(list[0].id);
        }
      } catch {
        if (!cancelled) message.error(t("costManagement.budget.loadProjectsError"));
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  /** 初始化叶子 12 月 mock */
  useEffect(() => {
    if (!projectId || !leaves.length) return;
    setLeafMonthData((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const leaf of leaves) {
        for (let m = 0; m < 12; m++) {
          const k = leafKey(projectId, leaf.id, m);
          if (next[k]) continue;
          next[k] = testMonthValues(projectId, leaf.id, m);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projectId, leaves, leafKey]);

  const updateLeafMonth = useCallback(
    (leafId, monthIndex, field, value) => {
      if (!projectId) return;
      const k = leafKey(projectId, leafId, monthIndex);
      setLeafMonthData((prev) => {
        const cur = prev[k] || emptyMonth();
        const n = { ...cur, [field]: value };
        if (field === "actual" || field === "paid") {
          n.unpaid = Math.max(0, (n.actual || 0) - (n.paid || 0));
        }
        return { ...prev, [k]: n };
      });
    },
    [projectId, leafKey]
  );

  const openPaidModal = (monthIndex) => {
    setPaidModal({ open: true, monthIndex });
    paidForm.resetFields();
    setFileListForPaidModal([]);
  };

  const submitPaidModal = async () => {
    try {
      const v = await paidForm.validateFields();
      const add = Number(v.amount);
      if (!projectId || !isLeafSelected || paidModal.monthIndex == null) {
        setPaidModal({ open: false, monthIndex: null });
        return;
      }
      const leafId = Number(selectedNodeId);
      const m = paidModal.monthIndex;
      const k = leafKey(projectId, leafId, m);
      setLeafMonthData((prev) => {
        const cur = prev[k] || emptyMonth();
        const paid = (cur.paid || 0) + add;
        const unpaid = Math.max(0, (cur.actual || 0) - paid);
        return {
          ...prev,
          [k]: { ...cur, paid, unpaid },
        };
      });
      message.success(t("costManagement.process.paidAddSuccess"));
      setPaidModal({ open: false, monthIndex: null });
    } catch {
      /* validate */
    }
  };

  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const { y, m } = periodYearMonth(i);
        return t("costManagement.process.monthYearLabel", { y, m });
      }),
    [t]
  );

  const columns = useMemo(() => {
    const base = [
      {
        title: t("costManagement.process.colMonth"),
        dataIndex: "monthIndex",
        width: 128,
        fixed: "left",
        render: (mi) => monthLabels[mi] ?? `M${mi + 1}`,
      },
      {
        title: t("costManagement.process.internal"),
        dataIndex: "internal",
        width: 120,
        render: (v) => money(v),
      },
      {
        title: t("costManagement.process.estimate"),
        dataIndex: "estimate",
        width: 140,
        render: (v, row) => {
          if (!isLeafSelected) {
            return money(v);
          }
          return (
            <InputNumber
              min={0}
              precision={2}
              style={{ width: "100%" }}
              value={v}
              onChange={(n) =>
                updateLeafMonth(
                  Number(selectedNodeId),
                  row.monthIndex,
                  "estimate",
                  n ?? 0
                )
              }
            />
          );
        },
      },
      {
        title: t("costManagement.process.actual"),
        dataIndex: "actual",
        width: 140,
        render: (v, row) => {
          if (!isLeafSelected) {
            return money(v);
          }
          return (
            <InputNumber
              min={0}
              precision={2}
              style={{ width: "100%" }}
              value={v}
              onChange={(n) =>
                updateLeafMonth(
                  Number(selectedNodeId),
                  row.monthIndex,
                  "actual",
                  n ?? 0
                )
              }
            />
          );
        },
      },
      {
        title: t("costManagement.process.paid"),
        dataIndex: "paid",
        width: 240,
        render: (v, row) => {
          if (isLeafSelected) {
            return (
              <Space wrap align="center">
                <InputNumber
                  readOnly
                  controls={false}
                  min={0}
                  precision={2}
                  style={{ width: 130 }}
                  value={v}
                />
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => openPaidModal(row.monthIndex)}
                >
                  {t("costManagement.process.addPaid")}
                </Button>
              </Space>
            );
          }
          return money(v);
        },
      },
      {
        title: t("costManagement.process.unpaid"),
        dataIndex: "unpaid",
        width: 120,
        render: (v) => money(v),
      },
      {
        title: t("costManagement.process.attachCol"),
        key: "attach",
        width: 120,
        render: (_, row) => {
          if (!projectId || !selectedNodeId) return null;
          const rk = `${projectId}_${selectedNodeId}_${row.monthIndex}`;
          return (
            <Upload
              showUploadList={{ showRemoveIcon: true }}
              fileList={rowAttachments[rk] || []}
              beforeUpload={() => false}
              onChange={({ fileList }) =>
                setRowAttachments((prev) => ({ ...prev, [rk]: fileList }))
              }
            >
              <Button type="default" size="small" icon={<PaperClipOutlined />}>
                {t("costManagement.process.addAttach")}
              </Button>
            </Upload>
          );
        },
      },
    ];
    return base;
  }, [
    t,
    monthLabels,
    isLeafSelected,
    selectedNodeId,
    updateLeafMonth,
    projectId,
    rowAttachments,
  ]);

  const tableDataSource = useMemo(() => {
    return monthlyRowsForSelection.map((r) => ({
      key: String(r.monthIndex),
      ...r,
    }));
  }, [monthlyRowsForSelection]);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {t("costManagement.process.title")}
      </Typography.Title>

      <Card className="app-stat-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Statistic
              title={t("costManagement.process.statBudget")}
              value={projectTopStats.budget}
              precision={2}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Statistic
              title={t("costManagement.process.statInternal")}
              value={projectTopStats.internal}
              precision={2}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Statistic
              title={t("costManagement.process.statEstimate")}
              value={projectTopStats.estimate}
              precision={2}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Statistic
              title={t("costManagement.process.statActual")}
              value={projectTopStats.actual}
              precision={2}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Statistic
              title={t("costManagement.process.statPaid")}
              value={projectTopStats.paid}
              precision={2}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Statistic
              title={t("costManagement.process.statUnpaid")}
              value={projectTopStats.unpaid}
              precision={2}
            />
          </Col>
        </Row>
      </Card>

      <Card
        className="app-card"
        size="small"
        title={t("costManagement.process.filterTitle")}
      >
        <Space wrap size="middle" align="center">
          <Typography.Text type="secondary">
            {t("costManagement.budget.search.project")}
          </Typography.Text>
          <Select
            showSearch
            allowClear={false}
            placeholder={t("costManagement.budget.projectPlaceholder")}
            style={{ minWidth: 240 }}
            loading={loadingProjects}
            value={projectId}
            options={projects.map((p) => ({
              value: p.id,
              label: p.name || p.code || String(p.id),
            }))}
            onChange={(v) => {
              setProjectId(v);
              if (DEFAULT_ROOT_SUBJECT_KEY) {
                setSelectedKeys([DEFAULT_ROOT_SUBJECT_KEY]);
              }
            }}
          />
        </Space>
      </Card>

      <Card className="app-card" title={t("costManagement.process.detailTitle")}>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} md={7} lg={6}>
            <Card
              size="small"
              bordered
              className="app-stat-card"
              title={t("costManagement.process.subjectTree")}
            >
              <Input
                allowClear
                placeholder={t("costManagement.process.subjectSearchPlaceholder")}
                prefix={<SearchOutlined style={{ color: "rgba(0,0,0,.45)" }} />}
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 520, overflow: "auto" }}>
                <Tree
                  showLine
                  defaultExpandAll
                  selectedKeys={selectedKeys}
                  onSelect={(keys) => {
                    if (keys.length) setSelectedKeys(keys);
                    else if (DEFAULT_ROOT_SUBJECT_KEY) {
                      setSelectedKeys([DEFAULT_ROOT_SUBJECT_KEY]);
                    }
                  }}
                  treeData={filteredTreeData}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} md={17} lg={18}>
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Card size="small" bordered className="app-stat-card">
                <Row gutter={[12, 12]}>
                  <Col span={24}>
                    <Typography.Text strong>
                      {selectedSubject?.name ?? "—"} —{" "}
                      {t("costManagement.process.summaryTitle")}
                    </Typography.Text>
                  </Col>
                  <Col xs={12} sm={8} md={6} lg={4}>
                    <Statistic
                      title={t("costManagement.process.internal")}
                      value={summaryForSelection.internal}
                      precision={2}
                    />
                  </Col>
                  <Col xs={12} sm={8} md={6} lg={4}>
                    <Statistic
                      title={t("costManagement.process.estimate")}
                      value={summaryForSelection.estimate}
                      precision={2}
                    />
                  </Col>
                  <Col xs={12} sm={8} md={6} lg={4}>
                    <Statistic
                      title={t("costManagement.process.actual")}
                      value={summaryForSelection.actual}
                      precision={2}
                    />
                  </Col>
                  <Col xs={12} sm={8} md={6} lg={4}>
                    <Statistic
                      title={t("costManagement.process.paid")}
                      value={summaryForSelection.paid}
                      precision={2}
                    />
                  </Col>
                  <Col xs={12} sm={8} md={6} lg={4}>
                    <Statistic
                      title={t("costManagement.process.unpaid")}
                      value={summaryForSelection.unpaid}
                      precision={2}
                    />
                  </Col>
                </Row>
              </Card>
              <Table
                size="small"
                bordered
                scroll={{ x: 1100 }}
                pagination={getTablePagination(t, {
                  pageSize: 12,
                  hideOnSinglePage: true,
                  showSizeChanger: false,
                })}
                columns={columns}
                dataSource={tableDataSource}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Modal
        title={t("costManagement.process.paidModalTitle")}
        open={paidModal.open}
        onOk={submitPaidModal}
        onCancel={() => setPaidModal({ open: false, monthIndex: null })}
        destroyOnClose
      >
        <Form form={paidForm} layout="vertical">
          <Form.Item
            name="amount"
            label={t("costManagement.process.paidAmount")}
            rules={[
              { required: true, message: t("costManagement.process.paidAmountRequired") },
            ]}
          >
            <InputNumber min={0} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label={t("costManagement.process.attach")}>
            <Upload
              beforeUpload={() => false}
              fileList={fileListForPaidModal}
              onChange={({ fileList }) => setFileListForPaidModal(fileList)}
            >
              <Button icon={<PaperClipOutlined />}>
                {t("costManagement.process.selectFile")}
              </Button>
            </Upload>
          </Form.Item>
          <Form.Item name="remark" label={t("costManagement.internal.form.remark")}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Upload,
  message,
} from "antd";
import {
  HistoryOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { http } from "../../api/http.js";

import classTree from "../../../../class.json";

export default function InternalValueManagement() {
  const { t } = useTranslation();

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [filters, setFilters] = useState({
    projectId: undefined,
    year: new Date().getFullYear(),
    subjectId: undefined,
  });

  // 只存叶子节点（可修改项）的数据；非叶子节点展示时做汇总
  const [leafRows, setLeafRows] = useState([]);

  const [selectedRow, setSelectedRow] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logFilterSubjectId, setLogFilterSubjectId] = useState(undefined);
  const [logTimeRange, setLogTimeRange] = useState(null);
  const [logRows, setLogRows] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

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

  const allSubjects = useMemo(() => {
    const flat = flattenSubjects(classTree);
    flat.sort((a, b) => a.sortOrder - b.sortOrder);
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjectOptions = useMemo(() => {
    return [
      {
        value: "",
        label: t("costManagement.internal.search.subjectAll"),
      },
      ...allSubjects.map((s) => ({
        value: String(s.id),
        label: `${"　".repeat(Math.min(6, s.level))}${s.name}`,
      })),
    ];
  }, [allSubjects, t]);

  const logSubjectSelectOptions = useMemo(() => {
    return allSubjects.map((s) => ({
      value: s.id,
      label: `${"　".repeat(Math.min(6, s.level))}${s.name}`,
    }));
  }, [allSubjects]);

  const loadChangeLogs = useCallback(async () => {
    if (!filters.projectId) {
      setLogRows([]);
      return;
    }
    setLogLoading(true);
    try {
      const params = { projectId: filters.projectId };
      if (filters.year != null && filters.year !== "") {
        params.year = filters.year;
      }
      if (logFilterSubjectId != null) {
        params.subjectId = logFilterSubjectId;
      }
      if (logTimeRange?.[0]) {
        params.startTime = logTimeRange[0].startOf("day").toISOString();
      }
      if (logTimeRange?.[1]) {
        params.endTime = logTimeRange[1].endOf("day").toISOString();
      }
      const res = await http.get("/api/cost/internal-value-logs", { params });
      setLogRows(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (e) {
      message.error(
        e?.response?.data?.message || e?.message || t("costManagement.internal.logLoadError")
      );
      setLogRows([]);
    } finally {
      setLogLoading(false);
    }
  }, [
    filters.projectId,
    filters.year,
    logFilterSubjectId,
    logTimeRange,
    t,
  ]);

  useEffect(() => {
    if (!logDrawerOpen) return;
    loadChangeLogs();
    // 打开抽屉时拉取；筛选变更请点「查询」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDrawerOpen]);

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

  const subjectById = useMemo(() => {
    const m = new Map();
    for (const s of allSubjects) m.set(String(s.id), s);
    return m;
  }, [allSubjects]);

  const ensureDataGenerated = (nextProjects) => {
    if (!nextProjects || nextProjects.length === 0) return;

    const seedBase = nextProjects.length * 1000 + 777;
    const nextLeafRows = [];

    for (const p of nextProjects) {
      for (const y of years) {
        for (const s of allSubjects.filter((x) => x.isLeaf)) {
          const seed = seedBase + Number(p.id) * 17 + y * 3 + s.id * 11;
          const budgetAmount = randInt(2_000_00, 12_000_000, seed);
          const internalAmount = Math.max(
            0,
            budgetAmount - randInt(0, 2_000_00, seed + 99)
          );
          const processAmount = Math.max(
            0,
            internalAmount - randInt(0, 1_500_00, seed + 199)
          );
          nextLeafRows.push({
            key: `${p.id}_${y}_${s.id}`,
            projectId: p.id,
            projectName: p.name,
            year: y,
            subjectId: s.id,
            subjectName: s.name,
            budgetAmount,
            internalAmount,
            processAmount,
            remark: "",
          });
        }
      }
    }

    setLeafRows(nextLeafRows);
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await http.get("/api/settings/projects");
      const list = res.data.data ?? [];
      setProjects(list);
      ensureDataGenerated(list);

      // 默认选中第一个项目
      setFilters((prev) => {
        if (prev.projectId) return prev;
        return { ...prev, projectId: list[0]?.id ?? undefined };
      });
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 若当前 year 不在 years 列表中，自动回退到列表第一个（一般就是当年）
  useEffect(() => {
    if (!years.includes(Number(filters.year))) {
      setFilters((p) => ({ ...p, year: years[1] ?? years[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years]);

  // 当前项目 + 年度的叶子科目数据（用于汇总、校验、树形汇总）
  const leafScope = useMemo(() => {
    return leafRows.filter((r) => {
      if (!filters.projectId) return false;
      if (String(r.projectId) !== String(filters.projectId)) return false;
      if (String(r.year) !== String(filters.year)) return false;
      return true;
    });
  }, [leafRows, filters.projectId, filters.year]);

  const totals = useMemo(() => {
    const sum = (field) =>
      leafScope.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
    return {
      budget: sum("budgetAmount"),
      internal: sum("internalAmount"),
      process: sum("processAmount"),
    };
  }, [leafScope]);

  function aggregateForSubject(subjectId) {
    const node = subjectById.get(String(subjectId));
    if (!node) return { budgetAmount: 0, internalAmount: 0, processAmount: 0 };

    if (node.isLeaf) {
      const leaf = leafScope.find((r) => String(r.subjectId) === String(subjectId));
      return {
        budgetAmount: Number(leaf?.budgetAmount) || 0,
        internalAmount: Number(leaf?.internalAmount) || 0,
        processAmount: Number(leaf?.processAmount) || 0,
        remark: leaf?.remark || "",
        leafKey: leaf?.key,
      };
    }

    const children = childrenByParent.get(String(subjectId)) || [];
    const agg = { budgetAmount: 0, internalAmount: 0, processAmount: 0, remark: "" };
    for (const c of children) {
      const v = aggregateForSubject(c.id);
      agg.budgetAmount += Number(v.budgetAmount) || 0;
      agg.internalAmount += Number(v.internalAmount) || 0;
      agg.processAmount += Number(v.processAmount) || 0;
    }
    return agg;
  }

  const treeData = useMemo(() => {
    if (!filters.projectId) return [];

    const build = (parentId) => {
      const key = parentId === null ? "__ROOT__" : String(parentId);
      const children = childrenByParent.get(key) || [];
      return children.map((s) => {
        const agg = aggregateForSubject(s.id);
        const node = {
          key: String(s.id),
          subjectId: s.id,
          subjectName: s.name,
          isLeaf: s.isLeaf,
          budgetAmount: agg.budgetAmount,
          internalAmount: agg.internalAmount,
          processAmount: agg.processAmount,
          remark: s.isLeaf ? agg.remark : "",
          leafKey: agg.leafKey,
          children: build(s.id),
        };
        return node;
      });
    };

    const roots = build(null);

    // subject filter: 只展示该节点子树
    if (!filters.subjectId) return roots;

    const target = String(filters.subjectId);
    function findSubtree(nodes) {
      for (const n of nodes) {
        if (String(n.subjectId) === target) return [n];
        if (n.children?.length) {
          const r = findSubtree(n.children);
          if (r) return r;
        }
      }
      return null;
    }

    return findSubtree(roots) || [];
  }, [filters.projectId, filters.subjectId, childrenByParent, leafScope, subjectById]);

  const columns = useMemo(
    () => [
      {
        title: t("costManagement.internal.table.subject"),
        dataIndex: "subjectName",
        key: "subjectName",
        width: 240,
        ellipsis: true,
      },
      {
        title: t("costManagement.internal.table.budgetAmount"),
        dataIndex: "budgetAmount",
        key: "budgetAmount",
        width: 108,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.table.internalAmount"),
        dataIndex: "internalAmount",
        key: "internalAmount",
        width: 108,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.table.processAmount"),
        dataIndex: "processAmount",
        key: "processAmount",
        width: 108,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.table.bcDiff"),
        key: "bcDiff",
        width: 118,
        align: "right",
        render: (_, record) => money((Number(record.internalAmount) || 0) - (Number(record.processAmount) || 0)),
      },
      {
        title: t("costManagement.internal.table.cbRate"),
        key: "cbRate",
        width: 102,
        align: "right",
        render: (_, record) => {
          const b = Number(record.internalAmount) || 0;
          const c = Number(record.processAmount) || 0;
          return b === 0 ? "—" : `${((c / b) * 100).toFixed(2)}%`;
        },
      },
      {
        title: t("costManagement.internal.table.caRate"),
        key: "caRate",
        width: 102,
        align: "right",
        render: (_, record) => {
          const a = Number(record.budgetAmount) || 0;
          const c = Number(record.processAmount) || 0;
          return a === 0 ? "—" : `${((c / a) * 100).toFixed(2)}%`;
        },
      },
      {
        title: t("costManagement.internal.table.actions"),
        key: "actions",
        width: 88,
        fixed: "right",
        render: (_, record) => {
          if (!record.isLeaf) return null;
          return (
            <Button
              size="small"
              onClick={() => {
                setSelectedRow(record);
                setModalOpen(true);
                form.setFieldsValue({
                  newAmount: record.internalAmount,
                  remark: record.remark || "",
                  attachment: [],
                });
              }}
            >
              {t("costManagement.internal.modify")}
            </Button>
          );
        },
      },
      {
        title: t("costManagement.internal.table.remark"),
        dataIndex: "remark",
        key: "remark",
        width: 140,
        ellipsis: true,
      },
    ],
    [t, form] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const logColumns = useMemo(
    () => [
      {
        title: t("costManagement.internal.logColTime"),
        dataIndex: "created_at",
        key: "created_at",
        width: 168,
        fixed: "left",
        render: (v) =>
          v
            ? dayjs(v).format("YYYY-MM-DD HH:mm:ss")
            : "—",
      },
      {
        title: t("costManagement.internal.logColSubject"),
        dataIndex: "subject_name",
        key: "subject_name",
        width: 200,
        ellipsis: true,
      },
      {
        title: t("costManagement.internal.logColOperator"),
        dataIndex: "changed_by_username",
        key: "changed_by_username",
        width: 100,
        ellipsis: true,
      },
      {
        title: t("costManagement.internal.logColOldInternal"),
        dataIndex: "old_internal_amount",
        key: "old_internal_amount",
        width: 120,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.logColNewInternal"),
        dataIndex: "new_internal_amount",
        key: "new_internal_amount",
        width: 120,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.logColRemark"),
        dataIndex: "remark",
        key: "remark",
        width: 160,
        ellipsis: true,
      },
      {
        title: t("costManagement.internal.logColAttach"),
        dataIndex: "attachment_info",
        key: "attachment_info",
        width: 200,
        ellipsis: true,
        render: (v) => {
          if (!v) return "—";
          try {
            const arr = JSON.parse(v);
            if (Array.isArray(arr)) {
              const names = arr.map((x) => x?.name).filter(Boolean);
              return names.length ? names.join("，") : "—";
            }
          } catch {
            /* plain text */
          }
          return v;
        },
      },
    ],
    [t]
  );

  const submitModify = async () => {
    if (!selectedRow) return;
    const values = await form.validateFields();
    const newAmount = Number(values.newAmount);
    const newRemark = String(values.remark ?? "");
    const fileList = values.attachment ?? [];
    const attachmentInfo =
      fileList.length > 0
        ? JSON.stringify(
            fileList.map((f) => ({
              name: f.name || f.originFileObj?.name || "file",
            }))
          )
        : null;

    const currentRowInternal = Number(selectedRow.internalAmount) || 0;
    const delta = newAmount - currentRowInternal;
    const newTotalInternal = totals.internal + delta;

    // 规则：修改后“总内控”不得大于“总预算”（按当前项目+年度全量科目）
    if (newTotalInternal > totals.budget) {
      message.warning(t("costManagement.internal.validateExceedBudget"));
      return;
    }

    setModalLoading(true);
    try {
      await http.post("/api/cost/internal-value-logs", {
        projectId: selectedRow.projectId,
        year: selectedRow.year,
        subjectId: selectedRow.subjectId,
        subjectName: selectedRow.subjectName,
        oldInternalAmount: currentRowInternal,
        newInternalAmount: newAmount,
        remark: newRemark,
        attachmentInfo,
      });
      setLeafRows((prev) =>
        prev.map((r) => {
          if (String(r.key) !== String(selectedRow.leafKey)) return r;
          return { ...r, internalAmount: newAmount, remark: newRemark };
        })
      );
      setModalOpen(false);
      message.success(t("costManagement.internal.modifySuccess"));
      if (logDrawerOpen) loadChangeLogs();
    } catch (e) {
      message.error(
        e?.response?.data?.message || e?.message || t("costManagement.internal.logSaveError")
      );
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="app-stat-card">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <StatisticCard title={t("costManagement.internal.totalBudget")} value={totals.budget} money={money} />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <StatisticCard title={t("costManagement.internal.totalInternal")} value={totals.internal} money={money} />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <StatisticCard title={t("costManagement.internal.totalDiff")} value={totals.budget - totals.internal} money={money} />
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        title={t("costManagement.internal.searchTitle")}
        className="app-card"
      >
        <Form layout="inline">
          <Space wrap size="middle" align="center">
          <Form.Item label={t("costManagement.internal.search.project")} style={{ marginBottom: 0 }}>
            <Select
              style={{ width: 220 }}
              loading={loadingProjects}
              placeholder={t("costManagement.internal.search.projectAll")}
              value={filters.projectId}
              onChange={(v) => setFilters((p) => ({ ...p, projectId: v || undefined }))}
            >
              {projects.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={t("costManagement.internal.search.year")} style={{ marginBottom: 0 }}>
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder={t("costManagement.internal.search.yearAll")}
              value={filters.year}
              onChange={(v) => setFilters((p) => ({ ...p, year: v || undefined }))}
            >
              {years.map((y) => (
                <Select.Option key={y} value={y}>
                  {y}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={t("costManagement.internal.search.subject")} style={{ marginBottom: 0 }}>
            <Select
              showSearch
              allowClear
              style={{ width: 380 }}
              placeholder={t("costManagement.internal.search.subjectAll")}
              options={subjectOptions}
              value={filters.subjectId ? String(filters.subjectId) : undefined}
              optionFilterProp="label"
              filterOption={(input, option) => {
                const label = String(option?.label ?? "");
                return label.toLowerCase().includes(String(input).toLowerCase());
              }}
              onChange={(v) => {
                if (!v) setFilters((p) => ({ ...p, subjectId: undefined }));
                else setFilters((p) => ({ ...p, subjectId: Number(v) }));
              }}
            />
          </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card
        size="small"
        title={t("costManagement.internal.listTitle")}
        className="app-card"
        extra={
          <Space>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => message.info(t("costManagement.internal.importHint"))}
            >
              {t("costManagement.internal.importBtn")}
            </Button>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => setLogDrawerOpen(true)}
            >
              {t("costManagement.internal.changeLog")}
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="key"
          size="small"
          bordered
          columns={columns}
          dataSource={treeData}
          pagination={false}
          loading={loadingProjects}
          expandable={{ defaultExpandAllRows: true }}
          scroll={{ x: 1180 }}
        />
      </Card>

      <Drawer
        title={t("costManagement.internal.logDrawerTitle")}
        placement="right"
        width={Math.min(960, typeof window !== "undefined" ? window.innerWidth - 48 : 960)}
        open={logDrawerOpen}
        onClose={() => setLogDrawerOpen(false)}
        destroyOnClose
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap align="start">
            <span style={{ lineHeight: "32px" }}>
              {t("costManagement.internal.logFilterSubject")}：
            </span>
            <Select
              allowClear
              showSearch
              placeholder={t("costManagement.internal.search.subjectAll")}
              style={{ minWidth: 220, maxWidth: 360 }}
              options={logSubjectSelectOptions}
              optionFilterProp="label"
              value={logFilterSubjectId}
              onChange={(v) => setLogFilterSubjectId(v)}
            />
            <span style={{ lineHeight: "32px" }}>
              {t("costManagement.internal.logFilterTime")}：
            </span>
            <DatePicker.RangePicker
              value={logTimeRange}
              onChange={(v) => setLogTimeRange(v)}
              style={{ maxWidth: "100%" }}
            />
            <Button type="primary" onClick={() => loadChangeLogs()}>
              {t("costManagement.internal.logSearch")}
            </Button>
          </Space>
          <Table
            rowKey={(r) =>
              String(r.id ?? `${r.created_at}_${r.subject_id}_${r.changed_by_username}`)
            }
            size="small"
            bordered
            loading={logLoading}
            columns={logColumns}
            dataSource={logRows}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 980 }}
          />
        </Space>
      </Drawer>

      <Modal
        open={modalOpen}
        title={t("costManagement.internal.modifyModalTitle")}
        onCancel={() => setModalOpen(false)}
        onOk={submitModify}
        okText={t("costManagement.internal.save")}
        confirmLoading={modalLoading}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label={t("costManagement.internal.form.internalAmount")}
            name="newAmount"
            rules={[{ required: true, message: t("common.required") }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label={t("costManagement.internal.form.remark")}
            name="remark"
            rules={[{ required: false }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            label={t("costManagement.internal.form.attach")}
            name="attachment"
            valuePropName="fileList"
            getValueFromEvent={(e) => e?.fileList ?? []}
          >
            <Upload beforeUpload={() => false} multiple>
              <Button icon={<PaperClipOutlined />}>
                {t("costManagement.internal.form.selectAttach")}
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function StatisticCard({ title, value, money }) {
  return (
    <Card size="small" bordered>
      <div style={{ marginBottom: 8, color: "#6b7280", fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{money(value)}</div>
    </Card>
  );
}


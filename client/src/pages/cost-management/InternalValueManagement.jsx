import React, { useEffect, useMemo, useState } from "react";
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
  Table,
  message,
} from "antd";
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
        width: 520,
        ellipsis: true,
      },
      {
        title: t("costManagement.internal.table.budgetAmount"),
        dataIndex: "budgetAmount",
        key: "budgetAmount",
        width: 150,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.table.internalAmount"),
        dataIndex: "internalAmount",
        key: "internalAmount",
        width: 150,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.table.processAmount"),
        dataIndex: "processAmount",
        key: "processAmount",
        width: 150,
        align: "right",
        render: (v) => money(v),
      },
      {
        title: t("costManagement.internal.table.bcDiff"),
        key: "bcDiff",
        width: 160,
        align: "right",
        render: (_, record) => money((Number(record.internalAmount) || 0) - (Number(record.processAmount) || 0)),
      },
      {
        title: t("costManagement.internal.table.cbRate"),
        key: "cbRate",
        width: 150,
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
        width: 150,
        align: "right",
        render: (_, record) => {
          const a = Number(record.budgetAmount) || 0;
          const c = Number(record.processAmount) || 0;
          return a === 0 ? "—" : `${((c / a) * 100).toFixed(2)}%`;
        },
      },
      {
        title: t("costManagement.internal.table.remark"),
        dataIndex: "remark",
        key: "remark",
        width: 220,
        ellipsis: true,
      },
      {
        title: t("costManagement.internal.table.actions"),
        key: "actions",
        width: 170,
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
                  processAmount: record.processAmount,
                  remark: record.remark || "",
                });
              }}
            >
              {t("costManagement.internal.modify")}
            </Button>
          );
        },
      },
    ],
    [t, form] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const submitModify = async () => {
    if (!selectedRow) return;
    const values = await form.validateFields();
    const newAmount = Number(values.newAmount);
    const newProcess = Number(values.processAmount);
    const newRemark = String(values.remark ?? "");

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
      setLeafRows((prev) =>
        prev.map((r) => {
          if (String(r.key) !== String(selectedRow.leafKey)) return r;
          return { ...r, internalAmount: newAmount, processAmount: newProcess, remark: newRemark };
        })
      );
      setModalOpen(false);
      message.success(t("costManagement.internal.modifySuccess"));
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div>
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
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
        style={{ borderRadius: 12, marginBottom: 16 }}
      >
        <Form layout="inline">
          <Form.Item label={t("costManagement.internal.search.project")}>
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

          <Form.Item label={t("costManagement.internal.search.year")}>
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

          <Form.Item label={t("costManagement.internal.search.subject")}>
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
        </Form>
      </Card>

      <Card size="small" title={t("costManagement.internal.listTitle")} style={{ borderRadius: 12 }}>
        <Table
          rowKey="key"
          size="small"
          bordered
          columns={columns}
          dataSource={treeData}
          pagination={false}
          loading={loadingProjects}
          expandable={{ defaultExpandAllRows: true }}
          scroll={{ x: 1700 }}
        />
      </Card>

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
            label={t("costManagement.internal.form.newAmount")}
            name="newAmount"
            rules={[{ required: true, message: t("common.required") }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label={t("costManagement.internal.form.processAmount")}
            name="processAmount"
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
        </Form>
      </Modal>
    </div>
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


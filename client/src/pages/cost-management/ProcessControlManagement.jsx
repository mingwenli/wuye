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
  Table,
  Tag,
  Tree,
  Typography,
  Upload,
  message,
} from "antd";
import {
  AccountBookOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FundOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RiseOutlined,
  SearchOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { http } from "../../api/http.js";
import { getTablePagination } from "../../utils/tablePagination.js";
import { downloadCsv, csvFilename } from "../../utils/exportCsv.js";
import { MetricStatCard, MetricStatCardSection } from "../../components/MetricStatCard/index.js";
import {
  PROCESS_SUBMIT_MONTH_INDEX,
  periodYearMonth,
  loadSubmittedMonthsArray,
  loadAuditedMonthsArray,
  saveSubmittedMonthsArray,
  revokeProcessControlMonth,
} from "../../utils/processControlStorage.js";

import classTree from "@classTree";

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

function sumNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 过程发生比 = (预估 + 实际) / 内控，内控为 0 时无意义 */
function formatProcessOccurRatio(internal, estimate, actual) {
  const int = Number(internal);
  if (!Number.isFinite(int) || int === 0) return "—";
  const sum = (Number(actual) || 0) + (Number(estimate) || 0);
  const r = sum / int;
  return `${(r * 100).toFixed(2)}%`;
}

const emptyMonth = () => ({
  internal: 0,
  estimate: 0,
  actual: 0,
  paid: 0,
  unpaid: 0,
});

/** monthIndex ≥ 4 即 2026年4 月起：未发生月，实际发生为空，仅有预估 */
const FIRST_FUTURE_MONTH_INDEX = 4;

/** 确定性测试数据：4 月及以后仅预估；此前月份预估默认同内控 */
function testMonthValues(projectId, leafId, month) {
  const seed = projectId * 7919 + leafId * 9973 + month * 104729;
  const wave = 0.82 + 0.18 * Math.sin(((month + 1) / 12) * Math.PI * 2);
  const base = 2800 + (Math.abs(seed) % 14000) * 0.12;
  const internal = Math.round(base * wave * 100) / 100;
  const estimate = internal;

  if (month >= FIRST_FUTURE_MONTH_INDEX) {
    return {
      internal,
      estimate,
      actual: null,
      paid: 0,
      unpaid: 0,
    };
  }

  const actual =
    Math.round(estimate * (0.86 + (month % 6) * 0.018) * 100) / 100;
  let paid =
    Math.round(actual * (0.32 + (seed % 11) * 0.045) * 100) / 100;
  if (paid > actual) paid = actual;
  const unpaid = Math.round(Math.max(0, actual - paid) * 100) / 100;
  /** 实际发生金额有值时，预估金额为 0 */
  const estimateFinal = actual > 0 ? 0 : estimate;
  return { internal, estimate: estimateFinal, actual, paid, unpaid };
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

  /** 已提交审核的月份（monthIndex），本地持久化 */
  const [submittedMonths, setSubmittedMonths] = useState(() => new Set());
  /** 已审核通过的月份（只读，默认含 1、2 月） */
  const [auditedMonths, setAuditedMonths] = useState(() => new Set());
  const [submitMonthModalOpen, setSubmitMonthModalOpen] = useState(false);

  const isMonthLocked = useCallback(
    (monthIndex) =>
      submittedMonths.has(monthIndex) || auditedMonths.has(monthIndex),
    [submittedMonths, auditedMonths]
  );

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
        acc.internal += Number(v.internal) || 0;
        acc.estimate += Number(v.estimate) || 0;
        acc.actual += sumNum(v.actual);
        acc.paid += Number(v.paid) || 0;
        acc.unpaid += Number(v.unpaid) || 0;
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
      acc.internal += Number(r.internal) || 0;
      acc.estimate += Number(r.estimate) || 0;
      acc.actual += sumNum(r.actual);
      acc.paid += Number(r.paid) || 0;
      acc.unpaid += Number(r.unpaid) || 0;
    }
    return acc;
  }, [monthlyRowsForSelection]);

  /** 汇总区指标：动态金额 = 预估+实际；应付金额 = 实际 */
  const summaryMetrics = useMemo(() => {
    const s = summaryForSelection;
    return {
      internal: s.internal,
      dynamic: s.estimate + s.actual,
      payable: s.actual,
      paid: s.paid,
      unpaid: s.unpaid,
    };
  }, [summaryForSelection]);

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
        acc.internal += Number(v.internal) || 0;
        acc.estimate += Number(v.estimate) || 0;
        acc.actual += sumNum(v.actual);
        acc.paid += Number(v.paid) || 0;
        acc.unpaid += Number(v.unpaid) || 0;
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

  useEffect(() => {
    if (!projectId) return;
    setSubmittedMonths(new Set(loadSubmittedMonthsArray(projectId)));
    setAuditedMonths(new Set(loadAuditedMonthsArray(projectId)));
  }, [projectId]);

  /** 一次性：将 4 月及以后月份刷成「仅预估、实际为空」的口径 */
  useEffect(() => {
    if (!projectId || !leaves.length) return;
    const flag = `processControl_futureSeed_v1_${projectId}`;
    if (localStorage.getItem(flag)) return;
    setLeafMonthData((prev) => {
      const next = { ...prev };
      for (const leaf of leaves) {
        for (let m = FIRST_FUTURE_MONTH_INDEX; m < 12; m++) {
          const k = leafKey(projectId, leaf.id, m);
          next[k] = testMonthValues(projectId, leaf.id, m);
        }
      }
      return next;
    });
    localStorage.setItem(flag, "1");
  }, [projectId, leaves, leafKey]);

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
      if (submittedMonths.has(monthIndex) || auditedMonths.has(monthIndex)) return;
      const k = leafKey(projectId, leafId, monthIndex);
      setLeafMonthData((prev) => {
        const cur = prev[k] || emptyMonth();
        const n = { ...cur };
        if (field === "actual") {
          const raw = value;
          if (raw === null || raw === undefined || raw === "") {
            n.actual = null;
          } else {
            const av = Number(raw);
            n.actual = Number.isNaN(av) ? null : av;
            if (av > 0) {
              n.estimate = 0;
            }
          }
        } else if (field === "estimate") {
          const av = sumNum(cur.actual);
          if (av > 0) {
            n.estimate = 0;
          } else {
            n.estimate = Number(value) || 0;
          }
        } else {
          n[field] = value;
        }
        if (field === "actual" || field === "paid") {
          const act = sumNum(n.actual);
          n.unpaid = Math.max(0, act - (n.paid || 0));
        }
        return { ...prev, [k]: n };
      });
    },
    [projectId, leafKey, submittedMonths, auditedMonths]
  );

  const handleConfirmSubmitMonth = useCallback(() => {
    if (!projectId) return;
    const snapshot = {};
    for (const leaf of leaves) {
      const k = leafKey(projectId, leaf.id, PROCESS_SUBMIT_MONTH_INDEX);
      snapshot[k] = leafMonthData[k] ?? null;
    }
    try {
      localStorage.setItem(
        `processControl_report_${projectId}_${PROCESS_SUBMIT_MONTH_INDEX}`,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          projectId,
          monthIndex: PROCESS_SUBMIT_MONTH_INDEX,
          data: snapshot,
        })
      );
    } catch {
      message.error(t("common.error"));
      return;
    }
    setSubmittedMonths((prev) => {
      const next = new Set(prev);
      next.add(PROCESS_SUBMIT_MONTH_INDEX);
      try {
        saveSubmittedMonthsArray(projectId, [...next]);
      } catch {
        /* ignore */
      }
      return next;
    });
    setSubmitMonthModalOpen(false);
    message.success(t("costManagement.process.submitMonthSuccess"));
  }, [projectId, leaves, leafKey, leafMonthData, t]);

  const handleRevokeAudit = useCallback(() => {
    if (!projectId) return;
    Modal.confirm({
      title: t("costManagement.process.revokeConfirmTitle"),
      content: t("costManagement.process.revokeConfirmContent", {
        m: periodYearMonth(PROCESS_SUBMIT_MONTH_INDEX).m,
      }),
      okText: t("settings.common.ok"),
      cancelText: t("settings.common.cancel"),
      onOk: () => {
        revokeProcessControlMonth(projectId, PROCESS_SUBMIT_MONTH_INDEX);
        setSubmittedMonths(new Set(loadSubmittedMonthsArray(projectId)));
        message.success(t("costManagement.process.revokeSuccess"));
      },
    });
  }, [projectId, t]);

  const openPaidModal = (monthIndex) => {
    if (submittedMonths.has(monthIndex) || auditedMonths.has(monthIndex)) return;
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
      const m = paidModal.monthIndex;
      if (submittedMonths.has(m) || auditedMonths.has(m)) {
        setPaidModal({ open: false, monthIndex: null });
        return;
      }
      const leafId = Number(selectedNodeId);
      const k = leafKey(projectId, leafId, m);
      setLeafMonthData((prev) => {
        const cur = prev[k] || emptyMonth();
        const paid = (cur.paid || 0) + add;
        const unpaid = Math.max(0, sumNum(cur.actual) - paid);
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
        width: 168,
        fixed: "left",
        render: (mi) => (
          <Space size={4} wrap align="center">
            <span>{monthLabels[mi] ?? `M${mi + 1}`}</span>
            {auditedMonths.has(mi) ? (
              <Tag color="success">{t("costManagement.process.tagAudited")}</Tag>
            ) : submittedMonths.has(mi) ? (
              <Tag color="processing">{t("costManagement.process.tagAudit")}</Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: t("costManagement.process.internal"),
        dataIndex: "internal",
        width: 120,
        render: (v) => money(v),
      },
      {
        title: t("costManagement.process.colEstimate"),
        dataIndex: "estimate",
        width: 140,
        render: (v, row) => {
          if (!isLeafSelected) {
            return money(v);
          }
          const rowReadOnly = isMonthLocked(row.monthIndex);
          const actualVal = sumNum(row.actual);
          const locked = actualVal > 0;
          return (
            <InputNumber
              min={0}
              precision={2}
              style={{ width: "100%" }}
              value={locked ? 0 : v}
              disabled={locked || rowReadOnly}
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
        title: t("costManagement.process.colActual"),
        dataIndex: "actual",
        width: 140,
        render: (v, row) => {
          if (!isLeafSelected) {
            return money(v);
          }
          const rowReadOnly = isMonthLocked(row.monthIndex);
          return (
            <InputNumber
              min={0}
              precision={2}
              style={{ width: "100%" }}
              value={v ?? null}
              disabled={rowReadOnly}
              onChange={(n) =>
                updateLeafMonth(
                  Number(selectedNodeId),
                  row.monthIndex,
                  "actual",
                  n === null ? null : n ?? 0
                )
              }
            />
          );
        },
      },
      {
        title: t("costManagement.process.processOccurRatio"),
        key: "processOccurRatio",
        width: 128,
        render: (_, row) =>
          formatProcessOccurRatio(row.internal, row.estimate, row.actual),
      },
      {
        title: t("costManagement.process.paid"),
        dataIndex: "paid",
        width: 240,
        render: (v, row) => {
          if (isLeafSelected) {
            const rowReadOnly = isMonthLocked(row.monthIndex);
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
                  disabled={rowReadOnly}
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
          const rowReadOnly = isMonthLocked(row.monthIndex);
          return (
            <Upload
              disabled={rowReadOnly}
              showUploadList={{ showRemoveIcon: true }}
              fileList={rowAttachments[rk] || []}
              beforeUpload={() => false}
              onChange={({ fileList }) =>
                setRowAttachments((prev) => ({ ...prev, [rk]: fileList }))
              }
            >
              <Button
                type="default"
                size="small"
                icon={<PaperClipOutlined />}
                disabled={rowReadOnly}
              >
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
    submittedMonths,
    auditedMonths,
    isMonthLocked,
  ]);

  const tableDataSource = useMemo(() => {
    return monthlyRowsForSelection.map((r) => ({
      key: String(r.monthIndex),
      ...r,
    }));
  }, [monthlyRowsForSelection]);

  const handleExportProcess = () => {
    const list = monthlyRowsForSelection;
    if (!list.length) {
      message.warning(t("costManagement.exportEmpty"));
      return;
    }
    const headers = [
      t("costManagement.process.colMonth"),
      t("costManagement.process.internal"),
      t("costManagement.process.colEstimate"),
      t("costManagement.process.colActual"),
      t("costManagement.process.processOccurRatio"),
      t("costManagement.process.paid"),
      t("costManagement.process.unpaid"),
      t("costManagement.process.exportColStatus"),
    ];
    const rows = list.map((r) => {
      const mi = r.monthIndex;
      let status = "";
      if (auditedMonths.has(mi)) status = t("costManagement.process.tagAudited");
      else if (submittedMonths.has(mi)) status = t("costManagement.process.tagAudit");
      return [
        monthLabels[mi] ?? `M${mi + 1}`,
        money(r.internal),
        money(r.estimate),
        money(r.actual),
        formatProcessOccurRatio(r.internal, r.estimate, r.actual),
        money(r.paid),
        money(r.unpaid),
        status,
      ];
    });
    const proj = projects.find((p) => String(p.id) === String(projectId));
    const prefix = proj?.name || proj?.code || "process-control";
    const safe = String(prefix).replace(/[/\\?%*:|"<>]/g, "_");
    downloadCsv(csvFilename(safe), headers, rows);
    message.success(t("costManagement.exportSuccess"));
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {t("costManagement.process.title")}
      </Typography.Title>

      <MetricStatCardSection>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={4}>
            <MetricStatCard
              title={t("costManagement.process.statBudget")}
              icon={WalletOutlined}
              accent="#165DFF"
              value={projectTopStats.budget}
              precision={2}
              unit={t("common.currencyUnit")}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <MetricStatCard
              title={t("costManagement.process.statInternal")}
              icon={AccountBookOutlined}
              accent="#00B42A"
              value={projectTopStats.internal}
              precision={2}
              unit={t("common.currencyUnit")}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <MetricStatCard
              title={t("costManagement.process.statEstimate")}
              icon={FundOutlined}
              accent="#165DFF"
              value={projectTopStats.estimate}
              precision={2}
              unit={t("common.currencyUnit")}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <MetricStatCard
              title={t("costManagement.process.statActual")}
              icon={RiseOutlined}
              accent="#00B42A"
              value={projectTopStats.actual}
              precision={2}
              unit={t("common.currencyUnit")}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <MetricStatCard
              title={t("costManagement.process.statPaid")}
              icon={CheckCircleOutlined}
              accent="#165DFF"
              value={projectTopStats.paid}
              precision={2}
              unit={t("common.currencyUnit")}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <MetricStatCard
              title={t("costManagement.process.statUnpaid")}
              icon={AlertOutlined}
              accent="#FF7D00"
              value={projectTopStats.unpaid}
              precision={2}
              unit={t("common.currencyUnit")}
            />
          </Col>
        </Row>
      </MetricStatCardSection>

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

      <Card
        className="app-card"
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              width: "100%",
              paddingRight: 4,
            }}
          >
            <span>{t("costManagement.process.detailTitle")}</span>
            {projectId && submittedMonths.has(PROCESS_SUBMIT_MONTH_INDEX) ? (
              <Space wrap align="center" size="small">
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t("costManagement.process.auditMonthStatus", {
                    m: periodYearMonth(PROCESS_SUBMIT_MONTH_INDEX).m,
                  })}
                </Typography.Text>
                <Button type="link" size="small" onClick={handleRevokeAudit}>
                  {t("costManagement.process.revokeAudit")}
                </Button>
              </Space>
            ) : (
              <Button
                type="primary"
                size="small"
                disabled={!projectId}
                onClick={() => setSubmitMonthModalOpen(true)}
              >
                {t("costManagement.process.submitMonthBtn", {
                  m: periodYearMonth(PROCESS_SUBMIT_MONTH_INDEX).m,
                })}
              </Button>
            )}
          </div>
        }
      >
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} md={7} lg={6}>
            <Card
              size="small"
              bordered
              className="app-card"
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
              <Card size="small" bordered className="app-card">
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Typography.Text strong>
                    {selectedSubject?.name ?? "—"} —{" "}
                    {t("costManagement.process.summaryTitle")}
                  </Typography.Text>
                  <div className="metric-stat-row-equal-5">
                    <MetricStatCard
                      title={t("costManagement.process.internal")}
                      icon={AccountBookOutlined}
                      accent="#00B42A"
                      value={summaryMetrics.internal}
                      precision={2}
                      unit={t("common.currencyUnit")}
                    />
                    <MetricStatCard
                      title={t("costManagement.process.summaryDynamic")}
                      icon={FundOutlined}
                      accent="#165DFF"
                      value={summaryMetrics.dynamic}
                      precision={2}
                      unit={t("common.currencyUnit")}
                    />
                    <MetricStatCard
                      title={t("costManagement.process.summaryPayable")}
                      icon={RiseOutlined}
                      accent="#00B42A"
                      value={summaryMetrics.payable}
                      precision={2}
                      unit={t("common.currencyUnit")}
                    />
                    <MetricStatCard
                      title={t("costManagement.process.paid")}
                      icon={CheckCircleOutlined}
                      accent="#165DFF"
                      value={summaryMetrics.paid}
                      precision={2}
                      unit={t("common.currencyUnit")}
                    />
                    <MetricStatCard
                      title={t("costManagement.process.unpaid")}
                      icon={AlertOutlined}
                      accent="#FF7D00"
                      value={summaryMetrics.unpaid}
                      precision={2}
                      unit={t("common.currencyUnit")}
                    />
                  </div>
                </Space>
              </Card>
              <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                <Button icon={<DownloadOutlined />} onClick={handleExportProcess}>
                  {t("costManagement.exportReport")}
                </Button>
              </Space>
              <Table
                className="app-table"
                size="middle"
                scroll={{ x: 1280 }}
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
        title={t("costManagement.process.submitMonthConfirmTitle")}
        open={submitMonthModalOpen}
        onOk={handleConfirmSubmitMonth}
        onCancel={() => setSubmitMonthModalOpen(false)}
        okText={t("settings.common.ok")}
        cancelText={t("settings.common.cancel")}
        destroyOnClose
      >
        <Typography.Text>
          {t("costManagement.process.submitMonthConfirmContent", {
            y: periodYearMonth(PROCESS_SUBMIT_MONTH_INDEX).y,
            m: periodYearMonth(PROCESS_SUBMIT_MONTH_INDEX).m,
          })}
        </Typography.Text>
      </Modal>

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

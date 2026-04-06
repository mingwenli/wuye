import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tree,
  Upload,
  message,
} from "antd";
import {
  ApartmentOutlined,
  CalendarOutlined,
  DownloadOutlined,
  FieldTimeOutlined,
  FileDoneOutlined,
  HistoryOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { http } from "../../api/http.js";
import { getTablePagination } from "../../utils/tablePagination.js";
import { downloadCsv, csvFilename } from "../../utils/exportCsv.js";
import { MetricStatCard } from "../../components/MetricStatCard/index.js";
import classTreeJson from "@classTree";
import {
  buildBudgetSubjectNodesFromClass,
  collectAllKeys,
  filterBudgetSubjectNodes,
  findNodeById,
  getRootSubjectsFromClass,
} from "./budgetSubjectTreeUtils.js";
import "./BudgetSubjectTree.css";

function randInt(min, max, seed) {
  // 可复现的“随机”数：不用库，避免每次刷新数据都变
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

export default function BudgetManagement() {
  const { t } = useTranslation();

  const rootSubjects = useMemo(
    () => getRootSubjectsFromClass(classTreeJson),
    []
  );

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // 筛选条件
  const [filters, setFilters] = useState({
    projectId: undefined,
    year: undefined,
    baseSubjectId: undefined,
  });

  // 导入弹窗
  const [importOpen, setImportOpen] = useState(false);
  const [importYear, setImportYear] = useState(undefined);
  const [importFileList, setImportFileList] = useState([]);
  const [importLoading, setImportLoading] = useState(false);

  const years = useMemo(() => [2024, 2025, 2026], []);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await http.get("/api/settings/projects");
      setProjects(res.data.data ?? []);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoadingProjects(false);
    }
  };

  // 本页面预算数据：纯前端 mock（可先跑通 UI）
  const [budgets, setBudgets] = useState([]);

  useEffect(() => {
    (async () => {
      await fetchProjects();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 当 projects 就绪后，生成一批可筛选的预算数据
    if (!projects || projects.length === 0) return;

    const seedBase = projects.length * 1000;
    const mock = [];
    for (const p of projects) {
      for (const year of years) {
        for (const s of rootSubjects) {
          const seed = seedBase + Number(p.id) * 17 + year * 3 + s.id * 11;
          const amount = randInt(2_000_00, 12_000_000, seed); // 元
          mock.push({
            key: `${p.id}_${year}_${s.id}`,
            projectId: p.id,
            projectName: p.name,
            year,
            baseSubjectId: s.id,
            baseSubjectName: s.name,
            budgetAmount: amount,
          });
        }
      }
    }

    setBudgets(mock);
  }, [projects, years, rootSubjects]);

  const filteredBudgets = useMemo(() => {
    return budgets.filter((b) => {
      if (filters.projectId && String(b.projectId) !== String(filters.projectId)) return false;
      if (filters.year && String(b.year) !== String(filters.year)) return false;
      if (
        filters.baseSubjectId &&
        String(b.baseSubjectId) !== String(filters.baseSubjectId)
      )
        return false;
      return true;
    });
  }, [budgets, filters]);

  const [listKeyword, setListKeyword] = useState("");

  const filteredBudgetsForTable = useMemo(() => {
    const q = listKeyword.trim().toLowerCase();
    if (!q) return filteredBudgets;
    return filteredBudgets.filter(
      (b) =>
        String(b.baseSubjectName).toLowerCase().includes(q) ||
        String(b.projectName).toLowerCase().includes(q)
    );
  }, [filteredBudgets, listKeyword]);

  // “去年/今年/下一年”预算统计：不受 filters.year 影响
  const summaryTotals = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const lastYear = nowYear - 1;
    const thisYear = nowYear;
    const nextYear = nowYear + 1;

    const base = budgets.filter((b) => {
      if (filters.projectId && String(b.projectId) !== String(filters.projectId))
        return false;
      if (
        filters.baseSubjectId &&
        String(b.baseSubjectId) !== String(filters.baseSubjectId)
      )
        return false;
      return true;
    });

    const pick = (y) => base.filter((r) => String(r.year) === String(y));
    const sum = (rows) =>
      rows.reduce((acc, r) => acc + (Number(r.budgetAmount) || 0), 0);

    const lastRows = pick(lastYear);
    const thisRows = pick(thisYear);
    const nextRows = pick(nextYear);

    return {
      lastYear,
      thisYear,
      nextYear,
      lastTotal: sum(lastRows),
      thisTotal: sum(thisRows),
      nextTotal: sum(nextRows),
      hasNext: nextRows.length > 0,
    };
  }, [budgets, filters.baseSubjectId, filters.projectId]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState(null);

  function openDrawerForRecord(record) {
    setDrawerRecord(record);
    setDrawerOpen(true);
  }

  const columns = useMemo(
    () => [
      {
        title: t("costManagement.budget.table.projectName"),
        dataIndex: "projectName",
        key: "projectName",
        width: 200,
      },
      {
        title: t("costManagement.budget.table.year"),
        dataIndex: "year",
        key: "year",
        width: 120,
      },
      {
        title: t("costManagement.budget.table.subject"),
        dataIndex: "baseSubjectName",
        key: "baseSubjectName",
        width: 360,
      },
      {
        title: t("costManagement.budget.table.budgetAmount"),
        dataIndex: "budgetAmount",
        key: "budgetAmount",
        width: 160,
        align: "right",
        render: (v, record) => (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            <span>{money(v)}</span>
            <Button size="small" onClick={() => openDrawerForRecord(record)}>
              {t("costManagement.budget.expand")}
            </Button>
          </div>
        ),
      },
    ],
    [t]
  );

  const openImport = () => {
    setImportOpen(true);
    setImportYear(years[0]);
    setImportFileList([]);
  };

  const handleExportBudget = () => {
    const list = filteredBudgetsForTable;
    if (!list.length) {
      message.warning(t("costManagement.exportEmpty"));
      return;
    }
    const headers = [
      t("costManagement.budget.table.projectName"),
      t("costManagement.budget.table.year"),
      t("costManagement.budget.table.subject"),
      t("costManagement.budget.table.budgetAmount"),
    ];
    const rows = list.map((b) => [
      b.projectName ?? "",
      String(b.year ?? ""),
      b.baseSubjectName ?? "",
      money(b.budgetAmount),
    ]);
    downloadCsv(csvFilename("budget"), headers, rows);
    message.success(t("costManagement.exportSuccess"));
  };

  const doImport = async () => {
    if (!importYear) return;
    if (!importFileList || importFileList.length === 0) {
      message.warning(t("costManagement.budget.import.selectFile"));
      return;
    }

    setImportLoading(true);
    try {
      // mock：忽略附件内容，只在 UI 上“导入成功”
      const project = projects[0];
      if (!project) {
        message.error(t("costManagement.budget.import.noProject"));
        return;
      }

      const seedBase = Number(importYear) * 1000;
      const newRows = rootSubjects.map((s, idx) => {
        const seed = seedBase + idx * 999 + project.id * 13;
        return {
          key: `${project.id}_${importYear}_${s.id}_import_${Date.now()}`,
          projectId: project.id,
          projectName: project.name,
          year: importYear,
          baseSubjectId: s.id,
          baseSubjectName: s.name,
          budgetAmount: randInt(3_000_000, 15_000_000, seed),
        };
      });

      setBudgets((prev) => [...prev, ...newRows]);

      message.success(t("costManagement.budget.import.success"));
      setImportOpen(false);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <TypographyTitle level={4}>{t("costManagement.budget.title")}</TypographyTitle>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <MetricStatCard
            title={`${t("costManagement.budget.lastYear")}（${summaryTotals.lastYear}）`}
            icon={HistoryOutlined}
            accent="#165DFF"
            value={summaryTotals.lastTotal}
            precision={2}
            unit={t("common.currencyUnit")}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricStatCard
            title={`${t("costManagement.budget.thisYear")}（${summaryTotals.thisYear}）`}
            icon={CalendarOutlined}
            accent="#00B42A"
            value={summaryTotals.thisTotal}
            precision={2}
            unit={t("common.currencyUnit")}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricStatCard
            title={`${t("costManagement.budget.nextYear")}（${summaryTotals.nextYear}）`}
            icon={FieldTimeOutlined}
            accent="#165DFF"
            value={summaryTotals.hasNext ? summaryTotals.nextTotal : undefined}
            valueDisplay={
              summaryTotals.hasNext ? undefined : t("costManagement.budget.notPlanned")
            }
            precision={2}
            unit={summaryTotals.hasNext ? t("common.currencyUnit") : undefined}
          />
        </Col>
      </Row>

      <Card
        className="app-card"
        size="small"
        title={t("costManagement.budget.searchTitle")}
      >
        <Form layout="inline">
          <Space wrap size="middle" align="center">
          <Form.Item label={t("costManagement.budget.search.project")} style={{ marginBottom: 0 }}>
            <Select
              allowClear
              style={{ width: 220 }}
              loading={loadingProjects}
              placeholder={t("costManagement.budget.search.projectAll")}
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

          <Form.Item label={t("costManagement.budget.search.year")} style={{ marginBottom: 0 }}>
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder={t("costManagement.budget.search.yearAll")}
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

          <Form.Item label={t("costManagement.budget.search.subject")} style={{ marginBottom: 0 }}>
            <Select
              allowClear
              style={{ width: 320 }}
              placeholder={t("costManagement.budget.search.subjectAll")}
              value={filters.baseSubjectId}
              onChange={(v) =>
                setFilters((p) => ({ ...p, baseSubjectId: v || undefined }))
              }
            >
              {rootSubjects.map((s) => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  /* mock：表格已按筛选条件过滤 */
                }}
              >
                {t("costManagement.budget.search.btn")}
              </Button>
              <Button
                onClick={() =>
                  setFilters({
                    projectId: undefined,
                    year: undefined,
                    baseSubjectId: undefined,
                  })
                }
              >
                {t("costManagement.budget.search.reset")}
              </Button>
            </Space>
          </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card
        className="app-card"
        size="small"
        title={t("costManagement.budget.listTitle")}
        extra={
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={t("common.searchKeyword")}
              value={listKeyword}
              onChange={(e) => setListKeyword(e.target.value)}
              style={{ width: 220 }}
            />
            <Button icon={<DownloadOutlined />} onClick={handleExportBudget}>
              {t("costManagement.exportReport")}
            </Button>
            <Button type="primary" onClick={openImport}>
              {t("costManagement.budget.import.btn")}
            </Button>
          </Space>
        }
      >
        <Table
          className="app-table"
          size="middle"
          rowKey="key"
          columns={columns}
          dataSource={filteredBudgetsForTable}
          pagination={getTablePagination(t)}
        />
      </Card>

      <Modal
        open={importOpen}
        title={t("costManagement.budget.import.title")}
        onCancel={() => setImportOpen(false)}
        onOk={doImport}
        okText={t("costManagement.budget.import.ok")}
        confirmLoading={importLoading}
      >
        <Form layout="vertical">
          <Form.Item label={t("costManagement.budget.import.year")}>
            <Select
              style={{ width: "100%" }}
              value={importYear}
              options={years.map((y) => ({ value: y, label: y }))}
              onChange={(v) => setImportYear(v)}
            />
          </Form.Item>
          <Form.Item label={t("costManagement.budget.import.file")}>
            <Upload
              beforeUpload={(file) => {
                setImportFileList([
                  {
                    uid: file.uid || String(Date.now()),
                    name: file.name,
                    status: "done",
                    url: "",
                    originFileObj: file,
                  },
                ]);
                return false; // do not auto upload
              }}
              fileList={importFileList}
              onRemove={() => setImportFileList([])}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>{t("costManagement.budget.import.chooseFile")}</Button>
            </Upload>
          </Form.Item>
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            {t("costManagement.budget.import.hint")}
          </div>
        </Form>
      </Modal>

      <Drawer
        placement="right"
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        title={
          drawerRecord
            ? `${
                findNodeById(classTreeJson, drawerRecord.baseSubjectId)?.name ??
                drawerRecord.baseSubjectName
              } - ${t("costManagement.budget.drawerTitle")}`
            : t("costManagement.budget.drawerTitle")
        }
      >
        {drawerRecord ? (
          <BudgetSubjectTreePanel record={drawerRecord} classRoots={classTreeJson} t={t} moneyFmt={money} />
        ) : null}
      </Drawer>
    </Space>
  );
}

function BudgetSubjectTreePanel({ record, classRoots, t, moneyFmt }) {
  const [treeSearch, setTreeSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);

  const rawNodes = useMemo(
    () => buildBudgetSubjectNodesFromClass(record, classRoots),
    [record, classRoots]
  );

  const filteredNodes = useMemo(
    () => filterBudgetSubjectNodes(rawNodes, treeSearch),
    [rawNodes, treeSearch]
  );

  useEffect(() => {
    setTreeSearch("");
    setSelectedKeys([]);
  }, [record?.key]);

  useEffect(() => {
    setExpandedKeys(collectAllKeys(filteredNodes));
  }, [filteredNodes]);

  const treeData = useMemo(() => {
    function toAntd(nodes) {
      return nodes.map((n) => {
        const isLeaf = !n.children || n.children.length === 0;
        const depth = Number(n.depth) > 0 ? Number(n.depth) : 1;
        return {
          key: n.key,
          title: (
            <div className="budget-subject-tree__row">
              <span
                className={`budget-subject-tree__icon ${
                  isLeaf ? "budget-subject-tree__icon--leaf" : "budget-subject-tree__icon--branch"
                }`}
              >
                {isLeaf ? <FileDoneOutlined /> : <ApartmentOutlined />}
              </span>
              <span className="budget-subject-tree__name-wrap">
                <span className="budget-subject-tree__name">{n.name}</span>
                <span className="budget-subject-tree__level" title={t("costManagement.budget.treeLevelHint")}>
                  L{Math.min(depth, 9)}
                </span>
              </span>
              <span className="budget-subject-tree__amt">{moneyFmt(n.amount)}</span>
            </div>
          ),
          children: n.children && n.children.length ? toAntd(n.children) : undefined,
        };
      });
    }
    return toAntd(filteredNodes);
  }, [filteredNodes, moneyFmt, t]);

  const allKeys = useMemo(() => collectAllKeys(rawNodes), [rawNodes]);

  if (!rawNodes.length) {
    return (
      <div style={{ color: "#8c8c8c", padding: "12px 0" }}>
        {t("costManagement.budget.treeNotFound")}
      </div>
    );
  }

  return (
    <div className="budget-subject-tree-wrap">
      <div className="budget-subject-tree-toolbar">
        <Input.Search
          allowClear
          placeholder={t("costManagement.budget.treeSearchPlaceholder")}
          value={treeSearch}
          onChange={(e) => setTreeSearch(e.target.value)}
        />
        <Button size="small" type="default" onClick={() => setExpandedKeys(allKeys)}>
          {t("costManagement.budget.treeExpandAll")}
        </Button>
        <Button size="small" type="default" onClick={() => setExpandedKeys([])}>
          {t("costManagement.budget.treeCollapseAll")}
        </Button>
      </div>
      <div style={{ color: "#8c8c8c", fontSize: 12, lineHeight: 1.5 }}>
        {t("costManagement.budget.treeHint")}
      </div>
      {treeData.length === 0 && treeSearch.trim() ? (
        <div style={{ color: "#8c8c8c", padding: "16px 8px" }}>
          {t("costManagement.budget.treeNoMatch")}
        </div>
      ) : (
        <Tree
          className="budget-subject-tree"
          blockNode
          showLine
          selectable
          selectedKeys={selectedKeys}
          onSelect={(keys) => setSelectedKeys(keys)}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys)}
          treeData={treeData}
        />
      )}
    </div>
  );
}

function TypographyTitle({ level, children }) {
  // 避免引入额外 Typography 结构
  return (
    <div style={{ fontWeight: 700, fontSize: level === 4 ? 20 : 24, marginBottom: 12 }}>
      {children}
    </div>
  );
}


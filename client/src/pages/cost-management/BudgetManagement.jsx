import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Col,
  Form,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tree,
  Upload,
  message,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { http } from "../../api/http.js";

const ROOT_SUBJECTS = [
  { id: 1, name: "管理、服务人员的工资和福利费" },
  { id: 2, name: "行政办公费、劳保后勤" },
  { id: 3, name: "公共设施、设备日常维修及保养费" },
  { id: 4, name: "绿化管理费" },
  { id: 5, name: "清洁卫生费" },
  { id: 6, name: "安全管理费" },
  { id: 7, name: "酬金" },
  { id: 8, name: "水、电能源消耗" },
];

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
        for (const s of ROOT_SUBJECTS) {
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
  }, [projects, years]);

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

  function buildSubSubjectTree(record) {
    const total = Number(record.budgetAmount) || 0;
    const baseSeed =
      Number(record.projectId) * 100000 +
      Number(record.year) * 1000 +
      Number(record.baseSubjectId) * 17;

    const depth1Count = 3 + (Number(record.baseSubjectId) % 2); // 3~4
    const weights1 = Array.from({ length: depth1Count }).map((_, i) =>
      randInt(5, 30, baseSeed + i * 19)
    );
    const wSum1 = weights1.reduce((a, b) => a + b, 0) || 1;

    let used = 0;
    const children = weights1.map((w, i) => {
      const isLast = i === weights1.length - 1;
      const amt = isLast ? total - used : Math.round((total * w) / wSum1);
      used += amt;

      const depth2Count = 1 + ((i + Number(record.baseSubjectId)) % 3); // 1~3
      const weights2 = Array.from({ length: depth2Count }).map((__, k) =>
        randInt(4, 20, baseSeed + i * 97 + k * 31)
      );
      const wSum2 = weights2.reduce((a, b) => a + b, 0) || 1;

      let used2 = 0;
      const leaves = weights2.map((w2, k) => {
        const isLast2 = k === weights2.length - 1;
        const amt2 =
          isLast2 ? amt - used2 : Math.round((amt * w2) / wSum2);
        used2 += amt2;
        return {
          key: `${record.baseSubjectId}_${i}_${k}`,
          name: `${record.baseSubjectName}-下级${i + 1}.${k + 1}`,
          amount: amt2,
          children: [],
        };
      });

      return {
        key: `${record.baseSubjectId}_${i}`,
        name: `${record.baseSubjectName}-下级${i + 1}`,
        amount: amt,
        children: leaves,
      };
    });

    return children;
  }

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
      const newRows = ROOT_SUBJECTS.map((s, idx) => {
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
    <div>
      <TypographyTitle level={4}>{t("costManagement.budget.title")}</TypographyTitle>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" bordered>
            <Statistic
              title={`${t("costManagement.budget.lastYear")}（${summaryTotals.lastYear}）`}
              value={summaryTotals.lastTotal}
              precision={2}
              formatter={(v) => money(v)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" bordered>
            <Statistic
              title={`${t("costManagement.budget.thisYear")}（${summaryTotals.thisYear}）`}
              value={summaryTotals.thisTotal}
              precision={2}
              formatter={(v) => money(v)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" bordered>
            <Statistic
              title={`${t("costManagement.budget.nextYear")}（${summaryTotals.nextYear}）`}
              value={summaryTotals.hasNext ? summaryTotals.nextTotal : t("costManagement.budget.notPlanned")}
              precision={summaryTotals.hasNext ? 2 : undefined}
              formatter={summaryTotals.hasNext ? (v) => money(v) : undefined}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={t("costManagement.budget.searchTitle")}
        style={{ marginBottom: 16 }}
      >
        <Form layout="inline">
          <Form.Item label={t("costManagement.budget.search.project")}>
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

          <Form.Item label={t("costManagement.budget.search.year")}>
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

          <Form.Item label={t("costManagement.budget.search.subject")}>
            <Select
              allowClear
              style={{ width: 320 }}
              placeholder={t("costManagement.budget.search.subjectAll")}
              value={filters.baseSubjectId}
              onChange={(v) =>
                setFilters((p) => ({ ...p, baseSubjectId: v || undefined }))
              }
            >
              {ROOT_SUBJECTS.map((s) => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  // mock：表格已自动按 state 过滤
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
        </Form>
      </Card>

      <Card
        size="small"
        title={t("costManagement.budget.listTitle")}
        extra={
          <Button type="primary" onClick={openImport}>
            {t("costManagement.budget.import.btn")}
          </Button>
        }
      >
        <Table
          rowKey="key"
          columns={columns}
          dataSource={filteredBudgets}
          pagination={{ pageSize: 10 }}
          size="small"
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
        width={420}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        title={
          drawerRecord
            ? `${drawerRecord.baseSubjectName} - ${t("costManagement.budget.drawerTitle")}`
            : t("costManagement.budget.drawerTitle")
        }
      >
        {drawerRecord ? (
          <Tree
            defaultExpandAll
            showLine
            selectable={false}
            treeData={(() => {
              const nodes = buildSubSubjectTree(drawerRecord);
              const toTree = (arr) =>
                arr.map((n) => ({
                  key: n.key,
                  title: (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        minWidth: 180,
                      }}
                    >
                      <span>{n.name}</span>
                      <span style={{ color: "#111827" }}>{money(n.amount)}</span>
                    </div>
                  ),
                  children:
                    n.children && n.children.length ? toTree(n.children) : undefined,
                }));
              return toTree(nodes);
            })()}
          />
        ) : null}
      </Drawer>
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


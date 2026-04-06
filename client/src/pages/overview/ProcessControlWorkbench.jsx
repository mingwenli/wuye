import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  AccountBookOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  HomeOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { http } from "../../api/http.js";
import { getTablePagination } from "../../utils/tablePagination.js";
import "./ProcessControlWorkbench.css";
import {
  PROCESS_SUBMIT_MONTH_INDEX,
  PROCESS_PREV_MONTH_INDEX,
  periodYearMonth,
  loadSubmittedMonthsArray,
} from "../../utils/processControlStorage.js";

const REGION_KEYS = [
  "north_china",
  "east_china",
  "south_china",
  "central_china",
  "southwest",
  "northwest",
  "northeast",
  "hk_mo_tw",
];

const PROJECT_TYPE_KEYS = [
  "shopping_mall",
  "office",
  "industrial_park",
  "long_term_rental",
];

const REMARKS_KEY = "workbench_process_remarks";

function loadRemarks() {
  try {
    const raw = localStorage.getItem(REMARKS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function saveRemarks(map) {
  localStorage.setItem(REMARKS_KEY, JSON.stringify(map));
}

export default function ProcessControlWorkbench() {
  const { t } = useTranslation();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterRegion, setFilterRegion] = useState(undefined);
  const [filterProjectId, setFilterProjectId] = useState(undefined);
  const [filterMonthIndex, setFilterMonthIndex] = useState(PROCESS_SUBMIT_MONTH_INDEX);
  const [remarks, setRemarks] = useState(() => loadRemarks());
  const [tick, setTick] = useState(0);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get("/api/settings/projects");
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];
      setProjects(list);
    } catch {
      message.error(t("costManagement.budget.loadProjectsError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    setTick((x) => x + 1);
  }, [location.pathname]);

  useEffect(() => {
    const onStorage = () => setTick((x) => x + 1);
    const onFocus = () => setTick((x) => x + 1);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const { y, m } = periodYearMonth(i);
        return {
          value: i,
          label: t("costManagement.process.monthYearLabel", { y, m }),
        };
      }),
    [t]
  );

  const stats = useMemo(() => {
    const list = projects;
    const n = list.length;
    const prevSubmitted = list.filter((p) =>
      loadSubmittedMonthsArray(p.id).includes(PROCESS_PREV_MONTH_INDEX)
    ).length;
    const marchSubmitted = list.filter((p) =>
      loadSubmittedMonthsArray(p.id).includes(PROCESS_SUBMIT_MONTH_INDEX)
    ).length;
    const marchNotSubmitted = n - marchSubmitted;

    const byType = {};
    for (const k of PROJECT_TYPE_KEYS) {
      const subset = list.filter((p) => p.project_type === k);
      const tot = subset.length;
      const sub = subset.filter((p) =>
        loadSubmittedMonthsArray(p.id).includes(PROCESS_SUBMIT_MONTH_INDEX)
      ).length;
      byType[k] = { total: tot, submitted: sub, unsubmitted: tot - sub };
    }

    return {
      prevSubmitted,
      marchSubmitted,
      marchNotSubmitted,
      total: n,
      byType,
    };
  }, [projects, tick]);

  const filteredRows = useMemo(() => {
    let list = projects;
    if (filterRegion) {
      list = list.filter((p) => p.region === filterRegion);
    }
    if (filterProjectId != null) {
      list = list.filter((p) => p.id === filterProjectId);
    }
    return list.map((p) => {
      const submitted = loadSubmittedMonthsArray(p.id).includes(filterMonthIndex);
      return {
        key: String(p.id),
        id: p.id,
        name: p.name || p.code || String(p.id),
        project_type: p.project_type,
        region: p.region,
        submitted,
        remark: remarks[String(p.id)] ?? "",
      };
    });
  }, [projects, filterRegion, filterProjectId, filterMonthIndex, remarks, tick]);

  const updateRemark = (projectId, text) => {
    const id = String(projectId);
    setRemarks((prev) => {
      const next = { ...prev, [id]: text };
      saveRemarks(next);
      return next;
    });
  };

  const columns = [
    {
      title: t("workbench.colProjectName"),
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: t("workbench.colProjectType"),
      dataIndex: "project_type",
      key: "project_type",
      width: 140,
      render: (v) =>
        v ? t(`settings.projects.projectType.${v}`) : "—",
    },
    {
      title: t("workbench.colSubmitted"),
      dataIndex: "submitted",
      key: "submitted",
      width: 160,
      render: (v) =>
        v ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            {t("workbench.submittedYes")}
          </Tag>
        ) : (
          <Tag icon={<ClockCircleOutlined />} color="warning">
            {t("workbench.submittedNo")}
          </Tag>
        ),
    },
    {
      title: t("workbench.colRemark"),
      dataIndex: "remark",
      key: "remark",
      render: (_, row) => (
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 3 }}
          value={remarks[String(row.id)] ?? ""}
          placeholder={t("workbench.remarkPlaceholder")}
          onChange={(e) => updateRemark(row.id, e.target.value)}
        />
      ),
    },
  ];

  const { y: py, m: pm } = periodYearMonth(PROCESS_PREV_MONTH_INDEX);
  const { y: my, m: mm } = periodYearMonth(PROCESS_SUBMIT_MONTH_INDEX);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {t("workbench.title")}
      </Typography.Title>

      <div className="workbench-metrics">
        <Typography.Text type="secondary" className="workbench-metrics__hint">
          {t("workbench.metricsHint")}
        </Typography.Text>
        <Row gutter={[16, 16]} className="workbench-kpi-row">
          <Col xs={24} md={8}>
            <Card className="workbench-kpi-card workbench-kpi-card--info" bordered={false}>
              <div className="workbench-kpi-card__inner">
                <div className="workbench-kpi-card__icon-wrap">
                  <CalendarOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="workbench-kpi-card__label">
                    {t("workbench.statPrevMonthSubmitted", { y: py, m: pm })}
                  </div>
                  <div className="workbench-kpi-card__value-row">
                    <span className="workbench-kpi-card__num">{stats.prevSubmitted}</span>
                    <span className="workbench-kpi-card__unit">{t("workbench.unitProjects")}</span>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card className="workbench-kpi-card workbench-kpi-card--success" bordered={false}>
              <div className="workbench-kpi-card__inner">
                <div className="workbench-kpi-card__icon-wrap">
                  <CheckCircleOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="workbench-kpi-card__label">
                    {t("workbench.statMarchSubmitted", { y: my, m: mm })}
                  </div>
                  <div className="workbench-kpi-card__value-row">
                    <span className="workbench-kpi-card__num">{stats.marchSubmitted}</span>
                    <span className="workbench-kpi-card__unit">{t("workbench.unitProjects")}</span>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card className="workbench-kpi-card workbench-kpi-card--warn" bordered={false}>
              <div className="workbench-kpi-card__inner">
                <div className="workbench-kpi-card__icon-wrap">
                  <ExclamationCircleOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="workbench-kpi-card__label">
                    {t("workbench.statMarchNotSubmitted", { y: my, m: mm })}
                  </div>
                  <div className="workbench-kpi-card__value-row">
                    <span className="workbench-kpi-card__num">{stats.marchNotSubmitted}</span>
                    <span className="workbench-kpi-card__unit">{t("workbench.unitProjects")}</span>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
        <Row gutter={[16, 16]} className="workbench-type-row">
          {PROJECT_TYPE_KEYS.map((k) => {
            const b = stats.byType[k] || { submitted: 0, unsubmitted: 0 };
            const icons = {
              office: AccountBookOutlined,
              shopping_mall: ShopOutlined,
              industrial_park: TeamOutlined,
              long_term_rental: HomeOutlined,
            };
            const Icon = icons[k] || AccountBookOutlined;
            return (
              <Col xs={24} sm={12} lg={6} key={k}>
                <Card className="workbench-type-card" bordered={false}>
                  <div className="workbench-type-card__head">
                    <span className="workbench-type-card__icon">
                      <Icon />
                    </span>
                    <span className="workbench-type-card__title">
                      {t(`settings.projects.projectType.${k}`)}
                    </span>
                  </div>
                  <div className="workbench-type-card__stats">
                    <div className="workbench-stat-pill workbench-stat-pill--ok">
                      <CheckCircleOutlined />
                      <span>{t("workbench.pillSubmitted")}</span>
                      <strong>{b.submitted}</strong>
                    </div>
                    <div className="workbench-stat-pill workbench-stat-pill--pending">
                      <ClockCircleOutlined />
                      <span>{t("workbench.pillUnsubmitted")}</span>
                      <strong>{b.unsubmitted}</strong>
                    </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </div>

      <Card className="app-card" title={t("workbench.filterTitle")}>
        <Form layout="inline">
          <Space wrap size="middle" align="center">
            <Form.Item label={t("settings.projects.form.region")}>
              <Select
                allowClear
                placeholder={t("settings.projects.form.regionPlaceholder")}
                style={{ minWidth: 160 }}
                value={filterRegion}
                onChange={setFilterRegion}
                options={REGION_KEYS.map((key) => ({
                  value: key,
                  label: t(`settings.projects.region.${key}`),
                }))}
              />
            </Form.Item>
            <Form.Item label={t("costManagement.budget.search.project")}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t("costManagement.budget.projectPlaceholder")}
                style={{ minWidth: 220 }}
                value={filterProjectId}
                onChange={setFilterProjectId}
                options={projects.map((p) => ({
                  value: p.id,
                  label: p.name || p.code || String(p.id),
                }))}
              />
            </Form.Item>
            <Form.Item label={t("workbench.filterMonth")}>
              <Select
                style={{ minWidth: 200 }}
                value={filterMonthIndex}
                onChange={setFilterMonthIndex}
                options={monthOptions}
              />
            </Form.Item>
            <Form.Item>
              <Button
                onClick={() => {
                  setFilterRegion(undefined);
                  setFilterProjectId(undefined);
                  setFilterMonthIndex(PROCESS_SUBMIT_MONTH_INDEX);
                  setTick((x) => x + 1);
                }}
              >
                {t("workbench.resetFilters")}
              </Button>
            </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card className="app-card" title={t("workbench.tableTitle")}>
        <Table
          className="app-table"
          size="middle"
          rowKey="key"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          pagination={getTablePagination(t)}
        />
      </Card>
    </Space>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import {
  Affix,
  Anchor,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from "antd";
import { Area, Column, Line, Bar, Pie, Rose } from "@ant-design/plots";
import { useTranslation } from "react-i18next";
import { http } from "../../api/http.js";
import { getRootSubjectsFromClass } from "../cost-management/budgetSubjectTreeUtils.js";
import classTree from "@classTree";
import {
  budgetByRootSubject,
  mergeProjectsForAnalytics,
  monthlyTrend,
  projectFinancials,
} from "./dataAnalyticsMock.js";
import "./DataAnalytics.css";

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

const CHART_H = 320;
const PIE_H = 300;
const DEMO_PALETTE = ["#165DFF", "#00B42A", "#FF7D00", "#722ED1", "#EB2F96", "#14C9C9", "#F7BA1E", "#F5319D"];

function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export default function DataAnalytics() {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(2026);
  const [region, setRegion] = useState(undefined);
  const [projectId, setProjectId] = useState(undefined);
  const [demoMode, setDemoMode] = useState(true);

  const rootSubjects = useMemo(() => getRootSubjectsFromClass(classTree), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await http.get("/api/settings/projects");
        const list = res.data?.data ?? res.data ?? [];
        if (!cancelled) setProjects(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedProjects = useMemo(
    () => mergeProjectsForAnalytics(projects, demoMode),
    [projects, demoMode]
  );

  const filteredProjects = useMemo(() => {
    let list = mergedProjects;
    if (region) list = list.filter((p) => p.region === region);
    if (projectId != null) list = list.filter((p) => String(p.id) === String(projectId));
    return list;
  }, [mergedProjects, region, projectId]);

  const finMap = useMemo(() => {
    const m = new Map();
    for (const p of filteredProjects) {
      m.set(String(p.id), projectFinancials(p, year));
    }
    return m;
  }, [filteredProjects, year]);

  const kpi = useMemo(() => {
    let budget = 0;
    let internal = 0;
    let process = 0;
    let actual = 0;
    let area = 0;
    for (const [, v] of finMap) {
      budget += v.budget;
      internal += v.internal;
      process += v.processDynamic;
      actual += v.actual;
      area += v.area;
    }
    return { budget, internal, process, actual, area };
  }, [finMap]);

  /** 概览 · 三费结构环形图 */
  const dataPieStructure = useMemo(
    () => [
      { name: t("dataAnalytics.legendBudget"), value: kpi.budget },
      { name: t("dataAnalytics.legendInternal"), value: kpi.internal },
      { name: t("dataAnalytics.legendProcess"), value: kpi.process },
    ],
    [kpi, t]
  );

  /** 概览 · 区域预算占比 */
  const dataPieRegion = useMemo(() => {
    const by = new Map();
    for (const p of filteredProjects) {
      const r0 = p.region || "unknown";
      const f = finMap.get(String(p.id)) || projectFinancials(p, year);
      by.set(r0, (by.get(r0) || 0) + f.budget);
    }
    return [...by.entries()].map(([k, v]) => ({
      name:
        k === "unknown"
          ? t("dataAnalytics.regionUnknown")
          : t(`settings.projects.region.${k}`),
      value: v,
    }));
  }, [filteredProjects, finMap, year, t]);

  /** 概览 · 类型预算占比 */
  const dataPieType = useMemo(() => {
    const by = new Map();
    for (const p of filteredProjects) {
      const t0 = p.project_type || "unknown";
      const f = finMap.get(String(p.id)) || projectFinancials(p, year);
      by.set(t0, (by.get(t0) || 0) + f.budget);
    }
    return [...by.entries()].map(([k, v]) => ({
      name:
        k === "unknown"
          ? t("dataAnalytics.typeUnknown")
          : t(`settings.projects.projectType.${k}`),
      value: v,
    }));
  }, [filteredProjects, finMap, year, t]);

  /** 1 按项目 · 预算 */
  const dataProjectBudget = useMemo(() => {
    return filteredProjects.map((p) => ({
      name: p.name || p.code || String(p.id),
      value: finMap.get(String(p.id))?.budget ?? 0,
    }));
  }, [filteredProjects, finMap]);

  /** 2 按一类科目 · 预算 */
  const dataSubjectBudget = useMemo(() => {
    return budgetByRootSubject(rootSubjects, filteredProjects, year);
  }, [rootSubjects, filteredProjects, year]);

  /** 2b 一类科目 TOP · 玫瑰图 */
  const dataRoseSubjects = useMemo(() => {
    return [...dataSubjectBudget].sort((a, b) => b.value - a.value).slice(0, 10);
  }, [dataSubjectBudget]);

  /** 3 项目 × 一类科目：内控 / 过程（动态） */
  const dataProjectSubjectIC = useMemo(() => {
    const rows = [];
    const ps = filteredProjects.slice(0, 12);
    const subs = rootSubjects.slice(0, 8);
    for (const p of ps) {
      const base = finMap.get(String(p.id)) || projectFinancials(p, year);
      for (const s of subs) {
        const seed = Number(p.id) * 17 + s.id * 31 + year;
        const internal = Math.round(base.internal * (0.08 + (seed % 15) / 100));
        const process = Math.round(base.processDynamic * (0.08 + (seed % 12) / 100));
        rows.push({
          project: p.name || String(p.id),
          subject: s.name,
          internal,
          process,
        });
      }
    }
    const long = [];
    for (const r of rows) {
      long.push({
        group: `${r.project} / ${r.subject}`,
        metric: t("dataAnalytics.seriesInternal"),
        value: r.internal,
      });
      long.push({
        group: `${r.project} / ${r.subject}`,
        metric: t("dataAnalytics.seriesProcess"),
        value: r.process,
      });
    }
    return long;
  }, [filteredProjects, rootSubjects, year, finMap, t]);

  /** 4 项目 × 类目：动态金额 & 实际金额 */
  const dataDynamicActual = useMemo(() => {
    const rows = [];
    const ps = filteredProjects.slice(0, 12);
    const subs = rootSubjects.slice(0, 6);
    for (const p of ps) {
      const base = finMap.get(String(p.id)) || projectFinancials(p, year);
      for (const s of subs) {
        const seed = Number(p.id) * 19 + s.id * 7 + year;
        const dyn = Math.round(base.processDynamic * (0.1 + (seed % 20) / 100));
        const act = Math.round(dyn * (0.85 + (seed % 10) / 100));
        rows.push({
          label: `${p.name || p.id} · ${s.name}`,
          dynamic: dyn,
          actual: act,
        });
      }
    }
    const long = [];
    for (const r of rows) {
      long.push({
        label: r.label,
        metric: t("dataAnalytics.seriesDynamic"),
        value: r.dynamic,
      });
      long.push({
        label: r.label,
        metric: t("dataAnalytics.seriesActual"),
        value: r.actual,
      });
    }
    return long;
  }, [filteredProjects, rootSubjects, year, finMap, t]);

  /** 5 按月份 */
  const dataMonthly = useMemo(() => {
    const seedBase = filteredProjects.length
      ? filteredProjects.reduce((a, p) => a + Number(p.id), 0)
      : 1;
    return monthlyTrend(year, seedBase + year * 1000);
  }, [filteredProjects, year]);

  const dataMonthlyLine = useMemo(() => {
    const out = [];
    for (const row of dataMonthly) {
      out.push({
        month: row.month,
        series: t("dataAnalytics.legendBudget"),
        value: row.budget,
      });
      out.push({
        month: row.month,
        series: t("dataAnalytics.legendInternal"),
        value: row.internal,
      });
      out.push({
        month: row.month,
        series: t("dataAnalytics.legendProcess"),
        value: row.process,
      });
    }
    return out;
  }, [dataMonthly, t]);

  /** 6 项目单方成本（预算/面积） */
  const dataUnitByProject = useMemo(() => {
    return filteredProjects.map((p) => {
      const f = finMap.get(String(p.id)) || projectFinancials(p, year);
      return {
        name: p.name || String(p.id),
        value: Math.round(f.unitBudget * 100) / 100,
      };
    });
  }, [filteredProjects, finMap, year]);

  /** 7 按项目类型 · 单方（预算/面积加权） */
  const dataUnitByType = useMemo(() => {
    const by = new Map();
    for (const p of filteredProjects) {
      const t0 = p.project_type || "unknown";
      const f = finMap.get(String(p.id)) || projectFinancials(p, year);
      if (!by.has(t0)) {
        by.set(t0, { sumBu: 0, sumArea: 0 });
      }
      const o = by.get(t0);
      o.sumBu += f.budget;
      o.sumArea += f.area;
    }
    return [...by.entries()].map(([k, v]) => ({
      name: k === "unknown" ? t("dataAnalytics.typeUnknown") : t(`settings.projects.projectType.${k}`),
      value: v.sumArea > 0 ? Math.round((v.sumBu / v.sumArea) * 100) / 100 : 0,
    }));
  }, [filteredProjects, finMap, year, t]);

  /** 8 按区域 */
  const dataByRegion = useMemo(() => {
    const by = new Map();
    for (const p of filteredProjects) {
      const r0 = p.region || "unknown";
      const f = finMap.get(String(p.id)) || projectFinancials(p, year);
      if (!by.has(r0)) {
        by.set(r0, { budget: 0, internal: 0, process: 0, area: 0, bu: 0 });
      }
      const o = by.get(r0);
      o.budget += f.budget;
      o.internal += f.internal;
      o.process += f.processDynamic;
      o.area += f.area;
      o.bu += f.budget;
    }
    return [...by.entries()].map(([k, v]) => ({
      region:
        k === "unknown"
          ? t("dataAnalytics.regionUnknown")
          : t(`settings.projects.region.${k}`),
      budget: v.budget,
      internal: v.internal,
      process: v.process,
      unit:
        v.area > 0 ? Math.round((v.budget / v.area) * 100) / 100 : 0,
    }));
  }, [filteredProjects, finMap, t]);

  const dataRegionLong = useMemo(() => {
    const out = [];
    for (const r of dataByRegion) {
      out.push({
        region: r.region,
        metric: t("dataAnalytics.legendBudget"),
        value: r.budget,
      });
      out.push({
        region: r.region,
        metric: t("dataAnalytics.legendInternal"),
        value: r.internal,
      });
      out.push({
        region: r.region,
        metric: t("dataAnalytics.legendProcess"),
        value: r.process,
      });
    }
    return out;
  }, [dataByRegion, t]);

  const anchorItems = useMemo(
    () => [
      { key: "s0", href: "#da-s0", title: t("dataAnalytics.sec0") },
      { key: "s1", href: "#da-s1", title: t("dataAnalytics.sec1") },
      { key: "s2", href: "#da-s2", title: t("dataAnalytics.sec2") },
      { key: "s3", href: "#da-s3", title: t("dataAnalytics.sec3") },
      { key: "s4", href: "#da-s4", title: t("dataAnalytics.sec4") },
      { key: "s5", href: "#da-s5", title: t("dataAnalytics.sec5") },
      { key: "s6", href: "#da-s6", title: t("dataAnalytics.sec6") },
      { key: "s7", href: "#da-s7", title: t("dataAnalytics.sec7") },
      { key: "s8", href: "#da-s8", title: t("dataAnalytics.sec8") },
    ],
    [t]
  );

  const localeNum = i18n.language?.startsWith("en") ? "en-US" : "zh-CN";

  const columnStyle = { maxWidth: 32 };

  if (loading && !projects.length) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="data-analytics-page">
      <div className="data-analytics-hero">
        <Typography.Title level={3} style={{ margin: 0, color: "#fff" }}>
          {t("dataAnalytics.title")}
        </Typography.Title>
        <Typography.Paragraph className="data-analytics-hero__subtitle">
          {t("dataAnalytics.subtitle")}
        </Typography.Paragraph>
      </div>

      <Card size="small" className="data-analytics-filter-card">
        <Space wrap size="middle" align="center">
          <Space align="center">
            <Switch checked={demoMode} onChange={setDemoMode} />
            <Typography.Text type="secondary">{t("dataAnalytics.demoMode")}</Typography.Text>
            {demoMode ? <Tag color="blue">{t("dataAnalytics.demoTag")}</Tag> : null}
          </Space>
          <Typography.Text type="secondary" className="data-analytics-filter-divider">
            {t("dataAnalytics.demoModeHint")}
          </Typography.Text>
          <Typography.Text type="secondary">{t("dataAnalytics.filterYear")}</Typography.Text>
          <Select
            style={{ width: 120 }}
            value={year}
            onChange={setYear}
            options={[2024, 2025, 2026, 2027].map((y) => ({ value: y, label: String(y) }))}
          />
          <Typography.Text type="secondary">{t("dataAnalytics.filterRegion")}</Typography.Text>
          <Select
            allowClear
            style={{ minWidth: 160 }}
            placeholder={t("dataAnalytics.all")}
            value={region}
            onChange={setRegion}
            options={REGION_KEYS.map((k) => ({
              value: k,
              label: t(`settings.projects.region.${k}`),
            }))}
          />
          <Typography.Text type="secondary">{t("dataAnalytics.filterProject")}</Typography.Text>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 220 }}
            placeholder={t("dataAnalytics.all")}
            value={projectId}
            onChange={setProjectId}
            options={mergedProjects.map((p) => ({
              value: p.id,
              label: p.name || p.code || String(p.id),
            }))}
          />
        </Space>
      </Card>

      {!filteredProjects.length ? (
        <Empty description={t("dataAnalytics.emptyProjects")} />
      ) : (
        <>
          <Row gutter={[16, 16]} className="data-analytics-kpi-row">
            <Col xs={24} sm={12} md={8}>
              <div className="data-analytics-kpi">
                <div className="data-analytics-kpi__label">{t("dataAnalytics.kpiBudget")}</div>
                <div>
                  <span className="data-analytics-kpi__value">
                    {kpi.budget.toLocaleString(localeNum, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="data-analytics-kpi__unit">{t("common.currencyUnit")}</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <div className="data-analytics-kpi">
                <div className="data-analytics-kpi__label">{t("dataAnalytics.kpiInternal")}</div>
                <div>
                  <span className="data-analytics-kpi__value">
                    {kpi.internal.toLocaleString(localeNum, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="data-analytics-kpi__unit">{t("common.currencyUnit")}</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <div className="data-analytics-kpi">
                <div className="data-analytics-kpi__label">{t("dataAnalytics.kpiProcess")}</div>
                <div>
                  <span className="data-analytics-kpi__value">
                    {kpi.process.toLocaleString(localeNum, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="data-analytics-kpi__unit">{t("common.currencyUnit")}</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={12}>
              <div className="data-analytics-kpi data-analytics-kpi--accent">
                <div className="data-analytics-kpi__label">{t("dataAnalytics.kpiActual")}</div>
                <div>
                  <span className="data-analytics-kpi__value">
                    {kpi.actual.toLocaleString(localeNum, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="data-analytics-kpi__unit">{t("common.currencyUnit")}</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={12}>
              <div className="data-analytics-kpi data-analytics-kpi--accent">
                <div className="data-analytics-kpi__label">{t("dataAnalytics.kpiArea")}</div>
                <div>
                  <span className="data-analytics-kpi__value">
                    {kpi.area.toLocaleString(localeNum, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="data-analytics-kpi__unit">㎡</span>
                </div>
              </div>
            </Col>
          </Row>

          <Row gutter={[24, 24]} className="data-analytics-layout">
            <Col xs={0} lg={5} className="data-analytics-sider">
              <Affix offsetTop={88}>
                <Card size="small" title={t("dataAnalytics.anchorTitle")} styles={{ body: { padding: "8px 12px" } }}>
                  <Anchor items={anchorItems} className="data-analytics-anchor" />
                </Card>
              </Affix>
            </Col>
            <Col xs={24} lg={19}>
              <Card id="da-s0" className="data-analytics-section-card data-analytics-section-card--overview" title={t("dataAnalytics.sec0")}>
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12} xl={8}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.pieStructTitle")}</div>
                    <div className="data-analytics-chart-wrap data-analytics-chart-wrap--pie">
                      <Pie
                        data={dataPieStructure}
                        angleField="value"
                        colorField="name"
                        radius={0.92}
                        innerRadius={0.58}
                        height={PIE_H}
                        scale={{ color: { range: ["#165DFF", "#00B42A", "#FF7D00"] } }}
                        style={{ stroke: "#fff", lineWidth: 2 }}
                        label={{
                          text: "name",
                          style: { fontSize: 11, fontWeight: 500 },
                        }}
                      />
                    </div>
                  </Col>
                  <Col xs={24} md={12} xl={8}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.pieRegionTitle")}</div>
                    <div className="data-analytics-chart-wrap data-analytics-chart-wrap--pie">
                      <Pie
                        data={dataPieRegion}
                        angleField="value"
                        colorField="name"
                        radius={0.92}
                        innerRadius={0.52}
                        height={PIE_H}
                        scale={{ color: { range: DEMO_PALETTE } }}
                        style={{ stroke: "#fff", lineWidth: 2 }}
                        label={{ text: "name", style: { fontSize: 10 } }}
                      />
                    </div>
                  </Col>
                  <Col xs={24} xl={8}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.pieTypeTitle")}</div>
                    <div className="data-analytics-chart-wrap data-analytics-chart-wrap--pie">
                      <Pie
                        data={dataPieType}
                        angleField="value"
                        colorField="name"
                        radius={0.92}
                        innerRadius={0.52}
                        height={PIE_H}
                        scale={{ color: { range: DEMO_PALETTE } }}
                        style={{ stroke: "#fff", lineWidth: 2 }}
                        label={{ text: "name", style: { fontSize: 10 } }}
                      />
                    </div>
                  </Col>
                </Row>
              </Card>

              <Card id="da-s1" className="data-analytics-section-card" title={t("dataAnalytics.sec1")}>
                <div className="data-analytics-chart-wrap">
                  <Column
                    data={dataProjectBudget}
                    xField="name"
                    yField="value"
                    height={CHART_H}
                    axis={{ x: { labelAutoRotate: true, labelAutoHide: true } }}
                    style={columnStyle}
                    color="#165DFF"
                    label={{
                      text: "value",
                      formatter: (d) =>
                        formatMoney(
                          d && typeof d === "object" ? d.value : d
                        ),
                      style: { fontSize: 10 },
                    }}
                  />
                </div>
              </Card>

              <Card id="da-s2" className="data-analytics-section-card" title={t("dataAnalytics.sec2")}>
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={14}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.barSubjectTitle")}</div>
                    <div className="data-analytics-chart-wrap">
                      <Bar
                        data={dataSubjectBudget}
                        xField="value"
                        yField="name"
                        height={CHART_H}
                        style={{ maxWidth: 26 }}
                        color="#00B42A"
                      />
                    </div>
                  </Col>
                  <Col xs={24} xl={10}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.roseSubjectTitle")}</div>
                    <div className="data-analytics-chart-wrap">
                      <Rose
                        data={dataRoseSubjects}
                        xField="name"
                        yField="value"
                        seriesField="name"
                        colorField="name"
                        height={CHART_H}
                        style={{ maxWidth: 28 }}
                        scale={{ color: { range: DEMO_PALETTE } }}
                      />
                    </div>
                  </Col>
                </Row>
              </Card>

              <Card id="da-s3" className="data-analytics-section-card" title={t("dataAnalytics.sec3")}>
                <div className="data-analytics-chart-wrap">
                  <Column
                    data={dataProjectSubjectIC}
                    xField="group"
                    yField="value"
                    colorField="metric"
                    height={CHART_H}
                    style={columnStyle}
                    axis={{ x: { labelAutoRotate: true, labelAutoHide: true } }}
                  />
                </div>
              </Card>

              <Card id="da-s4" className="data-analytics-section-card" title={t("dataAnalytics.sec4")}>
                <div className="data-analytics-chart-wrap">
                  <Column
                    data={dataDynamicActual}
                    xField="label"
                    yField="value"
                    colorField="metric"
                    height={CHART_H}
                    style={columnStyle}
                    axis={{ x: { labelAutoRotate: true, labelAutoHide: true } }}
                  />
                </div>
              </Card>

              <Card id="da-s5" className="data-analytics-section-card" title={t("dataAnalytics.sec5")}>
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.lineMonthTitle")}</div>
                    <div className="data-analytics-chart-wrap">
                      <Line
                        data={dataMonthlyLine}
                        xField="month"
                        yField="value"
                        seriesField="series"
                        height={CHART_H}
                        smooth
                        color={["#165DFF", "#00B42A", "#FF7D00"]}
                      />
                    </div>
                  </Col>
                  <Col xs={24} lg={12}>
                    <div className="data-analytics-chart-subtitle">{t("dataAnalytics.areaMonthTitle")}</div>
                    <div className="data-analytics-chart-wrap">
                      <Area
                        data={dataMonthlyLine}
                        xField="month"
                        yField="value"
                        seriesField="series"
                        stack
                        height={CHART_H}
                        smooth
                        color={["#165DFF", "#00B42A", "#FF7D00"]}
                      />
                    </div>
                  </Col>
                </Row>
              </Card>

              <Card id="da-s6" className="data-analytics-section-card" title={t("dataAnalytics.sec6")}>
                <div className="data-analytics-chart-wrap">
                  <Column
                    data={dataUnitByProject}
                    xField="name"
                    yField="value"
                    height={CHART_H}
                    color="#722ED1"
                    style={columnStyle}
                    axis={{ x: { labelAutoRotate: true, labelAutoHide: true } }}
                  />
                </div>
              </Card>

              <Card id="da-s7" className="data-analytics-section-card" title={t("dataAnalytics.sec7")}>
                <div className="data-analytics-chart-wrap">
                  <Column
                    data={dataUnitByType}
                    xField="name"
                    yField="value"
                    height={CHART_H}
                    color="#EB2F96"
                    style={columnStyle}
                  />
                </div>
              </Card>

              <Card id="da-s8" className="data-analytics-section-card" title={t("dataAnalytics.sec8")}>
                <div className="data-analytics-chart-wrap">
                  <Column
                    data={dataRegionLong}
                    xField="region"
                    yField="value"
                    colorField="metric"
                    height={CHART_H}
                    style={columnStyle}
                  />
                </div>
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                  {t("dataAnalytics.sec8Hint")}
                </Typography.Paragraph>
                <div style={{ marginTop: 12 }}>
                  <Typography.Text type="secondary">{t("dataAnalytics.regionUnitTable")}</Typography.Text>
                  <table className="app-table" style={{ width: "100%", marginTop: 8, fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>{t("settings.projects.form.region")}</th>
                        <th align="right">{t("dataAnalytics.colUnitBudget")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataByRegion.map((r) => (
                        <tr key={r.region}>
                          <td>{r.region}</td>
                          <td align="right">{formatMoney(r.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

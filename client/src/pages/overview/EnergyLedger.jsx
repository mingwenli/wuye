import React, { useMemo } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import {
  AccountBookOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FundOutlined,
  PieChartOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import energyLedgerData from "./energyLedgerData.json";
import { downloadCsv } from "../../utils/exportCsv.js";
import { MetricStatCard } from "../../components/MetricStatCard/index.js";

const { Text } = Typography;

function fmtNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtRate(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${(Number(v) * 100).toFixed(2)}%`;
}

function buildRows(rawRows, monthLabels) {
  return rawRows.map((r, idx) => {
    const monthByKey = {};
    monthLabels.forEach((m, i) => {
      monthByKey[m] = r.months[i] ?? {};
    });
    return {
      key: `r-${idx}`,
      metricName: r.metricName,
      energyType: r.energyType,
      metricKind: r.metricKind,
      annualYearMix: r.annualYearMix,
      annualRolling: r.annualRolling,
      annualUnoccurred: r.annualUnoccurred,
      monthByKey,
      isSummaryRow: r.isSummaryRow,
    };
  });
}

export default function EnergyLedger() {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const { meta, rows: rawRows } = energyLedgerData;
  const monthLabels = meta.monthLabels;

  const tableData = useMemo(
    () => buildRows(energyLedgerData.rows, monthLabels),
    [monthLabels]
  );

  const summaryRow = useMemo(
    () => tableData.find((row) => row.isSummaryRow) ?? tableData[0] ?? null,
    [tableData]
  );

  const summaryCards = useMemo(() => {
    if (!summaryRow) return [];
    const y = summaryRow.annualYearMix;
    const roll = summaryRow.annualRolling;
    return [
      {
        key: "yb",
        label: t("overview.energyLedger.stats.yearBudget"),
        valueDisplay: fmtNumber(y.budget),
        Icon: WalletOutlined,
        accent: "#165DFF",
      },
      {
        key: "ym",
        label: t("overview.energyLedger.stats.yearManage"),
        valueDisplay: fmtNumber(y.manage),
        Icon: AccountBookOutlined,
        accent: "#00B42A",
      },
      {
        key: "yr",
        label: t("overview.energyLedger.stats.yearRate"),
        valueDisplay: fmtRate(y.completionRate),
        Icon: PieChartOutlined,
        accent: "#165DFF",
      },
      {
        key: "rb",
        label: t("overview.energyLedger.stats.rollBudget"),
        valueDisplay: fmtNumber(roll.budget),
        Icon: BarChartOutlined,
        accent: "#00B42A",
      },
      {
        key: "ra",
        label: t("overview.energyLedger.stats.rollActual"),
        valueDisplay: fmtNumber(roll.actualOccur),
        Icon: CheckCircleOutlined,
        accent: "#165DFF",
      },
      {
        key: "rr",
        label: t("overview.energyLedger.stats.rollRemain"),
        valueDisplay: fmtNumber(roll.remainDiff),
        Icon: FundOutlined,
        accent: "#00B42A",
      },
    ];
  }, [t, summaryRow]);

  const projectOptions = useMemo(
    () => [
      { value: "all", label: t("costSummary.projects.all") },
      { value: "p1", label: t("costSummary.projects.p1") },
      { value: "p2", label: t("costSummary.projects.p2") },
    ],
    [t]
  );

  const columns = useMemo(() => {
    const g1 = meta.groupYearMix;
    const g2 = meta.groupRolling;
    const g3 = meta.groupUnoccurred;

    const yearMixChildren = [
      {
        title: t("overview.energyLedger.yearMix.budget"),
        key: "ym-budget",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annualYearMix?.budget),
      },
      {
        title: t("overview.energyLedger.yearMix.manage"),
        key: "ym-manage",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annualYearMix?.manage),
      },
      {
        title: t("overview.energyLedger.yearMix.completionRate"),
        key: "ym-rate",
        width: 100,
        align: "right",
        render: (_, record) => fmtRate(record.annualYearMix?.completionRate),
      },
    ];

    const rollingChildren = [
      {
        title: t("overview.energyLedger.rolling.budget"),
        key: "roll-budget",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annualRolling?.budget),
      },
      {
        title: t("overview.energyLedger.rolling.actualOccur"),
        key: "roll-actual",
        width: 130,
        align: "right",
        render: (_, record) => fmtNumber(record.annualRolling?.actualOccur),
      },
      {
        title: t("overview.energyLedger.rolling.remainDiff"),
        key: "roll-remain",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annualRolling?.remainDiff),
      },
    ];

    const unoccurredChildren = [
      {
        title: t("overview.energyLedger.unoccurred.budget"),
        key: "uo-budget",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annualUnoccurred?.budget),
      },
      {
        title: t("overview.energyLedger.unoccurred.expectedOccur"),
        key: "uo-expected",
        width: 130,
        align: "right",
        render: (_, record) => fmtNumber(record.annualUnoccurred?.expectedOccur),
      },
      {
        title: t("overview.energyLedger.unoccurred.remainDiff"),
        key: "uo-remain",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annualUnoccurred?.remainDiff),
      },
    ];

    const monthColumns = monthLabels.map((ml) => ({
      title: ml,
      children: [
        {
          title: t("overview.energyLedger.monthly.budget"),
          key: `${ml}-b`,
          width: 100,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[ml]?.budget),
        },
        {
          title: t("overview.energyLedger.monthly.expectedOccur"),
          key: `${ml}-e`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[ml]?.expectedOccur),
        },
        {
          title: t("overview.energyLedger.monthly.actualOccur"),
          key: `${ml}-a`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[ml]?.actualOccur),
        },
        {
          title: t("overview.energyLedger.monthly.completionRate"),
          key: `${ml}-r`,
          width: 90,
          align: "right",
          render: (_, record) => fmtRate(record.monthByKey[ml]?.completionRate),
        },
        {
          title: t("overview.energyLedger.monthly.actualPaid"),
          key: `${ml}-p`,
          width: 100,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[ml]?.actualPaid),
        },
      ],
    }));

    return [
      {
        title: t("overview.energyLedger.groupRoot"),
        children: [
          {
            title: t("overview.energyLedger.colMetricName"),
            dataIndex: "metricName",
            key: "metricName",
            fixed: "left",
            width: 130,
            render: (v, record) => (
              <Text strong={record.isSummaryRow}>{v ?? "—"}</Text>
            ),
          },
          {
            title: t("overview.energyLedger.colEnergyType"),
            dataIndex: "energyType",
            key: "energyType",
            fixed: "left",
            width: 90,
            render: (v) => v ?? "—",
          },
          {
            title: t("overview.energyLedger.colMetricKind"),
            dataIndex: "metricKind",
            key: "metricKind",
            fixed: "left",
            width: 110,
            render: (v) => v ?? "—",
          },
          { title: g1, children: yearMixChildren },
          { title: g2, children: rollingChildren },
          { title: g3, children: unoccurredChildren },
          ...monthColumns,
        ],
      },
    ];
  }, [t, monthLabels, meta.groupYearMix, meta.groupRolling, meta.groupUnoccurred]);

  const scrollX = 360 + 3 * 120 + 3 * 130 + 3 * 120 + monthLabels.length * 5 * 108;

  const handleExport = () => {
    const cols = [
      { title: t("overview.energyLedger.colMetricName"), getValue: (r) => r.metricName ?? "" },
      { title: t("overview.energyLedger.colEnergyType"), getValue: (r) => r.energyType ?? "" },
      { title: t("overview.energyLedger.colMetricKind"), getValue: (r) => r.metricKind ?? "" },

      { title: `${meta.groupYearMix}-${t("overview.energyLedger.yearMix.budget")}`, getValue: (r) => fmtNumber(r.annualYearMix?.budget) },
      { title: `${meta.groupYearMix}-${t("overview.energyLedger.yearMix.manage")}`, getValue: (r) => fmtNumber(r.annualYearMix?.manage) },
      { title: `${meta.groupYearMix}-${t("overview.energyLedger.yearMix.completionRate")}`, getValue: (r) => fmtRate(r.annualYearMix?.completionRate) },

      { title: `${meta.groupRolling}-${t("overview.energyLedger.rolling.budget")}`, getValue: (r) => fmtNumber(r.annualRolling?.budget) },
      { title: `${meta.groupRolling}-${t("overview.energyLedger.rolling.actualOccur")}`, getValue: (r) => fmtNumber(r.annualRolling?.actualOccur) },
      { title: `${meta.groupRolling}-${t("overview.energyLedger.rolling.remainDiff")}`, getValue: (r) => fmtNumber(r.annualRolling?.remainDiff) },

      { title: `${meta.groupUnoccurred}-${t("overview.energyLedger.unoccurred.budget")}`, getValue: (r) => fmtNumber(r.annualUnoccurred?.budget) },
      { title: `${meta.groupUnoccurred}-${t("overview.energyLedger.unoccurred.expectedOccur")}`, getValue: (r) => fmtNumber(r.annualUnoccurred?.expectedOccur) },
      { title: `${meta.groupUnoccurred}-${t("overview.energyLedger.unoccurred.remainDiff")}`, getValue: (r) => fmtNumber(r.annualUnoccurred?.remainDiff) },
    ];

    for (const ml of monthLabels) {
      cols.push(
        { title: `${ml}-${t("overview.energyLedger.monthly.budget")}`, getValue: (r) => fmtNumber(r.monthByKey?.[ml]?.budget) },
        { title: `${ml}-${t("overview.energyLedger.monthly.expectedOccur")}`, getValue: (r) => fmtNumber(r.monthByKey?.[ml]?.expectedOccur) },
        { title: `${ml}-${t("overview.energyLedger.monthly.actualOccur")}`, getValue: (r) => fmtNumber(r.monthByKey?.[ml]?.actualOccur) },
        { title: `${ml}-${t("overview.energyLedger.monthly.completionRate")}`, getValue: (r) => fmtRate(r.monthByKey?.[ml]?.completionRate) },
        { title: `${ml}-${t("overview.energyLedger.monthly.actualPaid")}`, getValue: (r) => fmtNumber(r.monthByKey?.[ml]?.actualPaid) }
      );
    }

    const safeTitle = String(meta.title ?? "energy-ledger").replace(/[\\/:*?"<>|]+/g, "_");
    downloadCsv({
      filename: `能源台账_${safeTitle}.csv`,
      columns: cols,
      data: tableData,
    });
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {t("overview.energyLedger.title")}
      </Typography.Title>

      <Space direction="vertical" size={4} style={{ marginBottom: 16, display: "flex" }}>
        <Text type="secondary">
          {t("overview.energyLedger.metaSheetTitle")}：{meta.title ?? "—"}
        </Text>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summaryCards.map((item) => (
          <Col xs={24} sm={12} lg={8} key={item.key}>
            <MetricStatCard
              title={item.label}
              icon={item.Icon}
              accent={item.accent}
              valueDisplay={item.valueDisplay}
            />
          </Col>
        ))}
      </Row>

      <Card size="small" title={t("overview.energyLedger.searchTitle")} style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" initialValues={{ project: "all" }}>
          <Form.Item name="project" label={t("overview.energyLedger.fieldProject")}>
            <Select style={{ width: 200 }} options={projectOptions} />
          </Form.Item>
          <Form.Item name="range" label={t("overview.energyLedger.fieldTime")}>
            <DatePicker.RangePicker style={{ width: 260 }} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        size="small"
        title={t("overview.energyLedger.tableTitle")}
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出报表
          </Button>
        }
      >
        <Table
          className="app-table"
          size="middle"
          pagination={false}
          columns={columns}
          dataSource={tableData}
          scroll={{ x: scrollX }}
          rowClassName={(record) => (record.isSummaryRow ? "energy-summary-row" : "")}
        />
      </Card>
    </div>
  );
}

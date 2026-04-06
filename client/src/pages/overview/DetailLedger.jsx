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
  CheckCircleOutlined,
  DollarOutlined,
  DownloadOutlined,
  FundOutlined,
  RiseOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import detailLedgerData from "./detailLedgerData.json";
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

function fmtTaxRate(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n > 0 && n <= 1) return `${(n * 100).toFixed(2)}%`;
  return fmtNumber(n);
}

function buildRows(rawRows, monthKeys) {
  return rawRows.map((r, idx) => {
    const monthByKey = {};
    monthKeys.forEach((m, i) => {
      monthByKey[m] = r.months[i] ?? {};
    });
    return {
      key: `r-${idx}`,
      subject: r.subject,
      amountExTax: r.amountExTax,
      taxRate: r.taxRate,
      annual: r.annual,
      monthByKey,
      isTotal: r.isTotal,
    };
  });
}

export default function DetailLedger() {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const { meta, months: monthKeys } = detailLedgerData;
  const tableData = useMemo(
    () => buildRows(detailLedgerData.rows, detailLedgerData.months),
    []
  );

  const totalRow = useMemo(
    () => tableData.find((row) => row.isTotal) ?? null,
    [tableData]
  );

  const summaryCards = useMemo(() => {
    if (!totalRow) return [];
    const a = totalRow.annual;
    return [
      {
        key: "budgetYear",
        label: t("overview.detailLedger.stats.budgetYear"),
        value: a.budgetYear,
        Icon: DollarOutlined,
        accent: "#165DFF",
      },
      {
        key: "internal",
        label: t("overview.detailLedger.stats.internal"),
        value: a.internal,
        Icon: AccountBookOutlined,
        accent: "#00B42A",
      },
      {
        key: "expectedOccur",
        label: t("overview.detailLedger.stats.expectedOccur"),
        value: a.expectedOccur,
        Icon: FundOutlined,
        accent: "#165DFF",
      },
      {
        key: "actualOccur",
        label: t("overview.detailLedger.stats.actualOccur"),
        value: a.actualOccur,
        Icon: RiseOutlined,
        accent: "#00B42A",
      },
      {
        key: "actualPaid",
        label: t("overview.detailLedger.stats.actualPaid"),
        value: a.actualPaid,
        Icon: CheckCircleOutlined,
        accent: "#165DFF",
      },
    ];
  }, [t, totalRow]);

  const projectOptions = useMemo(
    () => [
      { value: "all", label: t("costSummary.projects.all") },
      { value: "p1", label: t("costSummary.projects.p1") },
      { value: "p2", label: t("costSummary.projects.p2") },
    ],
    [t]
  );

  const columns = useMemo(() => {
    const annualLabel = meta.annualLabel || t("overview.detailLedger.groupAnnual");

    const annualChildren = [
      {
        title: t("overview.detailLedger.annual.budgetYear"),
        key: "annual-budgetYear",
        width: 130,
        align: "right",
        render: (_, record) => fmtNumber(record.annual?.budgetYear),
      },
      {
        title: t("overview.detailLedger.annual.internal"),
        key: "annual-internal",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annual?.internal),
      },
      {
        title: t("overview.detailLedger.annual.expectedOccur"),
        key: "annual-expectedOccur",
        width: 130,
        align: "right",
        render: (_, record) => fmtNumber(record.annual?.expectedOccur),
      },
      {
        title: t("overview.detailLedger.annual.actualOccur"),
        key: "annual-actualOccur",
        width: 130,
        align: "right",
        render: (_, record) => fmtNumber(record.annual?.actualOccur),
      },
      {
        title: t("overview.detailLedger.annual.actualPaid"),
        key: "annual-actualPaid",
        width: 120,
        align: "right",
        render: (_, record) => fmtNumber(record.annual?.actualPaid),
      },
    ];

    const monthColumns = monthKeys.map((month) => ({
      title: month,
      children: [
        {
          title: t("overview.detailLedger.monthly.internal"),
          key: `${month}-internal`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.internal),
        },
        {
          title: t("overview.detailLedger.monthly.expectedOccur"),
          key: `${month}-expectedOccur`,
          width: 120,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.expectedOccur),
        },
        {
          title: t("overview.detailLedger.monthly.actualOccur"),
          key: `${month}-actualOccur`,
          width: 120,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.actualOccur),
        },
        {
          title: t("overview.detailLedger.monthly.actualPaid"),
          key: `${month}-actualPaid`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.actualPaid),
        },
        {
          title: t("overview.detailLedger.monthly.unpaid"),
          key: `${month}-unpaid`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.unpaid),
        },
      ],
    }));

    return [
      {
        title: t("overview.detailLedger.groupRoot"),
        children: [
          {
            title: t("overview.detailLedger.colSubject"),
            dataIndex: "subject",
            key: "subject",
            fixed: "left",
            width: 280,
            render: (v, record) => (
              <Text strong={record.isTotal}>{v ?? "—"}</Text>
            ),
          },
          {
            title: t("overview.detailLedger.colExTax"),
            dataIndex: "amountExTax",
            key: "amountExTax",
            fixed: "left",
            width: 130,
            align: "right",
            render: fmtNumber,
          },
          {
            title: t("overview.detailLedger.colTaxRate"),
            dataIndex: "taxRate",
            key: "taxRate",
            fixed: "left",
            width: 90,
            align: "right",
            render: fmtTaxRate,
          },
          {
            title: annualLabel,
            children: annualChildren,
          },
          ...monthColumns,
        ],
      },
    ];
  }, [t, monthKeys, meta.annualLabel]);

  const scrollX = 520 + 5 * 130 + monthKeys.length * 5 * 115;

  const handleExport = () => {
    const cols = [
      { title: t("overview.detailLedger.colSubject"), getValue: (r) => r.subject ?? "" },
      { title: t("overview.detailLedger.colExTax"), getValue: (r) => fmtNumber(r.amountExTax) },
      { title: t("overview.detailLedger.colTaxRate"), getValue: (r) => fmtTaxRate(r.taxRate) },

      { title: `${meta.annualLabel || t("overview.detailLedger.groupAnnual")}-${t("overview.detailLedger.annual.budgetYear")}`, getValue: (r) => fmtNumber(r.annual?.budgetYear) },
      { title: `${meta.annualLabel || t("overview.detailLedger.groupAnnual")}-${t("overview.detailLedger.annual.internal")}`, getValue: (r) => fmtNumber(r.annual?.internal) },
      { title: `${meta.annualLabel || t("overview.detailLedger.groupAnnual")}-${t("overview.detailLedger.annual.expectedOccur")}`, getValue: (r) => fmtNumber(r.annual?.expectedOccur) },
      { title: `${meta.annualLabel || t("overview.detailLedger.groupAnnual")}-${t("overview.detailLedger.annual.actualOccur")}`, getValue: (r) => fmtNumber(r.annual?.actualOccur) },
      { title: `${meta.annualLabel || t("overview.detailLedger.groupAnnual")}-${t("overview.detailLedger.annual.actualPaid")}`, getValue: (r) => fmtNumber(r.annual?.actualPaid) },
    ];

    for (const month of monthKeys) {
      cols.push(
        { title: `${month}-${t("overview.detailLedger.monthly.internal")}`, getValue: (r) => fmtNumber(r.monthByKey?.[month]?.internal) },
        { title: `${month}-${t("overview.detailLedger.monthly.expectedOccur")}`, getValue: (r) => fmtNumber(r.monthByKey?.[month]?.expectedOccur) },
        { title: `${month}-${t("overview.detailLedger.monthly.actualOccur")}`, getValue: (r) => fmtNumber(r.monthByKey?.[month]?.actualOccur) },
        { title: `${month}-${t("overview.detailLedger.monthly.actualPaid")}`, getValue: (r) => fmtNumber(r.monthByKey?.[month]?.actualPaid) },
        { title: `${month}-${t("overview.detailLedger.monthly.unpaid")}`, getValue: (r) => fmtNumber(r.monthByKey?.[month]?.unpaid) }
      );
    }

    const safeTitle = String(meta.projectTitle ?? "detail-ledger").replace(/[\\/:*?"<>|]+/g, "_");
    downloadCsv({
      filename: `明细台账_${safeTitle}.csv`,
      columns: cols,
      data: tableData,
    });
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {t("overview.detailLedger.title")}
      </Typography.Title>

      <Space direction="vertical" size={4} style={{ marginBottom: 16, display: "flex" }}>
        <Text type="secondary">
          {t("overview.detailLedger.metaProject")}：{meta.projectTitle ?? "—"}
        </Text>
        <Text type="secondary">
          {t("overview.detailLedger.metaExTaxHint")}：{fmtNumber(meta.amountExTaxTotal)}
        </Text>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summaryCards.map((item) => (
          <Col xs={24} sm={12} lg={8} xl={6} key={item.key}>
            <MetricStatCard
              title={item.label}
              icon={item.Icon}
              accent={item.accent}
              value={item.value}
              precision={2}
            />
          </Col>
        ))}
      </Row>

      <Card size="small" title={t("overview.detailLedger.searchTitle")} style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" initialValues={{ project: "all" }}>
          <Form.Item name="project" label={t("overview.detailLedger.fieldProject")}>
            <Select style={{ width: 200 }} options={projectOptions} />
          </Form.Item>
          <Form.Item name="range" label={t("overview.detailLedger.fieldTime")}>
            <DatePicker.RangePicker style={{ width: 260 }} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        size="small"
        title={t("overview.detailLedger.tableTitle")}
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
          rowClassName={(record) => (record.isTotal ? "ledger-total-row" : "")}
        />
      </Card>
    </div>
  );
}

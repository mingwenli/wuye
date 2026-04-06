import React, { useMemo } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Row,
  Select,
  Table,
  Typography,
} from "antd";
import {
  AlertOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import costRestoreData from "./costRestoreData.json";
import { downloadCsv } from "../../utils/exportCsv.js";
import { MetricStatCard } from "../../components/MetricStatCard/index.js";

const { Text } = Typography;

function numOrZero(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildTableRows(rawRows, monthKeys) {
  return rawRows.map((r, idx) => {
    const monthByKey = {};
    monthKeys.forEach((m, i) => {
      const cell = r.months[i];
      monthByKey[m] = cell
        ? {
            paid: cell.paid,
            expected: cell.expected,
            unpaid: cell.unpaid,
          }
        : { paid: null, expected: null, unpaid: null };
    });
    return {
      key: `r-${idx}`,
      subject: r.subject,
      metricType: r.metricType,
      yearlyTotal: r.yearlyTotal,
      occurredPaid: r.occurredPaid,
      unoccurredUnpaid: r.unoccurredUnpaid,
      monthByKey,
    };
  });
}

export default function CostRestore() {
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const monthKeys = costRestoreData.months;
  const tableData = useMemo(
    () => buildTableRows(costRestoreData.rows, costRestoreData.months),
    []
  );

  const summary = useMemo(() => {
    const internalRows = tableData.filter((x) => x.metricType === "内控值");
    const sumField = (field) =>
      internalRows.reduce((acc, row) => acc + numOrZero(row[field]), 0);
    return [
      {
        key: "year",
        label: t("overview.costRestore.stats.yearTotal"),
        value: sumField("yearlyTotal"),
        Icon: WalletOutlined,
        accent: "#165DFF",
      },
      {
        key: "occurred",
        label: t("overview.costRestore.stats.occurredPaid"),
        value: sumField("occurredPaid"),
        Icon: CheckCircleOutlined,
        accent: "#00B42A",
      },
      {
        key: "unoccurred",
        label: t("overview.costRestore.stats.unoccurredUnpaid"),
        value: sumField("unoccurredUnpaid"),
        Icon: AlertOutlined,
        accent: "#FF7D00",
      },
    ];
  }, [t, tableData]);

  const projectOptions = useMemo(
    () => [
      { value: "all", label: t("costSummary.projects.all") },
      { value: "p1", label: t("costSummary.projects.p1") },
      { value: "p2", label: t("costSummary.projects.p2") },
    ],
    [t]
  );

  const columns = useMemo(() => {
    const monthColumns = monthKeys.map((month) => ({
      title: month,
      children: [
        {
          title: t("overview.costRestore.monthCol.paid"),
          key: `${month}-paid`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.paid),
        },
        {
          title: t("overview.costRestore.monthCol.expected"),
          key: `${month}-expected`,
          width: 120,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.expected),
        },
        {
          title: t("overview.costRestore.monthCol.unpaid"),
          key: `${month}-unpaid`,
          width: 110,
          align: "right",
          render: (_, record) => fmtNumber(record.monthByKey[month]?.unpaid),
        },
      ],
    }));

    return [
      {
        title: t("overview.costRestore.groupRoot"),
        children: [
          {
            title: t("overview.costRestore.colSubject"),
            dataIndex: "subject",
            key: "subject",
            fixed: "left",
            width: 240,
            render: (v, row) => (
              <Text strong={row.metricType === "内控值"}>{v ?? "—"}</Text>
            ),
          },
          {
            title: t("overview.costRestore.colMetric"),
            dataIndex: "metricType",
            key: "metricType",
            fixed: "left",
            width: 120,
          },
          {
            title: t("overview.costRestore.colYearTotal"),
            dataIndex: "yearlyTotal",
            key: "yearlyTotal",
            width: 120,
            align: "right",
            render: fmtNumber,
          },
          {
            title: t("overview.costRestore.colOccurred"),
            dataIndex: "occurredPaid",
            key: "occurredPaid",
            width: 130,
            align: "right",
            render: fmtNumber,
          },
          {
            title: t("overview.costRestore.colUnoccurred"),
            dataIndex: "unoccurredUnpaid",
            key: "unoccurredUnpaid",
            width: 140,
            align: "right",
            render: fmtNumber,
          },
          ...monthColumns,
        ],
      },
    ];
  }, [t, monthKeys]);

  const scrollX = 620 + monthKeys.length * 360;

  const handleExport = () => {
    const cols = [
      { title: t("overview.costRestore.colSubject"), getValue: (r) => r.subject ?? "" },
      { title: t("overview.costRestore.colMetric"), getValue: (r) => r.metricType ?? "" },
      { title: t("overview.costRestore.colYearTotal"), getValue: (r) => fmtNumber(r.yearlyTotal) },
      { title: t("overview.costRestore.colOccurred"), getValue: (r) => fmtNumber(r.occurredPaid) },
      {
        title: t("overview.costRestore.colUnoccurred"),
        getValue: (r) => fmtNumber(r.unoccurredUnpaid),
      },
    ];

    for (const month of monthKeys) {
      cols.push(
        {
          title: `${month}-${t("overview.costRestore.monthCol.paid")}`,
          getValue: (r) => fmtNumber(r.monthByKey?.[month]?.paid),
        },
        {
          title: `${month}-${t("overview.costRestore.monthCol.expected")}`,
          getValue: (r) => fmtNumber(r.monthByKey?.[month]?.expected),
        },
        {
          title: `${month}-${t("overview.costRestore.monthCol.unpaid")}`,
          getValue: (r) => fmtNumber(r.monthByKey?.[month]?.unpaid),
        }
      );
    }

    downloadCsv({
      filename: `成本还原_${new Date().toISOString().slice(0, 10)}.csv`,
      columns: cols,
      data: tableData,
    });
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {t("overview.costRestore.title")}
      </Typography.Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summary.map((item) => (
          <Col xs={24} sm={12} lg={8} key={item.key}>
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

      <Card size="small" title={t("overview.costRestore.searchTitle")} style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" initialValues={{ project: "all" }}>
          <Form.Item name="project" label={t("overview.costRestore.fieldProject")}>
            <Select style={{ width: 200 }} options={projectOptions} />
          </Form.Item>
          <Form.Item name="range" label={t("overview.costRestore.fieldTime")}>
            <DatePicker.RangePicker style={{ width: 260 }} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        size="small"
        title={t("overview.costRestore.tableTitle")}
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
        />
      </Card>
    </div>
  );
}

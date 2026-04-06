import React, { useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import {
  AccountBookOutlined,
  AlertOutlined,
  AreaChartOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FundOutlined,
  MinusCircleOutlined,
  PayCircleOutlined,
  PlusCircleOutlined,
  RiseOutlined,
  ShopOutlined,
  ThunderboltOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { getTablePagination } from "../../utils/tablePagination.js";
import { downloadCsv } from "../../utils/exportCsv.js";
import { MetricStatCard, MetricStatCardSection } from "../../components/MetricStatCard/index.js";

const { Text } = Typography;

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

// 模拟：能耗占比（用于计算“不含能耗”的合计行）
const ENERGY_RATIO = 0.12;
// 模拟：购物中心/写字楼面积（用于计算“单方成本”）
const SHOPPING_CENTER_AREA = 120000;
const OFFICE_AREA = 80000;

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(Number(n) * 100).toFixed(2)}%`;
}

function isInternalAnomaly(row) {
  return row?.rowKind === "subject" && Number(row.i_b) > Number(row.i_a);
}

function buildRow(root, idx) {
  // 造数：默认 B <= A；挑一个一级科目做异常：B > A
  const isAnomaly = root.id === 2;

  const i_a = 9000000 + idx * 850000; // 预算值
  const i_b = isAnomaly ? i_a + 1200000 : i_a - 600000; // 内控预算值
  const i_c = i_b - (900000 + idx * 45000); // 过程管控值 C

  const i_bc = i_b - i_c;
  const i_cb = i_b === 0 ? null : i_c / i_b;
  const i_ca = i_a === 0 ? null : i_c / i_a;

  // 下面两组表数据随便造一些，保持“看起来像财务报表”
  const r_payable = i_b * (0.62 + idx * 0.01);
  const r_paid = r_payable - (250000 + idx * 60000);
  const r_unpaid = r_payable - r_paid;
  const r_diff = 800000 + idx * 120000;
  const r_ap_ctl = r_payable - i_b * 0.55;

  const u_ap_ctl = i_b * (0.18 + idx * 0.005);
  const u_paid_ctl = i_a * (0.12 + idx * 0.006);
  const u_diff = Math.max(0, u_ap_ctl - u_paid_ctl + idx * 45000);

  return {
    rowKind: "subject",
    key: String(root.id),
    rowName: root.name,
    i_a,
    i_b,
    i_c,
    i_bc,
    i_cb,
    i_ca,
    r_ap_ctl,
    r_payable,
    r_diff,
    r_paid,
    r_unpaid,
    u_ap_ctl,
    u_paid_ctl,
    u_diff,
  };
}

const MOCK_TABLE_ROWS = ROOT_SUBJECTS.map(buildRow);

function sum(rows, field) {
  return rows.reduce((acc, r) => acc + (Number(r?.[field]) || 0), 0);
}

function computeTotalsRows(rows, { noEnergy }) {
  const factor = noEnergy ? 1 - ENERGY_RATIO : 1;

  const i_a = sum(rows, "i_a") * factor;
  const i_b = sum(rows, "i_b") * factor;
  const i_c = sum(rows, "i_c") * factor;
  const i_bc = i_b - i_c;
  const i_cb = i_b === 0 ? null : i_c / i_b;
  const i_ca = i_a === 0 ? null : i_c / i_a;

  const r_ap_ctl = sum(rows, "r_ap_ctl") * factor;
  const r_payable = sum(rows, "r_payable") * factor;
  const r_diff = sum(rows, "r_diff") * factor;
  const r_paid = sum(rows, "r_paid") * factor;
  const r_unpaid = sum(rows, "r_unpaid") * factor;

  const u_ap_ctl = sum(rows, "u_ap_ctl") * factor;
  const u_paid_ctl = sum(rows, "u_paid_ctl") * factor;
  const u_diff = sum(rows, "u_diff") * factor;

  const rowKind = noEnergy ? "totalNoEnergy" : "totalAll";
  return {
    rowKind,
    key: noEnergy ? "total_no_energy" : "total_all",
    rowName: noEnergy ? "合计（不含能耗）" : "合计",
    i_a,
    i_b,
    i_c,
    i_bc,
    i_cb,
    i_ca,
    r_ap_ctl,
    r_payable,
    r_diff,
    r_paid,
    r_unpaid,
    u_ap_ctl,
    u_paid_ctl,
    u_diff,
  };
}

const TOTAL_NO_ENERGY = computeTotalsRows(MOCK_TABLE_ROWS, { noEnergy: true });
const TOTAL_ALL = computeTotalsRows(MOCK_TABLE_ROWS, { noEnergy: false });
const TABLE_DATA = [...MOCK_TABLE_ROWS, TOTAL_NO_ENERGY, TOTAL_ALL];

export default function CostSummary() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [statMode, setStatMode] = useState("project");
  const [tableSearch, setTableSearch] = useState("");

  const displayTableData = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return TABLE_DATA;
    return TABLE_DATA.filter((r) => String(r.rowName).toLowerCase().includes(q));
  }, [tableSearch]);

  const projectOptions = useMemo(
    () => [
      { value: "all", label: t("costSummary.projects.all") },
      { value: "p1", label: t("costSummary.projects.p1") },
      { value: "p2", label: t("costSummary.projects.p2") },
    ],
    [t]
  );

  const categoryOptions = useMemo(
    () => [
      { value: "all", label: t("costSummary.categories.all") },
      { value: "c1", label: t("costSummary.categories.c1") },
      { value: "c2", label: t("costSummary.categories.c2") },
    ],
    [t]
  );

  const summaryCards = useMemo(() => {
    const budgetA = TOTAL_ALL.i_a;
    const internalBudgetB = TOTAL_ALL.i_b;
    const accruedPayable = TOTAL_ALL.r_payable;
    const accruedPaid = TOTAL_ALL.r_paid;
    const payableUnpaid = TOTAL_ALL.r_unpaid;
    const internalExpectedDiff = TOTAL_ALL.i_b - TOTAL_ALL.i_c; // B - C

    // “侧差额”这里只做模拟口径：用“剩余金额 - 内控预计差额”来展示
    const payableSideDiff = TOTAL_ALL.u_ap_ctl - internalExpectedDiff;
    const paidSideDiff = TOTAL_ALL.u_paid_ctl - internalExpectedDiff;

    return [
      {
        key: "a",
        label: t("costSummary.stats.budgetA"),
        value: budgetA,
        Icon: WalletOutlined,
        accent: "#165DFF",
      },
      {
        key: "b",
        label: t("costSummary.stats.internalBudgetB"),
        value: internalBudgetB,
        Icon: AccountBookOutlined,
        accent: "#00B42A",
      },
      {
        key: "payable",
        label: t("costSummary.stats.accruedPayable"),
        value: accruedPayable,
        Icon: RiseOutlined,
        accent: "#165DFF",
      },
      {
        key: "paid",
        label: t("costSummary.stats.accruedPaid"),
        value: accruedPaid,
        Icon: CheckCircleOutlined,
        accent: "#00B42A",
      },
      {
        key: "unpaid",
        label: t("costSummary.stats.payableUnpaid"),
        value: payableUnpaid,
        Icon: AlertOutlined,
        accent: "#FF7D00",
      },
      {
        key: "internalDiff",
        label: t("costSummary.stats.internalExpectedDiff"),
        value: internalExpectedDiff,
        Icon: MinusCircleOutlined,
        accent: "#00B42A",
      },
      {
        key: "payableSide",
        label: t("costSummary.stats.payableSideDiff"),
        value: payableSideDiff,
        Icon: PlusCircleOutlined,
        accent: "#165DFF",
      },
      {
        key: "paidSide",
        label: t("costSummary.stats.paidSideDiff"),
        value: paidSideDiff,
        Icon: PayCircleOutlined,
        accent: "#00B42A",
      },
    ];
  }, [t]);

  const columns = useMemo(
    () => [
      {
        title: t("costSummary.table.rowProject"),
        dataIndex: "rowName",
        key: "rowName",
        fixed: "left",
        width: 140,
        render: (v, record) => (
          <Text
            strong
            style={
              isInternalAnomaly(record)
                ? { color: "#ff4d4f" }
                : record?.rowKind?.startsWith("total")
                  ? { color: "#111827" }
                  : undefined
            }
          >
            {v}
          </Text>
        ),
      },
      {
        title: t("costSummary.table.groupIndicators"),
        children: [
          {
            title: t("costSummary.table.colBudgetA"),
            dataIndex: "i_a",
            key: "i_a",
            width: 120,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colInternalB"),
            dataIndex: "i_b",
            key: "i_b",
            width: 130,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colProcessC"),
            dataIndex: "i_c",
            key: "i_c",
            width: 130,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colBcDiff"),
            dataIndex: "i_bc",
            key: "i_bc",
            width: 140,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colCbRate"),
            dataIndex: "i_cb",
            key: "i_cb",
            width: 130,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtPct(v)}</span>
              ) : (
                fmtPct(v)
              ),
          },
          {
            title: t("costSummary.table.colCaRate"),
            dataIndex: "i_ca",
            key: "i_ca",
            width: 130,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtPct(v)}</span>
              ) : (
                fmtPct(v)
              ),
          },
        ],
      },
      {
        title: t("costSummary.table.groupRolling"),
        children: [
          {
            title: t("costSummary.table.colPayableMinusCtl"),
            dataIndex: "r_ap_ctl",
            key: "r_ap_ctl",
            width: 170,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colAccruedPayable"),
            dataIndex: "r_payable",
            key: "r_payable",
            width: 130,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colDiff"),
            dataIndex: "r_diff",
            key: "r_diff",
            width: 100,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colAccruedPaid"),
            dataIndex: "r_paid",
            key: "r_paid",
            width: 130,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colPayableUnpaid"),
            dataIndex: "r_unpaid",
            key: "r_unpaid",
            width: 110,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
        ],
      },
      {
        title: t("costSummary.table.groupNotOccurred"),
        children: [
          {
            title: t("costSummary.table.colRemainApCtl"),
            dataIndex: "u_ap_ctl",
            key: "u_ap_ctl",
            width: 170,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colRemainPaidCtl"),
            dataIndex: "u_paid_ctl",
            key: "u_paid_ctl",
            width: 170,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
          {
            title: t("costSummary.table.colDiff"),
            dataIndex: "u_diff",
            key: "u_diff",
            width: 100,
            align: "right",
            render: (v, record) =>
              isInternalAnomaly(record) ? (
                <span style={{ color: "#ff4d4f" }}>{fmtMoney(v)}</span>
              ) : (
                fmtMoney(v)
              ),
          },
        ],
      },
    ],
    [t]
  );

  const handleExport = () => {
    const cols = [
      { title: t("costSummary.table.rowProject"), getValue: (r) => r.rowName ?? "" },

      { title: t("costSummary.table.colBudgetA"), getValue: (r) => fmtMoney(r.i_a) },
      { title: t("costSummary.table.colInternalB"), getValue: (r) => fmtMoney(r.i_b) },
      { title: t("costSummary.table.colProcessC"), getValue: (r) => fmtMoney(r.i_c) },
      { title: t("costSummary.table.colBcDiff"), getValue: (r) => fmtMoney(r.i_bc) },
      { title: t("costSummary.table.colCbRate"), getValue: (r) => fmtPct(r.i_cb) },
      { title: t("costSummary.table.colCaRate"), getValue: (r) => fmtPct(r.i_ca) },

      { title: t("costSummary.table.colApCtl"), getValue: (r) => fmtMoney(r.r_ap_ctl) },
      { title: t("costSummary.table.colPayable"), getValue: (r) => fmtMoney(r.r_payable) },
      { title: t("costSummary.table.colDiff"), getValue: (r) => fmtMoney(r.r_diff) },
      { title: t("costSummary.table.colPaid"), getValue: (r) => fmtMoney(r.r_paid) },
      { title: t("costSummary.table.colUnpaid"), getValue: (r) => fmtMoney(r.r_unpaid) },

      { title: t("costSummary.table.colUApCtl"), getValue: (r) => fmtMoney(r.u_ap_ctl) },
      { title: t("costSummary.table.colUPaidCtl"), getValue: (r) => fmtMoney(r.u_paid_ctl) },
      { title: t("costSummary.table.colUDiff"), getValue: (r) => fmtMoney(r.u_diff) },
    ];

    downloadCsv({
      filename: `成本概览_${new Date().toISOString().slice(0, 10)}.csv`,
      columns: cols,
      data: displayTableData,
    });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
        {t("costSummary.pageTitle")}
      </Typography.Title>

      <MetricStatCardSection>
        <Row gutter={[16, 16]}>
          {summaryCards.map((item) => (
            <Col xs={24} sm={12} md={12} lg={6} key={item.key}>
              <MetricStatCard
                title={item.label}
                icon={item.Icon}
                accent={item.accent}
                value={item.value}
                precision={2}
                unit={t("costSummary.statCurrencyUnit")}
              />
            </Col>
          ))}
        </Row>
      </MetricStatCardSection>

      <Row gutter={[16, 16]}>
        {(() => {
          const totalArea = SHOPPING_CENTER_AREA + OFFICE_AREA;
          const budgetUnit = totalArea === 0 ? null : TOTAL_ALL.i_a / totalArea;
          const internalUnit = totalArea === 0 ? null : TOTAL_ALL.i_b / totalArea;
          const processUnit = totalArea === 0 ? null : TOTAL_ALL.i_c / totalArea;

          const items = [
            {
              key: "shoppingArea",
              label: t("costSummary.areaShopping"),
              value: SHOPPING_CENTER_AREA,
              precision: 0,
              Icon: ShopOutlined,
              accent: "#165DFF",
            },
            {
              key: "officeArea",
              label: t("costSummary.areaOffice"),
              value: OFFICE_AREA,
              precision: 0,
              Icon: BuildOutlined,
              accent: "#00B42A",
            },
            {
              key: "budgetUnit",
              label: t("costSummary.unitBudget"),
              value: budgetUnit,
              precision: 2,
              Icon: AreaChartOutlined,
              accent: "#165DFF",
            },
            {
              key: "internalUnit",
              label: t("costSummary.unitInternal"),
              value: internalUnit,
              precision: 2,
              Icon: FundOutlined,
              accent: "#00B42A",
            },
            {
              key: "processUnit",
              label: t("costSummary.unitProcess"),
              value: processUnit,
              precision: 2,
              Icon: ThunderboltOutlined,
              accent: "#165DFF",
            },
          ];

          return items.map((item) => (
            <Col xs={24} sm={12} lg={4} key={item.key}>
              <MetricStatCard
                title={item.label}
                icon={item.Icon}
                accent={item.accent}
                value={item.value}
                precision={item.precision}
              />
            </Col>
          ));
        })()}
      </Row>

      <Card className="app-card" size="small" title={t("costSummary.searchTitle")}>
        <Form form={form} layout="inline" initialValues={{ project: "all", category: "all" }}>
          <Space wrap size="middle" align="start">
          <Form.Item name="project" label={t("costSummary.fieldProject")}>
            <Select
              style={{ width: 180 }}
              options={projectOptions}
            />
          </Form.Item>
          <Form.Item name="range" label={t("costSummary.fieldTime")}>
            <DatePicker.RangePicker style={{ width: 260 }} />
          </Form.Item>
          <Form.Item name="category" label={t("costSummary.fieldCategory")}>
            <Select
              style={{ width: 180 }}
              options={categoryOptions}
            />
          </Form.Item>
          <Form.Item>
            <Space wrap>
              <Button
                type={statMode === "project" ? "primary" : "default"}
                onClick={() => setStatMode("project")}
              >
                {t("costSummary.btnByProject")}
              </Button>
              <Button
                type={statMode === "category" ? "primary" : "default"}
                onClick={() => setStatMode("category")}
              >
                {t("costSummary.btnByCategory")}
              </Button>
              <Button
                type={statMode === "categoryDetail" ? "primary" : "default"}
                onClick={() => setStatMode("categoryDetail")}
              >
                {t("costSummary.btnByCategoryDetail")}
              </Button>
            </Space>
          </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card
        className="app-card"
        size="small"
        title={t("costSummary.tableTitle")}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              导出报表
            </Button>
            <Input.Search
              allowClear
              placeholder={t("common.searchKeyword")}
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              style={{ width: 240 }}
            />
          </Space>
        }
      >
        <Table
          className="app-table"
          size="middle"
          scroll={{ x: 2200 }}
          pagination={getTablePagination(t, { pageSize: 20 })}
          columns={columns}
          dataSource={displayTableData}
          rowClassName={(record) => {
            if (record?.rowKind === "totalNoEnergy") return "cost-total-noenergy";
            if (record?.rowKind === "totalAll") return "cost-total-all";
            return "";
          }}
        />
      </Card>
    </Space>
  );
}

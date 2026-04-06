import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { http } from "../../api/http.js";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

function buildNodeIndex(nodes, map = new Map()) {
  for (const n of nodes) {
    map.set(String(n.id), n);
    if (Array.isArray(n.children) && n.children.length > 0) buildNodeIndex(n.children, map);
  }
  return map;
}

/** 模糊匹配科目名称：命中节点保留整棵子树；否则只保留含匹配后代的分支 */
function filterSubjectTree(nodes, qLower) {
  if (!qLower) return nodes;
  const out = [];
  for (const n of nodes) {
    const nameMatch = String(n.name ?? "").toLowerCase().includes(qLower);
    const children = n.children?.length ? filterSubjectTree(n.children, qLower) : [];
    if (nameMatch) {
      out.push({ ...n, children: n.children });
    } else if (children.length) {
      out.push({ ...n, children });
    }
  }
  return out;
}

/** 叶子节点不传空 children，避免树形 Table 出现多余展开图标 */
function sanitizeTreeForTable(nodes) {
  if (!nodes?.length) return [];
  return nodes.map((n) => ({
    ...n,
    children:
      n.children && n.children.length > 0 ? sanitizeTreeForTable(n.children) : undefined,
  }));
}

export default function SubjectManagement() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [treeNodes, setTreeNodes] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [nodeIndex, setNodeIndex] = useState(new Map());
  const [nameKeyword, setNameKeyword] = useState("");

  const refreshProjects = async () => {
    const res = await http.get("/api/settings/projects");
    setProjects(res.data.data ?? []);
    if (!projectId && res.data.data?.length > 0) {
      setProjectId(res.data.data[0].id);
    }
  };

  const refreshTree = async (pid) => {
    if (!pid) return;
    setLoading(true);
    try {
      const res = await http.get("/api/settings/subjects/tree", {
        params: { projectId: pid },
      });
      setTreeNodes(res.data.data ?? []);
      const idx = buildNodeIndex(res.data.data ?? []);
      setNodeIndex(idx);
      setSelectedKey(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await refreshProjects();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projectId) refreshTree(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    setSelectedKey(null);
  }, [nameKeyword]);

  const selectedNode = selectedKey ? nodeIndex.get(String(selectedKey)) : null;
  const canEditTax = !!selectedNode?.isLeaf;
  const canAddChild = !!selectedNode?.isLeaf;

  const tableData = useMemo(() => {
    const q = nameKeyword.trim().toLowerCase();
    const filtered = filterSubjectTree(treeNodes, q);
    return sanitizeTreeForTable(filtered);
  }, [treeNodes, nameKeyword]);

  const columns = useMemo(
    () => [
      {
        title: t("settings.subjects.table.name"),
        dataIndex: "name",
        key: "name",
        ellipsis: true,
        width: "36%",
      },
      {
        title: t("settings.subjects.table.nodeKind"),
        dataIndex: "isLeaf",
        key: "isLeaf",
        width: 120,
        render: (v) =>
          v ? (
            <Tag color="blue">{t("settings.subjects.table.leaf")}</Tag>
          ) : (
            <Tag>{t("settings.subjects.table.branch")}</Tag>
          ),
      },
      {
        title: t("settings.subjects.table.tax"),
        dataIndex: "taxRate",
        key: "taxRate",
        width: 100,
        render: (v, record) =>
          record.isLeaf && v != null && v !== undefined
            ? `${(Number(v) * 100).toFixed(0)}%`
            : "—",
      },
      {
        title: t("settings.subjects.table.source"),
        dataIndex: "custom",
        key: "custom",
        width: 120,
        render: (v) =>
          v ? (
            <Tag color="processing">{t("settings.subjects.table.custom")}</Tag>
          ) : (
            <Tag color="default">{t("settings.subjects.table.base")}</Tag>
          ),
      },
    ],
    [t]
  );

  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [taxForm] = Form.useForm();

  const openTaxModal = () => {
    if (!selectedNode) return;
    taxForm.setFieldsValue({
      taxPercent: selectedNode.taxRate === null ? 6 : Number(selectedNode.taxRate) * 100,
    });
    setTaxModalOpen(true);
  };

  const submitTax = async () => {
    const values = await taxForm.validateFields();
    if (!selectedNode) return;
    const taxRate = Number(values.taxPercent) / 100;
    setLoading(true);
    try {
      await http.patch(`/api/settings/subjects/nodes/${selectedNode.id}/tax-rate`, {
        taxRate,
      });
      message.success(t("settings.subjects.taxUpdateSuccess"));
      setTaxModalOpen(false);
      await refreshTree(projectId);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();

  const openAddModal = () => {
    if (!selectedNode) return;
    addForm.setFieldsValue({
      name: "",
      taxPercent: 6,
    });
    setAddModalOpen(true);
  };

  const submitAdd = async () => {
    const values = await addForm.validateFields();
    if (!selectedNode) return;
    const taxRate = Number(values.taxPercent) / 100;

    setLoading(true);
    try {
      await http.post("/api/settings/subjects/nodes", {
        parentId: selectedNode.id,
        name: values.name,
        taxRate,
      });
      message.success(t("settings.subjects.addSuccess"));
      setAddModalOpen(false);
      await refreshTree(projectId);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {t("settings.subjects.title")}
      </Typography.Title>

      <Card className="app-card" size="small" title={t("settings.subjects.filterTitle")}>
        <Space wrap size="middle" align="center">
          <Typography.Text type="secondary">
            {t("costManagement.budget.search.project")}
          </Typography.Text>
          <Select
            style={{ minWidth: 240 }}
            value={projectId ?? undefined}
            onChange={(v) => setProjectId(v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder={t("settings.subjects.selectProject")}
          />
          <Input.Search
            allowClear
            placeholder={t("settings.subjects.searchNamePlaceholder")}
            value={nameKeyword}
            onChange={(e) => setNameKeyword(e.target.value)}
            style={{ width: 280 }}
          />
        </Space>
      </Card>

      <Card
        className="app-card"
        extra={
          <Space wrap>
            <Button onClick={openTaxModal} disabled={!canEditTax} type="primary">
              {t("settings.subjects.editTax")}
            </Button>
            <Button onClick={openAddModal} disabled={!canAddChild}>
              {t("settings.subjects.addChild")}
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          {t("settings.subjects.tableHint")}
        </Text>
        <Table
          className="app-table"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          pagination={false}
          scroll={{ x: 720 }}
          defaultExpandAllRows
          rowSelection={{
            type: "radio",
            selectedRowKeys: selectedKey ? [Number(selectedKey)] : [],
            onChange: (keys) => {
              setSelectedKey(keys.length ? String(keys[0]) : null);
            },
          }}
          onRow={(record) => ({
            onClick: () => setSelectedKey(String(record.id)),
          })}
        />
      </Card>

      <Modal
        open={taxModalOpen}
        title={t("settings.subjects.taxModalTitle")}
        onCancel={() => setTaxModalOpen(false)}
        onOk={submitTax}
        okText={t("settings.common.save")}
        confirmLoading={loading}
      >
        <Form form={taxForm} layout="vertical" preserve={false}>
          <Form.Item
            name="taxPercent"
            label={t("settings.subjects.taxPercent")}
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <InputNumber min={0} max={100} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
          <Text type="secondary">{t("settings.subjects.taxPercentHint")}</Text>
        </Form>
      </Modal>

      <Modal
        open={addModalOpen}
        title={t("settings.subjects.addChildModalTitle")}
        onCancel={() => setAddModalOpen(false)}
        onOk={submitAdd}
        okText={t("settings.common.add")}
        confirmLoading={loading}
      >
        <Form form={addForm} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label={t("settings.subjects.childName")}
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="taxPercent"
            label={t("settings.subjects.taxPercent")}
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <InputNumber min={0} max={100} step={0.5} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

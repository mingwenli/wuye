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
  Tree,
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

function toTreeData(nodes) {
  return nodes.map((n) => {
    const showTax = n.isLeaf && typeof n.taxRate === "number";
    return {
      key: String(n.id),
      title: (
        <span>
          {n.name}
          {showTax ? (
            <Text type="secondary" style={{ marginLeft: 8 }}>
              （税率{(n.taxRate * 100).toFixed(0)}%）
            </Text>
          ) : null}
        </span>
      ),
      children: n.children && n.children.length > 0 ? toTreeData(n.children) : undefined,
    };
  });
}

export default function SubjectManagement() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [treeNodes, setTreeNodes] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [nodeIndex, setNodeIndex] = useState(new Map());

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

  const selectedNode = selectedKey ? nodeIndex.get(selectedKey) : null;
  const canEditTax = !!selectedNode?.isLeaf;
  const canAddChild = !!selectedNode?.isLeaf;

  const treeData = useMemo(() => toTreeData(treeNodes), [treeNodes]);

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
    <Card
      title={t("settings.subjects.title")}
      style={{ borderRadius: 12 }}
      extra={
        <Space>
          <Select
            style={{ width: 240 }}
            value={projectId ?? undefined}
            onChange={(v) => setProjectId(v)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder={t("settings.subjects.selectProject")}
          />
          <Button
            onClick={openTaxModal}
            disabled={!canEditTax}
            type="primary"
          >
            {t("settings.subjects.editTax")}
          </Button>
          <Button onClick={openAddModal} disabled={!canAddChild}>
            {t("settings.subjects.addChild")}
          </Button>
        </Space>
      }
    >
      <Tree
        selectable
        defaultExpandAll
        treeData={treeData}
        onSelect={(keys) => setSelectedKey(keys[0] ?? null)}
        showLine
      />

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
          <Text type="secondary">
            {t("settings.subjects.taxPercentHint")}
          </Text>
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
    </Card>
  );
}


import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  message,
} from "antd";
import { http } from "../../api/http.js";
import { useTranslation } from "react-i18next";

export default function ProjectManagement() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);

  const [filters, setFilters] = useState({ name: "", code: "", city: "" });

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await http.get("/api/settings/projects", { params: filters });
      setList(res.data.data ?? []);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [current, setCurrent] = useState(null);
  const [form] = Form.useForm();

  const title = useMemo(() => {
    return modalMode === "create"
      ? t("settings.projects.addTitle")
      : t("settings.projects.editTitle");
  }, [modalMode, t]);

  const openCreate = () => {
    setModalMode("create");
    setCurrent(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setModalMode("edit");
    setCurrent(record);
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      city: record.city,
    });
    setModalOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      if (modalMode === "create") {
        await http.post("/api/settings/projects", values);
        message.success(t("settings.projects.createSuccess"));
      } else {
        await http.put(`/api/settings/projects/${current.id}`, values);
        message.success(t("settings.projects.updateSuccess"));
      }
      setModalOpen(false);
      await fetchList();
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: t("settings.projects.table.name"), dataIndex: "name", key: "name" },
    { title: t("settings.projects.table.code"), dataIndex: "code", key: "code" },
    { title: t("settings.projects.table.city"), dataIndex: "city", key: "city" },
    {
      title: t("settings.common.actions"),
      key: "actions",
      width: 220,
      render: (_, record) => (
        <Space>
          <Button onClick={() => openEdit(record)}>{t("settings.common.edit")}</Button>
          <Popconfirm
            title={t("settings.common.deleteConfirm")}
            okText={t("settings.common.ok")}
            cancelText={t("settings.common.cancel")}
            onConfirm={async () => {
              setLoading(true);
              try {
                await http.delete(`/api/settings/projects/${record.id}`);
                message.success(t("settings.common.deleteSuccess"));
                await fetchList();
              } catch (e) {
                message.error(
                  e?.response?.data?.message || e?.message || t("common.error")
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            <Button danger>{t("settings.common.delete")}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={t("settings.projects.title")}
      extra={
        <Button type="primary" onClick={openCreate}>
          {t("settings.projects.addBtn")}
        </Button>
      }
      style={{ borderRadius: 12 }}
    >
      <Form
        layout="inline"
        onFinish={() => fetchList()}
        initialValues={filters}
        style={{ marginBottom: 16 }}
      >
        <Form.Item name="name">
          <Input
            placeholder={t("settings.projects.search.name")}
            value={filters.name}
            onChange={(e) => setFilters((p) => ({ ...p, name: e.target.value }))}
            style={{ width: 220 }}
          />
        </Form.Item>
        <Form.Item name="code">
          <Input
            placeholder={t("settings.projects.search.code")}
            value={filters.code}
            onChange={(e) => setFilters((p) => ({ ...p, code: e.target.value }))}
            style={{ width: 160 }}
          />
        </Form.Item>
        <Form.Item name="city">
          <Input
            placeholder={t("settings.projects.search.city")}
            value={filters.city}
            onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
            style={{ width: 200 }}
          />
        </Form.Item>
        <Form.Item>
          <Button onClick={() => fetchList()}>{t("settings.common.search")}</Button>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={list}
        columns={columns}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        open={modalOpen}
        title={title}
        onCancel={() => setModalOpen(false)}
        onOk={onSubmit}
        okText={modalMode === "create" ? t("settings.common.create") : t("settings.common.save")}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label={t("settings.projects.form.name")}
            name="name"
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t("settings.projects.form.code")}
            name="code"
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t("settings.projects.form.city")}
            name="city"
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}


import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  message,
} from "antd";
import { http } from "../../api/http.js";
import { useTranslation } from "react-i18next";

export default function PersonnelManagement() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [filters, setFilters] = useState({ username: "", projectId: "" });

  const fetchProjects = async () => {
    const res = await http.get("/api/settings/projects");
    setProjects(res.data.data ?? []);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {
        username: filters.username || undefined,
        projectId: filters.projectId || undefined,
      };
      const res = await http.get("/api/settings/users", { params });
      setUsers(res.data.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchProjects();
      await fetchUsers();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectMap = useMemo(() => {
    const m = new Map();
    for (const p of projects) m.set(String(p.id), p.name);
    return m;
  }, [projects]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [current, setCurrent] = useState(null);
  const [form] = Form.useForm();

  const title =
    modalMode === "create" ? t("settings.users.addTitle") : t("settings.users.editTitle");

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
      username: record.username,
      project_id: record.project_id ?? null,
    });
    setModalOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const payload = {
        username: values.username,
        project_id: values.project_id ?? null,
      };

      if (modalMode === "create" || values.password) {
        payload.password = values.password;
      }

      if (modalMode === "create") {
        await http.post("/api/settings/users", payload);
        message.success(t("settings.users.createSuccess"));
      } else {
        await http.put(`/api/settings/users/${current.id}`, payload);
        message.success(t("settings.users.updateSuccess"));
      }
      setModalOpen(false);
      await fetchUsers();
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: t("settings.users.table.username"), dataIndex: "username", key: "username" },
    {
      title: t("settings.users.table.project"),
      dataIndex: "project_id",
      key: "project_id",
      render: (pid) => projectMap.get(String(pid)) ?? "-",
    },
    {
      title: t("settings.common.actions"),
      key: "actions",
      width: 240,
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
                await http.delete(`/api/settings/users/${record.id}`);
                message.success(t("settings.common.deleteSuccess"));
                await fetchUsers();
              } catch (e) {
                message.error(e?.response?.data?.message || e?.message || t("common.error"));
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
      title={t("settings.users.title")}
      extra={
        <Button type="primary" onClick={openCreate}>
          {t("settings.users.addBtn")}
        </Button>
      }
      style={{ borderRadius: 12 }}
    >
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="username">
          <Input
            placeholder={t("settings.users.search.username")}
            value={filters.username}
            onChange={(e) => setFilters((p) => ({ ...p, username: e.target.value }))}
            style={{ width: 220 }}
          />
        </Form.Item>
        <Form.Item name="projectId">
          <Select
            allowClear
            placeholder={t("settings.users.search.project")}
            value={filters.projectId || undefined}
            onChange={(v) => setFilters((p) => ({ ...p, projectId: v || "" }))}
            style={{ width: 220 }}
          >
            <Select.Option value={""}>{t("settings.users.search.allProjects")}</Select.Option>
            {projects.map((p) => (
              <Select.Option key={p.id} value={p.id}>
                {p.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item>
          <Button onClick={fetchUsers}>{t("settings.common.search")}</Button>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={users}
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
            label={t("settings.users.form.username")}
            name="username"
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label={t("settings.users.form.password")}
            name="password"
            rules={
              modalMode === "create"
                ? [{ required: true, message: t("settings.common.required") }]
                : [{ required: false }]
            }
            extra={modalMode === "create" ? undefined : t("settings.users.form.passwordHint")}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            label={t("settings.users.form.project")}
            name="project_id"
          >
            <Select
              allowClear
              placeholder={t("settings.users.form.projectPlaceholder")}
            >
              {projects.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}


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
  Typography,
  message,
} from "antd";
import { http } from "../../api/http.js";
import { useTranslation } from "react-i18next";
import { getTablePagination } from "../../utils/tablePagination.js";
import { useNavigate } from "react-router-dom";

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

export default function ProjectManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      region: record.region || undefined,
      project_type: record.project_type || undefined,
      operating_area: record.operating_area != null ? Number(record.operating_area) : undefined,
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
      title: t("settings.projects.table.region"),
      dataIndex: "region",
      key: "region",
      render: (v) => (v ? t(`settings.projects.region.${v}`) : "—"),
    },
    {
      title: t("settings.projects.table.projectType"),
      dataIndex: "project_type",
      key: "project_type",
      render: (v) => (v ? t(`settings.projects.projectType.${v}`) : "—"),
    },
    {
      title: t("settings.common.actions"),
      key: "actions",
      width: 300,
      render: (_, record) => (
        <Space wrap>
          <Button
            type="link"
            onClick={() => navigate(`/settings/projects/${record.id}`)}
          >
            {t("settings.projects.detailLink")}
          </Button>
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
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space
        align="center"
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("settings.projects.title")}
        </Typography.Title>
        <Button type="primary" onClick={openCreate}>
          {t("settings.projects.addBtn")}
        </Button>
      </Space>

      <Card className="app-card">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Form
          layout="inline"
          onFinish={() => fetchList()}
          initialValues={filters}
        >
          <Space wrap size="middle" align="center">
            <Form.Item name="name" style={{ marginBottom: 0 }}>
              <Input.Search
                allowClear
                placeholder={t("settings.projects.search.name")}
                value={filters.name}
                onChange={(e) => setFilters((p) => ({ ...p, name: e.target.value }))}
                onSearch={() => fetchList()}
                style={{ width: 220 }}
              />
            </Form.Item>
            <Form.Item name="code" style={{ marginBottom: 0 }}>
              <Input
                allowClear
                placeholder={t("settings.projects.search.code")}
                value={filters.code}
                onChange={(e) => setFilters((p) => ({ ...p, code: e.target.value }))}
                style={{ width: 160 }}
              />
            </Form.Item>
            <Form.Item name="city" style={{ marginBottom: 0 }}>
              <Input
                allowClear
                placeholder={t("settings.projects.search.city")}
                value={filters.city}
                onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Space>
                <Button type="primary" onClick={() => fetchList()}>
                  {t("settings.common.search")}
                </Button>
              </Space>
            </Form.Item>
          </Space>
        </Form>

        <Table
          className="app-table"
          size="middle"
          rowKey="id"
          loading={loading}
          dataSource={list}
          columns={columns}
          pagination={getTablePagination(t)}
        />
        </Space>
      </Card>

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
          <Form.Item
            label={t("settings.projects.form.region")}
            name="region"
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Select
              placeholder={t("settings.projects.form.regionPlaceholder")}
              options={REGION_KEYS.map((k) => ({
                value: k,
                label: t(`settings.projects.region.${k}`),
              }))}
            />
          </Form.Item>
          <Form.Item
            label={t("settings.projects.form.projectType")}
            name="project_type"
            rules={[{ required: true, message: t("settings.common.required") }]}
          >
            <Select
              placeholder={t("settings.projects.form.projectTypePlaceholder")}
              options={PROJECT_TYPE_KEYS.map((k) => ({
                value: k,
                label: t(`settings.projects.projectType.${k}`),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}


import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../../api/http.js";
import { useTranslation } from "react-i18next";

const OFFICE_TYPES = ["office", "industrial_park"];
const RETAIL_TYPES = ["shopping_mall", "long_term_rental"];

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [months, setMonths] = useState([]);
  const [editModal, setEditModal] = useState({ open: false, month: null, value: 0 });
  const [opAreaModal, setOpAreaModal] = useState({ open: false, value: 0 });

  const fetchProject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get(`/api/settings/projects/${id}`);
      setProject(res.data.data);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  const fetchMonthly = useCallback(async () => {
    if (!id || !project) return;
    if (!OFFICE_TYPES.includes(project.project_type)) return;
    setLoading(true);
    try {
      const res = await http.get(`/api/settings/projects/${id}/monthly-areas`, {
        params: { year },
      });
      setMonths(res.data.data?.months ?? []);
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [id, year, project, t]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (project && OFFICE_TYPES.includes(project.project_type)) {
      fetchMonthly();
    }
  }, [project, fetchMonthly]);

  const typeLabel = useMemo(() => {
    if (!project?.project_type) return "";
    return t(`settings.projects.projectType.${project.project_type}`);
  }, [project, t]);

  const regionLabel = useMemo(() => {
    if (!project?.region) return "";
    return t(`settings.projects.region.${project.region}`);
  }, [project, t]);

  const saveMonth = async () => {
    if (!editModal.month) return;
    setLoading(true);
    try {
      await http.put(`/api/settings/projects/${id}/monthly-areas`, {
        year,
        month: editModal.month,
        leasable_area: editModal.value ?? 0,
      });
      message.success(t("settings.projects.detail.saveSuccess"));
      setEditModal({ open: false, month: null, value: 0 });
      await fetchMonthly();
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const saveOperatingArea = async () => {
    setLoading(true);
    try {
      await http.put(`/api/settings/projects/${id}`, {
        operating_area: opAreaModal.value ?? 0,
      });
      message.success(t("settings.projects.detail.saveSuccess"));
      setOpAreaModal({ open: false, value: 0 });
      await fetchProject();
    } catch (e) {
      message.error(e?.response?.data?.message || e?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const monthlyColumns = [
    {
      title: t("settings.projects.detail.colMonth"),
      dataIndex: "month",
      width: 120,
      render: (m) => t("settings.projects.detail.monthN", { n: m }),
    },
    {
      title: t("settings.projects.detail.colLeasableArea"),
      dataIndex: "leasable_area",
      render: (v) => (v != null ? Number(v).toLocaleString() : "0"),
    },
    {
      title: t("settings.common.actions"),
      key: "actions",
      width: 120,
      render: (_, row) => (
        <Button
          type="link"
          onClick={() =>
            setEditModal({ open: true, month: row.month, value: row.leasable_area })
          }
        >
          {t("settings.projects.detail.editArea")}
        </Button>
      ),
    },
  ];

  const retailColumns = [
    {
      title: t("settings.projects.detail.colOperatingArea"),
      key: "op",
      render: () =>
        project?.operating_area != null
          ? Number(project.operating_area).toLocaleString()
          : "—",
    },
    {
      title: t("settings.common.actions"),
      key: "actions",
      width: 160,
      render: () => (
        <Button
          type="link"
          onClick={() =>
            setOpAreaModal({
              open: true,
              value: project?.operating_area != null ? Number(project.operating_area) : 0,
            })
          }
        >
          {t("settings.projects.detail.editArea")}
        </Button>
      ),
    },
  ];

  const retailData = [{}];

  if (!project && !loading) {
    return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          {t("settings.projects.detail.back")}
        </Button>
        <Typography.Text type="danger">{t("settings.projects.detail.notFound")}</Typography.Text>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            {t("settings.projects.detail.back")}
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {project?.name ?? "…"}
          </Typography.Title>
        </Space>
      </Space>

      <Card className="app-card" loading={loading && !project}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap size="large">
            <Typography.Text>
              <strong>{t("settings.projects.table.code")}:</strong> {project?.code}
            </Typography.Text>
            <Typography.Text>
              <strong>{t("settings.projects.table.city")}:</strong> {project?.city}
            </Typography.Text>
            <Typography.Text>
              <strong>{t("settings.projects.form.region")}:</strong> {regionLabel || "—"}
            </Typography.Text>
            <Typography.Text>
              <strong>{t("settings.projects.form.projectType")}:</strong> {typeLabel || "—"}
            </Typography.Text>
          </Space>

          {project && OFFICE_TYPES.includes(project.project_type) && (
            <>
              <Space align="center">
                <Typography.Text>{t("settings.projects.detail.year")}</Typography.Text>
                <Select
                  value={year}
                  style={{ width: 120 }}
                  onChange={setYear}
                  options={Array.from({ length: 5 }, (_, i) => {
                    const y = new Date().getFullYear() - 2 + i;
                    return { value: y, label: String(y) };
                  })}
                />
              </Space>
              <Table
                className="app-table"
                size="middle"
                rowKey="month"
                loading={loading}
                dataSource={months}
                columns={monthlyColumns}
                pagination={false}
              />
            </>
          )}

          {project && RETAIL_TYPES.includes(project.project_type) && (
            <Table
              className="app-table"
              size="middle"
              rowKey={() => "op"}
              loading={loading}
              dataSource={retailData}
              columns={retailColumns}
              pagination={false}
            />
          )}
        </Space>
      </Card>

      <Modal
        title={t("settings.projects.detail.editLeasableTitle")}
        open={editModal.open}
        onCancel={() => setEditModal({ open: false, month: null, value: 0 })}
        onOk={saveMonth}
        okText={t("settings.common.save")}
        confirmLoading={loading}
      >
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          value={editModal.value}
          onChange={(v) => setEditModal((s) => ({ ...s, value: v ?? 0 }))}
        />
      </Modal>

      <Modal
        title={t("settings.projects.detail.editOperatingTitle")}
        open={opAreaModal.open}
        onCancel={() => setOpAreaModal({ open: false, value: 0 })}
        onOk={saveOperatingArea}
        okText={t("settings.common.save")}
        confirmLoading={loading}
      >
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          value={opAreaModal.value}
          onChange={(v) => setOpAreaModal((s) => ({ ...s, value: v ?? 0 }))}
        />
      </Modal>
    </Space>
  );
}

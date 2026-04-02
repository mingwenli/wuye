import React, { useState } from "react";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { http } from "../api/http.js";
import { setToken } from "../auth.js";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";

const { Title, Text } = Typography;

export default function Login() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function goToCostSummary() {
    // 强制刷新路由，避免个别情况下 navigate 被守卫/时序影响
    window.location.replace("/overview/cost-summary");
  }

  async function testLogin() {
    setLoading(true);
    const username = "limingwen";
    const password = "limingwen";
    try {
      const res = await http.post("/api/auth/login", { username, password });
      setToken(res.data.token);
      message.success(t("login.testSuccess"));
      goToCostSummary();
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || t("login.fail");
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onFinish(values) {
    setLoading(true);
    try {
      const res = await http.post("/api/auth/login", values);
      setToken(res.data.token);
      message.success(t("login.success"));
      // 登录后直接进入“数据概览-成本汇总”
      goToCostSummary();
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || t("login.fail");
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <Card
        style={{ width: 420, maxWidth: "100%" }}
        extra={
          <Space size="small">
            <Text type="secondary">{t("common.language")}</Text>
            <LanguageSwitcher />
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>
            {t("login.title")}
          </Title>
          <Text type="secondary">{t("login.subtitle")}</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            label={t("login.username")}
            name="username"
            rules={[{ required: true, message: t("login.usernameRequired") }]}
          >
            <Input placeholder={t("login.usernamePlaceholder")} />
          </Form.Item>

          <Form.Item
            label={t("login.password")}
            name="password"
            rules={[{ required: true, message: t("login.passwordRequired") }]}
          >
            <Input.Password placeholder={t("login.passwordPlaceholder")} />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
          >
            {t("login.submit")}
          </Button>

          <div style={{ marginTop: 12, fontSize: 12, color: "#667085" }}>
            {t("login.bootstrapHint")}{" "}
            <Text code>POST /api/auth/bootstrap</Text>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button
              onClick={testLogin}
              block
              htmlType="button"
              loading={loading}
            >
              {t("login.testLogin")}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}

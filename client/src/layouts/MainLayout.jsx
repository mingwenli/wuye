import React, { useMemo, useState } from "react";
import {
  Layout,
  Menu,
  theme,
  Dropdown,
  Button,
  Flex,
  Typography,
  Space,
} from "antd";
import {
  BarChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ApartmentOutlined,
  TeamOutlined,
  DatabaseOutlined,
  UserOutlined,
  FundOutlined,
} from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { clearToken } from "../auth.js";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";

const { Header, Sider, Content } = Layout;

const OVERVIEW_KEY = "sub-overview";
const SETTINGS_KEY = "sub-settings";
const COST_KEY = "sub-cost-management";

function pathToOpenKeys(pathname) {
  if (pathname.startsWith("/overview")) return [OVERVIEW_KEY];
  if (pathname.startsWith("/settings")) return [SETTINGS_KEY];
  if (pathname.startsWith("/cost-management")) return [COST_KEY];
  return [];
}

export default function MainLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState(pathToOpenKeys(location.pathname));
  const { token } = theme.useToken();

  const menuItems = useMemo(
    () => [
      {
        key: OVERVIEW_KEY,
        icon: <BarChartOutlined />,
        label: t("layout.menu.dataOverview"),
        children: [
          {
            key: "/overview/cost-summary",
            label: t("layout.menu.costSummary"),
          },
          {
            key: "/overview/cost-restore",
            label: t("layout.menu.costRestore"),
          },
          {
            key: "/overview/detail-ledger",
            label: t("layout.menu.detailLedger"),
          },
          {
            key: "/overview/energy-ledger",
            label: t("layout.menu.energyLedger"),
          },
        ],
      },
      {
        key: COST_KEY,
        icon: <FundOutlined />,
        label: t("layout.menu.costManagement"),
        children: [
          {
            key: "/cost-management/budget",
            label: t("layout.menu.budgetManagement"),
          },
          {
            key: "/cost-management/internal",
            label: t("layout.menu.internalValueManagement"),
          },
          {
            key: "/cost-management/process",
            label: t("layout.menu.processControlManagement"),
          },
        ],
      },
      {
        key: SETTINGS_KEY,
        icon: <SettingOutlined />,
        label: t("layout.menu.systemSettings"),
        children: [
          {
            key: "/settings/subjects",
            icon: <DatabaseOutlined />,
            label: t("layout.menu.subjectManagement"),
          },
          {
            key: "/settings/users",
            icon: <TeamOutlined />,
            label: t("layout.menu.userManagement"),
          },
          {
            key: "/settings/projects",
            icon: <ApartmentOutlined />,
            label: t("layout.menu.projectManagement"),
          },
        ],
      },
    ],
    [t]
  );

  React.useEffect(() => {
    const next = pathToOpenKeys(location.pathname);
    if (next.length > 0) setOpenKeys(next);
  }, [location.pathname]);

  const userMenu = {
    items: [
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: t("layout.logout"),
        onClick: () => {
          clearToken();
          navigate("/login", { replace: true });
        },
      },
    ],
  };

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "sticky",
          top: 0,
          left: 0,
        }}
      >
        <Flex
          align="center"
          justify={collapsed ? "center" : "flex-start"}
          style={{
            height: 56,
            padding: collapsed ? "0 8px" : "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Typography.Text
            strong
            style={{
              color: "#fff",
              fontSize: collapsed ? 13 : 15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {collapsed ? t("layout.brandShort") : t("layout.brand")}
          </Typography.Text>
        </Flex>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          items={menuItems}
          onOpenChange={(keys) => setOpenKeys(keys)}
          onClick={({ key }) => {
            if (key.startsWith("/")) navigate(key);
          }}
        />
      </Sider>
      <Layout style={{ background: token.colorBgLayout }}>
        <Header
          style={{
            height: 56,
            lineHeight: "56px",
            padding: "0 24px",
            background: token.colorBgContainer,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${token.colorSplit}`,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          />
          <Space size="middle" align="center">
            <Space size="small" align="center">
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t("common.language")}
              </Typography.Text>
              <LanguageSwitcher size="middle" />
            </Space>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Button type="text" icon={<UserOutlined />}>
                {t("layout.user")}
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: 0,
            padding: "24px 32px 32px",
            minHeight: "calc(100vh - 56px)",
            background: token.colorBgLayout,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

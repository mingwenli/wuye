/**
 * 全局 Ant Design 主题：现代简洁后台风格，圆角 8px
 */
export const antdTheme = {
  token: {
    colorPrimary: "#1890ff",
    borderRadius: 8,
    wireframe: false,
    colorBgLayout: "#f5f5f5",
    colorBgContainer: "#ffffff",
    boxShadowSecondary: "0 1px 4px rgba(0, 0, 0, 0.06)",
    padding: 16,
    paddingLG: 24,
    paddingMD: 16,
    paddingSM: 12,
    paddingXS: 8,
  },
  components: {
    Layout: {
      headerHeight: 56,
      headerPadding: "0 24px",
      headerBg: "#ffffff",
      bodyBg: "#f5f5f5",
      siderBg: "#001529",
    },
    Card: {
      borderRadiusLG: 8,
      boxShadowTertiary: "0 1px 4px rgba(0, 0, 0, 0.06)",
    },
    Table: {
      borderRadius: 8,
      headerBg: "#f4f5f7",
      borderColor: "transparent",
      headerSplitColor: "transparent",
    },
    Button: {
      borderRadius: 8,
    },
    Input: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
  },
};

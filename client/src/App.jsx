import React, { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ConfigProvider } from "antd";
import { antdTheme } from "./theme/antdTheme.js";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import Login from "./pages/Login.jsx";
import MainLayout from "./layouts/MainLayout.jsx";
import { getToken } from "./auth.js";

const CostSummary = lazy(() => import("./pages/overview/CostSummary.jsx"));
const DataAnalytics = lazy(() => import("./pages/overview/DataAnalytics.jsx"));
const CostRestore = lazy(() => import("./pages/overview/CostRestore.jsx"));
const DetailLedger = lazy(() => import("./pages/overview/DetailLedger.jsx"));
const EnergyLedger = lazy(() => import("./pages/overview/EnergyLedger.jsx"));
const ProcessControlWorkbench = lazy(() =>
  import("./pages/overview/ProcessControlWorkbench.jsx")
);
const SubjectManagement = lazy(() => import("./pages/settings/SubjectManagement.jsx"));
const PersonnelManagement = lazy(() => import("./pages/settings/PersonnelManagement.jsx"));
const ProjectManagement = lazy(() => import("./pages/settings/ProjectManagement.jsx"));
const ProjectDetail = lazy(() => import("./pages/settings/ProjectDetail.jsx"));
const BudgetManagement = lazy(() => import("./pages/cost-management/BudgetManagement.jsx"));
const InternalValueManagement = lazy(() =>
  import("./pages/cost-management/InternalValueManagement.jsx")
);
const ProcessControlManagement = lazy(() =>
  import("./pages/cost-management/ProcessControlManagement.jsx")
);

function RequireAuth({ children }) {
  const token = getToken();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/overview/cost-summary" replace />} />
        <Route path="overview/workbench" element={<ProcessControlWorkbench />} />
        <Route path="overview/cost-summary" element={<CostSummary />} />
        <Route path="overview/data-analytics" element={<DataAnalytics />} />
        <Route path="overview/cost-restore" element={<CostRestore />} />
        <Route path="overview/detail-ledger" element={<DetailLedger />} />
        <Route path="overview/energy-ledger" element={<EnergyLedger />} />
        <Route path="settings/subjects" element={<SubjectManagement />} />
        <Route path="settings/users" element={<PersonnelManagement />} />
        <Route path="settings/projects" element={<ProjectManagement />} />
        <Route path="settings/projects/:id" element={<ProjectDetail />} />
        <Route path="cost-management/budget" element={<BudgetManagement />} />
        <Route
          path="cost-management/internal"
          element={<InternalValueManagement />}
        />
        <Route
          path="cost-management/process"
          element={<ProcessControlManagement />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const { i18n } = useTranslation();
  const antdLocale = i18n.language?.startsWith("en") ? enUS : zhCN;

  return (
    <ConfigProvider locale={antdLocale} theme={antdTheme}>
      <AppRoutes />
    </ConfigProvider>
  );
}

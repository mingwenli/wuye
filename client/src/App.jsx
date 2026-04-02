import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import Login from "./pages/Login.jsx";
import MainLayout from "./layouts/MainLayout.jsx";
import CostSummary from "./pages/overview/CostSummary.jsx";
import CostRestore from "./pages/overview/CostRestore.jsx";
import DetailLedger from "./pages/overview/DetailLedger.jsx";
import EnergyLedger from "./pages/overview/EnergyLedger.jsx";
import SubjectManagement from "./pages/settings/SubjectManagement.jsx";
import PersonnelManagement from "./pages/settings/PersonnelManagement.jsx";
import ProjectManagement from "./pages/settings/ProjectManagement.jsx";
import { getToken } from "./auth.js";
import BudgetManagement from "./pages/cost-management/BudgetManagement.jsx";
import InternalValueManagement from "./pages/cost-management/InternalValueManagement.jsx";
import ProcessControlManagement from "./pages/cost-management/ProcessControlManagement.jsx";

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
        <Route path="overview/cost-summary" element={<CostSummary />} />
        <Route path="overview/cost-restore" element={<CostRestore />} />
        <Route path="overview/detail-ledger" element={<DetailLedger />} />
        <Route path="overview/energy-ledger" element={<EnergyLedger />} />
        <Route path="settings/subjects" element={<SubjectManagement />} />
        <Route path="settings/users" element={<PersonnelManagement />} />
        <Route path="settings/projects" element={<ProjectManagement />} />
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
    <ConfigProvider locale={antdLocale}>
      <AppRoutes />
    </ConfigProvider>
  );
}

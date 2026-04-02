import React from "react";
import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

const { Paragraph } = Typography;

export default function ProcessControlManagement() {
  const { t } = useTranslation();

  return (
    <Card title={t("costManagement.process.title")} style={{ borderRadius: 12 }}>
      <Paragraph type="secondary">{t("costManagement.process.desc")}</Paragraph>
    </Card>
  );
}


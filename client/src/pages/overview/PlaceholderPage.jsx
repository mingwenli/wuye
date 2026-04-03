import React from "react";
import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

const { Paragraph } = Typography;

export default function PlaceholderPage({ titleKey, descKey }) {
  const { t } = useTranslation();
  return (
    <Card className="app-card" title={t(titleKey)} size="small">
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t(descKey)}
      </Paragraph>
    </Card>
  );
}

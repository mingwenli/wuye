import React from "react";
import { Typography } from "antd";
import { useTranslation } from "react-i18next";

const { Title, Paragraph } = Typography;

export default function PlaceholderPage({ titleKey, descKey }) {
  const { t } = useTranslation();
  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        {t(titleKey)}
      </Title>
      <Paragraph type="secondary">{t(descKey)}</Paragraph>
    </div>
  );
}

import React from "react";
import { Select } from "antd";
import { useTranslation } from "react-i18next";

const OPTIONS = [
  { value: "zh", labelKey: "common.chinese" },
  { value: "en", labelKey: "common.english" },
];

export default function LanguageSwitcher({ style, size = "small" }) {
  const { i18n, t } = useTranslation();

  return (
    <Select
      size={size}
      value={i18n.language?.startsWith("en") ? "en" : "zh"}
      style={{ minWidth: 100, ...style }}
      options={OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.labelKey),
      }))}
      onChange={(lng) => i18n.changeLanguage(lng)}
      aria-label={t("common.language")}
    />
  );
}

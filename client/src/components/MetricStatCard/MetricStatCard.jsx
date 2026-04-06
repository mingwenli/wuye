import React from "react";
import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";
import "./MetricStatCard.css";

const { Text, Title } = Typography;

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.title
 * @param {import('react').ComponentType} props.icon
 * @param {string} [props.accent='#165DFF']
 * @param {number|string|null|undefined} [props.value]
 * @param {import('react').ReactNode} [props.valueDisplay] 覆盖数字格式化后的展示（如「未规划」）
 * @param {number} [props.precision=2]
 * @param {string} [props.unit]
 * @param {string} [props.className]
 */
export function MetricStatCard({
  title,
  icon: Icon,
  accent = "#165DFF",
  value,
  valueDisplay,
  precision = 2,
  unit,
  className = "",
}) {
  const { i18n } = useTranslation();
  const numberLocale = i18n.language?.startsWith("en") ? "en-US" : "zh-CN";

  let display;
  if (valueDisplay !== undefined && valueDisplay !== null) {
    display = valueDisplay;
  } else if (typeof value === "number" && !Number.isNaN(value)) {
    display = value.toLocaleString(numberLocale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  } else if (value === null || value === undefined || (typeof value === "number" && Number.isNaN(value))) {
    display = "—";
  } else {
    display = String(value);
  }

  const tint = `${accent}15`;

  return (
    <Card className={`metric-stat-card ${className}`.trim()} bordered={false}>
      <div className="metric-stat-card__content">
        <div className="metric-stat-card__icon" style={{ backgroundColor: tint }}>
          <span style={{ color: accent }}>{Icon ? <Icon /> : null}</span>
        </div>
        <div className="metric-stat-card__info">
          <Text className="metric-stat-card__title">{title}</Text>
          <div className="metric-stat-card__value-row">
            <Title level={3} className="metric-stat-card__value">
              {display}
            </Title>
            {unit ? (
              <Text className="metric-stat-card__unit" type="secondary">
                {unit}
              </Text>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function MetricStatCardSection({ children, className = "" }) {
  return <div className={`metric-stat-section ${className}`.trim()}>{children}</div>;
}

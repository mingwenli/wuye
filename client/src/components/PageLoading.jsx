import React from "react";
import { Spin } from "antd";

export default function PageLoading() {
  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <Spin size="large" />
    </div>
  );
}

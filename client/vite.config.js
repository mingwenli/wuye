import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * 拆包：图表库单独 chunk（仅进数据分析等页时加载）；antd 与 @ant-design/icons、rc-* 同 chunk，避免循环依赖。
 */
function manualChunks(id) {
  if (!id.includes("node_modules")) return;
  if (id.includes("@antv") || id.includes("@ant-design/plots")) return "charts";
  if (
    id.includes("antd") ||
    id.includes("@ant-design/icons") ||
    id.includes("/rc-")
  ) {
    return "antd";
  }
  if (id.includes("i18next")) return "i18n";
  if (id.includes("axios")) return "axios";
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
    chunkSizeWarningLimit: 800,
  },
  resolve: {
    alias: {
      // 科目树在仓库根目录；开发模式下需配合 server.fs.allow 才能从 client 外读取
      "@classTree": path.join(repoRoot, "class.json"),
    },
  },
  server: {
    fs: {
      allow: [repoRoot, __dirname],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});


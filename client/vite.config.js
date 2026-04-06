import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [react()],
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


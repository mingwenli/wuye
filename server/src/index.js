import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// 始终从 server/.env 加载（避免在其它工作目录启动时读不到变量、退回 root 默认）
dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { initDbAndSeed, ensureInternalValueLogsTable } from "./db.js";
import { projectsRouter } from "./routes/projects.js";
import { usersRouter } from "./routes/users.js";
import { subjectsRouter } from "./routes/subjects.js";
import { internalValueLogsRouter } from "./routes/internalValueLogs.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/settings/projects", projectsRouter);
app.use("/api/settings/users", usersRouter);
app.use("/api/settings/subjects", subjectsRouter);
app.use("/api/cost/internal-value-logs", internalValueLogsRouter);

const port = Number(process.env.PORT || 3001);

await initDbAndSeed();
await ensureInternalValueLogsTable();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { initDbAndSeed } from "./db.js";
import { projectsRouter } from "./routes/projects.js";
import { usersRouter } from "./routes/users.js";
import { subjectsRouter } from "./routes/subjects.js";

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

const port = Number(process.env.PORT || 3001);

await initDbAndSeed();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


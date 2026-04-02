import express from "express";
import { z } from "zod";
import { pool, initProjectSubjects } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const projectsRouter = express.Router();

const listQuerySchema = z
  .object({
    name: z.string().optional(),
    code: z.string().optional(),
    city: z.string().optional(),
  })
  .strict();

const projectCreateSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  city: z.string().min(1).max(100),
});

const projectUpdateSchema = projectCreateSchema.partial();

projectsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { name, code, city } = parsed.data;

  const where = [];
  const values = [];
  let idx = 1;

  if (name) {
    where.push(`name ILIKE $${idx++}`);
    values.push(`%${name}%`);
  }
  if (code) {
    where.push(`code ILIKE $${idx++}`);
    values.push(`%${code}%`);
  }
  if (city) {
    where.push(`city ILIKE $${idx++}`);
    values.push(`%${city}%`);
  }

  const sql =
    where.length > 0
      ? `SELECT id, name, code, city, created_at FROM projects WHERE ${where.join(
          " AND "
        )} ORDER BY id DESC`
      : `SELECT id, name, code, city, created_at FROM projects ORDER BY id DESC`;

  const { rows } = await pool.query(sql, values);
  return res.json({ data: rows });
});

projectsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { name, code, city } = parsed.data;

  const { rows } = await pool.query(
    "INSERT INTO projects (name, code, city) VALUES ($1, $2, $3) RETURNING id, name, code, city, created_at",
    [name, code, city]
  );

  const projectId = rows[0].id;
  await initProjectSubjects(projectId);

  return res.json({ data: rows[0] });
});

projectsRouter.put("/:id", requireAuth, async (req, res) => {
  const parsed = projectUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { id } = req.params;
  const { name, code, city } = parsed.data;

  const patches = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) {
    patches.push(`name = $${idx++}`);
    values.push(name);
  }
  if (code !== undefined) {
    patches.push(`code = $${idx++}`);
    values.push(code);
  }
  if (city !== undefined) {
    patches.push(`city = $${idx++}`);
    values.push(city);
  }

  if (patches.length === 0) return res.status(400).json({ message: "未提供更新字段" });

  values.push(id);
  const sql = `UPDATE projects SET ${patches.join(", ")} WHERE id = $${idx} RETURNING id, name, code, city, created_at`;

  const { rows } = await pool.query(sql, values);
  return res.json({ data: rows[0] ?? null });
});

projectsRouter.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  // users.project_id 不加外键约束的话，不需要先清理；这里只做顺手兼容
  await pool.query("UPDATE users SET project_id = NULL WHERE project_id = $1", [id]);

  await pool.query("DELETE FROM projects WHERE id = $1", [id]);
  return res.json({ message: "ok" });
});


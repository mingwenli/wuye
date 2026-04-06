import express from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = express.Router();

const listQuerySchema = z
  .object({
    username: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict();

const userCreateSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
  project_id: z.number().int().positive().nullable().optional(),
});

const userUpdateSchema = z.object({
  username: z.string().min(1).max(50).optional(),
  password: z.string().min(1).max(200).optional(),
  project_id: z.number().int().positive().nullable().optional(),
});

usersRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { username, projectId } = parsed.data;
  const where = [];
  const values = [];

  if (username) {
    where.push(`username LIKE ?`);
    values.push(`%${username}%`);
  }
  if (projectId) {
    where.push(`project_id = ?`);
    values.push(Number(projectId));
  }

  const sql =
    where.length > 0
      ? `SELECT id, username, project_id, created_at FROM users WHERE ${where.join(
          " AND "
        )} ORDER BY id DESC`
      : `SELECT id, username, project_id, created_at FROM users ORDER BY id DESC`;

  const [rows] = await pool.query(sql, values);
  return res.json({ data: rows });
});

usersRouter.post("/", requireAuth, async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { username, password, project_id } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    "INSERT INTO users (username, password_hash, project_id) VALUES (?, ?, ?)",
    [username, passwordHash, project_id ?? null]
  );

  const insertedId = result.insertId;
  const [rows] = await pool.query(
    "SELECT id, username, project_id, created_at FROM users WHERE id = ? LIMIT 1",
    [insertedId]
  );

  return res.json({ data: rows[0] });
});

usersRouter.put("/:id", requireAuth, async (req, res) => {
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { id } = req.params;
  const { username, password, project_id } = parsed.data;

  const patches = [];
  const values = [];

  if (username !== undefined) {
    patches.push(`username = ?`);
    values.push(username);
  }
  if (project_id !== undefined) {
    patches.push(`project_id = ?`);
    values.push(project_id);
  }
  if (password !== undefined) {
    const passwordHash = await bcrypt.hash(password, 10);
    patches.push(`password_hash = ?`);
    values.push(passwordHash);
  }

  if (patches.length === 0) return res.status(400).json({ message: "未提供更新字段" });

  values.push(id);
  const sql = `UPDATE users SET ${patches.join(", ")} WHERE id = ?`;

  await pool.query(sql, values);
  const [rows] = await pool.query(
    "SELECT id, username, project_id, created_at FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return res.json({ data: rows[0] ?? null });
});

usersRouter.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM users WHERE id = ?", [id]);
  return res.json({ message: "ok" });
});


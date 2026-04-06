import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { isMockDb, pool } from "../db.js";

export const authRouter = express.Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// 初始化管理员（方便你首次跑通登录）
// POST /api/auth/bootstrap  { username, password }
authRouter.post("/bootstrap", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { username, password } = parsed.data;

  if (isMockDb) {
    // mock 模式：不连接数据库，仅返回 ok（方便前端跑通）
    return res.json({ message: "ok" });
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const [rows] = await pool.query(
    "SELECT id FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return res.status(409).json({ message: "用户已存在" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    [username, passwordHash]
  );

  return res.json({ message: "ok" });
});

// 登录
// POST /api/auth/login  { username, password }
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { username, password } = parsed.data;

  if (isMockDb) {
    // mock 模式：支持任意输入用户名/密码，通过发一个固定 token 直接登录
    // 前端为了展示数据可不依赖 MySQL。
    const mockUser = {
      id: "1",
      username: username || process.env.MOCK_USERNAME || "admin",
    };
    const token = jwt.sign(
      { id: mockUser.id, username: mockUser.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.json({
      token,
      user: { id: mockUser.id, username: mockUser.username },
    });
  }

  const [rows] = await pool.query(
    "SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1",
    [username]
  );

  const user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!user) return res.status(401).json({ message: "账号或密码错误" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: "账号或密码错误" });

  const token = jwt.sign(
    { id: String(user.id), username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return res.json({
    token,
    user: { id: String(user.id), username: user.username },
  });
});


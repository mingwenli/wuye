import express from "express";
import { z } from "zod";
import { pool, initProjectSubjects } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const projectsRouter = express.Router();

/** 与前端、数据库约定一致 */
export const PROJECT_REGIONS = [
  "north_china",
  "east_china",
  "south_china",
  "central_china",
  "southwest",
  "northwest",
  "northeast",
  "hk_mo_tw",
];

export const PROJECT_TYPES = [
  "shopping_mall",
  "office",
  "industrial_park",
  "long_term_rental",
];

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
  region: z.enum(PROJECT_REGIONS),
  project_type: z.enum(PROJECT_TYPES),
  operating_area: z.coerce.number().nonnegative().optional().nullable(),
});

const projectUpdateSchema = projectCreateSchema.partial();

const monthlyAreasPutSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  leasable_area: z.coerce.number().nonnegative(),
});

projectsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { name, code, city } = parsed.data;

  const where = [];
  const values = [];

  if (name) {
    where.push(`name LIKE ?`);
    values.push(`%${name}%`);
  }
  if (code) {
    where.push(`code LIKE ?`);
    values.push(`%${code}%`);
  }
  if (city) {
    where.push(`city LIKE ?`);
    values.push(`%${city}%`);
  }

  const sql =
    where.length > 0
      ? `SELECT id, name, code, city, region, project_type, operating_area, created_at FROM projects WHERE ${where.join(
          " AND "
        )} ORDER BY id DESC`
      : `SELECT id, name, code, city, region, project_type, operating_area, created_at FROM projects ORDER BY id DESC`;

  const [rows] = await pool.query(sql, values);
  return res.json({ data: rows });
});

/** 必须在 GET /:id 之前 */
projectsRouter.get("/:id/monthly-areas", requireAuth, async (req, res) => {
  const id = req.params.id;
  const year = Number(req.query.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ message: "year 参数不正确" });
  }
  const [rows] = await pool.query(
    `SELECT month, leasable_area FROM project_monthly_areas WHERE project_id = ? AND year = ? ORDER BY month`,
    [id, year]
  );
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.leasable_area)]));
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ month: m, leasable_area: byMonth.has(m) ? byMonth.get(m) : 0 });
  }
  return res.json({ data: { year, months } });
});

projectsRouter.put("/:id/monthly-areas", requireAuth, async (req, res) => {
  const parsed = monthlyAreasPutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { id } = req.params;
  const { year, month, leasable_area } = parsed.data;

  const [[proj]] = await pool.query(
    "SELECT id, project_type FROM projects WHERE id = ? LIMIT 1",
    [id]
  );
  if (!proj) return res.status(404).json({ message: "项目不存在" });
  if (proj.project_type !== "office" && proj.project_type !== "industrial_park") {
    return res.status(400).json({ message: "当前项目类型不支持按月可出租面积" });
  }

  await pool.query(
    `INSERT INTO project_monthly_areas (project_id, year, month, leasable_area)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE leasable_area = VALUES(leasable_area), updated_at = CURRENT_TIMESTAMP`,
    [id, year, month, leasable_area]
  );

  const [[row]] = await pool.query(
    `SELECT month, leasable_area FROM project_monthly_areas WHERE project_id = ? AND year = ? AND month = ?`,
    [id, year, month]
  );
  return res.json({ data: row });
});

projectsRouter.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `SELECT id, name, code, city, region, project_type, operating_area, created_at FROM projects WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ message: "项目不存在" });
  return res.json({ data: rows[0] });
});

projectsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { name, code, city, region, project_type, operating_area } = parsed.data;

  const [result] = await pool.query(
    "INSERT INTO projects (name, code, city, region, project_type, operating_area) VALUES (?, ?, ?, ?, ?, ?)",
    [name, code, city, region, project_type, operating_area ?? null]
  );
  const projectId = result.insertId;
  await initProjectSubjects(projectId);

  const [rows] = await pool.query(
    "SELECT id, name, code, city, region, project_type, operating_area, created_at FROM projects WHERE id = ? LIMIT 1",
    [projectId]
  );

  return res.json({ data: rows[0] });
});

projectsRouter.put("/:id", requireAuth, async (req, res) => {
  const parsed = projectUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { id } = req.params;
  const body = parsed.data;

  const patches = [];
  const values = [];

  if (body.name !== undefined) {
    patches.push(`name = ?`);
    values.push(body.name);
  }
  if (body.code !== undefined) {
    patches.push(`code = ?`);
    values.push(body.code);
  }
  if (body.city !== undefined) {
    patches.push(`city = ?`);
    values.push(body.city);
  }
  if (body.region !== undefined) {
    patches.push(`region = ?`);
    values.push(body.region);
  }
  if (body.project_type !== undefined) {
    patches.push(`project_type = ?`);
    values.push(body.project_type);
  }
  if (body.operating_area !== undefined) {
    patches.push(`operating_area = ?`);
    values.push(body.operating_area);
  }

  if (patches.length === 0) return res.status(400).json({ message: "未提供更新字段" });

  values.push(id);
  const sql = `UPDATE projects SET ${patches.join(", ")} WHERE id = ?`;

  await pool.query(sql, values);
  const [rows] = await pool.query(
    "SELECT id, name, code, city, region, project_type, operating_area, created_at FROM projects WHERE id = ? LIMIT 1",
    [id]
  );
  return res.json({ data: rows[0] ?? null });
});

projectsRouter.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  await pool.query("UPDATE users SET project_id = NULL WHERE project_id = ?", [id]);
  await pool.query("DELETE FROM project_monthly_areas WHERE project_id = ?", [id]);
  await pool.query("DELETE FROM projects WHERE id = ?", [id]);
  return res.json({ message: "ok" });
});

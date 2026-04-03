import express from "express";
import { z } from "zod";
import { isMockDb, pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const internalValueLogsRouter = express.Router();

/** Mock 模式下内存存储，重启后清空 */
const mockLogs = [];

const createSchema = z.object({
  projectId: z.coerce.number(),
  year: z.coerce.number().int(),
  subjectId: z.coerce.number(),
  subjectName: z.string().min(1),
  oldInternalAmount: z.coerce.number(),
  newInternalAmount: z.coerce.number(),
  /** 仅记录内控变更时，过程值不再修改，库中两列存 0 占位 */
  oldProcessAmount: z.coerce.number().optional(),
  newProcessAmount: z.coerce.number().optional(),
  remark: z.string().optional().nullable(),
  attachmentInfo: z.string().optional().nullable(),
});

const listQuerySchema = z.object({
  projectId: z.coerce.number(),
  year: z.coerce.number().int().optional(),
  subjectId: z.coerce.number().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

internalValueLogsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "参数不正确" });
  }

  const d = parsed.data;
  const user = req.user;
  const changedByUserId = String(user?.id ?? "");
  const changedByUsername = String(user?.username ?? "");

  const procOld = d.oldProcessAmount ?? 0;
  const procNew = d.newProcessAmount ?? 0;

  if (isMockDb || !pool) {
    const row = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      project_id: d.projectId,
      year: d.year,
      subject_id: d.subjectId,
      subject_name: d.subjectName,
      old_internal_amount: d.oldInternalAmount,
      new_internal_amount: d.newInternalAmount,
      old_process_amount: procOld,
      new_process_amount: procNew,
      remark: d.remark ?? "",
      attachment_info: d.attachmentInfo ?? null,
      changed_by_user_id: changedByUserId,
      changed_by_username: changedByUsername,
      created_at: new Date().toISOString(),
    };
    mockLogs.unshift(row);
    return res.json({ data: row });
  }

  const { rows } = await pool.query(
    `
    INSERT INTO internal_value_change_logs (
      project_id, year, subject_id, subject_name,
      old_internal_amount, new_internal_amount,
      old_process_amount, new_process_amount,
      remark, attachment_info, changed_by_user_id, changed_by_username
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id, project_id, year, subject_id, subject_name,
      old_internal_amount, new_internal_amount,
      old_process_amount, new_process_amount,
      remark, attachment_info, changed_by_user_id, changed_by_username, created_at
    `,
    [
      d.projectId,
      d.year,
      d.subjectId,
      d.subjectName,
      d.oldInternalAmount,
      d.newInternalAmount,
      procOld,
      procNew,
      d.remark ?? null,
      d.attachmentInfo ?? null,
      changedByUserId,
      changedByUsername,
    ]
  );

  return res.json({ data: rows[0] });
});

internalValueLogsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "参数不正确" });
  }

  const q = parsed.data;
  const projectId = q.projectId;

  if (isMockDb || !pool) {
    let list = mockLogs.filter((r) => String(r.project_id) === String(projectId));
    if (q.year != null) {
      list = list.filter((r) => Number(r.year) === Number(q.year));
    }
    if (q.subjectId != null) {
      list = list.filter((r) => String(r.subject_id) === String(q.subjectId));
    }
    if (q.startTime) {
      const t = new Date(q.startTime).getTime();
      list = list.filter((r) => new Date(r.created_at).getTime() >= t);
    }
    if (q.endTime) {
      const t = new Date(q.endTime).getTime();
      list = list.filter((r) => new Date(r.created_at).getTime() <= t);
    }
    return res.json({ data: list });
  }

  const values = [projectId];
  let idx = 2;
  const where = [`project_id = $1`];

  if (q.year != null) {
    where.push(`year = $${idx++}`);
    values.push(q.year);
  }
  if (q.subjectId != null) {
    where.push(`subject_id = $${idx++}`);
    values.push(q.subjectId);
  }
  if (q.startTime) {
    where.push(`created_at >= $${idx++}::timestamp`);
    values.push(q.startTime);
  }
  if (q.endTime) {
    where.push(`created_at <= $${idx++}::timestamp`);
    values.push(q.endTime);
  }

  const sql = `
    SELECT id, project_id, year, subject_id, subject_name,
      old_internal_amount, new_internal_amount,
      old_process_amount, new_process_amount,
      remark, attachment_info, changed_by_user_id, changed_by_username, created_at
    FROM internal_value_change_logs
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql, values);
  return res.json({ data: rows });
});

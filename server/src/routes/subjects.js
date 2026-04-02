import express from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const subjectsRouter = express.Router();

subjectsRouter.get("/tree", requireAuth, async (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!projectId) return res.status(400).json({ message: "projectId 必填" });

  const { rows } = await pool.query(
    `
      SELECT
        id,
        parent_project_subject_id,
        base_subject_id,
        name,
        is_leaf,
        tax_rate,
        created_at
      FROM project_subjects
      WHERE project_id = $1
      ORDER BY created_at ASC
    `,
    [projectId]
  );

  const nodeById = new Map();
  for (const r of rows) {
    nodeById.set(r.id, {
      id: r.id,
      parentId: r.parent_project_subject_id,
      baseSubjectId: r.base_subject_id,
      name: r.name,
      isLeaf: r.is_leaf,
      taxRate: r.tax_rate === null ? null : Number(r.tax_rate),
      custom: r.base_subject_id === null,
      children: [],
    });
  }

  const roots = [];
  for (const node of nodeById.values()) {
    if (node.parentId === null) roots.push(node);
    else {
      const parent = nodeById.get(node.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  // 保持 created_at 顺序
  function sortTree(n) {
    n.children.sort((a, b) => a.id - b.id);
    n.children.forEach(sortTree);
  }
  roots.forEach(sortTree);

  return res.json({ data: roots });
});

const addNodeSchema = z.object({
  parentId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  taxRate: z.number().positive().max(1).optional(), // 0~1
});

subjectsRouter.post("/nodes", requireAuth, async (req, res) => {
  const parsed = addNodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const { parentId, name, taxRate } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const parentRes = await client.query(
      `SELECT id, project_id, is_leaf FROM project_subjects WHERE id = $1`,
      [parentId]
    );
    const parent = parentRes.rows[0];
    if (!parent) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "父节点不存在" });
    }
    if (!parent.is_leaf) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "只能在叶子节点下添加子科目" });
    }

    await client.query(
      `UPDATE project_subjects SET is_leaf = FALSE, tax_rate = NULL WHERE id = $1`,
      [parentId]
    );

    const insertRes = await client.query(
      `
        INSERT INTO project_subjects
          (project_id, base_subject_id, parent_project_subject_id, name, is_leaf, tax_rate)
        VALUES
          ($1, NULL, $2, $3, TRUE, $4)
        RETURNING id
      `,
      [parent.project_id, parentId, name, taxRate ?? 0.06]
    );

    await client.query("COMMIT");
    return res.json({ data: insertRes.rows[0].id });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: e.message ?? "server error" });
  } finally {
    client.release();
  }
});

const taxUpdateSchema = z.object({
  taxRate: z.number().positive().max(1),
});

subjectsRouter.patch("/nodes/:id/tax-rate", requireAuth, async (req, res) => {
  const parsed = taxUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数不正确" });

  const nodeId = Number(req.params.id);
  const { taxRate } = parsed.data;

  const { rows } = await pool.query(
    `SELECT id, is_leaf FROM project_subjects WHERE id = $1`,
    [nodeId]
  );
  const node = rows[0];
  if (!node) return res.status(404).json({ message: "节点不存在" });
  if (!node.is_leaf) return res.status(400).json({ message: "非叶子节点不能设置税率" });

  await pool.query(
    `UPDATE project_subjects SET tax_rate = $1 WHERE id = $2`,
    [taxRate, nodeId]
  );

  return res.json({ message: "ok" });
});

subjectsRouter.delete("/nodes/:id", requireAuth, async (req, res) => {
  const nodeId = Number(req.params.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const nodeRes = await client.query(
      `SELECT id, parent_project_subject_id, is_leaf, base_subject_id FROM project_subjects WHERE id = $1`,
      [nodeId]
    );
    const node = nodeRes.rows[0];
    if (!node) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "节点不存在" });
    }
    if (node.base_subject_id !== null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "基础科目节点不允许删除" });
    }
    if (!node.is_leaf) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "只能删除叶子节点（自定义节点）" });
    }

    await client.query(`DELETE FROM project_subjects WHERE id = $1`, [nodeId]);

    if (node.parent_project_subject_id !== null) {
      const siblingRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM project_subjects WHERE parent_project_subject_id = $1`,
        [node.parent_project_subject_id]
      );
      const cnt = siblingRes.rows[0].cnt;
      if (cnt === 0) {
        await client.query(
          `UPDATE project_subjects SET is_leaf = TRUE, tax_rate = $1 WHERE id = $2`,
          [0.06, node.parent_project_subject_id]
        );
      }
    }

    await client.query("COMMIT");
    return res.json({ message: "ok" });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: e.message ?? "server error" });
  } finally {
    client.release();
  }
});


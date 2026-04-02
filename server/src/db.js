import { Pool } from "pg";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";

export const isMockDb = String(process.env.USE_MOCK_DB ?? "1") === "1";

const {
  PG_HOST = "localhost",
  PG_PORT = "5432",
  PG_USER = "limingwen",
  PG_PASSWORD = "limingwen",
  PG_DATABASE = "property_cost_control",

  // 用于初始化 seed 账号（可选）
  SEED_USERNAME = "limingwen",
  SEED_PASSWORD = "limingwen",
} = process.env;

export const pool = isMockDb
  ? null
  : new Pool({
      host: PG_HOST,
      port: Number(PG_PORT),
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DATABASE,
    });

const TAX_RATE_DEFAULT = 0.06;

async function loadClassJsonTree() {
  const url = new URL("../../class.json", import.meta.url);
  const raw = await fs.readFile(url, "utf-8");
  return JSON.parse(raw);
}

function flattenClassTree(nodes, parentBaseId = null, acc = [], sortIndex = { i: 1 }) {
  if (!Array.isArray(nodes)) return acc;

  for (const node of nodes) {
    const baseId = Number(node.id);
    const name = String(node.name ?? "");
    const children = Array.isArray(node.children) ? node.children : [];
    const isLeaf = children.length === 0;
    const sortOrder = sortIndex.i++;

    acc.push({
      base_id: baseId,
      name,
      parent_base_id: parentBaseId,
      is_leaf: isLeaf,
      sort_order: sortOrder,
    });

    if (!isLeaf) {
      flattenClassTree(children, baseId, acc, sortIndex);
    }
  }

  return acc;
}

function buildChildrenMap(baseRows) {
  const childrenByParent = new Map();
  const roots = [];

  for (const row of baseRows) {
    const parent = row.parent_base_id;
    if (parent === null) roots.push(row);
    const key = parent === null ? "__ROOT__" : String(parent);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
  }

  for (const row of baseRows) {
    const key = row.parent_base_id === null ? "__ROOT__" : String(row.parent_base_id);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(row);
  }

  for (const [, arr] of childrenByParent) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }

  return { childrenByParent, roots };
}

async function seedBaseSubjects() {
  // 1) 建表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS base_subjects (
      base_id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_base_id BIGINT NULL,
      is_leaf BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2) 从 class.json 读树并 upsert
  const classTree = await loadClassJsonTree();
  const flat = flattenClassTree(classTree);

  // 逐条 upsert（数据量一般可接受，保证 parent/leaf 信息一致）
  for (const node of flat) {
    await pool.query(
      `
      INSERT INTO base_subjects (base_id, name, parent_base_id, is_leaf, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (base_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        parent_base_id = EXCLUDED.parent_base_id,
        is_leaf = EXCLUDED.is_leaf,
        sort_order = EXCLUDED.sort_order
      `,
      [node.base_id, node.name, node.parent_base_id, node.is_leaf, node.sort_order]
    );
  }
}

export async function initDbAndSeed() {
  if (isMockDb) return;

  // 业务基础表：项目、人员
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 账号密码表：用于登录
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      project_id BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  );

  // 兼容旧表（如果 users 在更早版本中已创建过）
  // eslint-disable-next-line no-useless-escape
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS project_id BIGINT;`
  );

  // 基础科目树 + 项目科目树
  await seedBaseSubjects();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_subjects (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      base_subject_id BIGINT NULL REFERENCES base_subjects(base_id),
      parent_project_subject_id BIGINT NULL REFERENCES project_subjects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_leaf BOOLEAN NOT NULL DEFAULT TRUE,
      tax_rate NUMERIC(8,4) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (project_id, base_subject_id)
    );
  `);

  // 初始化默认账号：limingwen / limingwen
  // 初始化默认账号：limingwen / limingwen
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE username = $1 LIMIT 1",
    [SEED_USERNAME]
  );

  if (!rows || rows.length === 0) {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2)",
      [SEED_USERNAME, passwordHash]
    );
  }
}

export async function initProjectSubjects(projectId) {
  if (isMockDb) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const baseRowsRes = await client.query(
      "SELECT base_id, name, parent_base_id, is_leaf, sort_order FROM base_subjects ORDER BY sort_order ASC"
    );
    const baseRows = baseRowsRes.rows;
    const { childrenByParent } = buildChildrenMap(baseRows);
    const baseById = new Map(baseRows.map((r) => [String(r.base_id), r]));

    async function insertNode(baseId, parentProjectSubjectId) {
      // 通过 baseId 精确找到当前节点
      const node = baseById.get(String(baseId));
      if (!node) return null;

      const insertRes = await client.query(
        `
        INSERT INTO project_subjects
          (project_id, base_subject_id, parent_project_subject_id, name, is_leaf, tax_rate)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [
          projectId,
          node.base_id,
          parentProjectSubjectId ?? null,
          node.name,
          node.is_leaf,
          node.is_leaf ? TAX_RATE_DEFAULT : null,
        ]
      );

      const currentId = insertRes.rows[0].id;

      // 按顺序插入子节点
      const childKey = String(node.base_id);
      const children = childrenByParent.get(childKey) || [];
      for (const child of children) {
        await insertNode(child.base_id, currentId);
      }

      return currentId;
    }

    const rootKey = "__ROOT__";
    const roots = childrenByParent.get(rootKey) || [];
    for (const root of roots) {
      await insertNode(root.base_id, null);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


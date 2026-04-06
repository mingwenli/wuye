import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import { logInfo } from "./logger.js";

export const isMockDb = String(process.env.USE_MOCK_DB ?? "1") === "1";

function getMysqlConfig() {
  const {
    MYSQL_HOST = "localhost",
    MYSQL_PORT = "3306",
    MYSQL_USER = "root",
    MYSQL_PASSWORD = "",
    MYSQL_DATABASE = "property_cost_control",
  } = process.env;
  return {
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE.replace(/`/g, ""),
  };
}

/** 连接池在 initDbAndSeed 中创建（需先确保库存在）。mock 模式下为 null。 */
export let pool = null;

function poolOptions() {
  const c = getMysqlConfig();
  const useSsl = String(process.env.MYSQL_SSL ?? "0") === "1";
  return {
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? "10"),
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS ?? "30000"),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function mysqlAuthHint(c, originalMessage) {
  return [
    "MySQL 登录失败（用户名或密码与主机不匹配）。",
    `当前将连接: host=${c.host} port=${c.port} user=${c.user} database=${c.database}`,
    "请确认 server/.env 中 MYSQL_HOST、MYSQL_USER、MYSQL_PASSWORD 正确，且该账号允许从你这台机器访问（本地 root 与远程账号不同）。",
    "若 .env 未生效，请在 server 目录下执行: npm run dev",
    `原始错误: ${originalMessage}`,
  ].join("\n");
}

/** 不指定 database 连接，创建库后再建连接池（utf8mb4） */
async function ensureDatabaseExists() {
  const c = getMysqlConfig();
  let conn;
  try {
    conn = await mysql.createConnection({
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS ?? "30000"),
      ...(String(process.env.MYSQL_SSL ?? "0") === "1"
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    });
  } catch (e) {
    if (e && e.code === "ER_ACCESS_DENIED_ERROR") {
      throw new Error(mysqlAuthHint(c, e.message));
    }
    throw e;
  }
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${c.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end();
  }
}

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

async function ensureProjectExtendedSchema() {
  if (!pool) return;
  const fragments = [
    "ADD COLUMN region VARCHAR(50) NULL",
    "ADD COLUMN project_type VARCHAR(40) NULL",
    "ADD COLUMN operating_area DECIMAL(18,2) NULL",
  ];
  for (const f of fragments) {
    try {
      await pool.query(`ALTER TABLE projects ${f}`);
    } catch (e) {
      if (e.code !== "ER_DUP_FIELDNAME") throw e;
    }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_monthly_areas (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT NOT NULL,
      year INT NOT NULL,
      month TINYINT NOT NULL,
      leasable_area DECIMAL(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_project_year_month (project_id, year, month),
      KEY idx_pma_project (project_id)
    )
  `);
}

async function seedBaseSubjects() {
  // 1) 建表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS base_subjects (
      base_id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      parent_base_id BIGINT NULL,
      is_leaf TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2) 从 class.json 读树并 upsert
  const classTree = await loadClassJsonTree();
  const flat = flattenClassTree(classTree);

  // 逐条 upsert（数据量一般可接受，保证 parent/leaf 信息一致）
  for (const node of flat) {
    await pool.query(
      `
        INSERT INTO base_subjects (base_id, name, parent_base_id, is_leaf, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          parent_base_id = VALUES(parent_base_id),
          is_leaf = VALUES(is_leaf),
          sort_order = VALUES(sort_order)
      `,
      [node.base_id, node.name, node.parent_base_id, node.is_leaf ? 1 : 0, node.sort_order]
    );
  }
}

export async function initDbAndSeed() {
  if (isMockDb) {
    logInfo("[db] USE_MOCK_DB=1，未连接 MySQL（仅内存/mock）");
    return;
  }

  await ensureDatabaseExists();
  pool = mysql.createPool(poolOptions());

  const cfg = getMysqlConfig();
  logInfo(
    `[db] MySQL → ${cfg.host}:${cfg.port} / ${cfg.database} (user: ${cfg.user})`
  );

  const SEED_USERNAME = process.env.SEED_USERNAME ?? "limingwen";
  const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "limingwen";

  // 业务基础表：项目、人员
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(100) NOT NULL UNIQUE,
      city VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureProjectExtendedSchema();

  // 账号密码表：用于登录
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      project_id BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // 基础科目树 + 项目科目树
  await seedBaseSubjects();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_subjects (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT NOT NULL,
      base_subject_id BIGINT NULL,
      parent_project_subject_id BIGINT NULL,
      name VARCHAR(255) NOT NULL,
      is_leaf TINYINT(1) NOT NULL DEFAULT 1,
      tax_rate DECIMAL(8,4) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (project_id, base_subject_id)
    )
  `);

  const [rows] = await pool.query(
    "SELECT id FROM users WHERE username = ? LIMIT 1",
    [SEED_USERNAME]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
    await pool.query(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [SEED_USERNAME, passwordHash]
    );
  }
}

/** 内控值修改日志（过程管控 / 内控值管理） */
export async function ensureInternalValueLogsTable() {
  if (isMockDb || !pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_value_change_logs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT NOT NULL,
      year INT NOT NULL,
      subject_id BIGINT NOT NULL,
      subject_name VARCHAR(255) NOT NULL,
      old_internal_amount DECIMAL(20,2) NOT NULL,
      new_internal_amount DECIMAL(20,2) NOT NULL,
      old_process_amount DECIMAL(20,2) NOT NULL,
      new_process_amount DECIMAL(20,2) NOT NULL,
      remark TEXT,
      changed_by_user_id VARCHAR(100) NOT NULL,
      changed_by_username VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_ivcl_project_year ON internal_value_change_logs (project_id, year)"
  ).catch(() => {});
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_ivcl_created ON internal_value_change_logs (created_at DESC)"
  ).catch(() => {});
  await pool
    .query(
      "ALTER TABLE internal_value_change_logs ADD COLUMN IF NOT EXISTS attachment_info TEXT"
    )
    .catch(() => {});
}

export async function initProjectSubjects(projectId) {
  if (isMockDb) return;

  const client = await pool.getConnection();
  try {
    await client.beginTransaction();

    const [baseRows] = await client.query(
      "SELECT base_id, name, parent_base_id, is_leaf, sort_order FROM base_subjects ORDER BY sort_order ASC"
    );
    const { childrenByParent } = buildChildrenMap(baseRows);
    const baseById = new Map(baseRows.map((r) => [String(r.base_id), r]));

    async function insertNode(baseId, parentProjectSubjectId) {
      // 通过 baseId 精确找到当前节点
      const node = baseById.get(String(baseId));
      if (!node) return null;

      const [insertRes] = await client.query(
        `
        INSERT INTO project_subjects
          (project_id, base_subject_id, parent_project_subject_id, name, is_leaf, tax_rate)
        VALUES
          (?, ?, ?, ?, ?, ?)
        `,
        [
          projectId,
          node.base_id,
          parentProjectSubjectId ?? null,
          node.name,
          node.is_leaf ? 1 : 0,
          node.is_leaf ? TAX_RATE_DEFAULT : null,
        ]
      );

      const currentId = insertRes.insertId;

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

    await client.commit();
  } catch (e) {
    await client.rollback();
    throw e;
  } finally {
    client.release();
  }
}


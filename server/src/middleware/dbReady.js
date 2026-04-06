import { pool } from "../db.js";

/**
 * 在需要 MySQL 的路由上使用。pool 为 null 时（如 USE_MOCK_DB=1 或初始化失败）返回 503，避免 pool.query 报错。
 */
export function requireDb(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      message:
        "数据库未连接：请在 server/.env 设置 USE_MOCK_DB=0，并正确配置 MYSQL_HOST、MYSQL_USER、MYSQL_PASSWORD、MYSQL_DATABASE 后重启服务。",
    });
  }
  return next();
}

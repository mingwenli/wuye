import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 与 server/src 同级下的 log 目录 */
export const LOG_DIR = path.join(__dirname, "../log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function dailyLogFile() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `app-${y}-${m}-${day}.log`);
}

function formatLine(level, parts) {
  const msg = parts
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
    .join(" ");
  return `[${new Date().toISOString()}] [${level}] ${msg}\n`;
}

/**
 * 写入 server/log/app-YYYY-MM-DD.log，并尽量同时输出到控制台（部分部署环境会吞 stdout）
 */
export function log(level, ...parts) {
  ensureLogDir();
  const line = formatLine(level, parts);
  try {
    fs.appendFileSync(dailyLogFile(), line, "utf8");
  } catch (e) {
    // 最后手段：仍尝试打控制台
    process.stderr.write(`[logger] appendFile failed: ${e?.message ?? e}\n`);
  }
  try {
    const fn = level === "ERROR" ? console.error : console.log;
    fn(`[${level}]`, ...parts);
  } catch {
    /* ignore */
  }
}

export const logInfo = (...parts) => log("INFO", ...parts);
export const logWarn = (...parts) => log("WARN", ...parts);
export const logError = (...parts) => log("ERROR", ...parts);

/**
 * 过程管控提交状态（localStorage），与过程管控页、工作台共用。
 * 统计周期 monthIndex：0=2025-12 … 3=2026-03 … 11=2026-11
 */
export const PROCESS_SUBMIT_MONTH_INDEX = 3;

/** 「上月」相对 3 月：monthIndex 2 = 2026-02 */
export const PROCESS_PREV_MONTH_INDEX = PROCESS_SUBMIT_MONTH_INDEX - 1;

export function loadSubmittedMonthsArray(projectId) {
  if (projectId == null || projectId === undefined) return [];
  try {
    const raw = localStorage.getItem(`processControl_submitted_${projectId}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveSubmittedMonthsArray(projectId, monthIndices) {
  localStorage.setItem(
    `processControl_submitted_${projectId}`,
    JSON.stringify(monthIndices)
  );
}

export function revokeProcessControlMonth(projectId, monthIndex) {
  const next = loadSubmittedMonthsArray(projectId).filter((m) => m !== monthIndex);
  saveSubmittedMonthsArray(projectId, next);
  try {
    localStorage.removeItem(`processControl_report_${projectId}_${monthIndex}`);
  } catch {
    /* ignore */
  }
}

export function periodYearMonth(monthIndex) {
  const d = new Date(2025, 11 + monthIndex, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

/** 首次进入时默认视为「已审核」的月份：1=2026-01，2=2026-02 */
export const DEFAULT_AUDITED_MONTH_INDICES = [1, 2];

const AUDITED_KEY = (projectId) => `processControl_audited_${projectId}`;

export function ensureDefaultAuditedMonths(projectId) {
  if (projectId == null || projectId === undefined) return;
  const key = AUDITED_KEY(projectId);
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify([...DEFAULT_AUDITED_MONTH_INDICES]));
  }
}

export function loadAuditedMonthsArray(projectId) {
  ensureDefaultAuditedMonths(projectId);
  try {
    const raw = localStorage.getItem(AUDITED_KEY(projectId));
    if (!raw) return [...DEFAULT_AUDITED_MONTH_INDICES];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [...DEFAULT_AUDITED_MONTH_INDICES];
  } catch {
    return [...DEFAULT_AUDITED_MONTH_INDICES];
  }
}

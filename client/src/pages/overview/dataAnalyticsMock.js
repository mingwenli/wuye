/** 确定性伪随机金额（与项目 id、年份等绑定） */
export function amt(seed, min, max) {
  const x = Math.sin(Number(seed)) * 10000;
  const r = x - Math.floor(x);
  return Math.floor(min + r * (max - min + 1));
}

/**
 * 演示用虚拟项目（高 id 段，避免与真实库冲突）。开启「演示数据」时与接口项目合并。
 */
export const DEMO_PROJECTS = [
  { id: 880101, name: "滨湖天地广场", code: "DEMO-HD-01", region: "east_china", project_type: "shopping_mall", operating_area: 58200 },
  { id: 880102, name: "金融街中心 T1", code: "DEMO-JR-02", region: "north_china", project_type: "office", operating_area: 42800 },
  { id: 880103, name: "科创园一期", code: "DEMO-KC-03", region: "east_china", project_type: "industrial_park", operating_area: 95600 },
  { id: 880104, name: "滨江长租公寓", code: "DEMO-BJ-04", region: "south_china", project_type: "long_term_rental", operating_area: 31500 },
  { id: 880105, name: "城西万象汇", code: "DEMO-CX-05", region: "central_china", project_type: "shopping_mall", operating_area: 67200 },
  { id: 880106, name: "CBD 国际中心", code: "DEMO-CBD-06", region: "south_china", project_type: "office", operating_area: 50100 },
  { id: 880107, name: "西南物流港", code: "DEMO-XN-07", region: "southwest", project_type: "industrial_park", operating_area: 120400 },
  { id: 880108, name: "滨海青年社区", code: "DEMO-BH-08", region: "east_china", project_type: "long_term_rental", operating_area: 28900 },
  { id: 880109, name: "北国奥莱小镇", code: "DEMO-BG-09", region: "north_china", project_type: "shopping_mall", operating_area: 74800 },
  { id: 880110, name: "光谷研发园", code: "DEMO-GG-10", region: "central_china", project_type: "industrial_park", operating_area: 88200 },
  { id: 880111, name: "港珠联合大厦", code: "DEMO-GZ-11", region: "south_china", project_type: "office", operating_area: 39600 },
  { id: 880112, name: "西北能源港", code: "DEMO-XB-12", region: "northwest", project_type: "industrial_park", operating_area: 105000 },
  { id: 880113, name: "关东里商业街", code: "DEMO-GD-13", region: "northeast", project_type: "shopping_mall", operating_area: 61200 },
  { id: 880114, name: "海岛度假公寓", code: "DEMO-HD-14", region: "south_china", project_type: "long_term_rental", operating_area: 22400 },
  { id: 880115, name: "港澳广场", code: "DEMO-GA-15", region: "hk_mo_tw", project_type: "shopping_mall", operating_area: 45800 },
  { id: 880116, name: "台商智造园", code: "DEMO-TS-16", region: "east_china", project_type: "industrial_park", operating_area: 77300 },
];

/**
 * @param {object[]} apiProjects
 * @param {boolean} useDemo
 */
export function mergeProjectsForAnalytics(apiProjects, useDemo) {
  if (!useDemo) return Array.isArray(apiProjects) ? apiProjects : [];
  const list = Array.isArray(apiProjects) ? [...apiProjects] : [];
  const seen = new Set(list.map((p) => String(p.id)));
  for (const d of DEMO_PROJECTS) {
    if (!seen.has(String(d.id))) {
      list.push(d);
      seen.add(String(d.id));
    }
  }
  return list;
}

export function projectFinancials(project, year) {
  const s = Number(project.id) * 7919 + Number(year) * 12011;
  const budget = amt(s, 3_200_000, 52_000_000);
  const internal = Math.round(budget * (0.88 + (s % 12) / 200));
  const processDynamic = Math.round(internal * (0.82 + (s % 9) / 100));
  const actual = Math.round(processDynamic * (0.9 + (s % 7) / 100));
  const area =
    project.operating_area != null && !Number.isNaN(Number(project.operating_area))
      ? Math.max(1, Number(project.operating_area))
      : amt(s + 3, 5_500, 125_000);
  const unitBudget = budget / area;
  const unitInternal = internal / area;
  const unitProcess = processDynamic / area;
  return {
    budget,
    internal,
    processDynamic,
    actual,
    area,
    unitBudget,
    unitInternal,
    unitProcess,
  };
}

/** 一类科目（根科目）预算汇总 */
export function budgetByRootSubject(rootSubjects, projects, year) {
  return rootSubjects.map((sub, idx) => {
    let sum = 0;
    for (const p of projects) {
      const s = Number(p.id) * 7919 + Number(year) * 12011 + sub.id * 17;
      sum += amt(s, 80_000, 4_200_000);
    }
    return { name: sub.name, value: sum };
  });
}

/** 月份序列：与过程管控页一致 0=2025-12 … 11=2026-11 */
export function periodYearMonth(monthIndex) {
  const d = new Date(2025, 11 + monthIndex, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

export function monthlyTrend(year, seedBase) {
  const rows = [];
  for (let mi = 0; mi < 12; mi++) {
    const s = seedBase + mi * 104729;
    const { y, m } = periodYearMonth(mi);
    const label = `${y}-${String(m).padStart(2, "0")}`;
    rows.push({
      month: label,
      budget: amt(s, 1_200_000, 8_200_000),
      internal: amt(s + 1, 1_000_000, 7_500_000),
      process: amt(s + 2, 900_000, 7_000_000),
    });
  }
  return rows;
}

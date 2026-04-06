/**
 * 按 class.json 科目树将行预算拆到叶子节点，并生成可递归展示的节点数据。
 */

/** 取 class.json 顶层科目（一级），用于表格 mock、筛选与名称对齐 */
export function getRootSubjectsFromClass(classRoots) {
  if (!Array.isArray(classRoots)) return [];
  return classRoots
    .filter((n) => n && n.id != null)
    .map((n) => ({ id: Number(n.id), name: String(n.name ?? "") }));
}

export function normalizeChildren(node) {
  if (!node || node.id == null) return [];
  const ch = node.children;
  if (!Array.isArray(ch)) return [];
  return ch.filter((c) => c && c.id != null);
}

export function findNodeById(nodes, id) {
  const target = Number(id);
  for (const n of nodes) {
    if (Number(n.id) === target) return n;
    const ch = normalizeChildren(n);
    if (ch.length) {
      const found = findNodeById(ch, id);
      if (found) return found;
    }
  }
  return null;
}

function collectLeafNodes(node, acc) {
  const ch = normalizeChildren(node);
  if (ch.length === 0) {
    acc.push(node);
    return;
  }
  for (const c of ch) collectLeafNodes(c, acc);
}

function randInt(min, max, seed) {
  const x = Math.sin(seed) * 10000;
  const r = x - Math.floor(x);
  return Math.floor(min + r * (max - min + 1));
}

/**
 * @param {object} record - 表格行：projectId, year, baseSubjectId, budgetAmount, key
 * @param {Array} classRoots - class.json 根数组
 * @returns {{ key: string, name: string, amount: number, children: object[] }[]}
 */
export function buildBudgetSubjectNodesFromClass(record, classRoots) {
  const total = Number(record.budgetAmount) || 0;
  const baseId = Number(record.baseSubjectId);
  const root = findNodeById(classRoots, baseId);
  if (!root) return [];

  const seed =
    Number(record.projectId) * 100000 +
    Number(record.year) * 1000 +
    baseId * 17;

  const leaves = [];
  collectLeafNodes(root, leaves);
  if (leaves.length === 0) {
    leaves.push(root);
  }

  const weights = leaves.map((leaf) => randInt(8, 40, seed + Number(leaf.id)));
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const leafAmounts = new Map();
  let used = 0;
  leaves.forEach((leaf, i) => {
    const isLast = i === leaves.length - 1;
    const amt = isLast ? total - used : Math.round((total * weights[i]) / wSum);
    used += amt;
    leafAmounts.set(Number(leaf.id), amt);
  });

  const rowKey = String(record.key ?? `${record.projectId}_${record.year}_${record.baseSubjectId}`);

  function buildNode(n, depth = 1) {
    const id = Number(n.id);
    const ch = normalizeChildren(n);
    if (ch.length === 0) {
      return {
        key: `${rowKey}-subj-${id}`,
        name: String(n.name ?? ""),
        amount: leafAmounts.get(id) ?? 0,
        depth,
        children: [],
      };
    }
    const childBuilt = ch.map((c) => buildNode(c, depth + 1));
    const amount = childBuilt.reduce((s, c) => s + c.amount, 0);
    return {
      key: `${rowKey}-subj-${id}`,
      name: String(n.name ?? ""),
      amount,
      depth,
      children: childBuilt,
    };
  }

  return [buildNode(root, 1)];
}

/**
 * 搜索过滤后，用子节点金额自下而上重算父节点，避免「父金额 ≠ 可见子金额之和」
 */
export function recalcAmountsUpward(nodes) {
  function walk(n) {
    if (!n.children || n.children.length === 0) {
      return {
        ...n,
        amount: Number(n.amount) || 0,
        children: [],
      };
    }
    const newChildren = n.children.map(walk);
    const sum = newChildren.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { ...n, amount: sum, children: newChildren };
  }
  return nodes.map(walk);
}

export function filterBudgetSubjectNodes(nodes, keyword) {
  const q = String(keyword ?? "").trim().toLowerCase();
  if (!q) return nodes;

  function walk(n) {
    const nameMatch = String(n.name).toLowerCase().includes(q);
    if (nameMatch) return { ...n };
    const ch = (n.children || []).map(walk).filter(Boolean);
    if (ch.length) return { ...n, children: ch };
    return null;
  }

  const filtered = nodes.map(walk).filter(Boolean);
  return recalcAmountsUpward(filtered);
}

export function collectAllKeys(nodes, acc = []) {
  for (const n of nodes) {
    acc.push(n.key);
    if (n.children && n.children.length) collectAllKeys(n.children, acc);
  }
  return acc;
}

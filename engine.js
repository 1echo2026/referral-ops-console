'use strict';

/**
 * 取数引擎
 * 职责：把上传的原始底表 -> 按「字段映射」标准化 -> 按工号匹配最新销售架构
 *      -> 按指标口径聚合 -> 输出看板所需的多维结果。
 * 说明：映射与指标口径全部来自数据集配置，修改配置后无需重新上传即可重算。
 */

function pad(n) { return String(n).padStart(2, '0'); }

function normDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 60000) {
    // Excel 序列号日期
    const ms = Math.round((value - 25569) * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return s;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/[,\s¥￥%]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function buildOrgIndex(org) {
  const map = new Map();
  (org || []).forEach((rec) => {
    if (!rec.empId) return;
    const key = String(rec.empId).trim().toUpperCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(rec);
  });
  map.forEach((list) => list.sort((a, b) => String(a.effectiveDate || '').localeCompare(String(b.effectiveDate || ''))));
  return map;
}

function resolveOrg(index, empId, date) {
  const list = index.get(String(empId || '').trim().toUpperCase());
  if (!list || !list.length) return null;
  let picked = list[0];
  for (const rec of list) {
    if (!date || String(rec.effectiveDate || '') <= date) picked = rec;
  }
  return picked;
}

/** 基地名匹配：支持简称（成都 -> 成都基地）、全名与编码 */
function matchBase(baseList, raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const list = baseList || [];
  // 1) 精确：全名或编码
  let hit = list.find((b) => b.name === s || b.code === s.toUpperCase());
  if (hit) return hit.id;
  // 2) 去掉「基地」后缀后精确比较
  const norm = (x) => String(x || '').trim().replace(/基地$/, '');
  const sn = norm(s);
  if (sn) {
    hit = list.find((b) => norm(b.name) === sn);
    if (hit) return hit.id;
  }
  // 3) 双向包含兜底：双方去后缀后都 >= 2 字符，且唯一命中才采纳（避免含糊基地误匹配）
  const cands = list.filter((b) => {
    const bn = norm(b.name);
    return sn.length >= 2 && bn.length >= 2 && (bn.includes(sn) || sn.includes(bn));
  });
  return cands.length === 1 ? cands[0].id : '';
}

function filterMatch(row, filter) {
  if (!filter || !filter.field) return true;
  const raw = row[filter.field];
  const val = filter.value;
  const s = raw === null || raw === undefined ? '' : String(raw);
  const op = filter.op || 'eq';
  switch (op) {
    case 'eq': return s === String(val ?? '');
    case 'neq': return s !== String(val ?? '');
    case 'in': return String(val ?? '').split('|').map((x) => x.trim()).includes(s);
    case 'notin': return !String(val ?? '').split('|').map((x) => x.trim()).includes(s);
    case 'contains': return s.includes(String(val ?? ''));
    case 'notEmpty': return s !== '';
    case 'empty': return s === '';
    case 'gt': return toNumber(raw) > toNumber(val);
    case 'gte': return toNumber(raw) >= toNumber(val);
    case 'lt': return toNumber(raw) < toNumber(val);
    case 'lte': return toNumber(raw) <= toNumber(val);
    default: return true;
  }
}

function pick(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/** 文本占位符归一：源表常用 / - — 表示空缺 */
function cleanText(value) {
  const s = String(value == null ? '' : value).trim();
  return (s === '/' || s === '-' || s === '—' || s === '无') ? '' : s;
}

/** 原始行 -> 标准行（按映射 + 架构匹配） */
function standardize(raw, dataset, ctx) {
  const map = dataset.mapping || {};
  const get = (stdKey) => {
    const col = map[stdKey];
    let v = col ? pick(raw, col) : undefined;
    // 兼容：底表本身已使用标准列名 / 或映射列被改名
    if (v === undefined || v === null || v === '') v = pick(raw, stdKey);
    if (v === undefined || v === null) {
      const field = (dataset.standardFields || []).find((f) => f.key === stdKey);
      if (field) v = pick(raw, field.label);
    }
    return v === undefined || v === null ? '' : v;
  };
  const date = normDate(get('date'));
  const empId = String(get('empId') || '').trim();
  const org = resolveOrg(ctx.orgIndex, empId, date);
  const baseNameRaw = String(get('base') || (org && ctx.baseMap[org.baseId] ? ctx.baseMap[org.baseId].name : '') || '').trim();
  let baseId = org ? org.baseId : '';
  if (!baseId) baseId = matchBase(ctx.baseList, baseNameRaw);
  const baseName = ctx.baseMap[baseId] ? ctx.baseMap[baseId].name : baseNameRaw || '未匹配基地';
  const row = {
    date,
    month: date ? date.slice(0, 7) : '',
    baseId,
    baseName,
    empId,
    empName: String(get('empName') || (org ? org.name : '') || ''),
    managerId: org ? org.managerId || org.empId : '',
    managerName: org ? (org.managerName || (org.level === '高经' ? org.name : '')) : cleanText(get('managerName')),
    teamName: org ? (org.teamName || '未分组') : '未匹配架构',
    level: org ? org.level : '',
    status: String(get('status') || ''),
    channel: String(get('channel') || ''),
    customer: String(get('customer') || ''),
    phone: String(get('phone') || ''),
    amount: toNumber(get('amount')),
    matched: !!org
  };
  // 自定义标准字段（如高潜名单的新体验/新正价用户数）：按字段类型展开，供 sum/avg 指标使用
  const FIXED = { date: 1, base: 1, empId: 1, empName: 1, customer: 1, phone: 1, status: 1, channel: 1, amount: 1 };
  (dataset.standardFields || []).forEach((f) => {
    if (!f || !f.key || FIXED[f.key] || f.key in row) return;
    const v = get(f.key);
    row[f.key] = f.type === 'number' ? toNumber(v) : f.type === 'date' ? normDate(v) : String(v == null ? '' : v);
  });
  return row;
}

const SAFE_EXPR = /^[0-9a-zA-Z_+\-*/().\s]+$/;

function evalFormula(formula, values) {
  if (!formula || !SAFE_EXPR.test(formula)) return null;
  const ids = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  for (const id of ids) {
    if (!(id in values) || values[id] === null || values[id] === undefined) return null;
  }
  const expr = formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (id) => `(${Number(values[id])})`);
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return (${expr});`)();
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

function computeMetrics(metrics, rows) {
  const out = {};
  const pending = [];
  (metrics || []).forEach((m) => {
    if (m.type === 'ratio') { pending.push(m); return; }
    let subset = rows;
    if (m.filter && m.filter.field) subset = rows.filter((r) => filterMatch(r, m.filter));
    switch (m.type) {
      case 'count': out[m.key] = subset.length; break;
      case 'distinct': out[m.key] = new Set(subset.map((r) => r[m.field]).filter((v) => v !== '' && v !== undefined && v !== null)).size; break;
      case 'sum': out[m.key] = subset.reduce((a, r) => a + toNumber(r[m.field]), 0); break;
      case 'avg': {
        const list = subset.map((r) => toNumber(r[m.field])).filter((v) => v !== 0);
        out[m.key] = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
        break;
      }
      default: out[m.key] = subset.length;
    }
  });
  pending.forEach((m) => { out[m.key] = evalFormula(m.formula, out); });
  return out;
}

function groupBy(rows, keyFn, metrics) {
  const buckets = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') return;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  });
  const list = [];
  buckets.forEach((items, key) => {
    list.push({ key, metrics: computeMetrics(metrics, items), count: items.length });
  });
  return list;
}

function withinDate(row, from, to) {
  if (!from && !to) return true;
  if (!row.date) return false;
  if (from && row.date < from) return false;
  if (to && row.date > to) return false;
  return true;
}

/**
 * 主入口
 * @param {object} dataset 数据集配置（含 mapping / metrics）
 * @param {Array} rawRows 原始底表行
 * @param {object} ctx { org, bases }
 * @param {object} filters { baseId, managerId, from, to, empId }
 */
function aggregate(dataset, rawRows, ctx, filters = {}) {
  const rows = (rawRows || []).map((r) => standardize(r, dataset, ctx));
  const inRange = rows.filter((r) => withinDate(r, filters.from, filters.to));
  const scoped = inRange.filter((r) => {
    if (filters.baseId && filters.baseId !== 'all' && r.baseId !== filters.baseId) return false;
    if (filters.managerId && filters.managerId !== 'all' && r.managerId !== filters.managerId) return false;
    if (filters.empId && filters.empId !== 'all' && r.empId !== filters.empId) return false;
    if (filters.status && filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.channel && filters.channel !== 'all' && r.channel !== filters.channel) return false;
    return true;
  });
  const metrics = dataset.metrics || [];
  return {
    total: computeMetrics(metrics, scoped),
    rows: scoped.length,
    unmatched: scoped.filter((r) => !r.matched).length,
    byBase: groupBy(scoped, (r) => r.baseId, metrics),
    byManager: groupBy(scoped, (r) => r.managerId || r.managerName, metrics),
    byTeam: groupBy(scoped, (r) => r.teamName, metrics),
    byMonth: groupBy(scoped, (r) => r.month, metrics).sort((a, b) => a.key.localeCompare(b.key)),
    byStatus: groupBy(scoped, (r) => r.status || '未填', metrics).sort((a, b) => b.count - a.count),
    byChannel: groupBy(scoped, (r) => r.channel || '未填', metrics).sort((a, b) => b.count - a.count),
    byEmp: groupBy(scoped, (r) => r.empId, metrics).sort((a, b) => b.count - a.count)
  };
}

function periodOf(date) { return date ? date.slice(0, 7) : ''; }

function getPeriods(from, to) {
  if (!from && !to) return null;
  const list = [];
  const startStr = (from || to).slice(0, 7);
  const endStr = (to || from).slice(0, 7);
  let [y, m] = startStr.split('-').map(Number);
  const [ey, em] = endStr.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    list.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (list.length > 36) break;
  }
  return list;
}

function targetSum(targets, { metric, scope, keys, from, to }) {
  const periods = getPeriods(from, to);
  let total = 0;
  let hit = 0;
  (targets || []).forEach((t) => {
    if (t.metric !== metric) return;
    if (scope && t.scope !== scope) return;
    if (keys && keys.length && !keys.includes(t.key)) return;
    if (periods && !periods.includes(t.period)) return;
    total += toNumber(t.value);
    hit += 1;
  });
  return hit ? total : null;
}

module.exports = {
  normDate, toNumber, buildOrgIndex, resolveOrg, standardize, computeMetrics,
  aggregate, filterMatch, targetSum, getPeriods, periodOf, matchBase
};

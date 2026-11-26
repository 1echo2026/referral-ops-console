'use strict';

/**
 * 飞书多维表格同步（只读拉取）
 * 参考实现：referral-dashboard/feishu.js，适配本项目的动态数据集（standardFields + mapping）模型。
 * 用法：由 server.js 调用；凭据与 tableId 配置存放在 db.settings.feishu，前端永不接触 App Secret。
 */

const API_BASE = process.env.FEISHU_BASE_URL || 'https://open.feishu.cn/open-apis';

/* ---------- 值规范化（来自飞书单元格的各种形态） ---------- */

function asText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('、');
  if (typeof value === 'object') {
    if (value.text !== undefined) return asText(value.text);
    if (value.name !== undefined) return asText(value.name);
    if (value.value !== undefined) return asText(value.value);
    if (value.link !== undefined) return asText(value.link);
  }
  return String(value);
}

function asNumber(value) {
  if (typeof value === 'number') return value;
  const num = Number(asText(value).replace(/[,，¥￥\s]/g, ''));
  return Number.isFinite(num) ? num : '';
}

function asDate(value) {
  if (typeof value === 'number' && value > 1e11) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const pad = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  const text = asText(value);
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return text;
}

/** 表头规范化：去空格 / 括号备注 / 冒号星号 */
function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[：:*＊]/g, '')
    .trim();
}

/** 基地名归一：匹配系统基地表（名称 / 编码 / 去掉「基地」后缀） */
function normalizeBase(value, bases) {
  const text = asText(value).trim();
  if (!text) return '';
  const hit = (bases || []).find((b) =>
    b.name === text || b.code === text.toUpperCase() ||
    b.name === `${text}基地` || b.name.replace('基地', '') === text
  );
  if (hit) return hit.name;
  const partial = (bases || []).find((b) => text.includes(b.name) || b.name.includes(text) || text.toUpperCase().includes(b.code));
  return partial ? partial.name : text;
}

/** 数据集字段映射：飞书表头 -> 标准字段 key（按 label / key / 常用别名的规范化匹配） */
function buildFieldMap(ds) {
  const map = {};
  const BASE_ALIASES = ['基地', '基地名称', '所属基地', '城市', '基地/城市'];
  (ds.standardFields || []).forEach((f) => {
    const names = [f.label, f.key, ...(f.aliases || [])].filter(Boolean);
    names.forEach((n) => { map[normalizeHeader(n)] = f.key; });
    // phone 常见别名
    if (f.key === 'phone') ['手机号', '手机', '电话', '联系电话', '客户手机号'].forEach((n) => { map[normalizeHeader(n)] = 'phone'; });
    if (f.key === 'customer') ['客户姓名', '客户', '家长', '学员姓名'].forEach((n) => { map[normalizeHeader(n)] = 'customer'; });
    if (f.key === 'empId') ['工号', '员工工号', '销售工号'].forEach((n) => { map[normalizeHeader(n)] = 'empId'; });
    if (f.key === 'empName') ['姓名', '销售', '销售姓名', '员工姓名'].forEach((n) => { map[normalizeHeader(n)] = 'empName'; });
    if (f.key === 'status') ['跟进状态', '跟进结果', '状态', '转化状态'].forEach((n) => { map[normalizeHeader(n)] = 'status'; });
    if (f.key === 'date') ['日期', '转介绍日期', '跟进日期', '成交日期', '分配日期'].forEach((n) => { map[normalizeHeader(n)] = 'date'; });
    if (f.key === 'amount') ['金额', '转化金额', '成交金额', '累计金额'].forEach((n) => { map[normalizeHeader(n)] = 'amount'; });
  });
  BASE_ALIASES.forEach((n) => { if (!map[normalizeHeader(n)]) map[normalizeHeader(n)] = 'base'; });
  return map;
}

/** 飞书记录 -> 标准记录（std key -> 值），再交给 server 的 rawRowFromRecord 写回底表 */
function normalizeRecords(ds, records, bases) {
  const fieldMap = buildFieldMap(ds);
  const types = {};
  (ds.standardFields || []).forEach((f) => { types[f.key] = f.type; });
  const out = [];
  for (const record of records) {
    const fields = record.fields || record || {};
    const rec = {};
    for (const [field, value] of Object.entries(fields)) {
      const key = fieldMap[normalizeHeader(field)];
      if (!key || rec[key] !== undefined) continue;
      if (key === 'base') rec.base = normalizeBase(value, bases);
      else if (types[key] === 'number') { const n = asNumber(value); if (n !== '') rec[key] = n; }
      else if (types[key] === 'date') { const d = asDate(value); if (d) rec[key] = d; }
      else { const t = asText(value); if (t) rec[key] = t; }
    }
    if (!Object.keys(rec).length) continue;
    out.push(rec);
  }
  return out;
}

/* ---------- 飞书 OpenAPI ---------- */

async function getToken(cfg) {
  const res = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`飞书鉴权失败：${data.msg || res.status}`);
  }
  return data.tenant_access_token;
}

async function fetchRecords(token, appToken, tableId) {
  let pageToken = '';
  const records = [];
  for (let guard = 0; guard < 50; guard++) {
    const params = new URLSearchParams({ page_size: '500' });
    if (pageToken) params.set('page_token', pageToken);
    const res = await fetch(
      `${API_BASE}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.code !== 0) throw new Error(`读取飞书数据表失败：${data.msg || res.status}`);
    records.push(...(data.data?.items || []));
    if (!data.data?.has_more) break;
    pageToken = data.data.page_token || '';
    if (!pageToken) break;
  }
  return records;
}

/** 列出多维表格下的全部数据表（辅助后台挑选 tableId） */
async function listTables(cfg) {
  const token = await getToken(cfg);
  const tables = [];
  let pageToken = '';
  for (let guard = 0; guard < 20; guard++) {
    const params = new URLSearchParams({ page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);
    const res = await fetch(`${API_BASE}/bitable/v1/apps/${encodeURIComponent(cfg.appToken)}/tables?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.code !== 0) throw new Error(`读取飞书数据表列表失败：${data.msg || res.status}`);
    tables.push(...(data.data?.items || []).map((t) => ({ tableId: t.table_id, name: t.name })));
    if (!data.data?.has_more) break;
    pageToken = data.data.page_token || '';
    if (!pageToken) break;
  }
  return tables;
}

module.exports = { normalizeHeader, normalizeBase, normalizeRecords, getToken, fetchRecords, listTables, API_BASE };

'use strict';

/**
 * 转介绍数据看板 · 运营中台
 * 零依赖 Node 服务：静态资源 + JSON 文件存储 + 取数 API
 * 启动：node server.js  （默认 http://localhost:5600）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const engine = require('./engine');
const feishu = require('./feishu');
const { buildSeed } = require('./seed');

const PORT = Number(process.env.PORT || 5600);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------------- 存储 ---------------- */

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

let db = null;
let saveTimer = null;

function loadDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      initDefaults();
      return db;
    } catch (e) {
      console.error('[db] 读取失败，将重新生成演示数据', e.message);
    }
  }
  db = buildSeed();
  db.accounts.forEach((a) => { a.password = hash(a.password); });
  initDefaults();
  saveDb(true);
  console.log('[db] 已生成演示数据：', DB_FILE);
  return db;
}

/* ---------------- 兼容初始化 / 展示配置 / 版本 ---------------- */

const VERSIONS_DIR = path.join(DATA_DIR, 'versions');
const VERSION_KEEP = 20;
const RECORD_COLUMNS = ['customer', 'phone', 'base', 'status', 'channel', 'empName', 'date'];

/** 自建底表的标准字段默认集（与 seed 内置底表一致，保证 autoMatch 与引擎直接可用） */
const DEFAULT_STANDARD_FIELDS = [
  { key: 'date', label: '日期', type: 'date', required: true },
  { key: 'base', label: '基地', type: 'text', required: true },
  { key: 'empId', label: '工号', type: 'text', required: true },
  { key: 'empName', label: '姓名', type: 'text', required: false },
  { key: 'customer', label: '客户姓名', type: 'text', required: false },
  { key: 'phone', label: '客户手机号', type: 'text', required: false },
  { key: 'status', label: '跟进状态', type: 'enum', required: false },
  { key: 'channel', label: '渠道', type: 'text', required: false },
  { key: 'amount', label: '金额', type: 'number', required: false }
];

/** 底表模板预设：新建底表时可直接套用（字段 label 与源文件列头逐字一致，便于自动映射） */
const PRESETS = {
  highpot: {
    name: '高潜名单汇总',
    category: '业绩类',
    icon: 'spark',
    tone: 'violet',
    desc: '每人一行的高潜客户汇总：新体验/新正价用户数量与累计金额，含高经/经理/主管/组长层级',
    standardFields: [
      { key: 'oldUserId', label: '老用户ID', type: 'text', required: false },
      { key: 'newExp', label: '新体验用户数量', type: 'number', required: false },
      { key: 'newPay', label: '新正价用户数量', type: 'number', required: false },
      { key: 'amount', label: '累计金额', type: 'number', required: false },
      { key: 'empName', label: '销售/辅导名字', type: 'text', required: true, aliases: ['姓名', '销售名字', '辅导名字', '销售'] },
      { key: 'empId', label: '工号', type: 'text', required: true, aliases: ['员工工号', '员工编号'] },
      { key: 'base', label: '基地', type: 'text', required: true, aliases: ['基地名称', '所属基地'] },
      { key: 'managerName', label: '高经', type: 'text', required: false, aliases: ['高级经理'] },
      { key: 'manager2', label: '经理', type: 'text', required: false },
      { key: 'manager3', label: '主管', type: 'text', required: false },
      { key: 'manager4', label: '组长', type: 'text', required: false }
    ],
    metrics: [
      { key: 'list', name: '记录数', type: 'count', field: '', filter: null, unit: '条', format: 'int', scope: 'base', desc: '底表行数（每人一行汇总）' },
      { key: 'newExp', name: '新体验用户', type: 'sum', field: 'newExp', filter: null, unit: '人', format: 'int', scope: 'base', desc: '新体验用户数量求和' },
      { key: 'newPay', name: '新正价用户', type: 'sum', field: 'newPay', filter: null, unit: '人', format: 'int', scope: 'base', desc: '新正价用户数量求和' },
      { key: 'amount', name: '累计金额', type: 'sum', field: 'amount', filter: null, unit: '元', format: 'money', scope: 'base', desc: '累计金额求和' }
    ]
  },
  koc: {
    name: 'KOC用户高潜名单',
    category: '线索类',
    icon: 'spark',
    tone: 'violet',
    desc: '历史累计与26年转介绍两段上传，按工号合并为一人一行，自动分层并标记重合',
    standardFields: [
      { key: 'oldUserId', label: '老用户ID', type: 'text', required: false },
      { key: 'empId', label: '工号', type: 'text', required: true, aliases: ['员工工号', '员工编号', '顾问工号'] },
      { key: 'empName', label: '姓名', type: 'text', required: true, aliases: ['销售/辅导名字', '销售名字', '辅导名字', '员工姓名', '名字'] },
      { key: 'base', label: '基地', type: 'text', required: true, aliases: ['基地名称', '所属基地', '城市'] },
      { key: 'managerName', label: '高经', type: 'text', required: false, aliases: ['高级经理'] },
      { key: 'manager2', label: '经理', type: 'text', required: false },
      { key: 'manager3', label: '主管', type: 'text', required: false },
      { key: 'manager4', label: '组长', type: 'text', required: false },
      { key: 'cumExp', label: '累计新体验用户数量', type: 'number', required: false, segment: 'cum' },
      { key: 'cumPay', label: '累计新正价用户数量', type: 'number', required: false, segment: 'cum' },
      { key: 'amount', label: '累计金额', type: 'number', required: false, segment: 'cum', aliases: ['金额', '总金额'] },
      { key: 'y26Exp', label: '26年新体验用户数量', type: 'number', required: false, segment: 'y26' },
      { key: 'y26Pay', label: '26年新正价用户数量', type: 'number', required: false, segment: 'y26' },
      { key: 'y26Amount', label: '26年金额', type: 'number', required: false, segment: 'y26' },
      { key: 'status', label: 'KOC层级', type: 'enum', required: false, computed: true },
      { key: 'overlapNote', label: '重合备注', type: 'text', required: false, computed: true }
    ],
    metrics: [
      { key: 'list', name: '名单总人数', type: 'count', field: '', filter: null, unit: '人', format: 'int', scope: 'base', desc: '底表全部行数（含未入选）' },
      { key: 'tierA', name: '历史累计≥6人', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '历史累计≥6' }, unit: '人', format: 'int', scope: 'base', desc: '累计新正价≥6 的用户数' },
      { key: 'tierB', name: '历史累计3-6人', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '历史累计3-6' }, unit: '人', format: 'int', scope: 'base', desc: '3≤累计新正价<6 的用户数' },
      { key: 'tierC', name: '26年推荐成功', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '26年推荐成功' }, unit: '人', format: 'int', scope: 'base', desc: '26年新正价>0 且未进入历史名单的用户数' },
      { key: 'overlap', name: '重合人数', type: 'count', field: '', filter: { field: 'overlapNote', op: 'notEmpty', value: '' }, unit: '人', format: 'int', scope: 'base', desc: '历史名单（累计≥3）与26年推荐成功同时命中的用户数' },
      { key: 'cumPay', name: '历史累计新正价', type: 'sum', field: 'cumPay', filter: null, unit: '人', format: 'int', scope: 'base', desc: '累计新正价用户数量求和' },
      { key: 'y26Pay', name: '26年新正价', type: 'sum', field: 'y26Pay', filter: null, unit: '人', format: 'int', scope: 'base', desc: '26年新正价用户数量求和' }
    ]
  }
};

function defaultSettings() {
  return {
    title: '转介绍数据看板',
    subtitle: '基地经营 · 转介绍名单与转化',
    announcement: '',
    dataNote: '数据来源于各基地上传的转介绍底表；姓名与手机号在前台已脱敏。',
    kpiToggles: {},
    recordColumns: [...RECORD_COLUMNS],
    rankingsNote: '',
    feishu: { appId: '', appSecret: '', appToken: '', autoSyncMinutes: 0, tableIds: {}, lastSync: null }
  };
}

function initDefaults() {
  if (!db.settings) db.settings = defaultSettings();
  if (!db.settings.feishu) db.settings.feishu = defaultSettings().feishu;
  ['appId', 'appSecret', 'appToken'].forEach((k) => { if (typeof db.settings.feishu[k] !== 'string') db.settings.feishu[k] = ''; });
  if (!db.settings.feishu.tableIds || typeof db.settings.feishu.tableIds !== 'object') db.settings.feishu.tableIds = {};
  if (!db.settings.feishu.lastSync) db.settings.feishu.lastSync = null;
  if (!Array.isArray(db.versions)) db.versions = [];
  if (!('activeVersionId' in db)) db.activeVersionId = '';
  db.bases.forEach((b) => { if (!b.status) b.status = 'active'; });
  if (!Array.isArray(db.tutor)) db.tutor = [];
  if (!db.followups || typeof db.followups !== 'object' || Array.isArray(db.followups)) db.followups = {};
  // 高经团队归属配置：selections=经理勾选映射（按高经持久化），nullRules=经理列 null 的归属规则（按数据源分开）
  if (!db.gjTeam || typeof db.gjTeam !== 'object') db.gjTeam = {};
  if (!db.gjTeam.selections || typeof db.gjTeam.selections !== 'object') db.gjTeam.selections = {};
  if (!Array.isArray(db.gjTeam.nullRules)) {
    db.gjTeam.nullRules = [
      { id: 'nr_seed_hf_ys', source: 'ys', base: '合肥', targetName: '李杰', targetEmpId: 'H24738', enabled: true, by: '预置', at: '', note: '直推业绩：合肥经理列=null 归李杰' }
    ];
  }
  ensureWindowDatasets();
  if (!fs.existsSync(VERSIONS_DIR)) fs.mkdirSync(VERSIONS_DIR, { recursive: true });
  // 首次启动：发布初始版本，便于前台显示版本号
  if (!db.versions.length) {
    publishVersion(null, '初始版本');
  }
}

function versionFile(id) {
  return path.join(VERSIONS_DIR, `${id}.json`);
}

/** 数据底表 8 上传窗口所需固定底表：缺失自动补建（不覆盖已有数据），并迁移旧名称 */
function ensureWindowDatasets() {
  const winDefs = [
    {
      id: 'ds_youshu', name: '有数业绩完成度', preset: '', category: '业绩类', icon: 'wallet', tone: 'green',
      desc: '有数系统导出的一线业绩明细：按工号累计转化金额，用于一线直推业绩排名与团队完成度',
      standardFields: [
        { key: 'month', label: '月份', type: 'text', required: true, aliases: ['统计月份', '日期', '时间', '分配月份'] },
        { key: 'base', label: '基地', type: 'text', required: false, aliases: ['基地名称', '所属基地'] },
        { key: 'empName', label: '姓名', type: 'text', required: false, aliases: ['员工姓名', '销售名字', '名字'] },
        { key: 'empId', label: '工号', type: 'text', required: true, aliases: ['员工工号', '员工编号'] },
        { key: 'amount', label: '转化金额', type: 'number', required: true, aliases: ['金额', '业绩', '成交金额'] },
        { key: 'refund', label: '退款金额', type: 'number', required: false, aliases: ['退款', '退费金额'] }
      ],
      metrics: [
        { key: 'list', name: '记录数', type: 'count', field: '', filter: null, unit: '条', format: 'int', scope: 'base', desc: '底表行数' },
        { key: 'amount', name: '转化金额', type: 'sum', field: 'amount', filter: null, unit: '元', format: 'money', scope: 'base', desc: '转化金额求和' }
      ]
    },
    {
      id: 'ds_qc', name: '质检台账', preset: '', category: '过程类', icon: 'phone', tone: 'amber',
      desc: '当期触发质检的人员台账：龙珠奖等激励计算前剔除',
      standardFields: [
        { key: 'month', label: '月份', type: 'text', required: true, aliases: ['统计月份', '日期', '时间'] },
        { key: 'empId', label: '工号', type: 'text', required: true, aliases: ['员工工号', '员工编号'] },
        { key: 'empName', label: '姓名', type: 'text', required: false, aliases: ['员工姓名', '名字'] },
        { key: 'reason', label: '质检原因', type: 'text', required: false, aliases: ['质检项', '原因'] },
        { key: 'result', label: '处理结果', type: 'text', required: false, aliases: ['结果', '处理状态'] }
      ],
      metrics: [
        { key: 'list', name: '记录数', type: 'count', field: '', filter: null, unit: '条', format: 'int', scope: 'base', desc: '底表行数' }
      ]
    },
    {
      id: 'ds_diamond', name: '钻石商城财务报表', preset: '', category: '业绩类', icon: 'spark', tone: 'violet',
      desc: '钻石发放与消耗流水：匹配已转化老用户，用于钻石未使用名单',
      standardFields: [
        { key: 'userId', label: '用户ID', type: 'text', required: true, aliases: ['老用户ID', '用户id', '客户ID', '账号ID'] },
        { key: 'type', label: '类型', type: 'text', required: false, aliases: ['动作', '业务类型', '发放/消耗'] },
        { key: 'diamonds', label: '钻石数量', type: 'number', required: false, aliases: ['钻石', '数量'] },
        { key: 'amount', label: '金额', type: 'number', required: false, aliases: ['消耗金额', '面值'] },
        { key: 'date', label: '时间', type: 'text', required: false, aliases: ['发放时间', '消耗时间', '日期'] },
        { key: 'note', label: '备注', type: 'text', required: false }
      ],
      metrics: [
        { key: 'list', name: '记录数', type: 'count', field: '', filter: null, unit: '条', format: 'int', scope: 'base', desc: '底表行数' }
      ]
    }
  ];
  let changed = false;
  winDefs.forEach((def) => {
    if (db.datasets.some((d) => d.id === def.id)) return;
    db.datasets.push({
      id: def.id, key: def.id.replace('ds_', 'win_'), name: def.name, preset: def.preset,
      category: def.category, desc: def.desc, icon: def.icon, tone: def.tone,
      columns: def.standardFields.map((f) => f.label),
      standardFields: def.standardFields, mapping: {}, metrics: def.metrics, caliber: '',
      dimensions: ['base', 'manager', 'team', 'month', 'status', 'empId'],
      visibility: { scopeToggle: true, allowManagerDrill: true },
      status: 'ready', rowCount: 0, fileName: '', updatedAt: nowStr(), updatedBy: '系统', history: []
    });
    changed = true;
  });
  const direct = db.datasets.find((d) => d.id === 'ds_direct');
  if (direct && direct.name === '新用户直推未转化明细') {
    direct.name = '转介绍转化跟踪';
    direct.desc = '转介绍转化跟踪明细：a-b-c 绑定关系与转化金额，用于直推未转化与钻石未使用';
    changed = true;
  }
  // 窗口①/⑤ 补 a/b/c 三个可选字段（2.5 方案 B：a=销售UID / b=老用户ID(推荐人) / c=新用户ID(被推荐人)）
  const ABC_FIELDS = [
    { key: 'refA', label: '销售UID（a）', type: 'text', required: false, aliases: ['a', '销售uid', '销售UID'] },
    { key: 'refB', label: '老用户ID（b）', type: 'text', required: false, aliases: ['b', '推荐人ID', '推荐人id', '老用户id'] },
    { key: 'refC', label: '新用户ID（c）', type: 'text', required: false, aliases: ['c', '被推荐人ID', '被推荐人id', '转化userid'] }
  ];
  ['ds_youshu', 'ds_direct'].forEach((id) => {
    const d = db.datasets.find((x) => x.id === id);
    if (d && d.standardFields && !d.standardFields.some((f) => f.key === 'refA')) {
      d.standardFields = [...d.standardFields, ...ABC_FIELDS];
      d.columns = d.standardFields.map((f) => f.label);
      changed = true;
    }
  });
  if (changed) saveDb(true);
}

function publishVersion(user, label) {
  const id = `v_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
  const snapshot = {
    id, label: String(label || `版本 ${new Date().toISOString().slice(0, 10)}`),
    createdAt: nowStr(), createdBy: user ? user.name : '系统',
    rows: db.datasets.reduce((s, d) => s + (db.rows[d.id] || []).length, 0)
  };
  const payload = {
    rows: db.rows,
    datasets: db.datasets.map((d) => ({
      id: d.id, key: d.key, name: d.name, category: d.category, desc: d.desc, icon: d.icon, tone: d.tone,
      columns: d.columns, standardFields: d.standardFields, mapping: d.mapping, metrics: d.metrics,
      caliber: d.caliber, dimensions: d.dimensions, visibility: d.visibility,
      status: d.status, rowCount: d.rowCount, fileName: d.fileName, updatedAt: d.updatedAt, updatedBy: d.updatedBy
    }))
  };
  fs.writeFileSync(versionFile(id), JSON.stringify(payload), 'utf8');
  db.versions.unshift(snapshot);
  db.activeVersionId = id;
  pruneVersions();
  saveDb();
  return snapshot;
}

function pruneVersions() {
  while (db.versions.length > VERSION_KEEP) {
    const removable = [...db.versions].reverse().find((v) => v.id !== db.activeVersionId);
    if (!removable) break;
    db.versions = db.versions.filter((v) => v.id !== removable.id);
    try { fs.unlinkSync(versionFile(removable.id)); } catch (e) { /* 忽略 */ }
  }
}

function activateVersion(id) {
  const meta = db.versions.find((v) => v.id === id);
  if (!meta) return null;
  const payload = JSON.parse(fs.readFileSync(versionFile(id), 'utf8'));
  db.rows = payload.rows || {};
  (payload.datasets || []).forEach((snap) => {
    const ds = datasetById(snap.id);
    if (ds) Object.assign(ds, snap);
  });
  db.activeVersionId = id;
  saveDb();
  return meta;
}

function deleteVersion(id) {
  if (id === db.activeVersionId) return { error: '当前展示版本不可删除' };
  const meta = db.versions.find((v) => v.id === id);
  if (!meta) return { error: '版本不存在' };
  db.versions = db.versions.filter((v) => v.id !== id);
  try { fs.unlinkSync(versionFile(id)); } catch (e) { /* 忽略 */ }
  saveDb();
  return { ok: true };
}

function activeVersion() {
  return db.versions.find((v) => v.id === db.activeVersionId) || null;
}

/* ---------------- 飞书同步 ---------------- */

function feishuConfigChecked() {
  const cfg = db.settings.feishu || {};
  if (!cfg.appId || !cfg.appSecret) return { error: '未配置飞书 App ID / App Secret' };
  if (!cfg.appToken) return { error: '未配置多维表格 app_token（FEISHU_APP_TOKEN）' };
  return { appId: cfg.appId, appSecret: cfg.appSecret, appToken: cfg.appToken };
}

async function runFeishuSync(user, req) {
  const cfg = feishuConfigChecked();
  if (cfg.error) return { error: cfg.error, status: 400 };
  const tableIds = db.settings.feishu.tableIds || {};
  const bound = db.datasets.filter((d) => tableIds[d.id]);
  if (!bound.length) return { error: '尚未为任何数据集绑定飞书数据表', status: 400 };
  let token;
  try {
    token = await feishu.getToken(cfg);
  } catch (e) {
    return { error: e.message, status: 502 };
  }
  const results = {};
  const errors = {};
  for (const ds of bound) {
    try {
      const records = await feishu.fetchRecords(token, cfg.appToken, tableIds[ds.id]);
      const recs = feishu.normalizeRecords(ds, records, db.bases);
      const list = recs.map((rec, i) => {
        const raw = rawRowFromRecord(ds, rec, null);
        raw._rowNo = i + 1;
        return raw;
      });
      db.rows[ds.id] = list;
      ds.rowCount = list.length;
      ds.updatedAt = nowStr();
      ds.updatedBy = '飞书同步';
      ds.status = 'ready';
      ds.fileName = '飞书多维表格';
      results[ds.id] = { name: ds.name, count: list.length };
    } catch (e) {
      errors[ds.id] = { name: ds.name, error: e.message };
    }
  }
  db.settings.feishu.lastSync = {
    at: nowStr(),
    by: user ? user.name : '系统',
    results, errors,
    total: Object.values(results).reduce((s, r) => s + r.count, 0)
  };
  saveDb();
  if (Object.keys(results).length) {
    audit(user, '飞书同步', `同步 ${Object.keys(results).length} 张表 · ${db.settings.feishu.lastSync.total} 行${Object.keys(errors).length ? ` · ${Object.keys(errors).length} 张失败` : ''}`, req);
  }
  return { syncedAt: db.settings.feishu.lastSync.at, results, errors };
}

let feishuTimer = null;
function scheduleFeishuAutoSync() {
  if (feishuTimer) { clearInterval(feishuTimer); feishuTimer = null; }
  const minutes = Number((db.settings.feishu || {}).autoSyncMinutes) || 0;
  if (minutes > 0) {
    feishuTimer = setInterval(() => {
      runFeishuSync(null, null).catch((e) => console.error('[feishu] 自动同步失败：', e.message));
    }, minutes * 60 * 1000);
    feishuTimer.unref();
    console.log(`[feishu] 自动同步已开启：每 ${minutes} 分钟`);
  }
}


/* ---------------- 前台脱敏 ---------------- */

function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.length <= 1) return s + '*';
  if (s.length === 2) return s[0] + '*';
  return s[0] + '*'.repeat(Math.min(2, s.length - 1)) + s[s.length - 1];
}

function maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (!s) return '';
  if (s.length < 7) return s[0] + '****' + s.slice(-1);
  return s.slice(0, 3) + '****' + s.slice(-4);
}

function maskRecord(row) {
  return { ...row, customer: maskName(row.customer), phone: maskPhone(row.phone) };
}

function saveDb(sync) {
  const write = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8');
  };
  if (sync) { clearTimeout(saveTimer); saveTimer = null; write(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 400);
}

/* ---------------- 会话 ---------------- */

const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60 * 12;

/** 会话持久化：db.sessions 落盘，服务重启/重新发布后登录态不丢（避免被弹回登录页） */
function hydrateSessions() {
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  Object.keys(db.sessions).forEach((sid) => {
    const s = db.sessions[sid];
    if (s && s.uid && Date.now() - Number(s.at || 0) <= SESSION_TTL) {
      sessions.set(sid, { uid: s.uid, at: Number(s.at) });
    } else {
      delete db.sessions[sid];
    }
  });
}

function persistSession(sid, s) {
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  if (s) db.sessions[sid] = s; else delete db.sessions[sid];
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.at > SESSION_TTL) {
    sessions.delete(sid);
    persistSession(sid, null);
    saveDb();
    return null;
  }
  s.at = Date.now();
  if (db.sessions && db.sessions[sid]) db.sessions[sid].at = s.at;
  const acc = db.accounts.find((a) => a.id === s.uid);
  if (!acc || acc.status !== 'active') return null;
  return acc;
}

function publicUser(acc) {
  if (!acc) return null;
  const base = db.bases.find((b) => b.id === acc.baseId);
  return {
    id: acc.id, username: acc.username, name: acc.name, role: acc.role,
    title: acc.title, baseId: acc.baseId, baseName: base ? base.name : '',
    scopes: acc.scopes || [], lastLogin: acc.lastLogin || ''
  };
}

function audit(user, action, detail, req) {
  db.audits.unshift({
    at: nowStr(),
    user: user ? user.name : '系统',
    action,
    detail,
    ip: (req && (req.headers['x-forwarded-for'] || req.socket.remoteAddress)) || ''
  });
  if (db.audits.length > 500) db.audits.length = 500;
  saveDb();
}

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- 工具 ---------------- */

function ctxOf() {
  const baseMap = {};
  db.bases.forEach((b) => { baseMap[b.id] = b; });
  return {
    baseMap,
    baseList: db.bases,
    orgIndex: engine.buildOrgIndex(db.org)
  };
}

function datasetById(id) {
  return db.datasets.find((d) => d.id === id) || null;
}

function publicDataset(ds) {
  return {
    id: ds.id, key: ds.key, name: ds.name, category: ds.category, desc: ds.desc,
    icon: ds.icon, tone: ds.tone, columns: ds.columns,
    preset: ds.preset || '',
    standardFields: ds.standardFields, mapping: ds.mapping, metrics: ds.metrics,
    caliber: ds.caliber, dimensions: ds.dimensions, visibility: ds.visibility,
    status: ds.status, rowCount: ds.rowCount, fileName: ds.fileName,
    segments: ds.segments || null,
    kocConfig: ds.preset === 'koc' ? kocCfgOf(ds) : null,
    updatedAt: ds.updatedAt, updatedBy: ds.updatedBy, history: ds.history || []
  };
}

/* ---- KOC 名单：口径分段上传 / 合并 / 自动分层 ---- */
function kocNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** KOC 分层配置（最高层阈值 t1 / 次层阈值 t2 / 各层颜色），未配置时用默认值 */
function kocCfgOf(ds) {
  const c = (ds && ds.kocConfig) || {};
  let t1 = Math.floor(Number(c.t1));
  if (!Number.isFinite(t1) || t1 < 1) t1 = 6;
  let t2 = Math.floor(Number(c.t2));
  if (!Number.isFinite(t2) || t2 < 0) t2 = 3;
  if (t2 >= t1) t2 = t1 - 1;
  return {
    t1, t2,
    colors: Object.assign({ t1: '#e0a93e', t2: '#b48cc8', t3: '#5b9bd5', t4: '#5bbf8a' }, c.colors || {})
  };
}

/** 按 KOC 规则重算每人的层级与重合备注（作用于原始行，写回 KOC层级 / 重合备注 列；阈值可配置） */
function recomputeKocTiers(rows, cfg) {
  const c = cfg || {};
  let t1 = Math.floor(Number(c.t1));
  if (!Number.isFinite(t1) || t1 < 1) t1 = 6;
  let t2 = Math.floor(Number(c.t2));
  if (!Number.isFinite(t2) || t2 < 0) t2 = 3;
  if (t2 >= t1) t2 = t1 - 1;
  const l1 = `历史累计≥${t1}`;
  const l2 = t2 > 0 ? `历史累计${t2}-${t1}` : `历史累计<${t1}`;
  (rows || []).forEach((r) => {
    const cumPay = kocNum(r['累计新正价用户数量']);
    const y26Pay = kocNum(r['26年新正价用户数量']);
    let tier = '未入选';
    if (cumPay >= t1) tier = l1;
    else if (cumPay >= t2) tier = l2;
    else if (y26Pay > 0) tier = '26年推荐成功';
    r['KOC层级'] = tier;
    r['重合备注'] = (cumPay >= t2 && y26Pay > 0) ? '与26年推荐重合' : '';
  });
}

/** KOC 上传统一存储为标准列名（两段上传列名相同，必须归一化后才能合并） */
function canonicalizeKocRows(ds, rows, mapping) {
  const labelOf = {};
  (ds.standardFields || []).forEach((f) => { labelOf[f.key] = f.label; });
  return rows.map((r, i) => {
    const o = { _rowNo: i + 1 };
    Object.keys(mapping || {}).forEach((k) => {
      const label = labelOf[k];
      if (!label) return;
      const v = r[mapping[k]];
      o[label] = v === undefined || v === null ? '' : String(v).trim();
    });
    return o;
  });
}

/** 合并导入：按 工号（兜底 老用户ID）把本次数值并入已有行；找不到的人追加 */
function mergeKocRows(existing, incoming) {
  const idx = new Map();
  existing.forEach((r) => {
    const e = String(r['工号'] ?? '').trim();
    const o = String(r['老用户ID'] ?? '').trim();
    if (e) idx.set('e:' + e, r);
    if (o) idx.set('o:' + o, r);
  });
  let updated = 0;
  const added = [];
  incoming.forEach((r) => {
    const e = String(r['工号'] ?? '').trim();
    const o = String(r['老用户ID'] ?? '').trim();
    const hit = (e && idx.get('e:' + e)) || (o && idx.get('o:' + o)) || null;
    if (hit) {
      updated += 1;
      Object.keys(r).forEach((c) => {
        if (c === '_rowNo') return;
        const v = r[c];
        if (v !== '' && v !== undefined && v !== null) hit[c] = v;
      });
    } else {
      added.push(r);
      if (e) idx.set('e:' + e, r);
      if (o) idx.set('o:' + o, r);
    }
  });
  return { updated, added };
}

/* ---- 业绩底表：销售接例子 / 销售直推 / 订单池 / 直推目标 / 接例子目标 五段上传 ---- */
const PERF_SEGS = ['leads', 'direct', 'orders', 'targetDirectGj', 'targetDirectJl', 'targetLeads'];
const PERF_FIELD_DEFS = {
  leads: [
    { key: 'userId', label: '用户ID', required: true, aliases: ['用户id', '客户id', '老用户id', '账号id', '账号ID', '账号', '客户账号'] },
    { key: 'month', label: '月份', required: false, aliases: ['分配月份', '统计月份', '日期', '分配日期'] },
    { key: 'base', label: '基地', required: false, aliases: ['所属基地'] },
    { key: 'ccId', label: 'CCid', required: false, aliases: ['销售名字', '销售', 'cc', '订单归属人姓名', '订单归属人', '归属人姓名', '归属人'] },
    { key: 'empId', label: '工号', required: false, aliases: ['绑定关系人工号', '销售工号'] }
  ],
  direct: [
    { key: 'month', label: '月份', required: false, aliases: ['统计月份', '日期', '转介绍时间'] },
    { key: 'base', label: '基地', required: false, aliases: ['所属基地'] },
    { key: 'name', label: '绑定关系人姓名', required: true, aliases: ['姓名', '关系人姓名'] },
    { key: 'empId', label: '绑定关系人工号', required: true, aliases: ['工号', '关系人工号'] },
    { key: 'amount', label: '转化金额', required: true, aliases: ['累计转化金额', '累计金额', '成交金额', '金额'] }
  ],
  orders: [
    { key: 'userId', label: '用户ID', required: true, aliases: ['用户id', '客户id', '老用户id', '账号id', '账号ID', '账号', '客户账号'] },
    { key: 'ccId', label: 'CCid', required: false, aliases: ['销售名字', '销售', 'cc', '订单归属人姓名', '订单归属人', '归属人姓名', '归属人'] },
    { key: 'amount', label: '转化金额', required: true, aliases: ['累计转化金额', '成交金额', '金额'] },
    { key: 'status', label: '订单状态', required: false, aliases: ['状态', '退款状态', '退款', '订单状态'] },
    { key: 'month', label: '月份', required: false, aliases: ['统计月份', '日期', '成交日期'] },
    { key: 'base', label: '基地', required: false, aliases: ['所属基地'] }
  ],
  targetDirectGj: [
    { key: 'month', label: '月份', required: true, aliases: ['统计月份', '日期'] },
    { key: 'name', label: '高经', required: true, aliases: ['高经/经理', '姓名', '负责人', '团队', '高经团队'] },
    { key: 'target', label: '直推目标', required: true, aliases: ['目标', '目标金额', '月目标', '高经团队目标'] }
  ],
  targetDirectJl: [
    { key: 'month', label: '月份', required: true, aliases: ['统计月份', '日期'] },
    { key: 'name', label: '经理', required: true, aliases: ['高经/经理', '姓名', '负责人', '团队', '经理团队'] },
    { key: 'target', label: '直推目标', required: true, aliases: ['目标', '目标金额', '月目标', '经理团队目标'] }
  ],
  targetLeads: [
    { key: 'month', label: '月份', required: true, aliases: ['统计月份', '日期'] },
    { key: 'name', label: '高经', required: true, aliases: ['高经/经理', '姓名', '负责人', '团队', '高经团队'] },
    { key: 'target', label: '接例子目标', required: true, aliases: ['目标', '目标金额', '月目标'] }
  ]
};

function perfMonth(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{4})[-/年.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  return s;
}

function perfNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** 业绩各段统一归一化存储，便于后续数透计算 */
function canonicalizePerfRows(segment, rows, mapping) {
  const defs = PERF_FIELD_DEFS[segment] || [];
  const get = (r, f) => {
    const col = (mapping || {})[f.key] || f.label;
    const v = r[col] !== undefined ? r[col] : r[f.key];
    return v === undefined || v === null ? '' : v;
  };
  const out = rows.map((r, i) => {
    const o = { _rowNo: i + 1 };
    defs.forEach((f) => { o[f.key] = String(get(r, f)).trim(); });
    if (o.month) { o.time = String(o.month).trim(); o.month = perfMonth(o.month); }
    if (segment === 'direct' || segment === 'orders') o.amount = perfNum(o.amount);
    if (segment.startsWith('target')) o.target = perfNum(o.target);
    return o;
  });
  if (segment === 'direct') return out.filter((r) => r.empId || r.name);
  if (segment === 'orders') return out.filter((r) => r.userId);
  if (segment === 'leads') return out.filter((r) => r.userId);
  if (segment.startsWith('target')) return out.filter((r) => r.name && r.target > 0);
  return out;
}

/**
 * 业绩排行计算：
 * 一线直推业绩（按工号数透累计转化金额，降序）
 * 直推团队业绩（高经=架构 managerName；经理=架构 manager2；含本人业绩）
 * 接例子业绩（订单池按用户ID数透累计转化金额；仅统计接例子名单里的用户ID；CCid→架构反查基地/高经）
 * 目标匹配：直推目标 / 接例子目标 按月匹配；高经综合 = 直推+接例子
 */
function buildPerfReport(ds) {
  const direct = db.rows[`${ds.id}:direct`] || [];
  const orders = db.rows[`${ds.id}:orders`] || [];
  const leads = db.rows[`${ds.id}:leads`] || [];
  const tGj = db.rows[`${ds.id}:targetDirectGj`] || [];
  const tJl = db.rows[`${ds.id}:targetDirectJl`] || [];
  const tLeads = db.rows[`${ds.id}:targetLeads`] || [];
  const tDirect = [...tGj, ...tJl];

  // 架构映射
  const orgByEmp = {};
  (db.org || []).forEach((o) => { orgByEmp[String(o.empId).toUpperCase()] = o; });
  const baseNameOf = (id) => {
    const b = (db.bases || []).find((x) => x.id === id || x.name === id);
    return b ? b.name : (id || '未匹配');
  };

  // 直推数据源（2.1 取数逻辑）：优先「有数业绩完成度」窗口（按工号数透转化金额，保留基地/姓名/工号）；
  // 该窗口未上传时回退业绩底表直推段
  const ys = db.rows['ds_youshu'] || [];
  const ysRows = (Array.isArray(ys) ? ys : Object.values(ys)).filter((r) => r && (String(r['工号'] || '').trim() || String(r['销售姓名'] || '').trim()));
  const ysMonth = (r) => { const d = engine.normDate(r['下单时间']); return d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : ''; };
  const ysAmount = (r) => engine.toNumber(r['销售直推业绩']);

  // 直推：按工号数透
  const byEmp = {};
  if (ysRows.length) {
    ysRows.forEach((r) => {
      const empId = String(r['工号'] || '').trim();
      const nm = String(r['销售姓名'] || '').trim() || String(r['绑定人工号姓名'] || '').trim();
      const k = (empId || nm).toUpperCase();
      if (!k) return;
      if (!byEmp[k]) byEmp[k] = { empId, name: nm, base: String(r['基地'] || '').trim(), total: 0, byMonth: {} };
      const e = byEmp[k];
      e.total += ysAmount(r);
      const m = ysMonth(r) || '全部';
      e.byMonth[m] = (e.byMonth[m] || 0) + ysAmount(r);
      if (!e.name && nm) e.name = nm;
      if ((!e.base || e.base === '未匹配') && String(r['基地'] || '').trim()) e.base = String(r['基地']).trim();
    });
  } else {
    direct.forEach((r) => {
      const k = String(r.empId || r.name || '').toUpperCase();
      if (!k) return;
      if (!byEmp[k]) byEmp[k] = { empId: r.empId || '', name: r.name || '', base: r.base || '', total: 0, byMonth: {} };
      const e = byEmp[k];
      e.total += r.amount || 0;
      const m = r.month || '全部';
      e.byMonth[m] = (e.byMonth[m] || 0) + (r.amount || 0);
      if (!e.name && r.name) e.name = r.name;
      if ((!e.base || e.base === '未匹配') && r.base) e.base = r.base;
    });
  }
  const frontline = Object.values(byEmp)
    .map((e) => {
      const org = orgByEmp[String(e.empId || '').toUpperCase()];
      return { base: e.base, name: e.name, empId: e.empId, teamName: org ? (org.teamName || '') : '', total: Math.round(e.total * 100) / 100, byMonth: e.byMonth };
    })
    .sort((a, b) => b.total - a.total);
  // 2.1 当月名次：同分并列、不跳号（密排名次：1,2,2,3）
  let rankLastVal = null;
  let rankLast = 0;
  frontline.forEach((e) => {
    if (rankLastVal !== null && e.total === rankLastVal) e.rank = rankLast;
    else { rankLast += 1; rankLastVal = e.total; e.rank = rankLast; }
  });

  // 直推团队：高经(managerName) / 经理(manager2)，含本人；架构同名多条记录按姓名去重
  const teamAgg = (level) => {
    const seen = new Set();
    const leaders = (db.org || []).filter((o) => {
      if (o.level !== level || !o.name || seen.has(o.name)) return false;
      seen.add(o.name);
      return true;
    });
    return leaders.map((o) => {
      const perMonth = {};
      let total = 0;
      Object.values(byEmp).forEach((e) => {
        const org = orgByEmp[String(e.empId).toUpperCase()];
        const isMember = org && (org.empId === o.empId || (level === '高经' ? org.managerName === o.name : org.manager2 === o.name));
        if (!isMember) return;
        Object.entries(e.byMonth).forEach(([m, v]) => { perMonth[m] = (perMonth[m] || 0) + v; });
        total += e.total;
      });
      return { name: o.name, base: baseNameOf(o.baseId), level, total: Math.round(total * 100) / 100, byMonth: perMonth };
    }).sort((a, b) => b.total - a.total);
  };

  // 2.2 团队汇总：有数表自带 高经/经理 归属列，直接按列数透向上汇总；
  // 有数窗口未上传时回退架构向上汇总（teamAgg）
  const ysGroup = (col, level) => {
    const g = {};
    ysRows.forEach((r) => {
      const nm = String(r[col] || '').trim();
      if (!nm || nm === 'null' || nm === 'undefined') return;
      if (!g[nm]) g[nm] = { name: nm, base: '', total: 0, byMonth: {} };
      const t = g[nm];
      t.total += ysAmount(r);
      const m = ysMonth(r) || '全部';
      t.byMonth[m] = (t.byMonth[m] || 0) + ysAmount(r);
      if (!t.base && String(r['基地'] || '').trim()) t.base = String(r['基地']).trim();
    });
    return Object.values(g).map((t) => {
      const org = (db.org || []).find((o) => o.name === t.name && o.level === level);
      return { name: t.name, base: org ? baseNameOf(org.baseId) : (t.base || '未匹配'), level, total: Math.round(t.total * 100) / 100, byMonth: t.byMonth };
    }).sort((a, b) => b.total - a.total);
  };
  const directTeams = ysRows.length
    ? { gj: ysGroup('高经', '高经'), jl: ysGroup('经理', '经理') }
    : { gj: teamAgg('高经'), jl: teamAgg('经理') };

  // 接例子：订单池按用户ID数透 → 仅统计接例子名单命中的用户ID → CCid 反查架构 → 高经
  const orderById = {};
  orders.forEach((r) => {
    const k = String(r.userId || '').trim();
    if (!k) return;
    if (!orderById[k]) orderById[k] = { total: 0, byMonth: {}, ccIds: {} };
    const o = orderById[k];
    o.total += r.amount || 0;
    const m = r.month || '全部';
    o.byMonth[m] = (o.byMonth[m] || 0) + (r.amount || 0);
    if (r.ccId) o.ccIds[r.ccId] = (o.ccIds[r.ccId] || 0) + (r.amount || 0);
  });
  const leadsPerGj = {};
  let leadsUnmatched = 0;
  (leads || []).forEach((r) => {
    const k = String(r.userId || '').trim();
    const hit = orderById[k];
    if (!hit) { leadsUnmatched += 1; return; }
    // CCid 取订单池中金额最高的销售；无 CCid 时回退接例子表的 CCid/工号
    let cc = '', best = -1;
    Object.entries(hit.ccIds).forEach(([n, v]) => { if (v > best) { best = v; cc = n; } });
    if (!cc && r.ccId) cc = r.ccId;
    let gjName = '';
    if (cc) {
      const org = (db.org || []).find((o) => o.name === cc);
      if (org) gjName = org.level === '高经' ? org.name : (org.managerName || '');
    }
    if (!gjName && r.empId && orgByEmp[String(r.empId).toUpperCase()]) {
      const org = orgByEmp[String(r.empId).toUpperCase()];
      gjName = org.level === '高经' ? org.name : (org.managerName || '');
    }
    if (!gjName) { leadsUnmatched += 1; return; }
    if (!leadsPerGj[gjName]) leadsPerGj[gjName] = { total: 0, byMonth: {} };
    Object.entries(hit.byMonth).forEach(([m, v]) => { leadsPerGj[gjName].byMonth[m] = (leadsPerGj[gjName].byMonth[m] || 0) + v; });
    leadsPerGj[gjName].total += hit.total;
  });
  const leadsGj = Object.entries(leadsPerGj).map(([name, v]) => {
    const org = (db.org || []).find((o) => o.name === name);
    return { name, base: org ? baseNameOf(org.baseId) : '未匹配', level: '高经', total: Math.round(v.total * 100) / 100, byMonth: v.byMonth };
  }).sort((a, b) => b.total - a.total);

  const months = [...new Set([
    ...(ysRows.length ? ysRows.map(ysMonth).filter(Boolean) : direct.map((r) => r.month).filter(Boolean)),
    ...orders.map((r) => r.month).filter(Boolean),
    ...tDirect.map((r) => r.month).filter(Boolean),
    ...tLeads.map((r) => r.month).filter(Boolean)
  ])].sort();

  // 接例子未转化：以 leads 分配表为底表，用户ID 在订单池数透累计转化金额为 0（含未命中）即为未转化；
  // 订单池中该用户ID存在「完全退款」状态时打标（仍保留在未转化名单中）
  const refundIds = new Set();
  orders.forEach((r) => {
    const s = String(r.status || '');
    if (s && s.includes('完全退款')) {
      const k = String(r.userId || '').trim();
      if (k) refundIds.add(k);
    }
  });
  const unconverted = (leads || [])
    .filter((r) => {
      const hit = orderById[String(r.userId || '').trim()];
      return !hit || !(hit.total > 0);
    })
    .map((r) => ({
      month: r.month || '',
      time: r.time || '',
      userId: r.userId || '',
      base: r.base || '',
      ccId: r.ccId || '',
      empId: r.empId || '',
      amount: 0,
      refund: refundIds.has(String(r.userId || '').trim())
    }));

  return {
    frontline,
    direct: directTeams,
    directSource: ysRows.length ? '有数业绩完成度' : '业绩底表·直推段',
    leads: { gj: leadsGj },
    targets: {
      direct: [...tGj.map((r) => ({ month: r.month || '全部', name: r.name, target: r.target })), ...tJl.map((r) => ({ month: r.month || '全部', name: r.name, target: r.target }))],
      directGj: tGj.map((r) => ({ month: r.month || '全部', name: r.name, target: r.target })),
      directJl: tJl.map((r) => ({ month: r.month || '全部', name: r.name, target: r.target })),
      leads: tLeads.map((r) => ({ month: r.month || '全部', name: r.name, target: r.target }))
    },
    months,
    unconverted,
    stats: {
      directRows: ysRows.length || direct.length, youshuRows: ysRows.length,
      ordersRows: orders.length, leadsRows: leads.length,
      leadsUnmatched, leadsUsers: (leads || []).length,
      unconvertedCount: unconverted.length,
      refundCount: unconverted.filter((r) => r.refund).length
    }
  };
}

/* ------------------------------------------------------------------ *
 * 2.5 直推未转化（方案 A：按「转介绍转化跟踪」的跟进状态判定）
 * 数据源：窗口⑤ db.rows.ds_direct（中文原始列：日期/基地/工号/姓名/客户姓名/手机号/跟进状态/渠道）
 * 规则：① 按客户手机号去重
 *      ② 同一手机号历史上出现过「已转化」→ 该手机号判已转化（防重复分配误判）
 *      ③ 否则取最新日期那条的状态：跟进中 / 待跟进 → 未转化池，无效号码单列
 * 跟进状态回写：db.followups[phone] = { status, by, at }（独立存储，重传底表不丢）
 * ------------------------------------------------------------------ */
const DUNCV_STATUSES = ['待跟进', '跟进中', '已联系未转化', '已转化', '无效号码', '未转化'];

function buildDirectUncv() {
  const raw = db.rows.ds_direct || [];
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  /* 结构自动识别：有 c/转化userid 列 → 方案 B（a-b-c 口径）；否则方案 A（手机号+跟进状态口径） */
  const modeB = raw.some((r) => r && typeof r === 'object' && (r['c'] != null || r['转化userid'] != null));

  if (modeB) {
    /* 方案 B：按 c（新用户ID）去重，转化金额>0 即已转化；仅统计角色=销售；人工回写仍可修正 */
    const groups = new Map();
    let scanned = 0;
    raw.forEach((r, idx) => {
      if (!r || typeof r !== 'object') return;
      if (r['角色'] != null && g(r, '角色') !== '销售') return;
      const key = g(r, 'c') || g(r, '转化userid');
      if (!key) return;
      scanned += 1;
      const amount = Number(String(g(r, '转化金额')).replace(/,/g, '')) || 0;
      const item = {
        time: g(r, '转介绍日期') || g(r, '转化日期'),
        empId: g(r, '工号'),
        empName: g(r, '姓名'),
        base: g(r, '基地'),
        channel: g(r, '转介绍系统'),
        status: amount > 0 ? '已转化' : '未转化',
        amount,
        order: g(r, '转化订单ID') ? 1 : 0
      };
      const cur = groups.get(key);
      if (!cur) {
        groups.set(key, { phone: key, customer: '', empId: item.empId, empName: item.empName, base: item.base, channel: item.channel, firstTime: item.time, latest: item, times: 1, amount, orders: item.order, everConverted: amount > 0 });
        return;
      }
      cur.times += 1;
      cur.amount += amount;
      cur.orders += item.order;
      if (amount > 0) cur.everConverted = true;
      if (String(item.time) >= String(cur.latest.time)) cur.latest = item;
    });

    const rowsB = [...groups.values()].map((x) => {
      const fu = (db.followups || {})[x.phone];
      const eff = fu && fu.status ? fu.status : (x.everConverted ? '已转化' : '未转化');
      // 人工回写优先（可作为修正手段）；无回写时按「任一行转化金额>0 即已转化」
      const everConverted = fu && fu.status ? eff === '已转化' : x.everConverted;
      const invalid = !everConverted && eff === '无效号码';
      return {
        time: x.latest.time || x.firstTime,
        firstTime: x.firstTime,
        phone: x.phone,
        customer: x.customer,
        empId: x.latest.empId || x.empId,
        empName: x.latest.empName || x.empName,
        base: x.latest.base || x.base,
        channel: x.latest.channel || x.channel,
        status: eff,
        rawStatus: x.latest.status,
        everConverted,
        historyConverted: x.everConverted,
        invalid,
        kind: everConverted ? 'converted' : (invalid ? 'invalid' : 'unconverted'),
        times: x.times,
        orders: x.orders,
        amount: x.amount,
        follow: fu ? fu.status : '',
        followBy: fu ? fu.by : '',
        followAt: fu ? fu.at : ''
      };
    }).sort((a, b) => String(b.time).localeCompare(String(a.time)) || String(b.phone).localeCompare(String(a.phone)));

    const summaryB = directUncvSummary(rowsB, { mode: 'B', rawRows: scanned, rawTotal: raw.length, totalAmount: rowsB.reduce((s, r) => s + (Number(r.amount) || 0), 0) });
    return { rows: rowsB, summary: summaryB, statuses: ['未转化', '已转化'], mode: 'B', source: '转介绍转化跟踪（a-b-c 口径：按 c 去重 · 转化金额>0 即已转化 · 仅角色=销售）' };
  }

  const groups = new Map();

  raw.forEach((r, idx) => {
    if (!r || typeof r !== 'object') return;
    const phone = g(r, '手机号');
    if (!phone) return;
    const item = {
      phone,
      customer: g(r, '客户姓名'),
      empId: g(r, '工号'),
      empName: g(r, '姓名'),
      base: g(r, '基地'),
      channel: g(r, '渠道'),
      status: g(r, '跟进状态') || '待跟进',
      time: g(r, '日期') || g(r, '转介绍时间'),
      rowNo: r._rowNo || idx + 1
    };
    const cur = groups.get(phone);
    if (!cur) {
      groups.set(phone, {
        phone,
        customer: item.customer,
        empId: item.empId,
        empName: item.empName,
        base: item.base,
        channel: item.channel,
        firstTime: item.time,
        latest: item,
        times: 1,
        everConverted: item.status === '已转化'
      });
      return;
    }
    cur.times += 1;
    if (item.status === '已转化') cur.everConverted = true;
    if (String(item.time) >= String(cur.latest.time)) cur.latest = item;
  });

  const rows = [...groups.values()].map((x) => {
    const fu = (db.followups || {})[x.phone];
    const eff = fu && fu.status ? fu.status : x.latest.status;
    // 人工回写优先（可作为修正手段）；无回写时沿用「历史上出现过已转化即已转化」
    const everConverted = fu && fu.status ? eff === '已转化' : x.everConverted;
    const invalid = !everConverted && eff === '无效号码';
    return {
      time: x.latest.time || x.firstTime,
      firstTime: x.firstTime,
      phone: x.phone,
      customer: x.customer,
      empId: x.latest.empId || x.empId,
      empName: x.latest.empName || x.empName,
      base: x.latest.base || x.base,
      channel: x.latest.channel || x.channel,
      status: eff,
      rawStatus: x.latest.status,
      everConverted,
      historyConverted: x.everConverted,
      invalid,
      kind: everConverted ? 'converted' : (invalid ? 'invalid' : 'unconverted'),
      times: x.times,
      amount: 0,
      follow: fu ? fu.status : '',
      followBy: fu ? fu.by : '',
      followAt: fu ? fu.at : ''
    };
  }).sort((a, b) => String(b.time).localeCompare(String(a.time)) || String(b.phone).localeCompare(String(a.phone)));

  const summaryA = directUncvSummary(rows, { mode: 'A', rawTotal: raw.length });
  return { rows, summary: summaryA, statuses: DUNCV_STATUSES, mode: 'A', source: '转介绍转化跟踪（跟进状态口径）' };
}

function directUncvSummary(rows, extra) {
  const ex = extra || {};
  const phones = rows.length;
  const converted = rows.filter((r) => r.kind === 'converted').length;
  const invalid = rows.filter((r) => r.kind === 'invalid').length;
  const unconverted = rows.filter((r) => r.kind === 'unconverted').length;
  const base = phones - invalid;
  const byEmpMap = new Map();
  rows.forEach((r) => {
    const key = r.empId || '(无工号)';
    if (!byEmpMap.has(key)) byEmpMap.set(key, { empId: r.empId || '', empName: r.empName || '', base: r.base || '', assigned: 0, converted: 0, unconverted: 0, invalid: 0, amount: 0 });
    const e = byEmpMap.get(key);
    e.assigned += 1;
    e.amount += Number(r.amount) || 0;
    if (r.kind === 'converted') e.converted += 1;
    else if (r.kind === 'invalid') e.invalid += 1;
    else e.unconverted += 1;
  });
  const byEmp = [...byEmpMap.values()].map((e) => {
    const den = e.assigned - e.invalid;
    return { ...e, rate: den > 0 ? e.unconverted / den : null };
  }).sort((a, b) => b.assigned - a.assigned || b.unconverted - a.unconverted);

  const rawLen = (db.rows.ds_direct || []).length;
  return {
    phones, converted, unconverted, invalid, valid: base,
    rate: base > 0 ? unconverted / base : null,
    followWritten: rows.filter((r) => r.follow).length,
    rawRows: ex.rawRows != null ? ex.rawRows : rawLen,
    rawTotal: ex.rawTotal != null ? ex.rawTotal : rawLen,
    mode: ex.mode || 'A',
    totalAmount: ex.totalAmount,
    byEmp
  };
}

/* ------------------------------------------------------------------ *
 * 2.5 方案 B：A-B-C 链路分析
 * 关系：窗口⑤（转介绍转化跟踪）角色=销售，按 c（新用户ID）去重，保留最早绑定那条的 a/b/归属
 * 金额：左连窗口①（有数业绩完成度）按 c 汇总金额（列自适应：销售直推业绩/转化金额/金额）
 * 判定：窗口① 无该 c 或金额=0 → 未转化(0)；有正金额 → 已转化
 * ------------------------------------------------------------------ */
function buildAbcChain() {
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const ys = db.rows.ds_youshu || [];
  const dr = db.rows.ds_direct || [];

  const ysAmtCol = ['销售直推业绩', '转化金额', '金额'].find((k) => ys.some((r) => r && r[k] != null && String(r[k]).trim() !== '')) || '';
  const ysAmt = new Map();
  if (ysAmtCol) {
    ys.forEach((r) => {
      const c = g(r, 'c') || g(r, '转化userid');
      if (!c) return;
      ysAmt.set(c, (ysAmt.get(c) || 0) + (Number(String(g(r, ysAmtCol)).replace(/,/g, '')) || 0));
    });
  }

  const groups = new Map();
  let scanned = 0;
  dr.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    if (r['角色'] != null && g(r, '角色') !== '销售') return;
    const c = g(r, 'c') || g(r, '转化userid');
    if (!c) return;
    scanned += 1;
    const t = g(r, '转介绍日期') || g(r, '转化日期');
    const cur = groups.get(c);
    if (!cur) {
      groups.set(c, { c, time: t, a: g(r, 'a'), b: g(r, 'b'), empId: g(r, '工号'), empName: g(r, '姓名'), base: g(r, '基地'), times: 1 });
      return;
    }
    cur.times += 1;
    if (t && (!cur.time || String(t) < String(cur.time))) {
      cur.time = t;
      cur.a = g(r, 'a');
      cur.b = g(r, 'b');
      cur.empId = g(r, '工号');
      cur.empName = g(r, '姓名');
      cur.base = g(r, '基地');
    }
  });

  const rows = [...groups.values()].map((x) => {
    const amount = ysAmt.get(x.c) || 0;
    return {
      time: x.time || '',
      a: x.a,
      b: x.b,
      c: x.c,
      empId: x.empId,
      empName: x.empName,
      base: x.base,
      times: x.times,
      amount,
      kind: amount > 0 ? 'converted' : 'unconverted'
    };
  }).sort((p, q) => String(q.time).localeCompare(String(p.time)) || String(q.c).localeCompare(String(p.c)));

  return {
    rows,
    summary: abcChainSummary(rows),
    amountCol: ysAmtCol,
    source: ysAmtCol ? `窗口⑤ 按 c 去重（保留最早绑定）左连 窗口① 按 c 汇总「${ysAmtCol}」` : '窗口① 未上传或无金额列：所有关系按未转化计'
  };
}

function abcChainSummary(rows) {
  const relations = rows.length;
  const converted = rows.filter((r) => r.kind === 'converted').length;
  const unconverted = relations - converted;
  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const byA = new Map();
  const byB = new Map();
  rows.forEach((r) => {
    const a = r.a || '(无a)';
    if (!byA.has(a)) byA.set(a, { a, empId: r.empId || '', empName: r.empName || '', base: r.base || '', oldUserSet: new Set(), newUsers: 0, converted: 0, unconverted: 0, amount: 0 });
    const A = byA.get(a);
    A.newUsers += 1;
    if (r.b) A.oldUserSet.add(r.b);
    if (r.kind === 'converted') A.converted += 1; else A.unconverted += 1;
    A.amount += Number(r.amount) || 0;
    const b = r.b || '(无b)';
    if (!byB.has(b)) byB.set(b, { b, newUsers: 0, converted: 0, unconverted: 0, amount: 0 });
    const B = byB.get(b);
    B.newUsers += 1;
    if (r.kind === 'converted') B.converted += 1; else B.unconverted += 1;
    B.amount += Number(r.amount) || 0;
  });
  const byAOut = [...byA.values()].map((x) => ({ a: x.a, empId: x.empId, empName: x.empName, base: x.base, newUsers: x.newUsers, oldUsers: x.oldUserSet.size, converted: x.converted, unconverted: x.unconverted, amount: x.amount, rate: x.newUsers > 0 ? x.unconverted / x.newUsers : null }))
    .sort((x, y) => y.newUsers - x.newUsers || y.amount - x.amount);
  const byBOut = [...byB.values()].map((x) => ({ b: x.b, newUsers: x.newUsers, converted: x.converted, unconverted: x.unconverted, amount: x.amount, rate: x.newUsers > 0 ? x.unconverted / x.newUsers : null }))
    .sort((x, y) => y.newUsers - x.newUsers || y.amount - x.amount);
  return {
    relations, converted, unconverted,
    rate: relations > 0 ? unconverted / relations : null,
    totalAmount,
    salesCount: byAOut.length,
    oldUserCount: byBOut.length,
    maxPerSales: byAOut.length ? byAOut[0].newUsers : 0,
    maxPerOld: byBOut.length ? byBOut[0].newUsers : 0,
    byA: byAOut,
    byB: byBOut
  };
}

/* =========================================================================
   2.9 高经团队业绩（双口径数透）
   口径一：销售直推业绩（有数完成度 ds_youshu「销售直推业绩」列）
   口径二：接 leads 业绩（转介绍转化跟踪 ds_direct「转化金额」>0 已转化单）
   归属：经理列有效 → 归该经理；经理列 null/空 → 按 nullRules（管理员维护，按源分开）
   高经业绩 = Σ 勾选经理业绩 + 本人在经理层的业绩（经理列=本人 或 null 规则命中）
   勾选映射按高经持久化（db.gjTeam.selections），仅管理员可调整
   ========================================================================= */
function gjTeamEmpIndex() {
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const baseNameOf = (id) => {
    const b = db.bases.find((x) => x.id === id);
    return b ? String(b.name).replace(/基地$/, '') : String(id || '');
  };
  const idx = new Map();
  const amb = new Set();
  db.org.forEach((r) => {
    if (!r || !g(r, 'name')) return;
    const key = g(r, 'name') + '|' + baseNameOf(r.baseId);
    if (!idx.has(key)) idx.set(key, g(r, 'empId'));
    else if (idx.get(key) !== g(r, 'empId')) amb.add(key);
  });
  return { idx, amb, baseNameOf };
}

function buildGjTeam() {
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const num = (v) => Number(String(v == null ? '' : v).replace(/,/g, '')) || 0;
  const ys = db.rows.ds_youshu || [];
  const dc = db.rows.ds_direct || [];
  const { idx: empIdx, amb: empAmb, baseNameOf } = gjTeamEmpIndex();

  // 按基地聚合经理双口径实绩 + null/脏值桶
  const bases = {};
  const ensure = (b) => bases[b] || (bases[b] = {
    mgrs: {},
    ysNull: { n: 0, amt: 0, gj: {} },
    dcNull: { n: 0, amt: 0, gj: {} },
    dirty: { n: 0, amt: 0 }
  });
  const baseKeyOf = (v) => v || '(未填基地)';
  ys.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const st = ensure(baseKeyOf(g(r, '基地')));
    const m = g(r, '经理');
    if (m && m !== 'null' && m !== '/') {
      const o = st.mgrs[m] || (st.mgrs[m] = { ys: { n: 0, amt: 0 }, dc: { n: 0, amt: 0 } });
      o.ys.n += 1; o.ys.amt += num(r['销售直推业绩']);
    } else if (m === '/') {
      st.dirty.n += 1; st.dirty.amt += num(r['销售直推业绩']);
    } else {
      st.ysNull.n += 1; st.ysNull.amt += num(r['销售直推业绩']);
      const gj = g(r, '高经');
      if (gj && gj !== 'null') st.ysNull.gj[gj] = (st.ysNull.gj[gj] || 0) + 1;
    }
  });
  dc.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const amt = num(r['转化金额']);
    if (amt <= 0) return;
    const st = ensure(baseKeyOf(g(r, '基地')));
    const m = g(r, '经理');
    if (m && m !== 'null' && m !== '/') {
      const o = st.mgrs[m] || (st.mgrs[m] = { ys: { n: 0, amt: 0 }, dc: { n: 0, amt: 0 } });
      o.dc.n += 1; o.dc.amt += amt;
    } else if (m === '/') {
      st.dirty.n += 1; st.dirty.amt += amt;
    } else {
      st.dcNull.n += 1; st.dcNull.amt += amt;
      const gj = g(r, '高经');
      if (gj && gj !== 'null') st.dcNull.gj[gj] = (st.dcNull.gj[gj] || 0) + 1;
    }
  });

  // 高经名单：两源底表高经列 distinct（org 表 level 列存在大量脏数据，不作为名单来源）
  const out = {};
  const round2 = (v) => Math.round(v * 100) / 100;
  const baseKeys = Object.keys(bases).sort((x, y) => {
    if (x === '(未填基地)') return 1;
    if (y === '(未填基地)') return -1;
    return x.localeCompare(y, 'zh');
  });
  baseKeys.forEach((b) => {
    const st = bases[b];
    const gjSet = new Map();
    ys.forEach((r) => { const v = g(r, '高经'); if (g(r, '基地') === b && v && v !== 'null' && v !== '/' && !gjSet.has(v)) gjSet.set(v, ''); });
    dc.forEach((r) => { const v = g(r, '高经'); if (g(r, '基地') === b && v && v !== 'null' && v !== '/' && !gjSet.has(v)) gjSet.set(v, ''); });
    const gjs = [...gjSet.keys()].map((nm) => {
      const key = nm + '|' + b;
      return { name: nm, empId: empIdx.get(key) || '', ambEmp: empAmb.has(key) };
    }).sort((x, y) => x.name.localeCompare(y.name, 'zh'));
    // null 归属规则的目标高经补进名单（其业绩可能全部来自 null 直管行，底表高经列未出现）
    (db.gjTeam.nullRules || []).forEach((nr) => {
      if (nr.enabled && nr.base === b && nr.targetName && !gjs.some((x) => x.name === nr.targetName)) {
        gjs.push({ name: nr.targetName, empId: nr.targetEmpId || '', ambEmp: false });
      }
    });
    gjs.sort((x, y) => x.name.localeCompare(y.name, 'zh'));
    const mgrs = Object.entries(st.mgrs).map(([nm, v]) => {
      const key = nm + '|' + b;
      return { name: nm, empId: empIdx.get(key) || '', ambEmp: empAmb.has(key), ys: { n: v.ys.n, amt: round2(v.ys.amt) }, dc: { n: v.dc.n, amt: round2(v.dc.amt) } };
    }).sort((x, y) => (y.ys.amt + y.dc.amt) - (x.ys.amt + x.dc.amt));
    out[b] = { gjs, mgrs, ysNull: { n: st.ysNull.n, amt: round2(st.ysNull.amt), gj: st.ysNull.gj }, dcNull: { n: st.dcNull.n, amt: round2(st.dcNull.amt), gj: st.dcNull.gj }, dirty: { n: st.dirty.n, amt: round2(st.dirty.amt) } };
  });
  return out;
}

/** 按勾选映射计算单个高经的双口径团队业绩 */
function gjTeamCalc(base, gjName) {
  const all = buildGjTeam();
  const b = all[base];
  if (!b) return null;
  const gjCfg = db.gjTeam || {};
  const selKey = base + '|' + gjName;
  const sel = (gjCfg.selections || {})[selKey] || null;
  const picked = sel ? sel.mgrs : [];
  const includeSelf = sel ? !!sel.includeSelf : false;
  const byName = new Map(b.mgrs.map((m) => [m.name, m]));
  const rules = (gjCfg.nullRules || []).filter((x) => x.enabled);
  const ruleYs = rules.find((x) => x.source === 'ys' && x.base === base && x.targetName === gjName);
  const ruleDc = rules.find((x) => x.source === 'dc' && x.base === base && x.targetName === gjName);
  const self = {
    ys: { n: 0, amt: 0 }, dc: { n: 0, amt: 0 },
    dcSales: [], sales: []
  };
  // 本人在经理层：两源经理列=本人 的行（销售名单从底表取）
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const num = (v) => Number(String(v == null ? '' : v).replace(/,/g, '')) || 0;
  (db.rows.ds_youshu || []).forEach((r) => {
    if (g(r, '基地') !== base || g(r, '经理') !== gjName) return;
    self.ys.n += 1; self.ys.amt += num(r['销售直推业绩']);
    if (g(r, '销售姓名')) self.sales.push(g(r, '销售姓名'));
  });
  (db.rows.ds_direct || []).forEach((r) => {
    if (g(r, '基地') !== base || g(r, '经理') !== gjName) return;
    const amt = num(r['转化金额']);
    if (amt <= 0) return;
    self.dc.n += 1; self.dc.amt += amt;
    if (g(r, '姓名')) self.dcSales.push(g(r, '姓名'));
  });
  const rows = [];
  if (sel) {
    if (includeSelf) {
      rows.push({ name: gjName + '（本人直管）', empId: (b.gjs.find((x) => x.name === gjName) || {}).empId || '', self: true, rule: false, ys: { n: self.ys.n, amt: Math.round(self.ys.amt * 100) / 100 }, dc: { n: self.dc.n, amt: Math.round(self.dc.amt * 100) / 100 } });
    }
    picked.forEach((nm) => {
      const m = byName.get(nm);
      if (m) rows.push({ name: m.name, empId: m.empId, self: false, rule: false, ys: m.ys, dc: m.dc });
    });
    if (ruleYs) rows.push({ name: '直管（经理=null · 规则归' + gjName + '）', empId: '规则', self: false, rule: true, ys: { n: b.ysNull.n, amt: b.ysNull.amt }, dc: { n: 0, amt: 0 } });
    if (ruleDc) rows.push({ name: '直管（经理=null · 规则归' + gjName + '）', empId: '规则', self: false, rule: true, ys: { n: 0, amt: 0 }, dc: { n: b.dcNull.n, amt: b.dcNull.amt } });
  }
  const total = {
    ys: { n: rows.reduce((s, r) => s + r.ys.n, 0), amt: Math.round(rows.reduce((s, r) => s + r.ys.amt, 0) * 100) / 100 },
    dc: { n: rows.reduce((s, r) => s + r.dc.n, 0), amt: Math.round(rows.reduce((s, r) => s + r.dc.amt, 0) * 100) / 100 }
  };
  const mgrRows = rows.filter((r) => !r.self && !r.rule);
  const mgrSub = {
    ys: { n: mgrRows.reduce((s, r) => s + r.ys.n, 0), amt: Math.round(mgrRows.reduce((s, r) => s + r.ys.amt, 0) * 100) / 100 },
    dc: { n: mgrRows.reduce((s, r) => s + r.dc.n, 0), amt: Math.round(mgrRows.reduce((s, r) => s + r.dc.amt, 0) * 100) / 100 }
  };
  return {
    base, gjName,
    selection: sel ? { mgrs: picked, includeSelf, at: sel.at, by: sel.by } : null,
    rows, total, mgrSub,
    self: { ys: { n: self.ys.n, amt: Math.round(self.ys.amt * 100) / 100 }, dc: { n: self.dc.n, amt: Math.round(self.dc.amt * 100) / 100 }, dcSales: [...new Set(self.dcSales)], sales: [...new Set(self.sales)] },
    baseInfo: b
  };
}

/* =========================================================================
   2.6 KOC 三类分层
   分类 A：全部累计新正价用户数 ≥ 6（可申请星推官）
   分类 B：3 ≤ 累计新正价用户数 ≤ 5（潜力星推官）
   分类 C：本年（26 年）新正价用户数 > 0（26 年有成功推荐）
   优先级 A > B > C；交叉字段按类别匹配全部时间表 / 本年表
   总池：三类按老用户ID去重；占比 = 各类 ÷ 总池
   ========================================================================= */
function buildKocTier() {
  const hi = db.rows.ds_high || [];
  const num = (v) => engine.toNumber(v);
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();

  // 本年表（带 26 年列的行）：老用户ID → 26年体验/正价
  const y26 = new Map();
  hi.forEach((r) => {
    const id = g(r, '老用户ID');
    if (!id) return;
    const zt = num(r['26年新正价用户数量']);
    const ty = num(r['26年新体验用户数量']);
    if (r['26年新正价用户数量'] == null && r['26年新体验用户数量'] == null) return;
    const cur = y26.get(id) || { ty: 0, zt: 0 };
    cur.ty += ty;
    cur.zt += zt;
    y26.set(id, cur);
  });

  // 全部时间表：老用户ID → 累计体验/正价/金额 + 归属（去重，保留信息最全的一条）
  const all = new Map();
  hi.forEach((r) => {
    const id = g(r, '老用户ID');
    if (!id) return;
    const cur = all.get(id);
    const zt = num(r['累计新正价用户数量']);
    if (!cur) {
      all.set(id, {
        id,
        empId: g(r, '工号'), empName: g(r, '姓名'), base: g(r, '基地'),
        gj: g(r, '高经'), jl: g(r, '经理'),
        tyTotal: num(r['累计新体验用户数量']), ztTotal: zt,
        amountTotal: num(r['累计金额']), kocLevel: g(r, 'KOC层级')
      });
    } else {
      // 同 ID 多行：累计数取最大（防止重复行相加虚高），归属补空
      if (zt > cur.ztTotal) {
        cur.ztTotal = zt;
        cur.tyTotal = num(r['累计新体验用户数量']);
        cur.amountTotal = num(r['累计金额']);
      }
      if (!cur.empId && g(r, '工号')) { cur.empId = g(r, '工号'); cur.empName = g(r, '姓名'); cur.base = g(r, '基地'); cur.gj = g(r, '高经'); cur.jl = g(r, '经理'); }
    }
  });

  const tierOf = (id) => {
    const o = all.get(id);
    const ztTotal = o ? o.ztTotal : 0;
    const y = y26.get(id);
    if (ztTotal >= 6) return 'A';
    if (ztTotal >= 3) return 'B';
    if (y && y.zt > 0) return 'C';
    return '';
  };

  const rows = [...all.keys()].map((id) => {
    const o = all.get(id);
    const y = y26.get(id) || { ty: 0, zt: 0 };
    const tier = tierOf(id);
    return {
      id,
      tier,
      empId: o.empId, empName: o.empName, base: o.base, gj: o.gj, jl: o.jl,
      tyTotal: o.tyTotal, ztTotal: o.ztTotal, amountTotal: o.amountTotal,
      ty26: y.ty, zt26: y.zt,
      kocLevel: o.kocLevel
    };
  }).filter((r) => r.tier);

  const order = { A: 0, B: 1, C: 2 };
  rows.sort((a, b) => order[a.tier] - order[b.tier] || b.ztTotal - a.ztTotal || b.zt26 - a.zt26 || b.amountTotal - a.amountTotal);

  const cnt = { A: 0, B: 0, C: 0 };
  rows.forEach((r) => { cnt[r.tier] += 1; });
  const pool = new Set(rows.map((r) => r.id)).size;

  // 按基地汇总
  const byBase = {};
  rows.forEach((r) => {
    const k = r.base || '未匹配';
    if (!byBase[k]) byBase[k] = { base: k, A: 0, B: 0, C: 0, pool: 0 };
    byBase[k][r.tier] += 1;
    byBase[k].pool += 1;
  });

  return {
    rows,
    summary: {
      A: cnt.A, B: cnt.B, C: cnt.C,
      pool,
      rateA: pool ? cnt.A / pool : null,
      rateB: pool ? cnt.B / pool : null,
      rateC: pool ? cnt.C / pool : null,
      zt26Total: rows.reduce((s, r) => s + r.zt26, 0),
      ty26Total: rows.reduce((s, r) => s + r.ty26, 0),
      byBase: Object.values(byBase).sort((a, b) => b.pool - a.pool)
    },
    source: '高潜老用户跟进表（全部时间 69299 行 + 本年 26 年列子集）'
  };
}

/* =========================================================================
   2.7 钻石未使用
   底表：转介绍转化跟踪中「角色=销售 且 转化金额>0」的已转化老用户（b）
   匹配钻石商城财务报表（按 用户id）→ 发放 / 消耗 / 剩余
   消耗=0 未消耗；0<消耗<发放 部分消耗；消耗≥发放 已用完
   解冻条件（正价课满30天未退课）暂无退课数据，列「解冻确认」人工核对
   ========================================================================= */
function buildDiamondUnused() {
  const dr = db.rows.ds_direct || [];
  const dm = db.rows.ds_diamond || [];
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const num = (v) => engine.toNumber(v);

  // 已转化老用户（b）底表
  const users = new Map();
  dr.forEach((r) => {
    if (r['角色'] != null && g(r, '角色') !== '销售') return;
    if (!(num(r['转化金额']) > 0)) return;
    const b = g(r, 'b') || g(r, '老用户ID');
    if (!b) return;
    const cur = users.get(b) || { b, amount: 0, orders: 0, empId: '', empName: '', base: '', gj: '', jl: '' };
    cur.amount += num(r['转化金额']);
    cur.orders += 1;
    if (!cur.empId && g(r, '工号')) { cur.empId = g(r, '工号'); cur.empName = g(r, '姓名'); cur.base = g(r, '基地'); cur.gj = g(r, '高经'); cur.jl = g(r, '经理'); }
    users.set(b, cur);
  });

  // 钻石流水按 用户id 聚合
  const flow = new Map();
  dm.forEach((r) => {
    const id = g(r, '用户id');
    if (!id) return;
    const cur = flow.get(id) || { grant: 0, use: 0, firstGrant: '', lastUse: '', grantRows: 0, useRows: 0, items: [] };
    const kind = g(r, '钻石消耗/发放');
    const qty = num(r['钻石数量']);
    const useTime = g(r, '消耗/发放时间');
    const grantTime = g(r, '发放时间') || useTime;
    if (kind === '发放') {
      cur.grant += qty;
      cur.grantRows += 1;
      if (grantTime && (!cur.firstGrant || grantTime < cur.firstGrant)) cur.firstGrant = grantTime;
      const item = g(r, '兑换商品名称');
      if (item) cur.items.push(item);
    } else if (kind === '消耗') {
      cur.use += qty;
      cur.useRows += 1;
      if (useTime && (!cur.lastUse || useTime > cur.lastUse)) cur.lastUse = useTime;
    }
    flow.set(id, cur);
  });

  const rows = [...users.values()].map((u) => {
    const f = flow.get(u.b) || { grant: 0, use: 0, firstGrant: '', lastUse: '', grantRows: 0, useRows: 0, items: [] };
    const rest = f.grant - f.use;
    const state = f.grant <= 0 ? '无钻石记录' : (f.use <= 0 ? '未消耗' : (rest > 0 ? '部分消耗' : '已用完'));
    return {
      b: u.b, amount: u.amount, orders: u.orders,
      empId: u.empId, empName: u.empName, base: u.base, gj: u.gj, jl: u.jl,
      grant: f.grant, use: f.use, rest,
      firstGrant: f.firstGrant, lastUse: f.lastUse,
      items: [...new Set(f.items)].slice(0, 3).join('、'),
      state, matched: f.grant > 0 || f.use > 0,
      unfreeze: '待确认（满30天未退课）'
    };
  }).sort((a, b) => String(b.firstGrant || '').localeCompare(String(a.firstGrant || '')) || b.amount - a.amount);

  const matched = rows.filter((r) => r.matched);
  const summary = {
    users: rows.length,
    matched: matched.length,
    noRecord: rows.length - matched.length,
    grantTotal: rows.reduce((s, r) => s + r.grant, 0),
    useTotal: rows.reduce((s, r) => s + r.use, 0),
    restTotal: rows.reduce((s, r) => s + Math.max(r.rest, 0), 0),
    unused: rows.filter((r) => r.state === '未消耗').length,
    partial: rows.filter((r) => r.state === '部分消耗').length,
    done: rows.filter((r) => r.state === '已用完').length
  };
  return { rows, summary, source: '转介绍转化跟踪（已转化老用户）× 钻石商城财务报表' };
}

/* =========================================================================
   2.8 龙珠奖（集龙珠体系）
   净营收 = 直推转化金额 − 退款（仅直推；当前无退款列则退款=0）
   净化：① 剔除当期质检触发人（质检台账有数据时生效）
         ② 剔除当期离职/不在职（org.status）
   五榜：A 个人净营收 TOP3（月/季/年）｜B 个人提升率 TOP3（月）
        C 新人 TOP3（入职3个月内，月）｜D 高经团队完成度 TOP3｜E 经理团队完成度 TOP3
   兑换：同季 2 奖状换 1 奖牌；同年 2 奖牌换 1 奖杯
   ========================================================================= */
const DRAGON_PRIZES = [300, 200, 100];

function dragonQuarter(month) {
  if (!/^\d{4}-\d{2}/.test(month)) return '';
  const y = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

function buildDragon() {
  const ys = db.rows.ds_youshu || [];
  const org = db.org || [];
  const qcRows = db.rows.ds_qc || [];
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const num = (v) => engine.toNumber(v);
  const notes = [];

  // 质检触发人工号（质检台账有数据时生效）
  const qcEmps = new Set();
  qcRows.forEach((r) => {
    ['工号', '员工工号', '销售工号', 'empId'].forEach((k) => {
      const v = g(r, k);
      if (v) qcEmps.add(v.toUpperCase());
    });
  });
  if (qcRows.length) notes.push(`质检台账 ${qcRows.length} 行，剔除触发质检 ${qcEmps.size} 人`);
  else notes.push('质检台账未上传，净化②（剔除当期质检）暂未生效');

  // 在职过滤（org 当期状态）
  const orgByEmp = {};
  const firstSeen = {};
  org.forEach((o) => {
    const k = String(o.empId || '').toUpperCase();
    if (!k) return;
    if (!orgByEmp[k]) orgByEmp[k] = o;
    const d = engine.normDate(o.effectiveDate) || '';
    if (d && (!firstSeen[k] || d < firstSeen[k])) firstSeen[k] = d;
    if (o.status && o.status !== '在职') orgByEmp[k].__off = true;
  });
  const offCount = Object.values(orgByEmp).filter((o) => o.__off).length;
  if (offCount) notes.push(`架构中非在职 ${offCount} 人已剔除`);
  else notes.push('架构当前全部在职，净化③未剔除任何人');

  // 个人月度净营收（退款列存在则扣除）
  const hasRefund = ys.some((r) => r['退款'] != null || r['退款金额'] != null);
  if (!hasRefund) notes.push('有数表无退款列，净营收 = 直推转化金额（退款暂按 0）');
  const refundOf = (r) => num(r['退款']) || num(r['退款金额']) || 0;

  const people = new Map();
  const months = new Set();
  ys.forEach((r) => {
    const empId = g(r, '工号');
    const nm = g(r, '销售姓名') || g(r, '绑定人工号姓名');
    if (!empId && !nm) return;
    const d = engine.normDate(r['下单时间']) || '';
    const m = /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : '';
    if (m) months.add(m);
    const k = (empId || nm).toUpperCase();
    if (qcEmps.has(String(empId).toUpperCase())) return;
    const o = orgByEmp[String(empId).toUpperCase()];
    if (o && o.__off) return;
    if (!people.has(k)) {
      people.set(k, {
        empId, name: nm,
        base: g(r, '基地'), gj: g(r, '高经'), jl: g(r, '经理'),
        net: 0, byMonth: {}
      });
    }
    const p = people.get(k);
    const amt = num(r['销售直推业绩']) - refundOf(r);
    p.net += amt;
    if (m) p.byMonth[m] = (p.byMonth[m] || 0) + amt;
    if (!p.base && g(r, '基地')) p.base = g(r, '基地');
    if (!p.gj && g(r, '高经')) p.gj = g(r, '高经');
    if (!p.jl && g(r, '经理')) p.jl = g(r, '经理');
  });
  const plist = [...people.values()].map((p) => ({
    ...p, net: Math.round(p.net * 100) / 100,
    entry: firstSeen[String(p.empId).toUpperCase()] || '',
    onboard: (() => { const e = firstSeen[String(p.empId).toUpperCase()] || ''; if (!e) return ''; const d = new Date(e); d.setMonth(d.getMonth() + 3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })()
  }));
  const monthsSorted = [...months].sort();
  const curMonth = monthsSorted[monthsSorted.length - 1] || '';
  const quarters = [...new Set(monthsSorted.map(dragonQuarter))].filter(Boolean);
  const years = [...new Set(monthsSorted.map((m) => m.slice(0, 4)))];

  const top3 = (arr, val) => {
    // 密排 TOP3（同分并列），返回带 prize/rank 的行
    let lastVal = null, lastRank = 0;
    return arr.slice(0, 50).map((r) => {
      const v = val(r);
      if (lastVal !== null && v === lastVal) r.rank = lastRank;
      else { lastRank += 1; lastVal = v; r.rank = lastRank; }
      r.prize = r.rank <= 3 ? DRAGON_PRIZES[r.rank - 1] : 0;
      return r;
    });
  };

  // 榜A：月 / 季 / 年净营收
  const boardA = { month: [], quarter: [], year: [] };
  monthsSorted.forEach((m) => {
    boardA.month.push({ period: m, rows: top3(plist.map((p) => ({ empId: p.empId, name: p.name, base: p.base, net: Math.round((p.byMonth[m] || 0) * 100) / 100 })).sort((a, b) => b.net - a.net), (r) => r.net).filter((r) => r.net > 0) });
  });
  quarters.forEach((q) => {
    const ms = monthsSorted.filter((m) => dragonQuarter(m) === q);
    boardA.quarter.push({ period: q, rows: top3(plist.map((p) => ({ empId: p.empId, name: p.name, base: p.base, net: Math.round(ms.reduce((s, m) => s + (p.byMonth[m] || 0), 0) * 100) / 100 })).sort((a, b) => b.net - a.net), (r) => r.net).filter((r) => r.net > 0) });
  });
  years.forEach((y) => {
    const ms = monthsSorted.filter((m) => m.slice(0, 4) === y);
    boardA.year.push({ period: y, rows: top3(plist.map((p) => ({ empId: p.empId, name: p.name, base: p.base, net: Math.round(ms.reduce((s, m) => s + (p.byMonth[m] || 0), 0) * 100) / 100 })).sort((a, b) => b.net - a.net), (r) => r.net).filter((r) => r.net > 0) });
  });

  // 榜B：月度提升率（上月净营收 ≥ 10000 入池）
  const boardB = monthsSorted.map((m, i) => {
    const prev = i > 0 ? monthsSorted[i - 1] : '';
    const rows = plist.map((p) => {
      const cur = p.byMonth[m] || 0;
      const pre = prev ? (p.byMonth[prev] || 0) : -1;
      return { empId: p.empId, name: p.name, base: p.base, cur: Math.round(cur * 100) / 100, prev: pre < 0 ? null : Math.round(pre * 100) / 100, growth: pre >= 10000 && cur > 0 ? (cur - pre) / pre : null };
    }).filter((r) => r.prev !== null && r.prev >= 10000 && r.growth !== null).sort((a, b) => b.growth - a.growth);
    return { period: m, prev, rows: top3(rows, (r) => r.growth), gate: '上月净营收 ≥ 10000' };
  });

  // 榜C：新人榜（入职/首次生效起 3 个月内，月度净营收）
  const boardC = monthsSorted.map((m) => {
    const rows = plist.filter((p) => p.entry && m >= p.entry && m < p.onboard)
      .map((p) => ({ empId: p.empId, name: p.name, base: p.base, entry: p.entry, net: Math.round((p.byMonth[m] || 0) * 100) / 100 }))
      .sort((a, b) => b.net - a.net);
    return { period: m, rows: top3(rows, (r) => r.net).filter((r) => r.net > 0), gate: '入职起 3 个月内' };
  });

  // 榜D/E：团队完成度（团队直推业绩 ÷ 团队直推目标）
  const tGj = db.rows['ds_deal:targetDirectGj'] || db.rows['ds_youshu:targetDirectGj'] || [];
  const tJl = db.rows['ds_deal:targetDirectJl'] || db.rows['ds_youshu:targetDirectJl'] || [];
  const teamBoard = (targets, col) => {
    return monthsSorted.map((m) => {
      const teamNames = new Set(targets.map((t) => g(t, 'name')).filter(Boolean));
      const agg = {};
      plist.forEach((p) => {
        const tn = String(p[col] || '').trim();
        if (!tn || !teamNames.has(tn)) return;
        agg[tn] = (agg[tn] || 0) + (p.byMonth[m] || 0);
      });
      const rows = targets.filter((t) => g(t, 'month') === m || !g(t, 'month')).map((t) => {
        const nm = g(t, 'name');
        const perf = Math.round((agg[nm] || 0) * 100) / 100;
        const tgt = num(t['target']);
        return { name: nm, base: '', perf, target: tgt, rate: tgt > 0 ? perf / tgt : null };
      }).filter((r) => r.target > 0).sort((a, b) => b.rate - a.rate);
      const seen = new Set();
      const uniq = rows.filter((r) => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });
      return { period: m, rows: top3(uniq, (r) => r.rate) };
    });
  };
  const boardD = teamBoard(tGj, 'gj');
  const boardE = teamBoard(tJl, 'jl');

  // 目标月份与业绩月份错位提示
  const targetMonths = [...new Set([...tGj, ...tJl].map((t) => g(t, 'month')).filter(Boolean))];
  const orphanTargets = targetMonths.filter((m) => !monthsSorted.includes(m));
  if (orphanTargets.length) notes.push(`团队目标存在 ${orphanTargets.join('、')} 月份但当期无业绩数据，榜D/E 严格按月匹配，该月暂空`);
  const missingTargets = monthsSorted.filter((m) => !targetMonths.includes(m));
  if (missingTargets.length) notes.push(`团队目标缺 ${missingTargets.join('、')} 月份，请补传月目标表`);

  // 兑换结算：奖状按人（榜A/B/C TOP3）与团队（榜D/E，归团队负责人）分别累计
  const certAdd = (map, key, who, quarter, year, prize) => {
    if (!map.has(key)) map.set(key, { ...who, certs: [], medalQuarters: {}, trophies: {} });
    const o = map.get(key);
    o.certs.push({ quarter, year, prize });
  };
  const personalCerts = new Map();
  const teamCerts = new Map();
  boardA.month.forEach((b) => b.rows.filter((r) => r.rank <= 3).forEach((r) => certAdd(personalCerts, r.empId || r.name, { empId: r.empId, name: r.name, base: r.base }, dragonQuarter(b.period), b.period.slice(0, 4), r.prize)));
  boardB.forEach((b) => b.rows.filter((r) => r.rank <= 3).forEach((r) => certAdd(personalCerts, r.empId || r.name, { empId: r.empId, name: r.name, base: r.base }, dragonQuarter(b.period), b.period.slice(0, 4), r.prize)));
  boardC.forEach((b) => b.rows.filter((r) => r.rank <= 3).forEach((r) => certAdd(personalCerts, r.empId || r.name, { empId: r.empId, name: r.name, base: r.base }, dragonQuarter(b.period), b.period.slice(0, 4), r.prize)));
  boardD.forEach((b) => b.rows.filter((r) => r.rank <= 3).forEach((r) => certAdd(teamCerts, r.name, { name: r.name, level: '高经' }, dragonQuarter(b.period), b.period.slice(0, 4), r.prize)));
  boardE.forEach((b) => b.rows.filter((r) => r.rank <= 3).forEach((r) => certAdd(teamCerts, r.name, { name: r.name, level: '经理' }, dragonQuarter(b.period), b.period.slice(0, 4), r.prize)));

  const settle = (map, whoLabel) => [...map.values()].map((o) => {
    // 按季度聚合奖状 → 可换奖牌（同季 2 张换 1）
    const byQ = {};
    o.certs.forEach((c) => {
      byQ[c.quarter] = byQ[c.quarter] || { quarter: c.quarter, year: c.year, certs: 0, prize: 0 };
      byQ[c.quarter].certs += 1;
      byQ[c.quarter].prize += c.prize;
    });
    const quartersOut = Object.values(byQ).map((q) => ({ ...q, medalsFrom: Math.floor(q.certs / 2), certsLeft: q.certs % 2 }));
    // 按年聚合奖牌 → 可换奖杯（同年 2 块换 1）
    const byY = {};
    quartersOut.forEach((q) => {
      byY[q.year] = byY[q.year] || { year: q.year, medals: 0, prizeTotal: 0 };
      byY[q.year].medals += q.medalsFrom;
      byY[q.year].prizeTotal += q.prize;
    });
    const yearsOut = Object.values(byY).map((y) => ({ ...y, trophiesFrom: Math.floor(y.medals / 2), medalsLeft: y.medals % 2 }));
    return {
      [whoLabel]: whoLabel === 'empId' ? o.empId : o.name,
      name: o.name || '', base: o.base || '', level: o.level || '',
      certTotal: o.certs.length,
      prizeTotal: o.certs.reduce((s, c) => s + c.prize, 0),
      quarters: quartersOut.sort((a, b) => a.quarter.localeCompare(b.quarter)),
      years: yearsOut.sort((a, b) => a.year.localeCompare(b.year))
    };
  }).sort((a, b) => b.certTotal - a.certTotal);

  return {
    meta: {
      curMonth, months: monthsSorted, quarters, years,
      people: plist.length,
      qcRows: qcRows.length,
      notes,
      targetsGj: tGj.length, targetsJl: tJl.length
    },
    boards: { A: boardA, B: boardB, C: boardC, D: boardD, E: boardE },
    exchange: { personal: settle(personalCerts, 'empId'), team: settle(teamCerts, 'name') }
  };
}


/* =========================================================================
   钻石兑换明细（窗口⑤ 已转化订单明细，按转化日期倒序）
   应发放钻石：待规则确认后接入（钻石表「邀请平台新用户报名正价课」发放记录
   的唯一id 内嵌被邀请人 userid，可与 c/转化userid 精确匹配 520/569）
   ========================================================================= */
function buildDiamondOrders() {
  const dr = db.rows.ds_direct || [];
  const g = (r, k) => String(r[k] == null ? '' : r[k]).trim();
  const num = (v) => engine.toNumber(v);
  const rows = dr
    .filter((r) => (r['角色'] == null || g(r, '角色') === '销售') && num(r['转化金额']) > 0)
    .map((r) => ({
      introDate: g(r, '转介绍日期'),
      base: g(r, '基地'),
      gj: g(r, '高经'),
      jl: g(r, '经理'),
      zg: g(r, '主管'),
      zz: g(r, '组长'),
      empName: g(r, '姓名'),
      empId: g(r, '工号'),
      convDate: g(r, '转化日期'),
      convTime: g(r, '转化时间'),
      amount: num(r['转化金额']),
      c: g(r, 'c') || g(r, '转化userid'),
      orderId: g(r, '转化订单ID'),
      b: g(r, 'b')
    }))
    .sort((a, b) => String(b.convTime || b.convDate || '').localeCompare(String(a.convTime || a.convDate || '')) || String(b.introDate).localeCompare(String(a.introDate)));
  rows.forEach((r, i) => { r.seq = i + 1; });
  return {
    rows,
    summary: {
      orders: rows.length,
      amount: rows.reduce((s, r) => s + r.amount, 0),
      emps: new Set(rows.map((r) => r.empId).filter(Boolean)).size
    },
    source: '转介绍转化跟踪（角色=销售 且 转化金额>0）'
  };
}


function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json'
};

const PALETTE_FALLBACK = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#84cc16'];

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' ) rel = '/index.html';
  if (rel === '/dashboard') {
    res.writeHead(302, { location: '/' });
    res.end();
    return;
  }
  const pages = {
    '/login': '/login.html',
    '/admin': '/admin.html',
    '/records': '/records.html',
    '/rankings': '/rankings.html',
    '/tables': '/tables.html'
  };
  // 后台页服务端直接做角色分流：未登录去登录页，基地账号回前台（避免先渲染后台再跳转的闪烁）
  if (rel === '/admin') {
    const u = currentUser(req);
    if (!u) { res.writeHead(302, { location: '/login' }); res.end(); return; }
    if (u.role !== 'admin') { res.writeHead(302, { location: '/' }); res.end(); return; }
  }
  if (pages[rel]) rel = pages[rel];
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': /assets\/vendor/.test(filePath) ? 'public, max-age=86400' : 'no-cache'
    });
    res.end(buf);
  });
}

/* ---------------- 看板计算 ---------------- */

function resolveRange(q) {
  const today = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const range = q.range || 'all';
  if (range === '30') {
    const d = new Date(today); d.setDate(d.getDate() - 29);
    return { from: fmt(d), to: fmt(today), range };
  }
  if (range === '90') {
    const d = new Date(today); d.setDate(d.getDate() - 89);
    return { from: fmt(d), to: fmt(today), range };
  }
  if (range === 'month') {
    return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to: fmt(today), range };
  }
  if (range === 'custom') return { from: q.from || '', to: q.to || '', range };
  return { from: '', to: '', range: 'all' };
}

function buildDashboard(user, q) {
  const dsId = q.dataset || (db.datasets[0] && db.datasets[0].id);
  const ds = datasetById(dsId);
  if (!ds) return { error: '数据集不存在' };

  const isBaseUser = user.role === 'base';
  const range = resolveRange(q);
  let baseId = q.base || 'all';
  let managerId = q.manager || 'all';
  if (isBaseUser) { baseId = user.baseId; managerId = q.manager || 'all'; }
  const statusFilter = q.status || 'all';
  const channelFilter = q.channel || 'all';

  const ctx = ctxOf();
  const rawRows = db.rows[ds.id] || [];
  const scoped = engine.aggregate(ds, rawRows, ctx, { baseId, managerId, from: range.from, to: range.to, status: statusFilter, channel: channelFilter });
  const needGlobal = isBaseUser && (ds.metrics || []).some((m) => m.scope === 'global');
  const globalAgg = needGlobal
    ? engine.aggregate(ds, rawRows, ctx, { baseId: 'all', managerId: 'all', from: range.from, to: range.to, status: statusFilter, channel: channelFilter })
    : null;

  // 目标：基地维度 / 高经维度
  let targetScope = null;
  let targetKeys = [];
  if (managerId !== 'all') { targetScope = 'manager'; targetKeys = [managerId]; }
  else if (baseId !== 'all') { targetScope = 'base'; targetKeys = [baseId]; }
  else { targetScope = 'base'; targetKeys = db.bases.map((b) => b.id); }

  const kpis = (ds.metrics || []).map((m) => {
    const useGlobal = m.scope === 'global' && isBaseUser;
    const value = useGlobal ? globalAgg.total[m.key] : scoped.total[m.key];
    const scopeLabel = useGlobal ? '全国' : isBaseUser ? '本基地' : (baseId === 'all' ? '整体' : '本基地');
    // 全国口径指标：目标也取全国合计，避免「全国实际 / 本基地目标」的错配
    const target = engine.targetSum(db.targets, {
      metric: m.key,
      scope: useGlobal ? 'base' : targetScope,
      keys: useGlobal ? db.bases.map((b) => b.id) : targetKeys,
      from: range.from, to: range.to
    });
    return {
      key: m.key, name: m.name, value, unit: m.unit, format: m.format,
      desc: m.desc, scope: m.scope, scopeLabel,
      target: target === null ? null : target,
      attainment: target ? (value / target) : null
    };
  });

  const baseNameOf = (id) => (ctx.baseMap[id] ? ctx.baseMap[id].name : id || '未匹配');
  const managerNameOf = (id) => {
    const rec = db.org.find((o) => String(o.empId).toUpperCase() === String(id).toUpperCase());
    return rec ? `${rec.name}` : id;
  };

  const targetMap = (scope, key) => {
    const out = {};
    (ds.metrics || []).forEach((m) => {
      const t = engine.targetSum(db.targets, { metric: m.key, scope, keys: [key], from: range.from, to: range.to });
      if (t !== null) out[m.key] = t;
    });
    return out;
  };

  return {
    dataset: publicDataset(ds),
    filters: { baseId, managerId, ...range },
    kpis,
    rows: scoped.rows,
    unmatched: scoped.unmatched,
    byBase: scoped.byBase.map((x) => ({
      id: x.key, name: baseNameOf(x.key), color: (ctx.baseMap[x.key] || {}).color || '#94a3b8', metrics: x.metrics, count: x.count,
      targets: x.key ? targetMap('base', x.key) : {}
    })).sort((a, b) => (b.metrics[Object.keys(b.metrics)[0]] || 0) - (a.metrics[Object.keys(a.metrics)[0]] || 0)),
    byManager: scoped.byManager.map((x) => {
      const rec = db.org.find((o) => String(o.empId).toUpperCase() === String(x.key).toUpperCase());
      return {
        id: x.key, name: managerNameOf(x.key), teamName: rec ? rec.teamName : '',
        baseId: rec ? rec.baseId : '', baseName: rec ? baseNameOf(rec.baseId) : '',
        color: rec ? (ctx.baseMap[rec.baseId] || {}).color || '#94a3b8' : '#94a3b8',
        metrics: x.metrics, count: x.count, targets: x.key ? targetMap('manager', x.key) : {}
      };
    }).sort((a, b) => b.count - a.count),
    byTeam: scoped.byTeam.map((x) => ({ name: x.key, metrics: x.metrics, count: x.count })),
    byMonth: scoped.byMonth.map((x) => ({ month: x.key, metrics: x.metrics, count: x.count })),
    byStatus: scoped.byStatus.map((x) => ({ name: x.key, count: x.count, metrics: x.metrics })),
    byChannel: scoped.byChannel.map((x) => ({ name: x.key, count: x.count, metrics: x.metrics })),
    byEmp: scoped.byEmp.slice(0, 30).map((x) => {
      const rec = db.org.find((o) => String(o.empId).toUpperCase() === String(x.key).toUpperCase());
      return {
        empId: x.key, name: rec ? rec.name : x.key, teamName: rec ? rec.teamName : '',
        managerId: rec ? rec.managerId : '', managerName: rec ? rec.managerName : '',
        baseId: rec ? rec.baseId : '', baseName: rec ? baseNameOf(rec.baseId) : '',
        metrics: x.metrics, count: x.count
      };
    }),
    byStatusAll: engine.aggregate(ds, rawRows, ctx, { baseId: 'all', managerId: 'all', from: '', to: '' }).byStatus.map((x) => ({ name: x.key, count: x.count })),
    global: globalAgg ? { total: globalAgg.total, rows: globalAgg.rows } : null,
    targetSummary: buildTargetSummary(targetScope, targetKeys, range)
  };
}

function buildTargetSummary(scope, keys, range) {
  const metrics = {};
  db.targets.forEach((t) => {
    if (scope && t.scope !== scope) return;
    if (keys && keys.length && !keys.includes(t.key)) return;
    const periods = engine.getPeriods(range.from, range.to);
    if (periods && !periods.includes(t.period)) return;
    metrics[t.metric] = (metrics[t.metric] || 0) + Number(t.value || 0);
  });
  return metrics;
}

/** 明细名单：标准化 + 筛选（基地账号强制本基地；不脱敏，由调用方决定） */
function listRecords(user, q) {
  const ds = datasetById(q.dataset || (db.datasets[0] && db.datasets[0].id));
  if (!ds) return { error: '数据集不存在' };
  const ctx = ctxOf();
  const statuses = new Set();
  let all = (db.rows[ds.id] || []).map((r, idx) => {
    const s = engine.standardize(r, ds, ctx);
    s._rowNo = r._rowNo || idx + 1;
    // KOC 底表：附原始上传行，详情抽屉只展示用户上传的字段（不含系统生成列）
    if (ds.preset === 'koc') s._raw = r;
    if (s.status) statuses.add(s.status);
    return s;
  });
  let rows = all;
  const isBaseUser = user.role === 'base';
  if (isBaseUser) rows = rows.filter((r) => r.baseId === user.baseId);
  else if (q.base && q.base !== 'all') rows = rows.filter((r) => r.baseId === q.base);
  if (q.status && q.status !== 'all') rows = rows.filter((r) => r.status === q.status);
  if (q.channel && q.channel !== 'all') rows = rows.filter((r) => r.channel === q.channel);
  if (q.from) rows = rows.filter((r) => r.date && r.date >= q.from);
  if (q.to) rows = rows.filter((r) => r.date && r.date <= q.to);
  if (q.q) {
    const kw = String(q.q).trim().toLowerCase();
    rows = rows.filter((r) => `${r.customer} ${r.phone} ${r.empName} ${r.empId}`.toLowerCase().includes(kw));
  }
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (a._rowNo - b._rowNo));
  return { ds, rows, statuses: [...statuses] };
}

/** 标准记录 -> 原始底表行（按 mapping 反向写回） */
function rawRowFromRecord(ds, rec, existing) {
  const raw = existing ? { ...existing } : {};
  const map = ds.mapping || {};
  const set = (stdKey, value) => {
    if (value === undefined) return;
    const col = map[stdKey] || stdKey;
    raw[col] = value === null ? '' : String(value);
  };
  const baseIdRaw = String(rec.base || '').trim();
  const baseHit = baseIdRaw ? db.bases.find((b) => b.id === baseIdRaw || b.name === baseIdRaw || b.code === baseIdRaw.toUpperCase()) : null;
  set('date', rec.date !== undefined ? (engine.normDate(rec.date) || rec.date) : undefined);
  set('base', rec.base !== undefined ? (baseHit ? baseHit.name : baseIdRaw) : undefined);
  set('empId', rec.empId);
  set('empName', rec.empName);
  set('customer', rec.customer);
  set('phone', rec.phone);
  set('status', rec.status);
  set('channel', rec.channel);
  if (rec.amount !== undefined && rec.amount !== '') {
    const col = map.amount || 'amount';
    raw[col] = String(rec.amount);
  }
  return raw;
}

/* ---------------- 路由 ---------------- */

async function handleApi(req, res, url) {
  const p = url.pathname.replace(/^\/api/, '');
  const method = req.method.toUpperCase();
  const user = currentUser(req);

  if (p === '/login' && method === 'POST') {
    const body = await readBody(req);
    const acc = db.accounts.find((a) => a.username === String(body.username || '').trim());
    if (!acc || acc.password !== hash(body.password || '')) {
      return sendJson(res, 401, { error: '账号或密码不正确' });
    }
    if (acc.status !== 'active') return sendJson(res, 403, { error: '账号已停用，请联系管理员' });
    const sid = crypto.randomBytes(24).toString('hex');
    const session = { uid: acc.id, at: Date.now() };
    sessions.set(sid, session);
    persistSession(sid, session);
    acc.lastLogin = nowStr();
    saveDb();
    res.setHeader('set-cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
    return sendJson(res, 200, { user: publicUser(acc) });
  }

  if (p === '/logout' && method === 'POST') {
    const sid = parseCookies(req).sid;
    if (sid) { sessions.delete(sid); persistSession(sid, null); saveDb(); }
    res.setHeader('set-cookie', 'sid=; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  if (!user) return sendJson(res, 401, { error: '未登录或登录已过期' });

  /* ---- 通用 ---- */
  if (p === '/me') return sendJson(res, 200, { user: publicUser(user) });

  if (p === '/bootstrap' && method === 'GET') {
    const isAdmin = user.role === 'admin';
    const managers = db.org
      .filter((o) => o.level === '高经')
      .map((o) => ({ empId: o.empId, name: o.name, teamName: o.teamName, baseId: o.baseId }));
    return sendJson(res, 200, {
      user: publicUser(user),
      bases: db.bases,
      managers,
      datasets: db.datasets.map(publicDataset),
      accounts: isAdmin ? db.accounts.map((a) => ({
        id: a.id, username: a.username, name: a.name, role: a.role, title: a.title,
        baseId: a.baseId, scopes: a.scopes || [], status: a.status,
        createdAt: a.createdAt, lastLogin: a.lastLogin
      })) : [],
      overview: isAdmin ? {
        totalRows: db.datasets.reduce((s, d) => s + (d.rowCount || 0), 0),
        orgCount: db.org.length,
        managerCount: managers.length,
        targetCount: db.targets.length,
        accountCount: db.accounts.length,
        lastUpdate: db.datasets.map((d) => d.updatedAt).sort().pop() || '—',
        datasets: db.datasets.map((d) => ({ id: d.id, name: d.name, rowCount: d.rowCount, updatedAt: d.updatedAt }))
      } : null,
      audits: isAdmin ? db.audits.slice(0, 12) : [],
      targetPeriods: [...new Set(db.targets.map((t) => t.period))].sort(),
      settings: db.settings,
      recordColumns: RECORD_COLUMNS,
      versions: db.versions,
      activeVersionId: db.activeVersionId
    });
  }

  if (p === '/dashboard' && method === 'GET') {
    const q = Object.fromEntries(url.searchParams.entries());
    return sendJson(res, 200, buildDashboard(user, q));
  }

  /* ---- 前台：元信息 / 明细名单 / 业绩排行 / 专项汇总 ---- */

  if (p === '/meta' && method === 'GET') {
    const ver = activeVersion();
    return sendJson(res, 200, {
      settings: db.settings,
      bases: db.bases.filter((b) => b.status !== 'disabled'),
      datasets: db.datasets.map((d) => ({
        id: d.id, name: d.name, category: d.category, tone: d.tone, icon: d.icon,
        rowCount: d.rowCount, updatedAt: d.updatedAt
      })),
      version: ver ? { id: ver.id, label: ver.label, at: ver.createdAt } : null,
      user: publicUser(user)
    });
  }

  // 明细名单（前台：脱敏；基地账号强制本基地）
  const recordsExport = p === '/records/export' && method === 'GET';
  if ((p === '/records' && method === 'GET') || recordsExport) {
    const q = Object.fromEntries(url.searchParams.entries());
    const found = listRecords(user, q);
    if (found.error) return sendJson(res, 404, found);

    if (recordsExport) {
      const head = ['数据类别', '基地', '客户', '手机号', '状态', '渠道', '负责人', '工号', '日期'];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [head.map(esc).join(',')];
      found.rows.forEach((r) => {
        const m = maskRecord(r);
        lines.push([found.ds.name, m.baseName, m.customer, m.phone, m.status, m.channel, m.empName, m.empId, m.date].map(esc).join(','));
      });
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${encodeURIComponent(`明细名单-${found.ds.name}`)}.csv"`
      });
      res.end('\ufeff' + lines.join('\r\n'));
      return;
    }

    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize || 20)));
    const total = found.rows.length;
    const slice = found.rows.slice((page - 1) * pageSize, page * pageSize).map(maskRecord);
    return sendJson(res, 200, {
      dataset: {
        id: found.ds.id, name: found.ds.name, category: found.ds.category,
        preset: found.ds.preset || '',
        kocConfig: found.ds.preset === 'koc' ? kocCfgOf(found.ds) : null
      },
      total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
      statuses: found.statuses,
      rows: slice
    });
  }

  // 业绩排行（高经榜 / 团队榜 / 顾问榜，从取数引擎派生）
  if (p === '/rankings' && method === 'GET') {
    const q = Object.fromEntries(url.searchParams.entries());
    const ds = datasetById(q.dataset || (db.datasets[0] && db.datasets[0].id));
    if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
    const isBaseUser = user.role === 'base';
    const range = resolveRange(q);
    let baseId = q.base || 'all';
    if (isBaseUser) baseId = user.baseId;
    const ctx = ctxOf();
    const agg = engine.aggregate(ds, db.rows[ds.id] || [], ctx, { baseId, managerId: 'all', from: range.from, to: range.to });

    const metrics = ds.metrics || [];
    const primary = metrics[0] || { key: 'count', name: '数量', format: 'int' };
    const ratio = metrics.find((m) => m.type === 'ratio') || null;

    const baseNameOfR = (id) => (ctx.baseMap[id] ? ctx.baseMap[id].name : id || '未匹配');
    const targetOf = (scope, key) => {
      const out = {};
      metrics.forEach((m) => {
        const t = engine.targetSum(db.targets, { metric: m.key, scope, keys: [key], from: range.from, to: range.to });
        if (t !== null) out[m.key] = t;
      });
      return out;
    };

    const managerBoard = agg.byManager.map((x) => {
      const rec = db.org.find((o) => String(o.empId).toUpperCase() === String(x.key).toUpperCase());
      return {
        id: x.key,
        name: rec ? rec.name : x.key,
        teamName: rec ? rec.teamName : '',
        baseId: rec ? rec.baseId : '',
        baseName: rec ? baseNameOfR(rec.baseId) : '',
        metrics: x.metrics,
        targets: x.key ? targetOf('manager', x.key) : {}
      };
    }).sort((a, b) => (b.metrics[primary.key] || 0) - (a.metrics[primary.key] || 0));

    const teamBoard = agg.byTeam.map((x) => ({ name: x.key, metrics: x.metrics, count: x.count }))
      .sort((a, b) => (b.metrics[primary.key] || 0) - (a.metrics[primary.key] || 0));

    const empBoard = agg.byEmp.map((x) => {
      const rec = db.org.find((o) => String(o.empId).toUpperCase() === String(x.key).toUpperCase());
      return {
        empId: x.key,
        name: rec ? rec.name : x.key,
        teamName: rec ? rec.teamName : '',
        managerName: rec ? rec.managerName : '',
        baseId: rec ? rec.baseId : '',
        baseName: rec ? baseNameOfR(rec.baseId) : '',
        metrics: x.metrics
      };
    }).sort((a, b) => (b.metrics[primary.key] || 0) - (a.metrics[primary.key] || 0)).slice(0, 50);

    const topRow = managerBoard[0];
    return sendJson(res, 200, {
      dataset: { id: ds.id, name: ds.name, category: ds.category },
      metrics, primary, ratio,
      range: { from: range.from, to: range.to, range: range.range },
      note: db.settings.rankingsNote || '',
      canEditNote: user.role === 'admin',
      summary: {
        topName: topRow ? topRow.name : '—',
        topValue: topRow ? (topRow.metrics[primary.key] || 0) : 0,
        managerCount: managerBoard.length,
        empCount: empBoard.length,
        totalValue: (managerBoard.reduce((s, r) => s + (r.metrics[primary.key] || 0), 0))
      },
      boards: { manager: managerBoard, team: teamBoard, emp: empBoard },
      // 业绩底表：直推 / 接例子 / 目标匹配排名（前台业绩排行「业绩榜」使用）
      perf: ds.preset === 'perf' ? buildPerfReport(ds) : null
    });
  }

  // 2.5 直推未转化（窗口⑤ 跟进状态口径）
  // 2.5 方案 B：A-B-C 链路分析
  if (p === '/abc-chain' && method === 'GET') {
    const full = buildAbcChain();
    let rows = full.rows;
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const norm = (s) => String(s || '').trim().replace(/基地$/, '');
      const mine = norm(b ? b.name : '');
      if (mine) rows = rows.filter((r) => norm(r.base) === mine);
    }
    return sendJson(res, 200, { ...full, rows, summary: abcChainSummary(rows), scope: user.role });
  }

  if (p === '/direct-uncv' && method === 'GET') {
    const full = buildDirectUncv();
    let rows = full.rows;
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const norm = (s) => String(s || '').trim().replace(/基地$/, '');
      const mine = norm(b ? b.name : '');
      if (mine) rows = rows.filter((r) => norm(r.base) === mine);
    }
    return sendJson(res, 200, { ...full, rows, summary: directUncvSummary(rows, full.summary), scope: user.role });
  }

  // 2.6 KOC 三类分层
  if (p === '/koc-tier' && method === 'GET') {
    const full = buildKocTier();
    let rows = full.rows;
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const norm = (s) => String(s || '').trim().replace(/基地$/, '');
      const mine = norm(b ? b.name : '');
      if (mine) rows = rows.filter((r) => norm(r.base) === mine);
    }
    const cnt = { A: 0, B: 0, C: 0 };
    rows.forEach((r) => { cnt[r.tier] += 1; });
    return sendJson(res, 200, { ...full, rows, summary: { ...full.summary, A: cnt.A, B: cnt.B, C: cnt.C }, scope: user.role });
  }

  // 2.7 钻石未使用
  if (p === '/diamond-unused' && method === 'GET') {
    const full = buildDiamondUnused();
    let rows = full.rows;
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const norm = (s) => String(s || '').trim().replace(/基地$/, '');
      const mine = norm(b ? b.name : '');
      if (mine) rows = rows.filter((r) => norm(r.base) === mine);
    }
    return sendJson(res, 200, { ...full, rows, summary: { ...full.summary, grantTotal: rows.reduce((s, r) => s + r.grant, 0), useTotal: rows.reduce((s, r) => s + r.use, 0), restTotal: rows.reduce((s, r) => s + Math.max(r.rest, 0), 0), unused: rows.filter((r) => r.state === '未消耗').length, partial: rows.filter((r) => r.state === '部分消耗').length, done: rows.filter((r) => r.state === '已用完').length, users: rows.length, matched: rows.filter((r) => r.matched).length, noRecord: rows.filter((r) => !r.matched).length }, scope: user.role });
  }

  // 钻石兑换明细（窗口⑤ 已转化订单明细）
  if (p === '/diamond-orders' && method === 'GET') {
    const full = buildDiamondOrders();
    let rows = full.rows;
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const norm = (s) => String(s || '').trim().replace(/基地$/, '');
      const mine = norm(b ? b.name : '');
      if (mine) rows = rows.filter((r) => norm(r.base) === mine);
    }
    return sendJson(res, 200, { ...full, rows, summary: { orders: rows.length, amount: rows.reduce((s, r) => s + r.amount, 0), emps: new Set(rows.map((r) => r.empId).filter(Boolean)).size }, scope: user.role });
  }

  // 2.8 龙珠奖
  if (p === '/dragon' && method === 'GET') {
    const full = buildDragon();
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const norm = (s) => String(s || '').trim().replace(/基地$/, '');
      const mine = norm(b ? b.name : '');
      const filterPerson = (rows) => rows.filter((r) => norm(r.base || '') === mine);
      full.boards.A.month.forEach((x) => { x.rows = filterPerson(x.rows); });
      full.boards.A.quarter.forEach((x) => { x.rows = filterPerson(x.rows); });
      full.boards.A.year.forEach((x) => { x.rows = filterPerson(x.rows); });
      full.boards.B.forEach((x) => { x.rows = filterPerson(x.rows); });
      full.boards.C.forEach((x) => { x.rows = filterPerson(x.rows); });
    }
    return sendJson(res, 200, { ...full, scope: user.role });
  }

  // 2.9 高经团队业绩（双口径数透：直推 + 接leads）
  if (p === '/gj-team' && method === 'GET') {
    let bases = buildGjTeam();
    if (user.role === 'base' && user.baseId) {
      const b = db.bases.find((x) => x.id === user.baseId);
      const mine = b ? String(b.name).replace(/基地$/, '') : '';
      bases = mine && bases[mine] ? { [mine]: bases[mine] } : {};
    }
    const q = Object.fromEntries(url.searchParams.entries());
    let calc = null;
    if (q.base && q.gj && bases[q.base]) calc = gjTeamCalc(q.base, q.gj);
    return sendJson(res, 200, { bases, nullRules: db.gjTeam.nullRules, selections: db.gjTeam.selections, calc, scope: user.role, canEdit: user.role === 'admin' });
  }

  if (p === '/gj-team/select' && method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: '仅管理员可调整高经团队归属' });
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    const base = String(body.base || '').trim();
    const gjName = String(body.gjName || '').trim();
    const mgrs = Array.isArray(body.mgrs) ? body.mgrs.map((x) => String(x).trim()).filter(Boolean) : [];
    const includeSelf = !!body.includeSelf;
    const all = buildGjTeam();
    if (!all[base]) return sendJson(res, 400, { error: '基地不存在：' + base });
    if (!all[base].gjs.some((x) => x.name === gjName)) return sendJson(res, 400, { error: '该基地高结名单中无此人：' + gjName });
    const valid = new Set(all[base].mgrs.map((x) => x.name));
    const bad = mgrs.filter((x) => !valid.has(x));
    if (bad.length) return sendJson(res, 400, { error: '以下经理不在该基地名单：' + bad.join(', ') });
    db.gjTeam.selections[base + '|' + gjName] = { base, gjName, mgrs, includeSelf, at: nowStr(), by: user.name };
    audit(user, '调整高经团队归属', `${base} · ${gjName}：${mgrs.length} 位经理${includeSelf ? ' + 本人直管' : ''}`, req);
    saveDb();
    return sendJson(res, 200, { ok: true, calc: gjTeamCalc(base, gjName) });
  }

  if (p === '/gj-team/nullrule' && method === 'POST') {
    if (user.role !== 'admin') return sendJson(res, 403, { error: '仅管理员可维护 null 归属规则' });
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    const source = body.source === 'dc' ? 'dc' : 'ys';
    const base = String(body.base || '').trim();
    const targetName = String(body.targetName || '').trim();
    if (!base) return sendJson(res, 400, { error: '缺少基地' });
    const rules = db.gjTeam.nullRules;
    const i = rules.findIndex((x) => x.source === source && x.base === base);
    if (!targetName) {
      if (i >= 0) { rules.splice(i, 1); audit(user, '删除 null 归属规则', `${source === 'ys' ? '直推' : '接leads'} · ${base}`, req); }
    } else {
      const rec = { id: i >= 0 ? rules[i].id : 'nr_' + crypto.randomBytes(3).toString('hex'), source, base, targetName, targetEmpId: String(body.targetEmpId || '').trim(), enabled: body.enabled !== false, at: nowStr(), by: user.name, note: String(body.note || '') };
      if (i >= 0) rules[i] = rec; else rules.push(rec);
      audit(user, '设置 null 归属规则', `${source === 'ys' ? '直推' : '接leads'} · ${base} → ${targetName}`, req);
    }
    saveDb();
    return sendJson(res, 200, { ok: true, nullRules: rules });
  }

  if (p === '/direct-uncv/followup' && method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    const phone = String(body.phone || '').trim();
    const status = String(body.status || '').trim();
    if (!phone) return sendJson(res, 400, { error: '缺少手机号' });
    if (!DUNCV_STATUSES.includes(status)) return sendJson(res, 400, { error: '跟进状态不合法' });
    if (!db.followups) db.followups = {};
    db.followups[phone] = { status, by: user.name, at: nowStr() };
    audit(user, '更新直推未转化跟进状态', `${phone} → ${status}`, req);
    return sendJson(res, 200, { ok: true, phone, status, by: user.name, at: db.followups[phone].at });
  }

  // 专项明细（按基地汇总）
  if (p === '/tables' && method === 'GET') {
    const q = Object.fromEntries(url.searchParams.entries());
    const ds = datasetById(q.dataset || (db.datasets[0] && db.datasets[0].id));
    if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
    const isBaseUser = user.role === 'base';
    const ctx = ctxOf();
    const agg = engine.aggregate(ds, db.rows[ds.id] || [], ctx, { baseId: 'all', managerId: 'all', from: '', to: '' });
    const metrics = ds.metrics || [];

    const byBase = agg.byBase.map((x) => {
      const base = ctx.baseMap[x.key];
      return {
        id: x.key, name: base ? base.name : (x.key || '未匹配'), color: base ? base.color : '#94a3b8',
        metrics: x.metrics, count: x.count,
        targets: x.key ? (() => {
          const out = {};
          metrics.forEach((m) => {
            const t = engine.targetSum(db.targets, { metric: m.key, scope: 'base', keys: [x.key] });
            if (t !== null) out[m.key] = t;
          });
          return out;
        })() : {}
      };
    }).filter((b) => (isBaseUser ? b.id === user.baseId : true))
      .sort((a, b) => (b.metrics[(metrics[0] || {}).key] || 0) - (a.metrics[(metrics[0] || {}).key] || 0));

    return sendJson(res, 200, {
      dataset: {
        id: ds.id, name: ds.name, category: ds.category, tone: ds.tone,
        preset: ds.preset || '',
        kocConfig: ds.preset === 'koc' ? kocCfgOf(ds) : null,
        caliber: ds.caliber || '', updatedAt: ds.updatedAt
      },
      metrics,
      total: agg.rows,
      unmatched: agg.unmatched,
      // KOC 底表：附名单分层与重合人数，供专项明细页导出 Excel
      tiers: ds.preset === 'koc' ? {
        tierA: agg.total.tierA || 0,
        tierB: agg.total.tierB || 0,
        tierC: agg.total.tierC || 0,
        overlap: agg.total.overlap || 0,
        none: Math.max(0, agg.rows - (agg.total.tierA || 0) - (agg.total.tierB || 0) - (agg.total.tierC || 0))
      } : null,
      byBase
    });
  }

  /* ---- 管理员接口 ---- */
  if (p.startsWith('/admin/')) {
    if (user.role !== 'admin') return sendJson(res, 403, { error: '仅管理员可操作' });

    // 新增数据集（自建底表）
    if (p === '/admin/datasets' && method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: '请填写底表名称' });
      if (db.datasets.some((d) => d.name === name)) return sendJson(res, 400, { error: '底表名称已存在' });
      const CATS = ['线索类', '业绩类', '过程类', '其他'];
      const TONES = ['blue', 'violet', 'green', 'amber'];
      const ICONS = ['user-plus', 'spark', 'wallet', 'phone', 'database'];
      const preset = PRESETS[String(body.preset || '')] || null;
      const standardFields = Array.isArray(body.standardFields) && body.standardFields.length
        ? body.standardFields
        : preset ? preset.standardFields.map((f) => ({ ...f }))
        : DEFAULT_STANDARD_FIELDS.map((f) => ({ ...f }));
      const metrics = Array.isArray(body.metrics) && body.metrics.length
        ? body.metrics
        : preset ? preset.metrics.map((m) => ({ ...m }))
        : [{ key: 'list', name: '记录数', type: 'count', field: '', filter: null, unit: '条', format: 'int', scope: 'base', desc: '底表总行数，创建后请在「取数逻辑」中完善指标口径' }];
      const ds = {
        id: `ds_${crypto.randomBytes(4).toString('hex')}`,
        key: `custom_${crypto.randomBytes(2).toString('hex')}`,
        name,
        preset: String(body.preset || ''),
        category: CATS.includes(body.category) ? body.category : (preset ? preset.category : '其他'),
        desc: String(body.desc || (preset ? preset.desc : '')),
        icon: ICONS.includes(body.icon) ? body.icon : (preset && ICONS.includes(preset.icon) ? preset.icon : 'database'),
        tone: TONES.includes(body.tone) ? body.tone : (preset && TONES.includes(preset.tone) ? preset.tone : 'blue'),
        columns: standardFields.map((f) => f.label),
        standardFields,
        mapping: (body.mapping && typeof body.mapping === 'object') ? body.mapping : {},
        metrics,
        caliber: String(body.caliber || ''),
        dimensions: ['base', 'manager', 'team', 'month', 'status', 'empId'],
        visibility: { scopeToggle: true, allowManagerDrill: true },
        status: 'ready', rowCount: 0, fileName: '',
        updatedAt: nowStr(), updatedBy: user.name, history: []
      };
      db.datasets.push(ds);
      saveDb();
      audit(user, '新增底表', `${ds.name} · ${ds.category}`, req);
      return sendJson(res, 200, { dataset: publicDataset(ds) });
    }

    // 删除数据集（系统至少保留 1 张）
    const dsDelMatch = p.match(/^\/admin\/datasets\/([^/]+)$/);
    if (dsDelMatch && method === 'DELETE') {
      const ds = datasetById(dsDelMatch[1]);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      if (db.datasets.length <= 1) return sendJson(res, 400, { error: '系统至少保留 1 张底表' });
      db.datasets = db.datasets.filter((d) => d.id !== ds.id);
      delete db.rows[ds.id];
      if (db.settings.kpiToggles) delete db.settings.kpiToggles[ds.id];
      if (db.settings.feishu && db.settings.feishu.tableIds) delete db.settings.feishu.tableIds[ds.id];
      saveDb();
      audit(user, '删除底表', `${ds.name} · 清理 ${ds.rowCount || 0} 行数据及 KPI/飞书绑定`, req);
      return sendJson(res, 200, { ok: true });
    }

    // 数据集配置
    const configMatch = p.match(/^\/admin\/datasets\/([^/]+)\/config$/);
    if (configMatch && (method === 'PUT' || method === 'POST')) {
      const ds = datasetById(configMatch[1]);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      const body = await readBody(req);
      if (body.mapping) ds.mapping = body.mapping;
      if (Array.isArray(body.metrics)) ds.metrics = body.metrics;
      if (typeof body.caliber === 'string') ds.caliber = body.caliber;
      if (typeof body.name === 'string' && body.name.trim()) ds.name = body.name.trim();
      if (Array.isArray(body.dimensions)) ds.dimensions = body.dimensions;
      if (body.visibility) ds.visibility = body.visibility;
      saveDb();
      audit(user, '更新取数逻辑', `${ds.name} · 字段映射 / 指标口径调整`, req);
      return sendJson(res, 200, { dataset: publicDataset(ds) });
    }

    // 取数逻辑草稿预览（不落库）
    const previewMatch = p.match(/^\/admin\/datasets\/([^/]+)\/preview$/);
    if (previewMatch && method === 'POST') {
      const ds = datasetById(previewMatch[1]);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      const body = await readBody(req);
      const draft = { ...ds, mapping: body.mapping || ds.mapping, metrics: body.metrics || ds.metrics };
      const ctx = ctxOf();
      const agg = engine.aggregate(draft, db.rows[ds.id] || [], ctx, {
        baseId: body.baseId || 'all', managerId: body.managerId || 'all', from: body.from || '', to: body.to || ''
      });
      return sendJson(res, 200, {
        total: agg.total, rows: agg.rows, unmatched: agg.unmatched,
        byBase: agg.byBase.slice(0, 10), byManager: agg.byManager.slice(0, 8), byMonth: agg.byMonth
      });
    }

    // 底表上传（追加模式自动跳过「基地+客户+手机号+状态」完全相同的重复行）
    const uploadMatch = p.match(/^\/admin\/datasets\/([^/]+)\/upload$/);
    if (uploadMatch && method === 'POST') {
      const ds = datasetById(uploadMatch[1]);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      const body = await readBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return sendJson(res, 400, { error: '没有解析到有效数据行' });
      const isKoc = ds.preset === 'koc';
      const isPerf = ds.preset === 'perf';
      const segment = isKoc ? (body.segment === 'y26' ? 'y26' : 'cum')
        : isPerf ? (PERF_SEGS.includes(body.segment) ? body.segment : 'direct') : '';
      const mode = isKoc ? (segment === 'y26' ? 'merge' : 'replace')
        : isPerf ? 'replace'
        : (body.mode === 'append' ? 'append' : 'replace');
      // KOC：两段上传文件列名相同，统一归一化为标准列名存储，才能按人合并
      // 业绩：五段上传（接例子/直推/订单池/直推目标/接例子目标），各段归一化存储
      const cleaned = isKoc
        ? canonicalizeKocRows(ds, rows, body.mapping || ds.mapping)
        : isPerf
        ? canonicalizePerfRows(segment, rows, body.mapping || {})
        : rows.map((r, i) => ({ ...r, _rowNo: i + 1 }));
      let skipped = 0;
      let mergeInfo = null;
      if (isPerf) {
        db.rows[`${ds.id}:${segment}`] = cleaned;
      } else if (mode === 'append' && (db.rows[ds.id] || []).length) {
        // 去重键：名单类用「基地+客户+手机号+状态」；汇总类（无客户/手机号）用「工号+老用户ID」；全无则退回整行指纹
        const keyOf = (r) => {
          const col = (k) => (body.mapping || ds.mapping || {})[k] || k;
          const val = (r, k) => String(r[col(k)] ?? r[k] ?? '').trim();
          const parts = ['base', 'customer', 'phone', 'status'].map((k) => val(r, k));
          if (parts[1] || parts[2]) return parts.join('|');
          const alt = ['empId', 'oldUserId'].map((k) => val(r, k)).filter(Boolean);
          if (alt.length) return `id:${alt.join('|')}|${parts[0]}`;
          return 'row:' + JSON.stringify(Object.keys(r).filter((k) => k !== '_rowNo').sort().map((k) => [k, r[k]]));
        };
        const existing = new Set((db.rows[ds.id] || []).map(keyOf));
        const fresh = [];
        cleaned.forEach((r) => {
          if (existing.has(keyOf(r))) { skipped += 1; return; }
          existing.add(keyOf(r));
          fresh.push(r);
        });
        db.rows[ds.id] = (db.rows[ds.id] || []).concat(fresh.map((r, i) => ({ ...r, _rowNo: (db.rows[ds.id] || []).length + i + 1 })));
      } else if (mode === 'merge') {
        const list = (db.rows[ds.id] || []).slice();
        const { updated, added } = mergeKocRows(list, cleaned);
        db.rows[ds.id] = list.concat(added).map((r, i) => ({ ...r, _rowNo: i + 1 }));
        mergeInfo = { updated, added: added.length };
      } else {
        db.rows[ds.id] = mode === 'append' ? (db.rows[ds.id] || []).concat(cleaned) : cleaned;
      }
      if (isKoc) {
        recomputeKocTiers(db.rows[ds.id], kocCfgOf(ds));
        // 归一化后底表列即标准列名，映射固定为恒等，保证取数逻辑展示与计算一致
        ds.mapping = (ds.standardFields || []).reduce((m, f) => { m[f.key] = f.label; return m; }, {});
      }
      if (body.mapping && !isKoc && !isPerf) ds.mapping = body.mapping;
      if (!isPerf) ds.rowCount = db.rows[ds.id].length;
      ds.fileName = body.fileName || ds.fileName;
      ds.updatedAt = nowStr();
      ds.updatedBy = user.name;
      ds.status = 'ready';
      // KOC 两段上传状态：记录每段文件/行数/时间；重传 ① 历史累计表会替换全表并清空 26年列，因此重置 ② 的状态
      if (isKoc) {
        ds.segments = { ...(ds.segments || {}), [segment]: { file: ds.fileName, rows: cleaned.length - skipped, at: ds.updatedAt } };
        if (segment === 'cum') delete ds.segments.y26;
      }
      // 业绩五段上传状态
      if (isPerf) {
        ds.segments = { ...(ds.segments || {}), [segment]: { file: ds.fileName, rows: cleaned.length, at: ds.updatedAt } };
      }
      ds.history = [{ at: ds.updatedAt, by: user.name, rows: cleaned.length - skipped, mode, file: ds.fileName }]
        .concat(ds.history || []).slice(0, 12);
      // 上传时填写了版本名 -> 同时发布新版本
      let version = null;
      if (body.versionLabel) {
        version = publishVersion(user, String(body.versionLabel).trim());
        audit(user, '发布版本', `${version.label} · ${version.rows} 行数据`, req);
      }
      saveDb();
      const PERF_SEG_NAMES = { leads: '销售接例子数据', direct: '销售直推数据', orders: '订单池', targetDirectGj: '高经团队直推目标', targetDirectJl: '经理团队直推目标', targetLeads: '接例子目标' };
      audit(user, '上传底表', isKoc
        ? `${ds.name} · ${segment === 'y26' ? '26年本年表合并' : '历史累计表替换'}：更新 ${mergeInfo ? mergeInfo.updated : cleaned.length} 人${mergeInfo && mergeInfo.added ? ` · 新增 ${mergeInfo.added} 人` : ''}`
        : isPerf
        ? `${ds.name} · ${PERF_SEG_NAMES[segment]}：写入 ${cleaned.length} 行`
        : `${ds.name} · ${mode === 'append' ? '追加' : '替换'}导入 ${cleaned.length - skipped} 行${skipped ? ` · 跳过重复 ${skipped} 行` : ''}`, req);
      return sendJson(res, 200, { dataset: publicDataset(ds), skipped, merge: mergeInfo, version });
    }

    // 原始底表预览
    const rowsMatch = p.match(/^\/admin\/datasets\/([^/]+)\/rows$/);
    if (rowsMatch && method === 'GET') {
      const ds = datasetById(rowsMatch[1]);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      const limit = Math.min(Number(url.searchParams.get('limit') || 30), 200);
      const offset = Number(url.searchParams.get('offset') || 0);
      const ctx = ctxOf();
      const all = (db.rows[ds.id] || []).slice(offset, offset + limit)
        .map((r) => engine.standardize(r, ds, ctx));
      return sendJson(res, 200, { total: (db.rows[ds.id] || []).length, rows: all, offset, limit });
    }

    // 账号
    if (p === '/admin/accounts' && method === 'GET') {
      return sendJson(res, 200, { accounts: db.accounts.map((a) => ({ ...a, password: undefined })) });
    }
    if (p === '/admin/accounts' && method === 'POST') {
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      if (!username) return sendJson(res, 400, { error: '请填写登录账号' });
      if (db.accounts.some((a) => a.username === username)) return sendJson(res, 400, { error: '账号已存在' });
      if (body.role === 'base' && !body.baseId) return sendJson(res, 400, { error: '基地账号必须绑定基地' });
      const acc = {
        id: `acc_${crypto.randomBytes(4).toString('hex')}`,
        username,
        password: hash(body.password || '123456'),
        name: String(body.name || username).trim(),
        role: body.role === 'base' ? 'base' : 'admin',
        title: String(body.title || (body.role === 'base' ? '基地负责人' : '转介绍组')),
        baseId: body.role === 'base' ? body.baseId : '',
        scopes: Array.isArray(body.scopes) ? body.scopes : [],
        status: 'active',
        createdAt: nowStr(),
        lastLogin: ''
      };
      db.accounts.push(acc);
      saveDb();
      audit(user, '新建账号', `${acc.username} · ${acc.role === 'admin' ? '后台管理员' : '基地查看' }`, req);
      return sendJson(res, 200, { account: { ...acc, password: undefined } });
    }
    const accMatch = p.match(/^\/admin\/accounts\/([^/]+)$/);
    if (accMatch && method === 'PUT') {
      const acc = db.accounts.find((a) => a.id === accMatch[1]);
      if (!acc) return sendJson(res, 404, { error: '账号不存在' });
      const body = await readBody(req);
      if (body.name) acc.name = body.name;
      if (body.title !== undefined) acc.title = body.title;
      if (body.role) acc.role = body.role === 'base' ? 'base' : 'admin';
      if (body.baseId !== undefined) acc.baseId = acc.role === 'base' ? body.baseId : '';
      if (body.status) acc.status = body.status;
      if (Array.isArray(body.scopes)) acc.scopes = body.scopes;
      if (body.password) acc.password = hash(body.password);
      saveDb();
      audit(user, '修改账号', `${acc.username} · ${acc.status === 'active' ? '启用' : '停用'}`, req);
      return sendJson(res, 200, { account: { ...acc, password: undefined } });
    }
    if (accMatch && method === 'DELETE') {
      const idx = db.accounts.findIndex((a) => a.id === accMatch[1]);
      if (idx < 0) return sendJson(res, 404, { error: '账号不存在' });
      if (db.accounts[idx].role === 'admin' && db.accounts.filter((a) => a.role === 'admin' && a.status === 'active').length <= 1) {
        return sendJson(res, 400, { error: '至少保留一个启用中的管理员账号' });
      }
      const [removed] = db.accounts.splice(idx, 1);
      saveDb();
      audit(user, '删除账号', removed.username, req);
      return sendJson(res, 200, { ok: true });
    }
    const resetMatch = p.match(/^\/admin\/accounts\/([^/]+)\/reset$/);
    if (resetMatch && method === 'POST') {
      const acc = db.accounts.find((a) => a.id === resetMatch[1]);
      if (!acc) return sendJson(res, 404, { error: '账号不存在' });
      const body = await readBody(req);
      const pwd = String(body.password || '').trim() || `Tmp${crypto.randomBytes(3).toString('hex')}`;
      acc.password = hash(pwd);
      saveDb();
      audit(user, '重置密码', acc.username, req);
      return sendJson(res, 200, { password: pwd });
    }

    // 架构
    if (p === '/admin/org' && method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const baseId = url.searchParams.get('base') || 'all';
      const list = db.org
        .filter((o) => (baseId === 'all' ? true : o.baseId === baseId))
        .filter((o) => !q || `${o.empId} ${o.name} ${o.managerName} ${o.manager2 || ''} ${o.manager3 || ''} ${o.manager4 || ''} ${o.manager5 || ''} ${o.teamName}`.toLowerCase().includes(q))
        .sort((a, b) => (a.baseId.localeCompare(b.baseId)) || (a.managerId.localeCompare(b.managerId)) || a.empId.localeCompare(b.empId));
      return sendJson(res, 200, { total: db.org.length, rows: list });
    }
    if (p === '/admin/org/upload' && method === 'POST') {
      const body = await readBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return sendJson(res, 400, { error: '没有解析到架构数据' });
      const map = body.mapping || {};
      const baseByName = {};
      const stripBase = (s) => String(s || '').replace(/基地$/, '').trim();
      db.bases.forEach((b) => {
        baseByName[b.name] = b.id;
        baseByName[stripBase(b.name)] = b.id;
        baseByName[b.code.toUpperCase()] = b.id;
        baseByName[b.id] = b.id;
      });
      const cleanMgr = (v) => {
        const s = String(v || '').trim();
        return !s || ['/', '—', '-', '无', '空', 'N/A', 'na'].includes(s.toLowerCase()) ? '' : s;
      };
      const parsed = rows.map((r) => {
        const get = (k) => {
          const col = map[k] || k;
          const v = r[col] !== undefined ? r[col] : r[k];
          return v === undefined || v === null ? '' : String(v).trim();
        };
        const baseRaw = get('base');
        const empId = (get('empId') || get('account')).toUpperCase();
        const managerName = cleanMgr(get('managerName'));
        const manager2 = cleanMgr(get('manager2'));
        const manager3 = cleanMgr(get('manager3'));
        const manager4 = cleanMgr(get('manager4'));
        const manager5 = cleanMgr(get('manager5'));
        const teamName = cleanMgr(get('teamName')) || manager5 || manager4 || manager2;
        return {
          account: cleanMgr(get('account')),
          empId,
          name: cleanMgr(get('name')),
          baseId: baseByName[baseRaw] || baseByName[stripBase(baseRaw)] || baseRaw.toLowerCase(),
          baseOwner: cleanMgr(get('baseOwner')),
          managerId: get('managerId').toUpperCase(),
          managerName,
          manager2,
          manager3,
          manager4,
          manager5,
          teamName: teamName || '未分组',
          level: cleanMgr(get('level')),
          role: cleanMgr(get('role')) || '顾问',
          status: cleanMgr(get('status')) || '在职',
          effectiveDate: engine.normDate(get('effectiveDate')) || '2026-01-01'
        };
      }).filter((r) => r.empId);
      if (!parsed.length) return sendJson(res, 400, { error: '未识别到工号列，请检查字段映射' });
      // 层级自动推导：按「姓名」在各管理层级列中出现的次数判断（无层级列/层级为空时生效）
      const LEVEL_COLS = ['managerName', 'manager2', 'manager3', 'manager4', 'manager5'];
      const LEVEL_NAMES = ['高经', '经理', '储备经理', '主管', '组长'];
      const leadersByCol = {};
      LEVEL_COLS.forEach((col, i) => {
        const set = new Set();
        parsed.forEach((r) => { const n = r[col]; if (n && n !== r.name) set.add(n); });
        leadersByCol[i] = set;
      });
      // 高经姓名 → 工号 反查（优先取层级为高经的人）
      const idByName = {};
      parsed.forEach((r) => { if (r.name && !idByName[r.name]) idByName[r.name] = r.empId; });
      parsed.forEach((r) => {
        if (r.level) {
          r.level = ['一线', ...LEVEL_NAMES].includes(r.level) ? r.level : r.level;
        } else {
          const idx = LEVEL_COLS.findIndex((col, i) => i > 0 && leadersByCol[i].has(r.name));
          if (r.name && (leadersByCol[0].has(r.name) || r.managerName === r.name)) r.level = '高经';
          else if (idx >= 0) r.level = LEVEL_NAMES[idx];
          else r.level = r.managerName && r.managerName !== r.name ? '一线' : '高经';
        }
        if (!r.managerId && r.managerName && idByName[r.managerName]) r.managerId = idByName[r.managerName];
      });
      const mode = body.mode === 'append' ? 'append' : 'replace';
      if (mode === 'append') {
        const key = (r) => `${r.empId}|${r.effectiveDate}`;
        const existing = new Set(db.org.map(key));
        parsed.forEach((r) => { if (!existing.has(key(r))) db.org.push(r); });
      } else {
        db.org = parsed;
      }
      // 高经姓名补全
      const byId = {};
      db.org.forEach((o) => { byId[o.empId] = o; });
      db.org.forEach((o) => {
        if (o.managerId && byId[o.managerId] && !o.managerName) o.managerName = byId[o.managerId].name;
      });
      db.orgUpdatedAt = nowStr();
      saveDb();
      audit(user, '上传架构', `销售架构 · ${mode === 'append' ? '追加' : '覆盖'} ${parsed.length} 条`, req);
      return sendJson(res, 200, { total: db.org.length });
    }

    // 辅导架构：基地 / 年级学科 / 基地负责人 / 主管 / 组长 / 辅导老师 / 辅导ID / 工号 / 在职状态
    if (p === '/admin/tutor' && method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const baseId = url.searchParams.get('base') || 'all';
      const list = db.tutor
        .filter((o) => (baseId === 'all' ? true : o.baseId === baseId))
        .filter((o) => !q || `${o.empId} ${o.tutorId} ${o.name} ${o.subject} ${o.baseOwner || ''} ${o.manager4 || ''} ${o.manager5 || ''}`.toLowerCase().includes(q))
        .sort((a, b) => (a.baseId.localeCompare(b.baseId)) || a.name.localeCompare(b.name));
      return sendJson(res, 200, { total: db.tutor.length, rows: list });
    }
    if (p === '/admin/tutor/upload' && method === 'POST') {
      const body = await readBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return sendJson(res, 400, { error: '没有解析到辅导架构数据' });
      const map = body.mapping || {};
      const baseByName = {};
      const stripBase = (s) => String(s || '').replace(/基地$/, '').trim();
      db.bases.forEach((b) => {
        baseByName[b.name] = b.id;
        baseByName[stripBase(b.name)] = b.id;
        baseByName[b.code.toUpperCase()] = b.id;
        baseByName[b.id] = b.id;
      });
      const cleanMgr = (v) => {
        const s = String(v || '').trim();
        return !s || ['/', '—', '-', '无', '空', 'N/A', 'na'].includes(s.toLowerCase()) ? '' : s;
      };
      const parsed = rows.map((r) => {
        const get = (k) => {
          const col = map[k] || k;
          const v = r[col] !== undefined ? r[col] : r[k];
          return v === undefined || v === null ? '' : String(v).trim();
        };
        const baseRaw = get('base');
        const empId = (get('empId') || get('tutorId')).toUpperCase();
        return {
          empId,
          tutorId: cleanMgr(get('tutorId')),
          name: cleanMgr(get('name')),
          baseId: baseByName[baseRaw] || baseByName[stripBase(baseRaw)] || baseRaw.toLowerCase(),
          baseName: String(baseRaw || '').trim(),
          subject: cleanMgr(get('subject')),
          baseOwner: cleanMgr(get('baseOwner')),
          manager4: cleanMgr(get('manager4')),
          manager5: cleanMgr(get('manager5')),
          status: cleanMgr(get('status')) || '在职'
        };
      }).filter((r) => r.empId || r.name);
      if (!parsed.length) return sendJson(res, 400, { error: '未识别到工号 / 辅导ID 列，请检查字段映射' });
      // 层级自动推导：基地负责人 > 主管 > 组长 > 辅导老师（按姓名在各层级列中出现判断）
      const TUTOR_LEVEL_COLS = ['baseOwner', 'manager4', 'manager5'];
      const TUTOR_LEVEL_NAMES = ['基地负责人', '主管', '组长'];
      const leadersByCol = {};
      TUTOR_LEVEL_COLS.forEach((col, i) => {
        const set = new Set();
        parsed.forEach((r) => { const n = r[col]; if (n && n !== r.name) set.add(n); });
        leadersByCol[i] = set;
      });
      parsed.forEach((r) => {
        const idx = TUTOR_LEVEL_COLS.findIndex((col, i) => leadersByCol[i].has(r.name));
        r.level = idx >= 0 ? TUTOR_LEVEL_NAMES[idx] : '辅导老师';
        // 直属上级：辅导老师→组长，组长→主管，主管→基地负责人
        r.managerName = r.level === '辅导老师' ? r.manager5 : r.level === '组长' ? r.manager4 : r.level === '主管' ? r.baseOwner : '';
      });
      const mode = body.mode === 'append' ? 'append' : 'replace';
      if (mode === 'append') {
        const key = (r) => r.empId || r.tutorId || r.name;
        const existing = new Set(db.tutor.map(key));
        parsed.forEach((r) => { if (!existing.has(key(r))) db.tutor.push(r); });
      } else {
        db.tutor = parsed;
      }
      db.tutorUpdatedAt = nowStr();
      saveDb();
      audit(user, '上传辅导架构', `辅导架构 · ${mode === 'append' ? '追加' : '覆盖'} ${parsed.length} 条`, req);
      return sendJson(res, 200, { total: db.tutor.length });
    }

    /* ---- 架构单条编辑 / 删除（辅导架构，键：工号，兜底辅导ID） ---- */
    const tutorRowMatch = p.match(/^\/admin\/tutor\/([^/]+)$/);
    if (tutorRowMatch && (method === 'PUT' || method === 'DELETE')) {
      const key = decodeURIComponent(tutorRowMatch[1]).trim().toLowerCase();
      const idx = db.tutor.findIndex((r) =>
        String(r.empId || '').trim().toLowerCase() === key ||
        (!r.empId && String(r.tutorId || '').trim().toLowerCase() === key));
      if (idx < 0) return sendJson(res, 404, { error: '辅导架构中未找到该人员' });
      if (method === 'DELETE') {
        const [removed] = db.tutor.splice(idx, 1);
        db.tutorUpdatedAt = nowStr();
        saveDb();
        audit(user, '删除辅导架构人员', `${removed.name || ''} ${removed.empId || removed.tutorId || ''}`.trim(), req);
        return sendJson(res, 200, { ok: true, total: db.tutor.length });
      }
      const body = await readBody(req);
      const row = body.row || {};
      const cur = db.tutor[idx];
      // 基地文本 → baseId（与上传逻辑同规则）
      const stripBase = (s) => String(s || '').replace(/基地$/, '').trim();
      const baseByName = {};
      db.bases.forEach((b) => {
        baseByName[b.name] = b.id;
        baseByName[stripBase(b.name)] = b.id;
        baseByName[b.code.toUpperCase()] = b.id;
        baseByName[b.id] = b.id;
      });
      const get = (k) => (row[k] === undefined || row[k] === null ? undefined : String(row[k]).trim());
      const baseRaw = get('base');
      if (baseRaw !== undefined && baseRaw !== '') {
        cur.baseId = baseByName[baseRaw] || baseByName[stripBase(baseRaw)] || baseRaw.toLowerCase();
        cur.baseName = baseRaw;
      }
      ['empId', 'name', 'tutorId', 'subject', 'level', 'manager4', 'manager5', 'baseOwner', 'status'].forEach((k) => {
        const v = get(k);
        if (v !== undefined) cur[k] = v;
      });
      if (!cur.status) cur.status = '在职';
      // 直属上级按层级重算：辅导老师→组长，组长→主管，主管→基地负责人
      cur.managerName = cur.level === '辅导老师' ? (cur.manager5 || '') : cur.level === '组长' ? (cur.manager4 || '') : cur.level === '主管' ? (cur.baseOwner || '') : '';
      db.tutorUpdatedAt = nowStr();
      saveDb();
      audit(user, '修改辅导架构人员', `${cur.name || ''} ${cur.empId || ''}`.trim(), req);
      return sendJson(res, 200, { ok: true, row: cur });
    }

    /* ---- 架构单条编辑 / 删除（销售架构，键：工号 + 生效日期兜底） ---- */
    const orgRowMatch = p.match(/^\/admin\/org\/([^/]+)$/);
    if (orgRowMatch && (method === 'PUT' || method === 'DELETE')) {
      const key = decodeURIComponent(orgRowMatch[1]).trim().toUpperCase();
      const effDate = String(url.searchParams.get('date') || '').trim();
      const candidates = db.org.map((r, i) => ({ r, i })).filter((x) => String(x.r.empId || '').trim().toUpperCase() === key);
      if (!candidates.length) return sendJson(res, 404, { error: '销售架构中未找到该人员' });
      let picked = (effDate && candidates.find((x) => String(x.r.effectiveDate || '') === effDate)) || candidates[candidates.length - 1];
      const idx = picked.i;
      if (method === 'DELETE') {
        const [removed] = db.org.splice(idx, 1);
        db.orgUpdatedAt = nowStr();
        saveDb();
        audit(user, '删除销售架构人员', `${removed.name || ''} ${removed.empId || ''}`.trim(), req);
        return sendJson(res, 200, { ok: true, total: db.org.length });
      }
      const body = await readBody(req);
      const row = body.row || {};
      const cur = db.org[idx];
      const stripBase = (s) => String(s || '').replace(/基地$/, '').trim();
      const baseByName = {};
      db.bases.forEach((b) => {
        baseByName[b.name] = b.id;
        baseByName[stripBase(b.name)] = b.id;
        baseByName[b.code.toUpperCase()] = b.id;
        baseByName[b.id] = b.id;
      });
      const get = (k) => (row[k] === undefined || row[k] === null ? undefined : String(row[k]).trim());
      const baseRaw = get('base');
      if (baseRaw !== undefined && baseRaw !== '') {
        cur.baseId = baseByName[baseRaw] || baseByName[stripBase(baseRaw)] || baseRaw.toLowerCase();
      }
      ['empId', 'name', 'level', 'managerName', 'manager2', 'manager3', 'manager4', 'manager5', 'teamName'].forEach((k) => {
        const v = get(k);
        if (v !== undefined) cur[k] = v;
      });
      const eff = engine.normDate(get('effectiveDate'));
      if (eff) cur.effectiveDate = eff;
      // 高经姓名 → 工号反查
      if (cur.managerName) {
        const hit = db.org.find((o) => o.name === cur.managerName && ['高经'].includes(o.level)) ||
          db.org.find((o) => o.name === cur.managerName);
        if (hit) cur.managerId = hit.empId;
      }
      if (!cur.teamName) cur.teamName = cur.manager5 || cur.manager4 || cur.manager2 || '未分组';
      db.orgUpdatedAt = nowStr();
      saveDb();
      audit(user, '修改销售架构人员', `${cur.name || ''} ${cur.empId || ''}`.trim(), req);
      return sendJson(res, 200, { ok: true, row: cur });
    }

    // 目标
    // KOC 分层设置：阈值（划分层级）与颜色（层级颜色）
    if (p === '/admin/koc-config' && method === 'POST') {
      const body = await readBody(req);
      const ds = datasetById(String(body.datasetId || ''));
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      if (ds.preset !== 'koc') return sendJson(res, 400, { error: '仅高潜名单底表支持分层设置' });
      let t1 = Math.floor(Number(body.t1));
      if (!Number.isFinite(t1) || t1 < 1) return sendJson(res, 400, { error: '最高层级阈值必须是不小于 1 的整数' });
      let t2 = Math.floor(Number(body.t2));
      if (!Number.isFinite(t2) || t2 < 0) t2 = 0;
      if (t2 >= t1) t2 = t1 - 1;
      const colors = {};
      ['t1', 't2', 't3', 't4'].forEach((k) => {
        if (typeof body.colors === 'object' && body.colors && /^#[0-9a-fA-F]{6}$/.test(String(body.colors[k] || ''))) colors[k] = body.colors[k];
      });
      ds.kocConfig = Object.assign({}, kocCfgOf(ds), { t1, t2, colors: Object.assign({}, kocCfgOf(ds).colors, colors) });
      recomputeKocTiers(db.rows[ds.id], kocCfgOf(ds));
      saveDb();
      audit(user, 'KOC分层设置', `${ds.name} · 最高≥${t1} / 次层≥${t2}`, req);
      const counts = {};
      (db.rows[ds.id] || []).forEach((r) => { counts[r['KOC层级']] = (counts[r['KOC层级']] || 0) + 1; });
      return sendJson(res, 200, { ok: true, config: ds.kocConfig, counts });
    }

    if (p === '/admin/targets' && method === 'GET') {
      const period = url.searchParams.get('period') || '';
      const scope = url.searchParams.get('scope') || 'all';
      const list = db.targets.filter((t) => (!period || t.period === period) && (scope === 'all' || t.scope === scope));
      const periods = [...new Set(db.targets.map((t) => t.period))].sort();
      return sendJson(res, 200, { periods, list });
    }
    if (p === '/admin/targets/upload' && method === 'POST') {
      const body = await readBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return sendJson(res, 400, { error: '没有解析到目标数据' });
      const map = body.mapping || {};
      const baseByName = {};
      const stripBase = (s) => String(s || '').replace(/基地$/, '').trim();
      db.bases.forEach((b) => {
        baseByName[b.name] = b.id;
        baseByName[stripBase(b.name)] = b.id;
        baseByName[b.code.toUpperCase()] = b.id;
        baseByName[b.id] = b.id;
      });
      const managerByName = {};
      db.org.filter((o) => o.level === '高经').forEach((o) => { managerByName[o.name] = o.empId; managerByName[o.empId] = o.empId; });
      let added = 0;
      rows.forEach((r) => {
        const get = (k) => {
          const col = map[k] || k;
          const v = r[col] !== undefined ? r[col] : r[k];
          return v === undefined || v === null ? '' : String(v).trim();
        };
        const period = engine.normDate(get('period')).slice(0, 7) || get('period');
        const scopeRaw = get('scope');
        const keyRaw = get('key');
        const metricName = get('metricName');
        const metricKey = ({ 转化数: 'conv', 成交金额: 'amount', 线索量: 'list', 跟进量: 'list', 客单价: 'avg', 成交单数: 'orders' })[metricName] || get('metric') || 'conv';
        if (!period || !keyRaw) return;
        const isManager = managerByName[keyRaw] || scopeRaw === 'manager' || scopeRaw === '高经';
        const key = isManager ? (managerByName[keyRaw] || keyRaw) : (baseByName[keyRaw] || keyRaw.toLowerCase());
        const value = engine.toNumber(get('value'));
        const idx = db.targets.findIndex((t) => t.period === period && t.scope === (isManager ? 'manager' : 'base') && t.key === key && t.metric === metricKey);
        const rec = {
          period, scope: isManager ? 'manager' : 'base', key,
          keyName: isManager ? keyRaw : (db.bases.find((b) => b.id === key) || {}).name || keyRaw,
          metric: metricKey, metricName: metricName || metricKey, value
        };
        if (idx >= 0) db.targets[idx] = rec; else db.targets.push(rec);
        added += 1;
      });
      saveDb();
      audit(user, '上传目标', `业绩目标 · 写入 ${added} 条`, req);
      return sendJson(res, 200, { count: db.targets.length, written: added });
    }

    /* ---- 名单数据管理（单条增删改） ---- */
    if (p === '/admin/records' && method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      const found = listRecords(user, q);
      if (found.error) return sendJson(res, 404, found);
      const page = Math.max(1, Number(q.page || 1));
      const pageSize = Math.min(100, Math.max(5, Number(q.pageSize || 20)));
      const total = found.rows.length;
      const slice = found.rows.slice((page - 1) * pageSize, page * pageSize);
      const statuses = [...new Set((db.rows[found.ds.id] || []).map((r) => {
        const s = engine.standardize(r, found.ds, ctxOf());
        return s.status;
      }).filter(Boolean))];
      return sendJson(res, 200, {
        dataset: { id: found.ds.id, name: found.ds.name, standardFields: found.ds.standardFields },
        total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
        statuses, rows: slice
      });
    }

    if (p === '/admin/records' && method === 'POST') {
      const body = await readBody(req);
      const ds = datasetById(body.dataset);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      const rec = body.record || {};
      if (!rec.customer && !rec.phone) return sendJson(res, 400, { error: '请至少填写客户姓名或手机号' });
      const list = db.rows[ds.id] || (db.rows[ds.id] = []);
      const rowNo = list.reduce((m, r) => Math.max(m, r._rowNo || 0), 0) + 1;
      const raw = rawRowFromRecord(ds, rec, null);
      raw._rowNo = rowNo;
      list.push(raw);
      ds.rowCount = list.length;
      ds.updatedAt = nowStr();
      ds.updatedBy = user.name;
      ds.status = 'ready';
      saveDb();
      audit(user, '新增名单', `${ds.name} · 第 ${rowNo} 行 · ${rec.customer || rec.phone}`, req);
      return sendJson(res, 200, { rowNo, dataset: publicDataset(ds) });
    }

    const recMatch = p.match(/^\/admin\/records\/([^/]+)$/);
    if (recMatch) {
      const rowNo = Number(recMatch[1]);
      const q = Object.fromEntries(url.searchParams.entries());
      const ds = datasetById(q.dataset);
      if (!ds) return sendJson(res, 404, { error: '数据集不存在' });
      const list = db.rows[ds.id] || [];
      const idx = list.findIndex((r) => Number(r._rowNo) === rowNo);
      if (method === 'PUT') {
        if (idx < 0) return sendJson(res, 404, { error: '记录不存在' });
        const body = await readBody(req);
        const rec = body.record || {};
        const raw = rawRowFromRecord(ds, rec, list[idx]);
        raw._rowNo = list[idx]._rowNo;
        list[idx] = raw;
        ds.rowCount = list.length;
        ds.updatedAt = nowStr();
        ds.updatedBy = user.name;
        saveDb();
        audit(user, '修改名单', `${ds.name} · 第 ${rowNo} 行`, req);
        return sendJson(res, 200, { ok: true });
      }
      if (method === 'DELETE') {
        if (idx < 0) return sendJson(res, 404, { error: '记录不存在' });
        const [removed] = list.splice(idx, 1);
        ds.rowCount = list.length;
        ds.updatedAt = nowStr();
        ds.updatedBy = user.name;
        saveDb();
        audit(user, '删除名单', `${ds.name} · 第 ${rowNo} 行 · ${removed[(ds.mapping || {}).customer || 'customer'] || ''}`, req);
        return sendJson(res, 200, { ok: true });
      }
    }

    /* ---- 基地管理 ---- */
    if (p === '/admin/bases' && method === 'GET') {
      return sendJson(res, 200, {
        bases: db.bases.map((b) => ({
          ...b,
          accountCount: db.accounts.filter((a) => a.baseId === b.id && a.status === 'active').length,
          orgCount: db.org.filter((o) => o.baseId === b.id).length,
          managerCount: db.org.filter((o) => o.baseId === b.id && o.level === '高经').length
        }))
      });
    }
    if (p === '/admin/bases' && method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: '请填写基地名称' });
      if (db.bases.some((b) => b.name === name)) return sendJson(res, 400, { error: '基地名称已存在' });
      const code = String(body.code || name).trim().toUpperCase();
      if (db.bases.some((b) => b.code === code)) return sendJson(res, 400, { error: '基地编码已存在' });
      const base = {
        id: `base_${code.toLowerCase()}`,
        name,
        code,
        color: /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : PALETTE_FALLBACK[(db.bases.length) % PALETTE_FALLBACK.length],
        sort: Number(body.sort || db.bases.length + 1),
        status: body.status === 'disabled' ? 'disabled' : 'active'
      };
      db.bases.push(base);
      db.bases.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      saveDb();
      audit(user, '新增基地', `${base.name}（${base.code}）`, req);
      return sendJson(res, 200, { base });
    }
    const baseMatch = p.match(/^\/admin\/bases\/([^/]+)$/);
    if (baseMatch && (method === 'PUT' || method === 'DELETE')) {
      const base = db.bases.find((b) => b.id === baseMatch[1]);
      if (!base) return sendJson(res, 404, { error: '基地不存在' });
      if (method === 'PUT') {
        const body = await readBody(req);
        if (body.name) {
          const name = String(body.name).trim();
          if (db.bases.some((b) => b.id !== base.id && b.name === name)) return sendJson(res, 400, { error: '基地名称已存在' });
          base.name = name;
        }
        if (body.code) base.code = String(body.code).trim().toUpperCase();
        if (body.color && /^#[0-9a-fA-F]{6}$/.test(body.color)) base.color = body.color;
        if (body.sort !== undefined) base.sort = Number(body.sort) || 0;
        if (body.status) base.status = body.status === 'disabled' ? 'disabled' : 'active';
        db.bases.sort((a, b) => (a.sort || 0) - (b.sort || 0));
        saveDb();
        audit(user, '修改基地', `${base.name} · ${base.status === 'active' ? '启用' : '停用'}`, req);
        return sendJson(res, 200, { base });
      }
      // DELETE
      const boundAcc = db.accounts.filter((a) => a.baseId === base.id && a.status === 'active').length;
      if (boundAcc) return sendJson(res, 400, { error: `该基地还有 ${boundAcc} 个启用中的账号，请先处理账号` });
      const boundTarget = db.targets.filter((t) => t.scope === 'base' && t.key === base.id).length;
      if (boundTarget) return sendJson(res, 400, { error: `该基地还有 ${boundTarget} 条业绩目标，请先删除或调整目标` });
      db.bases = db.bases.filter((b) => b.id !== base.id);
      saveDb();
      audit(user, '删除基地', base.name, req);
      return sendJson(res, 200, { ok: true });
    }

    /* ---- 展示配置 ---- */
    if (p === '/admin/settings' && method === 'GET') {
      return sendJson(res, 200, { settings: db.settings, recordColumns: RECORD_COLUMNS });
    }
    if (p === '/admin/settings' && method === 'PUT') {
      const body = await readBody(req);
      ['title', 'subtitle', 'announcement', 'dataNote', 'rankingsNote'].forEach((k) => {
        if (typeof body[k] === 'string') db.settings[k] = body[k];
      });
      if (body.kpiToggles && typeof body.kpiToggles === 'object') db.settings.kpiToggles = body.kpiToggles;
      if (Array.isArray(body.recordColumns)) {
        db.settings.recordColumns = body.recordColumns.filter((c) => RECORD_COLUMNS.includes(c));
      }
      saveDb();
      audit(user, '更新展示配置', '前台标题 / 公告 / KPI 与列开关', req);
      return sendJson(res, 200, { settings: db.settings });
    }

    /* ---- 版本记录 ---- */
    if (p === '/admin/versions' && method === 'GET') {
      return sendJson(res, 200, { versions: db.versions, activeVersionId: db.activeVersionId, keep: VERSION_KEEP });
    }
    if (p === '/admin/versions/publish' && method === 'POST') {
      const body = await readBody(req);
      const snap = publishVersion(user, String(body.label || '').trim() || `版本 ${nowStr()}`);
      audit(user, '发布版本', `${snap.label} · ${snap.rows} 行数据`, req);
      return sendJson(res, 200, { version: snap, versions: db.versions, activeVersionId: db.activeVersionId });
    }
    const verMatch = p.match(/^\/admin\/versions\/([^/]+)\/activate$/);
    if (verMatch && method === 'POST') {
      const meta = activateVersion(verMatch[1]);
      if (!meta) return sendJson(res, 404, { error: '版本不存在或快照文件已丢失' });
      audit(user, '切换版本', `${meta.label} · 回滚至 ${meta.createdAt}`, req);
      return sendJson(res, 200, { version: meta, versions: db.versions, activeVersionId: db.activeVersionId });
    }
    const verDelMatch = p.match(/^\/admin\/versions\/([^/]+)$/);
    if (verDelMatch && method === 'DELETE') {
      const r = deleteVersion(verDelMatch[1]);
      if (r.error) return sendJson(res, 400, r);
      audit(user, '删除版本', verDelMatch[1], req);
      return sendJson(res, 200, { versions: db.versions, activeVersionId: db.activeVersionId });
    }

    /* ---- 飞书同步 ---- */
    if (p === '/admin/feishu' && method === 'GET') {
      const cfg = db.settings.feishu;
      return sendJson(res, 200, {
        feishu: {
          appId: cfg.appId,
          appSecretConfigured: Boolean(cfg.appSecret),
          appToken: cfg.appToken,
          autoSyncMinutes: cfg.autoSyncMinutes || 0,
          lastSync: cfg.lastSync
        },
        datasets: db.datasets.map((d) => ({ id: d.id, name: d.name, tableId: (cfg.tableIds || {})[d.id] || '', rowCount: d.rowCount }))
      });
    }
    if (p === '/admin/feishu' && method === 'PUT') {
      const body = await readBody(req);
      const cfg = db.settings.feishu;
      if (typeof body.appId === 'string') cfg.appId = body.appId.trim();
      if (typeof body.appSecret === 'string' && body.appSecret) cfg.appSecret = body.appSecret.trim(); // 留空 = 不修改
      if (typeof body.appToken === 'string') cfg.appToken = body.appToken.trim();
      if (body.autoSyncMinutes !== undefined) cfg.autoSyncMinutes = Math.max(0, Math.min(1440, Number(body.autoSyncMinutes) || 0));
      if (body.tableIds && typeof body.tableIds === 'object') {
        cfg.tableIds = {};
        db.datasets.forEach((d) => {
          const v = String(body.tableIds[d.id] || '').trim();
          if (v) cfg.tableIds[d.id] = v;
        });
      }
      saveDb();
      scheduleFeishuAutoSync();
      audit(user, '更新飞书配置', `自动同步 ${cfg.autoSyncMinutes ? `每 ${cfg.autoSyncMinutes} 分钟` : '关闭'} · 绑定 ${Object.keys(cfg.tableIds).length} 张表`, req);
      return sendJson(res, 200, { ok: true, autoSyncMinutes: cfg.autoSyncMinutes, bound: Object.keys(cfg.tableIds).length });
    }
    if (p === '/admin/feishu/tables' && method === 'GET') {
      const cfg = feishuConfigChecked();
      if (cfg.error) return sendJson(res, 400, cfg);
      try {
        const tables = await feishu.listTables(cfg);
        return sendJson(res, 200, { tables });
      } catch (e) {
        return sendJson(res, 502, { error: e.message });
      }
    }
    if (p === '/admin/feishu/sync' && method === 'POST') {
      const result = await runFeishuSync(user, req);
      if (result.error) return sendJson(res, result.status || 400, { error: result.error });
      return sendJson(res, 200, result);
    }

    /* ---- 榜单备注 ---- */
    if (p === '/admin/rankings-note' && method === 'PUT') {
      const body = await readBody(req);
      db.settings.rankingsNote = String(body.note || '');
      saveDb();
      audit(user, '更新榜单备注', body.note ? String(body.note).slice(0, 40) : '清空', req);
      return sendJson(res, 200, { note: db.settings.rankingsNote });
    }

    if (p === '/admin/audit') return sendJson(res, 200, { rows: db.audits.slice(0, 200) });
    // 全量数据导出（管理员）：用于发布前把线上数据回灌到本地，防止部署覆盖线上数据
    if (p === '/admin/export-db' && method === 'GET') {
      audit(user, '导出数据', `全量数据导出 · ${(db.rows.ds_high || []).length + Object.values(db.rows).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)} 行`, req);
      return sendJson(res, 200, db);
    }

    if (p === '/admin/reset-demo' && method === 'POST') {
      const fresh = buildSeed();
      fresh.accounts.forEach((a) => { a.password = hash(a.password); });
      db = fresh;
      // 清理旧版本快照后重新初始化（含初始版本发布）
      try {
        fs.readdirSync(VERSIONS_DIR).forEach((f) => { if (f.endsWith('.json')) fs.unlinkSync(path.join(VERSIONS_DIR, f)); });
      } catch (e) { /* 忽略 */ }
      initDefaults();
      saveDb(true);
      audit(user, '重置演示数据', '全部底表与配置恢复为初始状态', req);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: '接口不存在' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.error('[api]', err);
      sendJson(res, 500, { error: err.message || '服务异常' });
    });
    return;
  }
  serveStatic(req, res, url.pathname);
});

loadDb();
hydrateSessions();
scheduleFeishuAutoSync();
server.listen(PORT, () => {
  console.log('');
  console.log('  转介绍数据看板 · 运营中台');
  console.log(`  管理后台  http://localhost:${PORT}/admin`);
  console.log(`  基地看板  http://localhost:${PORT}/`);
  console.log('');
});

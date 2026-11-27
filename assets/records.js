'use strict';

/* =========================================================================
   前台 · 明细名单
   搜索 / 筛选 / 分页 / 详情抽屉 / 脱敏导出
   ========================================================================= */

const COLS = {
  customer: { label: '客户', get: (r) => `<span class="strong">${esc(r.customer || '—')}</span>` },
  phone: { label: '手机号', get: (r) => `<span class="mono text-sm">${esc(r.phone || '—')}</span>` },
  base: { label: '基地', get: (r) => `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:2px;background:${r.baseColor || '#94a3b8'}"></i>${esc(r.baseName || '—')}</span>` },
  status: { label: '状态', get: (r) => r.status ? `<span class="badge st-${esc(r.status)}">${esc(r.status)}</span>` : '<span class="muted">—</span>' },
  channel: { label: '渠道', get: (r) => esc(r.channel || '—') },
  empName: { label: '负责人', get: (r) => `${esc(r.empName || '—')}${r.teamName ? `<div class="text-xs muted">${esc(r.teamName)}</div>` : ''}` },
  date: { label: '日期', get: (r) => `<span class="nowrap muted">${esc(r.date || '—')}</span>` }
};

const CORE_FIELD_KEYS = ['date', 'base', 'empId', 'empName', 'customer', 'phone', 'status', 'channel', 'amount'];

/** 当前底表自定义字段（如高潜名单的老用户ID/新体验/新正价），内置底表返回空 */
function dynamicCols() {
  const ds = Rec.datasets.find((d) => d.id === Rec.dataset);
  return ((ds && ds.standardFields) || [])
    .filter((f) => f && f.key && !CORE_FIELD_KEYS.includes(f.key))
    .map((f) => ({ key: f.key, label: f.label, type: f.type }));
}

const Rec = {
  user: null, bases: [], datasets: [], settings: null,
  dataset: '', base: 'all', status: 'all', q: '',
  from: '', to: '',
  page: 1, pageSize: 20, data: null, statuses: [],
  uncv: { from: '', to: '', base: 'all', refund: 'all', q: '', limit: 200, loaded: false },
  uncvPerf: null, uncvCount: '',
  duncv: { from: '', to: '', base: 'all', kind: 'all', q: '', limit: 200, desc: true, sub: 'list' },
  duncvData: null, duncvCount: '',
  chain: { from: '', to: '', base: 'all', kind: 'all', q: '', limit: 200, desc: true, sub: 'list' },
  chainData: null, chainCount: '',
  ktier: { tier: 'all', base: 'all', q: '', limit: 200 },
  ktierData: null, ktierCount: '',
  diamond: { state: 'all', base: 'all', q: '', limit: 200, sort: 'grant' },
  diamondData: null, diamondCount: '',
  dmd: { from: '', to: '', base: 'all', q: '', limit: 200 },
  dmdData: null, dmdCount: '',
  dragon: { board: 'A', period: '', me: '' },
  dragonData: null, dragonCount: '',
  gjteam: { base: '', gj: '', panelOpen: false, picked: [], includeSelf: false },
  gjteamData: null,
  dmd2: { mode: 'orders' },
  ddetail: { from: '', to: '', base: 'all', q: '', limit: 300 },
  ddetailData: null, ddetailCount: '',
  lconv: { from: '', to: '', base: 'all', q: '', limit: 200 },
  lconvData: null, lconvCount: '',
  uncvReasons: {}
};

// 明细数据页隐藏的底表页签（业绩相关 + 质检台账/转介绍转化跟踪已下线展示）
const HIDDEN_TAB_DATASETS = ['ds_deal', 'ds_youshu', 'ds_diamond', 'ds_qc', 'ds_direct'];

// 业绩底表 id（接例子未转化数据来源）
function perfDataset() {
  return Rec.datasets.find((d) => d.preset === 'perf') || null;
}

// 转介绍转化跟踪底表（直推未转化数据来源）
function directUncvDataset() {
  return Rec.datasets.find((d) => d.id === 'ds_direct') || null;
}

function isUncv() { return Rec.dataset === '__uncv'; }
function isDirectUncv() { return Rec.dataset === '__duncv'; }
function isChain() { return Rec.dataset === '__chain'; }
function isKtier() { return Rec.dataset === '__ktier'; }
function isDiamond() { return Rec.dataset === '__diamond'; }
function isDiamondOrders() { return Rec.dataset === '__dmd'; }
function isDragon() { return Rec.dataset === '__dragon'; }
function isGjteam() { return Rec.dataset === '__gjteam'; }
function isRank() { return Rec.dataset === '__rank'; }
function isDmd2() { return Rec.dataset === '__dmd2'; }
function isDdetail() { return Rec.dataset === '__ddetail'; }
function isLconv() { return Rec.dataset === '__lconv'; }

function highDataset() { return Rec.datasets.find((d) => d.id === 'ds_high') || null; }
function diamondDataset() { return Rec.datasets.find((d) => d.id === 'ds_diamond') || null; }

async function recordsBoot() {
  let b;
  try {
    b = await api('/api/bootstrap');
  } catch (err) {
    location.href = 'login.html';
    return;
  }
  Object.assign(Rec, { user: b.user, bases: b.bases, datasets: b.datasets, settings: b.settings });
  const isBase = b.user.role === 'base';

  const s = b.settings || {};
  $('#brandName').textContent = s.title || '转介绍数据看板';
  $('#brandSub').textContent = s.subtitle || '基地经营';
  $('#viewerChip').textContent = `${b.user.name} · ${isBase ? (b.user.baseName || '基地查看') : '全部基地'}`;
  $('#updatedAt').textContent = `数据更新 ${(b.datasets[0] || {}).updatedAt || '—'}`;
  if (!isBase) $('#adminLink').classList.remove('hidden');
  if (isBase) $('#baseField').classList.add('hidden');

  // URL 参数：dataset / base / status / q / from / to（旧页签键重定向到新页签）
  const h = new URLSearchParams(location.search);
  if (h.get('dataset') === '__uncv' && perfDataset()) Rec.dataset = '__uncv';
  else if (h.get('dataset') === '__duncv' && directUncvDataset()) Rec.dataset = '__ddetail';
  else if (h.get('dataset') === '__ddetail' && directUncvDataset()) Rec.dataset = '__ddetail';
  else if (h.get('dataset') === '__chain' && directUncvDataset()) Rec.dataset = '__ddetail';
  else if (h.get('dataset') === '__ktier' && highDataset()) Rec.dataset = '__rank';
  else if (h.get('dataset') === '__diamond' && diamondDataset()) Rec.dataset = '__dmd2';
  else if (h.get('dataset') === '__dmd' && diamondDataset()) Rec.dataset = '__dmd2';
  else if (h.get('dataset') === '__dmd2' && diamondDataset()) Rec.dataset = '__dmd2';
  else if (h.get('dataset') === '__dragon' && perfDataset()) Rec.dataset = '__dragon';
  else if (h.get('dataset') === '__gjteam' && perfDataset()) Rec.dataset = '__rank';
  else if (h.get('dataset') === '__rank' && perfDataset()) Rec.dataset = '__rank';
  else if (h.get('dataset') === '__lconv' && perfDataset() && Rec.user.role === 'admin') Rec.dataset = '__lconv';
  else if (h.get('dataset') && Rec.datasets.some((d) => d.id === h.get('dataset') && !HIDDEN_TAB_DATASETS.includes(d.id))) Rec.dataset = h.get('dataset');
  else if (perfDataset() && !h.get('base') && !h.get('status') && !h.get('q') && !h.get('from') && !h.get('to')) Rec.dataset = '__rank';
  else Rec.dataset = ((Rec.datasets.find((d) => !HIDDEN_TAB_DATASETS.includes(d.id))) || Rec.datasets[0] || {}).id || '';
  if (!isBase && h.get('base')) Rec.base = h.get('base');
  if (h.get('status')) Rec.status = h.get('status');
  if (h.get('q')) { Rec.q = h.get('q'); $('#searchInput').value = Rec.q; }
  if (h.get('from')) Rec.from = h.get('from');
  if (h.get('to')) Rec.to = h.get('to');

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = 'login.html';
  });

  renderDatasetTabs();
  renderBaseOptions();

  $('#baseFilter').addEventListener('change', (e) => { Rec.base = e.target.value; Rec.page = 1; load(); });
  $('#statusFilter').addEventListener('change', (e) => { Rec.status = e.target.value; Rec.page = 1; load(); writeUrl(); });
  $('#searchInput').addEventListener('input', debounce(() => { Rec.q = $('#searchInput').value.trim(); Rec.page = 1; load(); }, 300));
  $('#resetBtn').addEventListener('click', () => {
    if (isRank()) {
      $('#resetFilters').click();
      return;
    }
    if (isDdetail()) {
      Rec.ddetail = { from: '', to: '', base: 'all', q: '', limit: 300 };
      renderDdetail();
      return;
    }
    if (isLconv()) {
      Rec.lconv = { from: '', to: '', base: 'all', q: '', limit: 200 };
      renderLconv();
      return;
    }
    if (isDmd2()) {
      if (Rec.dmd2.mode === 'orders') { Rec.dmd = { from: '', to: '', base: 'all', q: '', limit: 200 }; renderDiamondOrders(); }
      else { Rec.diamond = { state: 'all', base: 'all', q: '', limit: 200, sort: 'grant' }; renderDiamond(); }
      return;
    }
    if (isUncv()) {
      Rec.uncv = { from: '', to: '', base: 'all', refund: 'all', q: '', limit: 200, loaded: Rec.uncv.loaded };
      loadUncv();
      return;
    }
    if (isDirectUncv()) {
      Rec.duncv = { from: '', to: '', base: 'all', kind: 'all', q: '', limit: 200, desc: true, sub: Rec.duncv.sub };
      renderDirectUncv();
      return;
    }
    if (isChain()) {
      Rec.chain = { from: '', to: '', base: 'all', kind: 'all', q: '', limit: 200, desc: true, sub: Rec.chain.sub };
      renderChain();
      return;
    }
    if (isKtier()) {
      Rec.ktier = { tier: 'all', base: 'all', q: '', limit: 200 };
      renderKtier();
      return;
    }
    if (isDiamond()) {
      Rec.diamond = { state: 'all', base: 'all', q: '', limit: 200, sort: 'grant' };
      renderDiamond();
      return;
    }
    if (isDiamondOrders()) {
      Rec.dmd = { from: '', to: '', base: 'all', q: '', limit: 200 };
      renderDiamondOrders();
      return;
    }
    if (isDragon()) {
      Rec.dragon = { board: 'A', period: '', me: Rec.dragon.me };
      renderDragon();
      return;
    }
    if (isGjteam()) {
      Rec.gjteam = { base: Rec.gjteam.base, gj: '', panelOpen: false, picked: [], includeSelf: false };
      renderGjteam();
      return;
    }
    Rec.base = 'all'; Rec.status = 'all'; Rec.q = ''; Rec.from = ''; Rec.to = ''; Rec.page = 1;
    $('#searchInput').value = '';
    $('#baseFilter').value = 'all';
    $('#statusFilter').value = 'all';
    load();
  });
  $('#exportBtn').addEventListener('click', () => {
    if (isRank()) { exportRank(); return; }
    if (isDdetail()) { exportDdetail(); return; }
    if (isLconv()) { exportLconv(); return; }
    if (isDmd2()) { if (Rec.dmd2.mode === 'orders') exportDiamondOrders(); else exportDiamond(); return; }
    if (isUncv()) { exportUncv(); return; }
    if (isDirectUncv()) { exportDirectUncv(); return; }
    if (isChain()) { exportChain(); return; }
    if (isKtier()) { exportKtier(); return; }
    if (isDiamond()) { exportDiamond(); return; }
    if (isDiamondOrders()) { exportDiamondOrders(); return; }
    if (isDragon()) { exportDragon(); return; }
    if (isGjteam()) { exportGjteam(); return; }
    const p = new URLSearchParams({ dataset: Rec.dataset });
    if (Rec.base !== 'all') p.set('base', Rec.base);
    if (Rec.status !== 'all') p.set('status', Rec.status);
    if (Rec.q) p.set('q', Rec.q);
    demoExportRecords(p.toString());
  });
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDrawer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // 钻石兑换与使用明细：两个模式按钮
  const bO = $('#dmd2BtnOrders');
  const bU = $('#dmd2BtnUsage');
  if (bO) bO.addEventListener('click', () => { Rec.dmd2.mode = 'orders'; renderDmd2(); loadDiamondOrders(); });
  if (bU) bU.addEventListener('click', () => { Rec.dmd2.mode = 'usage'; renderDmd2(); loadDiamond(); });

  // KOC 三类分层页签已下线，分层配置按钮一并移除

  if (diamondDataset()) { prefetchDiamond(); prefetchDiamondOrders(); }
  if (perfDataset()) prefetchDragon();
  load();
}

async function prefetchDiamondOrders() {
  try {
    const d = await api('/api/diamond-orders');
    Rec.dmdData = d;
    Rec.dmdCount = (d.summary || {}).orders || 0;
    renderDatasetTabs();
  } catch (err) { /* ignore */ }
}

async function prefetchKtier() {
  try {
    const d = await api('/api/koc-tier');
    Rec.ktierData = d;
    Rec.ktierCount = (d.summary || {}).pool || 0;
    renderDatasetTabs();
  } catch (err) { /* ignore */ }
}

async function prefetchDiamond() {
  try {
    const d = await api('/api/diamond-unused');
    Rec.diamondData = d;
    Rec.diamondCount = (d.summary || {}).unused || 0;
    renderDatasetTabs();
  } catch (err) { /* ignore */ }
}

async function prefetchDragon() {
  try {
    const d = await api('/api/dragon');
    Rec.dragonData = d;
    renderDatasetTabs();
  } catch (err) { /* ignore */ }
}

async function prefetchDuncv() {
  try {
    const d = await api('/api/direct-uncv');
    Rec.duncvData = d;
    Rec.duncvCount = (d.summary || {}).unconverted || 0;
    renderDatasetTabs();
  } catch (err) { /* 计数失败不影响主流程 */ }
}

async function prefetchChain() {
  try {
    const d = await api('/api/abc-chain');
    Rec.chainData = d;
    Rec.chainCount = (d.summary || {}).unconverted || 0;
    renderDatasetTabs();
  } catch (err) { /* 计数失败不影响主流程 */ }
}

function renderDatasetTabs() {
  const perfDs = perfDataset();
  const duncvDs = directUncvDataset();
  const tabs = Rec.datasets
    .filter((d) => !HIDDEN_TAB_DATASETS.includes(d.id))
    .map((d) => `
    <button class="table-tab ${d.id === Rec.dataset ? 'active' : ''}" data-ds="${d.id}" type="button">
      ${esc(d.name)} <span class="tab-count">${fmtInt(d.rowCount)}</span>
    </button>`).join('');
  const uncvTab = perfDs ? `
    <button class="table-tab ${isUncv() ? 'active' : ''}" data-ds="__uncv" type="button">
      接例子未转化 ${Rec.uncvCount !== '' ? `<span class="tab-count">${fmtInt(Rec.uncvCount)}</span>` : ''}
    </button>` : '';
  const lconvTab = perfDs && Rec.user.role === 'admin' ? `
    <button class="table-tab ${isLconv() ? 'active' : ''}" data-ds="__lconv" type="button">
      接leads已转化明细 ${Rec.lconvCount !== '' ? `<span class="tab-count">${fmtInt(Rec.lconvCount)}</span>` : ''}
    </button>` : '';
  const ddetailTab = duncvDs ? `
    <button class="table-tab ${isDdetail() ? 'active' : ''}" data-ds="__ddetail" type="button">
      直推转化明细 ${Rec.ddetailCount !== '' ? `<span class="tab-count">${fmtInt(Rec.ddetailCount)}</span>` : ''}
    </button>` : '';
  const dmd2Tab = diamondDataset() ? `
    <button class="table-tab ${isDmd2() ? 'active' : ''}" data-ds="__dmd2" type="button">
      钻石兑换与使用明细 ${Rec.dmdCount !== '' ? `<span class="tab-count">${fmtInt(Rec.dmdCount)}</span>` : ''}
    </button>` : '';
  const dragonTab = perfDs ? `
    <button class="table-tab ${isDragon() ? 'active' : ''}" data-ds="__dragon" type="button">龙珠奖</button>` : '';
  const rankTab = perfDs ? `
    <button class="table-tab ${isRank() ? 'active' : ''}" data-ds="__rank" type="button">业绩</button>` : '';
  $('#datasetTabs').innerHTML = rankTab + tabs + uncvTab + lconvTab + ddetailTab + dmd2Tab + dragonTab;
  $$('#datasetTabs [data-ds]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Rec.dataset = btn.dataset.ds;
      Rec.status = 'all'; Rec.page = 1;
      $('#statusFilter').value = 'all';
      renderDatasetTabs();
      load();
    });
  });
}

function renderBaseOptions() {
  $('#baseFilter').innerHTML = `<option value="all">全部基地</option>`
    + Rec.bases.map((b) => `<option value="${b.id}" ${Rec.base === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
}

function writeUrl() {
  const p = new URLSearchParams();
  if (Rec.dataset) p.set('dataset', Rec.dataset);
  if (Rec.base !== 'all') p.set('base', Rec.base);
  if (Rec.status !== 'all') p.set('status', Rec.status);
  if (Rec.q) p.set('q', Rec.q);
  if (Rec.from) p.set('from', Rec.from);
  if (Rec.to) p.set('to', Rec.to);
  history.replaceState(null, '', p.toString() ? `records.html?${p.toString()}` : 'records.html');
}

async function load() {
  writeUrl();
  if (isRank()) { toggleView('rank'); loadRankView(); return; }
  if (isUncv()) { toggleView('uncv'); await loadUncv(); return; }
  if (isLconv()) { toggleView('lconv'); await loadLconv(); return; }
  if (isDdetail()) { toggleView('ddetail'); loadDdetail(); return; }
  if (isDmd2()) { toggleView('dmd2'); loadDmd2(); return; }
  if (isDirectUncv()) { toggleView('duncv'); await loadDirectUncv(); return; }
  if (isChain()) { toggleView('chain'); await loadChain(); return; }
  if (isKtier()) { toggleView('ktier'); loadKtier(); return; }
  if (isDiamond()) { toggleView('diamond'); loadDiamond(); return; }
  if (isDiamondOrders()) { toggleView('dmd'); loadDiamondOrders(); return; }
  if (isDragon()) { toggleView('dragon'); loadDragon(); return; }
  if (isGjteam()) { toggleView('gjteam'); loadGjteam(); return; }
  toggleView('list');
  const p = new URLSearchParams({ dataset: Rec.dataset, page: Rec.page, pageSize: Rec.pageSize });
  if (Rec.base !== 'all') p.set('base', Rec.base);
  if (Rec.status !== 'all') p.set('status', Rec.status);
  if (Rec.q) p.set('q', Rec.q);
  if (Rec.from) p.set('from', Rec.from);
  if (Rec.to) p.set('to', Rec.to);
  try {
    const d = await api(`/api/records?${p.toString()}`);
    Rec.data = d;
    // 状态选项（仅首次或数据集切换后更新）
    const cur = $('#statusFilter').value;
    $('#statusFilter').innerHTML = `<option value="all">${isKocDataset() ? '全部层级' : '全部状态'}</option>`
      + (d.statuses || []).map((s) => `<option value="${esc(s)}" ${cur === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const filterLabel = document.querySelector('label[for="statusFilter"]') || ($('#statusFilter').previousElementSibling && $('#statusFilter').previousElementSibling.tagName === 'LABEL' ? $('#statusFilter').previousElementSibling : null);
    if (filterLabel) filterLabel.textContent = isKocDataset() ? 'KOC层级' : '状态';
    renderTable();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ---------------- 接例子未转化视图（leads 分配表 × 订单池） ---------------- */

function toggleView(mode) {
  $('#listCard').classList.toggle('hidden', mode !== 'list');
  $('#uncvCard').classList.toggle('hidden', mode !== 'uncv');
  const lc = $('#lconvCard');
  if (lc) lc.classList.toggle('hidden', mode !== 'lconv');
  const rk = $('#rankCard');
  if (rk) rk.classList.toggle('hidden', mode !== 'rank');
  const dd = $('#ddetailCard');
  if (dd) dd.classList.toggle('hidden', mode !== 'ddetail');
  const d2 = $('#dmd2Card');
  if (d2) d2.classList.toggle('hidden', mode !== 'dmd2');
  const d = $('#duncvCard');
  if (d) d.classList.toggle('hidden', mode !== 'duncv');
  const cc = $('#chainCard');
  if (cc) cc.classList.toggle('hidden', mode !== 'chain');
  const kt = $('#ktierCard');
  if (kt) kt.classList.toggle('hidden', mode !== 'ktier');
  const dg = $('#dragonCard');
  if (dg) dg.classList.toggle('hidden', mode !== 'dragon');
  const gjt = $('#gjteamCard');
  if (gjt) gjt.classList.toggle('hidden', mode !== 'gjteam');
}

// 行时间键：优先精确到秒的 time，否则回退到月份（当月 1 日 0 点）
function uncvTimeKey(r) {
  const v = String(r.time || r.month || '').trim();
  return v ? v.replace('T', ' ') : '';
}

function uncvRows() {
  const p = Rec.uncvPerf;
  if (!p) return [];
  let rows = p.unconverted || [];
  // 基地角色只看本基地（基地名双向去「基地」后缀匹配）
  if (Rec.user.role === 'base' && Rec.user.baseName) {
    const norm = (x) => String(x || '').trim().replace(/基地$/, '');
    const mine = norm(Rec.user.baseName);
    rows = rows.filter((r) => norm(r.base) === mine);
  }
  return rows;
}

function uncvFiltered() {
  const v = Rec.uncv;
  const q = String(v.q || '').trim().toLowerCase();
  const from = String(v.from || '').replace('T', ' ').trim();
  const to = String(v.to || '').replace('T', ' ').trim();
  return uncvRows().filter((r) => {
    const t = uncvTimeKey(r);
    if (from && (!t || t < from)) return false;
    if (to && (!t || t > to)) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (v.refund === 'refund' && !r.refund) return false;
    if (v.refund === 'plain' && r.refund) return false;
    if (q && !`${r.userId} ${r.ccId} ${r.empId} ${r.base}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

async function loadUncv() {
  const perfDs = perfDataset();
  const card = $('#uncvCard');
  if (!perfDs) {
    card.innerHTML = '<div class="card-body"><div class="empty"><h3>暂无业绩底表</h3><p>接例子未转化需要先上传 leads 分配表与哥伦布订单池</p></div></div>';
    return;
  }
  if (!Rec.uncv.loaded) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    try {
      Rec.uncvPerf = (await api(`/api/rankings?dataset=${perfDs.id}&range=all`)).perf;
      Rec.uncv.loaded = true;
      Rec.uncvCount = (Rec.uncvPerf.stats || {}).unconvertedCount || 0;
      try { Rec.uncvReasons = ((await api('/api/uncv-reasons')) || {}).reasons || {}; } catch (e) { /* 原因加载失败不影响主表 */ }
      renderDatasetTabs();
    } catch (err) {
      card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`;
      return;
    }
  }
  renderUncv();
}

/** 填写未转化原因弹窗（按用户ID 持久化） */
function openUncvReasonModal(userId) {
  const cur = (Rec.uncvReasons || {})[userId] || null;
  openModal({
    title: '填写未转化原因',
    subtitle: `用户ID：${userId}${cur ? ` · 最近填写：${cur.by} · ${cur.at}` : ''}`,
    body: `
      <div class="form-field"><label>未转化原因（留空保存即清除）</label>
        <textarea class="control" id="uncvReasonText" rows="3" placeholder="例如：客户暂无预算 / 联系不上 / 已报竞品...">${esc(cur ? cur.text : '')}</textarea></div>`,
    footer: `
      <button class="btn" id="uncvReasonCancel" type="button">取消</button>
      <button class="btn btn-primary" id="uncvReasonSave" type="button">保存</button>`,
    onMount: (box) => {
      box.querySelector('#uncvReasonCancel').addEventListener('click', closeModal);
      box.querySelector('#uncvReasonSave').addEventListener('click', async () => {
        try {
          const r = await api('/api/uncv-reason', { method: 'POST', body: { userId, text: box.querySelector('#uncvReasonText').value } });
          Rec.uncvReasons = r.reasons || {};
          closeModal();
          toast('未转化原因已保存', 'ok');
          renderUncv();
        } catch (err) { toast(err.message, 'err'); }
      });
    }
  });
}

function renderUncv() {
  const p = Rec.uncvPerf || {};
  const st = p.stats || {};
  const v = Rec.uncv;
  const all = uncvRows();
  const filtered = uncvFiltered();
  const shown = filtered.slice(0, v.limit);
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');

  const rowsHtml = shown.map((r) => {
    const reason = (Rec.uncvReasons || {})[String(r.userId || '').trim()] || null;
    return `
    <tr>
      <td class="num">${esc(r.time || r.month || '—')}</td>
      <td class="num">${esc(r.userId || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td class="cell-left">${esc(r.ccId || '—')}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td class="num">${fmtCompact(r.amount || 0, 'money')}</td>
      <td>${r.refund ? '<span class="tag-refund">完全退款</span>' : '<span class="tag-sim">未转化</span>'}</td>
      <td>${reason ? `<span class="text-sm">${esc(reason.text)}</span><div class="text-xs muted">${esc(reason.by)} · ${esc(reason.at)}</div>` : '<span class="muted">—</span>'}</td>
      <td><button class="btn btn-sm" type="button" data-uncv-reason="${esc(r.userId || '')}">${reason ? '修改' : '填写'}</button></td>
    </tr>`;
  }).join('');

  $('#pageSubtitle').textContent = '接例子未转化 · leads 分配表为底表，用户ID 匹配订单池累计转化金额为 0 即未转化；完全退款单独标记';
  $('#uncvCard').innerHTML = `
    <div class="card-body" style="border-bottom:1px solid var(--line)">
      <div class="records-toolbar" style="margin-bottom:0">
        <div class="field"><label>起止时间</label>
          <div class="date-range">
            <input class="control" id="uncvFrom" type="datetime-local" step="1" value="${esc(v.from)}">
            <span class="range-sep">~</span>
            <input class="control" id="uncvTo" type="datetime-local" step="1" value="${esc(v.to)}">
          </div>
        </div>
        <div class="field"><label>基地</label>
          <select class="control" id="uncvBase" style="width:120px">${baseOpts}</select>
        </div>
        <div class="field"><label>状态</label>
          <select class="control" id="uncvRefund" style="width:150px">
            <option value="all" ${v.refund === 'all' ? 'selected' : ''}>全部未转化</option>
            <option value="plain" ${v.refund === 'plain' ? 'selected' : ''}>仅未转化（不含退款）</option>
            <option value="refund" ${v.refund === 'refund' ? 'selected' : ''}>仅完全退款</option>
          </select>
        </div>
        <div class="field grow"><label>搜索</label>
          <input class="control search" id="uncvSearch" placeholder="搜索用户ID / CCid / 工号 / 基地" value="${esc(v.q)}">
        </div>
        <div class="spacer"></div>
        <span class="records-summary">未转化合计 <b>${fmtInt(st.unconvertedCount || 0)}</b> · 完全退款 <b style="color:#b91c1c">${fmtInt(st.refundCount || 0)}</b> · 当前展示 ${fmtInt(filtered.length)} 条</span>
        <button class="btn btn-sm" id="uncvReset" type="button">重置</button>
      </div>
    </div>
    <div class="table-wrap" style="max-height:62vh">
      <table class="table">
        <thead><tr><th>分配时间</th><th>用户ID</th><th>基地</th><th>CCid</th><th>绑定工号</th><th>累计转化金额</th><th>状态</th><th>未转化原因</th><th></th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="9"><div class="empty"><h3>当前筛选条件下暂无未转化数据</h3><p>调整筛选条件后重试</p></div></td></tr>`}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${filtered.length > shown.length ? `已显示前 ${fmtInt(shown.length)} 条` : `共 ${fmtInt(filtered.length)} 条`}</span>
      ${filtered.length > shown.length ? '<button class="btn btn-sm" id="uncvMore" type="button">显示更多</button>' : ''}
    </div>`;

  $('#uncvFrom').addEventListener('change', (e) => { v.from = e.target.value; v.limit = 200; renderUncv(); });
  $('#uncvTo').addEventListener('change', (e) => { v.to = e.target.value; v.limit = 200; renderUncv(); });
  $('#uncvBase').addEventListener('change', (e) => { v.base = e.target.value; v.limit = 200; renderUncv(); });
  $('#uncvRefund').addEventListener('change', (e) => { v.refund = e.target.value; v.limit = 200; renderUncv(); });
  $('#uncvSearch').addEventListener('input', debounce((e) => { v.q = e.target.value; v.limit = 200; renderUncv(); }, 250));
  $('#uncvReset').addEventListener('click', () => {
    Rec.uncv = { from: '', to: '', base: 'all', refund: 'all', q: '', limit: 200, loaded: Rec.uncv.loaded };
    renderUncv();
  });
  const more = $('#uncvMore');
  if (more) more.addEventListener('click', () => { v.limit += 500; renderUncv(); });
  $$('#uncvCard [data-uncv-reason]').forEach((btn) => {
    btn.addEventListener('click', () => openUncvReasonModal(btn.dataset.uncvReason));
  });
}

function exportUncv() {
  const rows = uncvFiltered();
  downloadCsv('接例子未转化名单.csv', rows, [
    { label: '分配时间', value: (r) => r.time || r.month || '' },
    { label: '用户ID', value: (r) => r.userId || '' },
    { label: '基地', value: (r) => r.base || '未匹配' },
    { label: 'CCid', value: (r) => r.ccId || '' },
    { label: '绑定工号', value: (r) => r.empId || '' },
    { label: '累计转化金额', value: (r) => r.amount || 0 },
    { label: '状态', value: (r) => (r.refund ? '完全退款' : '未转化') },
    { label: '未转化原因', value: (r) => { const x = (Rec.uncvReasons || {})[String(r.userId || '').trim()]; return x ? x.text : ''; } }
  ]);
  toast(`已导出 ${rows.length} 条未转化名单`, 'ok');
}

/* ---------------- 接leads已转化明细（仅管理员可见，leads 命中订单池且累计转化金额>0） ---------------- */

function lconvRows() {
  const p = Rec.uncvPerf;
  if (!p) return [];
  return p.converted || [];
}

function lconvFiltered() {
  const v = Rec.lconv;
  const q = String(v.q || '').trim().toLowerCase();
  const from = String(v.from || '').replace('T', ' ').trim();
  const to = String(v.to || '').replace('T', ' ').trim();
  return lconvRows().filter((r) => {
    const t = String(r.time || r.month || '').replace('T', ' ');
    if (from && (!t || t < from)) return false;
    if (to && (!t || t > to)) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (q && !`${r.userId} ${r.ccId} ${r.empId} ${r.base}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

async function loadLconv() {
  const perfDs = perfDataset();
  const card = $('#lconvCard');
  if (!perfDs) {
    card.innerHTML = '<div class="card-body"><div class="empty"><h3>暂无业绩底表</h3><p>接leads已转化明细需要先上传 leads 分配表与哥伦布订单池</p></div></div>';
    return;
  }
  if (!Rec.uncv.loaded) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    try {
      const p = (await api(`/api/rankings?dataset=${perfDs.id}&range=all`)).perf;
      Rec.uncvPerf = p;
      Rec.uncv.loaded = true;
      Rec.uncvCount = (p.stats || {}).unconvertedCount || 0;
      Rec.lconvCount = (p.stats || {}).convertedCount || 0;
      renderDatasetTabs();
    } catch (err) {
      card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`;
      return;
    }
  }
  renderLconv();
}

function renderLconv() {
  const p = Rec.uncvPerf || {};
  const st = p.stats || {};
  const v = Rec.lconv;
  const all = lconvRows();
  const filtered = lconvFiltered();
  const shown = filtered.slice(0, v.limit);
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');

  const rowsHtml = shown.map((r) => `
    <tr>
      <td class="num">${esc(r.time || r.month || '—')}</td>
      <td class="num">${esc(r.userId || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td class="cell-left">${esc(r.ccId || '—')}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td class="num"><b>${fmtCompact(r.amount || 0, 'money')}</b></td>
      <td>${r.refund ? '<span class="tag-refund">曾完全退款</span>' : '<span class="tag-done">已转化</span>'}</td>
    </tr>`).join('');

  $('#pageSubtitle').textContent = '接leads已转化明细 · 仅管理员可见：leads 分配表命中订单池且累计转化金额 > 0 的名单（与接例子未转化互斥）';
  $('#lconvCard').innerHTML = `
    <div class="card-body" style="border-bottom:1px solid var(--line)">
      <div class="records-toolbar" style="margin-bottom:0">
        <div class="field"><label>起止时间</label>
          <div class="date-range">
            <input class="control" id="lconvFrom" type="datetime-local" step="1" value="${esc(v.from)}">
            <span class="range-sep">~</span>
            <input class="control" id="lconvTo" type="datetime-local" step="1" value="${esc(v.to)}">
          </div>
        </div>
        <div class="field"><label>基地</label>
          <select class="control" id="lconvBase" style="width:120px">${baseOpts}</select>
        </div>
        <div class="field grow"><label>搜索</label>
          <input class="control search" id="lconvSearch" placeholder="搜索用户ID / CCid / 工号 / 基地" value="${esc(v.q)}">
        </div>
        <div class="spacer"></div>
        <span class="records-summary">已转化 <b>${fmtInt(st.convertedCount || 0)}</b> 条 · 累计金额 <b>${fmtCompact(st.convertedAmount || 0, 'money')}</b> · 当前展示 ${fmtInt(filtered.length)} 条</span>
        <button class="btn btn-sm" id="lconvReset" type="button">重置</button>
      </div>
    </div>
    <div class="table-wrap" style="max-height:62vh">
      <table class="table">
        <thead><tr><th>分配时间</th><th>用户ID</th><th>基地</th><th>CCid</th><th>绑定工号</th><th>累计转化金额</th><th>状态</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="7"><div class="empty"><h3>当前筛选条件下暂无已转化数据</h3><p>调整筛选条件后重试</p></div></td></tr>`}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${filtered.length > shown.length ? `已显示前 ${fmtInt(shown.length)} 条` : `共 ${fmtInt(filtered.length)} 条`}</span>
      ${filtered.length > shown.length ? '<button class="btn btn-sm" id="lconvMore" type="button">显示更多</button>' : ''}
    </div>`;

  $('#lconvFrom').addEventListener('change', (e) => { v.from = e.target.value; v.limit = 200; renderLconv(); });
  $('#lconvTo').addEventListener('change', (e) => { v.to = e.target.value; v.limit = 200; renderLconv(); });
  $('#lconvBase').addEventListener('change', (e) => { v.base = e.target.value; v.limit = 200; renderLconv(); });
  $('#lconvSearch').addEventListener('input', debounce((e) => { v.q = e.target.value; v.limit = 200; renderLconv(); }, 250));
  $('#lconvReset').addEventListener('click', () => {
    Rec.lconv = { from: '', to: '', base: 'all', q: '', limit: 200 };
    renderLconv();
  });
  const more = $('#lconvMore');
  if (more) more.addEventListener('click', () => { v.limit += 500; renderLconv(); });
}

function exportLconv() {
  const rows = lconvFiltered();
  downloadCsv('接leads已转化明细.csv', rows, [
    { label: '分配时间', value: (r) => r.time || r.month || '' },
    { label: '用户ID', value: (r) => r.userId || '' },
    { label: '基地', value: (r) => r.base || '未匹配' },
    { label: 'CCid', value: (r) => r.ccId || '' },
    { label: '绑定工号', value: (r) => r.empId || '' },
    { label: '累计转化金额', value: (r) => r.amount || 0 },
    { label: '状态', value: (r) => (r.refund ? '曾完全退款' : '已转化') }
  ]);
  toast(`已导出 ${rows.length} 条已转化明细`, 'ok');
}

/* ---------------- 直推未转化视图（转介绍转化跟踪 · 跟进状态口径） ---------------- */

function duncvRows() {
  const d = Rec.duncvData;
  return (d && d.rows) || [];
}

function duncvTimeKey(r) { return String(r.time || '').replace('T', ' ').trim(); }

function duncvFiltered() {
  const v = Rec.duncv;
  const q = String(v.q || '').trim().toLowerCase();
  const fromDate = String(v.from || '').slice(0, 10);
  const toDate = String(v.to || '').slice(0, 10);
  const rows = duncvRows().filter((r) => {
    const t = duncvTimeKey(r).slice(0, 10);
    if (fromDate && (!t || t < fromDate)) return false;
    if (toDate && (!t || t > toDate)) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (v.kind !== 'all' && r.kind !== v.kind) return false;
    if (q && !`${r.phone} ${r.customer} ${r.empId} ${r.empName} ${r.base}`.toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => {
    const c = String(a.time).localeCompare(String(b.time)) || String(a.phone).localeCompare(String(b.phone));
    return v.desc ? -c : c;
  });
  return rows;
}

/** 按当前筛选行重算汇总（与服务端口径一致） */
function duncvSummaryOf(rows) {
  const phones = rows.length;
  const converted = rows.filter((r) => r.kind === 'converted').length;
  const invalid = rows.filter((r) => r.kind === 'invalid').length;
  const unconverted = rows.filter((r) => r.kind === 'unconverted').length;
  const valid = phones - invalid;
  let totalAmount = 0;
  const m = new Map();
  rows.forEach((r) => {
    const k = r.empId || '(无工号)';
    if (!m.has(k)) m.set(k, { empId: r.empId || '', empName: r.empName || '', base: r.base || '', assigned: 0, converted: 0, unconverted: 0, invalid: 0, amount: 0 });
    const e = m.get(k);
    e.assigned += 1;
    e.amount += Number(r.amount) || 0;
    totalAmount += Number(r.amount) || 0;
    if (r.kind === 'converted') e.converted += 1;
    else if (r.kind === 'invalid') e.invalid += 1;
    else e.unconverted += 1;
  });
  const byEmp = [...m.values()].map((e) => {
    const den = e.assigned - e.invalid;
    return { ...e, rate: den > 0 ? e.unconverted / den : null };
  }).sort((a, b) => b.assigned - a.assigned || b.unconverted - a.unconverted);
  return { phones, converted, unconverted, invalid, valid, rate: valid > 0 ? unconverted / valid : null, totalAmount, byEmp };
}

function duncvKindTag(r) {
  const hist = r.historyConverted && r.kind !== 'converted' ? '<div class="text-xs muted">曾已转化</div>' : '';
  if (r.kind === 'converted') return '<span class="badge st-已转化">已转化</span>';
  if (r.kind === 'invalid') return `<span class="badge" style="background:#f1f5f9;color:#64748b">无效号码</span>${hist}`;
  return `<span class="tag-sim">未转化</span>${hist}`;
}

async function loadDirectUncv() {
  const card = $('#duncvCard');
  if (!card) return;
  if (!Rec.duncvData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    try {
      Rec.duncvData = await api('/api/direct-uncv');
      Rec.duncvCount = (Rec.duncvData.summary || {}).unconverted || 0;
      renderDatasetTabs();
    } catch (err) {
      card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`;
      return;
    }
  }
  renderDirectUncv();
}

function renderDirectUncv() {
  const card = $('#duncvCard');
  if (!card) return;
  const v = Rec.duncv;
  const src = Rec.duncvData || {};
  const modeB = src.mode === 'B';
  const all = duncvRows();
  const filtered = duncvFiltered();
  const sum = duncvSummaryOf(filtered);
  const shown = v.sub === 'list' ? filtered.slice(0, v.limit) : filtered;
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');
  const pct = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);

  $('#pageSubtitle').textContent = modeB
    ? '直推未转化 · 转介绍转化跟踪（a-b-c）按新用户 c 去重，转化金额>0 即已转化；仅统计角色=销售，跟进状态可人工回写修正'
    : '直推未转化 · 转介绍转化跟踪按客户手机号去重，跟进状态判定；同号曾已转化即视为已转化，无效号码单列不计入未转化率';

  const statCard = (label, value, foot, tone) => `
    <div style="flex:1;min-width:130px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
      <div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px;${tone ? `color:${tone}` : ''}">${esc(String(value))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(foot || '')}</div>
    </div>`;

  const keyLabel = modeB ? '客户ID（c）' : '手机号';
  const listHead = `<tr>
      <th>转介绍时间</th><th>${keyLabel}</th><th>客户姓名</th><th>销售工号</th><th>销售姓名</th>
      <th>基地</th><th>${modeB ? '转介绍系统' : '渠道'}</th><th class="num">${modeB ? '订单行数' : '分配次数'}</th>${modeB ? '<th class="num">转化金额</th>' : ''}<th>判定</th><th>跟进状态</th>
    </tr>`;
  const listRows = shown.map((r) => {
    const opts = (src.statuses || ['待跟进', '跟进中', '已联系未转化', '已转化', '无效号码'])
      .map((s) => `<option value="${esc(s)}" ${s === r.status ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `<tr>
      <td class="num nowrap">${esc(duncvTimeKey(r) || '—')}</td>
      <td class="num mono">${esc(r.phone || '—')}</td>
      <td>${esc(r.customer || '—')}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td>${esc(r.empName || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td>${esc(r.channel || '—')}</td>
      <td class="num">${r.times > 1 ? `<b>${r.times}</b>` : r.times}</td>
      ${modeB ? `<td class="num nowrap">${fmtMoney(r.amount)}</td>` : ''}
      <td>${duncvKindTag(r)}</td>
      <td><select class="control" data-fu="${esc(r.phone)}" style="width:130px;height:28px">${opts}</select></td>
    </tr>`;
  }).join('');

  const empRows = sum.byEmp.map((e, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td class="num">${esc(e.empId || '—')}</td>
      <td class="strong">${esc(e.empName || '—')}</td>
      <td>${esc(e.base || '未匹配')}</td>
      <td class="num">${fmtInt(e.assigned)}</td>
      <td class="num" style="color:#15803d">${fmtInt(e.converted)}</td>
      ${modeB ? `<td class="num nowrap">${fmtMoney(e.amount)}</td>` : ''}
      <td class="num" style="color:#b45309">${fmtInt(e.unconverted)}</td>
      ${modeB ? '' : `<td class="num muted">${fmtInt(e.invalid)}</td>`}
      <td class="num"><b>${pct(e.rate)}</b></td>
    </tr>`).join('');

  card.innerHTML = `
    <div class="card-body" style="border-bottom:1px solid var(--line)">
      <div class="records-toolbar" style="margin-bottom:0;flex-wrap:wrap;gap:8px">
        <div class="field"><label>起止时间</label>
          <div class="date-range">
            <input class="control" id="duncvFrom" type="date" value="${esc(String(v.from).slice(0, 10))}">
            <span class="range-sep">~</span>
            <input class="control" id="duncvTo" type="date" value="${esc(String(v.to).slice(0, 10))}">
          </div>
        </div>
        <div class="field"><label>基地</label>
          <select class="control" id="duncvBase" style="width:120px">${baseOpts}</select>
        </div>
        <div class="field"><label>判定</label>
          <select class="control" id="duncvKind" style="width:150px">
            <option value="all" ${v.kind === 'all' ? 'selected' : ''}>全部</option>
            <option value="unconverted" ${v.kind === 'unconverted' ? 'selected' : ''}>仅未转化</option>
            <option value="converted" ${v.kind === 'converted' ? 'selected' : ''}>仅已转化</option>
            ${modeB ? '' : '<option value="invalid" ' + (v.kind === 'invalid' ? 'selected' : '') + '>仅无效号码</option>'}
          </select>
        </div>
        <div class="field grow"><label>搜索</label>
          <input class="control search" id="duncvSearch" placeholder="${modeB ? '客户ID / 工号 / 销售 / 基地' : '手机号 / 客户 / 工号 / 销售 / 基地'}" value="${esc(v.q)}">
        </div>
        <div class="spacer"></div>
        <button class="btn btn-sm" id="duncvSort" type="button">时间 ${v.desc ? '↓ 倒序' : '↑ 正序'}</button>
        <button class="btn btn-sm" id="duncvReset" type="button">重置</button>
      </div>
      <div class="records-toolbar" style="margin:10px 0 0;gap:6px">
        <button class="table-tab ${v.sub === 'list' ? 'active' : ''}" data-dsub="list" type="button">未转化名单</button>
        <button class="table-tab ${v.sub === 'emp' ? 'active' : ''}" data-dsub="emp" type="button">按销售汇总</button>
        <div class="spacer"></div>
        <span class="records-summary">${modeB ? '去重客户' : '去重手机号'} <b>${fmtInt(sum.phones)}</b> · 已转化 <b>${fmtInt(sum.converted)}</b> · 未转化 <b style="color:#b45309">${fmtInt(sum.unconverted)}</b>${modeB ? ` · 转化金额 <b>${fmtMoney(sum.totalAmount || 0)}</b>` : ` · 无效号码 ${fmtInt(sum.invalid)}`}</span>
      </div>
    </div>
    <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--line)">
      ${statCard('未转化率', pct(sum.rate), modeB ? `分母 = 去重客户 ${fmtInt(sum.valid)}（仅角色=销售）` : `分母剔除无效号码（${fmtInt(sum.valid)} 个有效）`, '#b45309')}
      ${statCard(modeB ? '未转化客户' : '未转化手机号', fmtInt(sum.unconverted), modeB ? '只有转化课/0 金额订单' : '跟进中 + 待跟进 + 已联系未转化')}
      ${statCard('已回写跟进', fmtInt(all.filter((r) => r.follow).length), '看板内维护，不写回原文件', '#15803d')}
      ${statCard('原始记录', fmtInt((src.summary || {}).rawRows || all.length), modeB ? `仅角色=销售（原表 ${fmtInt((src.summary || {}).rawTotal || 0)} 行）` : '按手机号去重前')}
      ${modeB ? statCard('转化金额', fmtMoney(sum.totalAmount || 0), '转化金额>0 即已转化', '#15803d') : ''}
    </div>
    ${v.sub === 'list' ? `
    <div class="table-wrap" style="max-height:58vh">
      <table class="table">
        <thead>${listHead}</thead>
        <tbody>${listRows || `<tr><td colspan="${modeB ? 11 : 10}"><div class="empty"><h3>当前筛选条件下暂无数据</h3><p>调整筛选条件后重试</p></div></td></tr>`}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${filtered.length > shown.length ? `已显示前 ${fmtInt(shown.length)} 条` : `共 ${fmtInt(filtered.length)} 条`}</span>
      ${filtered.length > shown.length ? '<button class="btn btn-sm" id="duncvMore" type="button">显示更多</button>' : ''}
    </div>` : `
    <div class="table-wrap" style="max-height:58vh">
      <table class="table">
        <thead><tr><th>排名</th><th>工号</th><th>销售</th><th>基地</th><th class="num">${modeB ? '客户数' : '分到量'}</th><th class="num">已转化</th>${modeB ? '<th class="num">转化金额</th>' : ''}<th class="num">未转化</th>${modeB ? '' : '<th class="num">无效号码</th>'}<th class="num">未转化率</th></tr></thead>
        <tbody>${empRows || `<tr><td colspan="${modeB ? 8 : 9}"><div class="empty"><h3>暂无汇总数据</h3></div></td></tr>`}</tbody>
      </table>
    </div>
    <div class="table-footer"><span>共 ${fmtInt(sum.byEmp.length)} 位销售 · 未转化率 = 未转化 ÷ ${modeB ? '客户数' : '(分到量 − 无效号码)'}</span></div>`}
  `;

  $('#duncvFrom').addEventListener('change', (e) => { v.from = e.target.value; v.limit = 200; renderDirectUncv(); });
  $('#duncvTo').addEventListener('change', (e) => { v.to = e.target.value; v.limit = 200; renderDirectUncv(); });
  $('#duncvBase').addEventListener('change', (e) => { v.base = e.target.value; v.limit = 200; renderDirectUncv(); });
  $('#duncvKind').addEventListener('change', (e) => { v.kind = e.target.value; v.limit = 200; renderDirectUncv(); });
  $('#duncvSearch').addEventListener('input', debounce((e) => { v.q = e.target.value; v.limit = 200; renderDirectUncv(); }, 250));
  $('#duncvSort').addEventListener('click', () => { v.desc = !v.desc; renderDirectUncv(); });
  $('#duncvReset').addEventListener('click', () => {
    Rec.duncv = { from: '', to: '', base: 'all', kind: 'all', q: '', limit: 200, desc: true, sub: Rec.duncv.sub };
    renderDirectUncv();
  });
  $$('#duncvCard [data-dsub]').forEach((btn) => {
    btn.addEventListener('click', () => { v.sub = btn.dataset.dsub; renderDirectUncv(); });
  });
  const more = $('#duncvMore');
  if (more) more.addEventListener('click', () => { v.limit += 500; renderDirectUncv(); });
  $$('#duncvCard [data-fu]').forEach((sel) => {
    sel.addEventListener('change', () => saveDuncvFollowup(sel.dataset.fu, sel.value, sel));
  });
}

async function saveDuncvFollowup(phone, status, sel) {
  if (!phone || !status) return;
  const prev = (duncvRows().find((r) => r.phone === phone) || {}).follow || '';
  if (sel) sel.disabled = true;
  try {
    await api('/api/direct-uncv/followup', { method: 'POST', body: { phone, status } });
    Rec.duncvData = await api('/api/direct-uncv');
    Rec.duncvCount = (Rec.duncvData.summary || {}).unconverted || 0;
    renderDatasetTabs();
    renderDirectUncv();
    toast('跟进状态已保存', 'ok');
  } catch (err) {
    if (sel) { sel.disabled = false; sel.value = prev || status; }
    toast(err.message, 'err');
  }
}

function exportDirectUncv() {
  const v = Rec.duncv;
  const rows = duncvFiltered();
  const modeB = (Rec.duncvData || {}).mode === 'B';
  if (v.sub === 'emp') {
    const sum = duncvSummaryOf(rows);
    downloadCsv('直推未转化-按销售汇总.csv', sum.byEmp, [
      { label: '工号', value: (r) => r.empId },
      { label: '销售', value: (r) => r.empName },
      { label: '基地', value: (r) => r.base },
      { label: modeB ? '客户数' : '分到量', value: (r) => r.assigned },
      { label: '已转化', value: (r) => r.converted },
      ...(modeB ? [{ label: '转化金额', value: (r) => r.amount }] : []),
      { label: '未转化', value: (r) => r.unconverted },
      ...(modeB ? [] : [{ label: '无效号码', value: (r) => r.invalid }]),
      { label: '未转化率', value: (r) => (r.rate === null ? '' : `${(r.rate * 100).toFixed(1)}%`) }
    ]);
    toast(`已导出 ${sum.byEmp.length} 位销售汇总`, 'ok');
    return;
  }
  downloadCsv('直推未转化名单.csv', rows, [
    { label: '转介绍时间', value: (r) => duncvTimeKey(r) },
    { label: modeB ? '客户ID(c)' : '手机号', value: (r) => r.phone },
    { label: '客户姓名', value: (r) => r.customer },
    { label: '销售工号', value: (r) => r.empId },
    { label: '销售姓名', value: (r) => r.empName },
    { label: '基地', value: (r) => r.base },
    { label: modeB ? '转介绍系统' : '渠道', value: (r) => r.channel },
    { label: modeB ? '订单行数' : '分配次数', value: (r) => r.times },
    ...(modeB ? [{ label: '转化金额', value: (r) => r.amount }] : []),
    { label: '判定', value: (r) => (r.kind === 'converted' ? '已转化' : (r.kind === 'invalid' ? '无效号码' : '未转化')) },
    { label: '跟进状态', value: (r) => r.status },
    { label: '回写人', value: (r) => r.followBy },
    { label: '回写时间', value: (r) => r.followAt }
  ]);
  toast(`已导出 ${rows.length} 条名单`, 'ok');
}

/* ---------------- A-B-C 链路分析视图（窗口⑤ 按 c 去重 × 窗口① 金额左连） ---------------- */

function chainRows() {
  const d = Rec.chainData;
  return (d && d.rows) || [];
}

function chainTimeKey(r) { return String(r.time || '').trim(); }

function chainFiltered() {
  const v = Rec.chain;
  const q = String(v.q || '').trim().toLowerCase();
  const fromDate = String(v.from || '').slice(0, 10);
  const toDate = String(v.to || '').slice(0, 10);
  const rows = chainRows().filter((r) => {
    const t = chainTimeKey(r).slice(0, 10);
    if (fromDate && (!t || t < fromDate)) return false;
    if (toDate && (!t || t > toDate)) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (v.kind !== 'all' && r.kind !== v.kind) return false;
    if (q && !`${r.c} ${r.a} ${r.b} ${r.empId} ${r.empName} ${r.base}`.toLowerCase().includes(q)) return false;
    return true;
  });
  rows.sort((a, b) => {
    const c = String(a.time).localeCompare(String(b.time)) || String(a.c).localeCompare(String(b.c));
    return v.desc ? -c : c;
  });
  return rows;
}

/** 按当前筛选行重算汇总（与服务端口径一致） */
function chainSummaryOf(rows) {
  const relations = rows.length;
  const converted = rows.filter((r) => r.kind === 'converted').length;
  const unconverted = relations - converted;
  let totalAmount = 0;
  const byA = new Map();
  const byB = new Map();
  rows.forEach((r) => {
    totalAmount += Number(r.amount) || 0;
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

async function loadChain() {
  const card = $('#chainCard');
  if (!card) return;
  if (!Rec.chainData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    try {
      Rec.chainData = await api('/api/abc-chain');
      Rec.chainCount = (Rec.chainData.summary || {}).unconverted || 0;
      renderDatasetTabs();
    } catch (err) {
      card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`;
      return;
    }
  }
  renderChain();
}

function renderChain() {
  const card = $('#chainCard');
  if (!card) return;
  const v = Rec.chain;
  const src = Rec.chainData || {};
  const all = chainRows();
  const filtered = chainFiltered();
  const sum = chainSummaryOf(filtered);
  const shown = v.sub === 'list' ? filtered.slice(0, v.limit) : filtered;
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');
  const pct = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);
  const maskId = (s) => { const t = String(s || ''); return t.length > 26 ? t.slice(0, 26) + '…' : t; };

  $('#pageSubtitle').textContent = `A-B-C 链路分析 · ${src.source || '窗口⑤ 按 c 去重（保留最早绑定）左连窗口① 金额，空 = 未转化'}；a=销售UID，b=老用户ID(推荐人)，c=新用户ID(被推荐人)，仅统计角色=销售`;

  const statCard = (label, value, foot, tone) => `
    <div style="flex:1;min-width:130px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
      <div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px;${tone ? `color:${tone}` : ''}">${esc(String(value))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(foot || '')}</div>
    </div>`;

  const kindTag = (r) => r.kind === 'converted'
    ? '<span class="badge st-已转化">已转化</span>'
    : '<span class="tag-sim">未转化</span>';

  const listHead = `<tr>
      <th>最早绑定时间</th><th>销售UID（a）</th><th>老用户ID（b）</th><th>新用户ID（c）</th>
      <th>销售工号</th><th>销售姓名</th><th>基地</th><th class="num">订单行数</th><th class="num">窗口①金额</th><th>判定</th>
    </tr>`;
  const listRows = shown.map((r) => `<tr>
      <td class="num nowrap">${esc(chainTimeKey(r) || '—')}</td>
      <td class="num mono" title="${esc(r.a)}">${esc(maskId(r.a) || '—')}</td>
      <td class="num mono" title="${esc(r.b)}">${esc(maskId(r.b) || '—')}</td>
      <td class="num mono" title="${esc(r.c)}">${esc(maskId(r.c) || '—')}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td>${esc(r.empName || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td class="num">${r.times > 1 ? `<b>${r.times}</b>` : r.times}</td>
      <td class="num nowrap">${r.amount > 0 ? `<b style="color:#15803d">${fmtMoney(r.amount)}</b>` : '<span class="muted">0</span>'}</td>
      <td>${kindTag(r)}</td>
    </tr>`).join('');

  const byARows = (v.sub === 'emp' ? sum.byA : []).map((e, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td class="num mono" title="${esc(e.a)}">${esc(maskId(e.a) || '—')}</td>
      <td class="num">${esc(e.empId || '—')}</td>
      <td class="strong">${esc(e.empName || '—')}</td>
      <td>${esc(e.base || '未匹配')}</td>
      <td class="num">${fmtInt(e.oldUsers)}</td>
      <td class="num"><b>${fmtInt(e.newUsers)}</b></td>
      <td class="num" style="color:#15803d">${fmtInt(e.converted)}</td>
      <td class="num" style="color:#b45309">${fmtInt(e.unconverted)}</td>
      <td class="num nowrap">${fmtMoney(e.amount)}</td>
      <td class="num"><b>${pct(e.rate)}</b></td>
    </tr>`).join('');

  const byBRows = (v.sub === 'old' ? sum.byB : []).map((e, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td class="num mono" title="${esc(e.b)}">${esc(maskId(e.b) || '—')}</td>
      <td class="num"><b>${fmtInt(e.newUsers)}</b></td>
      <td class="num" style="color:#15803d">${fmtInt(e.converted)}</td>
      <td class="num" style="color:#b45309">${fmtInt(e.unconverted)}</td>
      <td class="num nowrap">${fmtMoney(e.amount)}</td>
      <td class="num"><b>${pct(e.rate)}</b></td>
    </tr>`).join('');

  const emptyRow = (colspan, tip) => `<tr><td colspan="${colspan}"><div class="empty"><h3>当前筛选条件下暂无数据</h3><p>${esc(tip || '调整筛选条件后重试')}</p></div></td></tr>`;

  card.innerHTML = `
    <div class="card-body" style="border-bottom:1px solid var(--line)">
      <div class="records-toolbar" style="margin-bottom:0;flex-wrap:wrap;gap:8px">
        <div class="field"><label>起止时间</label>
          <div class="date-range">
            <input class="control" id="chainFrom" type="date" value="${esc(String(v.from).slice(0, 10))}">
            <span class="range-sep">~</span>
            <input class="control" id="chainTo" type="date" value="${esc(String(v.to).slice(0, 10))}">
          </div>
        </div>
        <div class="field"><label>基地</label>
          <select class="control" id="chainBase" style="width:120px">${baseOpts}</select>
        </div>
        <div class="field"><label>判定</label>
          <select class="control" id="chainKind" style="width:150px">
            <option value="all" ${v.kind === 'all' ? 'selected' : ''}>全部</option>
            <option value="converted" ${v.kind === 'converted' ? 'selected' : ''}>仅已转化</option>
            <option value="unconverted" ${v.kind === 'unconverted' ? 'selected' : ''}>仅未转化</option>
          </select>
        </div>
        <div class="field grow"><label>搜索</label>
          <input class="control search" id="chainSearch" placeholder="a / b / c / 工号 / 姓名 / 基地" value="${esc(v.q)}">
        </div>
        <div class="spacer"></div>
        <button class="btn btn-sm" id="chainSort" type="button">时间 ${v.desc ? '↓ 倒序' : '↑ 正序'}</button>
        <button class="btn btn-sm" id="chainReset" type="button">重置</button>
      </div>
      <div class="records-toolbar" style="margin:10px 0 0;gap:6px">
        <button class="table-tab ${v.sub === 'list' ? 'active' : ''}" data-csub="list" type="button">链路明细</button>
        <button class="table-tab ${v.sub === 'emp' ? 'active' : ''}" data-csub="emp" type="button">按销售（a）汇总</button>
        <button class="table-tab ${v.sub === 'old' ? 'active' : ''}" data-csub="old" type="button">按老用户（b）汇总</button>
        <div class="spacer"></div>
        <span class="records-summary">链路关系 <b>${fmtInt(sum.relations)}</b> · 已转化 <b>${fmtInt(sum.converted)}</b> · 未转化 <b style="color:#b45309">${fmtInt(sum.unconverted)}</b> · 金额 <b>${fmtMoney(sum.totalAmount)}</b></span>
      </div>
    </div>
    <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--line)">
      ${statCard('链路关系数', fmtInt(sum.relations), '按 c 去重（保留最早绑定）')}
      ${statCard('未转化率', pct(sum.rate), `窗口① 无金额或金额=0`, '#b45309')}
      ${statCard('转化金额', fmtMoney(sum.totalAmount), `来自窗口①「${(src.amountCol || '金额')}」`, '#15803d')}
      ${statCard('销售（a）数', fmtInt(sum.salesCount), `单销售最多带 ${fmtInt(sum.maxPerSales)} 个新用户`)}
      ${statCard('老用户（b）数', fmtInt(sum.oldUserCount), `单老用户最多推荐 ${fmtInt(sum.maxPerOld)} 个新用户`)}
    </div>
    ${v.sub === 'list' ? `
    <div class="table-wrap" style="max-height:58vh">
      <table class="table">
        <thead>${listHead}</thead>
        <tbody>${listRows || emptyRow(10)}</tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>${filtered.length > shown.length ? `已显示前 ${fmtInt(shown.length)} 条` : `共 ${fmtInt(filtered.length)} 条`}</span>
      ${filtered.length > shown.length ? '<button class="btn btn-sm" id="chainMore" type="button">显示更多</button>' : ''}
    </div>` : v.sub === 'emp' ? `
    <div class="table-wrap" style="max-height:58vh">
      <table class="table">
        <thead><tr><th>排名</th><th>销售UID（a）</th><th>工号</th><th>销售</th><th>基地</th><th class="num">老用户数</th><th class="num">新用户数</th><th class="num">已转化</th><th class="num">未转化</th><th class="num">金额</th><th class="num">未转化率</th></tr></thead>
        <tbody>${byARows || emptyRow(11)}</tbody>
      </table>
    </div>
    <div class="table-footer"><span>共 ${fmtInt(sum.byA.length)} 位销售（a） · 新用户数 = 该销售名下去重后的 c 数</span></div>` : `
    <div class="table-wrap" style="max-height:58vh">
      <table class="table">
        <thead><tr><th>排名</th><th>老用户ID（b）</th><th class="num">推荐新用户数</th><th class="num">已转化</th><th class="num">未转化</th><th class="num">金额</th><th class="num">未转化率</th></tr></thead>
        <tbody>${byBRows || emptyRow(7)}</tbody>
      </table>
    </div>
    <div class="table-footer"><span>共 ${fmtInt(sum.byB.length)} 位老用户（b） · 可作为龙珠奖（2.8）推荐榜单的底表</span></div>`}
  `;

  $('#chainFrom').addEventListener('change', (e) => { v.from = e.target.value; v.limit = 200; renderChain(); });
  $('#chainTo').addEventListener('change', (e) => { v.to = e.target.value; v.limit = 200; renderChain(); });
  $('#chainBase').addEventListener('change', (e) => { v.base = e.target.value; v.limit = 200; renderChain(); });
  $('#chainKind').addEventListener('change', (e) => { v.kind = e.target.value; v.limit = 200; renderChain(); });
  $('#chainSearch').addEventListener('input', debounce((e) => { v.q = e.target.value; v.limit = 200; renderChain(); }, 250));
  $('#chainSort').addEventListener('click', () => { v.desc = !v.desc; renderChain(); });
  $('#chainReset').addEventListener('click', () => {
    Rec.chain = { from: '', to: '', base: 'all', kind: 'all', q: '', limit: 200, desc: true, sub: Rec.chain.sub };
    renderChain();
  });
  $$('#chainCard [data-csub]').forEach((btn) => {
    btn.addEventListener('click', () => { v.sub = btn.dataset.csub; renderChain(); });
  });
  const more = $('#chainMore');
  if (more) more.addEventListener('click', () => { v.limit += 500; renderChain(); });
}

function exportChain() {
  const v = Rec.chain;
  const rows = chainFiltered();
  const sum = chainSummaryOf(rows);
  if (v.sub === 'emp') {
    downloadCsv('ABC链路-按销售汇总.csv', sum.byA, [
      { label: '销售UID(a)', value: (r) => r.a },
      { label: '工号', value: (r) => r.empId },
      { label: '销售', value: (r) => r.empName },
      { label: '基地', value: (r) => r.base },
      { label: '老用户数', value: (r) => r.oldUsers },
      { label: '新用户数', value: (r) => r.newUsers },
      { label: '已转化', value: (r) => r.converted },
      { label: '未转化', value: (r) => r.unconverted },
      { label: '金额', value: (r) => r.amount },
      { label: '未转化率', value: (r) => (r.rate === null ? '' : `${(r.rate * 100).toFixed(1)}%`) }
    ]);
    toast(`已导出 ${sum.byA.length} 位销售汇总`, 'ok');
    return;
  }
  if (v.sub === 'old') {
    downloadCsv('ABC链路-按老用户汇总.csv', sum.byB, [
      { label: '老用户ID(b)', value: (r) => r.b },
      { label: '推荐新用户数', value: (r) => r.newUsers },
      { label: '已转化', value: (r) => r.converted },
      { label: '未转化', value: (r) => r.unconverted },
      { label: '金额', value: (r) => r.amount },
      { label: '未转化率', value: (r) => (r.rate === null ? '' : `${(r.rate * 100).toFixed(1)}%`) }
    ]);
    toast(`已导出 ${sum.byB.length} 位老用户汇总`, 'ok');
    return;
  }
  downloadCsv('ABC链路-链路明细.csv', rows, [
    { label: '最早绑定时间', value: (r) => chainTimeKey(r) },
    { label: '销售UID(a)', value: (r) => r.a },
    { label: '老用户ID(b)', value: (r) => r.b },
    { label: '新用户ID(c)', value: (r) => r.c },
    { label: '销售工号', value: (r) => r.empId },
    { label: '销售姓名', value: (r) => r.empName },
    { label: '基地', value: (r) => r.base },
    { label: '订单行数', value: (r) => r.times },
    { label: '窗口①金额', value: (r) => r.amount },
    { label: '判定', value: (r) => (r.kind === 'converted' ? '已转化' : '未转化') }
  ]);
  toast(`已导出 ${rows.length} 条链路明细`, 'ok');
}

function visibleCols() {
  const allow = (Rec.settings && Rec.settings.recordColumns) || null;
  const keys = allow && allow.length ? allow : ['customer', 'phone', 'base', 'status', 'channel', 'empName', 'date'];
  return keys.filter((k) => COLS[k]);
}

function isKocDataset() {
  const ds = Rec.datasets.find((d) => d.id === Rec.dataset);
  return !!(ds && ds.preset === 'koc');
}

/** 当前 KOC 分层配置（阈值 + 颜色），来自底表元数据 */
function kocCfg() {
  const ds = Rec.datasets.find((d) => d.id === Rec.dataset);
  return (ds && ds.kocConfig) || { t1: 6, t2: 3, colors: { t1: '#e0a93e', t2: '#b48cc8', t3: '#5b9bd5', t4: '#5bbf8a' } };
}

/** KOC层级 → 配置颜色（hex），未匹配返回 null */
function tierColorOf(status, cfg) {
  if (!status) return null;
  if (status === `历史累计≥${cfg.t1}`) return cfg.colors.t1;
  if (/^历史累计/.test(status)) return cfg.colors.t2;
  if (status === '26年推荐成功') return cfg.colors.t3;
  if (status === '未入选') return cfg.colors.t4;
  return null;
}

/** 彩色层级标签（颜色由 color-mix 自动生成淡色底 + 深色字） */
function tierBadge(status, cfg) {
  if (!status) return '<span class="muted">—</span>';
  const hex = tierColorOf(status, cfg);
  if (!hex) return `<span class="badge">${esc(status)}</span>`;
  return `<span class="koc-tier" style="background:color-mix(in srgb, ${hex} 16%, white);color:color-mix(in srgb, ${hex} 62%, black);border:1px solid color-mix(in srgb, ${hex} 32%, white)">${esc(status)}</span>`;
}

/** KOC 底表列宽调整：基地/负责人加宽，人名列与基地强制单行不换行 */
function kocThStyle(label) {
  switch (label) {
    case '基地': return 'min-width:110px';
    case '负责人': return 'min-width:120px';
    case '老用户ID': return 'width:150px';
    case '高经': case '经理': case '储备经理': case '主管': case '组长': return 'white-space:nowrap';
    default: return '';
  }
}

/** KOC 底表强制单行显示的列（基地 + 所有人名列，避免被宽列挤压竖排） */
function kocTdNoWrap(label) {
  return ['基地', '负责人', '高经', '经理', '储备经理', '主管', '组长'].includes(label);
}

function renderTable() {
  const d = Rec.data;
  if (!d) return;
  const cols = visibleCols();
  const dyn = dynamicCols();
  const koc = isKocDataset();
  const cfg = koc ? kocCfg() : null;
  const baseColor = {};
  Rec.bases.forEach((b) => { baseColor[b.id] = b.color; });
  // 标准列 + 底表自定义列（数值型右对齐格式化；KOC 底表：层级彩色标签 / 重合淡红标签 / 模拟备注）
  const allCols = cols.map((k) => {
    const label = k === 'status' && koc ? 'KOC层级' : COLS[k].label;
    return {
      label,
      thStyle: koc ? kocThStyle(label) : '',
      tdClass: koc && kocTdNoWrap(label) ? 'nw' : '',
      get: (r) => {
        const row = { ...r, baseColor: baseColor[r.baseId] };
        if (k === 'status') return koc ? tierBadge(r.status, cfg) : COLS.status.get(row);
        return COLS[k].get(row);
      }
    };
  }).concat(dyn.map((f) => {
    const thStyle = koc ? kocThStyle(f.label) : '';
    let get;
    if (f.key === 'overlapNote') {
      get = (r) => (r.overlapNote ? '<span class="tag-overlap">重合</span>' : '<span class="muted">—</span>');
    } else if (f.key === 'oldUserId') {
      get = (r) => `<span class="mono text-sm" style="word-break:break-all">${esc(r[f.key] || '—')}</span>`;
    } else if (f.key === 'managerName' || f.key === 'manager2' || f.key === 'manager3' || f.key === 'manager4' || f.key === 'manager5') {
      get = (r) => `<span class="nw-name">${esc(r[f.key] || '—')}</span>`;
    } else if (f.type === 'number') {
      get = (r) => `<span class="num">${r[f.key] === 0 || r[f.key] ? fmt(r[f.key], 'int') : '—'}</span>`;
    } else {
      get = (r) => esc(r[f.key] || '—');
    }
    return { label: f.label, thStyle, tdClass: koc && kocTdNoWrap(f.label) ? 'nw' : '', get };
  }));

  $('#pageSubtitle').textContent = `${d.dataset.name} · 搜索、筛选并查看每一条名单明细；姓名与手机号已脱敏`;

  $('#recordsTable thead').innerHTML = `<tr>${allCols.map((c) => `<th${c.thStyle ? ` style="${c.thStyle}"` : ''}>${c.label}</th>`).join('')}<th style="width:60px"></th></tr>`;
  $('#recordsTable tbody').innerHTML = d.rows.length ? d.rows.map((r, i) => `
    <tr class="row-link" data-idx="${i}">
      ${allCols.map((c) => `<td${c.tdClass ? ` class="${c.tdClass}"` : ''}>${c.get(r)}</td>`).join('')}
      <td style="text-align:right;color:#94a3b8">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </td>
    </tr>`).join('') : `<tr><td colspan="${allCols.length + 1}"><div class="empty"><h3>没有符合条件的名单</h3><p>请调整筛选条件或搜索关键字</p></div></td></tr>`;

  $('#recordsSummary').textContent = `共 ${fmtInt(d.total)} 条`;
  $('#pageInfo').textContent = d.total ? `第 ${d.page} / ${d.pages} 页 · 每页 ${d.pageSize} 条` : '—';
  renderPager(d);
  // 2.12 KOC 分层配置按钮已迁移至后台「展示配置」（仅管理员）

  $$('#recordsTable [data-idx]').forEach((tr) => {
    tr.addEventListener('click', () => openDrawer(d.rows[Number(tr.dataset.idx)]));
  });
}

function renderPager(d) {
  const wrap = $('#pager');
  const maxShow = 7;
  let start = Math.max(1, d.page - 3);
  let end = Math.min(d.pages, start + maxShow - 1);
  start = Math.max(1, end - maxShow + 1);
  const btn = (p, label, opts = {}) => `<button ${opts.disabled ? 'disabled' : ''} class="${p === d.page && !opts.jump ? 'active' : ''}" data-p="${p}" type="button">${label}</button>`;
  let html = btn(d.page - 1, '‹ 上一页', { disabled: d.page <= 1, jump: true });
  if (start > 1) html += btn(1, '1') + (start > 2 ? '<span style="color:#cbd5e1">…</span>' : '');
  for (let p = start; p <= end; p += 1) html += btn(p, String(p));
  if (end < d.pages) html += (end < d.pages - 1 ? '<span style="color:#cbd5e1">…</span>' : '') + btn(d.pages, String(d.pages));
  html += btn(d.page + 1, '下一页 ›', { disabled: d.page >= d.pages, jump: true });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-p]').forEach((b) => {
    b.addEventListener('click', () => {
      Rec.page = Number(b.dataset.p);
      load();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function openDrawer(r) {
  // KOC 底表（高潜名单）：只展示上传的原始字段，剔除系统生成列（KOC层级/重合备注等）
  const raw = isKocDataset() && r._raw ? r._raw : null;
  if (raw) {
    $('#drawerTitle').textContent = raw['姓名'] || raw['老用户ID'] || '未填写姓名';
    $('#drawerSub').textContent = `行号 ${r._rowNo}`;
  } else {
    $('#drawerTitle').textContent = r.customer || r.empName || '未填写姓名';
    $('#drawerSub').textContent = `${r.baseName || '—'} · ${r.date || '—'} · 行号 ${r._rowNo}`;
  }
  let rows;
  if (raw) {
    const ds = Rec.datasets.find((d) => d.id === Rec.dataset) || {};
    rows = ((ds.standardFields || []).filter((f) => f && f.key && !f.computed))
      .map((f) => [f.label, raw[f.label]]);
  } else {
    rows = [
      ['客户姓名', r.customer],
      ['手机号', r.phone],
      ['基地', r.baseName],
      isKocDataset() ? ['KOC层级', { html: tierBadge(r.status, kocCfg()) }] : ['状态', r.status],
      ['渠道', r.channel],
      ['负责人', r.empName ? `${r.empName}（${r.empId}）` : '—'],
      ['所属团队', r.teamName],
      ['高经', r.managerName],
      ['日期', r.date],
      ['金额', r.amount ? fmt(r.amount, 'money') : '—']
    ];
    // 底表自定义字段（高潜名单：老用户ID/新体验/新正价）
    dynamicCols().forEach((f) => {
      rows.push([f.label, f.type === 'number' ? (r[f.key] === 0 || r[f.key] ? fmt(r[f.key], 'int') : '') : r[f.key]]);
    });
  }
  $('#drawerBody').innerHTML = `
    <dl class="detail-list">
      ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v && v.html ? v.html : (v === '' || v === undefined ? '—' : esc(v))}</dd>`).join('')}
    </dl>
    <div class="alert" style="margin-top:16px;align-items:center">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
      <div>前台展示已脱敏；完整信息仅后台可见。</div>
    </div>`;
  $('#drawerBackdrop').classList.add('open');
  $('#drawer').classList.add('open');
}

function closeDrawer() {
  $('#drawerBackdrop').classList.remove('open');
  $('#drawer').classList.remove('open');
}

/* =========================================================================
   2.6 KOC 三类分层视图
   ========================================================================= */

function ktierRows() {
  const d = Rec.ktierData;
  if (!d) return [];
  let rows = d.rows || [];
  if (Rec.user.role === 'base' && Rec.user.baseName) {
    const norm = (x) => String(x || '').trim().replace(/基地$/, '');
    const mine = norm(Rec.user.baseName);
    rows = rows.filter((r) => norm(r.base) === mine);
  }
  return rows;
}

function ktierFiltered() {
  const v = Rec.ktier;
  const q = String(v.q || '').trim().toLowerCase();
  return ktierRows().filter((r) => {
    if (v.tier !== 'all' && r.tier !== v.tier) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (q && !`${r.id} ${r.empId} ${r.empName} ${r.base} ${r.gj}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function ktierBadge(t) {
  const cfg = { A: ['A · 星推官', '#7c3aed'], B: ['B · 潜力星推官', '#2563eb'], C: ['C · 26年推荐成功', '#15803d'] };
  const [label, color] = cfg[t] || [t, '#64748b'];
  return `<span class="badge" style="background:${color}1a;color:${color};border:1px solid ${color}40">${esc(label)}</span>`;
}

function loadKtier() {
  const card = $('#ktierCard');
  if (!card) return;
  if (!Rec.ktierData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    api('/api/koc-tier').then((d) => { Rec.ktierData = d; Rec.ktierCount = (d.summary || {}).pool || 0; renderDatasetTabs(); renderKtier(); })
      .catch((err) => { card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`; });
    return;
  }
  renderKtier();
}

function renderKtier() {
  const card = $('#ktierCard');
  if (!card) return;
  const v = Rec.ktier;
  const src = Rec.ktierData || {};
  const sum = src.summary || {};
  const all = ktierRows();
  const filtered = ktierFiltered();
  const shown = filtered.slice(0, v.limit);
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');
  const pct = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);

  $('#pageSubtitle').textContent = 'KOC 三类分层 · A=累计新正价≥6（可申请星推官）｜B=累计 3~5（潜力星推官）｜C=26年新正价>0（26年有成功推荐）；优先级 A>B>C，总池=三类按老用户ID去重';

  const statCard = (label, value, foot, tone) => `
    <div style="flex:1;min-width:130px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
      <div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px;${tone ? `color:${tone}` : ''}">${esc(String(value))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(foot || '')}</div>
    </div>`;

  const listRows = shown.map((r) => `<tr>
      <td>${ktierBadge(r.tier)}</td>
      <td class="num mono text-sm">${esc(r.id)}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td class="strong">${esc(r.empName || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td class="num">${fmtInt(r.tyTotal)}</td>
      <td class="num"><b>${fmtInt(r.ztTotal)}</b></td>
      <td class="num">${r.tier === 'C' ? '<span class="muted">—</span>' : fmtInt(r.ty26)}</td>
      <td class="num">${r.tier === 'C' ? '<span class="muted">—</span>' : fmtInt(r.zt26)}</td>
      <td class="num nowrap">${fmtMoney(r.amountTotal)}</td>
      <td class="muted text-sm">${esc(r.kocLevel || '—')}</td>
    </tr>`).join('');

  const byBaseRows = (sum.byBase || []).map((b) => `<tr>
      <td class="strong">${esc(b.base)}</td>
      <td class="num" style="color:#7c3aed">${fmtInt(b.A)}</td>
      <td class="num" style="color:#2563eb">${fmtInt(b.B)}</td>
      <td class="num" style="color:#15803d">${fmtInt(b.C)}</td>
      <td class="num"><b>${fmtInt(b.pool)}</b></td>
      <td class="num">${pct(sum.pool ? b.pool / sum.pool : null)}</td>
    </tr>`).join('');

  const subHead = v.sub === 'base'
    ? `<table class="table"><thead><tr><th>基地</th><th class="num">A 类</th><th class="num">B 类</th><th class="num">C 类</th><th class="num">小计</th><th class="num">占比</th></tr></thead><tbody>${byBaseRows || '<tr><td colspan="6"><div class="empty"><h3>暂无数据</h3></div></td></tr>'}</tbody></table>
       <div class="table-footer"><span>总池 ${fmtInt(sum.pool)} 人 = A ${fmtInt(sum.A)} + B ${fmtInt(sum.B)} + C ${fmtInt(sum.C)}（按老用户ID去重）</span></div>`
    : `<table class="table">
        <thead><tr><th>层级</th><th>老用户ID</th><th>销售工号</th><th>姓名</th><th>基地</th><th class="num">累计体验</th><th class="num">累计正价</th><th class="num">26年体验</th><th class="num">26年正价</th><th class="num">累计金额</th><th>原层级标记</th></tr></thead>
        <tbody>${listRows || '<tr><td colspan="11"><div class="empty"><h3>当前筛选条件下暂无数据</h3></div></td></tr>'}</tbody>
      </table>
      <div class="table-footer"><span>共 ${fmtInt(filtered.length)} 人（已按 A>B>C 分层）${filtered.length > shown.length ? ` · 显示前 ${fmtInt(shown.length)} 条` : ''}</span></div>`;

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h3>KOC 三类分层</h3><p class="records-summary">A <b>${fmtInt(sum.A)}</b>（${pct(sum.rateA)}） · B <b>${fmtInt(sum.B)}</b>（${pct(sum.rateB)}） · C <b>${fmtInt(sum.C)}</b>（${pct(sum.rateC)}） · 总池 <b>${fmtInt(sum.pool)}</b> · 26年推荐正价 ${fmtInt(sum.zt26Total)} 人次</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm ${v.sub !== 'base' ? 'btn-primary' : ''}" data-ksub="list" type="button">名单</button>
        <button class="btn btn-sm ${v.sub === 'base' ? 'btn-primary' : ''}" data-ksub="base" type="button">按基地汇总</button>
        <button class="btn btn-sm" id="resetBtn2" type="button">${icon('rotate', 13)} 重置</button>
        <button class="btn btn-sm" id="exportBtn2" type="button">${icon('download', 13)} 导出</button>
      </div>
    </div>
    <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--line)">
      ${statCard('总池（去重）', fmtInt(sum.pool), '三类按老用户ID去重')}
      ${statCard('A 类 · 星推官', fmtInt(sum.A), '累计新正价 ≥ 6，占比 ' + pct(sum.rateA), '#7c3aed')}
      ${statCard('B 类 · 潜力星推官', fmtInt(sum.B), '累计新正价 3~5，占比 ' + pct(sum.rateB), '#2563eb')}
      ${statCard('C 类 · 26年推荐成功', fmtInt(sum.C), '26年新正价 > 0，占比 ' + pct(sum.rateC), '#15803d')}
    </div>
    <div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
      <div class="field"><label>层级</label>
        <select class="control" id="ktierTier" style="width:140px">
          <option value="all" ${v.tier === 'all' ? 'selected' : ''}>全部层级</option>
          <option value="A" ${v.tier === 'A' ? 'selected' : ''}>A · 星推官</option>
          <option value="B" ${v.tier === 'B' ? 'selected' : ''}>B · 潜力星推官</option>
          <option value="C" ${v.tier === 'C' ? 'selected' : ''}>C · 26年推荐成功</option>
        </select>
      </div>
      <div class="field"><label>基地</label>
        <select class="control" id="ktierBase" style="width:130px">${baseOpts}</select>
      </div>
      <div class="field grow"><label>搜索</label>
        <input class="control search" id="ktierSearch" placeholder="老用户ID / 工号 / 姓名 / 基地" value="${esc(v.q)}">
      </div>
    </div>
    <div class="card-body" style="padding:0">${subHead}</div>`;

  $('#pageSubtitle').dataset.view = 'ktier';

  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  bind('#ktierTier', 'change', (e) => { v.tier = e.target.value; renderKtier(); });
  bind('#ktierBase', 'change', (e) => { v.base = e.target.value; renderKtier(); });
  bind('#ktierSearch', 'input', debounce((e) => { v.q = $('#ktierSearch').value.trim(); renderKtier(); }, 300));
  $$('#ktierCard [data-ksub]').forEach((btn) => btn.addEventListener('click', () => { v.sub = btn.dataset.ksub; renderKtier(); }));
  const r2 = $('#resetBtn2');
  if (r2) r2.addEventListener('click', () => { Rec.ktier = { tier: 'all', base: 'all', q: '', limit: 200, sub: v.sub }; renderKtier(); });
  const e2 = $('#exportBtn2');
  if (e2) e2.addEventListener('click', exportKtier);
  const more = $('#ktierMore');
  if (more) more.addEventListener('click', () => { v.limit += 500; renderKtier(); });
}

function exportKtier() {
  const v = Rec.ktier;
  const src = Rec.ktierData || {};
  if (v.sub === 'base') {
    downloadCsv('KOC三类分层-按基地汇总.csv', (src.summary || {}).byBase || [], [
      { label: '基地', value: (r) => r.base },
      { label: 'A类', value: (r) => r.A },
      { label: 'B类', value: (r) => r.B },
      { label: 'C类', value: (r) => r.C },
      { label: '小计', value: (r) => r.pool }
    ]);
    toast('已导出按基地汇总', 'ok');
    return;
  }
  const rows = ktierFiltered();
  downloadCsv('KOC三类分层名单.csv', rows, [
    { label: '层级', value: (r) => r.tier },
    { label: '老用户ID', value: (r) => r.id },
    { label: '销售工号', value: (r) => r.empId },
    { label: '姓名', value: (r) => r.empName },
    { label: '基地', value: (r) => r.base },
    { label: '累计体验', value: (r) => r.tyTotal },
    { label: '累计正价', value: (r) => r.ztTotal },
    { label: '26年体验', value: (r) => r.ty26 },
    { label: '26年正价', value: (r) => r.zt26 },
    { label: '累计金额', value: (r) => r.amountTotal }
  ]);
  toast(`已导出 ${rows.length} 人名单`, 'ok');
}

/* =========================================================================
   业绩页签（原业绩排行页并入）：由 rankings.js 提供 initRankings / Rank.load
   ========================================================================= */

let rankInited = false;

function loadRankView() {
  const card = $('#rankCard');
  if (!card) return;
  if (!perfDataset()) {
    card.innerHTML = '<div class="card-body"><div class="empty"><h3>暂无业绩底表</h3><p>业绩榜单需要先在后台上传有数业绩完成度等业绩底表</p></div></div>';
    return;
  }
  $('#pageSubtitle').textContent = '业绩榜单 · 高经 / 经理 / 销售三榜 · 按取数逻辑实时计算；鼠标悬停数字可查看计算公式，移开即隐藏';
  if (!rankInited) {
    rankInited = true;
    initRankings({ user: Rec.user, datasets: Rec.datasets, settings: Rec.settings });
  } else {
    loadRank();
  }
}

/* =========================================================================
   钻石兑换与使用明细（合并页签）：兑换名明细 / 钻石使用明细 两个按钮切换
   ========================================================================= */

function loadDmd2() {
  $('#pageSubtitle').textContent = '钻石兑换与使用明细 · 「兑换名明细」=已转化订单与应发放钻石；「钻石使用明细」=老用户钻石发放/消耗/剩余（解冻：正价课满30天未退）';
  renderDmd2();
  if (Rec.dmd2.mode === 'orders') loadDiamondOrders();
  else loadDiamond();
}

function renderDmd2() {
  const ordersBtn = $('#dmd2BtnOrders');
  const usageBtn = $('#dmd2BtnUsage');
  const p1 = $('#dmdPanel');
  const p2 = $('#diamondPanel');
  if (!ordersBtn) return;
  const mode = Rec.dmd2.mode;
  ordersBtn.classList.toggle('btn-primary', mode === 'orders');
  usageBtn.classList.toggle('btn-primary', mode === 'usage');
  if (p1) p1.style.display = mode === 'orders' ? 'block' : 'none';
  if (p2) p2.style.display = mode === 'usage' ? 'block' : 'none';
  const src = (mode === 'orders' ? (Rec.dmdData || {}).summary : (Rec.diamondData || {}).summary) || {};
  const sub = $('#dmd2Sub');
  if (sub) {
    sub.innerHTML = mode === 'orders'
      ? `兑换名明细 · 转化订单 <b>${fmtInt(src.orders || 0)}</b> 笔 · 转化金额合计 <b>${fmtMoney(src.amount || 0)}</b> · 销售 <b>${fmtInt(src.emps || 0)}</b> 人`
      : `钻石使用明细 · 未消耗 <b style="color:#b45309">${fmtInt(src.unused || 0)}</b> · 部分消耗 ${fmtInt(src.partial || 0)} · 剩余钻石 <b>${fmtInt(src.restTotal || 0)}</b>`;
  }
}

/* =========================================================================
   直推转化明细（原直推未转化页签）：转介绍转化跟踪全量行
   表头：序号/转介绍日期/高经/经理/主管/组长/销售姓名/工号/A/B/C/活动id/转化年级/转化金额
   ========================================================================= */

function loadDdetail() {
  const card = $('#ddetailCard');
  if (!card) return;
  if (!Rec.ddetailData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    api('/api/direct-detail').then((d) => {
      Rec.ddetailData = d;
      Rec.ddetailCount = (d.summary || {}).total || 0;
      renderDatasetTabs();
      renderDdetail();
    })
      .catch((err) => { card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`; });
    return;
  }
  renderDdetail();
}

function ddetailRows() {
  const d = Rec.ddetailData;
  if (!d) return [];
  let rows = d.rows || [];
  if (Rec.user.role === 'base' && Rec.user.baseName) {
    const norm = (x) => String(x || '').trim().replace(/基地$/, '');
    const mine = norm(Rec.user.baseName);
    rows = rows.filter((r) => norm(r.base) === mine);
  }
  return rows;
}

function ddetailFiltered() {
  const v = Rec.ddetail;
  const q = String(v.q || '').trim().toLowerCase();
  const from = String(v.from || '').trim();
  const to = String(v.to || '').trim();
  return ddetailRows().filter((r) => {
    const t = String(r.introDate || '').slice(0, 10);
    if (from && t && t < from) return false;
    if (to && t && t > to) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (q && !`${r.empName} ${r.empId} ${r.gj} ${r.jl} ${r.zg} ${r.zz} ${r.a} ${r.b} ${r.c} ${r.activityId} ${r.grade} ${r.base}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderDdetail() {
  const card = $('#ddetailCard');
  if (!card) return;
  const v = Rec.ddetail;
  const src = Rec.ddetailData || {};
  const sum = src.summary || {};
  const all = ddetailRows();
  const filtered = ddetailFiltered();
  const shown = filtered.slice(0, v.limit);
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');

  $('#pageSubtitle').textContent = '直推转化明细 · 转介绍转化跟踪全量明细（按转介绍日期倒序）；转化金额>0 即已转化';

  const listRows = shown.map((r) => `<tr>
      <td class="num muted">${r.seq}</td>
      <td class="num nowrap">${esc(r.introDate || '—')}</td>
      <td>${esc(r.gj || '—')}</td>
      <td>${esc(r.jl || '—')}</td>
      <td>${esc(r.zg || '—')}</td>
      <td>${esc(r.zz || '—')}</td>
      <td class="strong">${esc(r.empName || '—')}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td class="num text-sm muted" style="max-width:150px;word-break:break-all">${esc(r.a || '—')}</td>
      <td class="num text-sm muted" style="max-width:150px;word-break:break-all">${esc(r.b || '—')}</td>
      <td class="num text-sm muted" style="max-width:150px;word-break:break-all">${esc(r.c || '—')}</td>
      <td class="num text-sm">${esc(r.activityId || '—')}</td>
      <td>${esc(r.grade || '—')}</td>
      <td class="num nowrap">${r.amount > 0 ? `<b>${fmtMoney(r.amount)}</b>` : '<span class="muted">—</span>'}</td>
    </tr>`).join('');

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h3>直推转化明细</h3><p class="records-summary">明细 <b>${fmtInt(sum.total || 0)}</b> 条 · 已转化 <b>${fmtInt(sum.converted || 0)}</b> 条 · 转化金额合计 <b>${fmtMoney(sum.amount || 0)}</b></p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="ddReset" type="button">${icon('rotate', 13)} 重置</button>
        <button class="btn btn-sm" id="ddExport" type="button">${icon('download', 13)} 导出</button>
      </div>
    </div>
    <div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
      <div class="field"><label>转介绍日期</label>
        <div class="date-range" style="display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:8px;padding:2px 6px;background:var(--surface)">
          <input class="control" id="ddFrom" type="date" value="${esc(String(v.from).slice(0, 10))}" style="width:135px;border:none;background:transparent">
          <span class="muted">~</span>
          <input class="control" id="ddTo" type="date" value="${esc(String(v.to).slice(0, 10))}" style="width:135px;border:none;background:transparent">
        </div>
      </div>
      <div class="field"><label>基地</label>
        <select class="control" id="ddBase" style="width:130px">${baseOpts}</select>
      </div>
      <div class="field grow"><label>搜索</label>
        <input class="control search" id="ddSearch" placeholder="姓名 / 工号 / 高经 / 经理 / A·B·C / 活动id" value="${esc(v.q)}">
      </div>
    </div>
    <div class="card-body" style="padding:0">
      <table class="table">
        <thead><tr><th>序号</th><th>转介绍日期</th><th>高经</th><th>经理</th><th>主管</th><th>组长</th><th>销售姓名</th><th>工号</th><th>A</th><th>B</th><th>C</th><th>活动id</th><th>转化年级</th><th>转化金额</th></tr></thead>
        <tbody>${listRows || '<tr><td colspan="14"><div class="empty"><h3>当前筛选条件下暂无数据</h3></div></td></tr>'}</tbody>
      </table>
      <div class="table-footer"><span>共 ${fmtInt(filtered.length)} 条${filtered.length > shown.length ? ` · 显示前 ${fmtInt(shown.length)} 条` : ''} · 按转介绍日期倒序 · 转化金额>0 即已转化</span></div>
    </div>`;

  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  bind('#ddFrom', 'change', () => { v.from = $('#ddFrom').value; renderDdetail(); });
  bind('#ddTo', 'change', () => { v.to = $('#ddTo').value; renderDdetail(); });
  bind('#ddBase', 'change', (e) => { v.base = e.target.value; renderDdetail(); });
  bind('#ddSearch', 'input', debounce(() => { v.q = $('#ddSearch').value.trim(); renderDdetail(); }, 300));
  bind('#ddReset', 'click', () => { Rec.ddetail = { from: '', to: '', base: 'all', q: '', limit: 300 }; renderDdetail(); });
  bind('#ddExport', 'click', exportDdetail);
}

function exportDdetail() {
  const rows = ddetailFiltered();
  downloadCsv('直推转化明细.csv', rows, [
    { label: '序号', value: (r) => r.seq },
    { label: '转介绍日期', value: (r) => r.introDate },
    { label: '高经', value: (r) => r.gj },
    { label: '经理', value: (r) => r.jl },
    { label: '主管', value: (r) => r.zg },
    { label: '组长', value: (r) => r.zz },
    { label: '销售姓名', value: (r) => r.empName },
    { label: '工号', value: (r) => r.empId },
    { label: 'A', value: (r) => r.a },
    { label: 'B', value: (r) => r.b },
    { label: 'C', value: (r) => r.c },
    { label: '活动id', value: (r) => r.activityId },
    { label: '转化年级', value: (r) => r.grade },
    { label: '转化金额', value: (r) => r.amount }
  ]);
  toast(`已导出 ${rows.length} 条直推转化明细`, 'ok');
}

/* =========================================================================
   2.7 钻石未使用视图
   ========================================================================= */

function diamondRows() {
  const d = Rec.diamondData;
  if (!d) return [];
  let rows = d.rows || [];
  if (Rec.user.role === 'base' && Rec.user.baseName) {
    const norm = (x) => String(x || '').trim().replace(/基地$/, '');
    const mine = norm(Rec.user.baseName);
    rows = rows.filter((r) => norm(r.base) === mine);
  }
  return rows;
}

function diamondFiltered() {
  const v = Rec.diamond;
  const q = String(v.q || '').trim().toLowerCase();
  const rows = diamondRows().filter((r) => {
    if (v.state !== 'all' && r.state !== v.state) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (q && !`${r.b} ${r.empId} ${r.empName} ${r.base}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = v.sort === 'amount' ? (r) => r.amount : (r) => String(r.firstGrant || '');
  return rows.sort((a, b) => v.sort === 'amount' ? b.amount - a.amount : String(b.firstGrant || '').localeCompare(String(a.firstGrant || '')));
}

function diamondStateTag(s) {
  const cfg = { '未消耗': ['#b45309', '未消耗'], '部分消耗': ['#2563eb', '部分消耗'], '已用完': ['#64748b', '已用完'], '无钻石记录': ['#94a3b8', '无钻石记录'] };
  const [color, label] = cfg[s] || ['#64748b', s];
  return `<span class="badge" style="background:${color}1a;color:${color};border:1px solid ${color}40">${esc(label)}</span>`;
}

function loadDiamond() {
  const card = $('#diamondPanel');
  if (!card) return;
  if (!Rec.diamondData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    api('/api/diamond-unused').then((d) => { Rec.diamondData = d; Rec.diamondCount = (d.summary || {}).unused || 0; renderDatasetTabs(); renderDiamond(); })
      .catch((err) => { card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`; });
    return;
  }
  renderDiamond();
}

function renderDiamond() {
  const card = $('#diamondPanel');
  if (!card) return;
  const v = Rec.diamond;
  const src = Rec.diamondData || {};
  const sum = src.summary || {};
  const all = diamondRows();
  const filtered = diamondFiltered();
  const shown = filtered.slice(0, v.limit);
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');

  $('#pageSubtitle').textContent = '钻石未使用 · 已转化老用户（转化金额>0）匹配钻石发放/消耗流水；消耗=0 未消耗、部分消耗单独标记；解冻条件（正价课满30天未退课）暂无退课数据，需人工确认';

  const statCard = (label, value, foot, tone) => `
    <div style="flex:1;min-width:130px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
      <div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px;${tone ? `color:${tone}` : ''}">${esc(String(value))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(foot || '')}</div>
    </div>`;

  const listRows = shown.map((r) => `<tr>
      <td class="num mono text-sm">${esc(r.b)}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td class="strong">${esc(r.empName || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td class="num nowrap">${fmtMoney(r.amount)}</td>
      <td class="num"><b>${fmtInt(r.grant)}</b></td>
      <td class="num">${fmtInt(r.use)}</td>
      <td class="num" style="${r.rest > 0 ? 'color:#b45309' : ''}"><b>${fmtInt(r.rest)}</b></td>
      <td>${diamondStateTag(r.state)}</td>
      <td class="num nowrap text-sm">${esc(r.firstGrant || '—')}</td>
      <td class="num nowrap text-sm">${esc(r.lastUse || '—')}</td>
      <td class="text-sm muted">${esc(r.items || '—')}</td>
      <td class="text-sm muted">${esc(r.unfreeze)}</td>
    </tr>`).join('');

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h3>钻石未使用</h3><p class="records-summary">已转化老用户 ${fmtInt(sum.users)} · 命中钻石流水 ${fmtInt(sum.matched)} · 未消耗 <b style="color:#b45309">${fmtInt(sum.unused)}</b> · 部分消耗 ${fmtInt(sum.partial)} · 剩余钻石 <b>${fmtInt(sum.restTotal)}</b></p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="resetBtn2" type="button">${icon('rotate', 13)} 重置</button>
        <button class="btn btn-sm" id="exportBtn2" type="button">${icon('download', 13)} 导出</button>
      </div>
    </div>
    <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--line)">
      ${statCard('剩余钻石合计', fmtInt(sum.restTotal), `发放 ${fmtInt(sum.grantTotal)} − 消耗 ${fmtInt(sum.useTotal)}`, '#b45309')}
      ${statCard('未消耗用户', fmtInt(sum.unused), '有发放、无消耗')}
      ${statCard('部分消耗', fmtInt(sum.partial), '有剩余未用完')}
      ${statCard('无钻石记录', fmtInt(sum.noRecord), '已转化但钻石表无流水')}
    </div>
    <div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
      <div class="field"><label>状态</label>
        <select class="control" id="dmState" style="width:140px">
          <option value="all" ${v.state === 'all' ? 'selected' : ''}>全部状态</option>
          <option value="未消耗" ${v.state === '未消耗' ? 'selected' : ''}>未消耗</option>
          <option value="部分消耗" ${v.state === '部分消耗' ? 'selected' : ''}>部分消耗</option>
          <option value="已用完" ${v.state === '已用完' ? 'selected' : ''}>已用完</option>
          <option value="无钻石记录" ${v.state === '无钻石记录' ? 'selected' : ''}>无钻石记录</option>
        </select>
      </div>
      <div class="field"><label>基地</label>
        <select class="control" id="dmBase" style="width:130px">${baseOpts}</select>
      </div>
      <div class="field"><label>排序</label>
        <select class="control" id="dmSort" style="width:150px">
          <option value="grant" ${v.sort === 'grant' ? 'selected' : ''}>按发放时间</option>
          <option value="amount" ${v.sort === 'amount' ? 'selected' : ''}>按转化金额</option>
        </select>
      </div>
      <div class="field grow"><label>搜索</label>
        <input class="control search" id="dmSearch" placeholder="老用户ID / 工号 / 姓名 / 基地" value="${esc(v.q)}">
      </div>
    </div>
    <div class="card-body" style="padding:0">
      <table class="table">
        <thead><tr><th>老用户ID</th><th>销售工号</th><th>姓名</th><th>基地</th><th class="num">转化金额</th><th class="num">发放钻石</th><th class="num">消耗钻石</th><th class="num">剩余</th><th>状态</th><th>最早发放时间</th><th>最近消耗时间</th><th>兑换商品</th><th>解冻确认</th></tr></thead>
        <tbody>${listRows || '<tr><td colspan="13"><div class="empty"><h3>当前筛选条件下暂无数据</h3></div></td></tr>'}</tbody>
      </table>
      <div class="table-footer"><span>共 ${fmtInt(filtered.length)} 人${filtered.length > shown.length ? ` · 显示前 ${fmtInt(shown.length)} 条` : ''} · 解冻条件（满30天未退课）暂无退课数据，列「解冻确认」需人工核对</span></div>
    </div>`;

  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  bind('#dmState', 'change', (e) => { v.state = e.target.value; renderDiamond(); });
  bind('#dmBase', 'change', (e) => { v.base = e.target.value; renderDiamond(); });
  bind('#dmSort', 'change', (e) => { v.sort = e.target.value; renderDiamond(); });
  bind('#dmSearch', 'input', debounce(() => { v.q = $('#dmSearch').value.trim(); renderDiamond(); }, 300));
  const r2 = $('#resetBtn2');
  if (r2) r2.addEventListener('click', () => { Rec.diamond = { state: 'all', base: 'all', q: '', limit: 200, sort: 'grant' }; renderDiamond(); });
  const e2 = $('#exportBtn2');
  if (e2) e2.addEventListener('click', exportDiamond);
}

function exportDiamond() {
  const rows = diamondFiltered();
  downloadCsv('钻石未使用名单.csv', rows, [
    { label: '老用户ID', value: (r) => r.b },
    { label: '销售工号', value: (r) => r.empId },
    { label: '姓名', value: (r) => r.empName },
    { label: '基地', value: (r) => r.base },
    { label: '转化金额', value: (r) => r.amount },
    { label: '发放钻石', value: (r) => r.grant },
    { label: '消耗钻石', value: (r) => r.use },
    { label: '剩余', value: (r) => r.rest },
    { label: '状态', value: (r) => r.state },
    { label: '最早发放时间', value: (r) => r.firstGrant },
    { label: '最近消耗时间', value: (r) => r.lastUse },
    { label: '兑换商品', value: (r) => r.items },
    { label: '解冻确认', value: (r) => r.unfreeze }
  ]);
  toast(`已导出 ${rows.length} 条名单`, 'ok');
}

/* =========================================================================
   2.8 龙珠奖视图（五榜 + 兑换结算 + 我的卡片）
   ========================================================================= */

const DRAGON_BOARDS = [
  ['A', '榜A · 个人净营收 TOP3'],
  ['B', '榜B · 个人提升率 TOP3'],
  ['C', '榜C · 新人 TOP3'],
  ['D', '榜D · 高经团队完成度'],
  ['E', '榜E · 经理团队完成度'],
  ['ex', '兑换结算'],
  ['me', '我的龙珠卡片']
];

function loadDragon() {
  const card = $('#dragonCard');
  if (!card) return;
  if (!Rec.dragon.me) {
    try { Rec.dragon.me = localStorage.getItem('dragonMe') || ''; } catch (e) { /* ignore */ }
  }
  if (!Rec.dragonData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    api('/api/dragon').then((d) => { Rec.dragonData = d; renderDragon(); })
      .catch((err) => { card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`; });
    return;
  }
  renderDragon();
}

function dragonPeriods(d, board) {
  if (board === 'A') return [...(d.boards.A.month || []).map((x) => ['month', x.period]), ...(d.boards.A.quarter || []).map((x) => ['quarter', x.period]), ...(d.boards.A.year || []).map((x) => ['year', x.period])];
  if (board === 'B') return (d.boards.B || []).map((x) => ['month', x.period]);
  if (board === 'C') return (d.boards.C || []).map((x) => ['month', x.period]);
  if (board === 'D') return (d.boards.D || []).map((x) => ['month', x.period]);
  if (board === 'E') return (d.boards.E || []).map((x) => ['month', x.period]);
  return [];
}

function dragonBoardRows(d, board, kind, period) {
  const pick = (arr) => (arr || []).find((x) => x.period === period) || { rows: [] };
  if (board === 'A') return pick(d.boards.A[kind]).rows;
  if (board === 'B') return pick(d.boards.B).rows;
  if (board === 'C') return pick(d.boards.C).rows;
  if (board === 'D') return pick(d.boards.D).rows;
  if (board === 'E') return pick(d.boards.E).rows;
  return [];
}

function renderDragon() {
  const card = $('#dragonCard');
  if (!card) return;
  const v = Rec.dragon;
  const d = Rec.dragonData || {};
  const meta = d.meta || {};
  if (!v.period) {
    const ps = dragonPeriods(d, v.board);
    if (ps.length) v.period = ps[ps.length - 1][1];
    v.periodKind = ps.length ? ps[ps.length - 1][0] : 'month';
  }

  $('#pageSubtitle').textContent = `龙珠奖 · 月度 TOP1-3 奖状 300/200/100，同季 2 奖状换 1 奖牌、同年 2 奖牌换 1 奖杯；净营收=直推转化金额−退款，剔除质检/离职；数据月份 ${esc((meta.months || []).join(', ') || '—')}`;

  const statCard = (label, value, foot, tone) => `
    <div style="flex:1;min-width:130px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface)">
      <div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px;${tone ? `color:${tone}` : ''}">${esc(String(value))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(foot || '')}</div>
    </div>`;

  const periodSel = () => {
    const ps = dragonPeriods(d, v.board);
    if (!ps.length) return '';
    return `<div class="field"><label>周期</label>
      <select class="control" id="dgPeriod" style="width:170px">
        ${ps.map(([k, p]) => `<option value="${esc(p)}" data-kind="${k}" ${p === v.period ? 'selected' : ''}>${esc(p)}</option>`).join('')}
      </select>
    </div>`;
  };

  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `No.${rank}`;

  let body = '';
  let footNote = '';
  if (v.board === 'A') {
    const kind = v.periodKind || 'month';
    const rows = dragonBoardRows(d, 'A', kind, v.period);
    body = `<table class="table">
      <thead><tr><th>名次</th><th>工号</th><th>姓名</th><th>基地</th><th class="num">净营收</th><th class="num">奖金</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num"><b>${medal(r.rank)}</b></td>
        <td class="num">${esc(r.empId || '—')}</td>
        <td class="strong">${esc(r.name || '—')}</td>
        <td>${esc(r.base || '未匹配')}</td>
        <td class="num nowrap">${fmtMoney(r.net)}</td>
        <td class="num" style="color:#b45309">${r.prize ? '¥' + r.prize : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6"><div class="empty"><h3>该周期暂无数据</h3></div></td></tr>'}</tbody>
    </table>`;
    footNote = `榜A · ${esc(v.period)} 个人净营收 TOP3（密排名次，同分并列）`;
  } else if (v.board === 'B') {
    const rows = dragonBoardRows(d, 'B', 'month', v.period);
    body = `<table class="table">
      <thead><tr><th>名次</th><th>工号</th><th>姓名</th><th>基地</th><th class="num">本月净营收</th><th class="num">上月净营收</th><th class="num">提升率</th><th class="num">奖金</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num"><b>${medal(r.rank)}</b></td>
        <td class="num">${esc(r.empId || '—')}</td>
        <td class="strong">${esc(r.name || '—')}</td>
        <td>${esc(r.base || '未匹配')}</td>
        <td class="num nowrap">${fmtMoney(r.cur)}</td>
        <td class="num nowrap">${fmtMoney(r.prev)}</td>
        <td class="num" style="color:#15803d"><b>${(r.growth * 100).toFixed(1)}%</b></td>
        <td class="num" style="color:#b45309">${r.prize ? '¥' + r.prize : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="8"><div class="empty"><h3>该周期暂无入池数据（上月净营收 ≥ 10000）</h3></div></td></tr>'}</tbody>
    </table>`;
    footNote = '榜B · 提升率 =（本月 − 上月）÷ 上月；入池门槛：上月净营收 ≥ 10000 元';
  } else if (v.board === 'C') {
    const rows = dragonBoardRows(d, 'C', 'month', v.period);
    body = `<table class="table">
      <thead><tr><th>名次</th><th>工号</th><th>姓名</th><th>基地</th><th>入职（首次生效）</th><th class="num">净营收</th><th class="num">奖金</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num"><b>${medal(r.rank)}</b></td>
        <td class="num">${esc(r.empId || '—')}</td>
        <td class="strong">${esc(r.name || '—')}</td>
        <td>${esc(r.base || '未匹配')}</td>
        <td class="num">${esc(r.entry || '—')}</td>
        <td class="num nowrap">${fmtMoney(r.net)}</td>
        <td class="num" style="color:#b45309">${r.prize ? '¥' + r.prize : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="7"><div class="empty"><h3>该周期暂无新人数据</h3></div></td></tr>'}</tbody>
    </table>`;
    footNote = '榜C · 入职起 3 个月内（以架构首次生效日期为入职代理，如与实际入职日不符请以 HR 数据为准）';
  } else if (v.board === 'D' || v.board === 'E') {
    const rows = dragonBoardRows(d, v.board, 'month', v.period);
    body = `<table class="table">
      <thead><tr><th>名次</th><th>${v.board === 'D' ? '高经' : '经理'}</th><th class="num">团队直推业绩</th><th class="num">团队直推目标</th><th class="num">完成度</th><th class="num">奖金</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num"><b>${medal(r.rank)}</b></td>
        <td class="strong">${esc(r.name || '—')}</td>
        <td class="num nowrap">${fmtMoney(r.perf)}</td>
        <td class="num nowrap">${fmtMoney(r.target)}</td>
        <td class="num" style="color:${r.rate >= 1 ? '#15803d' : '#b45309'}"><b>${r.rate === null ? '—' : (r.rate * 100).toFixed(1) + '%'}</b></td>
        <td class="num" style="color:#b45309">${r.prize ? '¥' + r.prize : '—'}</td>
      </tr>`).join('') || '<tr><td colspan="6"><div class="empty"><h3>该周期暂无目标数据</h3></div></td></tr>'}</tbody>
    </table>`;
    footNote = `${v.board === 'D' ? '榜D · 高经团队' : '榜E · 经理团队'}完成度 = 团队直推业绩 ÷ 团队直推目标（目标来源：月目标表窗口）`;
  } else if (v.board === 'ex') {
    const ex = d.exchange || {};
    const rowHtml = (o, isTeam) => `<tr>
      <td class="strong">${esc(o.name || o.empId || '—')}</td>
      <td>${esc(o.level || (isTeam ? '' : (o.base || '')))}</td>
      <td class="num"><b>${fmtInt(o.certTotal)}</b></td>
      <td class="num nowrap">¥${fmtInt(o.prizeTotal)}</td>
      <td class="text-sm">${(o.quarters || []).map((q) => `${esc(q.quarter)}：${q.certs}张${q.medalsFrom ? `→换${q.medalsFrom}牌` : ''}${q.certsLeft ? `（余${q.certsLeft}）` : ''}`).join('<br>') || '—'}</td>
      <td class="num"><b>${fmtInt((o.quarters || []).reduce((s, q) => s + q.medalsFrom, 0))}</b></td>
      <td class="text-sm">${(o.years || []).map((y) => `${esc(y.year)}：${y.medals}牌${y.trophiesFrom ? `→换${y.trophiesFrom}杯` : ''}${y.medalsLeft ? `（余${y.medalsLeft}）` : ''}`).join('<br>') || '—'}</td>
      <td class="num"><b>${fmtInt((o.years || []).reduce((s, y) => s + y.trophiesFrom, 0))}</b></td>
    </tr>`;
    body = `<h4 style="margin:4px 0 8px">个人奖状（榜A/B/C TOP3）</h4>
      <table class="table">
        <thead><tr><th>姓名/工号</th><th>基地</th><th class="num">奖状总数</th><th class="num">奖金合计</th><th>各季度奖状</th><th class="num">已换/可换奖牌</th><th>按年奖牌</th><th class="num">已换/可换奖杯</th></tr></thead>
        <tbody>${(ex.personal || []).map((o) => rowHtml(o, false)).join('') || '<tr><td colspan="8"><div class="empty"><h3>暂无奖状记录</h3></div></td></tr>'}</tbody>
      </table>
      <h4 style="margin:16px 0 8px">团队奖状（榜D/E TOP3，归团队负责人）</h4>
      <table class="table">
        <thead><tr><th>团队负责人</th><th>层级</th><th class="num">奖状总数</th><th class="num">奖金合计</th><th>各季度奖状</th><th class="num">已换/可换奖牌</th><th>按年奖牌</th><th class="num">已换/可换奖杯</th></tr></thead>
        <tbody>${(ex.team || []).map((o) => rowHtml(o, true)).join('') || '<tr><td colspan="8"><div class="empty"><h3>暂无团队奖状记录</h3></div></td></tr>'}</tbody>
      </table>`;
    footNote = '兑换规则：同一季度内 2 奖状换 1 奖牌；同一年内 2 奖牌换 1 奖杯';
  } else if (v.board === 'me') {
    const me = String(v.me || '').trim();
    const allPeople = new Map();
    (d.boards.A.month || []).forEach((b) => b.rows.forEach((r) => { if (r.empId) allPeople.set(r.empId, r.name); }));
    const myNet = (month) => {
      const rows = dragonBoardRows(d, 'A', 'month', month);
      const hit = rows.find((r) => String(r.empId) === me);
      return hit ? { rank: hit.rank, net: hit.net } : null;
    };
    const exHit = (d.exchange.personal || []).find((o) => String(o.empId) === me);
    const curRows = dragonBoardRows(d, 'A', 'month', meta.curMonth || '');
    const top3Line = curRows.filter((r) => r.rank <= 3);
    const top3Min = top3Line.length === 3 ? top3Line[top3Line.length - 1].net : null;
    const my = myNet(meta.curMonth || '');
    const gap = my && top3Min !== null && my.rank > 3 ? top3Min - my.net : null;
    body = `
      <div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
        <div class="field grow"><label>选择工号（我的身份）</label>
          <input class="control" id="dgMe" list="dgMeList" placeholder="输入工号，如 10086" value="${esc(me)}">
          <datalist id="dgMeList">${[...allPeople.entries()].map(([id, nm]) => `<option value="${esc(id)}">${esc(nm || '')}</option>`).join('')}</datalist>
        </div>
      </div>
      ${me ? `<div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
        ${statCard('本月净营收', fmtMoney(my ? my.net : 0), my ? `榜A当月第 ${my.rank} 名` : '本月未上榜（榜A）', my && my.rank <= 3 ? '#15803d' : '#334155')}
        ${statCard('奖状总数', fmtInt(exHit ? exHit.certTotal : 0), exHit ? `奖金合计 ¥${fmtInt(exHit.prizeTotal)}` : '暂无获奖记录', '#7c3aed')}
        ${statCard('可换奖牌', fmtInt(exHit ? (exHit.quarters || []).reduce((s, q) => s + q.medalsFrom, 0) : 0), '同季 2 奖状换 1 奖牌', '#2563eb')}
        ${statCard('距 TOP3', gap === null ? '—' : fmtMoney(gap), my ? (gap === null ? (my.rank <= 3 ? '你就在 TOP3 🎉' : 'TOP3 不足 3 人或已达标') : `需再签 ¥${fmtInt(gap)}`) : '本月未上榜', gap !== null ? '#b45309' : '#334155')}
      </div>
      <div class="card-body" style="padding-top:0">
        <table class="table">
          <thead><tr><th>季度</th><th class="num">奖状</th><th class="num">可换奖牌</th><th class="num">剩余奖状</th><th>年度</th><th class="num">奖牌</th><th class="num">可换奖杯</th></tr></thead>
          <tbody>${exHit ? exHit.quarters.map((q, i) => {
            const y = (exHit.years || [])[0] || {};
            return `<tr><td>${esc(q.quarter)}</td><td class="num">${q.certs}</td><td class="num">${q.medalsFrom}</td><td class="num">${q.certsLeft}</td><td>${i === 0 ? esc(y.year || '—') : ''}</td><td class="num">${i === 0 ? y.medals || 0 : ''}</td><td class="num">${i === 0 ? y.trophiesFrom || 0 : ''}</td></tr>`;
          }).join('') || '<tr><td colspan="7"><div class="empty"><h3>暂无获奖记录，继续加油！</h3></div></td></tr>' : '<tr><td colspan="7"><div class="empty"><h3>暂无获奖记录</h3></div></td></tr>'}</tbody>
        </table>
      </div>` : '<div class="card-body"><div class="empty"><h3>输入工号查看我的龙珠</h3><p>当期名次、奖状数、可兑换状态、距 TOP3 差多少</p></div></div>'}`;
    footNote = '「我的龙珠」按工号匹配榜A/兑换结算数据，选择保存在本机';
  }

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h3>龙珠奖（集龙珠体系）</h3><p class="records-summary">参评 ${fmtInt(meta.people)} 人 · 数据月份 ${esc((meta.months || []).slice(-3).join('、') || '—')} · 高经目标 ${fmtInt(meta.targetsGj)} 行 / 经理目标 ${fmtInt(meta.targetsJl)} 行</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="resetBtn2" type="button">${icon('rotate', 13)} 重置</button>
        <button class="btn btn-sm" id="exportBtn2" type="button">${icon('download', 13)} 导出</button>
      </div>
    </div>
    <div class="card-body" style="border-bottom:1px solid var(--line)">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${DRAGON_BOARDS.map(([k, label]) => `<button class="table-tab ${v.board === k ? 'active' : ''}" data-dboard="${k}" type="button">${esc(label)}</button>`).join('')}
      </div>
    </div>
    ${['A', 'B', 'C', 'D', 'E'].includes(v.board) ? `<div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
      ${periodSel()}
      <div class="field grow" style="align-self:flex-end"><span class="muted text-sm">${esc(footNote || '')}</span></div>
    </div>` : ''}
    <div class="card-body" style="padding:${v.board === 'me' || v.board === 'ex' ? '0 16px 16px' : '0'};${v.board === 'me' ? 'padding-top:16px' : ''}">${body}</div>
    ${footNote && ['ex', 'me'].includes(v.board) ? `<div class="table-footer"><span>${esc(footNote)}</span></div>` : ''}
    ${v.board === 'A' ? `<div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;border-top:1px solid var(--line)">
      ${(meta.notes || []).map((n) => `<span class="badge" style="background:#f59e0b1a;color:#b45309;border:1px solid #f59e0b40">口径：${esc(n)}</span>`).join('')}
    </div>` : ''}`;

  $$('#dragonCard [data-dboard]').forEach((btn) => btn.addEventListener('click', () => {
    v.board = btn.dataset.dboard;
    v.period = '';
    v.periodKind = 'month';
    renderDragon();
  }));
  const pSel = $('#dgPeriod');
  if (pSel) pSel.addEventListener('change', () => {
    v.period = pSel.value;
    const opt = pSel.options[pSel.selectedIndex];
    v.periodKind = opt ? opt.dataset.kind || 'month' : 'month';
    renderDragon();
  });
  const meInput = $('#dgMe');
  if (meInput) meInput.addEventListener('change', () => {
    v.me = meInput.value.trim();
    try { localStorage.setItem('dragonMe', v.me); } catch (e) { /* ignore */ }
    renderDragon();
  });
  const r2 = $('#resetBtn2');
  if (r2) r2.addEventListener('click', () => { Rec.dragon = { board: 'A', period: '', me: v.me }; renderDragon(); });
  const e2 = $('#exportBtn2');
  if (e2) e2.addEventListener('click', exportDragon);
}

function exportDragon() {
  const v = Rec.dragon;
  const d = Rec.dragonData || {};
  const meta = d.meta || {};
  if (v.board === 'ex') {
    const ex = d.exchange || {};
    const rows = (ex.personal || []).map((o) => ({ name: o.name || o.empId, base: o.base || '', certTotal: o.certTotal, prizeTotal: o.prizeTotal, medals: (o.quarters || []).reduce((s, q) => s + q.medalsFrom, 0), certsLeft: (o.quarters || []).reduce((s, q) => s + q.certsLeft, 0), trophies: (o.years || []).reduce((s, y) => s + y.trophiesFrom, 0) }));
    downloadCsv('龙珠奖-个人兑换结算.csv', rows, [
      { label: '姓名/工号', value: (r) => r.name },
      { label: '基地', value: (r) => r.base },
      { label: '奖状总数', value: (r) => r.certTotal },
      { label: '奖金合计', value: (r) => r.prizeTotal },
      { label: '可换奖牌', value: (r) => r.medals },
      { label: '剩余奖状', value: (r) => r.certsLeft },
      { label: '可换奖杯', value: (r) => r.trophies }
    ]);
    toast(`已导出 ${rows.length} 人兑换结算`, 'ok');
    return;
  }
  if (v.board === 'me') {
    toast('我的卡片无需导出，请切到对应榜单导出', 'info');
    return;
  }
  const rows = dragonBoardRows(d, v.board, v.periodKind || 'month', v.period);
  const map = {
    A: [['名次', (r) => r.rank], ['工号', (r) => r.empId], ['姓名', (r) => r.name], ['基地', (r) => r.base], ['净营收', (r) => r.net], ['奖金', (r) => r.prize || '']],
    B: [['名次', (r) => r.rank], ['工号', (r) => r.empId], ['姓名', (r) => r.name], ['基地', (r) => r.base], ['本月净营收', (r) => r.cur], ['上月净营收', (r) => r.prev], ['提升率', (r) => `${(r.growth * 100).toFixed(1)}%`], ['奖金', (r) => r.prize || '']],
    C: [['名次', (r) => r.rank], ['工号', (r) => r.empId], ['姓名', (r) => r.name], ['基地', (r) => r.base], ['入职', (r) => r.entry], ['净营收', (r) => r.net], ['奖金', (r) => r.prize || '']],
    D: [['名次', (r) => r.rank], ['高经', (r) => r.name], ['团队业绩', (r) => r.perf], ['团队目标', (r) => r.target], ['完成度', (r) => (r.rate === null ? '' : `${(r.rate * 100).toFixed(1)}%`)], ['奖金', (r) => r.prize || '']],
    E: [['名次', (r) => r.rank], ['经理', (r) => r.name], ['团队业绩', (r) => r.perf], ['团队目标', (r) => r.target], ['完成度', (r) => (r.rate === null ? '' : `${(r.rate * 100).toFixed(1)}%`)], ['奖金', (r) => r.prize || '']]
  };
  const cols = map[v.board] || [];
  downloadCsv(`龙珠奖-榜${v.board}-${v.period}.csv`, rows, cols.map(([label, get]) => ({ label, value: get })));
  toast(`已导出榜${v.board} ${rows.length} 行`, 'ok');
}

/* =========================================================================
   钻石兑换明细视图（窗口⑤ 已转化订单明细）
   ========================================================================= */

function dmdRows() {
  const d = Rec.dmdData;
  if (!d) return [];
  let rows = d.rows || [];
  if (Rec.user.role === 'base' && Rec.user.baseName) {
    const norm = (x) => String(x || '').trim().replace(/基地$/, '');
    const mine = norm(Rec.user.baseName);
    rows = rows.filter((r) => norm(r.base) === mine);
  }
  return rows;
}

function dmdFiltered() {
  const v = Rec.dmd;
  const q = String(v.q || '').trim().toLowerCase();
  const from = String(v.from || '').trim();
  const to = String(v.to || '').trim();
  return dmdRows().filter((r) => {
    if (from && String(r.convDate || '') < from) return false;
    if (to && String(r.convDate || '') > to) return false;
    if (v.base !== 'all' && (r.base || '') !== v.base) return false;
    if (q && !`${r.empId} ${r.empName} ${r.base} ${r.gj} ${r.jl} ${r.orderId} ${r.c}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function loadDiamondOrders() {
  const card = $('#dmdPanel');
  if (!card) return;
  if (!Rec.dmdData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    api('/api/diamond-orders').then((d) => { Rec.dmdData = d; Rec.dmdCount = (d.summary || {}).orders || 0; renderDatasetTabs(); renderDiamondOrders(); })
      .catch((err) => { card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`; });
    return;
  }
  renderDiamondOrders();
}

function renderDiamondOrders() {
  const card = $('#dmdPanel');
  if (!card) return;
  const v = Rec.dmd;
  const src = Rec.dmdData || {};
  const all = dmdRows();
  const filtered = dmdFiltered();
  const shown = filtered.slice(0, v.limit);
  const sum = src.summary || {};
  const bases = [...new Set(all.map((r) => r.base || '').filter(Boolean))].sort();
  const baseOpts = '<option value="all">全部基地</option>' + bases.map((b) => `<option value="${esc(b)}" ${v.base === b ? 'selected' : ''}>${esc(b)}</option>`).join('');

  $('#pageSubtitle').textContent = '钻石兑换明细 · 转介绍转化跟踪中角色=销售且转化金额>0 的转化订单（按转化日期倒序）；「应发放钻石」待规则确认后接入';

  const listRows = shown.map((r) => `<tr>
      <td class="num muted">${r.seq}</td>
      <td class="num nowrap">${esc(r.introDate || '—')}</td>
      <td>${esc(r.base || '未匹配')}</td>
      <td>${esc(r.gj || '—')}</td>
      <td>${esc(r.jl || '—')}</td>
      <td>${esc(r.zg || '—')}</td>
      <td>${esc(r.zz || '—')}</td>
      <td class="strong">${esc(r.empName || '—')}</td>
      <td class="num">${esc(r.empId || '—')}</td>
      <td class="num nowrap">${esc(r.convDate || '—')}</td>
      <td class="num nowrap"><b>${fmtMoney(r.amount)}</b></td>
      <td class="num muted">待规则确认</td>
    </tr>`).join('');

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h3>钻石兑换明细</h3><p class="records-summary">转化订单 <b>${fmtInt(sum.orders)}</b> 笔 · 转化金额合计 <b>${fmtMoney(sum.amount)}</b> · 销售 ${fmtInt(sum.emps)} 人 · 应发放钻石待规则确认</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="resetBtn2" type="button">${icon('rotate', 13)} 重置</button>
        <button class="btn btn-sm" id="exportBtn2" type="button">${icon('download', 13)} 导出</button>
      </div>
    </div>
    <div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
      <div class="field"><label>转化日期</label>
        <div class="date-range" style="display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:8px;padding:2px 6px;background:var(--surface)">
          <input class="control" id="dmdFrom" type="date" value="${esc(String(v.from).slice(0, 10))}" style="width:135px;border:none;background:transparent">
          <span class="muted">~</span>
          <input class="control" id="dmdTo" type="date" value="${esc(String(v.to).slice(0, 10))}" style="width:135px;border:none;background:transparent">
        </div>
      </div>
      <div class="field"><label>基地</label>
        <select class="control" id="dmdBase" style="width:130px">${baseOpts}</select>
      </div>
      <div class="field grow"><label>搜索</label>
        <input class="control search" id="dmdSearch" placeholder="工号 / 姓名 / 基地 / 高经 / 订单ID" value="${esc(v.q)}">
      </div>
    </div>
    <div class="card-body" style="padding:0">
      <table class="table">
        <thead><tr><th>序号</th><th>转介绍日期</th><th>基地</th><th>高经</th><th>经理</th><th>主管</th><th>组长</th><th>销售姓名</th><th>工号</th><th>转化日期</th><th class="num">转化金额</th><th class="num">应发放钻石</th></tr></thead>
        <tbody>${listRows || '<tr><td colspan="12"><div class="empty"><h3>当前筛选条件下暂无数据</h3></div></td></tr>'}</tbody>
      </table>
      <div class="table-footer"><span>共 ${fmtInt(filtered.length)} 笔${filtered.length > shown.length ? ` · 显示前 ${fmtInt(shown.length)} 条` : ''} · 按转化日期倒序 · 应发放钻石列待规则确认后接入</span></div>
    </div>`;

  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  bind('#dmdFrom', 'change', () => { v.from = $('#dmdFrom').value; renderDiamondOrders(); });
  bind('#dmdTo', 'change', () => { v.to = $('#dmdTo').value; renderDiamondOrders(); });
  bind('#dmdBase', 'change', (e) => { v.base = e.target.value; renderDiamondOrders(); });
  bind('#dmdSearch', 'input', debounce(() => { v.q = $('#dmdSearch').value.trim(); renderDiamondOrders(); }, 300));
  const r2 = $('#resetBtn2');
  if (r2) r2.addEventListener('click', () => { Rec.dmd = { from: '', to: '', base: 'all', q: '', limit: 200 }; renderDiamondOrders(); });
  const e2 = $('#exportBtn2');
  if (e2) e2.addEventListener('click', exportDiamondOrders);
  const more = $('#dmdMore');
  if (more) more.addEventListener('click', () => { v.limit += 500; renderDiamondOrders(); });
}

function exportDiamondOrders() {
  const rows = dmdFiltered();
  downloadCsv('钻石兑换明细.csv', rows, [
    { label: '序号', value: (r) => r.seq },
    { label: '转介绍日期', value: (r) => r.introDate },
    { label: '基地', value: (r) => r.base },
    { label: '高经', value: (r) => r.gj },
    { label: '经理', value: (r) => r.jl },
    { label: '主管', value: (r) => r.zg },
    { label: '组长', value: (r) => r.zz },
    { label: '销售姓名', value: (r) => r.empName },
    { label: '工号', value: (r) => r.empId },
    { label: '转化日期', value: (r) => r.convDate },
    { label: '转化金额', value: (r) => r.amount },
    { label: '应发放钻石', value: () => '' }
  ]);
  toast(`已导出 ${rows.length} 笔明细（应发放钻石列待规则确认）`, 'ok');
}

/* =========================================================================
   2.9 高经团队业绩（双口径数透：直推 + 接leads）
   交互：高经下拉 → 弹出选择经理面板（含本人直管行/null 规则行/脏值行）→ 核算
   口径：高经业绩 = Σ 勾选经理业绩 + 本人在经理层的业绩；两口径各自闭环
   勾选映射按高经持久化（管理员可调，普通用户只读上次结果）
   ========================================================================= */

function loadGjteam() {
  const card = $('#gjteamCard');
  if (!card) return;
  if (!Rec.gjteamData) {
    card.innerHTML = '<div class="card-body"><div class="skeleton sk-line"></div></div>';
    api('/api/gj-team').then((d) => { Rec.gjteamData = d; initGjteamState(); renderGjteam(); })
      .catch((err) => { card.innerHTML = `<div class="card-body"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></div>`; });
    return;
  }
  initGjteamState();
  renderGjteam();
}

function initGjteamState() {
  const d = Rec.gjteamData || {};
  const baseNames = Object.keys(d.bases || {});
  const v = Rec.gjteam;
  if (baseNames.length) {
    // 基地账号强制本基地
    if (Rec.user.role === 'base' && Rec.user.baseName) {
      const mine = String(Rec.user.baseName).replace(/基地$/, '');
      if (baseNames.includes(mine)) v.base = mine;
    }
    if (!baseNames.includes(v.base)) {
      v.base = baseNames.includes('郑州') ? '郑州' : baseNames.find((x) => x !== '(未填基地)') || baseNames[0];
    }
    const gjs = ((d.bases[v.base] || {}).gjs) || [];
    if (!gjs.some((x) => x.name === v.gj)) {
      v.gj = gjs.length ? gjs[0].name : '';
      v.panelOpen = false; v.picked = []; v.includeSelf = false;
    }
  } else {
    v.base = ''; v.gj = '';
  }
}

function gjteamSaved() {
  const d = Rec.gjteamData || {};
  return ((d.selections || {})[Rec.gjteam.base + '|' + Rec.gjteam.gj]) || null;
}

function gjteamRulesFor(source) {
  const d = Rec.gjteamData || {};
  return ((d.nullRules || [])).filter((x) => x.enabled && x.source === source && x.base === Rec.gjteam.base);
}

function renderGjteam() {
  const card = $('#gjteamCard');
  if (!card) return;
  const v = Rec.gjteam;
  const d = Rec.gjteamData || {};
  const bases = d.bases || {};
  const baseNames = Object.keys(bases);
  $('#pageSubtitle').textContent = '高经团队业绩 · 双口径数透：销售直推业绩（有数完成度）＋ 接leads业绩（转化跟踪已转化单）；高经业绩 = 手下经理业绩 + 本人在经理层的业绩；归属映射仅管理员可调整';

  if (!baseNames.length) {
    card.innerHTML = '<div class="card-body"><div class="empty"><h3>暂无数据</h3><p>' + esc(d.demoNote || '有数完成度或转介绍转化跟踪底表未上传') + '</p></div></div>';
    return;
  }

  const b = bases[v.base] || { gjs: [], mgrs: [], ysNull: { n: 0, amt: 0, gj: {} }, dcNull: { n: 0, amt: 0, gj: {} }, dirty: { n: 0, amt: 0 } };
  const gjOpts = b.gjs.map((x) => `<option value="${esc(x.name)}" ${x.name === v.gj ? 'selected' : ''}>${esc(x.name)}${x.empId ? ' ' + esc(x.empId) : ''}${x.ambEmp ? '（重名待确认）' : ''}</option>`).join('');
  const canEdit = !!d.canEdit;
  const saved = gjteamSaved();

  card.innerHTML = `
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
      <div><h3>高经团队业绩（双口径）</h3><p class="records-summary">基地 <b>${esc(v.base)}</b> · 高经 <b>${esc(v.gj || '—')}</b>${saved ? ` · 当前映射 ${saved.mgrs.length} 位经理${saved.includeSelf ? ' + 本人直管' : ''}（${esc(saved.by)} 调整于 ${esc(saved.at)}）` : ' · 尚未核算'}</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="resetBtn2" type="button">${icon('rotate', 13)} 重置</button>
        <button class="btn btn-sm" id="exportBtn2" type="button">${icon('download', 13)} 导出</button>
      </div>
    </div>
    <div class="card-body records-toolbar" style="border-bottom:1px solid var(--line)">
      <div class="field"><label>基地</label>
        <select class="control" id="gjtBase" style="width:130px">${baseNames.map((x) => `<option value="${esc(x)}" ${x === v.base ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>高经</label>
        <select class="control" id="gjtGj" style="width:200px">${gjOpts}</select>
      </div>
      ${canEdit ? `<button class="btn btn-sm" id="gjtPick" type="button">选择经理并核算</button>` : ''}
      <span class="muted" style="font-size:12px">${canEdit ? '选完经理后点「开始核算」，映射自动保存' : '只读视图 · 如需调整归属请联系管理员'}</span>
    </div>
    <div id="gjtPanel" style="display:${v.panelOpen ? 'block' : 'none'};border-bottom:1px solid var(--line);background:#f8fafc">
      <div style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid var(--line)">选择经理 — ${esc(v.base)} · 高经 ${esc(v.gj)}（${esc(((b.gjs.find((x) => x.name === v.gj) || {}).empId) || '')}）· 共 ${b.mgrs.length} 位经理</div>
      <div id="gjtList" style="max-height:380px;overflow:auto"></div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--line)">
        <span id="gjtSum" class="muted" style="font-size:12px"></span>
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="gjtCancel" type="button" style="background:#fff;color:var(--text)">取消</button>
        <button class="btn btn-sm" id="gjtGo" type="button">开始核算</button>
      </div>
    </div>
    <div id="gjtResult" style="padding:0"></div>`;

  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  bind('#gjtBase', 'change', (e) => {
    v.base = e.target.value;
    const gjs = ((bases[v.base] || {}).gjs) || [];
    v.gj = gjs.length ? gjs[0].name : '';
    v.panelOpen = false; v.picked = []; v.includeSelf = false;
    renderGjteam();
  });
  bind('#gjtGj', 'change', (e) => { v.gj = e.target.value; v.panelOpen = false; v.picked = []; v.includeSelf = false; renderGjteam(); });
  bind('#gjtPick', 'click', () => {
    const saved = gjteamSaved();
    v.picked = saved ? [...saved.mgrs] : [];
    v.includeSelf = saved ? !!saved.includeSelf : false;
    v.panelOpen = true;
    const pnl = $('#gjtPanel');
    if (pnl) pnl.style.display = 'block';
    renderGjteamPanel();
  });
  bind('#resetBtn2', 'click', () => { Rec.gjteam = { base: v.base, gj: '', panelOpen: false, picked: [], includeSelf: false }; renderGjteam(); });
  bind('#exportBtn2', 'click', exportGjteam);

  if (saved) {
    api(`/api/gj-team?base=${encodeURIComponent(v.base)}&gj=${encodeURIComponent(v.gj)}`)
      .then((d2) => { if (d2.calc) renderGjteamResult(d2.calc); })
      .catch(() => { $('#gjtResult').innerHTML = '<div class="card-body"><div class="empty"><h3>核算结果加载失败</h3></div></div>'; });
  } else {
    $('#gjtResult').innerHTML = `<div class="card-body"><div class="empty"><h3>尚未核算</h3><p>${canEdit ? '点上方「选择经理并核算」开始' : '管理员尚未配置该高经的经理归属'}</p></div></div>`;
  }
  if (v.panelOpen) renderGjteamPanel();
}

function renderGjteamPanel() {
  const v = Rec.gjteam;
  const d = Rec.gjteamData || {};
  const b = ((d.bases || {})[v.base]) || { mgrs: [], ysNull: { n: 0, amt: 0 }, dcNull: { n: 0, amt: 0 }, dirty: { n: 0, amt: 0 } };
  const gj = ((b.gjs || []).find((x) => x.name === v.gj)) || { name: v.gj, empId: '' };
  const rulesYs = gjteamRulesFor('ys').filter((x) => x.targetName === v.gj);
  const rulesDc = gjteamRulesFor('dc').filter((x) => x.targetName === v.gj);
  const fmtN = (n) => Math.round(n).toLocaleString('zh-CN');
  const numRow = (ys, dc) => `<span style="font-size:12px;color:var(--muted);margin-left:auto;display:flex;gap:16px">
    <span>直推 <b style="color:var(--text)">${ys.n}</b>行 ¥${fmtN(ys.amt)}</span>
    <span>接leads <b style="color:var(--text)">${dc.n}</b>单 ¥${fmtN(dc.amt)}</span></span>`;
  let html = '';
  // 本人直管行：两源经理列=本人 的实绩（勾选计入合计）
  const selfStats = gjteamSelfStats(v.base, v.gj);
  html += `<div class="gjt-row ${v.includeSelf ? 'picked' : ''}" data-k="__self__" style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);cursor:pointer;background:${v.includeSelf ? '#eff6ff' : 'transparent'}">
    <input type="checkbox" ${v.includeSelf ? 'checked' : ''} style="width:15px;height:15px">
    <b>${esc(gj.name)}（本人）</b><span class="num muted" style="font-size:11px">${esc(gj.empId || '')}</span>
    <span style="font-size:10px;padding:1px 7px;border-radius:99px;background:var(--primary);color:#fff;font-weight:600">高经本人 · 直管</span>
    ${numRow(selfStats.ys, selfStats.dc)}</div>`;
  // 经理行
  b.mgrs.forEach((m) => {
    const on = v.picked.includes(m.name);
    html += `<div class="gjt-row ${on ? 'picked' : ''}" data-k="${esc(m.name)}" style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);cursor:pointer;background:${on ? '#eff6ff' : 'transparent'}">
    <input type="checkbox" ${on ? 'checked' : ''} style="width:15px;height:15px">
    <b>${esc(m.name)}</b><span class="num muted" style="font-size:11px">${esc(m.empId || '—')}${m.ambEmp ? '⚠' : ''}</span>
    ${numRow(m.ys, m.dc)}</div>`;
  });
  // null 规则行（命中本高经的）
  if (rulesYs.length) {
    html += `<div class="gjt-row rule" data-k="__rule_ys__" style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);cursor:pointer;background:${v.picked.includes('__rule_ys__') ? '#f0fdf4' : 'transparent'}">
    <input type="checkbox" ${v.picked.includes('__rule_ys__') ? 'checked' : ''} style="width:15px;height:15px">
    <b>直管（经理=null）</b><span class="num muted" style="font-size:11px">规则</span>
    <span style="font-size:10px;padding:1px 7px;border-radius:99px;background:#16a34a;color:#fff;font-weight:600">管理员规则</span>
    ${numRow({ n: b.ysNull.n, amt: b.ysNull.amt }, { n: 0, amt: 0 })}<span class="muted" style="font-size:11px">规则：${esc(v.base)} null → ${esc(rulesYs[0].targetName)}</span></div>`;
  }
  if (rulesDc.length) {
    html += `<div class="gjt-row rule" data-k="__rule_dc__" style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);cursor:pointer;background:${v.picked.includes('__rule_dc__') ? '#f0fdf4' : 'transparent'}">
    <input type="checkbox" ${v.picked.includes('__rule_dc__') ? 'checked' : ''} style="width:15px;height:15px">
    <b>直管（经理=null）</b><span class="num muted" style="font-size:11px">规则</span>
    <span style="font-size:10px;padding:1px 7px;border-radius:99px;background:#16a34a;color:#fff;font-weight:600">管理员规则</span>
    ${numRow({ n: 0, amt: 0 }, { n: b.dcNull.n, amt: b.dcNull.amt })}<span class="muted" style="font-size:11px">规则：${esc(v.base)} null → ${esc(rulesDc[0].targetName)}</span></div>`;
  }
  // 待指定 / 脏值提示（不可勾选）
  const hasYsRule = gjteamRulesFor('ys').length > 0;
  const hasDcRule = gjteamRulesFor('dc').length > 0;
  if (b.ysNull.n && !hasYsRule) {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);background:#fffbeb">
    <span style="font-size:10px;padding:1px 7px;border-radius:99px;background:#fef3c7;color:#b45309;font-weight:600">待指定</span>
    <span style="font-size:12px;color:#b45309">直推侧经理=null 共 ${b.ysNull.n} 行 ¥${fmtN(b.ysNull.amt)} 尚未指定归属，未计入任何数字（管理员可在后台配置）</span></div>`;
  }
  if (b.dcNull.n && !hasDcRule) {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);background:#fffbeb">
    <span style="font-size:10px;padding:1px 7px;border-radius:99px;background:#fef3c7;color:#b45309;font-weight:600">待指定</span>
    <span style="font-size:12px;color:#b45309">接leads侧经理=null 共 ${b.dcNull.n} 单 ¥${fmtN(b.dcNull.amt)} 尚未指定归属，未计入任何数字（管理员可在后台配置）</span></div>`;
  }
  if (b.dirty.n) {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--line);background:#fffbeb">
    <span style="font-size:10px;padding:1px 7px;border-radius:99px;background:#fef3c7;color:#b45309;font-weight:600">脏数据</span>
    <span style="font-size:12px;color:#b45309">经理列为"/"的行 ${b.dirty.n} 行 ¥${fmtN(b.dirty.amt)} 无法归属，请先修数</span></div>`;
  }
  $('#gjtList').innerHTML = html;
  updateGjteamSum();
  // 事件
  $$('#gjtList .gjt-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') { /* 同步触发 */ }
      const k = row.dataset.k;
      if (k === '__self__') v.includeSelf = !v.includeSelf;
      else if (v.picked.includes(k)) v.picked = v.picked.filter((x) => x !== k);
      else v.picked.push(k);
      renderGjteamPanel();
    });
  });
  const c = $('#gjtCancel');
  if (c) c.addEventListener('click', () => { v.panelOpen = false; renderGjteam(); });
  const go = $('#gjtGo');
  if (go) go.addEventListener('click', async () => {
    const mgrs = v.picked.filter((x) => x !== '__rule_ys__' && x !== '__rule_dc__');
    try {
      const d2 = await api('/api/gj-team/select', { method: 'POST', body: { base: v.base, gjName: v.gj, mgrs, includeSelf: v.includeSelf } });
      // 同步本地缓存（下次打开面板读到最新状态），并收起面板
      if (Rec.gjteamData && d2.calc) {
        Rec.gjteamData.selections[v.base + '|' + v.gj] = d2.calc.selection
          ? { base: v.base, gjName: v.gj, mgrs: d2.calc.selection.mgrs, includeSelf: !!d2.calc.selection.includeSelf, at: d2.calc.selection.at, by: d2.calc.selection.by }
          : { base: v.base, gjName: v.gj, mgrs, includeSelf: v.includeSelf, at: '', by: Rec.user.name };
      }
      v.panelOpen = false;
      // 整卡重渲染：摘要行更新 + 结果区按最新映射重取核算
      renderGjteam();
      toast('已保存归属映射并核算完成', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
}

function updateGjteamSum() {
  const v = Rec.gjteam;
  const d = Rec.gjteamData || {};
  const b = ((d.bases || {})[v.base]) || { mgrs: [], ysNull: { n: 0, amt: 0 }, dcNull: { n: 0, amt: 0 } };
  const fmtN = (n) => '¥' + Math.round(n).toLocaleString('zh-CN');
  let ys = { n: 0, amt: 0 }, dc = { n: 0, amt: 0 };
  const add = (x) => { ys.n += x.n; ys.amt += x.amt; };
  const addD = (x) => { dc.n += x.n; dc.amt += x.amt; };
  if (v.includeSelf) { const s = gjteamSelfStats(v.base, v.gj); add(s.ys); addD(s.dc); }
  b.mgrs.forEach((m) => { if (v.picked.includes(m.name)) { add(m.ys); addD(m.dc); } });
  if (v.picked.includes('__rule_ys__')) add({ n: b.ysNull.n, amt: b.ysNull.amt });
  if (v.picked.includes('__rule_dc__')) addD({ n: b.dcNull.n, amt: b.dcNull.amt });
  const nPeople = v.picked.filter((x) => !x.startsWith('__')).length + (v.includeSelf ? 1 : 0);
  const el = $('#gjtSum');
  if (el) el.innerHTML = `已选 <b>${nPeople}</b> 项 · 预计：直推 <b>${fmtN(ys.amt)}</b>（${ys.n} 行）· 接leads <b>${fmtN(dc.amt)}</b>（${dc.n} 单）`;
}

/** 高经本人在经理层的实绩（两源经理列=本人；未缓存时异步拉取核算数据） */
function gjteamSelfStats(base, gjName) {
  const calcKey = '_gjSelf_' + base + '|' + gjName;
  if (Rec.gjteamData && Rec.gjteamData[calcKey]) return Rec.gjteamData[calcKey];
  api(`/api/gj-team?base=${encodeURIComponent(base)}&gj=${encodeURIComponent(gjName)}`)
    .then((d2) => {
      if (d2.calc && Rec.gjteamData) {
        Rec.gjteamData[calcKey] = d2.calc.self || { ys: { n: 0, amt: 0 }, dc: { n: 0, amt: 0 } };
        if (Rec.gjteam.panelOpen) renderGjteamPanel();
      }
    })
    .catch(() => { /* 静默，本人行显示 0 */ });
  return { ys: { n: 0, amt: 0 }, dc: { n: 0, amt: 0 } };
}

function renderGjteamResult(calc) {
  const box = $('#gjtResult');
  if (!box || !calc) return;
  const fmtN = (n) => '¥' + Math.round(n).toLocaleString('zh-CN');
  const fmtM = (n) => fmtMoney(n);
  const statCard = (label, value, foot, tone) => `
    <div style="flex:1;min-width:150px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);border-top:3px solid ${tone || 'var(--line)'}">
      <div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:2px">${esc(String(value))}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(foot || '')}</div>
    </div>`;
  const rows = calc.rows || [];
  const sumMgr = calc.mgrSub || { ys: { amt: 0 }, dc: { amt: 0 } };
  const allAmt = (calc.total.ys.amt || 0) + (calc.total.dc.amt || 0);
  const tableRows = rows.map((r) => {
    const tot = (r.ys.amt || 0) + (r.dc.amt || 0);
    const pct = allAmt ? (tot / allAmt * 100).toFixed(1) + '%' : '—';
    return `<tr style="${r.self ? 'background:#eff6ff' : (r.rule ? 'background:#f0fdf4' : '')}">
      <td>${esc(r.name)}${r.self ? ' <span style="font-size:10px;padding:1px 6px;border-radius:99px;background:var(--primary);color:#fff;font-weight:600">本人</span>' : ''}${r.rule ? ' <span style="font-size:10px;padding:1px 6px;border-radius:99px;background:#16a34a;color:#fff;font-weight:600">规则</span>' : ''}</td>
      <td class="num muted">${esc(r.empId || '—')}</td>
      <td class="num">${r.ys.n}</td>
      <td class="num nowrap">${fmtM(r.ys.amt)}</td>
      <td class="num">${r.dc.n}</td>
      <td class="num nowrap">${fmtM(r.dc.amt)}</td>
      <td class="num nowrap"><b>${fmtM(tot)}</b></td>
      <td class="num muted">${pct}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `
    <div style="display:flex;gap:12px;padding:14px 16px;flex-wrap:wrap">
      ${statCard('团队直推业绩', fmtN(calc.total.ys.amt), calc.total.ys.n + ' 行 · 有数完成度口径', 'var(--primary)')}
      ${statCard('团队接leads业绩', fmtN(calc.total.dc.amt), calc.total.dc.n + ' 单 · 转化跟踪已转化口径', '#16a34a')}
      ${statCard('本人在经理层业绩', fmtN((calc.self.ys.amt || 0) + (calc.self.dc.amt || 0)), '直推 ' + fmtN(calc.self.ys.amt || 0) + ' · leads ' + fmtN(calc.self.dc.amt || 0) + ((calc.self.dcSales || []).length ? '（' + esc(calc.self.dcSales.join('/')) + '）' : ''))}
      ${statCard('经理业绩小计（' + (calc.rows ? calc.rows.filter((r) => !r.self && !r.rule).length : 0) + ' 人）', fmtN(sumMgr.ys.amt + sumMgr.dc.amt), '直推 ' + fmtN(sumMgr.ys.amt) + ' · leads ' + fmtN(sumMgr.dc.amt), '#94a3b8')}
    </div>
    <div style="padding:0 0 14px">
      <table class="table">
        <thead><tr><th>经理</th><th>工号</th><th class="num">直推行数</th><th class="num">直推业绩</th><th class="num">leads单数</th><th class="num">接leads业绩</th><th class="num">小计</th><th class="num">占比</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="8"><div class="empty"><h3>无勾选项</h3></div></td></tr>'}</tbody>
      </table>
      <div class="table-footer"><span>合计 直推 ${calc.total.ys.n} 行 ${fmtM(calc.total.ys.amt)} · 接leads ${calc.total.dc.n} 单 ${fmtM(calc.total.dc.amt)} · 两口径各自闭环互不混加</span></div>
      <div style="margin:10px 16px;padding:9px 13px;border:1px dashed #c7d2fe;border-radius:10px;font-size:12px;color:#3730a3;background:#eef2ff">
        <b>核算口径</b>：${esc(calc.gjName)} 团队直推业绩 = 手下经理直推合计 + 本人直管直推；接leads同理。归属映射调整时间 ${esc((calc.selection || {}).at || '—')}（${esc((calc.selection || {}).by || '—')}）· 仅管理员可调整
      </div>
    </div>`;
}

function exportGjteam() {
  const d = Rec.gjteamData || {};
  const saved = gjteamSaved();
  if (!saved) { toast('尚未核算，无可导出数据', 'info'); return; }
  api(`/api/gj-team?base=${encodeURIComponent(Rec.gjteam.base)}&gj=${encodeURIComponent(Rec.gjteam.gj)}`)
    .then((d2) => {
      const rows = (d2.calc && d2.calc.rows) || [];
      downloadCsv(`高经团队业绩_${Rec.gjteam.base}_${Rec.gjteam.gj}.csv`, rows, [
        { label: '经理', value: (r) => r.name },
        { label: '工号', value: (r) => r.empId },
        { label: '直推行数', value: (r) => r.ys.n },
        { label: '直推业绩', value: (r) => r.ys.amt },
        { label: 'leads单数', value: (r) => r.dc.n },
        { label: '接leads业绩', value: (r) => r.dc.amt }
      ]);
      toast(`已导出 ${rows.length} 行`, 'ok');
    })
    .catch((err) => toast(err.message, 'err'));
}

recordsBoot();

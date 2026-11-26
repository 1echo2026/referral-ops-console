'use strict';

/* =========================================================================
   前台 · 业绩排行
   只计算三类业绩：高经榜 / 经理榜 / 销售榜
   数据源：有数业绩完成度（直推）+ leads×订单池（接例子）· 按取数逻辑实时派生
   ========================================================================= */

const Rank = {
  user: null, datasets: [], settings: null,
  dataset: '', range: 'all', from: '', to: '', tab: 'manager',
  perfView: { month: '' },
  data: null, matrix: null
};

const BOARD_META = {
  manager: { title: '高经业绩榜', sub: '直推完成度降序 · 未设目标按业绩额排后 · 含接例子综合' },
  team: { title: '经理团队榜', sub: '经理团队直推业绩 ÷ 直推目标 · 按完成度降序' },
  emp: { title: '销售业绩榜', sub: '按工号数透累计转化金额 · 同分并列名次不跳号' }
};

async function rankingsBoot() {
  let b;
  try {
    b = await api('/api/bootstrap');
  } catch (err) {
    location.href = '/login';
    return;
  }
  Object.assign(Rank, { user: b.user, datasets: b.datasets, settings: b.settings });
  const isBase = b.user.role === 'base';

  const s = b.settings || {};
  $('#brandName').textContent = s.title || '转介绍数据看板';
  $('#brandSub').textContent = s.subtitle || '基地经营';
  $('#viewerChip').textContent = `${b.user.name} · ${isBase ? (b.user.baseName || '基地查看') : '全部基地'}`;
  $('#rankUpdated').textContent = `数据更新 ${(b.datasets[0] || {}).updatedAt || '—'}`;
  if (!isBase) $('#adminLink').classList.remove('hidden');
  if (b.user.role === 'admin') $('#editNote').classList.remove('hidden');
  if (isBase) $('#pageSubtitle').textContent = '按取数逻辑实时计算的高经 / 团队 / 销售榜单 · 仅本基地';

  const h = new URLSearchParams(location.search);
  if (h.get('dataset') && Rank.datasets.some((d) => d.id === h.get('dataset'))) Rank.dataset = h.get('dataset');
  else Rank.dataset = ((Rank.datasets.find((d) => d.preset === 'perf')) || Rank.datasets[0] || {}).id || '';
  if (h.get('tab') && BOARD_META[h.get('tab')]) Rank.tab = h.get('tab');

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = '/login';
  });

  $('#datasetFilter').innerHTML = Rank.datasets.map((d) => `<option value="${d.id}" ${d.id === Rank.dataset ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  $('#datasetFilter').addEventListener('change', (e) => { Rank.dataset = e.target.value; load(); });
  $('#rangeFilter').addEventListener('change', (e) => {
    Rank.range = e.target.value;
    Rank.from = ''; Rank.to = '';
    toggleCustom();
    load();
  });
  $('#fromFilter').addEventListener('change', (e) => { Rank.from = e.target.value; load(); });
  $('#toFilter').addEventListener('change', (e) => { Rank.to = e.target.value; load(); });
  $('#resetFilters').addEventListener('click', () => {
    Rank.range = 'all'; Rank.from = ''; Rank.to = '';
    $('#rangeFilter').value = 'all';
    toggleCustom();
    load();
  });
  $$('#rankTabs [data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Rank.tab = btn.dataset.key;
      $$('#rankTabs [data-key]').forEach((x) => x.classList.toggle('active', x === btn));
      renderBoard();
    });
  });
  $$('#rankTabs [data-key]').forEach((x) => x.classList.toggle('active', x.dataset.key === Rank.tab));

  $('#copyRank').addEventListener('click', copyTable);
  $('#exportRank').addEventListener('click', exportCsv);
  $('#editNote').addEventListener('click', editNote);

  toggleCustom();
  load();
}

/* 页签：只保留 高经榜 / 经理榜 / 销售榜；业绩底表附带月份选择 */
function renderRankTabs() {
  const tabs = [
    { key: 'manager', label: '高经榜' },
    { key: 'team', label: '经理榜' },
    { key: 'emp', label: '销售榜' }
  ];
  let html = tabs.map((t) => `<button class="table-tab ${t.key === Rank.tab ? 'active' : ''}" type="button" data-key="${t.key}">${t.label}</button>`).join('');
  const p = Rank.data && Rank.data.perf;
  if (p) {
    const months = (p.months && p.months.length) ? p.months : ['全部'];
    const cur = perfMonth();
    html += `<select class="control" id="rankMonth" style="width:110px;height:30px;margin-left:10px">${months.map((m) => `<option value="${esc(m)}" ${m === cur ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`;
  }
  $('#rankTabs').innerHTML = html;
  $$('#rankTabs [data-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Rank.tab = btn.dataset.key;
      renderRankTabs();
      renderBoard();
    });
  });
  const ms = $('#rankMonth');
  if (ms) ms.addEventListener('change', (e) => { Rank.perfView.month = e.target.value; renderBoard(); renderSummary(); });
}

function toggleCustom() {
  const custom = Rank.range === 'custom';
  $('#fromField').classList.toggle('hidden', !custom);
  $('#toField').classList.toggle('hidden', !custom);
  $('#fromFilter').value = Rank.from;
  $('#toFilter').value = Rank.to;
}

async function load() {
  const p = new URLSearchParams({ dataset: Rank.dataset, range: Rank.range });
  if (Rank.range === 'custom') { p.set('from', Rank.from); p.set('to', Rank.to); }
  try {
    Rank.data = await api(`/api/rankings?${p.toString()}`);
    Rank.matrix = null;
    if (!BOARD_META[Rank.tab]) Rank.tab = 'manager';
    renderRankTabs();
    renderBoard();
    renderSummary();
    renderNote();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function renderSummary() {
  const d = Rank.data;
  if (!d) return;
  let cards;
  if (d.perf) {
    // 业绩底表：摘要由取数逻辑结果派生（直推第一名 / 高经团队数 / 上榜销售数）
    const p = d.perf;
    const month = perfMonth();
    const gj = perfTeamRows(p, 'gj', month);
    const top = gj[0] || (p.frontline || [])[0];
    cards = [
      { label: '榜单第一名', value: top ? top.name : '—', foot: top ? `直推业绩 ${fmtCompact(top.dAmt !== undefined ? top.dAmt : top.total, 'money')}` : '暂无业绩数据' },
      { label: '高经团队', value: fmtInt((p.direct.gj || []).length), foot: '参与排名的高经数量' },
      { label: '上榜销售', value: fmtInt((p.frontline || []).length), foot: `${month} 直推合计 ${fmtCompact((p.frontline || []).reduce((s, x) => s + (month === '全部' ? x.total : (x.byMonth[month] || 0)), 0), 'money')}` }
    ];
  } else {
    cards = [
      { label: '榜单第一名', value: d.summary.topName, foot: `${d.primary.name} ${fmtCompact(d.summary.topValue, d.primary.format)}` },
      { label: '高经团队', value: fmtInt(d.summary.managerCount), foot: `参与排名的高经数量` },
      { label: `上榜销售`, value: fmtInt(d.summary.empCount), foot: `${d.primary.name}合计 ${fmtCompact(d.summary.totalValue, d.primary.format)}` }
    ];
  }
  $('#rankSummary').innerHTML = cards.map((c) => `
    <div class="rank-stat">
      <div class="rank-stat-label">${esc(c.label)}</div>
      <div class="rank-stat-value">${esc(String(c.value))}</div>
      <div class="rank-stat-foot">${esc(c.foot)}</div>
    </div>`).join('');
  const srcNote = d.perf && d.perf.directSource ? ` · 直推数据源：${d.perf.directSource}` : '';
  $('#rankUpdated').textContent = `${d.dataset.name} · 数据更新 ${new Date().toLocaleDateString('zh-CN')}${srcNote}`;
}

/* ---------- 取数逻辑计算（2.1 / 2.2 / 2.4） ---------- */

// 当前选择的月份（默认取数据里最近一个月，并写回选择状态）
function perfMonth() {
  const p = Rank.data.perf;
  const months = (p.months && p.months.length) ? p.months : ['全部'];
  const sel = Rank.perfView.month && months.includes(Rank.perfView.month) ? Rank.perfView.month : months[months.length - 1];
  Rank.perfView.month = sel;
  return sel;
}

// 目标匹配：优先同名同月；无同月目标时取该人最近月份的目标（口径沿用已上传目标）
function perfTargetOf(list, name, month) {
  const hits = (list || []).filter((t) => t.name === name && t.target > 0);
  if (!hits.length) return null;
  const exact = hits.filter((t) => t.month === month);
  const anyAll = hits.filter((t) => t.month === '全部');
  if (exact.length) return { target: exact.reduce((s, t) => s + t.target, 0), month };
  if (anyAll.length) return { target: anyAll.reduce((s, t) => s + t.target, 0), month: '全部' };
  const latest = hits.slice().sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
  const group = hits.filter((t) => t.month === latest.month);
  return { target: group.reduce((s, t) => s + t.target, 0), month: latest.month, stale: true };
}

// 团队行（2.2）：当月直推业绩 / 目标 / 完成度；高经另带接例子业绩与总业绩（2.4）
function perfTeamRows(p, level, month) {
  const amountOf = (r) => (month === '全部' ? (r.total || 0) : (r.byMonth[month] || 0));
  const rows = (p.direct[level] || []).map((r) => {
    const dAmt = amountOf(r);
    const t = perfTargetOf(p.targets.direct, r.name, month);
    let lAmt = 0;
    if (level === 'gj') {
      const l = (p.leads.gj || []).find((x) => x.name === r.name);
      if (l) lAmt = amountOf(l);
    }
    return {
      name: r.name, base: r.base, dAmt, lAmt, totalAmt: dAmt + lAmt,
      target: t ? t.target : null, targetMonth: t ? t.month : '',
      rate: t ? dAmt / t.target : null
    };
  });
  return rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.dAmt - a.dAmt);
}

function renderNote() {
  const note = (Rank.data && Rank.data.note) || '';
  const wrap = $('#rankNote');
  if (note) {
    wrap.textContent = note;
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }
}

function rateColor(rate) {
  return rate >= 1 ? '#047857' : rate >= 0.85 ? '#b45309' : '#b91c1c';
}

function renderBoard() {
  const d = Rank.data;
  if (!d) return;
  $('#stdCard').classList.remove('hidden');
  $('#perfCard').classList.add('hidden');
  let board = (d.boards || {})[Rank.tab] || [];
  const meta = BOARD_META[Rank.tab];
  const primary = d.primary;
  const ratio = d.ratio;
  const p = d.perf;
  const month = p ? perfMonth() : '';
  Rank.matrix = null;

  let head = '<tr><th>排名</th>';
  let rowHtml = (r) => '';

  if (p && Rank.tab === 'manager') {
    // 2.2 + 2.4：高经直推完成度（降序，未设目标排后）+ 接例子综合
    const rows = perfTeamRows(p, 'gj', month);
    $('#rankTitle').textContent = `${meta.title} · ${month}`;
    $('#rankSub').textContent = `${meta.sub} · 完成度 = 当月直推业绩 ÷ 直推目标${(rows.some((x) => x.targetMonth && x.targetMonth !== month && x.targetMonth !== '全部')) ? ' · 部分目标沿用已上传的最近月份口径' : ''}`;
    head += '<th>高经</th><th>基地</th><th>直推业绩</th><th>直推目标</th><th>直推完成度</th><th>接例子业绩</th><th>总业绩</th><th>总目标</th><th>总完成度</th></tr>';
    rowHtml = (r, i) => {
      const totalTarget = (r.target || 0);
      const overall = r.target ? r.totalAmt / totalTarget : null;
      return `<tr class="${i < 3 ? `top-${i + 1}` : ''}">
        <td class="num">${i < 3 ? `<span class="rank-label">No.${i + 1}</span>` : i + 1}</td>
        <td class="cell-left"><span class="rank-name">${esc(r.name)}</span></td>
        <td>${esc(r.base || '未匹配')}</td>
        <td class="num"><b>${fmtCompact(r.dAmt, 'money')}</b></td>
        <td class="num">${r.target ? `${fmtCompact(r.target, 'money')}${r.targetMonth !== month && r.targetMonth !== '全部' ? `<div class="text-xs muted">(${esc(r.targetMonth)})</div>` : ''}` : '<span class="empty-cell">未设目标</span>'}</td>
        <td class="num">${r.rate === null ? '<span class="empty-cell">—</span>' : `<b style="color:${rateColor(r.rate)}">${(r.rate * 100).toFixed(0)}%</b>`}</td>
        <td class="num">${fmtCompact(r.lAmt, 'money')}</td>
        <td class="num"><b>${fmtCompact(r.totalAmt, 'money')}</b></td>
        <td class="num">${r.target ? fmtCompact(totalTarget, 'money') : '<span class="empty-cell">—</span>'}</td>
        <td class="num">${overall === null ? '<span class="empty-cell">—</span>' : `<span style="color:${rateColor(overall)}">${(overall * 100).toFixed(0)}%</span>`}</td>
      </tr>`;
    };
    Rank.matrix = { headers: ['排名', '高经', '基地', `直推业绩(${month})`, '直推目标', '直推完成度', '接例子业绩', '总业绩', '总目标', '总完成度'], rows: rows.map((r, i) => [i + 1, r.name, r.base || '未匹配', r.dAmt, r.target || '未设目标', r.rate === null ? '' : `${(r.rate * 100).toFixed(0)}%`, r.lAmt, r.totalAmt, r.target || '', r.target ? `${(r.totalAmt / r.target * 100).toFixed(0)}%` : '']) };
    board = rows;
  } else if (p && Rank.tab === 'team') {
    // 2.2：经理团队直推完成度
    const rows = perfTeamRows(p, 'jl', month);
    $('#rankTitle').textContent = `${meta.title} · ${month}`;
    $('#rankSub').textContent = `${meta.sub}${(rows.some((x) => x.targetMonth && x.targetMonth !== month && x.targetMonth !== '全部')) ? ' · 部分目标沿用已上传的最近月份口径' : ''}`;
    head += '<th>经理</th><th>基地</th><th>直推业绩</th><th>直推目标</th><th>完成度</th></tr>';
    rowHtml = (r, i) => `<tr class="${i < 3 ? `top-${i + 1}` : ''}">
        <td class="num">${i < 3 ? `<span class="rank-label">No.${i + 1}</span>` : i + 1}</td>
        <td class="cell-left"><span class="rank-name">${esc(r.name)}</span></td>
        <td>${esc(r.base || '未匹配')}</td>
        <td class="num"><b>${fmtCompact(r.dAmt, 'money')}</b></td>
        <td class="num">${r.target ? `${fmtCompact(r.target, 'money')}${r.targetMonth !== month && r.targetMonth !== '全部' ? `<div class="text-xs muted">(${esc(r.targetMonth)})</div>` : ''}` : '<span class="empty-cell">未设目标</span>'}</td>
        <td class="num">${r.rate === null ? '<span class="empty-cell">—</span>' : `<span class="rank-bar"><span class="rank-bar-track"><span class="rank-bar-fill" style="width:${Math.min(100, r.rate * 100)}%;background:${r.rate >= 1 ? '#10b981' : r.rate >= 0.85 ? '#f59e0b' : '#60a5fa'}"></span></span><span class="rank-bar-val" style="color:${rateColor(r.rate)}">${(r.rate * 100).toFixed(0)}%</span></span>`}</td>
      </tr>`;
    Rank.matrix = { headers: ['排名', '经理', '基地', `直推业绩(${month})`, '直推目标', '完成度'], rows: rows.map((r, i) => [i + 1, r.name, r.base || '未匹配', r.dAmt, r.target || '未设目标', r.rate === null ? '' : `${(r.rate * 100).toFixed(0)}%`]) };
    board = rows;
  } else if (p && Rank.tab === 'emp') {
    // 2.1：一线直推业绩（同分并列名次、不跳号）
    const rows = p.frontline || [];
    $('#rankTitle').textContent = `${meta.title} · ${month}`;
    $('#rankSub').textContent = `${meta.sub} · 名次按转化金额降序，同分并列`;
    head += '<th>销售</th><th>销售工号</th><th>团队</th><th>基地</th><th>直推业绩</th></tr>';
    rowHtml = (r, i) => `<tr class="${r.rank <= 3 ? `top-${r.rank}` : ''}">
        <td class="num">${r.rank <= 3 ? `<span class="rank-label">No.${r.rank}</span>` : r.rank}</td>
        <td class="cell-left"><span class="rank-name">${esc(r.name || '—')}</span></td>
        <td class="mono text-sm">${esc(r.empId || '—')}</td>
        <td>${esc(r.teamName || '—')}</td>
        <td>${esc(r.base || '未匹配')}</td>
        <td class="num"><b>${fmtCompact(month === '全部' ? r.total : (r.byMonth[month] || 0), 'money')}</b></td>
      </tr>`;
    Rank.matrix = { headers: ['名次', '销售', '销售工号', '团队', '基地', `直推业绩(${month})`], rows: rows.map((r) => [r.rank, r.name || '', r.empId || '', r.teamName || '', r.base || '未匹配', month === '全部' ? r.total : (r.byMonth[month] || 0)]) };
    board = rows;
  } else if (Rank.tab === 'manager') {
    $('#rankTitle').textContent = `${meta.title} · ${d.dataset.name}`;
    $('#rankSub').textContent = `${meta.sub} · 主指标「${primary.name}」`;
    head += '<th>高经</th><th>团队</th><th>基地</th>';
    if (ratio) head += `<th>${esc(primary.name)}</th><th>${esc(ratio.name)}</th>`;
    else head += `<th>${esc(primary.name)}</th>`;
    head += `<th>目标 · ${esc(primary.name)}</th><th>达成率</th></tr>`;
    rowHtml = (r, i) => {
      const t = r.targets && r.targets[primary.key];
      const val = r.metrics[primary.key] || 0;
      const rate = t ? val / t : null;
      return `<tr class="${i < 3 ? `top-${i + 1}` : ''}">
        <td class="num">${i < 3 ? `<span class="rank-label">No.${i + 1}</span>` : i + 1}</td>
        <td class="cell-left"><span class="rank-name">${esc(r.name)}</span></td>
        <td>${esc(r.teamName || '—')}</td>
        <td>${esc(r.baseName || '—')}</td>
        <td class="num"><b>${fmt(val, primary.format, primary.unit)}</b></td>
        ${ratio ? `<td class="num">${fmt(r.metrics[ratio.key] || 0, ratio.format, ratio.unit)}</td>` : ''}
        <td class="num">${t ? fmtCompact(t, primary.format) : '—'}</td>
        <td class="num">${rate === null ? '—' : `<span class="rank-bar"><span class="rank-bar-track"><span class="rank-bar-fill" style="width:${Math.min(100, rate * 100)}%;background:${rate >= 1 ? '#10b981' : rate >= 0.85 ? '#f59e0b' : '#60a5fa'}"></span></span><span class="rank-bar-val" style="color:${rateColor(rate)}">${(rate * 100).toFixed(0)}%</span></span>`}</td>
      </tr>`;
    };
  } else if (Rank.tab === 'team') {
    $('#rankTitle').textContent = `${meta.title} · ${d.dataset.name}`;
    $('#rankSub').textContent = `${meta.sub} · 主指标「${primary.name}」`;
    head += '<th>团队</th>';
    head += `<th>${esc(primary.name)}</th>`;
    if (ratio) head += `<th>${esc(ratio.name)}</th>`;
    head += '</tr>';
    rowHtml = (r, i) => `<tr class="${i < 3 ? `top-${i + 1}` : ''}">
      <td class="num">${i < 3 ? `<span class="rank-label">No.${i + 1}</span>` : i + 1}</td>
      <td class="cell-left"><span class="rank-name">${esc(r.name)}</span></td>
      <td class="num"><b>${fmt(r.metrics[primary.key] || 0, primary.format, primary.unit)}</b></td>
      ${ratio ? `<td class="num">${fmt(r.metrics[ratio.key] || 0, ratio.format, ratio.unit)}</td>` : ''}
    </tr>`;
  } else {
    $('#rankTitle').textContent = `${meta.title} · ${d.dataset.name}`;
    $('#rankSub').textContent = `${meta.sub} · 主指标「${primary.name}」`;
    head += '<th>销售</th><th>销售工号</th><th>团队</th><th>基地</th>';
    head += `<th>${esc(primary.name)}</th>`;
    if (ratio) head += `<th>${esc(ratio.name)}</th>`;
    head += '</tr>';
    rowHtml = (r, i) => `<tr class="${i < 3 ? `top-${i + 1}` : ''}">
      <td class="num">${i < 3 ? `<span class="rank-label">No.${i + 1}</span>` : i + 1}</td>
      <td class="cell-left"><span class="rank-name">${esc(r.name)}</span></td>
      <td class="mono text-sm">${esc(r.empId || '—')}</td>
      <td>${esc(r.teamName || '—')}</td>
      <td>${esc(r.baseName || '—')}</td>
      <td class="num"><b>${fmt(r.metrics[primary.key] || 0, primary.format, primary.unit)}</b></td>
      ${ratio ? `<td class="num">${fmt(r.metrics[ratio.key] || 0, ratio.format, ratio.unit)}</td>` : ''}
    </tr>`;
  }

  $('#rankHead').innerHTML = head;
  $('#rankBody').innerHTML = board.length
    ? board.map(rowHtml).join('')
    : `<tr><td colspan="8"><div class="rank-empty">当前范围暂无数据</div></td></tr>`;
  $('#rankFoot').textContent = `共 ${board.length} 条 · 榜单由取数逻辑实时计算，目标达成率 = 实际 ÷ 目标`;
}

function tableMatrix() {
  const d = Rank.data;
  if (!d) return { headers: [], rows: [] };
  // 业绩底表：renderBoard 已生成与页面一致的矩阵（含月份口径）
  if (d.perf && Rank.matrix) return Rank.matrix;
  const board = (d.boards || {})[Rank.tab] || [];
  const primary = d.primary;
  const ratio = d.ratio;
  const headers = ['排名'];
  if (Rank.tab === 'manager') {
    headers.push('高经', '团队', '基地', primary.name);
    if (ratio) headers.push(ratio.name);
    headers.push(`目标(${primary.name})`, '达成率');
    return {
      headers,
      rows: board.map((r, i) => {
        const t = r.targets && r.targets[primary.key];
        const val = r.metrics[primary.key] || 0;
        const rate = t ? (val / t) : null;
        const cells = [i + 1, r.name, r.teamName, r.baseName, val];
        if (ratio) cells.push(r.metrics[ratio.key] || 0);
        cells.push(t || '', rate === null ? '' : `${(rate * 100).toFixed(0)}%`);
        return cells;
      })
    };
  }
  if (Rank.tab === 'team') {
    headers.push('团队', primary.name);
    if (ratio) headers.push(ratio.name);
    return {
      headers,
      rows: board.map((r, i) => {
        const cells = [i + 1, r.name, r.metrics[primary.key] || 0];
        if (ratio) cells.push(r.metrics[ratio.key] || 0);
        return cells;
      })
    };
  }
  headers.push('销售', '销售工号', '团队', '基地', primary.name);
  if (ratio) headers.push(ratio.name);
  return {
    headers,
    rows: board.map((r, i) => {
      const cells = [i + 1, r.name, r.empId, r.teamName, r.baseName, r.metrics[primary.key] || 0];
      if (ratio) cells.push(r.metrics[ratio.key] || 0);
      return cells;
    })
  };
}

async function copyTable() {
  const { headers, rows } = tableMatrix();
  const tsv = [headers.join('\t')].concat(rows.map((r) => r.join('\t'))).join('\n');
  try {
    await navigator.clipboard.writeText(tsv);
    toast('表格已复制，可直接粘贴到 Excel / 群里', 'ok');
  } catch (e) {
    toast('复制失败，请使用导出 CSV', 'err');
  }
}

function exportCsv() {
  const { headers, rows } = tableMatrix();
  const meta = BOARD_META[Rank.tab];
  downloadCsv(`业绩排行-${meta.title}.csv`, rows, headers.map((h, i) => ({ label: String(h), value: (r) => r[i] })));
  toast('已导出 CSV', 'ok');
}

function editNote() {
  const current = (Rank.data && Rank.data.note) || '';
  const box = openModal({
    title: '编辑榜单备注',
    subtitle: '保存后立即展示在前台榜单顶部',
    body: `<div class="form-field"><label>备注内容（留空则不展示）</label>
      <textarea class="control" id="noteInput" rows="4" placeholder="例如：本期数据截止 11 月 30 日，达成率以月初目标为准。">${esc(current)}</textarea></div>`,
    footer: `<button class="btn" id="noteCancel" type="button">取消</button><button class="btn btn-primary" id="noteSave" type="button">保存</button>`
  });
  box.querySelector('#noteCancel').addEventListener('click', closeModal);
  box.querySelector('#noteSave').addEventListener('click', async () => {
    try {
      await api('/api/admin/rankings-note', { method: 'PUT', body: { note: box.querySelector('#noteInput').value } });
      closeModal();
      if (Rank.data) Rank.data.note = box.querySelector('#noteInput').value;
      renderNote();
      toast('备注已更新', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
}

rankingsBoot();

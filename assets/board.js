'use strict';

/* =========================================================================
   看板渲染器（后台「整体数据看板」与前台「总览页」共用）
   布局：筛选条 → KPI → 趋势+结构 → 基地名单量+负责人Top8 → 基地-负责人下钻
        → 目标达成+基地指标明细
   ========================================================================= */

function createBoard(root, opts) {
  const options = Object.assign({
    user: null,
    bases: [],
    managers: [],
    datasets: [],
    settings: null,       // 前台展示配置（KPI 开关等）
    showBaseFilter: true,
    fixedBaseId: '',
    onManage: null,        // 管理员：跳转取数逻辑
    titlePrefix: ''
  }, opts);

  const state = {
    dataset: '',
    base: options.fixedBaseId || 'all',
    manager: 'all',
    range: 'all',
    from: '',
    to: '',
    status: 'all',
    data: null,
    loading: false
  };

  if (options.datasets.length) state.dataset = options.datasets[0].id;

  /* ---------------- URL 状态持久化 ---------------- */
  function readUrl() {
    try {
      const h = new URLSearchParams(location.hash.replace(/^#/, ''));
      const has = h.has('dataset') || h.has('base') || h.has('range');
      if (!has) return;
      if (h.get('dataset') && options.datasets.some((d) => d.id === h.get('dataset'))) state.dataset = h.get('dataset');
      if (h.get('base') && (options.fixedBaseId || h.get('base') === 'all' || options.bases.some((b) => b.id === h.get('base')))) {
        state.base = options.fixedBaseId || h.get('base');
      }
      if (h.get('range')) state.range = h.get('range');
      if (h.get('from')) state.from = h.get('from');
      if (h.get('to')) state.to = h.get('to');
      if (h.get('status')) state.status = h.get('status');
    } catch (e) { /* 忽略 */ }
  }

  function writeUrl() {
    try {
      const h = new URLSearchParams();
      h.set('dataset', state.dataset);
      if (options.showBaseFilter) h.set('base', state.base);
      h.set('range', state.range);
      if (state.range === 'custom') { h.set('from', state.from); h.set('to', state.to); }
      if (state.status !== 'all') h.set('status', state.status);
      history.replaceState(null, '', `#${h.toString()}`);
    } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 板块点击 → 明细名单（携带当前筛选） ---------------- */
  function localResolveRange() {
    const today = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (state.range === '30') { const d = new Date(today); d.setDate(d.getDate() - 29); return { from: fmt(d), to: fmt(today) }; }
    if (state.range === '90') { const d = new Date(today); d.setDate(d.getDate() - 89); return { from: fmt(d), to: fmt(today) }; }
    if (state.range === 'month') return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to: fmt(today) };
    if (state.range === 'custom') return { from: state.from, to: state.to };
    return { from: '', to: '' };
  }

  function recordsHref(extra = {}) {
    const p = new URLSearchParams({ dataset: state.dataset });
    const base = extra.base !== undefined ? extra.base : (options.showBaseFilter ? state.base : '');
    if (base && base !== 'all') p.set('base', base);
    if (state.status !== 'all') p.set('status', state.status);
    const { from, to } = localResolveRange();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (extra.q) p.set('q', extra.q);
    return `records.html?${p.toString()}`;
  }

  function goRecords(extra = {}) {
    location.href = recordsHref(extra);
  }

  root.innerHTML = `
    <div class="filterbar" data-el="filters"></div>
    <div class="kpi-grid" data-el="kpis"></div>
    <div class="grid-2" data-el="trendGrid">
      <section class="card" data-el="trendCard">
        <div class="card-head">
          <div>
            <h2><span class="head-icon">${icon('trendUp', 14)}</span><span data-el="trendTitle">趋势</span></h2>
            <p class="sub" data-el="trendSub">按月汇总</p>
          </div>
          <div class="card-head-actions">
            <span class="chip" data-el="trendChip">—</span>
            <button class="btn btn-sm" data-el="export" type="button">${icon('download', 13)}导出CSV</button>
          </div>
        </div>
        <div class="card-body"><div class="chart" data-el="trend"></div></div>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <h2><span class="head-icon violet">${icon('layers', 14)}</span><span data-el="structTitle">结构分布</span></h2>
            <p class="sub" data-el="structSub">按状态拆分</p>
          </div>
        </div>
        <div class="card-body"><div data-el="donut"></div></div>
      </section>
    </div>
    <div class="grid-2 equal">
      <section class="card">
        <div class="card-head">
          <div>
            <h2><span class="head-icon green">${icon('building', 14)}</span><span data-el="rankTitle">基地名单量</span></h2>
            <p class="sub" data-el="rankSub">按当前筛选范围汇总</p>
          </div>
        </div>
        <div class="card-body"><div data-el="rankBars"></div></div>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <h2><span class="head-icon amber">${icon('users', 14)}</span><span data-el="ownerTitle">负责人 Top 8</span></h2>
            <p class="sub" data-el="ownerSub">按名单量排序</p>
          </div>
        </div>
        <div class="card-body"><div data-el="ownerBars"></div></div>
      </section>
    </div>
    <section class="card">
      <div class="card-head">
        <div>
          <h2><span class="head-icon">${icon('chevronRight', 14)}</span>基地-负责人下钻</h2>
          <p class="sub">点击基地展开负责人明细</p>
        </div>
        <div class="card-head-actions"><span class="chip" data-el="drillChip">—</span></div>
      </div>
      <div class="card-body" style="padding-top:6px"><div class="drilldown" data-el="drilldown"></div></div>
    </section>
    <div class="grid-2 equal">
      <section class="card">
        <div class="card-head">
          <div>
            <h2><span class="head-icon amber">${icon('target', 14)}</span>目标达成</h2>
            <p class="sub" data-el="goalSub">当前筛选范围</p>
          </div>
        </div>
        <div class="card-body"><div data-el="goals"></div></div>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <h2><span class="head-icon cyan">${icon('list', 14)}</span>基地指标明细</h2>
            <p class="sub" data-el="baseTableSub">各基地全指标汇总</p>
          </div>
          <div class="card-head-actions">
            <a class="btn btn-sm" href="/records" data-el="toRecords">查看明细名单</a>
          </div>
        </div>
        <div class="table-wrap" style="max-height:420px"><table class="table" data-el="baseTable"></table></div>
      </section>
    </div>
  `;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);

  /* ---------------- 筛选条 ---------------- */
  function renderFilters() {
    const ds = options.datasets.find((d) => d.id === state.dataset);
    // 底表没有日期字段（如高潜名单汇总）时隐藏时间筛选，避免筛选后整表被过滤为空
    const hasDate = !ds || !Array.isArray(ds.standardFields) || !ds.standardFields.length || ds.standardFields.some((f) => f.key === 'date');
    if (!hasDate) { state.range = 'all'; state.from = ''; state.to = ''; }
    const baseOptions = options.bases.map((b) => `<option value="${b.id}" ${state.base === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    const managerOptions = options.managers
      .filter((m) => (state.base === 'all' ? true : m.baseId === state.base))
      .map((m) => `<option value="${m.empId}" ${state.manager === m.empId ? 'selected' : ''}>${esc(m.name)} · ${esc(m.teamName)}</option>`).join('');
    const statusOptions = (state.data && state.data.byStatusAll || [])
      .map((s) => `<option value="${esc(s.name)}" ${state.status === s.name ? 'selected' : ''}>${esc(s.name)}（${fmtInt(s.count)}）</option>`).join('');

    el('filters').innerHTML = `
      <div class="field">
        <label>数据类别</label>
        <select class="control" data-f="dataset" style="min-width:180px">
          ${options.datasets.map((d) => `<option value="${d.id}" ${state.dataset === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </div>
      ${options.showBaseFilter ? `
      <div class="field">
        <label>基地</label>
        <select class="control" data-f="base">
          <option value="all" ${state.base === 'all' ? 'selected' : ''}>全部基地</option>
          ${baseOptions}
        </select>
      </div>` : ''}
      <div class="field">
        <label>高经</label>
        <select class="control" data-f="manager">
          <option value="all" ${state.manager === 'all' ? 'selected' : ''}>全部高经</option>
          ${managerOptions}
        </select>
      </div>
      ${hasDate ? `
      <div class="field">
        <label>时间</label>
        <select class="control" data-f="range">
          <option value="all" ${state.range === 'all' ? 'selected' : ''}>全部时间</option>
          <option value="30" ${state.range === '30' ? 'selected' : ''}>近 30 天</option>
          <option value="90" ${state.range === '90' ? 'selected' : ''}>近 90 天</option>
          <option value="month" ${state.range === 'month' ? 'selected' : ''}>本月</option>
          <option value="custom" ${state.range === 'custom' ? 'selected' : ''}>自定义</option>
        </select>
      </div>
      ${state.range === 'custom' ? `
        <div class="field"><label>起</label><input class="control" type="date" data-f="from" value="${esc(state.from)}"></div>
        <div class="field"><label>止</label><input class="control" type="date" data-f="to" value="${esc(state.to)}"></div>` : ''}` : ''}
      ${statusOptions ? `
      <div class="field">
        <label>${ds && ds.preset === 'koc' ? 'KOC层级' : '状态'}</label>
        <select class="control" data-f="status">
          <option value="all" ${state.status === 'all' ? 'selected' : ''}>${ds && ds.preset === 'koc' ? '全部层级' : '全部状态'}</option>
          ${statusOptions}
        </select>
      </div>` : ''}
      <div class="spacer"></div>
      <span class="chip">${ds ? esc(ds.category) : ''}</span>
      <button class="btn btn-sm" data-el="reset" type="button">${icon('refresh', 13)}重置</button>
    `;

    el('filters').querySelectorAll('[data-f]').forEach((node) => {
      node.addEventListener('change', () => {
        const key = node.dataset.f;
        state[key] = node.value;
        if (key === 'base') state.manager = 'all';
        if (key === 'dataset') state.manager = 'all';
        if (key === 'range') { state.from = ''; state.to = ''; }
        renderFilters();
        refresh();
      });
    });
    const reset = el('reset');
    if (reset) reset.addEventListener('click', () => {
      state.base = options.fixedBaseId || 'all';
      state.manager = 'all';
      state.range = 'all';
      state.from = '';
      state.to = '';
      state.status = 'all';
      renderFilters();
      refresh();
    });
  }

  /* ---------------- 数据 ---------------- */
  async function refresh() {
    if (!state.dataset) return;
    state.loading = true;
    renderSkeleton();
    writeUrl();
    const q = new URLSearchParams({ dataset: state.dataset, base: state.base, manager: state.manager, range: state.range, status: state.status });
    if (state.range === 'custom') { q.set('from', state.from); q.set('to', state.to); }
    try {
      state.data = await api(`/api/dashboard?${q.toString()}`);
      renderFilters();   // 状态下拉依赖首次返回的 byStatusAll
      render();
    } catch (err) {
      toast(err.message, 'err');
      el('kpis').innerHTML = `<div class="card pad" style="grid-column:1/-1">${err.message}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function renderSkeleton() {
    el('kpis').innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton sk-kpi"></div>').join('');
  }

  /* ---------------- 渲染 ---------------- */
  function visibleKpis(d) {
    const kpis = d.kpis || [];
    const toggles = options.settings && options.settings.kpiToggles;
    const allow = toggles && toggles[d.dataset.id];
    if (!allow) return kpis;                      // 未配置 = 全部展示
    return kpis.filter((k) => allow.includes(k.key));
  }

  function render() {
    const d = state.data;
    if (!d || !d.dataset) return;
    const metrics = d.dataset.metrics || [];
    const primary = metrics[0] || { key: 'count', name: '数量', format: 'int', unit: '' };
    // 第二指标优先取计数/求和类，跳过「去重计数」避免两条线几乎重合
    const secondary = metrics.find((m) => m.type !== 'ratio' && m.type !== 'distinct' && m.key !== primary.key)
      || metrics.find((m) => m.type !== 'ratio' && m.key !== primary.key) || null;
    const ratioMetric = metrics.find((m) => m.type === 'ratio') || null;

    /* KPI */
    const tones = ['blue', 'green', 'violet', 'amber'];
    el('kpis').innerHTML = visibleKpis(d).map((k, i) => {
      const p = fmtParts(k.value, k.format, k.unit);
      const att = k.attainment;
      const cls = att === null ? '' : att >= 1 ? 'ok' : att >= 0.85 ? 'warn' : 'bad';
      return `
        <div class="kpi" data-tone="${tones[i % 4]}">
          <div class="kpi-label">
            <span>${esc(k.name)}</span>
            <span class="kpi-scope ${k.scope === 'global' && options.user.role === 'base' ? '' : 'local'}">${k.scopeLabel}</span>
            <span class="q" title="${esc(k.desc || '')}">?</span>
          </div>
          <div class="kpi-value">${p.main}<span class="unit">${esc(p.unit)}</span></div>
          ${k.target
            ? `<div class="kpi-target">
                 <div class="kpi-target-bar"><span class="${cls}" style="width:${Math.min(100, Math.max(2, (att || 0) * 100))}%"></span></div>
                 <div class="kpi-target-text"><span>目标 ${fmtCompact(k.target, k.format)}</span><b style="${att >= 1 ? 'color:#047857' : att >= 0.85 ? 'color:#b45309' : 'color:#b91c1c'}">${(att * 100).toFixed(0)}%</b></div>
               </div>`
            : `<div class="kpi-foot">${esc(k.desc || '')}</div>`}
          <div class="kpi-ic">${icon(['userPlus', 'spark', 'target', 'wallet'][i % 4], 14)}</div>
        </div>`;
    }).join('');

    /* 趋势（高潜名单等无月份维度的底表隐藏趋势卡，结构分布占满整行） */
    const isKocDataset = d.dataset && d.dataset.preset === 'koc';
    if (el('trendCard')) el('trendCard').style.display = isKocDataset ? 'none' : '';
    if (el('trendGrid')) el('trendGrid').style.gridTemplateColumns = isKocDataset ? '1fr' : '';
    if (isKocDataset) { el('trendSub').textContent = ''; el('trendChip').textContent = ''; }
    else {
    const monthLabels = (d.byMonth || []).map((m) => m.month.replace(/^\d{4}-/, '') + '月');
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = (d.byMonth[d.byMonth.length - 1] || {}).month;
    const series = [{ name: primary.name, color: '#3b82f6', values: d.byMonth.map((m) => m.metrics[primary.key] || 0) }];
    if (secondary) {
      const a = d.byMonth.map((m) => m.metrics[primary.key] || 0);
      const b = d.byMonth.map((m) => m.metrics[secondary.key] || 0);
      const scaleGap = (Math.max(1, ...b) / Math.max(1, ...a)) > 4 || (Math.max(1, ...a) / Math.max(1, ...b)) > 4;
      // 量级差异过大（如成交单数 vs 成交金额）时，第二指标走右轴，避免被压成一条直线
      series.push({ name: secondary.name, color: '#8b5cf6', values: b, area: false, axis: scaleGap ? 'right' : 'left', format: secondary.format });
    }
    el('trendTitle').textContent = `${primary.name}趋势`;
    el('trendSub').textContent = `按月份汇总 · ${d.dataset.name}${lastMonth === currentMonth ? ' · 当月为进行中数据' : ''}`;
    el('trendChip').textContent = `合计 ${fmtCompact(d.kpis[0].value, primary.format)}`;
    Charts.trend(el('trend'), { labels: monthLabels, series, format: primary.format });
    }

    /* 结构 */
    const statusItems = (d.byStatus || []).filter((s) => s.name);
    const useChannel = statusItems.length <= 1 && (d.byChannel || []).length > 1;
    let structItems = (useChannel ? d.byChannel : statusItems).map((s, i) => ({
      label: s.name, value: s.count, color: PALETTE[i % PALETTE.length]
    }));
    let structTitle = useChannel ? '渠道分布' : (d.dataset && d.dataset.preset === 'koc' ? 'KOC层级分布' : '状态分布');
    let structSub = useChannel ? '按渠道拆分记录数' : (d.dataset && d.dataset.preset === 'koc' ? '按 KOC层级拆分人数' : '按业务状态拆分记录数');
    // KOC：环形图按层级配置配色（金 / 香芋紫 / 浅蓝 / 浅绿）
    const kocColors = d.dataset && d.dataset.kocConfig ? d.dataset.kocConfig.colors : null;
    const kocTierColor = (label) => {
      if (!kocColors) return null;
      if (/^历史累计≥/.test(label)) return kocColors.t1;
      if (/^历史累计/.test(label)) return kocColors.t2;
      if (label === '26年推荐成功') return kocColors.t3;
      if (label === '未入选') return kocColors.t4;
      return null;
    };
    // KOC：环形图条目按层级配置配色
    if (!useChannel && d.dataset && d.dataset.preset === 'koc') {
      structItems = structItems.map((s, i) => ({ ...s, color: kocTierColor(s.label) || PALETTE[i % PALETTE.length] }));
    }
    // 既无状态也无渠道（如高潜名单汇总）时，退化为基地分布，避免环形图为空
    if (structItems.length <= 1 && (d.byBase || []).length > 1) {
      structItems = d.byBase.map((b, i) => ({ label: b.name, value: b.metrics[primary.key] || 0, color: b.color || PALETTE[i % PALETTE.length] }));
      structTitle = '基地分布';
      structSub = `按基地拆分「${primary.name}」`;
    }
    el('structTitle').textContent = structTitle;
    el('structSub').textContent = structSub;
    Charts.donut(el('donut'), { items: structItems, format: 'int', center: '记录数' });

    /* 基地名单量 */
    const rankItems = options.showBaseFilter
      ? (d.byBase || []).map((b) => ({ id: b.id, label: b.name, value: b.metrics[primary.key] || 0, color: b.color }))
      : (d.byManager || []).map((m, i) => ({ label: `${m.name} · ${m.teamName}`, value: m.metrics[primary.key] || 0, color: PALETTE[i % PALETTE.length] }));
    el('rankTitle').textContent = options.showBaseFilter ? '基地名单量' : '团队名单量';
    el('rankSub').textContent = `按「${primary.name}」排序 · 当前筛选范围`;
    Charts.bars(el('rankBars'), { items: rankItems.slice(0, 10), format: primary.format });

    /* 负责人 Top 8（颜色越深比率越高） */
    const ownerItems = (d.byEmp || []).slice(0, 8).map((e) => ({
      empId: e.empId,
      label: e.name || e.empId,
      sub: e.teamName ? `${e.teamName}${e.baseName ? ' · ' + e.baseName : ''}` : '',
      value: e.metrics[primary.key] || 0,
      rate: ratioMetric ? (e.metrics[ratioMetric.key] || 0) : null
    }));
    el('ownerSub').textContent = ratioMetric
      ? `按「${primary.name}」排序，颜色越深${ratioMetric.name}越高`
      : `按「${primary.name}」排序`;
    Charts.owners(el('ownerBars'), {
      items: ownerItems, format: primary.format,
      rateLabel: ratioMetric ? ratioMetric.name : '比率'
    });

    /* 基地-负责人下钻（手风琴） */
    renderBaseDrill(d, primary);

    /* 目标达成列表 */
    const goalSource = options.showBaseFilter && state.base === 'all'
      ? (d.byBase || []).map((b) => ({ id: b.id, name: b.name, metrics: b.metrics, targets: b.targets }))
      : (d.byManager || []).map((m) => ({ id: '', name: `${m.name} · ${m.teamName}`, metrics: m.metrics, targets: m.targets }));
    // 只展示「当前筛选范围确实配置了目标」的指标，避免整列显示 —
    const trackedKeys = metrics
      .filter((m) => m.type !== 'ratio')
      .filter((m) => goalSource.some((g) => g.targets && g.targets[m.key] !== undefined))
      .slice(0, 2);
    let goalHtml = '';
    trackedKeys.forEach((mk) => {
      const rows = goalSource
        .map((g) => {
          const t = g.targets && g.targets[mk.key];
          if (!t) return null;
          return { id: g.id, name: g.name, value: g.metrics[mk.key] || 0, target: t, rate: (g.metrics[mk.key] || 0) / t };
        })
        .filter(Boolean)
        .sort((a, b) => b.rate - a.rate);
      if (!rows.length) return;
      goalHtml += `<div class="text-xs muted" style="font-weight:600;letter-spacing:.04em;margin-bottom:8px;text-transform:uppercase">${esc(mk.name)}达成</div><div class="goal-list" style="margin-bottom:16px">`;
      goalHtml += rows.slice(0, 5).map((r) => {
        const color = r.rate >= 1 ? '#10b981' : r.rate >= 0.85 ? '#f59e0b' : '#ef4444';
        return `<div class="goal-row${r.id ? ' clickable' : ''}"${r.id ? ` data-base="${esc(r.id)}" title="点击查看该基地明细名单"` : ''}>
          <span class="gname">${esc(r.name)}</span>
          <span class="gval">${fmtCompact(r.value, mk.format)} / ${fmtCompact(r.target, mk.format)}</span>
          <span class="gtrack"><span class="gfill" style="width:${Math.min(100, r.rate * 100)}%;background:${color}"></span></span>
          <span class="gfoot"><span>达成 ${(r.rate * 100).toFixed(0)}%</span><span>${r.rate >= 1 ? `超 ${fmtCompact(r.value - r.target, mk.format)}` : `差 ${fmtCompact(r.target - r.value, mk.format)}`}</span></span>
        </div>`;
      }).join('');
      goalHtml += `</div>`;
    });
    el('goals').innerHTML = goalHtml || `<div class="chart-empty" style="min-height:160px;text-align:center">当前筛选范围还没有配置目标<br><span class="text-xs">可在后台「业绩目标」按期间上传</span></div>`;
    el('goalSub').textContent = state.manager !== 'all' ? '按高经目标' : state.base !== 'all' ? '按基地目标' : '按基地目标';

    /* 基地指标明细表 */
    renderBaseTable(d, metrics, primary);

    const exp = el('export');
    exp.onclick = () => exportCsv(d, metrics);

    /* 板块点击 → 明细名单（携带当前筛选） */
    const toRecords = el('toRecords');
    if (toRecords) toRecords.href = recordsHref();
    el('kpis').querySelectorAll('.kpi').forEach((k) => {
      k.classList.add('clickable');
      k.onclick = (ev) => { if (ev.target.closest('.q')) return; goRecords(); };
    });
    if (options.showBaseFilter) {
      const barBases = (rankItems || []).slice(0, 10);
      el('rankBars').querySelectorAll('.bar-row').forEach((row, i) => {
        const b = barBases[i];
        if (!b || !b.id) return;
        row.classList.add('clickable');
        row.onclick = () => goRecords({ base: b.id });
      });
    }
    const ownerList = (ownerItems || []).filter((x) => Number(x.value) > 0);
    el('ownerBars').querySelectorAll('.bar-row').forEach((row, i) => {
      const e = ownerList[i];
      if (!e || !e.empId) return;
      row.classList.add('clickable');
      row.onclick = () => goRecords({ q: e.empId });
    });
    el('goals').querySelectorAll('.goal-row[data-base]').forEach((row) => {
      row.onclick = () => goRecords({ base: row.dataset.base });
    });
    el('baseTable').querySelectorAll('tr[data-base]').forEach((row) => {
      row.onclick = () => goRecords({ base: row.dataset.base });
    });

    if (options.onFilterChange) options.onFilterChange(d, state);
  }

  /* 基地-负责人下钻（参考项目手风琴式） */
  function renderBaseDrill(d, primary) {
    const wrap = el('drilldown');
    const byBase = d.byBase || [];
    if (!byBase.length) { wrap.innerHTML = `<div class="chart-empty">暂无基地数据</div>`; return; }
    const byManager = d.byManager || [];
    const grouped = new Map();
    byManager.forEach((m) => {
      if (!m.baseId) return;
      if (!grouped.has(m.baseId)) grouped.set(m.baseId, []);
      grouped.get(m.baseId).push(m);
    });
    wrap.innerHTML = byBase.map((b, idx) => {
      const mgrs = grouped.get(b.id) || [];
      mgrs.sort((x, y) => (y.metrics[primary.key] || 0) - (x.metrics[primary.key] || 0));
      const max = Math.max(1, ...mgrs.map((m) => m.metrics[primary.key] || 0));
      const rows = mgrs.length ? mgrs.slice(0, 12).map((m) => `
        <div class="owner-row">
          <span class="chevron" style="visibility:hidden">${icon('chevronRight', 12)}</span>
          <span class="owner-name">${esc(m.name)}<span class="text-xs muted" style="margin-left:6px">${esc(m.teamName || '')}</span></span>
          <span class="owner-bar"><span style="width:${Math.max(3, ((m.metrics[primary.key] || 0) / max) * 100)}%;background:${b.color}"></span></span>
          <span class="owner-count">${fmtInt(m.metrics[primary.key] || 0)}</span>
        </div>`).join('') : '<div class="owner-row"><span></span><span class="owner-name muted">暂无负责人明细</span><span></span><span></span></div>';
      return `
        <div class="drill-base ${idx === 0 ? 'open' : ''}">
          <button class="drill-toggle" type="button">
            <span class="chevron">${icon('chevronRight', 13)}</span>
            <span class="drill-name"><i style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${b.color};margin-right:7px;vertical-align:1px"></i>${esc(b.name)}</span>
            <span class="drill-count">${mgrs.length} 位负责人</span>
            <span class="drill-total">${fmtInt(b.metrics[primary.key] || 0)} ${esc(primary.unit || '条')}</span>
          </button>
          <div class="drill-body">${rows}</div>
        </div>`;
    }).join('');
    el('drillChip').textContent = `${byBase.length} 个基地 · ${fmtInt((d.byBase || []).reduce((s, b) => s + b.count, 0))} 条记录`;
    wrap.querySelectorAll('.drill-toggle').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.drill-base').classList.toggle('open'));
    });
  }

  /* 基地指标明细表 */
  function renderBaseTable(d, metrics, primary) {
    const cols = metrics.slice(0, 4);
    const targetMetric = metrics.find((m) => m.type !== 'ratio'
      && (d.byBase || []).some((b) => b.targets && b.targets[m.key] !== undefined)) || null;
    const table = el('baseTable');
    const head = `<thead><tr>
      <th>基地</th>
      ${cols.map((m) => `<th class="num">${esc(m.name)}</th>`).join('')}
      ${targetMetric ? `<th class="num">目标 · ${esc(targetMetric.name)}</th><th class="num" style="width:96px">达成率</th>` : ''}
    </tr></thead>`;
    const rows = (d.byBase || []).map((b) => {
      const t = targetMetric && b.targets ? b.targets[targetMetric.key] : null;
      const val = targetMetric ? (b.metrics[targetMetric.key] || 0) : 0;
      const rate = t ? val / t : null;
      const color = rate === null ? '' : rate >= 1 ? '#047857' : rate >= 0.85 ? '#b45309' : '#b91c1c';
      return `<tr class="link-row" data-base="${esc(b.id)}" title="点击查看该基地明细名单">
        <td><span style="display:inline-flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:2px;background:${b.color}"></i><span class="strong">${esc(b.name)}</span></span></td>
        ${cols.map((m) => `<td class="num">${fmt(b.metrics[m.key] || 0, m.format, m.unit)}</td>`).join('')}
        ${targetMetric ? `<td class="num">${t ? fmtCompact(t, targetMetric.format) : '<span class="muted">—</span>'}</td>
        <td class="num">${rate === null ? '<span class="muted">—</span>' : `<b style="color:${color}">${(rate * 100).toFixed(0)}%</b>`}</td>` : ''}
      </tr>`;
    }).join('');
    table.innerHTML = rows ? `${head}<tbody>${rows}</tbody>` : `${head}<tbody><tr><td colspan="6"><div class="empty"><h3>暂无数据</h3></div></td></tr></tbody>`;
    el('baseTableSub').textContent = `${d.dataset.name} · 共 ${fmtInt(d.rows)} 行参与计算`;
  }

  function exportCsv(d, metrics) {
    const cols = metrics.slice(0, 4);
    const rows = (d.byManager || []).map((m) => {
      const obj = { 高经: m.name, 团队: m.teamName, 基地: m.baseName };
      cols.forEach((mk) => { obj[mk.name] = (m.metrics[mk.key] || 0); });
      return obj;
    });
    downloadCsv(`${d.dataset.name}-高经维度.csv`, rows, [
      { label: '高经', value: '高经' }, { label: '团队', value: '团队' }, { label: '基地', value: '基地' },
      ...cols.map((mk) => ({ label: mk.name, value: mk.name }))
    ]);
    toast('已导出 CSV', 'ok');
  }

  readUrl();
  renderFilters();
  refresh();

  return {
    refresh,
    setDataset(id) { state.dataset = id; renderFilters(); refresh(); },
    setManager(id) { state.manager = id; renderFilters(); refresh(); },
    getState() { return state; },
    getData() { return state.data; }
  };
}

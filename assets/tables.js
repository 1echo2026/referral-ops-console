'use strict';

/* =========================================================================
   前台 · 专项明细
   按数据类别查看各基地指标汇总（sheet 卡片式表格）
   ========================================================================= */

const Tabs = { user: null, datasets: [], settings: null, dataset: '', data: null };

const TONE_THEME = {
  blue: 'blue', green: 'green', violet: 'violet', amber: 'amber'
};

async function tablesBoot() {
  let b;
  try {
    b = await api('/api/bootstrap');
  } catch (err) {
    location.href = 'login.html';
    return;
  }
  Object.assign(Tabs, { user: b.user, datasets: b.datasets, settings: b.settings });
  const isBase = b.user.role === 'base';

  const s = b.settings || {};
  $('#brandName').textContent = s.title || '转介绍数据看板';
  $('#brandSub').textContent = s.subtitle || '基地经营';
  $('#viewerChip').textContent = `${b.user.name} · ${isBase ? (b.user.baseName || '基地查看') : '全部基地'}`;
  $('#updatedAt').textContent = `数据更新 ${(b.datasets[0] || {}).updatedAt || '—'}`;
  if (!isBase) $('#adminLink').classList.remove('hidden');

  const h = new URLSearchParams(location.search);
  if (h.get('dataset') && Tabs.datasets.some((d) => d.id === h.get('dataset'))) Tabs.dataset = h.get('dataset');
  else Tabs.dataset = (Tabs.datasets[0] || {}).id || '';

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = 'login.html';
  });

  renderTabs();
  $('#exportExcel').style.display = '';
  $('#exportExcel').addEventListener('click', exportExcel);
  load();
}

/* 导出当前表格为 .xlsx（基地 × 指标 + 合计行；KOC 底表追加 KOC层级分布 sheet） */
function exportExcel() {
  const d = Tabs.data;
  if (!d) { toast('数据尚未加载', 'err'); return; }
  const metrics = d.metrics || [];
  const wb = XLSX.utils.book_new();

  // Sheet1：按基地汇总（与页面表格一致）
  const aoa = [['基地', ...metrics.map((m) => m.name + (m.unit ? `(${m.unit})` : ''))]];
  (d.byBase || []).forEach((b) => {
    aoa.push([b.name, ...metrics.map((m) => b.metrics[m.key] || 0)]);
  });
  aoa.push(['合计', ...metrics.map((m) => (d.byBase || []).reduce((s, b) => s + (b.metrics[m.key] || 0), 0))]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, ...metrics.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, ws, '按基地汇总');

  // Sheet2：KOC 名单分层（仅 KOC 底表）
  if (d.dataset.preset === 'koc' && d.tiers) {
    const t = d.tiers;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['名单', '人数', '口径'],
      ['历史累计≥6', t.tierA || 0, '累计新正价 ≥ 6'],
      ['历史累计3-6', t.tierB || 0, '3 ≤ 累计新正价 < 6'],
      ['26年推荐成功', t.tierC || 0, '26年新正价 > 0 且未进入历史名单'],
      ['未入选', t.none || 0, '以上均不满足'],
      ['重合（历史≥3 且 26年>0）', t.overlap || 0, '同时出现在历史名单与26年名单']
    ]), 'KOC分层');
  }

  XLSX.writeFile(wb, `${d.dataset.name}-专项明细.xlsx`);
  toast('Excel 已导出', 'ok');
}

function renderTabs() {
  $('#tableTabs').innerHTML = Tabs.datasets.map((d, i) => `
    <button class="table-tab ${d.id === Tabs.dataset ? 'active' : ''}" data-ds="${d.id}" type="button">
      表${i + 1} · ${esc(d.name)} <span class="tab-count">${fmtInt(d.rowCount)}</span>
    </button>`).join('');
  $$('#tableTabs [data-ds]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Tabs.dataset = btn.dataset.ds;
      renderTabs();
      load();
      history.replaceState(null, '', `tables.html?dataset=${Tabs.dataset}`);
    });
  });
}

async function load() {
  try {
    Tabs.data = await api(`/api/tables?dataset=${encodeURIComponent(Tabs.dataset)}`);
    renderSheet();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function renderSheet() {
  const d = Tabs.data;
  if (!d) return;
  const theme = TONE_THEME[d.dataset.tone] || 'blue';
  const metrics = d.metrics || [];
  const primary = metrics[0] || { key: 'count', name: '数量', format: 'int' };
  const targetMetric = metrics.find((m) => m.type !== 'ratio' && (d.byBase || []).some((b) => b.targets && b.targets[m.key] !== undefined));

  $('#sheetTitle').textContent = d.dataset.name;
  $('#sheetTag').textContent = d.dataset.category || '';
  $('#sheetTitlebar').className = `sheet-titlebar theme-${theme}`;
  $('#sheetNote').textContent = d.dataset.caliber || '按各底表字段直接汇总';
  $('#pageSubtitle').textContent = `${d.dataset.name} · 按基地汇总各项指标，点击行可查看明细名单`;
  $('#updatedAt').textContent = `${d.dataset.name} · 更新 ${d.dataset.updatedAt || '—'}`;

  const head = `<tr>
    <th class="cell-left theme-${theme}">基地</th>
    ${metrics.map((m) => `<th class="theme-${theme}">${esc(m.name)}</th>`).join('')}
    ${targetMetric ? `<th class="theme-${theme}">目标 · ${esc(targetMetric.name)}</th><th class="theme-${theme}">达成率</th>` : ''}
  </tr>`;

  const body = (d.byBase || []).map((b, i) => {
    const t = targetMetric ? (b.targets || {})[targetMetric.key] : null;
    const val = targetMetric ? (b.metrics[targetMetric.key] || 0) : 0;
    const rate = t ? val / t : null;
    return `<tr data-base="${esc(b.id)}" style="cursor:pointer">
      <td class="cell-left" style="text-align:left"><span style="display:inline-flex;align-items:center;gap:6px"><i style="width:7px;height:7px;border-radius:2px;background:${b.color}"></i>${esc(b.name)}</span></td>
      ${metrics.map((m) => `<td class="num">${fmt(b.metrics[m.key] || 0, m.format, m.unit)}</td>`).join('')}
      ${targetMetric ? `<td class="num">${t ? fmtCompact(t, targetMetric.format) : '<span class="empty-cell">—</span>'}</td>
      <td class="num">${rate === null ? '<span class="empty-cell">—</span>' : `<b style="color:${rate >= 1 ? '#047857' : rate >= 0.85 ? '#b45309' : '#b91c1c'}">${(rate * 100).toFixed(0)}%</b>`}</td>` : ''}
    </tr>`;
  }).join('');

  // 合计行
  const totals = {};
  metrics.forEach((m) => {
    if (m.type === 'ratio') {
      const nums = metrics.filter((x) => x.type !== 'ratio' && m.formula && m.formula.includes(x.key));
      totals[m.key] = null;
    } else {
      totals[m.key] = (d.byBase || []).reduce((s, b) => s + (b.metrics[m.key] || 0), 0);
    }
  });
  const sumRow = `<tr style="background:#f8fafc;font-weight:600">
    <td class="cell-left" style="text-align:left">合计</td>
    ${metrics.map((m) => `<td class="num">${totals[m.key] === null ? '—' : fmtCompact(totals[m.key], m.format)}</td>`).join('')}
    ${targetMetric ? '<td class="num">—</td><td class="num">—</td>' : ''}
  </tr>`;

  $('#sheetHead').innerHTML = head;
  $('#sheetBody').innerHTML = body
    ? body + sumRow
    : `<tr><td colspan="${metrics.length + 3}"><div class="rank-empty">暂无数据</div></td></tr>`;
  $('#sheetFoot').textContent = `共 ${(d.byBase || []).length} 个基地 · ${fmtInt(d.total)} 行底表记录参与计算${d.unmatched ? ` · ${fmtInt(d.unmatched)} 行未匹配架构` : ''}`;

  $$('#sheetBody [data-base]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const p = new URLSearchParams({ dataset: Tabs.dataset });
      if (tr.dataset.base) p.set('base', tr.dataset.base);
      location.href = `records.html?${p.toString()}`;
    });
  });
}

tablesBoot();

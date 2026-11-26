'use strict';

/* =========================================================================
   前台总览页
   - 基地账号：只看到本基地数据；标「全国」的指标展示全体基地口径
   - 管理员：可看全部基地，含后台入口
   ========================================================================= */

const Index = { user: null, bases: [], managers: [], datasets: [], board: null };

async function indexBoot() {
  let b;
  try {
    b = await api('/api/bootstrap');
  } catch (err) {
    location.href = '/login';
    return;
  }
  Object.assign(Index, { user: b.user, bases: b.bases, managers: b.managers, datasets: b.datasets });
  const settings = b.settings || {};
  const isBase = b.user.role === 'base';
  const base = Index.bases.find((x) => x.id === b.user.baseId);

  document.title = `${settings.title || '转介绍数据看板'}${isBase ? ` · ${base ? base.name : ''}` : ''}`;
  $('#brandName').textContent = settings.title || '转介绍数据看板';
  $('#brandSub').textContent = settings.subtitle || '基地经营';
  $('#pageTitle').textContent = isBase ? `${base ? base.name : '基地'} · 转介绍总览` : '转介绍总览';
  $('#pageSubtitle').textContent = isBase
    ? `${settings.subtitle || '基地经营 · 转介绍名单与转化'} · 标注「全国」的指标为全体基地口径`
    : (settings.subtitle || '基地经营 · 转介绍名单与转化');
  $('#viewerChip').textContent = `${b.user.name} · ${isBase ? (base ? base.name : '基地查看') : '全部基地'}`;
  $('#updatedAt').textContent = `数据更新 ${(b.overview && b.overview.lastUpdate) || (b.datasets[0] || {}).updatedAt || '—'}`;
  const ver = (b.versions || []).find((v) => v.id === b.activeVersionId);
  $('#versionChip').textContent = ver ? `版本 ${ver.label}` : '未发布版本';

  if (settings.announcement) {
    $('#announcement').classList.remove('hidden');
    $('#announcementText').textContent = settings.announcement;
  }
  if (settings.dataNote) $('#dataNote').textContent = settings.dataNote;
  if (!isBase) $('#adminLink').classList.remove('hidden');

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = '/login';
  });

  Index.board = createBoard($('#boardHost'), {
    user: b.user,
    bases: b.bases,
    managers: b.managers,
    datasets: b.datasets,
    settings,
    showBaseFilter: !isBase,
    fixedBaseId: isBase ? b.user.baseId : 'all',
    onFilterChange: (data) => renderCaliber(data.dataset)
  });
}

function renderCaliber(ds) {
  const isBase = Index.user.role === 'base';
  $('#caliberText').innerHTML = `
    <b>数据口径</b>：${esc(ds.caliber || '按各底表字段直接汇总')}
    ${isBase ? '<br><span class="muted">标「全国」的指标（如转化率）展示全体基地口径，其余指标仅统计本基地；目标达成按本基地目标计算。姓名与手机号在前台已脱敏。</span>' : '<span class="muted">姓名与手机号在前台已脱敏。</span>'}`;
  $('#footFixed').textContent = `当前数据源：${ds.name} · 共 ${fmtInt(ds.rowCount)} 行底表记录 · 前台只读，数据更新请进入后台`;
}

indexBoot();

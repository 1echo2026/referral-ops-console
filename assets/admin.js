'use strict';

/* =========================================================================
   运营中台 · 后台逻辑
   ========================================================================= */

const App = {
  user: null,
  bases: [],
  managers: [],
  datasets: [],
  accounts: [],
  audits: [],
  overview: null,
  targetPeriods: [],
  settings: null,
  versions: [],
  activeVersionId: '',
  view: 'datasets',
  upload: null
};

const VIEW_META = {
  datasets: { title: '数据底表', sub: '每类看板数据的上传入口，以及上传后如何取数的逻辑配置', icon: 'database' },
  records: { title: '数据管理', sub: '单条名单的新增、编辑与删除；修改后看板即时重算', icon: 'list' },
  feishu: { title: '飞书同步', sub: '从飞书多维表格拉取底表数据；配置凭据并绑定数据表后一键同步', icon: 'cloud' },
  org: { title: '销售架构', sub: '按工号匹配最新管理架构，底表数据才能落到高经 / 团队维度', icon: 'users' },
  tutor: { title: '辅导架构', sub: '辅导老师归属关系管理，按基地 / 主管 / 层级 / 在职状态筛选查看', icon: 'users' },
  targets: { title: '业绩目标', sub: '高经团队目标与经理团队目标上传维护，用于直推业绩完成度计算', icon: 'target' },
  gjteam: { title: '高经归属', sub: '高经团队业绩的经理勾选映射与经理列 null 归属规则维护，调整后前台「高经团队」视图即时生效', icon: 'users' },
  frontoverview: { title: '总览', sub: '与前台一致的经营总览（随底表数据实时更新），管理员视角查看全部基地', icon: 'eye' },
  frontdata: { title: '明细数据', sub: '与前台明细数据页一致，管理员额外可见业绩榜单与接leads已转化明细等全部页签', icon: 'list' },
  settings: { title: '展示配置', sub: '前台标题、公告、KPI 与明细列开关，保存后立即生效', icon: 'sliders' },
  accounts: { title: '账号与权限', sub: '管理员维护数据与账号，基地账号只能查看本基地看板；含基地管理', icon: 'shield' },
  audit: { title: '操作日志', sub: '版本管理与切换、底表状态、操作留痕', icon: 'history' }
};

/* 旧视图 hash -> 新视图 兼容跳转 */
const HASH_FALLBACK = { overview: 'datasets', analytics: 'datasets', bases: 'accounts', versions: 'audit' };

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  $$('.nav-item[data-icon]').forEach((n) => n.insertAdjacentHTML('afterbegin', icon(n.dataset.icon, 16)));
  $$('.nav-item[data-view]').forEach((n) => {
    n.addEventListener('click', () => go(n.dataset.view));
  });
  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = 'login.html';
  });

  try {
    const b = await api('/api/bootstrap');
    Object.assign(App, {
      user: b.user, bases: b.bases, managers: b.managers, datasets: b.datasets,
      accounts: b.accounts, audits: b.audits, overview: b.overview, targetPeriods: b.targetPeriods,
      settings: b.settings, versions: b.versions || [], activeVersionId: b.activeVersionId || ''
    });
  } catch (err) {
    if (err.status === 401) { location.href = 'login.html'; return; }
    $('#globalError').classList.remove('hidden');
    $('#globalError').innerHTML = `${icon('alert', 15)}<div>${esc(err.message)}</div>`;
    return;
  }

  $('#userName').textContent = App.user.name;
  $('#userRole').textContent = `${App.roleLabel()} · ${App.user.username}`;
  $('#userAvatar').textContent = App.user.name.slice(0, 1);
  $('#dsCount').textContent = App.datasets.length;

  if (App.user.role !== 'admin') {
    location.replace('/');
    return;
  }

  const hash = (location.hash || '').replace('#', '');
  go(VIEW_META[hash] ? hash : (HASH_FALLBACK[hash] || 'datasets'));
}

App.roleLabel = () => (App.user.role === 'admin' ? '超级管理员' : '基地查看');

function go(view) {
  if (!VIEW_META[view]) view = HASH_FALLBACK[view] || 'datasets';
  App.view = view;
  $$('.nav-item[data-view]').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  $$('.view').forEach((v) => v.classList.add('hidden'));
  const target = $(`#view-${view}`);
  if (target) target.classList.remove('hidden');
  const meta = VIEW_META[view];
  $('#pageTitle').textContent = meta.title;
  $('#pageSub').textContent = meta.sub;
  $('#topActions').innerHTML = '';
  history.replaceState(null, '', `#${view}`);

  const render = {
    datasets: renderDatasets,
    records: renderRecords,
    feishu: renderFeishu,
    org: renderOrg,
    tutor: renderTutor,
    targets: renderTargets,
    gjteam: renderGjteamView,
    frontoverview: () => renderFrontEmbed('frontoverview', 'index.html'),
    frontdata: () => renderFrontEmbed('frontdata', 'records.html'),
    settings: renderSettings,
    accounts: renderAccounts,
    audit: renderAudit
  }[view];
  if (render) render();
}

function toneBadge(tone) {
  return { blue: 'blue', violet: 'violet', green: 'green', amber: 'amber' }[tone] || '';
}

/* ---------------------------------------------------------------- 前台视图嵌入（总览 / 明细数据） */
/** 懒加载嵌入前台页面；同域同登录态，管理员打开即为管理员视角（含业绩榜单、接leads已转化明细等页签）。
 *  iframe 一经创建即保留，切换视图仅隐藏，回来不重新加载。 */
function renderFrontEmbed(view, src) {
  const host = $(`#view-${view}`);
  if (!host || host.dataset.loaded) return;
  host.innerHTML = `<iframe class="front-embed" src="${src}" title="${VIEW_META[view].title}"></iframe>`;
  host.dataset.loaded = '1';
}

/* ---------------------------------------------------------------- 数据底表 */
/** 固定上传窗口覆盖的底表（不再出现在「更多底表」区）；质检台账已从展示中下线（数据保留，链路不受影响） */
const FIXED_WINDOW_IDS = ['ds_youshu', 'ds_qc', 'ds_direct', 'ds_high', 'ds_diamond', 'ds_deal'];

function renderDatasets() {
  $('#topActions').innerHTML = `
    <button class="btn btn-sm" id="dlTemplate" type="button">${icon('download', 14)}下载底表模板</button>
    <button class="btn" id="addDs" type="button">${icon('plus', 15)}新增底表</button>
    <button class="btn btn-primary" id="uploadAny" type="button">${icon('upload', 15)}上传底表</button>`;

  const deal = App.datasets.find((d) => d.id === 'ds_deal') || {};
  const segs = deal.segments || {};
  const dsById = {};
  App.datasets.forEach((d) => { dsById[d.id] = d; });
  const dsStat = (id) => {
    const d = dsById[id];
    if (!d) return '<span>底表未就绪</span>';
    return `<span>底表 <b>${fmtInt(d.rowCount || 0)}</b> 行</span><span>更新 <b>${esc((d.updatedAt || '—').slice(5))}</b></span>`;
  };
  const segStat = (st) => (st
    ? `<span>已写入 <b>${fmtInt(st.rows)}</b> 行</span><span>更新 <b>${esc((st.at || '—').slice(5))}</b></span>`
    : '<span>未上传</span>');
  const winCard = (no, tone, ic, title, desc, stat, actions, badge) => `
    <article class="ds-card" data-tone="${tone}">
      <div class="ds-top">
        <div class="ds-ic">${icon(ic, 17)}</div>
        <div class="grow">
          <div class="ds-name"><span class="badge plain">窗口 ${no}</span> ${esc(title)} ${badge || ''}</div>
          <div class="ds-desc">${esc(desc)}</div>
        </div>
      </div>
      <div class="ds-meta">
        ${stat}
        <div class="ds-actions">${actions}</div>
      </div>
    </article>`;
  const upBtn = (wds) => `<button class="btn btn-sm" data-wact="upload" data-wds="${wds}" type="button">${icon('upload', 12)}上传</button>`;
  const logicBtn = (wds) => `<button class="btn btn-sm btn-soft" data-wact="logic" data-wds="${wds}" type="button">${icon('sliders', 12)}取数逻辑</button>`;
  const segUp = (seg) => `<button class="btn btn-sm" data-wact="seg" data-wseg="${seg}" type="button">${icon('upload', 12)}上传</button>`;
  const refBadge = '<span class="ds-ref-badge">引用</span>';

  $('#view-datasets').innerHTML = `
    <div class="alert">
      ${icon('info', 15)}
      <div><b>7 个上传窗口</b>按用途分为三个板块：<b>业绩</b>（有数业绩完成度 / leads分配表 / 哥伦布订单池 / 月目标表）→ 一线直推业绩排名 / 团队完成度 / 完成度榜 D-E；<b>转化表</b>（接leads转化 / 直推转化）→ 接例子链路与直推未转化；<b>koc 与钻石发放明细</b> → KOC 三类分层 / 钻石未使用名单。同一底表可在多个板块引用（标记「引用」），数据仍是同一份，上传互不影响。</div>
    </div>

    <section class="ds-section blue">
      <div class="ds-sec-head"><span class="ds-sec-dot"></span><span class="ds-sec-title">业绩</span><span class="ds-sec-sub">4 个窗口 · 一线直推业绩排名 / 团队完成度 / 龙珠奖 / 榜 D-E</span></div>
      <div class="ds-grid">
        ${winCard(1, 'green', 'wallet', '有数业绩完成度', '按「工号」数透转化金额，保留基地/姓名/工号 → 一线直推业绩表（工号、基地、直推业绩、当月名次）', dsStat('ds_youshu'), upBtn('ds_youshu') + logicBtn('ds_youshu'))}
        ${winCard(2, 'blue', 'userPlus', 'leads分配表（剔除无效与私发）', '有效例子 = 分配表剔除无效 / 不分配（手动上传剔除规则）· 接例子链路左表', segStat(segs.leads), segUp('leads') + logicBtn('ds_deal'))}
        ${winCard(3, 'blue', 'database', '哥伦布订单池', '订单明细（用户ID / CCid / 转化金额 / 订单状态）· 按用户ID数透后与 leads 左连接判转化', segStat(segs.orders), segUp('orders') + logicBtn('ds_deal'))}
        ${winCard(4, 'amber', 'wallet', '月目标表', '两个目标上传窗口（沿用现有方式）：高经团队目标 / 经理团队目标 · 用于直推完成度与龙珠奖榜 D/E',
        `<span>高经目标 <b>${segs.targetDirectGj ? fmtInt(segs.targetDirectGj.rows) : 0}</b> 行 · 经理目标 <b>${segs.targetDirectJl ? fmtInt(segs.targetDirectJl.rows) : 0}</b> 行</span>`,
        `<button class="btn btn-sm" data-wact="tgt" data-wseg="targetDirectGj" type="button">${icon('upload', 12)}高经团队目标</button>
         <button class="btn btn-sm" data-wact="tgt" data-wseg="targetDirectJl" type="button">${icon('upload', 12)}经理团队目标</button>`)}
      </div>
    </section>

    <section class="ds-section amber">
      <div class="ds-sec-head"><span class="ds-sec-dot"></span><span class="ds-sec-title">转化表</span><span class="ds-sec-sub">2 个小板块 · 接leads转化 / 直推转化</span></div>
      <div class="ds-subgrid">
        <div class="ds-subgroup">
          <div class="ds-sub-title">接leads转化</div>
          ${winCard(2, 'blue', 'userPlus', 'leads分配表（剔除无效与私发）', '有效例子 = 分配表剔除无效 / 不分配 · 接例子链路左表', segStat(segs.leads), segUp('leads') + logicBtn('ds_deal'), refBadge)}
          ${winCard(3, 'blue', 'database', '哥伦布订单池', '订单明细按用户ID数透后与 leads 左连接判转化', segStat(segs.orders), segUp('orders') + logicBtn('ds_deal'), refBadge)}
        </div>
        <div class="ds-subgroup">
          <div class="ds-sub-title">直推转化</div>
          ${winCard(5, 'violet', 'userPlus', '直推转化明细', '直推链路 a-b-c 绑定关系与转化金额 · 直推转化明细 / 龙珠奖净营收底表', dsStat('ds_direct'), upBtn('ds_direct') + logicBtn('ds_direct'))}
        </div>
      </div>
    </section>

    <section class="ds-section red">
      <div class="ds-sec-head"><span class="ds-sec-dot"></span><span class="ds-sec-title">koc 与钻石发放明细</span><span class="ds-sec-sub">2 个小板块 · koc / 钻石发放明细</span></div>
      <div class="ds-subgrid">
        <div class="ds-subgroup">
          <div class="ds-sub-title">koc</div>
          ${winCard(6, 'violet', 'spark', '高潜名单', '沿用目前上传形式（历史累计 + 26年两段）· KOC 三类分层与高潜总池', dsStat('ds_high'), upBtn('ds_high') + logicBtn('ds_high'))}
        </div>
        <div class="ds-subgroup">
          <div class="ds-sub-title">钻石发放明细</div>
          ${winCard(7, 'violet', 'spark', '钻石发放与使用明细', '钻石发放与消耗流水 · 匹配已转化老用户 → 未使用名单（解冻：正价课满 30 天未退）', dsStat('ds_diamond'), upBtn('ds_diamond') + logicBtn('ds_diamond'))}
          ${winCard(6, 'violet', 'spark', '高潜名单', 'KOC 三类分层与高潜总池（与 koc 板块同一份数据）', dsStat('ds_high'), upBtn('ds_high') + logicBtn('ds_high'), refBadge)}
        </div>
      </div>
    </section>

    <section class="card mt-16">
      <div class="card-head">
        <div><h2><span class="head-icon">${icon('database', 14)}</span>更多底表</h2>
          <p class="sub">自定义底表可增加删减：新增后上传数据、配置取数逻辑，看板即按新口径重算</p></div>
      </div>
      <div class="ds-grid" id="moreGrid" style="margin-top:12px">
        ${App.datasets.filter((d) => !FIXED_WINDOW_IDS.includes(d.id)).map((d) => `
          <article class="ds-card" data-tone="${d.tone}" data-ds="${d.id}">
            <div class="ds-top">
              <div class="ds-ic">${icon(dsIcon(d.icon), 17)}</div>
              <div class="grow">
                <div class="ds-name">${esc(d.name)} <span class="badge plain">${esc(d.category)}</span></div>
                <div class="ds-desc">${esc(d.desc)}</div>
              </div>
            </div>
            <div class="ds-meta">
              <span>底表 <b>${fmtInt(d.rowCount)}</b> 行</span>
              <span>指标 <b>${(d.metrics || []).length}</b> 个</span>
              <span>更新 <b>${esc((d.updatedAt || '—').slice(5))}</b></span>
              <div class="ds-actions">
                <button class="btn btn-sm" data-act="upload" data-ds="${d.id}" type="button">${icon('upload', 12)}上传</button>
                <button class="btn btn-sm btn-soft" data-act="logic" data-ds="${d.id}" type="button">${icon('sliders', 12)}取数逻辑</button>
                <button class="btn btn-sm btn-danger" data-act="delete" data-ds="${d.id}" type="button">${icon('trash', 12)}删除</button>
              </div>
            </div>
          </article>`).join('') || '<div class="text-xs muted" style="padding:8px 2px">暂无自定义底表，点右上角「新增底表」创建</div>'}
      </div>
    </section>

    <section class="card mt-16">
      <div class="card-head">
        <div><h2><span class="head-icon green">${icon('file', 14)}</span>底表上传记录</h2>
          <p class="sub">每类底表保留最近 12 次上传历史，便于回溯版本</p></div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>数据类别</th><th>文件</th><th class="num">行数</th><th>方式</th><th>上传人</th><th>时间</th></tr></thead>
          <tbody>
            ${App.datasets.flatMap((d) => (d.history || []).slice(0, 3).map((h) => `
              <tr>
                <td><span class="badge ${toneBadge(d.tone)}">${esc(d.name)}</span></td>
                <td class="strong">${esc(h.file || '—')}</td>
                <td class="num">${fmtInt(h.rows)}</td>
                <td><span class="badge plain">${h.mode === 'append' ? '追加' : '替换'}</span></td>
                <td>${esc(h.by || '—')}</td>
                <td class="muted nowrap">${esc(h.at || '—')}</td>
              </tr>`)).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  $$('#view-datasets [data-wact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.wact;
      if (act === 'seg') return openSegUpload(btn.dataset.wseg);
      if (act === 'tgt') return openPerfTargetUpload(btn.dataset.wseg);
      openDataset(btn.dataset.wds, act === 'logic' ? 'logic' : 'upload');
    });
  });
  $$('#moreGrid .ds-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      openDataset(card.dataset.ds, 'upload');
    });
  });
  $$('#moreGrid [data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ds = App.datasets.find((d) => d.id === btn.dataset.ds);
      if (btn.dataset.act === 'delete') return deleteDataset(ds);
      openDataset(btn.dataset.ds, btn.dataset.act === 'logic' ? 'logic' : 'upload');
    });
  });
  $('#dlTemplate').addEventListener('click', () => openDatasetPicker('template'));
  $('#uploadAny').addEventListener('click', () => openDatasetPicker('upload'));
  $('#addDs').addEventListener('click', openDatasetWizard);
}

/** 固定窗口 3/4：leads分配表 / 哥伦布订单池 段独立上传弹窗（复用业绩段映射流程） */
function openSegUpload(seg) {
  const ds = App.datasets.find((d) => d.id === 'ds_deal');
  if (!ds) return;
  const segNames = { leads: 'leads分配表（剔除无效与私发）', orders: '哥伦布订单池' };
  const box = openModal({
    title: `上传${segNames[seg] || seg}`,
    subtitle: '字段映射自动识别，识别不到可手动指定列或统一指定起止时间 · 写入时替换该段数据',
    wide: true,
    body: `<div id="segUpBody">
      <div class="dropzone koc-dz" id="segDz">
        <div class="dz-ic">${icon('upload', 17)}</div>
        <h3>点击选择文件，或拖拽到此处</h3>
        <p>XLSX / XLS / CSV · 单次不超过 200,000 行</p>
      </div>
      <input type="file" id="segFile" class="hidden" accept=".xlsx,.xls,.csv">
    </div>`
  });
  const bodyEl = box.querySelector('#segUpBody');
  const dz = box.querySelector('#segDz');
  const input = box.querySelector('#segFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleKocFile(ds, bodyEl, e.dataTransfer.files[0], seg, dz);
  });
  input.addEventListener('change', () => { if (input.files[0]) handleKocFile(ds, bodyEl, input.files[0], seg, dz); });
}

/** 删除底表（连带清理数据行、KPI 开关与飞书绑定） */
async function deleteDataset(ds) {
  if (!ds) return;
  const ok = confirm(`确认删除底表「${ds.name}」？\n\n将同时清理 ${fmtInt(ds.rowCount || 0)} 行数据、前台 KPI 开关与飞书绑定，操作不可恢复。\n如需留档，请先到「操作日志」发布版本快照。`);
  if (!ok) return;
  try {
    await api(`/api/admin/datasets/${ds.id}`, { method: 'DELETE' });
    toast('底表已删除', 'ok');
    await refreshBootstrap();
    renderDatasets();
  } catch (err) { toast(err.message, 'err'); }
}

/** 新增底表向导：阶段一基本信息 → 阶段二复用上传向导写数据 */
function openDatasetWizard() {
  const icons = ['user-plus', 'spark', 'wallet', 'phone', 'database'];
  const tones = ['blue', 'violet', 'green', 'amber'];
  const cats = ['线索类', '业绩类', '过程类', '其他'];
  const box = openModal({
    title: '新增底表',
    subtitle: '创建一类新的看板数据：先填基本信息，再上传数据文件',
    body: `
      <div class="steps">
        <div class="step active"><b>1</b>基本信息</div>
        <div class="step"><b>2</b>上传数据</div>
        <div class="step"><b>3</b>取数逻辑</div>
      </div>
      <div class="form-grid">
        <div class="form-field full"><label>底表模板</label>
          <select class="control" id="nwPreset">
            <option value="">通用底表（日期/基地/工号/姓名/客户/手机号/状态/渠道/金额）</option>
            <option value="highpot">高潜名单汇总（每人一行：老用户ID/新体验/新正价/累计金额/销售·辅导名字/工号/基地/高经/经理/主管/组长）</option>
            <option value="koc">KOC用户高潜名单（历史累计+26年两段上传，自动分层/标重合）</option>
          </select></div>
        <div class="form-field"><label>底表名称 *</label><input class="control" id="nwName" maxlength="24" placeholder="如：老学员激活明细表"></div>
        <div class="form-field"><label>数据类别</label>
          <select class="control" id="nwCat">${cats.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
        <div class="form-field"><label>图标</label>
          <select class="control" id="nwIcon">${icons.map((i) => `<option value="${i}">${i}</option>`).join('')}</select></div>
        <div class="form-field"><label>主题色</label>
          <select class="control" id="nwTone">${tones.map((t) => `<option value="${t}">${t}</option>`).join('')}</select></div>
        <div class="form-field full"><label>描述</label><input class="control" id="nwDesc" maxlength="60" placeholder="一句话说明这张底表的用途"></div>
        <div class="form-field full"><label>口径说明（选填）</label><textarea class="control" id="nwCaliber" rows="2" placeholder="如：仅统计 XX 状态的记录；创建后可在取数逻辑中修改"></textarea></div>
      </div>
      <div class="alert mt-12">${icon('info', 15)}
        <div id="nwHint">标准字段使用默认集（日期 / 基地 / 工号 / 姓名 / 客户姓名 / 手机号 / 跟进状态 / 渠道 / 金额），指标默认只生成「记录数」。上传数据后请到「取数逻辑」完善字段映射与指标口径。</div>
      </div>`,
    footer: `<button class="btn" id="nwCancel" type="button">取消</button><button class="btn" id="nwCreateOnly" type="button">仅创建</button><button class="btn btn-primary" id="nwCreate" type="button">创建并上传数据</button>`
  });

  // 选择模板：自动带出名称/类别/描述与字段说明，减少手填
  box.querySelector('#nwPreset').addEventListener('change', (e) => {
    const preset = e.target.value;
    const hint = box.querySelector('#nwHint');
    if (preset === 'highpot') {
      const nameEl = box.querySelector('#nwName');
      if (!nameEl.value.trim()) nameEl.value = '高潜名单汇总';
      box.querySelector('#nwCat').value = '业绩类';
      box.querySelector('#nwIcon').value = 'spark';
      box.querySelector('#nwTone').value = 'violet';
      const descEl = box.querySelector('#nwDesc');
      if (!descEl.value.trim()) descEl.value = '每人一行的高潜客户汇总：新体验/新正价用户数量与累计金额';
      hint.innerHTML = '高潜名单模板标准字段与底表文件列一一对应：老用户ID / 新体验用户数量 / 新正价用户数量 / 累计金额 / 销售·辅导名字* / 工号* / 基地* / 高经 / 经理 / 主管 / 组长（无日期字段，系统按工号匹配最新销售架构）。指标默认生成「记录数 + 新体验/新正价/累计金额求和」，上传时按列头自动映射。';
    } else if (preset === 'koc') {
      const nameEl = box.querySelector('#nwName');
      if (!nameEl.value.trim()) nameEl.value = 'KOC用户高潜名单';
      box.querySelector('#nwCat').value = '线索类';
      box.querySelector('#nwIcon').value = 'spark';
      box.querySelector('#nwTone').value = 'violet';
      const descEl = box.querySelector('#nwDesc');
      if (!descEl.value.trim()) descEl.value = '历史累计与26年转介绍两段上传，自动分层并标记重合';
      const calEl = box.querySelector('#nwCaliber');
      if (!calEl.value.trim()) calEl.value = '历史≥6：累计新正价≥6；历史3-6：3≤累计新正价<6；26年推荐成功：26年新正价>0 且未进入历史名单；重合：历史≥3 且 26年>0';
      hint.innerHTML = 'KOC 名单口径：<b>先上传「① 历史累计表」</b>（有数导出 · 转介绍时间=全部时间，替换全表），<b>再上传「② 26年本年表」</b>（转介绍时间=本年，系统按工号自动合并为一人一行）。每次上传后自动按 累计/26年新正价用户数量 分层（默认：历史累计≥6 / 历史累计3-6 / 26年推荐成功 / 未入选，阈值与颜色可在后台「展示配置」的 KOC 分层配置区调整，仅管理员可改），并对「历史≥第二阈值 且 26年>0」的人标注重合备注。看板按 KOC层级 展示分布与筛选。';
    } else {
      hint.innerHTML = '标准字段使用默认集（日期 / 基地 / 工号 / 姓名 / 客户姓名 / 手机号 / 跟进状态 / 渠道 / 金额），指标默认只生成「记录数」。上传数据后请到「取数逻辑」完善字段映射与指标口径。';
    }
  });

  const submit = async (withUpload) => {
    const name = box.querySelector('#nwName').value.trim();
    if (!name) { toast('请填写底表名称', 'err'); return null; }
    try {
      const r = await api('/api/admin/datasets', {
        method: 'POST',
        body: {
          name,
          preset: box.querySelector('#nwPreset').value || undefined,
          category: box.querySelector('#nwCat').value,
          icon: box.querySelector('#nwIcon').value,
          tone: box.querySelector('#nwTone').value,
          desc: box.querySelector('#nwDesc').value.trim(),
          caliber: box.querySelector('#nwCaliber').value.trim()
        }
      });
      await refreshBootstrap();
      return App.datasets.find((d) => d.id === r.dataset.id) || r.dataset;
    } catch (err) {
      toast(err.message, 'err');
      return null;
    }
  };

  box.querySelector('#nwCancel').addEventListener('click', closeModal);
  box.querySelector('#nwCreateOnly').addEventListener('click', async () => {
    const ds = await submit(false);
    if (!ds) return;
    closeModal();
    toast(`底表「${ds.name}」已创建，可稍后上传数据`, 'ok');
    renderDatasets();
  });
  box.querySelector('#nwCreate').addEventListener('click', async () => {
    const ds = await submit(true);
    if (!ds) return;
    // 阶段二：openModal 单例替换为上传向导（复用现有 dropzone / 字段映射 / 提交流程）
    openDataset(ds.id, 'upload');
    toast('已创建，请上传数据文件；建议上传后配置取数逻辑', 'ok');
  });
}

/** 选择数据类别（上传 / 下载模板） */
function openDatasetPicker(mode) {
  const body = `
    <div class="alert">${icon('info', 15)}<div>每类底表<b>单独上传、单独配置取数逻辑</b>。以下是各类底表需要的标准列，可直接下载模板填写。</div></div>
    <div style="display:flex;flex-direction:column;gap:9px">
      ${App.datasets.map((d) => `
        <div class="ds-card" data-tone="${d.tone}" style="cursor:default;padding:13px 15px">
          <div class="ds-top">
            <div class="ds-ic">${icon(dsIcon(d.icon), 16)}</div>
            <div class="grow">
              <div class="ds-name" style="font-size:13px">${esc(d.name)} <span class="badge plain">${esc(d.category)}</span></div>
              <div class="ds-cols">${(d.columns || []).map((c) => `<span class="tag-code">${esc(c)}</span>`).join('')}</div>
            </div>
            <div class="ds-actions" style="margin:0;align-self:center">
              <button class="btn btn-sm" data-tpl="${d.id}" type="button">${icon('download', 12)}模板</button>
              <button class="btn btn-sm btn-soft" data-up="${d.id}" type="button">${icon('upload', 12)}上传</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
  const box = openModal({
    title: mode === 'template' ? '底表模板与字段说明' : '选择要上传的数据类别',
    subtitle: '字段名可直接沿用模板列名，上传时会自动匹配',
    body,
    wide: true
  });
  box.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
    const ds = App.datasets.find((d) => d.id === b.dataset.tpl);
    const row = {};
    (ds.standardFields || []).forEach((f) => { row[f.label] = sampleFor(f); });
    downloadCsv(`${ds.name}-导入模板.csv`, [row], (ds.standardFields || []).map((f) => ({ label: f.label, value: f.label })));
    toast('模板已下载', 'ok');
  }));
  box.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
    closeModal();
    openDataset(b.dataset.up, 'upload');
  }));
}

function dsIcon(name) {
  return { 'user-plus': 'userPlus', spark: 'spark', wallet: 'wallet', phone: 'phone' }[name] || 'database';
}

function sampleFor(field) {
  const map = { date: '2026-11-01', base: '武汉基地', empId: 'E1001', empName: '张小雨', customer: '王先生', phone: '13800001234', status: '已转化', channel: '企业微信', amount: '8800' };
  return map[field.key] || '';
}

/* ---------------------------------------------------------------- 数据集详情 */
function openDataset(id, tab = 'upload') {
  const ds = App.datasets.find((d) => d.id === id);
  if (!ds) return;
  App.dsTab = tab;
  App.dsEditingMetric = null;

  const box = openModal({
    title: ds.name,
    subtitle: `${ds.category} · 底表 ${fmtInt(ds.rowCount)} 行 · 最近更新 ${ds.updatedAt || '—'}`,
    wide: true,
    body: `<div class="tabs" id="dsTabs" style="margin:-6px -22px 16px">
        <button class="tab ${tab === 'upload' ? 'active' : ''}" data-tab="upload">底表上传</button>
        <button class="tab ${tab === 'logic' ? 'active' : ''}" data-tab="logic">字段映射与取数逻辑</button>
        <button class="tab ${tab === 'preview' ? 'active' : ''}" data-tab="preview">取数预览</button>
      </div>
      <div id="dsTabBody"></div>`
  });

  box.querySelectorAll('[data-tab]').forEach((t) => {
    t.addEventListener('click', () => {
      App.dsTab = t.dataset.tab;
      App.dsEditingMetric = null;
      box.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === t));
      renderDsTab(ds, box);
    });
  });
  renderDsTab(ds, box);
}

function renderDsTab(ds, box) {
  const body = box.querySelector('#dsTabBody');
  if (App.dsTab === 'upload') return renderUploadTab(ds, body);
  if (App.dsTab === 'logic') return renderLogicTab(ds, body);
  return renderPreviewTab(ds, body);
}

/* ---------------- 上传 tab ---------------- */
function renderUploadTab(ds, body) {
  if (ds.preset === 'koc') return renderKocUploadTab(ds, body);
  if (ds.preset === 'perf') return renderPerfUploadTab(ds, body);
  body.innerHTML = `
    <div class="steps">
      <div class="step active"><b>1</b>上传底表</div>
      <div class="step"><b>2</b>字段映射预览</div>
      <div class="step"><b>3</b>写入并重算</div>
    </div>
    <div class="alert">
      ${icon('info', 15)}
      <div>支持 <b>.xlsx / .xls / .csv</b>。系统会自动尝试按列名匹配标准字段，匹配不上的可在下一步手动指定。<br>
      当前标准列：${(ds.standardFields || []).map((f) => `<span class="tag-code">${esc(f.label)}${f.computed ? '(自动)' : ''}</span>`).join(' ')}</div>
    </div>
    <div class="dropzone" id="dz">
      <div class="dz-ic">${icon('upload', 19)}</div>
      <h3>点击选择文件，或拖拽到此处</h3>
      <p>单次建议不超过 200,000 行 / 40MB；上传后先预览，不会立即覆盖现有数据</p>
      <div class="dz-formats">
        <span class="badge plain">XLSX</span><span class="badge plain">XLS</span><span class="badge plain">CSV</span>
      </div>
    </div>
    <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" class="hidden">
    <div class="flex gap-8 mt-12">
      <button class="btn btn-sm" id="dlTpl" type="button">${icon('download', 13)}下载该类底表模板</button>
      <span class="text-xs muted" style="align-self:center">模板列名可直接对应标准字段</span>
    </div>
  `;

  const dz = body.querySelector('#dz');
  const input = body.querySelector('#fileInput');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag');
    if (e.dataTransfer.files[0]) handleFile(ds, body, e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files[0]) handleFile(ds, body, input.files[0]); });
  body.querySelector('#dlTpl').addEventListener('click', () => {
    const cols = (ds.standardFields || []).map((f) => f.label);
    const row = {};
    (ds.standardFields || []).forEach((f) => { row[f.label] = sampleFor(f); });
    downloadCsv(`${ds.name}-导入模板.csv`, [row], cols.map((c) => ({ label: c, value: c })));
    toast('模板已下载', 'ok');
  });
}

/* ---------------- KOC 双入口上传 ---------------- */
function renderKocUploadTab(ds, body) {
  const segs = ds.segments || {};
  const cards = [
    { seg: 'cum', title: '① 历史累计表', desc: '有数导出 · 转介绍时间=全部时间', modeText: '写入时替换全表并清空26年列' },
    { seg: 'y26', title: '② 26年本年表', desc: '有数导出 · 转介绍时间=本年', modeText: '写入时按工号合并进已有名单' }
  ];
  body.innerHTML = `
    <div class="alert">
      ${icon('info', 15)}
      <div>两张表列名相同也没关系，系统按入口自动区分口径。<b>两个入口都上传后</b>，系统自动按工号合并成一人一行，重算 KOC层级并统计重合数据。</div>
    </div>
    <div class="koc-up-grid">
      ${cards.map((c) => {
        const st = segs[c.seg];
        return `
        <div class="card koc-up-card" style="box-shadow:none">
          <div class="card-head">
            <div><h2>${c.title}</h2><p class="sub">${c.desc} · ${c.modeText}</p></div>
            <span class="pill ${st ? 'ok' : 'muted'}">${st ? '已写入 ' + fmtInt(st.rows) + ' 人' : '未上传'}</span>
          </div>
          ${st ? `<p class="text-xs muted" style="margin:-6px 0 8px">${esc(st.file || '')} · ${esc(st.at || '')}</p>` : ''}
          <div class="dropzone koc-dz" data-seg="${c.seg}">
            <div class="dz-ic">${icon(st ? 'refresh' : 'upload', 17)}</div>
            <h3>${st ? '重新上传覆盖' : '点击选择文件，或拖拽到此处'}</h3>
            <p>XLSX / XLS / CSV · 单次不超过 200,000 行</p>
          </div>
          <input type="file" class="hidden" data-file="${c.seg}" accept=".xlsx,.xls,.csv">
        </div>`;
      }).join('')}
    </div>
    <div id="kocStats"></div>
    <div class="flex gap-8 mt-12">
      <button class="btn btn-sm" id="dlTpl" type="button">${icon('download', 13)}下载导入模板</button>
      <span class="text-xs muted" style="align-self:center">两张表可用同一份模板；KOC层级 / 重合备注 由系统自动计算，无需填写</span>
    </div>
  `;

  cards.forEach((c) => {
    const dz = body.querySelector(`.koc-dz[data-seg="${c.seg}"]`);
    const input = body.querySelector(`[data-file="${c.seg}"]`);
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      if (e.dataTransfer.files[0]) handleKocFile(ds, body, e.dataTransfer.files[0], c.seg, dz);
    });
    input.addEventListener('change', () => { if (input.files[0]) handleKocFile(ds, body, input.files[0], c.seg, dz); });
  });
  body.querySelector('#dlTpl').addEventListener('click', () => {
    const cols = (ds.standardFields || []).map((f) => f.label);
    const row = {};
    (ds.standardFields || []).forEach((f) => { row[f.label] = sampleFor(f); });
    downloadCsv(`${ds.name}-导入模板.csv`, [row], cols.map((c2) => ({ label: c2, value: c2 })));
    toast('模板已下载', 'ok');
  });
  renderKocStats(body.querySelector('#kocStats'), ds);
}

async function handleKocFile(ds, body, file, seg, dz) {
  App.uploadSegment = seg;
  const oldHtml = dz.innerHTML;
  dz.innerHTML = `<div class="dz-ic">${icon('file', 17)}</div><h3>正在解析 ${esc(file.name)} …</h3><p>大文件解析需要几秒</p>`;
  try {
    const expect = (ds.standardFields || []).flatMap((f) => [f.label, ...(f.aliases || [])]);
    const parsed = await parseFile(file, expect);
    if (!parsed.rows.length) throw new Error('文件中没有数据行');
    App.upload = { datasetId: ds.id, file: file.name, ...parsed };
    renderMappingStep(ds, body);
  } catch (err) {
    toast(err.message, 'err');
    dz.innerHTML = oldHtml;
  }
}

async function renderKocStats(el, ds) {
  const segs = ds.segments || {};
  if (!segs.cum) { el.innerHTML = ''; return; }
  if (!segs.y26) {
    el.innerHTML = `<div class="alert mt-14">${icon('info', 15)}<div>① 历史累计表已写入（${fmtInt(segs.cum.rows)} 人）。还差 <b>② 26年本年表</b>，上传后系统自动合并名单并统计重合数据。</div></div>`;
    return;
  }
  el.innerHTML = '<p class="text-xs muted mt-16">正在统计重合数据…</p>';
  try {
    const j = await api(`/api/admin/datasets/${ds.id}/preview`, { method: 'POST', body: {} });
    const t = j.total || {};
    const cell = (label, v) => `<div class="koc-stat"><b>${fmtInt(v || 0)}</b><span>${label}</span></div>`;
    el.innerHTML = `
      <div class="card" style="box-shadow:none;margin-top:14px">
        <div class="card-head"><div><h2>重合统计（两张表均已上传）</h2>
        <p class="sub">重合 = 历史名单（累计新正价≥3）与 26年推荐成功（26年新正价>0）同时命中</p></div></div>
        <div class="koc-stats">
          ${cell('名单总人数', t.list)}
          ${cell('历史累计≥6', t.tierA)}
          ${cell('历史累计3-6', t.tierB)}
          ${cell('26年推荐成功', t.tierC)}
          ${cell('重合人数', t.overlap)}
          ${cell('累计新正价合计', t.cumPay)}
          ${cell('26年新正价合计', t.y26Pay)}
        </div>
        <p class="text-xs muted mt-8">名单写入成功。重合明细可在「数据明细」按 重合备注 查看；看板已按最新名单重算 KOC层级。</p>
      </div>`;
  } catch (e) {
    el.innerHTML = '';
  }
}

/* ---------------- 业绩五段上传（接例子 / 直推 / 订单池 / 直推目标 / 接例子目标） ---------------- */
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

function renderPerfUploadTab(ds, body) {
  const segs = ds.segments || {};
  const cards = [
    { seg: 'leads', title: '① 销售接例子数据', desc: '来源：转介绍leads分配表', modeText: '写入时替换该段数据' },
    { seg: 'direct', title: '② 销售直推数据', desc: '来源：有数-转介绍业绩完成度', modeText: '写入时替换该段数据' },
    { seg: 'orders', title: '③ 订单池', desc: '订单明细 · 含用户ID / CCid / 转化金额 / 订单状态 / 月份', modeText: '预留上传窗口' }
  ];
  body.innerHTML = `
    <div class="alert">
      ${icon('info', 15)}
      <div>各入口独立上传、互不影响。上传「销售直推数据」与「销售架构」后自动计算<b>一线直推业绩 / 高经·经理直推业绩完成度</b>；「订单池」与「销售接例子数据」齐备后自动计算<b>接例子完成度</b>。<b>直推目标 / 接例子目标</b>已移至 <b>「业绩目标」</b> 页面上传，两个目标齐备后计算<b>业绩完成度与绩效完成度（直推40% + 接例子60%）</b>，结果呈现在前台「业绩排行」。</div>
    </div>
    <div class="koc-up-grid">
      ${cards.map((c) => {
        const st = segs[c.seg];
        return `
        <div class="card koc-up-card" style="box-shadow:none">
          <div class="card-head">
            <div><h2>${c.title}</h2><p class="sub" style="font-size:12px">${c.desc}<br>${c.modeText}</p></div>
            <span class="pill ${st ? 'ok' : 'muted'}">${st ? '已写入 ' + fmtInt(st.rows) + ' 行' : '未上传'}</span>
          </div>
          ${st ? `<p class="text-xs muted" style="margin:-6px 0 8px">${esc(st.file || '')} · ${esc(st.at || '')}</p>` : ''}
          <div class="dropzone koc-dz" data-seg="${c.seg}">
            <div class="dz-ic">${icon(st ? 'refresh' : 'upload', 17)}</div>
            <h3>${st ? '重新上传覆盖' : '点击选择文件，或拖拽到此处'}</h3>
            <p>XLSX / XLS / CSV · 单次不超过 200,000 行</p>
          </div>
          <input type="file" class="hidden" data-file="${c.seg}" accept=".xlsx,.xls,.csv">
        </div>`;
      }).join('')}
    </div>
    <div id="perfStats"></div>
  `;

  cards.forEach((c) => {
    const dz = body.querySelector(`.koc-dz[data-seg="${c.seg}"]`);
    const input = body.querySelector(`[data-file="${c.seg}"]`);
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      if (e.dataTransfer.files[0]) handleKocFile(ds, body, e.dataTransfer.files[0], c.seg, dz);
    });
    input.addEventListener('change', () => { if (input.files[0]) handleKocFile(ds, body, input.files[0], c.seg, dz); });
  });
  const el = body.querySelector('#perfStats');
  const st = ds.segments || {};
  const done = Object.keys(st).length;
  if (done) {
    const names = { leads: '接例子', direct: '直推', orders: '订单池', targetDirectGj: '高经直推目标', targetDirectJl: '经理直推目标', targetLeads: '接例子目标' };
    el.innerHTML = `<div class="alert mt-14" style="border-color:#d1fae5;background:#f0fdf9">
      ${icon('info', 15)}<div>已上传：${Object.keys(st).map((k) => `<b>${names[k] || k}</b> ${fmtInt(st[k].rows)} 行`).join(' · ')}。前台「业绩排行」将根据已上传的段落自动计算对应排名。</div></div>`;
  }
}

async function handleFile(ds, body, file) {
  const dz = body.querySelector('#dz');
  dz.innerHTML = `<div class="dz-ic">${icon('file', 19)}</div><h3>正在解析 ${esc(file.name)} …</h3><p>大文件解析需要几秒</p>`;
  try {
    const expect = (ds.standardFields || []).flatMap((f) => [f.label, ...(f.aliases || [])]);
    const parsed = await parseFile(file, expect);
    if (!parsed.rows.length) throw new Error('文件中没有数据行');
    App.upload = { datasetId: ds.id, file: file.name, ...parsed };
    renderMappingStep(ds, body);
  } catch (err) {
    toast(err.message, 'err');
    renderUploadTab(ds, body);
  }
}

/* SMART-PARSE-BEGIN */
// 智能解析工作簿：扫描所有 sheet，自动定位子表表头行（跳过标题行），合并同名子表
function smartParseWorkbook(wb, expect) {
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const vocab = new Set(expect.map(norm).filter(Boolean));
  if (!vocab.size) return null;
  const scoreRow = (row) => row.reduce((n, c) => n + (vocab.has(norm(c)) ? 1 : 0), 0);
  const blocks = [];
  wb.SheetNames.forEach((name) => {
    let aoa;
    try { aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false, raw: false }); } catch (e) { return; }
    // 前 30 行内找表头匹配度最高的行作为该 sheet 的表头基准（跳过大标题等杂行）
    let best = 0;
    const limit = Math.min(aoa.length, 30);
    for (let i = 0; i < limit; i += 1) best = Math.max(best, scoreRow(aoa[i]));
    if (best < 2) return;
    // 收集该 sheet 内所有匹配基准强度的表头行（支持一个 sheet 里上下堆叠的多个子表）
    let cur = null;
    const flush = () => { if (cur && cur.cells.length) blocks.push(cur); cur = null; };
    aoa.forEach((row) => {
      const s = scoreRow(row);
      if (s >= best) {
        flush();
        const cells = [];
        row.forEach((c, i) => { const h = norm(c); if (h && !cells.some((x) => x.h === h)) cells.push({ h, i, raw: String(c).trim() }); });
        if (cells.length) cur = { sheet: name, cells, rows: [], score: s };
      } else if (cur) {
        const filled = row.filter((c) => String(c == null ? '' : c).trim() !== '').length;
        // 过滤子表之间的杂标题行（非空单元格不足表头数一半的行不算数据）
        if (filled >= Math.max(2, Math.floor(cur.cells.length / 2))) {
          const o = {};
          cur.cells.forEach((x) => { o[x.raw] = row[x.i] === undefined ? '' : String(row[x.i]).trim(); });
          cur.rows.push(o);
        }
      }
    });
    flush();
  });
  if (!blocks.length) return null;
  // 按表头签名分组：优先命中预期字段最多的表头，其次行数最多（多 sheet 同结构子表自动合并）
  const groups = new Map();
  blocks.forEach((b) => {
    const sig = b.cells.map((x) => x.raw).join('¦');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(b);
  });
  let bestGroup = null;
  groups.forEach((list) => {
    const sc = list[0].cells.filter((x) => vocab.has(x.h)).length;
    const rn = list.reduce((n, b) => n + b.rows.length, 0);
    const bsc = bestGroup ? bestGroup[0].cells.filter((x) => vocab.has(x.h)).length : -1;
    const brn = bestGroup ? bestGroup.reduce((n, b) => n + b.rows.length, 0) : -1;
    if (!bestGroup || sc > bsc || (sc === bsc && rn > brn)) bestGroup = list;
  });
  const columns = bestGroup[0].cells.map((x) => x.raw);
  const rows = bestGroup.flatMap((b) => b.rows).filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
  if (!rows.length) return null;
  return { columns, rows, sheet: bestGroup[0].sheet, subTables: bestGroup.length };
}
/* SMART-PARSE-END */

function parseFile(file, expect) {
  return new Promise((resolve, reject) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    if (ext === 'csv' || ext === 'txt') {
      reader.onload = () => {
        const text = String(reader.result || '').replace(/^\ufeff/, '');
        const { headers, rows } = parseCsv(text);
        resolve({ columns: headers, rows: rows.slice(0, 200000) });
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'utf-8');
      return;
    }
    reader.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
        // 优先智能识别：多 sheet / 标题行下方的子表表头 / 同结构子表合并
        const smart = expect && expect.length ? smartParseWorkbook(wb, expect) : null;
        if (smart) return resolve(smart);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: false });
        if (!aoa.length) return resolve({ columns: [], rows: [] });
        const headers = aoa[0].map((h) => String(h).trim());
        const rows = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''))
          .slice(0, 200000)
          .map((r) => {
            const o = {};
            headers.forEach((h, i) => { o[h] = r[i] === undefined ? '' : String(r[i]).trim(); });
            return o;
          });
        resolve({ columns: headers, rows });
      } catch (e) {
        reject(new Error('文件解析失败，请确认为标准 Excel / CSV'));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const headers = (rows.shift() || []).map((h) => h.trim());
  const out = rows.filter((r) => r.some((c) => String(c).trim() !== '')).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] === undefined ? '' : r[i]).trim(); });
    return o;
  });
  return { headers, rows: out };
}

/* ---------------- 映射预览 ---------------- */
const FIELD_ALIASES = {
  date: ['日期', '时间', '跟进日期', '成交日期', '触达日期', '统计日期', 'data'],
  base: ['基地', '基地名称', '所属基地', '城市'],
  empId: ['工号', '员工工号', '员工编号', '顾问工号', 'empId', '工号/编号'],
  empName: ['姓名', '员工姓名', '顾问姓名', '名字', '销售/辅导名字', '销售名字', '辅导名字', '销售'],
  customer: ['客户姓名', '客户', '客户名称'],
  phone: ['手机号', '客户手机号', '手机', '电话', '联系方式'],
  status: ['状态', '跟进状态', '跟进结果', '触达结果', '是否转化', '结果'],
  channel: ['渠道', '来源', '来源渠道', '触达方式'],
  amount: ['金额', '成交金额', '业绩', '订单金额', '累计金额', '总金额'],
  name: ['姓名', '员工姓名'],
  managerId: ['高经工号', '主管工号', '经理工号', '上级工号'],
  managerName: ['高经', '高经姓名', '主管', '经理', '上级'],
  teamName: ['团队', '团队名称', '小组', '所属团队'],
  level: ['层级', '职级', '岗位层级'],
  role: ['岗位', '职位', '角色'],
  effectiveDate: ['生效日期', '生效时间', '开始日期'],
  period: ['期间', '月份', '目标月份', '统计周期'],
  scope: ['范围', '目标层级', '维度'],
  key: ['对象', '基地/高经', '目标对象', '归属'],
  metricName: ['指标', '指标名称', '目标指标'],
  value: ['目标值', '目标', '目标数']
};

function autoMatch(field, columns) {
  const aliases = [field.label, ...(field.aliases || []), ...(FIELD_ALIASES[field.key] || [])].filter(Boolean);
  const low = (s) => String(s).toLowerCase();
  for (const a of aliases) {
    const hit = columns.find((c) => low(c) === low(a));
    if (hit) return hit;
  }
  for (const a of aliases) {
    const hit = columns.find((c) => {
      const lc = low(c);
      const la = low(a);
      // 单字符别名（a/b/c）只做精确匹配，模糊会把 a 配到任意含字母 a 的列
      if (la.length < 2) return false;
      // UID / UUID 类列不参与模糊匹配，避免「转化金额」误配到「业绩归属销售UID」
      if ((lc.includes('uid') || lc.includes('uuid')) && !la.includes('uid')) return false;
      return lc.includes(la) || la.includes(lc);
    });
    if (hit) return hit;
  }
  return '';
}

function renderMappingStep(ds, body) {
  const up = App.upload;
  const isKoc = ds.preset === 'koc';
  const isPerf = ds.preset === 'perf';
  const seg = isKoc ? (App.uploadSegment || 'cum') : isPerf ? (App.uploadSegment || 'direct') : '';
  // KOC：只映射身份列 + 当前口径的数值列；KOC层级/重合备注 为系统自动计算，不参与映射
  // 业绩：按当前入口使用对应的字段定义
  const fieldSource = isPerf ? (PERF_FIELD_DEFS[seg] || []) : ds.standardFields;
  const mapFields = (fieldSource || []).filter((f) => !f.computed && (!isKoc || !f.segment || f.segment === seg));
  // 自动匹配只做一次：已有人工选择（含显式「不映射」）的字段不再覆盖
  const mapping = up.mapping = up.mapping || {};
  mapFields.forEach((f) => { if (!(f.key in mapping)) mapping[f.key] = autoMatch(f, up.columns); });
  // 未映射字段可「统一手动指定」一个值应用到所有行；时间字段支持起止时间（精确到秒）
  const manual = up.manual = up.manual || {};
  mapFields.forEach((f) => { if (mapping[f.key]) { manual[f.key] = ''; delete manual[`${f.key}__to`]; } });
  const manualVal = (key) => (manual[key] ? manual[key] + (manual[`${key}__to`] ? ` ~ ${manual[`${key}__to`]}` : '') : '');

  const requiredMissing = mapFields.filter((f) => f.required && !mapping[f.key] && !(isPerf && manual[f.key]));
  const previewCols = mapFields.filter((f) => mapping[f.key] || (isPerf && manual[f.key]));

  body.innerHTML = `
    <div class="steps">
      <div class="step done"><b>✓</b>上传底表</div>
      <div class="step active"><b>2</b>字段映射预览</div>
      <div class="step"><b>3</b>写入并重算</div>
    </div>
    <div class="upload-summary">
      <span class="pill ok">文件 <b>${esc(up.file)}</b></span>
      <span class="pill">数据行 <b>${fmtInt(up.rows.length)}</b></span>
      <span class="pill">识别列 <b>${up.columns.length}</b></span>
      <span class="pill ${requiredMissing.length ? 'err' : 'ok'}">必填字段 ${requiredMissing.length ? `缺 ${requiredMissing.length} 个` : '已匹配'}</span>
    </div>

    ${requiredMissing.length ? `<div class="alert err">${icon('alert', 15)}<div>以下必填字段没有匹配到列：<b>${requiredMissing.map((f) => f.label).join('、')}</b>，请手动指定后再上传。</div></div>` : ''}

    <div class="card" style="box-shadow:none;margin-bottom:14px">
      <div class="card-head"><div><h2>字段映射</h2><p class="sub">左侧为标准字段，右侧选择底表中对应的列名（可调整，保存后即按此取数）</p></div></div>
      <div class="table-wrap">
        <table class="map-table">
          <thead><tr><th style="width:170px">标准字段</th><th>底表列</th><th style="width:180px">样例值</th></tr></thead>
          <tbody>
            ${mapFields.map((f) => `
              <tr class="${(mapping[f.key] || (isPerf && manual[f.key])) ? '' : 'unmapped'}">
                <td><span class="std-key">${esc(f.label)} ${f.required ? '<span class="req">*</span>' : ''}</span></td>
                <td>
                  <select class="control" data-map="${f.key}">
                    <option value="">— 不映射 —</option>
                    ${up.columns.map((c) => `<option value="${esc(c)}" ${mapping[f.key] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                  </select>
                  ${isPerf && !mapping[f.key] && f.key === 'month' ? `<div style="margin-top:6px;display:flex;gap:6px;align-items:center">
                    <span class="text-xs muted" style="white-space:nowrap">起止时间</span>
                    <input class="control" data-manual-from="${f.key}" type="datetime-local" step="1" value="${esc(manual[f.key] || '')}" placeholder="起始时间" style="flex:1;min-width:150px">
                    <span class="text-xs muted">至</span>
                    <input class="control" data-manual-to="${f.key}" type="datetime-local" step="1" value="${esc(manual[`${f.key}__to`] || '')}" placeholder="结束时间" style="flex:1;min-width:150px">
                  </div>` : isPerf && !mapping[f.key] ? `<input class="control" data-manual="${f.key}" type="text" value="${esc(manual[f.key] || '')}" placeholder="或在此统一指定值，应用到所有行" style="margin-top:6px">` : ''}
                </td>
                <td><div class="sample" data-sample="${f.key}">${esc(mapping[f.key] ? String(up.rows[0][mapping[f.key]] ?? '') : (isPerf && manualVal(f.key) ? `(统一指定) ${manualVal(f.key)}` : '—'))}</div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

      <div class="card" style="box-shadow:none">
        <div class="card-head"><div><h2>数据预览</h2><p class="sub">仅展示映射成功（含统一指定值）的前 8 行</p></div></div>
        <div class="table-wrap" style="max-height:240px">
          <table class="table" id="previewTable">
            <thead><tr>${previewCols.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
            <tbody>${up.rows.slice(0, 8).map((r) => `<tr>${previewCols.map((f) => `<td>${esc(mapping[f.key] ? (r[mapping[f.key]] ?? '') : manualVal(f.key))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

    <div class="form-grid mt-16">
      ${isKoc ? `
      <div class="form-field full">
        <label>写入方式（按口径自动确定）</label>
        <div class="alert">${icon('info', 15)}<div>${seg === 'cum'
          ? '<b>① 历史累计表</b>：写入时<b>替换全表</b>，并清空已有的 26年 列；写入后请再上传 ② 26年本年表。'
          : '<b>② 26年本年表</b>：写入时按 <b>工号（兜底 老用户ID）合并</b>进已有名单，未匹配到的人将作为新行追加；写入后全表自动重算 KOC层级与重合备注。'}</div></div>
      </div>` : isPerf ? `
      <div class="form-field full">
        <label>写入方式（按入口自动确定）</label>
        <div class="alert">${icon('info', 15)}<div>写入时<b>替换该入口</b>的已有数据，其他入口不受影响。</div></div>
      </div>` : `
      <div class="form-field full">
        <label>写入方式</label>
        <div class="radio-cards">
          <label class="radio-card"><input type="radio" name="mode" value="replace" checked><span><b>替换全部</b><span>用本次文件覆盖该类底表</span></span></label>
          <label class="radio-card"><input type="radio" name="mode" value="append"><span><b>追加</b><span>保留历史行，适合按月补数；按「基地+客户+手机号+状态」自动去重</span></span></label>
        </div>
      </div>`}
      <div class="form-field full">
        <label>版本名称（可选）</label>
        <input class="control" id="versionLabel" maxlength="40" placeholder="如：2026年3月快照 — 填写后写入数据的同时发布一个可回滚的版本">
      </div>
    </div>

    <div class="modal-foot">
      <button class="btn" id="cancelMap" type="button">重新选择</button>
      <button class="btn btn-primary" id="commitUpload" type="button" ${requiredMissing.length ? 'disabled' : ''}>写入并重算看板</button>
    </div>
  `;

  body.querySelectorAll('[data-map]').forEach((sel) => {
    sel.addEventListener('change', () => {
      mapping[sel.dataset.map] = sel.value;
      if (sel.value) { manual[sel.dataset.map] = ''; delete manual[`${sel.dataset.map}__to`]; }
      renderMappingStep(ds, body); // 重渲染以同步手动指定输入框 / 样例值 / 预览
    });
  });
  body.querySelectorAll('[data-manual]').forEach((inp) => {
    const apply = () => {
      manual[inp.dataset.manual] = inp.value.trim();
      renderMappingStep(ds, body); // 重渲染以同步样例值 / 预览 / 必填校验
    };
    inp.addEventListener('change', apply);
    if (inp.type === 'text') inp.addEventListener('input', debounce(() => {
      manual[inp.dataset.manual] = inp.value.trim();
      const sample = body.querySelector(`[data-sample="${inp.dataset.manual}"]`);
      if (sample) sample.textContent = manual[inp.dataset.manual] ? `(统一指定) ${manual[inp.dataset.manual]}` : '—';
    }, 300));
  });
  body.querySelectorAll('[data-manual-from], [data-manual-to]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.manualFrom || inp.dataset.manualTo;
      if (inp.dataset.manualFrom) manual[key] = inp.value.trim().replace('T', ' ');
      else manual[`${key}__to`] = inp.value.trim().replace('T', ' ');
      renderMappingStep(ds, body); // 重渲染以同步样例值 / 预览
    });
  });

  body.querySelector('#cancelMap').addEventListener('click', () => renderUploadTab(ds, body));
  body.querySelector('#commitUpload').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const PERF_SEG_NAMES = { leads: '① 销售接例子数据', direct: '② 销售直推数据', orders: '③ 订单池', targetDirectGj: '高经团队直推目标', targetDirectJl: '经理团队直推目标', targetLeads: '⑤ 接例子目标' };
    const mode = isKoc ? (seg === 'y26' ? 'merge' : 'replace') : isPerf ? 'replace' : body.querySelector('input[name="mode"]:checked').value;
    const versionLabel = (body.querySelector('#versionLabel') || {}).value?.trim() || '';
    // 统一手动指定的未映射字段：把常量值写入每一行（服务端按 标准字段label 取列）
    const outRows = isPerf
      ? App.upload.rows.map((r) => {
          const o = { ...r };
          mapFields.forEach((f) => {
            if (mapping[f.key] || !manual[f.key]) return;
            const val = manualVal(f.key);
            if (val) o[f.label] = val;
          });
          return o;
        })
      : App.upload.rows;
    btn.disabled = true;
    btn.textContent = '写入中…';
    try {
      await api(`/api/admin/datasets/${ds.id}/upload`, {
        method: 'POST',
        body: { rows: outRows, fileName: App.upload.file, mapping, mode, segment: (isKoc || isPerf) ? seg : undefined, versionLabel: versionLabel || undefined }
      });
      await refreshBootstrap();
      toast(isKoc
        ? (seg === 'cum' ? '① 历史累计表已写入，请继续在 ② 26年本年表入口上传' : '② 26年本年表已合并，KOC层级与重合备注已重算')
        : isPerf
        ? `${PERF_SEG_NAMES[seg] || seg} 已写入，前台「业绩排行」将按最新数据计算排名`
        : (versionLabel ? '底表已写入，版本「' + versionLabel + '」已发布' : '底表已写入，看板已按新数据重算'), 'ok');
      App.upload = null;
      const fresh = App.datasets.find((d) => d.id === ds.id);
      if (isKoc) {
        renderKocUploadTab(fresh, body);
        return fresh;
      }
      if (isPerf) {
        if (body.id === 'segUpBody') {
          // 从固定上传窗口弹窗进入：写入后关闭弹窗并刷新底表页
          closeModal();
          if (App.view === 'datasets') renderDatasets();
          return fresh;
        }
        renderPerfUploadTab(fresh, body);
        return fresh;
      }
      openDataset(ds.id, 'preview');
      if (App.view === 'datasets') renderDatasets();
      return fresh;
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = '写入并重算看板';
    }
  });
}

/* ---------------- 取数逻辑 tab ---------------- */
function renderLogicTab(ds, body) {
  if (App.dsEditingMetric !== null && App.dsEditingMetric !== undefined) {
    return renderMetricForm(ds, body);
  }
  const cols = (ds.columns && ds.columns.length ? ds.columns : (ds.standardFields || []).map((f) => f.label));
  const sampleRow = null;
  body.innerHTML = `
    <div class="alert">
      ${icon('info', 15)}
      <div><b>取数逻辑</b>决定看板指标怎么算：先把底表列映射到标准字段，再用「指标口径」定义每个卡片 / 图表的计算方式。修改后立即生效，不用重新上传底表。</div>
    </div>

    <div class="card" style="box-shadow:none;margin-bottom:14px">
      <div class="card-head">
        <div><h2>① 字段映射</h2><p class="sub">底表列 → 标准字段；未映射的列不参与计算</p></div>
        <div class="card-head-actions"><span class="badge ${Object.values(ds.mapping || {}).filter(Boolean).length ? 'green' : 'amber'}">已映射 ${Object.values(ds.mapping || {}).filter(Boolean).length} / ${(ds.standardFields || []).length}</span></div>
      </div>
      <div class="table-wrap">
        <table class="map-table">
          <thead><tr><th style="width:170px">标准字段</th><th>底表列</th><th style="width:120px">类型</th></tr></thead>
          <tbody>
            ${(ds.standardFields || []).map((f) => `
              <tr class="${(ds.mapping || {})[f.key] ? '' : 'unmapped'}">
                <td><span class="std-key">${esc(f.label)} ${f.required ? '<span class="req">*</span>' : ''}</span></td>
                <td><select class="control" data-map="${f.key}">
                  <option value="">— 不映射 —</option>
                  ${cols.map((c) => `<option value="${esc(c)}" ${(ds.mapping || {})[f.key] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                </select></td>
                <td class="muted text-xs">${esc(f.type)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="box-shadow:none;margin-bottom:14px">
      <div class="card-head">
        <div><h2>② 指标口径</h2><p class="sub">每个指标 = 计算方式 + 统计字段 + 过滤条件；比率型指标用其他指标组合</p></div>
        <div class="card-head-actions"><button class="btn btn-sm" id="addMetric" type="button">${icon('plus', 13)}新增指标</button></div>
      </div>
      <div class="card-body">
        <div class="metric-grid">
          ${(ds.metrics || []).map((m, i) => `
            <div class="metric-card">
              <div class="metric-head">
                <span class="metric-name">${esc(m.name)}</span>
                <span class="metric-key">${esc(m.key)}</span>
                <span class="badge ${m.scope === 'global' ? 'violet' : 'plain'}" style="margin-left:auto">${m.scope === 'global' ? '全国口径' : '本基地'}</span>
                <button class="btn btn-sm btn-ghost" data-edit="${i}" type="button">${icon('edit', 13)}</button>
              </div>
              <div class="metric-body">
                ${metricExprHtml(m, ds)}
                <div class="muted" style="margin-top:2px">${esc(m.desc || '')}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="box-shadow:none">
      <div class="card-head"><div><h2>③ 口径说明</h2><p class="sub">展示在看板底部，向查看者解释数据来源与算法</p></div></div>
      <div class="card-body">
        <textarea class="control" id="caliberInput" placeholder="例如：仅统计状态不为「无效号码」的线索；转化率 = 转化数 ÷ 线索量">${esc(ds.caliber || '')}</textarea>
      </div>
    </div>

    <div class="modal-foot">
      <button class="btn" id="resetLogic" type="button">还原</button>
      <button class="btn btn-primary" id="saveLogic" type="button">保存取数逻辑</button>
    </div>
  `;

  const mapping = Object.assign({}, ds.mapping || {});
  body.querySelectorAll('[data-map]').forEach((sel) => {
    sel.addEventListener('change', () => {
      mapping[sel.dataset.map] = sel.value;
      sel.closest('tr').classList.toggle('unmapped', !sel.value);
    });
  });

  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      App.dsEditingMetric = Number(btn.dataset.edit);
      renderLogicTab(ds, body);
    });
  });
  body.querySelector('#addMetric').addEventListener('click', () => {
    App.dsEditingMetric = 'new';
    renderLogicTab(ds, body);
  });
  body.querySelector('#resetLogic').addEventListener('click', () => renderLogicTab(ds, body));
  body.querySelector('#saveLogic').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api(`/api/admin/datasets/${ds.id}/config`, {
        method: 'PUT',
        body: { mapping, caliber: body.querySelector('#caliberInput').value }
      });
      await refreshBootstrap();
      toast('取数逻辑已保存，看板按新口径重算', 'ok');
      const fresh = App.datasets.find((d) => d.id === ds.id);
      App.dsEditingMetric = null;
      renderPreviewTab(fresh, body);
      boxSetActive('preview');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
}

function boxSetActive(tab) {
  App.dsTab = tab;
  const tabs = document.querySelectorAll('#dsTabs [data-tab]');
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
}

function metricExprHtml(m, ds) {
  const fields = (ds && ds.standardFields) || [];
  const labelOf = (key) => {
    const f = fields.find((x) => x.key === key);
    return f ? f.label : key;
  };
  const opLabel = { eq: '=', neq: '≠', in: '属于', notin: '不属于', gt: '>', lt: '<', gte: '≥', lte: '≤', contains: '包含', notEmpty: '非空', empty: '为空' };
  if (m.type === 'ratio') {
    return `算法 <b>比率 / 组合公式</b> · <code>${esc(m.formula || '')}</code> · 单位 ${esc(m.unit || '—')}`;
  }
  const typeLabel = { count: '计数', distinct: '去重计数', sum: '求和', avg: '平均值' }[m.type] || m.type;
  const seg = [`算法 <b>${typeLabel}</b>`];
  if (m.field) seg.push(`字段 <code>${esc(labelOf(m.field))}</code>`);
  if (m.filter && m.filter.field) {
    seg.push(`条件 <code>${esc(labelOf(m.filter.field))} ${opLabel[m.filter.op] || m.filter.op} ${esc(m.filter.value)}</code>`);
  }
  seg.push(`单位 ${esc(m.unit || '—')}`);
  return seg.join(' · ');
}

/* ---------------- 指标编辑 ---------------- */
function renderMetricForm(ds, body) {
  const editing = App.dsEditingMetric;
  const isNew = editing === 'new';
  const m = isNew
    ? { key: '', name: '', type: 'count', field: '', filter: null, formula: '', unit: '条', format: 'int', scope: 'base', desc: '' }
    : (ds.metrics || [])[editing];

  const stdFieldOptions = (selected) => `<option value="">—</option>${(ds.standardFields || []).map((f) => `<option value="${f.key}" ${selected === f.key ? 'selected' : ''}>${esc(f.label)}（${f.key}）</option>`).join('')}`;

  body.innerHTML = `
    <div class="flex items-center gap-8 mb-12">
      <button class="btn btn-sm btn-ghost" id="backList" type="button">${icon('chevronRight', 13)}<span style="transform:rotate(180deg);display:inline-block">↩</span> 返回指标列表</button>
      <span class="muted text-xs">${isNew ? '新增指标' : `编辑「${esc(m.name)}」`}</span>
    </div>

    <div class="form-grid">
      <div class="form-field"><label>指标名称</label><input class="control" id="mName" value="${esc(m.name)}" placeholder="例如：转化数"></div>
      <div class="form-field"><label>指标标识（英文 / 数字，公式里引用）</label><input class="control" id="mKey" value="${esc(m.key)}" placeholder="例如：conv" ${isNew ? '' : 'readonly'}></div>
      <div class="form-field"><label>计算方式</label>
        <select class="control" id="mType">
          <option value="count" ${m.type === 'count' ? 'selected' : ''}>计数（行数 / 满足条件行数）</option>
          <option value="distinct" ${m.type === 'distinct' ? 'selected' : ''}>去重计数（按字段）</option>
          <option value="sum" ${m.type === 'sum' ? 'selected' : ''}>求和</option>
          <option value="avg" ${m.type === 'avg' ? 'selected' : ''}>平均值</option>
          <option value="ratio" ${m.type === 'ratio' ? 'selected' : ''}>比率 / 组合公式</option>
        </select>
      </div>
      <div class="form-field"><label>统计字段</label><select class="control" id="mField">${stdFieldOptions(m.field)}</select></div>
      <div class="form-field"><label>过滤字段</label><select class="control" id="mFilterField">${stdFieldOptions(m.filter && m.filter.field)}</select></div>
      <div class="form-field"><label>过滤条件</label>
        <div class="input-group">
          <select class="control" id="mFilterOp" style="width:110px">
            ${[['eq', '等于'], ['neq', '不等于'], ['in', '属于(用|分隔)'], ['gt', '大于'], ['lt', '小于'], ['notEmpty', '非空']].map(([v, l]) => `<option value="${v}" ${m.filter && m.filter.op === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <input class="control grow" id="mFilterVal" value="${esc(m.filter ? m.filter.value : '')}" placeholder="例如：已转化">
        </div>
      </div>
      <div class="form-field full"><label>组合公式（仅比率型，用指标标识组合，如 <code>conv / list</code>）</label><input class="control" id="mFormula" value="${esc(m.formula || '')}" placeholder="conv / list"></div>
      <div class="form-field"><label>单位</label><input class="control" id="mUnit" value="${esc(m.unit || '')}" placeholder="如：人 / 条 / 元"></div>
      <div class="form-field"><label>数字格式</label>
        <select class="control" id="mFormat">
          <option value="int" ${m.format === 'int' ? 'selected' : ''}>整数</option>
          <option value="money" ${m.format === 'money' ? 'selected' : ''}>金额（自动万 / 亿）</option>
          <option value="pct" ${m.format === 'pct' ? 'selected' : ''}>百分比</option>
        </select>
      </div>
      <div class="form-field full"><label>展示范围（决定基地账号能看到什么）</label>
        <div class="radio-cards">
          <label class="radio-card"><input type="radio" name="scope" value="base" ${m.scope !== 'global' ? 'checked' : ''}><span><b>仅本基地</b><span>基地账号只看自己基地的数据</span></span></label>
          <label class="radio-card"><input type="radio" name="scope" value="global" ${m.scope === 'global' ? 'checked' : ''}><span><b>全国口径</b><span>基地账号也能看到全体数据（标注「全国」）</span></span></label>
        </div>
      </div>
      <div class="form-field full"><label>口径说明</label><input class="control" id="mDesc" value="${esc(m.desc || '')}" placeholder="展示在指标卡片的提示中"></div>
    </div>

    <div class="formula-box mt-16" id="exprPreview"></div>

    <div class="modal-foot">
      ${isNew ? '' : `<button class="btn btn-danger" id="delMetric" type="button">${icon('trash', 13)}删除指标</button>`}
      <div class="spacer"></div>
      <button class="btn" id="cancelMetric" type="button">取消</button>
      <button class="btn btn-primary" id="saveMetric" type="button">保存指标</button>
    </div>
  `;

  const readForm = () => {
    const type = body.querySelector('#mType').value;
    const ff = body.querySelector('#mFilterField').value;
    const fv = body.querySelector('#mFilterVal').value.trim();
    return {
      key: body.querySelector('#mKey').value.trim(),
      name: body.querySelector('#mName').value.trim(),
      type,
      field: body.querySelector('#mField').value,
      filter: ff && fv ? { field: ff, op: body.querySelector('#mFilterOp').value, value: fv } : null,
      formula: body.querySelector('#mFormula').value.trim(),
      unit: body.querySelector('#mUnit').value.trim(),
      format: body.querySelector('#mFormat').value,
      scope: body.querySelector('input[name="scope"]:checked').value,
      desc: body.querySelector('#mDesc').value.trim()
    };
  };

  const updatePreview = () => {
    const v = readForm();
    let text = '';
    if (v.type === 'ratio') text = `结果 = ${v.formula || '(未填公式)'}`;
    else {
      const t = { count: 'COUNT(*)', distinct: `COUNT(DISTINCT ${v.field || '?'})`, sum: `SUM(${v.field || '?'})`, avg: `AVG(${v.field || '?'})` }[v.type];
      text = `结果 = ${t}${v.filter ? ` WHERE ${v.filter.field} ${v.filter.op} ${v.filter.value}` : ''}`;
    }
    body.querySelector('#exprPreview').textContent = `取数表达式：${text}　|　格式：${v.format}　|　范围：${v.scope === 'global' ? '全国' : '仅本基地'}`;
  };
  body.querySelectorAll('#dsTabBody input, #dsTabBody select').forEach((n) => n.addEventListener('input', updatePreview));
  body.querySelectorAll('#dsTabBody select').forEach((n) => n.addEventListener('change', updatePreview));
  updatePreview();

  body.querySelector('#backList').addEventListener('click', () => { App.dsEditingMetric = null; renderLogicTab(ds, body); });
  body.querySelector('#cancelMetric').addEventListener('click', () => { App.dsEditingMetric = null; renderLogicTab(ds, body); });

  body.querySelector('#saveMetric').addEventListener('click', async () => {
    const v = readForm();
    if (!v.name) return toast('请填写指标名称', 'err');
    if (!v.key) return toast('请填写指标标识', 'err');
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.key)) return toast('指标标识只能是英文字母、数字、下划线', 'err');
    if (v.type === 'ratio' && !v.formula) return toast('比率型指标请填写组合公式', 'err');
    const metrics = (ds.metrics || []).slice();
    if (isNew) {
      if (metrics.some((x) => x.key === v.key)) return toast('指标标识已存在', 'err');
      metrics.push(v);
    } else {
      metrics[editing] = v;
    }
    try {
      await api(`/api/admin/datasets/${ds.id}/config`, { method: 'PUT', body: { metrics } });
      await refreshBootstrap();
      App.dsEditingMetric = null;
      toast('指标已保存', 'ok');
      renderLogicTab(App.datasets.find((d) => d.id === ds.id), body);
    } catch (err) { toast(err.message, 'err'); }
  });

  const del = body.querySelector('#delMetric');
  if (del) del.addEventListener('click', async () => {
    const metrics = (ds.metrics || []).filter((_, i) => i !== editing);
    try {
      await api(`/api/admin/datasets/${ds.id}/config`, { method: 'PUT', body: { metrics } });
      await refreshBootstrap();
      App.dsEditingMetric = null;
      toast('指标已删除', 'ok');
      renderLogicTab(App.datasets.find((d) => d.id === ds.id), body);
    } catch (err) { toast(err.message, 'err'); }
  });
}

/* ---------------- 取数预览 tab ---------------- */
async function renderPreviewTab(ds, body) {
  body.innerHTML = `<div class="skeleton" style="height:180px;border-radius:10px"></div>`;
  try {
    const r = await api(`/api/admin/datasets/${ds.id}/preview`, { method: 'POST', body: {} });
    const cols = (ds.metrics || []);
    body.innerHTML = `
      <div class="alert ok">
        ${icon('check', 15)}
        <div>这是当前取数逻辑跑出来的结果预览（全部基地、全部时间）。如果数字不对，回到「字段映射与取数逻辑」调整映射或口径。</div>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(${Math.min(4, cols.length)}, minmax(0,1fr))">
        ${cols.map((m, i) => {
          const p = fmtParts(r.total[m.key], m.format, m.unit);
          return `<div class="kpi" data-tone="${['blue', 'green', 'violet', 'amber'][i % 4]}">
            <div class="kpi-label">${esc(m.name)} <span class="kpi-scope local">全量</span></div>
            <div class="kpi-value">${p.main}<span class="unit">${esc(p.unit)}</span></div>
            <div class="kpi-foot">${esc(m.desc || metricPlain(m))}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="upload-summary">
        <span class="pill">参与计算 <b>${fmtInt(r.rows)}</b> 行</span>
        <span class="pill ${r.unmatched ? 'warn' : 'ok'}">未匹配架构 <b>${fmtInt(r.unmatched)}</b> 行</span>
        <span class="pill">底表总计 <b>${fmtInt(ds.rowCount)}</b> 行</span>
      </div>
      <div class="grid-2 equal">
        <div class="card" style="box-shadow:none;margin-bottom:0">
          <div class="card-head"><div><h2>按基地</h2><p class="sub">${esc((ds.metrics[0] || {}).name || '')} 汇总</p></div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>基地</th>${cols.slice(0, 3).map((m) => `<th class="num">${esc(m.name)}</th>`).join('')}</tr></thead>
            <tbody>${r.byBase.map((b) => `<tr><td class="strong">${esc(baseName(b.key))}</td>${cols.slice(0, 3).map((m) => `<td class="num">${fmt(b.metrics[m.key] || 0, m.format, m.unit)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:0">
          <div class="card-head"><div><h2>按高经</h2><p class="sub">工号匹配最新架构后汇总</p></div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>高经</th>${cols.slice(0, 3).map((m) => `<th class="num">${esc(m.name)}</th>`).join('')}</tr></thead>
            <tbody>${r.byManager.map((b) => `<tr><td class="strong">${esc(managerName(b.key))}</td>${cols.slice(0, 3).map((m) => `<td class="num">${fmt(b.metrics[m.key] || 0, m.format, m.unit)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="alert err">${icon('alert', 15)}<div>${esc(err.message)}</div></div>`;
  }
}

function metricPlain(m) {
  return m.type === 'ratio' ? `公式 ${m.formula}` : `${m.type} ${m.field || ''}`;
}

function baseName(id) {
  const b = App.bases.find((x) => x.id === id);
  return b ? b.name : id || '未匹配';
}

function managerName(id) {
  const m = App.managers.find((x) => x.empId === id);
  if (m) return `${m.name} · ${m.teamName}`;
  const rec = App.orgRows && App.orgRows.find((o) => o.empId === id);
  return rec ? rec.name : id || '未匹配';
}

/* ---------------------------------------------------------------- 销售架构 */
let orgState = { base: 'all', mgr: 'all', level: 'all', q: '', rows: [] };

async function renderOrg() {
  $('#topActions').innerHTML = `
    <button class="btn btn-sm" id="orgTpl" type="button">${icon('download', 14)}架构模板</button>
    <button class="btn btn-primary" id="orgUpload" type="button">${icon('upload', 15)}上传销售架构</button>`;

  $('#view-org').innerHTML = `
    <div class="grid-3">
      <div class="kpi org-kpi-click" id="kpiOrgTotal" role="button" title="点击查看全部人员明细"><div class="kpi-label">在册人数</div><div class="kpi-value" id="orgTotal">—</div><div class="kpi-foot">含一线与高经 · 点击查看明细</div></div>
      <div class="kpi org-kpi-click" id="kpiOrgMgr" data-tone="violet" role="button" title="点击查看各高经团队明细"><div class="kpi-label">高经 / 团队</div><div class="kpi-value" id="orgMgr">—</div><div class="kpi-foot">架构汇总维度 · 点击查看明细</div></div>
      <div class="kpi" data-tone="green"><div class="kpi-label">最近更新时间</div><div class="kpi-value" style="font-size:19px;line-height:1.6" id="orgUpdated">—</div><div class="kpi-foot">上传后立即按工号匹配</div></div>
    </div>

    <div class="alert">
      ${icon('info', 15)}
      <div>底表里只有<b>一线工号</b>，需要通过这张架构表把工号映射到<b>高经 / 团队 / 基地</b>。匹配规则：取「生效日期 ≤ 记录日期」的最新一条架构，因此调组、换高经后历史数据仍归旧团队，新数据自动归新团队。</div>
    </div>

    <section class="card" id="orgDetailCard">
      <div class="card-head">
        <div><h2><span class="head-icon green">${icon('file', 14)}</span>人员明细</h2><p class="sub">按工号查询，确认当前归属 · 点击基地按钮按基地筛选</p></div>
        <span class="chip" id="orgShown">—</span>
      </div>
      <div class="card-body" style="padding:0 0 12px">
        <div style="padding:12px 16px 0">
          <div class="upload-summary" id="orgBaseChips"><span class="pill muted">加载中…</span></div>
        </div>
        <div class="filterbar" style="padding:10px 16px">
          <div class="field"><label>高经</label>
            <select class="control" id="orgMgrFilter"><option value="all">全部高经</option></select>
          </div>
          <div class="field"><label>层级</label>
            <select class="control" id="orgLevelFilter"><option value="all">全部层级</option></select>
          </div>
          <div class="field grow"><label>搜索</label>
            <input class="control search" id="orgSearch" placeholder="搜索工号 / 姓名 / 高经 / 经理 / 主管 / 组长 / 团队">
          </div>
        </div>
        <div class="table-wrap" style="max-height:600px">
          <table class="table" id="orgTable"><thead><tr><th>工号</th><th>姓名</th><th>基地</th><th>层级</th><th>高经</th><th>经理 / 主管 / 组长</th><th>团队</th><th>生效日期</th><th style="text-align:right">操作</th></tr></thead><tbody><tr><td colspan="9"><div class="skeleton sk-line"></div></td></tr></tbody></table>
        </div>
      </div>
    </section>
  `;

  $('#orgUpload').addEventListener('click', openOrgUpload);
  $('#orgTpl').addEventListener('click', () => {
    downloadCsv('销售架构模板.csv', [{ 账号: 'E1001', 工号: 'E1001', 姓名: '张小雨', 基地: '武汉基地', 基地负责人: '王建国', 高经: '陈立', 经理: '刘敏', 储备经理: '赵强', 主管: '孙丽', 组长: '周杰', 团队: '武汉一组', 层级: '一线', 生效日期: '2026-11-01' }],
      ['账号', '工号', '姓名', '基地', '基地负责人', '高经', '经理', '储备经理', '主管', '组长', '团队', '层级', '生效日期'].map((c) => ({ label: c, value: c })));
    toast('架构模板已下载', 'ok');
  });
  $('#orgSearch').addEventListener('input', debounce((e) => {
    orgState.q = e.target.value.trim();
    renderOrgTable();
  }, 200));
  $('#orgMgrFilter').addEventListener('change', (e) => { orgState.mgr = e.target.value; renderOrgTable(); });
  $('#orgLevelFilter').addEventListener('change', (e) => { orgState.level = e.target.value; renderOrgTable(); });
  $('#kpiOrgTotal').addEventListener('click', () => {
    resetOrgFilters();
    toast('已显示全部人员明细', 'ok');
  });
  $('#kpiOrgMgr').addEventListener('click', openOrgMgrDetail);

  await loadOrg();
}

async function loadOrg() {
  const r = await api('/api/admin/org');
  orgState.rows = r.rows;
  App.orgRows = r.rows;
  const managers = [...new Set(r.rows.filter((x) => x.level === '高经' && x.name).map((x) => x.name))];
  $('#orgTotal').textContent = fmtInt(r.total);
  $('#orgMgr').innerHTML = `${managers.length}<span class="unit">高经</span>`;
  $('#orgUpdated').textContent = App.overview ? App.overview.lastUpdate : '—';
  renderOrgFilters();
  renderOrgTable();
}

function renderOrgFilters() {
  const rows = orgState.rows;
  // 基地匹配兼容：工号行 baseId 可能存 ID 或基地名（含/不含「基地」后缀）
  const baseMatch = (r, b) => r.baseId === b.id || r.baseId === b.name || r.baseId === String(b.name || '').replace(/基地$/, '');
  // 基地按钮：固定展示全部系统基地（无人的基地显示 0 人）+ 架构表里出现的其他基地名
  const baseIds = [...new Set(rows.map((r) => r.baseId).filter(Boolean))];
  const known = App.bases.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const extra = baseIds.filter((id) => !known.some((b) => baseMatch({ baseId: id }, b)));
  const countOf = (id) => {
    if (id === 'all') return rows.length;
    const b = known.find((x) => x.id === id);
    return b ? rows.filter((r) => baseMatch(r, b)).length : rows.filter((r) => r.baseId === id).length;
  };
  const chip = (id, label, color, withCount) => `
    <button class="chip org-base-chip ${orgState.base === id ? 'active' : ''}" data-base="${esc(id)}" type="button">
      ${color ? `<i style="width:7px;height:7px;border-radius:2px;background:${color};display:inline-block"></i>` : ''}${esc(label)}${withCount ? ` · ${fmtInt(countOf(id))} 人` : ''}
    </button>`;
  $('#orgBaseChips').innerHTML =
    chip('all', '全部人员', null, true) +
    known.map((b) => chip(b.id, b.name, b.color, true)).join('') +
    extra.map((id) => chip(id, baseName(id) || '未匹配基地', '#94a3b8', true)).join('');
  $$('#orgBaseChips .org-base-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      orgState.base = btn.dataset.base;
      $$('#orgBaseChips .org-base-chip').forEach((x) => x.classList.toggle('active', x === btn));
      renderOrgTable();
    });
  });
  // 高经下拉
  const mgrNames = [...new Set(rows.map((r) => r.managerName).filter(Boolean))].sort();
  $('#orgMgrFilter').innerHTML = `<option value="all">全部高经</option>` +
    mgrNames.map((m) => `<option value="${esc(m)}" ${orgState.mgr === m ? 'selected' : ''}>${esc(m)}</option>`).join('');
  // 层级下拉（按固定顺序）
  const LEVELS = ['一线', '高经', '经理', '储备经理', '主管', '组长'];
  const lvls = [...new Set(rows.map((r) => r.level).filter(Boolean))]
    .sort((a, b) => (LEVELS.indexOf(a) === -1 ? 99 : LEVELS.indexOf(a)) - (LEVELS.indexOf(b) === -1 ? 99 : LEVELS.indexOf(b)));
  $('#orgLevelFilter').innerHTML = `<option value="all">全部层级</option>` +
    lvls.map((l) => `<option value="${esc(l)}" ${orgState.level === l ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

function renderOrgTable() {
  const q = (orgState.q || '').toLowerCase();
  const curBase = orgState.base === 'all' ? null : App.bases.find((b) => b.id === orgState.base);
  const baseHit = (r) => {
    if (!curBase) return r.baseId === orgState.base;
    return r.baseId === curBase.id || r.baseId === curBase.name || r.baseId === String(curBase.name || '').replace(/基地$/, '');
  };
  const rows = orgState.rows
    .filter((r) => orgState.base === 'all' || baseHit(r))
    .filter((r) => orgState.mgr === 'all' || r.managerName === orgState.mgr)
    .filter((r) => orgState.level === 'all' || r.level === orgState.level)
    .filter((r) => !q || `${r.empId} ${r.name} ${r.managerName} ${r.manager2 || ''} ${r.manager3 || ''} ${r.manager4 || ''} ${r.manager5 || ''} ${r.teamName}`.toLowerCase().includes(q));
  const shown = $('#orgShown');
  if (shown) shown.textContent = `显示 ${fmtInt(rows.length)} 人`;
  $('#orgTable').querySelector('tbody').innerHTML = rows.map((r, i) => `
    <tr>
      <td><span class="tag-code">${esc(r.empId)}</span></td>
      <td class="strong">${esc(r.name)}</td>
      <td>${esc(baseName(r.baseId))}</td>
      <td>${orgLevelPill(r.level)}</td>
      <td>${esc(r.managerName || (r.level === '高经' ? '—' : '未匹配'))}</td>
      <td class="muted">${esc([r.manager2, r.manager3, r.manager4, r.manager5].filter(Boolean).join(' / ') || '—')}</td>
      <td>${esc(r.teamName || '—')}</td>
      <td class="muted nowrap">${esc(r.effectiveDate || '')}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-sm" data-oedit="${i}" type="button">编辑</button>
        <button class="btn btn-sm btn-danger" data-odel="${i}" type="button">删除</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="9"><div class="empty"><h3>没有匹配的人员</h3></div></td></tr>`;

  $$('#orgTable [data-oedit]').forEach((b) => b.addEventListener('click', () => openOrgForm(rows[Number(b.dataset.oedit)])));
  $$('#orgTable [data-odel]').forEach((b) => b.addEventListener('click', async () => {
    const r = rows[Number(b.dataset.odel)];
    if (!r) return;
    if (!confirm(`确认删除销售架构人员「${r.name || r.empId}」？删除后看板即时重算。`)) return;
    try {
      await api(`/api/admin/org/${encodeURIComponent(r.empId)}?date=${encodeURIComponent(r.effectiveDate || '')}`, { method: 'DELETE' });
      toast('已删除', 'ok');
      loadOrg();
    } catch (err) { toast(err.message, 'err'); }
  }));
}

function openOrgForm(row) {
  if (!row) return;
  const body = `
    <div class="form-grid">
      <div class="form-field"><label>工号</label><input class="control" id="oEmpId" value="${esc(row.empId || '')}"></div>
      <div class="form-field"><label>姓名</label><input class="control" id="oName" value="${esc(row.name || '')}"></div>
      <div class="form-field"><label>基地</label><input class="control" id="oBase" value="${esc(baseName(row.baseId) || row.baseId || '')}" placeholder="如：武汉基地"></div>
      <div class="form-field"><label>层级</label>
        <select class="control" id="oLevel">
          ${['一线', '高经', '经理', '储备经理', '主管', '组长'].map((l) => `<option value="${l}" ${row.level === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>高经</label><input class="control" id="oMgrName" value="${esc(row.managerName || '')}"></div>
      <div class="form-field"><label>经理</label><input class="control" id="oMgr2" value="${esc(row.manager2 || '')}"></div>
      <div class="form-field"><label>储备经理</label><input class="control" id="oMgr3" value="${esc(row.manager3 || '')}"></div>
      <div class="form-field"><label>主管</label><input class="control" id="oMgr4" value="${esc(row.manager4 || '')}"></div>
      <div class="form-field"><label>组长</label><input class="control" id="oMgr5" value="${esc(row.manager5 || '')}"></div>
      <div class="form-field"><label>团队</label><input class="control" id="oTeam" value="${esc(row.teamName || '')}"></div>
      <div class="form-field"><label>生效日期</label><input class="control" type="date" id="oEff" value="${esc(row.effectiveDate || '')}"></div>
    </div>
    <div class="alert mt-12">${icon('info', 15)}<div>保存后立即生效并重算看板；如需保留数据快照，请先到「版本记录」发布版本。</div></div>
  `;
  const box = openModal({
    title: `编辑销售架构 · ${row.name || row.empId}`,
    subtitle: `工号 ${row.empId}${row.effectiveDate ? ' · 生效 ' + row.effectiveDate : ''}`,
    body,
    footer: `<button class="btn" id="oCancel" type="button">取消</button><button class="btn btn-primary" id="oSave" type="button">保存</button>`
  });
  box.querySelector('#oCancel').addEventListener('click', closeModal);
  box.querySelector('#oSave').addEventListener('click', async () => {
    const val = (id) => box.querySelector(id).value.trim();
    const payload = {
      empId: val('#oEmpId'),
      name: val('#oName'),
      base: val('#oBase'),
      level: box.querySelector('#oLevel').value,
      managerName: val('#oMgrName'),
      manager2: val('#oMgr2'),
      manager3: val('#oMgr3'),
      manager4: val('#oMgr4'),
      manager5: val('#oMgr5'),
      teamName: val('#oTeam'),
      effectiveDate: val('#oEff')
    };
    if (!payload.empId) { toast('工号不能为空', 'err'); return; }
    try {
      await api(`/api/admin/org/${encodeURIComponent(row.empId)}?date=${encodeURIComponent(row.effectiveDate || '')}`, { method: 'PUT', body: { row: payload } });
      closeModal();
      toast('销售架构已更新', 'ok');
      loadOrg();
    } catch (err) { toast(err.message, 'err'); }
  });
}

function orgLevelPill(level) {
  const cls = { '高经': 'lv-gaojing', '经理': 'lv-jingli', '储备经理': 'lv-chubei', '主管': 'lv-zhuguan', '组长': 'lv-zuzhang', '一线': 'lv-yixian' }[level] || 'muted';
  return `<span class="pill ${cls}">${esc(level || '—')}</span>`;
}

function resetOrgFilters() {
  orgState.base = 'all'; orgState.mgr = 'all'; orgState.level = 'all'; orgState.q = '';
  const search = $('#orgSearch');
  if (search) search.value = '';
  renderOrgFilters();
  renderOrgTable();
  const card = $('#orgDetailCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openOrgMgrDetail() {
  const rows = orgState.rows;
  // 按高经姓名聚合（同一高经可能有多条架构记录），团队/基地取第一条
  const byName = {};
  rows.forEach((r) => {
    if (r.level !== '高经' || !r.name) return;
    if (!byName[r.name]) byName[r.name] = { m: r, count: 0 };
  });
  rows.forEach((r) => { if (r.managerName && byName[r.managerName]) byName[r.managerName].count++; });
  const data = Object.values(byName).sort((a, b) => b.count - a.count);
  if (!data.length) { toast('暂无高经数据', 'err'); return; }
  openModal({
    title: '高经团队明细',
    subtitle: `共 ${data.length} 位高经 · 点击任意高经可筛选下方人员明细`,
    body: `<div class="table-wrap" style="max-height:480px"><table class="table">
      <thead><tr><th>高经</th><th>团队</th><th>基地</th><th class="num">在册人数</th></tr></thead>
      <tbody>${data.map(({ m, count }) => `
        <tr class="org-mgr-row" data-mgr="${esc(m.name)}">
          <td class="strong">${esc(m.name)}</td>
          <td>${esc(m.teamName || '—')}</td>
          <td>${esc(baseName(m.baseId))}</td>
          <td class="num strong">${fmtInt(count)}</td>
        </tr>`).join('')}
      </tbody></table></div>`,
    onMount: (box) => {
      box.querySelectorAll('.org-mgr-row').forEach((tr) => {
        tr.addEventListener('click', () => {
          closeModal();
          orgState.mgr = tr.dataset.mgr;
          orgState.base = 'all'; orgState.level = 'all';
          const search = $('#orgSearch');
          if (search) search.value = '';
          renderOrgFilters();
          renderOrgTable();
          const card = $('#orgDetailCard');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  });
}

function openOrgUpload() {
  openUploadWizard({
    title: '上传销售架构',
    subtitle: '覆盖或追加人员归属关系，按生效日期保留历史',
    fileName: '销售架构',
    fields: [
      { key: 'account', label: '账号', required: false, aliases: ['系统账号', '登录账号', '员工账号'] },
      { key: 'empId', label: '工号', required: true, aliases: ['员工工号', '员工编号'] },
      { key: 'name', label: '姓名', required: true },
      { key: 'base', label: '基地', required: true, aliases: ['基地名称', '所属基地'] },
      { key: 'baseOwner', label: '基地负责人', required: false, aliases: ['负责人', '基地经理'] },
      { key: 'managerName', label: '高经', required: false, aliases: ['高经姓名', '高级经理'] },
      { key: 'manager2', label: '经理', required: false },
      { key: 'manager3', label: '储备经理', required: false, aliases: ['储备经理人'] },
      { key: 'manager4', label: '主管', required: false },
      { key: 'manager5', label: '组长', required: false },
      { key: 'teamName', label: '团队', required: false, aliases: ['团队名称', '小组'] },
      { key: 'level', label: '层级', required: false, aliases: ['人员层级', '角色'] },
      { key: 'effectiveDate', label: '生效日期', required: false, aliases: ['生效日', '入职日期', '入职时间'] }
    ],
    template: [{ 账号: 'E1001', 工号: 'E1001', 姓名: '张小雨', 基地: '武汉基地', 基地负责人: '王建国', 高经: '陈立', 经理: '刘敏', 储备经理: '赵强', 主管: '孙丽', 组长: '周杰', 层级: '一线', 生效日期: '2026-11-01' }],
    onConfirm: async (rows, mapping, mode) => {
      const r = await api('/api/admin/org/upload', { method: 'POST', body: { rows, mapping, mode } });
      await refreshBootstrap();
      await loadOrg();
      toast(`架构已更新，共 ${fmtInt(r.total)} 条`, 'ok');
    }
  });
}

/* ---------------------------------------------------------------- 辅导架构 */
let tutorState = { base: 'all', mgr4: 'all', level: 'all', st: 'all', q: '', rows: [] };

async function renderTutor() {
  $('#topActions').innerHTML = `
    <button class="btn btn-sm" id="tutorTpl" type="button">${icon('download', 14)}辅导架构模板</button>
    <button class="btn btn-primary" id="tutorUpload" type="button">${icon('upload', 15)}上传辅导架构</button>`;

  $('#view-tutor').innerHTML = `
    <div class="grid-3">
      <div class="kpi org-kpi-click" id="kpiTutorTotal" role="button" title="点击查看全部人员明细"><div class="kpi-label">在册人数</div><div class="kpi-value" id="tutorTotal">—</div><div class="kpi-foot">含辅导老师与主管 · 点击查看明细</div></div>
      <div class="kpi org-kpi-click" id="kpiTutorMgr" data-tone="violet" role="button" title="点击查看各主管团队明细"><div class="kpi-label">主管 / 团队</div><div class="kpi-value" id="tutorMgr">—</div><div class="kpi-foot">架构汇总维度 · 点击查看明细</div></div>
      <div class="kpi" data-tone="green"><div class="kpi-label">最近更新时间</div><div class="kpi-value" style="font-size:19px;line-height:1.6" id="tutorUpdated">—</div><div class="kpi-foot">上传后立即更新</div></div>
    </div>

    <div class="alert">
      ${icon('info', 15)}
      <div>上传辅导架构名单后，系统自动按 <b>基地负责人 / 主管 / 组长 / 辅导老师</b> 推导层级，并支持按基地、主管、层级、在职状态筛选查看人员明细。</div>
    </div>

    <section class="card" id="tutorDetailCard">
      <div class="card-head">
        <div><h2><span class="head-icon green">${icon('file', 14)}</span>人员明细</h2><p class="sub">按姓名 / 辅导ID / 工号查询 · 点击基地按钮按基地筛选</p></div>
        <span class="chip" id="tutorShown">—</span>
      </div>
      <div class="card-body" style="padding:0 0 12px">
        <div style="padding:12px 16px 0">
          <div class="upload-summary" id="tutorBaseChips"><span class="pill muted">加载中…</span></div>
        </div>
        <div class="filterbar" style="padding:10px 16px">
          <div class="field"><label>主管</label>
            <select class="control" id="tutorMgrFilter"><option value="all">全部主管</option></select>
          </div>
          <div class="field"><label>层级</label>
            <select class="control" id="tutorLevelFilter"><option value="all">全部层级</option></select>
          </div>
          <div class="field"><label>在职状态</label>
            <select class="control" id="tutorStFilter"><option value="all">全部状态</option></select>
          </div>
          <div class="field grow"><label>搜索</label>
            <input class="control search" id="tutorSearch" placeholder="搜索辅导老师 / 辅导ID / 工号 / 年级学科 / 主管 / 组长">
          </div>
        </div>
        <div class="table-wrap" style="max-height:600px">
          <table class="table" id="tutorTable"><thead><tr><th>工号</th><th>辅导老师</th><th>辅导ID</th><th>基地</th><th>年级学科</th><th>层级</th><th>主管</th><th>组长</th><th>基地负责人</th><th>在职状态</th><th style="text-align:right">操作</th></tr></thead><tbody><tr><td colspan="11"><div class="skeleton sk-line"></div></td></tr></tbody></table>
        </div>
      </div>
    </section>
  `;

  $('#tutorUpload').addEventListener('click', openTutorUpload);
  $('#tutorTpl').addEventListener('click', () => {
    downloadCsv('辅导架构模板.csv', [{ 基地: '武汉基地', 年级学科: '初中数学', 基地负责人: '王建国', 主管: '孙丽', 组长: '周杰', 辅导老师: '李芳', 辅导ID: 'T1001', 工号: 'E2001', 在职状态: '在职' }],
      ['基地', '年级学科', '基地负责人', '主管', '组长', '辅导老师', '辅导ID', '工号', '在职状态'].map((c) => ({ label: c, value: c })));
    toast('辅导架构模板已下载', 'ok');
  });
  $('#tutorSearch').addEventListener('input', debounce((e) => {
    tutorState.q = e.target.value.trim();
    renderTutorTable();
  }, 200));
  $('#tutorMgrFilter').addEventListener('change', (e) => { tutorState.mgr4 = e.target.value; renderTutorTable(); });
  $('#tutorLevelFilter').addEventListener('change', (e) => { tutorState.level = e.target.value; renderTutorTable(); });
  $('#tutorStFilter').addEventListener('change', (e) => { tutorState.st = e.target.value; renderTutorTable(); });
  $('#kpiTutorTotal').addEventListener('click', () => {
    resetTutorFilters();
    toast('已显示全部人员明细', 'ok');
  });
  $('#kpiTutorMgr').addEventListener('click', openTutorMgrDetail);

  await loadTutor();
}

async function loadTutor() {
  const r = await api('/api/admin/tutor');
  tutorState.rows = r.rows;
  const mgrs = [...new Set(r.rows.filter((x) => x.level === '主管' && x.name).map((x) => x.name))];
  $('#tutorTotal').textContent = fmtInt(r.total);
  $('#tutorMgr').innerHTML = `${mgrs.length}<span class="unit">主管</span>`;
  $('#tutorUpdated').textContent = (App.overview && App.overview.lastUpdate) || '—';
  renderTutorFilters();
  renderTutorTable();
}

function renderTutorFilters() {
  const rows = tutorState.rows;
  // 辅导架构的基地与销售基地不一定一致：基地栏直接从上传的架构表里识别展示
  const PALETTE = ['#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#3b82f6', '#14b8a6', '#6366f1', '#ec4899', '#84cc16', '#06b6d4'];
  const groups = {};
  rows.forEach((r) => {
    const id = r.baseId || '(none)';
    if (!groups[id]) groups[id] = { id, count: 0, names: {} };
    groups[id].count += 1;
    const n = r.baseName || '';
    if (n) groups[id].names[n] = (groups[id].names[n] || 0) + 1;
  });
  const baseById = {};
  App.bases.forEach((b) => { baseById[b.id] = b; });
  const labelOf = (g) => {
    if (g.id === '(none)') return '未匹配基地';
    const best = Object.entries(g.names).sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
    const b = baseById[g.id];
    return b ? b.name : g.id;
  };
  const chips = Object.values(groups)
    .sort((a, b) => b.count - a.count)
    .map((g, i) => ({ ...g, label: labelOf(g), color: PALETTE[i % PALETTE.length] }));
  const chip = (g, withCount) => `
    <button class="chip org-base-chip ${tutorState.base === g.id ? 'active' : ''}" data-base="${esc(g.id)}" type="button">
      ${g.color && g.id !== '(none)' ? `<i style="width:7px;height:7px;border-radius:2px;background:${g.color};display:inline-block"></i>` : ''}${esc(g.label)}${withCount ? ` · ${fmtInt(g.count)} 人` : ''}
    </button>`;
  $('#tutorBaseChips').innerHTML =
    chip({ id: 'all', label: '全部人员', count: rows.length, color: null }, true) +
    chips.map((g) => chip(g, true)).join('');
  $$('#tutorBaseChips .org-base-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      tutorState.base = btn.dataset.base;
      $$('#tutorBaseChips .org-base-chip').forEach((x) => x.classList.toggle('active', x === btn));
      renderTutorTable();
    });
  });
  const mgrNames = [...new Set(rows.map((r) => r.manager4).filter(Boolean))].sort();
  $('#tutorMgrFilter').innerHTML = `<option value="all">全部主管</option>` +
    mgrNames.map((m) => `<option value="${esc(m)}" ${tutorState.mgr4 === m ? 'selected' : ''}>${esc(m)}</option>`).join('');
  const LEVELS = ['辅导老师', '组长', '主管', '基地负责人'];
  const lvls = [...new Set(rows.map((r) => r.level).filter(Boolean))]
    .sort((a, b) => (LEVELS.indexOf(a) === -1 ? 99 : LEVELS.indexOf(a)) - (LEVELS.indexOf(b) === -1 ? 99 : LEVELS.indexOf(b)));
  $('#tutorLevelFilter').innerHTML = `<option value="all">全部层级</option>` +
    lvls.map((l) => `<option value="${esc(l)}" ${tutorState.level === l ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const sts = [...new Set(rows.map((r) => r.status).filter(Boolean))];
  $('#tutorStFilter').innerHTML = `<option value="all">全部状态</option>` +
    sts.map((s) => `<option value="${esc(s)}" ${tutorState.st === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
}

function renderTutorTable() {
  const q = (tutorState.q || '').toLowerCase();
  const rows = tutorState.rows
    .filter((r) => tutorState.base === 'all' || (r.baseId || '(none)') === tutorState.base)
    .filter((r) => tutorState.mgr4 === 'all' || r.manager4 === tutorState.mgr4)
    .filter((r) => tutorState.level === 'all' || r.level === tutorState.level)
    .filter((r) => tutorState.st === 'all' || r.status === tutorState.st)
    .filter((r) => !q || `${r.empId} ${r.tutorId} ${r.name} ${r.subject} ${r.baseName || ''} ${r.baseOwner || ''} ${r.manager4 || ''} ${r.manager5 || ''}`.toLowerCase().includes(q));
  const shown = $('#tutorShown');
  if (shown) shown.textContent = `显示 ${fmtInt(rows.length)} 人`;
  $('#tutorTable').querySelector('tbody').innerHTML = rows.map((r, i) => `
    <tr>
      <td><span class="tag-code">${esc(r.empId)}</span></td>
      <td class="strong nw-name">${esc(r.name)}</td>
      <td class="muted">${esc(r.tutorId || '—')}</td>
      <td class="nw-name">${esc(r.baseName || baseName(r.baseId))}</td>
      <td class="nw-name">${esc(r.subject || '—')}</td>
      <td>${tutorLevelPill(r.level)}</td>
      <td class="nw-name">${esc(r.manager4 || '—')}</td>
      <td class="nw-name">${esc(r.manager5 || '—')}</td>
      <td class="nw-name">${esc(r.baseOwner || '—')}</td>
      <td><span class="pill ${r.status === '离职' ? 'muted' : 'lv-jingli'}">${esc(r.status || '在职')}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-sm" data-tedit="${i}" type="button">编辑</button>
        <button class="btn btn-sm btn-danger" data-tdel="${i}" type="button">删除</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="11"><div class="empty"><h3>没有匹配的人员</h3></div></td></tr>`;

  $$('#tutorTable [data-tedit]').forEach((b) => b.addEventListener('click', () => openTutorForm(rows[Number(b.dataset.tedit)])));
  $$('#tutorTable [data-tdel]').forEach((b) => b.addEventListener('click', async () => {
    const r = rows[Number(b.dataset.tdel)];
    if (!r) return;
    if (!confirm(`确认删除辅导架构人员「${r.name || r.empId || r.tutorId}」？删除后看板即时重算。`)) return;
    try {
      await api(`/api/admin/tutor/${encodeURIComponent(r.empId || r.tutorId || '')}`, { method: 'DELETE' });
      toast('已删除', 'ok');
      loadTutor();
    } catch (err) { toast(err.message, 'err'); }
  }));
}

function openTutorForm(row) {
  if (!row) return;
  const body = `
    <div class="form-grid">
      <div class="form-field"><label>工号</label><input class="control" id="tEmpId" value="${esc(row.empId || '')}"></div>
      <div class="form-field"><label>辅导老师</label><input class="control" id="tName" value="${esc(row.name || '')}"></div>
      <div class="form-field"><label>辅导ID</label><input class="control" id="tTutorId" value="${esc(row.tutorId || '')}"></div>
      <div class="form-field"><label>基地</label><input class="control" id="tBase" value="${esc(row.baseName || baseName(row.baseId) || row.baseId || '')}" placeholder="如：成都基地"></div>
      <div class="form-field"><label>年级学科</label><input class="control" id="tSubject" value="${esc(row.subject || '')}"></div>
      <div class="form-field"><label>层级</label>
        <select class="control" id="tLevel">
          ${['辅导老师', '组长', '主管', '基地负责人'].map((l) => `<option value="${l}" ${row.level === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>主管</label><input class="control" id="tMgr4" value="${esc(row.manager4 || '')}"></div>
      <div class="form-field"><label>组长</label><input class="control" id="tMgr5" value="${esc(row.manager5 || '')}"></div>
      <div class="form-field"><label>基地负责人</label><input class="control" id="tOwner" value="${esc(row.baseOwner || '')}"></div>
      <div class="form-field"><label>在职状态</label>
        <select class="control" id="tStatus">
          ${['在职', '离职'].map((s) => `<option value="${s}" ${(row.status || '在职') === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="alert mt-12">${icon('info', 15)}<div>保存后立即生效并重算看板；直属上级按层级自动带出（辅导老师→组长、组长→主管、主管→基地负责人）。</div></div>
  `;
  const box = openModal({
    title: `编辑辅导架构 · ${row.name || row.empId || row.tutorId || ''}`,
    subtitle: `工号 ${row.empId || '—'}${row.tutorId ? ' · 辅导ID ' + row.tutorId : ''}`,
    body,
    footer: `<button class="btn" id="tCancel" type="button">取消</button><button class="btn btn-primary" id="tSave" type="button">保存</button>`
  });
  box.querySelector('#tCancel').addEventListener('click', closeModal);
  box.querySelector('#tSave').addEventListener('click', async () => {
    const val = (id) => box.querySelector(id).value.trim();
    const payload = {
      empId: val('#tEmpId'),
      name: val('#tName'),
      tutorId: val('#tTutorId'),
      base: val('#tBase'),
      subject: val('#tSubject'),
      level: box.querySelector('#tLevel').value,
      manager4: val('#tMgr4'),
      manager5: val('#tMgr5'),
      baseOwner: val('#tOwner'),
      status: box.querySelector('#tStatus').value
    };
    if (!payload.name && !payload.empId && !payload.tutorId) { toast('请至少填写工号 / 辅导老师 / 辅导ID', 'err'); return; }
    try {
      await api(`/api/admin/tutor/${encodeURIComponent(row.empId || row.tutorId || '')}`, { method: 'PUT', body: { row: payload } });
      closeModal();
      toast('辅导架构已更新', 'ok');
      loadTutor();
    } catch (err) { toast(err.message, 'err'); }
  });
}

function tutorLevelPill(level) {
  const cls = { '基地负责人': 'lv-gaojing', '主管': 'lv-zhuguan', '组长': 'lv-zuzhang', '辅导老师': 'lv-yixian' }[level] || 'muted';
  return `<span class="pill ${cls}">${esc(level || '—')}</span>`;
}

function resetTutorFilters() {
  tutorState.base = 'all'; tutorState.mgr4 = 'all'; tutorState.level = 'all'; tutorState.st = 'all'; tutorState.q = '';
  const search = $('#tutorSearch');
  if (search) search.value = '';
  renderTutorFilters();
  renderTutorTable();
  const card = $('#tutorDetailCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openTutorMgrDetail() {
  const rows = tutorState.rows;
  const byName = {};
  rows.forEach((r) => {
    if (r.level !== '主管' || !r.name) return;
    if (!byName[r.name]) byName[r.name] = { m: r, count: 0 };
  });
  rows.forEach((r) => { if (r.manager4 && byName[r.manager4]) byName[r.manager4].count++; });
  const data = Object.values(byName).sort((a, b) => b.count - a.count);
  if (!data.length) { toast('暂无主管数据', 'err'); return; }
  openModal({
    title: '主管团队明细',
    subtitle: `共 ${data.length} 位主管 · 点击任意主管可筛选下方人员明细`,
    body: `<div class="table-wrap" style="max-height:480px"><table class="table">
      <thead><tr><th>主管</th><th>基地</th><th>年级学科</th><th class="num">在册人数</th></tr></thead>
      <tbody>${data.map(({ m, count }) => `
        <tr class="org-mgr-row" data-mgr="${esc(m.name)}">
          <td class="strong">${esc(m.name)}</td>
          <td>${esc(baseName(m.baseId))}</td>
          <td>${esc(m.subject || '—')}</td>
          <td class="num strong">${fmtInt(count)}</td>
        </tr>`).join('')}
      </tbody></table></div>`,
    onMount: (box) => {
      box.querySelectorAll('.org-mgr-row').forEach((tr) => {
        tr.addEventListener('click', () => {
          closeModal();
          tutorState.mgr4 = tr.dataset.mgr;
          tutorState.base = 'all'; tutorState.level = 'all'; tutorState.st = 'all';
          const search = $('#tutorSearch');
          if (search) search.value = '';
          renderTutorFilters();
          renderTutorTable();
          const card = $('#tutorDetailCard');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }
  });
}

function openTutorUpload() {
  openUploadWizard({
    title: '上传辅导架构',
    subtitle: '覆盖或追加辅导老师归属关系，按姓名自动推导层级',
    fileName: '辅导架构',
    fields: [
      { key: 'base', label: '基地', required: true, aliases: ['基地名称', '所属基地'] },
      { key: 'subject', label: '年级学科', required: false, aliases: ['学科', '年级/学科'] },
      { key: 'baseOwner', label: '基地负责人', required: false, aliases: ['负责人', '基地经理'] },
      { key: 'manager4', label: '主管', required: false },
      { key: 'manager5', label: '组长', required: false },
      { key: 'name', label: '辅导老师', required: true, aliases: ['老师', '老师姓名', '姓名'] },
      { key: 'tutorId', label: '辅导ID', required: false, aliases: ['辅导老师ID'] },
      { key: 'empId', label: '工号', required: false, aliases: ['员工工号', '员工编号'] },
      { key: 'status', label: '在职状态', required: false, aliases: ['状态'] }
    ],
    template: [{ 基地: '武汉基地', 年级学科: '初中数学', 基地负责人: '王建国', 主管: '孙丽', 组长: '周杰', 辅导老师: '李芳', 辅导ID: 'T1001', 工号: 'E2001', 在职状态: '在职' }],
    onConfirm: async (rows, mapping, mode) => {
      const r = await api('/api/admin/tutor/upload', { method: 'POST', body: { rows, mapping, mode } });
      await loadTutor();
      toast(`辅导架构已更新，共 ${fmtInt(r.total)} 条`, 'ok');
    }
  });
}

/* ---------------------------------------------------------------- 业绩目标 */
let targetState = { tab: 'directGj', period: '', scope: 'all' };

const TGT_TABS = [
  { key: 'directGj', label: '高经团队目标' },
  { key: 'directJl', label: '经理团队目标' }
];
const TGT_TAB_META = {
  directGj: { seg: 'targetDirectGj', isDirect: true, nameLabel: '高经', title: '高经团队目标明细（直推）', upload: '上传高经团队目标', empty: '高经团队直推目标' },
  directJl: { seg: 'targetDirectJl', isDirect: true, nameLabel: '经理', title: '经理团队目标明细（直推）', upload: '上传经理团队目标', empty: '经理团队直推目标' }
};

async function renderTargets() {
  $('#topActions').innerHTML = '';

  $('#view-targets').innerHTML = `
    <div class="alert">
      ${icon('info', 15)}
      <div>目标分两个上传窗口：<b>高经团队目标</b>与<b>经理团队目标</b>（都参与直推业绩完成度计算）。上传时字段映射自动识别，识别不到可手动指定列或统一指定起止时间（精确到秒）；写入时替换该类目标的全部数据。</div>
    </div>
    <div class="table-tabs" id="tgtTabs" style="margin:14px 0 0">
      ${TGT_TABS.map((t) => `<button class="table-tab ${targetState.tab === t.key ? 'active' : ''}" type="button" data-t="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="tgtBody" style="margin-top:14px"></div>
  `;

  $$('#tgtTabs [data-t]').forEach((btn) => {
    btn.addEventListener('click', () => {
      targetState.tab = btn.dataset.t;
      $$('#tgtTabs [data-t]').forEach((x) => x.classList.toggle('active', x === btn));
      renderTargetsBody();
    });
  });
  renderTargetsBody();
}

function renderTargetsBody() {
  const body = $('#tgtBody');
  const meta = TGT_TAB_META[targetState.tab];
  body.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div>
          <h2><span class="head-icon amber">${icon('target', 14)}</span>${meta.title}</h2>
          <p class="sub">${meta.isDirect ? '团队目标参与「直推业绩完成度」排名计算' : '参与「接例子业绩完成度」与「绩效完成度（直推40% + 接例子60%）」计算'} · 写入时替换该类目标</p>
        </div>
        <button class="btn btn-primary btn-sm" id="tgtPerfUpload" type="button">${icon('upload', 15)}${meta.upload}</button>
      </div>
      <div class="table-wrap" style="max-height:600px">
        <table class="table" id="tgtPerfTable">
          <thead><tr><th>月份 / 时间</th><th>${meta.nameLabel}</th><th class="num">目标值（元）</th><th class="num">销售直推业绩</th><th class="num">目标完成度</th><th class="num">暂时排名</th></tr></thead>
          <tbody><tr><td colspan="3"><div class="skeleton sk-line"></div></td></tr></tbody>
        </table>
      </div>
    </section>
  `;
  $('#tgtPerfUpload').addEventListener('click', () => openPerfTargetUpload(meta.seg));
  loadPerfTargets();
}

async function loadPerfTargets() {
  const meta = TGT_TAB_META[targetState.tab];
  try {
    const r = await api('/api/rankings?dataset=ds_deal&range=all');
    const p = r.perf || {};
    const list = (p.targets || {})[meta.seg === 'targetDirectGj' ? 'directGj' : meta.seg === 'targetDirectJl' ? 'directJl' : 'leads'] || [];
    // 直推业绩：按姓名从对应层级的架构数透结果取当月业绩
    const perfList = (p.direct || {})[meta.seg === 'targetDirectJl' ? 'jl' : 'gj'] || [];
    const perfByName = {};
    perfList.forEach((x) => { if (!perfByName[x.name]) perfByName[x.name] = x; });
    const amountOf = (t) => {
      const pf = perfByName[t.name];
      if (!pf) return null;
      if (t.month && t.month !== '全部' && pf.byMonth && pf.byMonth[t.month] !== undefined) return pf.byMonth[t.month];
      return pf.total || 0;
    };
    const TROPHY = ['🥇', '🥈', '🥉'];
    const enriched = list.map((t) => {
      const amount = amountOf(t);
      const rate = t.target > 0 && amount !== null ? amount / t.target : null;
      return { ...t, amount, rate };
    });
    // 暂时排名：同月内按目标完成度降序，无目标的排最后不计名次；前三名加金银铜奖杯
    const byMonth = {};
    enriched.forEach((t) => { (byMonth[t.month || '全部'] = byMonth[t.month || '全部'] || []).push(t); });
    Object.values(byMonth).forEach((group) => {
      group.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || (b.amount ?? 0) - (a.amount ?? 0));
      let rank = 0;
      group.forEach((t) => {
        if (t.rate === null) { t.rank = null; return; }
        rank += 1;
        t.rank = rank <= 3 ? `${rank} ${TROPHY[rank - 1]}` : String(rank);
      });
    });
    const sorted = enriched.slice().sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')) || (b.rate ?? -1) - (a.rate ?? -1) || (b.target || 0) - (a.target || 0));
    const rows = sorted.map((t) => `
      <tr>
        <td class="nowrap">${esc(t.month || '—')}${t.time && t.time !== t.month ? `<span class="text-xs muted" style="margin-left:6px">${esc(t.time)}</span>` : ''}</td>
        <td class="strong">${esc(t.name || '—')}</td>
        <td class="num">${fmtCompact(t.target || 0, 'money')}</td>
        <td class="num">${t.amount === null ? '<span class="muted">—</span>' : fmtCompact(t.amount, 'money')}</td>
        <td class="num">${t.rate === null ? '<span class="muted">—</span>' : `<b style="color:${t.rate >= 1 ? '#047857' : t.rate >= 0.85 ? '#b45309' : '#b91c1c'}">${(t.rate * 100).toFixed(0)}%</b>`}</td>
        <td class="num">${t.rank === null ? '<span class="muted">—</span>' : esc(t.rank)}</td>
      </tr>`).join('');
    $('#tgtPerfTable').querySelector('thead tr').innerHTML =
      `<th>月份 / 时间</th><th>${meta.nameLabel}</th><th class="num">目标值（元）</th><th class="num">销售直推业绩</th><th class="num">目标完成度</th><th class="num">暂时排名</th>`;
    $('#tgtPerfTable').querySelector('tbody').innerHTML = rows
      || `<tr><td colspan="6"><div class="empty"><h3>暂无${meta.empty}</h3><p>点击右上角「${meta.upload}」</p></div></td></tr>`;
  } catch (err) {
    $('#tgtPerfTable').querySelector('tbody').innerHTML = `<tr><td colspan="6"><div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div></td></tr>`;
  }
}

/** 高经团队目标 / 经理团队目标 / 接例子目标上传：字段映射自动识别，识别不到可人工指定（含统一指定起止时间，精确到秒） */
function openPerfTargetUpload(seg) {
  const cfg = {
    targetDirectGj: { title: '上传高经团队目标（直推）', name: '高经', tgt: '直推目标', label: '高经团队目标', tpl: [{ 月份: '2026-11', 高经: '梁鹏', 直推目标: 500000 }] },
    targetDirectJl: { title: '上传经理团队目标（直推）', name: '经理', tgt: '直推目标', label: '经理团队目标', tpl: [{ 月份: '2026-11', 经理: '刘敏', 直推目标: 200000 }] },
    targetLeads: { title: '上传接例子目标（高经）', name: '高经', tgt: '接例子目标', label: '接例子目标', tpl: [{ 月份: '2026-11', 高经: '梁鹏', 接例子目标: 300000 }] }
  }[seg];
  openUploadWizard({
    title: cfg.title,
    subtitle: '字段映射自动识别 · 识别不到可手动指定列或统一指定起止时间（精确到秒） · 写入时替换该类目标',
    fileName: cfg.label,
    fields: [
      { key: 'month', label: '月份', required: true, aliases: ['统计月份', '日期', '分配月份', '分配日期', '时间', '月份'] },
      { key: 'name', label: cfg.name, required: true, aliases: ['高经', '经理', '姓名', '负责人', '团队', `${cfg.name}团队`] },
      { key: 'target', label: cfg.tgt, required: true, aliases: ['目标', '目标金额', '月目标', `${cfg.name}团队目标`] }
    ],
    template: cfg.tpl,
    onConfirm: async (rows, mapping) => {
      await api('/api/admin/datasets/ds_deal/upload', {
        method: 'POST',
        body: { rows, fileName: cfg.label, mapping, mode: 'replace', segment: seg }
      });
      await refreshBootstrap();
      renderTargetsBody();
      toast(`${cfg.label}已写入 ${fmtInt(rows.length)} 条，业绩完成度将按新目标计算`, 'ok');
    }
  });
}


/* ---------------------------------------------------------------- 通用上传向导 */
function openUploadWizard({ title, subtitle, fields, template, onConfirm, fileName }) {
  let rows = [];
  let columns = [];
  let mapping = {};
  let parsedMeta = null;

  const box = openModal({
    title, subtitle, wide: true,
    body: `
      <div id="uwStep1">
        <div class="dropzone" id="uwDz">
          <div class="dz-ic">${icon('upload', 19)}</div>
          <h3>点击选择文件，或拖拽到此处</h3>
          <p>支持 .xlsx / .xls / .csv，先预览再确认，不会直接覆盖</p>
        </div>
        <input type="file" id="uwFile" class="hidden" accept=".xlsx,.xls,.csv">
        <div class="flex gap-8 mt-12">
          <button class="btn btn-sm" id="uwTpl" type="button">${icon('download', 13)}下载模板</button>
          <span class="text-xs muted" style="align-self:center">列名：${fields.map((f) => f.label).join(' / ')}</span>
        </div>
      </div>
      <div id="uwStep2" class="hidden"></div>
    `
  });

  const dz = box.querySelector('#uwDz');
  const input = box.querySelector('#uwFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault(); dz.classList.remove('drag');
    if (e.dataTransfer.files[0]) await read(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', async () => { if (input.files[0]) await read(input.files[0]); });
  box.querySelector('#uwTpl').addEventListener('click', () => {
    downloadCsv(`${fileName || '导入'}-模板.csv`, template, Object.keys(template[0]).map((c) => ({ label: c, value: c })));
    toast('模板已下载', 'ok');
  });

  async function read(file) {
    try {
      const parsed = await parseFile(file, fields.flatMap((f) => [f.label, ...(f.aliases || [])]));
      if (!parsed.rows.length) throw new Error('文件中没有数据行');
      parsedMeta = parsed;
      rows = parsed.rows;
      columns = parsed.columns;
      mapping = {};
      Object.keys(wizManual).forEach((k) => { delete wizManual[k]; });
      fields.forEach((f) => { mapping[f.key] = autoMatch(f, columns); if (mapping[f.key]) delete wizManual[f.key]; });
      renderStep2(file.name);
    } catch (err) { toast(err.message, 'err'); }
  }

  const wizManual = {};
  const wizManualVal = (key) => (wizManual[key] ? wizManual[key] + (wizManual[`${key}__to`] ? ` ~ ${wizManual[`${key}__to`]}` : '') : '');
  const isTimeField = (f) => f.key === 'month' || f.key === 'period';

  function renderStep2(name) {
    const missing = fields.filter((f) => f.required && !mapping[f.key] && !wizManual[f.key]);
    const previewFields = fields.filter((f) => mapping[f.key] || wizManual[f.key]);
    box.querySelector('#uwStep1').classList.add('hidden');
    const step2 = box.querySelector('#uwStep2');
    step2.classList.remove('hidden');
    step2.innerHTML = `
      <div class="upload-summary">
        <span class="pill ok">文件 <b>${esc(name)}</b></span>
        <span class="pill">行数 <b>${fmtInt(rows.length)}</b></span>
        <span class="pill">列数 <b>${columns.length}</b></span>
        ${parsedMeta && parsedMeta.subTables > 1 ? `<span class="pill ok">识别到 ${parsedMeta.subTables} 个同结构子表，已合并</span>` : ''}
        <span class="pill ${missing.length ? 'err' : 'ok'}">${missing.length ? `缺少必填：${missing.map((f) => f.label).join('、')}` : '必填字段已匹配'}</span>
      </div>
      <div class="card" style="box-shadow:none">
        <div class="card-head"><div><h2>字段映射</h2><p class="sub">自动识别列对应关系，识别不到可手动指定列或统一指定值（应用到所有行）</p></div></div>
        <div class="table-wrap">
          <table class="map-table">
            <thead><tr><th style="width:190px">标准字段</th><th>底表列</th><th style="width:160px">样例</th></tr></thead>
            <tbody>
              ${fields.map((f) => `
                <tr class="${(mapping[f.key] || wizManual[f.key]) ? '' : 'unmapped'}">
                  <td><span class="std-key">${esc(f.label)} ${f.required ? '<span class="req">*</span>' : ''}</span></td>
                  <td>
                    <select class="control" data-k="${f.key}">
                      <option value="">— 不映射 —</option>
                      ${columns.map((c) => `<option value="${esc(c)}" ${mapping[f.key] === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                    </select>
                    ${!mapping[f.key] && isTimeField(f) ? `<div style="margin-top:6px;display:flex;gap:6px;align-items:center">
                      <span class="text-xs muted" style="white-space:nowrap">起止时间</span>
                      <input class="control" data-mf="${f.key}" type="datetime-local" step="1" value="${esc(wizManual[f.key] || '')}" placeholder="起始时间" style="flex:1;min-width:150px">
                      <span class="text-xs muted">至</span>
                      <input class="control" data-mt="${f.key}" type="datetime-local" step="1" value="${esc(wizManual[`${f.key}__to`] || '')}" placeholder="结束时间" style="flex:1;min-width:150px">
                    </div>` : !mapping[f.key] ? `<input class="control" data-m="${f.key}" type="text" value="${esc(wizManual[f.key] || '')}" placeholder="或统一指定值，应用到所有行" style="margin-top:6px">` : ''}
                  </td>
                  <td><div class="sample" data-s="${f.key}">${esc(mapping[f.key] ? rows[0][mapping[f.key]] ?? '' : (wizManualVal(f.key) ? `(统一指定) ${wizManualVal(f.key)}` : '—'))}</div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card" style="box-shadow:none;margin-top:12px">
        <div class="card-head"><div><h2>数据预览</h2><p class="sub">前 6 行（含统一指定值）</p></div></div>
        <div class="table-wrap" style="max-height:200px">
          <table class="table"><thead><tr>${previewFields.map((f) => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
          <tbody>${rows.slice(0, 6).map((r) => `<tr>${previewFields.map((f) => `<td>${esc(mapping[f.key] ? (r[mapping[f.key]] ?? '') : wizManualVal(f.key))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="form-grid mt-16">
        <div class="form-field full"><label>写入方式</label>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="uwmode" value="replace" checked><span><b>覆盖全部</b><span>以本次文件为准</span></span></label>
            <label class="radio-card"><input type="radio" name="uwmode" value="append"><span><b>追加</b><span>保留已有记录</span></span></label>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="uwBack" type="button">重新选择</button>
        <button class="btn btn-primary" id="uwGo" type="button" ${missing.length ? 'disabled' : ''}>确认写入</button>
      </div>
    `;

    step2.querySelectorAll('[data-k]').forEach((sel) => {
      sel.addEventListener('change', () => {
        mapping[sel.dataset.k] = sel.value;
        if (sel.value) delete wizManual[sel.dataset.k];
        renderStep2(name);
      });
    });
    step2.querySelectorAll('[data-m]').forEach((inp) => {
      inp.addEventListener('change', () => {
        wizManual[inp.dataset.m] = inp.value.trim();
        renderStep2(name);
      });
    });
    step2.querySelectorAll('[data-mf], [data-mt]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.mf || inp.dataset.mt;
        if (inp.dataset.mf) wizManual[key] = inp.value.trim().replace('T', ' ');
        else wizManual[`${key}__to`] = inp.value.trim().replace('T', ' ');
        renderStep2(name);
      });
    });
    step2.querySelector('#uwBack').addEventListener('click', () => {
      step2.classList.add('hidden');
      box.querySelector('#uwStep1').classList.remove('hidden');
    });
    step2.querySelector('#uwGo').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '写入中…';
      try {
        const mode = step2.querySelector('input[name="uwmode"]:checked').value;
        // 统一手动指定的未映射字段：把常量值写入每一行（服务端按 标准字段label 取列）
        const outRows = rows.map((r) => {
          const o = { ...r };
          fields.forEach((f) => {
            if (mapping[f.key] || !wizManual[f.key]) return;
            const val = wizManualVal(f.key);
            if (val) o[f.label] = val;
          });
          return o;
        });
        await onConfirm(outRows, mapping, mode);
        closeModal();
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
        btn.textContent = '确认写入';
      }
    });
  }
}

/* ---------------------------------------------------------------- 数据管理（名单 CRUD） */
const RecAdmin = { dataset: '', base: 'all', status: 'all', q: '', page: 1, pageSize: 20, data: null, statuses: [] };

function renderRecords() {
  if (!RecAdmin.dataset) RecAdmin.dataset = (App.datasets[0] || {}).id || '';
  $('#topActions').innerHTML = `
    <span class="chip"><span class="dot"></span>修改后看板即时重算</span>
    <button class="btn btn-primary" id="addRecord" type="button">${icon('plus', 15)}新增名单</button>`;

  $('#view-records').innerHTML = `
    <section class="card" style="overflow:hidden">
      <div class="card-body" style="border-bottom:1px solid var(--line)">
        <div class="records-toolbar" style="margin-bottom:0">
          <div class="field">
            <label>数据类别</label>
            <select class="control" id="recDataset" style="min-width:180px">
              ${App.datasets.map((d) => `<option value="${d.id}" ${d.id === RecAdmin.dataset ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>基地</label>
            <select class="control" id="recBase"><option value="all">全部基地</option></select>
          </div>
          <div class="field">
            <label>状态</label>
            <select class="control" id="recStatus"><option value="all">全部状态</option></select>
          </div>
          <div class="field">
            <input class="control search" id="recSearch" type="search" placeholder="搜索姓名 / 手机 / 负责人 / 工号">
          </div>
          <div class="spacer"></div>
          <button class="btn btn-sm" id="recReset" type="button">重置</button>
        </div>
      </div>
      <div class="table-wrap" style="max-height:60vh">
        <table class="table" id="recTable">
          <thead><tr><th>行号</th><th>客户</th><th>手机号</th><th>基地</th><th>状态</th><th>渠道</th><th>负责人</th><th>日期</th><th style="text-align:right">操作</th></tr></thead>
          <tbody><tr><td colspan="9"><div class="skeleton sk-line"></div></td></tr></tbody>
        </table>
      </div>
      <div class="table-footer">
        <span id="recPageInfo">—</span>
        <div class="pager" id="recPager"></div>
      </div>
    </section>
    <div class="alert">
      ${icon('info', 15)}
      <div>此处为<b>完整信息</b>（不脱敏）。单条修改 / 新增 / 删除会直接写入底表并即时重算看板；如需保留数据快照，请到「版本记录」发布版本。</div>
    </div>
  `;

  $('#recDataset').addEventListener('change', (e) => {
    RecAdmin.dataset = e.target.value; RecAdmin.status = 'all'; RecAdmin.page = 1;
    loadRecRows();
  });
  $('#recBase').innerHTML = `<option value="all">全部基地</option>`
    + App.bases.map((b) => `<option value="${b.id}" ${RecAdmin.base === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  $('#recBase').addEventListener('change', (e) => { RecAdmin.base = e.target.value; RecAdmin.page = 1; loadRecRows(); });
  $('#recStatus').addEventListener('change', (e) => { RecAdmin.status = e.target.value; RecAdmin.page = 1; loadRecRows(); });
  $('#recSearch').addEventListener('input', debounce(() => { RecAdmin.q = $('#recSearch').value.trim(); RecAdmin.page = 1; loadRecRows(); }, 300));
  $('#recReset').addEventListener('click', () => {
    RecAdmin.base = 'all'; RecAdmin.status = 'all'; RecAdmin.q = ''; RecAdmin.page = 1;
    $('#recBase').value = 'all'; $('#recSearch').value = '';
    loadRecRows();
  });
  $('#addRecord').addEventListener('click', () => openRecordForm(null));

  loadRecRows();
}

async function loadRecRows() {
  const p = new URLSearchParams({ dataset: RecAdmin.dataset, page: RecAdmin.page, pageSize: RecAdmin.pageSize });
  if (RecAdmin.base !== 'all') p.set('base', RecAdmin.base);
  if (RecAdmin.status !== 'all') p.set('status', RecAdmin.status);
  if (RecAdmin.q) p.set('q', RecAdmin.q);
  try {
    const d = await api(`/api/admin/records?${p.toString()}`);
    RecAdmin.data = d;
    const cur = $('#recStatus').value;
    $('#recStatus').innerHTML = `<option value="all">全部状态</option>`
      + (d.statuses || []).map((s) => `<option value="${esc(s)}" ${cur === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#recTable tbody').innerHTML = d.rows.length ? d.rows.map((r) => `
      <tr>
        <td class="muted mono text-xs">${r._rowNo}</td>
        <td class="strong">${esc(r.customer || '—')}</td>
        <td class="mono text-sm">${esc(r.phone || '—')}</td>
        <td>${esc(r.baseName || '—')}</td>
        <td>${r.status ? `<span class="badge st-${esc(r.status)}">${esc(r.status)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${esc(r.channel || '—')}</td>
        <td>${esc(r.empName || '—')}${r.empId ? `<div class="text-xs muted mono">${esc(r.empId)}</div>` : ''}</td>
        <td class="nowrap muted">${esc(r.date || '—')}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-sm" data-edit="${r._rowNo}" type="button">编辑</button>
          <button class="btn btn-sm btn-danger" data-del="${r._rowNo}" type="button">删除</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="9"><div class="empty"><h3>没有符合条件的记录</h3><p>调整筛选或新增一条名单</p></div></td></tr>`;

    $('#recPageInfo').textContent = d.total ? `共 ${fmtInt(d.total)} 条 · 第 ${d.page} / ${d.pages} 页` : '—';
    renderRecPager(d);

    $$('#recTable [data-edit]').forEach((b) => b.addEventListener('click', () => {
      const row = d.rows.find((r) => String(r._rowNo) === b.dataset.edit);
      openRecordForm(row);
    }));
    $$('#recTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('确认删除这条记录？删除后看板将即时重算。')) return;
      try {
        await api(`/api/admin/records/${b.dataset.del}?dataset=${RecAdmin.dataset}`, { method: 'DELETE' });
        toast('已删除', 'ok');
        loadRecRows();
      } catch (err) { toast(err.message, 'err'); }
    }));
  } catch (err) {
    toast(err.message, 'err');
  }
}

function renderRecPager(d) {
  const wrap = $('#recPager');
  let start = Math.max(1, d.page - 3);
  let end = Math.min(d.pages, start + 6);
  start = Math.max(1, end - 6);
  const btn = (p, label, opts = {}) => `<button ${opts.disabled ? 'disabled' : ''} class="${p === d.page && !opts.jump ? 'active' : ''}" data-p="${p}" type="button">${label}</button>`;
  let html = btn(d.page - 1, '‹', { disabled: d.page <= 1, jump: true });
  for (let p = start; p <= end; p += 1) html += btn(p, String(p));
  html += btn(d.page + 1, '›', { disabled: d.page >= d.pages, jump: true });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-p]').forEach((b) => {
    b.addEventListener('click', () => { RecAdmin.page = Number(b.dataset.p); loadRecRows(); });
  });
}

function openRecordForm(row) {
  const isNew = !row;
  const body = `
    <div class="form-grid">
      <div class="form-field"><label>客户姓名</label><input class="control" id="rCustomer" value="${esc(row ? row.customer : '')}" placeholder="客户真实姓名"></div>
      <div class="form-field"><label>手机号</label><input class="control" id="rPhone" value="${esc(row ? row.phone : '')}" placeholder="11 位手机号"></div>
      <div class="form-field"><label>基地</label>
        <select class="control" id="rBase">
          <option value="">—</option>
          ${App.bases.map((b) => `<option value="${b.id}" ${row && row.baseId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>状态</label><input class="control" id="rStatus" value="${esc(row ? row.status : '')}" placeholder="如：待跟进 / 已转化"></div>
      <div class="form-field"><label>负责人工号</label><input class="control" id="rEmpId" value="${esc(row ? row.empId : '')}" placeholder="如 E1001（用于架构匹配）"></div>
      <div class="form-field"><label>负责人姓名</label><input class="control" id="rEmpName" value="${esc(row ? row.empName : '')}" placeholder="可留空，按工号自动带出"></div>
      <div class="form-field"><label>渠道</label><input class="control" id="rChannel" value="${esc(row ? row.channel : '')}" placeholder="如：社群运营"></div>
      <div class="form-field"><label>日期</label><input class="control" type="date" id="rDate" value="${esc(row ? row.date : new Date().toISOString().slice(0, 10))}"></div>
      <div class="form-field full"><label>金额（可选，仅成交类底表使用）</label><input class="control" id="rAmount" value="${row && row.amount ? row.amount : ''}" placeholder="数字"></div>
    </div>
    <div class="alert mt-12">${icon('info', 15)}<div>${isNew ? '新增记录将写入所选数据类别的底表末尾。' : '仅修改填写的内容，留空字段不会覆盖原值（基地 / 状态等请按需选择）。'}</div></div>
  `;
  const box = openModal({
    title: isNew ? '新增名单' : `编辑名单 · 第 ${row._rowNo} 行`,
    subtitle: (App.datasets.find((d) => d.id === RecAdmin.dataset) || {}).name || '',
    body,
    footer: `<button class="btn" id="recCancel" type="button">取消</button><button class="btn btn-primary" id="recSave" type="button">保存</button>`
  });
  box.querySelector('#recCancel').addEventListener('click', closeModal);
  box.querySelector('#recSave').addEventListener('click', async () => {
    const record = {
      customer: box.querySelector('#rCustomer').value.trim(),
      phone: box.querySelector('#rPhone').value.trim(),
      base: box.querySelector('#rBase').value,
      status: box.querySelector('#rStatus').value.trim(),
      empId: box.querySelector('#rEmpId').value.trim(),
      empName: box.querySelector('#rEmpName').value.trim(),
      channel: box.querySelector('#rChannel').value.trim(),
      date: box.querySelector('#rDate').value,
      amount: box.querySelector('#rAmount').value.trim()
    };
    if (!record.customer && !record.phone) { toast('请至少填写客户姓名或手机号', 'err'); return; }
    try {
      if (isNew) {
        await api('/api/admin/records', { method: 'POST', body: { dataset: RecAdmin.dataset, record } });
      } else {
        await api(`/api/admin/records/${row._rowNo}?dataset=${RecAdmin.dataset}`, { method: 'PUT', body: { record } });
      }
      closeModal();
      toast(isNew ? '名单已新增' : '名单已更新', 'ok');
      loadRecRows();
    } catch (err) { toast(err.message, 'err'); }
  });
}

function openBaseForm(base, reload) {
  const isNew = !base;
  const body = `
    <div class="form-grid">
      <div class="form-field"><label>基地名称</label><input class="control" id="bName" value="${esc(base ? base.name : '')}" placeholder="如：武汉基地"></div>
      <div class="form-field"><label>编码（英文缩写）</label><input class="control" id="bCode" value="${esc(base ? base.code : '')}" placeholder="如 WH" ${isNew ? '' : ''}></div>
      <div class="form-field"><label>主题色</label>
        <div class="input-group">
          <input class="control" type="color" id="bColorPick" value="${esc(base ? base.color : '#3b82f6')}" style="width:52px;padding:2px">
          <input class="control" id="bColor" value="${esc(base ? base.color : '#3b82f6')}" placeholder="#3b82f6">
        </div>
      </div>
      <div class="form-field"><label>排序（数字越小越靠前）</label><input class="control" type="number" id="bSort" value="${base ? base.sort : App.bases.length + 1}"></div>
      <div class="form-field full"><label>状态</label>
        <div class="radio-cards">
          <label class="radio-card"><input type="radio" name="bStatus" value="active" ${!base || base.status === 'active' ? 'checked' : ''}><span><b>启用</b><span>前台正常展示</span></span></label>
          <label class="radio-card"><input type="radio" name="bStatus" value="disabled" ${base && base.status === 'disabled' ? 'checked' : ''}><span><b>停用</b><span>前台隐藏，数据保留</span></span></label>
        </div>
      </div>
    </div>`;
  const box = openModal({
    title: isNew ? '新增基地' : `编辑基地 · ${base.name}`,
    subtitle: '基地配置同步前台筛选与图表配色',
    body,
    footer: `<button class="btn" id="bCancel" type="button">取消</button><button class="btn btn-primary" id="bSave" type="button">保存</button>`
  });
  const pick = box.querySelector('#bColorPick');
  pick.addEventListener('input', () => { box.querySelector('#bColor').value = pick.value; });
  box.querySelector('#bCancel').addEventListener('click', closeModal);
  box.querySelector('#bSave').addEventListener('click', async () => {
    const payload = {
      name: box.querySelector('#bName').value.trim(),
      code: box.querySelector('#bCode').value.trim(),
      color: box.querySelector('#bColor').value.trim(),
      sort: Number(box.querySelector('#bSort').value) || 0,
      status: box.querySelector('input[name="bStatus"]:checked').value
    };
    if (!payload.name) { toast('请填写基地名称', 'err'); return; }
    try {
      if (isNew) {
        await api('/api/admin/bases', { method: 'POST', body: payload });
      } else {
        await api(`/api/admin/bases/${base.id}`, { method: 'PUT', body: payload });
      }
      closeModal();
      toast(isNew ? '基地已创建' : '基地已更新', 'ok');
      await refreshBootstrap();
      reload();
    } catch (err) { toast(err.message, 'err'); }
  });
}

/* ---------------------------------------------------------------- 展示配置 */
function renderSettings() {
  const s = App.settings || {};
  $('#topActions').innerHTML = `<span class="chip"><span class="dot"></span>保存后立即影响前台展示</span>`;
  const allCols = ['customer', 'phone', 'base', 'status', 'channel', 'empName', 'date'];
  const colLabels = { customer: '客户姓名', phone: '手机号', base: '基地', status: '状态', channel: '渠道', empName: '负责人', date: '日期' };
  const checkedCols = (s.recordColumns && s.recordColumns.length) ? s.recordColumns : allCols;

  $('#view-settings').innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h2><span class="head-icon">${icon('sliders', 14)}</span>展示配置</h2>
          <p class="sub">修改后立即影响前台展示，不会改动历史数据</p></div>
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-field"><label>看板标题</label><input class="control" id="setTitle" value="${esc(s.title || '')}" placeholder="转介绍数据看板"></div>
          <div class="form-field"><label>副标题</label><input class="control" id="setSubtitle" value="${esc(s.subtitle || '')}" placeholder="基地经营 · 转介绍名单与转化"></div>
          <div class="form-field full"><label>顶部公告（留空不显示）</label>
            <textarea class="control" id="setAnnouncement" rows="2" placeholder="例如：本期数据更新至 11 月 30 日，请各基地及时跟进。">${esc(s.announcement || '')}</textarea></div>
          <div class="form-field full"><label>数据说明（前台页脚）</label>
            <textarea class="control" id="setDataNote" rows="2">${esc(s.dataNote || '')}</textarea></div>
          <div class="form-field full"><label>业绩排行 · 榜单备注（前台排行页顶部）</label>
            <textarea class="control" id="setRankingsNote" rows="2" placeholder="例如：本期数据截止 11 月 30 日，达成率以月初目标为准。">${esc(s.rankingsNote || '')}</textarea></div>
          <div class="form-field full"><label>前台展示的 KPI（按数据类别）</label>
            <div class="check-grid">
              ${App.datasets.map((d) => `
                <div style="grid-column:1/-1;padding:4px 0">
                  <div class="text-xs muted" style="font-weight:600;margin-bottom:6px">${esc(d.name)}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${(d.metrics || []).map((m) => {
                      const allow = (s.kpiToggles && s.kpiToggles[d.id]) || null;
                      const on = !allow || allow.includes(m.key);
                      return `<label class="check-item"><input type="checkbox" data-kpi="${d.id}|${m.key}" ${on ? 'checked' : ''}>${esc(m.name)}</label>`;
                    }).join('')}
                  </div>
                </div>`).join('')}
            </div>
          </div>
          <div class="form-field full"><label>明细名单页展示列</label>
            <div class="check-grid">
              ${allCols.map((c) => `<label class="check-item"><input type="checkbox" data-col="${c}" ${checkedCols.includes(c) ? 'checked' : ''}>${colLabels[c]}</label>`).join('')}
            </div>
          </div>
        </div>
        <div class="modal-foot" style="box-shadow:none;padding:12px 0 0">
          <button class="btn btn-primary" id="saveSettings" type="button">保存配置</button>
        </div>
      </div>
    </section>
    ${(() => {
      const kocDs = (App.datasets || []).find((d) => d.preset === 'koc');
      if (!kocDs) return '';
      const cfg = (kocDs.kocConfig) || { t1: 6, t2: 3, colors: { t1: '#e0a93e', t2: '#b48cc8', t3: '#5b9bd5', t4: '#5bbf8a' } };
      const chips = [
        ['t1', `最高层级（历史累计≥${cfg.t1}）`, cfg.colors.t1],
        ['t2', `第二层（历史累计${cfg.t2}-${cfg.t1}）`, cfg.colors.t2],
        ['t3', '26年推荐成功', cfg.colors.t3],
        ['t4', '未入选', cfg.colors.t4]
      ];
      return `
    <section class="card" style="margin-top:14px">
      <div class="card-head">
        <div><h2><span class="head-icon" style="background:color-mix(in srgb, #8b5cf6 14%, white);color:#7c3aed">${icon('spark', 14)}</span>KOC 高潜名单分层配置</h2>
          <p class="sub">划分阈值与层级颜色仅管理员可调（原前台按钮已迁移至此），前台「明细数据 → 高潜老用户跟进表」按此配置展示</p></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="admKocTierBtn" type="button">${icon('layers', 13)}划分层级</button>
          <button class="btn btn-sm" id="admKocColorBtn" type="button">${icon('spark', 13)}层级颜色</button>
        </div>
      </div>
      <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${chips.map(([k, label, hex]) => `<span class="koc-tier" style="background:color-mix(in srgb, ${hex} 16%, white);color:color-mix(in srgb, ${hex} 62%, black);border:1px solid color-mix(in srgb, ${hex} 32%, white)">${esc(label)}</span>`).join('')}
        <span class="text-xs muted" style="margin-left:auto">${esc(kocDs.name)} · ${fmtInt(kocDs.rowCount)} 行 · 阈值：历史累计≥${cfg.t1} 为最高层，${cfg.t2}-${cfg.t1} 为第二层</span>
      </div>
    </section>`;
    })()}`;

  $('#saveSettings').addEventListener('click', async () => {
    const kpiToggles = {};
    $$('#view-settings [data-kpi]').forEach((cb) => {
      const [dsId, key] = cb.dataset.kpi.split('|');
      if (!kpiToggles[dsId]) kpiToggles[dsId] = [];
      if (cb.checked) kpiToggles[dsId].push(key);
    });
    // 若某数据集全选，等价于不配置（保持简洁）
    App.datasets.forEach((d) => {
      if (kpiToggles[d.id] && kpiToggles[d.id].length === (d.metrics || []).length) delete kpiToggles[d.id];
    });
    const recordColumns = $$('#view-settings [data-col]').filter((cb) => cb.checked).map((cb) => cb.dataset.col);
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          title: $('#setTitle').value.trim(),
          subtitle: $('#setSubtitle').value.trim(),
          announcement: $('#setAnnouncement').value.trim(),
          dataNote: $('#setDataNote').value.trim(),
          rankingsNote: $('#setRankingsNote').value.trim(),
          kpiToggles,
          recordColumns
        }
      });
      await refreshBootstrap();
      toast('配置已保存，前台即时生效', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });

  // KOC 分层配置（仅管理员，原前台按钮迁移至此）
  const kocTierBtn = $('#admKocTierBtn');
  const kocColorBtn = $('#admKocColorBtn');
  if (kocTierBtn) kocTierBtn.addEventListener('click', openAdmKocTierModal);
  if (kocColorBtn) kocColorBtn.addEventListener('click', openAdmKocColorModal);
}

/* ---------------- KOC 分层配置弹窗（仅管理员，2.12 自前台迁移） ---------------- */
function admKocDataset() { return (App.datasets || []).find((d) => d.preset === 'koc') || null; }
function admKocCfg() {
  const ds = admKocDataset();
  return (ds && ds.kocConfig) || { t1: 6, t2: 3, colors: { t1: '#e0a93e', t2: '#b48cc8', t3: '#5b9bd5', t4: '#5bbf8a' } };
}
async function admSaveKocConfig(body) {
  const ds = admKocDataset();
  if (!ds) { toast('未找到高潜名单底表', 'err'); return; }
  try {
    const r = await api('/api/admin/koc-config', { method: 'POST', body: { datasetId: ds.id, ...body } });
    if (ds) ds.kocConfig = r.config;
    closeModal();
    renderSettings();
    const summary = Object.entries(r.counts || {}).map(([k, v]) => `${k} ${fmtInt(v)}`).join(' · ');
    toast(`已保存并重算：${summary}`, 'ok');
  } catch (err) { toast(err.message, 'err'); }
}

function openAdmKocTierModal() {
  const cfg = admKocCfg();
  openModal({
    title: '划分层级设置',
    subtitle: '按「累计新正价用户数量」划分名单层级，保存后全表自动重算',
    body: `
      <div class="form-grid">
        <div class="form-field"><label>最高层级阈值（累计新正价用户数量 ≥ 此值）</label>
          <input class="control" id="kocT1" type="number" min="1" step="1" value="${cfg.t1}"></div>
        <div class="form-field"><label>第二层阈值（≥ 此值且低于最高层级阈值）</label>
          <input class="control" id="kocT2" type="number" min="0" step="1" value="${cfg.t2}"></div>
      </div>
      <div class="alert" style="margin-top:14px">
        ${icon('info', 15)}
        <div>分层规则：<b>最高层级</b> = 累计新正价 ≥ 最高阈值（如填 <b>10</b>，则累计新正价大于等于 10 的用户为最高层级）；<b>第二层</b> = 累计新正价 ≥ 第二阈值且未达最高层；<b>26年推荐成功</b> = 26年新正价 &gt; 0 且不在前两层；其余为<b>未入选</b>。重合备注 = 累计新正价 ≥ 第二阈值 且 26年新正价 &gt; 0。</div>
      </div>`,
    footer: `
      <button class="btn" id="kocTierCancel" type="button">取消</button>
      <button class="btn btn-primary" id="kocTierSave" type="button">保存并重算</button>`,
    onMount: (box) => {
      box.querySelector('#kocTierCancel').addEventListener('click', closeModal);
      box.querySelector('#kocTierSave').addEventListener('click', () => {
        const t1 = parseInt(box.querySelector('#kocT1').value, 10);
        const t2 = parseInt(box.querySelector('#kocT2').value, 10);
        if (!Number.isFinite(t1) || t1 < 1) { toast('最高层级阈值必须是不小于 1 的整数', 'err'); return; }
        admSaveKocConfig({ t1, t2: Number.isFinite(t2) ? t2 : 0, colors: {} });
      });
    }
  });
}

function openAdmKocColorModal() {
  const cfg = admKocCfg();
  const items = [
    ['t1', `最高层级（当前：历史累计≥${cfg.t1}）`, cfg.colors.t1],
    ['t2', `第二层（当前：历史累计${cfg.t2}-${cfg.t1}）`, cfg.colors.t2],
    ['t3', '26年推荐成功', cfg.colors.t3],
    ['t4', '未入选', cfg.colors.t4]
  ];
  openModal({
    title: '层级颜色设置',
    subtitle: '为各 KOC 层级标签挑选颜色，保存后前台立即生效',
    body: `
      <div class="form-grid">
        ${items.map(([k, label, hex]) => `
          <div class="form-field"><label>${esc(label)}</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="color" id="kocColor_${k}" value="${hex}" style="width:44px;height:34px;padding:2px;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:pointer">
              <span class="mono text-sm muted">${hex}</span>
            </div>
          </div>`).join('')}
      </div>
      <div class="alert" style="margin-top:14px">
        ${icon('info', 15)}
        <div>标签底色与文字颜色会按所选颜色自动生成淡色样式。</div>
      </div>`,
    footer: `
      <button class="btn" id="kocColorCancel" type="button">取消</button>
      <button class="btn btn-primary" id="kocColorSave" type="button">保存颜色</button>`,
    onMount: (box) => {
      box.querySelector('#kocColorCancel').addEventListener('click', closeModal);
      box.querySelector('#kocColorSave').addEventListener('click', () => {
        const colors = {};
        items.forEach(([k]) => {
          const v = box.querySelector(`#kocColor_${k}`).value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) colors[k] = v;
        });
        admSaveKocConfig({ t1: cfg.t1, t2: cfg.t2, colors });
      });
    }
  });
}

/* ---------------------------------------------------------------- 飞书同步 */
async function renderFeishu() {
  const el = $('#view-feishu');
  let data;
  try {
    data = await api('/api/admin/feishu');
  } catch (err) {
    el.innerHTML = `<div class="alert err">${icon('alert', 15)}<div>${esc(err.message)}</div></div>`;
    return;
  }
  const cfg = data.feishu || {};
  const ready = Boolean(cfg.appId && cfg.appSecretConfigured && cfg.appToken);
  const bound = (data.datasets || []).filter((d) => d.tableId);

  const last = cfg.lastSync;
  const lastHtml = !last ? '<span class="muted">尚未同步</span>' : `
    <div class="text-sm">${last.at} · 由 ${esc(last.by)} 执行 · 共写入 <b>${fmtInt(last.total || 0)}</b> 行</div>
    ${last.errors && Object.keys(last.errors).length ? `<div class="text-xs" style="color:var(--danger)">失败：${Object.values(last.errors).map((e) => esc(e.name) + '（' + esc(e.error) + '）').join('、')}</div>` : ''}`;

  $('#topActions').innerHTML = `<button class="btn btn-primary" id="syncNow" type="button" ${ready && bound.length ? '' : 'disabled'}>${icon('cloud', 15)}立即同步</button>`;

  el.innerHTML = `
    <div class="alert ${ready ? '' : 'err'}">
      ${icon(ready ? 'info' : 'alert', 15)}
      <div>${ready
        ? `飞书配置已就绪，已绑定 <b>${bound.length}</b> 张数据表；同步将<strong>覆盖</strong>对应底表现有数据。App Secret 仅保存在服务端，前台不可见。`
        : '尚未完成飞书配置：请填写 App ID / App Secret / 多维表格 app_token，并为数据集绑定数据表后即可同步。<a href="https://open.feishu.cn" target="_blank" rel="noopener">飞书开放平台</a> 创建企业自建应用并开通 bitable 只读权限。'}</div>
    </div>

    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-label">配置状态</div><div class="kpi-value">${ready ? '已就绪' : '未配置'}</div><div class="kpi-foot">${cfg.appId ? 'App ID 已填写' : '缺少 App ID'}</div><div class="kpi-ic">${icon('key', 14)}</div></div>
      <div class="kpi" data-tone="violet"><div class="kpi-label">绑定数据表</div><div class="kpi-value">${bound.length} / ${(data.datasets || []).length}</div><div class="kpi-foot">每张表对应一类底表</div><div class="kpi-ic">${icon('database', 14)}</div></div>
      <div class="kpi" data-tone="green"><div class="kpi-label">自动同步</div><div class="kpi-value">${cfg.autoSyncMinutes ? `${cfg.autoSyncMinutes} 分钟` : '关闭'}</div><div class="kpi-foot">${cfg.autoSyncMinutes ? '后台定时拉取飞书' : '仅手动点击同步'}</div><div class="kpi-ic">${icon('calendar', 14)}</div></div>
      <div class="kpi" data-tone="amber"><div class="kpi-label">最近同步</div><div class="kpi-value">${last ? fmtInt(last.total || 0) : '—'}</div><div class="kpi-foot">${last ? esc(last.at) : '尚未同步'}</div><div class="kpi-ic">${icon('cloud', 14)}</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head">
        <div><h2><span class="head-icon">${icon('key', 14)}</span>① 应用凭据</h2><p class="sub">飞书开放平台 · 企业自建应用；需要 bitable 只读权限，并把应用添加为多维表格协作者</p></div>
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-field"><label>App ID</label><input class="control" id="fsAppId" value="${esc(cfg.appId || '')}" placeholder="cli_xxxxxxxxxxxxxxxx"></div>
          <div class="form-field"><label>App Secret ${cfg.appSecretConfigured ? '<span class="badge green" style="margin-left:6px">已配置</span>' : ''}</label>
            <input class="control" type="password" id="fsAppSecret" placeholder="${cfg.appSecretConfigured ? '已保存，留空表示不修改' : '应用凭证页获取'}"></div>
          <div class="form-field"><label>多维表格 app_token</label><input class="control" id="fsAppToken" value="${esc(cfg.appToken || '')}" placeholder="多维表格 URL 中 base/ 后面的 bascnXXXX"></div>
          <div class="form-field"><label>自动同步间隔（分钟，0 = 关闭）</label><input class="control" type="number" id="fsAuto" min="0" max="1440" value="${cfg.autoSyncMinutes || 0}"></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head">
        <div><h2><span class="head-icon">${icon('database', 14)}</span>② 数据表绑定</h2><p class="sub">每类底表对应飞书多维表格里的一张数据表（table_id 在表 URL 的 table= 参数中）</p></div>
        <div class="card-head-actions"><button class="btn btn-sm" id="fsListTables" type="button">${icon('eye', 13)}获取数据表列表</button></div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>数据集</th><th>当前行数</th><th style="width:320px">table_id</th><th>状态</th></tr></thead>
          <tbody>
            ${(data.datasets || []).map((d) => `
              <tr>
                <td class="strong">${esc(d.name)}</td>
                <td>${fmtInt(d.rowCount || 0)}</td>
                <td><input class="control" data-table="${d.id}" value="${esc(d.tableId || '')}" placeholder="tblXXXXXXXX"></td>
                <td>${d.tableId ? '<span class="badge green">已绑定</span>' : '<span class="badge">未绑定</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div><h2><span class="head-icon">${icon('cloud', 14)}</span>③ 同步</h2><p class="sub">同步将拉取绑定的数据表并覆盖对应底表，随后可到「版本记录」发布快照留存</p></div></div>
      <div class="card-body">${lastHtml}</div>
    </div>

    <div class="modal-foot" style="padding:16px 0 0">
      <button class="btn" id="fsTestTables" type="button">测试连接</button>
      <button class="btn btn-primary" id="fsSave" type="button" style="margin-left:auto">${icon('check', 15)}保存配置</button>
    </div>
  `;

  const collect = () => ({
    appId: $('#fsAppId').value.trim(),
    appSecret: $('#fsAppSecret').value.trim(),
    appToken: $('#fsAppToken').value.trim(),
    autoSyncMinutes: Number($('#fsAuto').value) || 0,
    tableIds: Object.fromEntries($$('#view-feishu [data-table]').map((i) => [i.dataset.table, i.value.trim()]))
  });

  $('#fsSave').addEventListener('click', async () => {
    const body = collect();
    try {
      await api('/api/admin/feishu', { method: 'PUT', body });
      toast('飞书配置已保存', 'ok');
      renderFeishu();
    } catch (err) { toast(err.message, 'err'); }
  });

  const testConn = async (fill) => {
    const body = collect();
    if (!body.appId || (!body.appSecret && !cfg.appSecretConfigured)) { toast('请先填写 App ID 与 App Secret 并保存', 'err'); return; }
    try {
      // 先保存再测试，保证服务端拿到最新凭据
      await api('/api/admin/feishu', { method: 'PUT', body });
      const d = await api('/api/admin/feishu/tables');
      const tables = d.tables || [];
      if (!tables.length) { toast('连接成功，但该多维表格下没有数据表', 'err'); return; }
      if (fill) {
        openModal({
          title: '选择数据表',
          subtitle: `共 ${tables.length} 张表，点击行可回填 table_id`,
          body: `<div class="table-wrap"><table class="table"><thead><tr><th>数据表名称</th><th>table_id</th></tr></thead>
            <tbody>${tables.map((t) => `<tr style="cursor:pointer" data-tid="${esc(t.tableId)}"><td class="strong">${esc(t.name)}</td><td class="mono text-sm">${esc(t.tableId)}</td></tr>`).join('')}</tbody></table></div>`,
          footer: `<button class="btn" id="pickCancel" type="button">关闭</button>`
        });
        $$('#modalBox [data-tid]').forEach((tr) => tr.addEventListener('click', () => {
          $$('#view-feishu [data-table]')[0].value = tr.dataset.tid;
          toast('已回填到第一个数据集，请自行调整其余绑定', 'ok');
        }));
        $('#pickCancel').addEventListener('click', closeModal);
      } else {
        toast(`连接成功：读取到 ${tables.length} 张数据表`, 'ok');
      }
    } catch (err) { toast(err.message, 'err'); }
  };

  $('#fsTestTables').addEventListener('click', () => testConn(false));
  $('#fsListTables').addEventListener('click', () => testConn(true));

  const syncBtn = $('#syncNow');
  if (syncBtn && !syncBtn.disabled) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = '同步中…';
      try {
        const r = await api('/api/admin/feishu/sync', { method: 'POST' });
        const ok = Object.keys(r.results || {}).length;
        const fail = Object.keys(r.errors || {}).length;
        toast(ok ? `同步完成：${ok} 张表${fail ? `，${fail} 张失败` : ''}` : '同步失败，请检查配置', fail ? 'err' : 'ok');
        await refreshBootstrap();
        renderFeishu();
      } catch (err) {
        toast(err.message, 'err');
        syncBtn.disabled = false;
        syncBtn.textContent = '立即同步';
      }
    });
  }
}
/* ---------------------------------------------------------------- 账号 */
function renderAccounts() {
  $('#topActions').innerHTML = `
    <button class="btn" id="addBase" type="button">${icon('plus', 15)}新增基地</button>
    <button class="btn btn-primary" id="addAcc" type="button">${icon('plus', 15)}新建账号</button>`;
  const adminCount = App.accounts.filter((a) => a.role === 'admin').length;
  const baseCount = App.accounts.filter((a) => a.role === 'base').length;
  const active = App.accounts.filter((a) => a.status === 'active').length;

  $('#view-accounts').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">账号总数</div><div class="kpi-value">${App.accounts.length}</div><div class="kpi-foot">启用中 ${active} 个</div><div class="kpi-ic">${icon('users', 14)}</div></div>
      <div class="kpi" data-tone="violet"><div class="kpi-label">后台管理员</div><div class="kpi-value">${adminCount}</div><div class="kpi-foot">可维护数据与账号</div><div class="kpi-ic">${icon('shield', 14)}</div></div>
      <div class="kpi" data-tone="green"><div class="kpi-label">基地查看账号</div><div class="kpi-value">${baseCount}</div><div class="kpi-foot">仅可查看对应基地看板</div><div class="kpi-ic">${icon('building', 14)}</div></div>
      <div class="kpi" data-tone="amber"><div class="kpi-label">待分配基地</div><div class="kpi-value">${App.bases.filter((b) => !App.accounts.some((a) => a.baseId === b.id && a.status === 'active')).length}</div><div class="kpi-foot">建议每基地至少 1 个账号</div><div class="kpi-ic">${icon('alert', 14)}</div></div>
    </div>

    <section class="card">
      <div class="card-head">
        <div><h2><span class="head-icon">${icon('shield', 14)}</span>账号列表</h2><p class="sub">账号统一在此配置：管理员可维护数据；基地账号只能查看本基地看板</p></div>
      </div>
      <div class="table-wrap">
        <table class="table" id="accTable">
          <thead><tr><th>登录账号</th><th>姓名</th><th>权限</th><th>归属基地</th><th>状态</th><th>最近登录</th><th style="width:200px;text-align:right">操作</th></tr></thead>
          <tbody>${App.accounts.map((a) => `
            <tr data-acc="${a.id}">
              <td><span class="mono text-sm">${esc(a.username)}</span></td>
              <td class="strong">${esc(a.name)}<div class="text-xs muted">${esc(a.title || '')}</div></td>
              <td>${a.role === 'admin' ? '<span class="badge violet">后台管理员</span>' : '<span class="badge blue">基地查看</span>'}</td>
              <td>${esc(a.baseId ? baseName(a.baseId) : '—')}</td>
              <td>${a.status === 'active' ? '<span class="badge green">启用</span>' : '<span class="badge">停用</span>'}</td>
              <td class="muted nowrap">${esc(a.lastLogin || '从未登录')}</td>
              <td style="text-align:right;white-space:nowrap">
                <button class="btn btn-sm" data-edit="${a.id}" type="button">编辑</button>
                <button class="btn btn-sm" data-pwd="${a.id}" type="button">重置密码</button>
                <button class="btn btn-sm btn-danger" data-del="${a.id}" type="button">删除</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </section>

    <section class="card mt-16">
      <div class="card-head">
        <div><h2><span class="head-icon">${icon('building', 14)}</span>基地管理</h2>
          <p class="sub">基地名称、编码、主题色与排序会同步到前台筛选和图表；停用后前台不再显示；删除前会检查绑定账号与业绩目标</p></div>
      </div>
      <div class="table-wrap">
        <table class="table" id="baseTable">
          <thead><tr><th>基地</th><th>编码</th><th>主题色</th><th class="num">架构人数</th><th class="num">高经</th><th class="num">账号</th><th class="num">排序</th><th>状态</th><th style="text-align:right">操作</th></tr></thead>
          <tbody><tr><td colspan="9"><div class="skeleton sk-line"></div></td></tr></tbody>
        </table>
      </div>
    </section>

    <div class="grid-2 equal mt-16">
      <section class="card">
        <div class="card-head"><div><h2><span class="head-icon green">${icon('key', 14)}</span>权限说明</h2><p class="sub">两类角色的能力边界</p></div></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>能力</th><th class="center">后台管理员</th><th class="center">基地查看</th></tr></thead>
            <tbody>
              ${[['查看整体数据看板', 1, 0], ['查看本基地看板', 1, 1], ['按高经 / 团队筛选', 1, 1], ['上传与维护底表', 1, 0], ['配置取数逻辑', 1, 0], ['维护账号', 1, 0], ['上传架构与目标', 1, 0]].map(([n, a, b]) => `
                <tr><td>${n}</td><td class="center">${a ? '<span style="color:#047857">✓</span>' : '<span class="muted">—</span>'}</td><td class="center">${b ? '<span style="color:#047857">✓</span>' : '<span class="muted">—</span>'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  $('#addAcc').addEventListener('click', () => openAccountForm(null));
  $$('#accTable [data-edit]').forEach((b) => b.addEventListener('click', () => {
    openAccountForm(App.accounts.find((a) => a.id === b.dataset.edit));
  }));
  $$('#accTable [data-pwd]').forEach((b) => b.addEventListener('click', async () => {
    const acc = App.accounts.find((a) => a.id === b.dataset.pwd);
    try {
      const r = await api(`/api/admin/accounts/${acc.id}/reset`, { method: 'POST', body: {} });
      openModal({
        title: '密码已重置',
        body: `<div class="alert ok">${icon('check', 15)}<div>账号 <b>${esc(acc.username)}</b> 的新密码如下，仅显示一次，请立即复制。</div></div>
          <div class="formula-box" style="font-size:16px;letter-spacing:.08em">${esc(r.password)}</div>`,
        footer: `<button class="btn btn-primary" data-close2 type="button">我已保存</button>`
      });
      $('#modalBox [data-close2]').addEventListener('click', closeModal);
    } catch (err) { toast(err.message, 'err'); }
  }));
  $$('#accTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
    const acc = App.accounts.find((a) => a.id === b.dataset.del);
    if (acc.username === App.user.username) { toast('不能删除当前登录的账号', 'err'); return; }
    if (!confirm(`确认删除账号「${acc.username}（${acc.name}）」？删除后该账号无法登录，操作会记入日志。`)) return;
    try {
      await api(`/api/admin/accounts/${acc.id}`, { method: 'DELETE' });
      await refreshBootstrap();
      renderAccounts();
      toast(`账号「${acc.username}」已删除`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }));

  /* 基地管理区块（原「基地管理」视图并入） */
  const loadBases = async () => {
    try {
      const d = await api('/api/admin/bases');
      const tbody = $('#baseTable tbody');
      if (!tbody) return;
      tbody.innerHTML = d.bases.map((b) => `
        <tr data-base="${b.id}">
          <td><span style="display:inline-flex;align-items:center;gap:7px"><i style="width:9px;height:9px;border-radius:3px;background:${b.color}"></i><span class="strong">${esc(b.name)}</span></span></td>
          <td class="mono text-sm">${esc(b.code)}</td>
          <td><span class="mono text-xs">${esc(b.color)}</span></td>
          <td class="num">${fmtInt(b.orgCount)}</td>
          <td class="num">${fmtInt(b.managerCount)}</td>
          <td class="num">${fmtInt(b.accountCount)}</td>
          <td class="num">${fmtInt(b.sort)}</td>
          <td>${b.status === 'active' ? '<span class="badge green">启用</span>' : '<span class="badge">停用</span>'}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-sm" data-edit="${b.id}" type="button">编辑</button>
            <button class="btn btn-sm btn-danger" data-del="${b.id}" type="button">删除</button>
          </td>
        </tr>`).join('');
      $$('#baseTable [data-edit]').forEach((btn) => btn.addEventListener('click', () => {
        openBaseForm(d.bases.find((b) => b.id === btn.dataset.edit), loadBases);
      }));
      $$('#baseTable [data-del]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm('确认删除该基地？绑定的账号与目标会被检查。')) return;
        try {
          await api(`/api/admin/bases/${btn.dataset.del}`, { method: 'DELETE' });
          toast('基地已删除', 'ok');
          await refreshBootstrap();
          renderAccounts();
        } catch (err) { toast(err.message, 'err'); }
      }));
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#addBase').addEventListener('click', () => openBaseForm(null, () => { loadBases(); renderAccounts(); }));
  loadBases();
}

function openAccountForm(acc) {
  const isNew = !acc;
  const body = `
    <div class="form-grid">
      <div class="form-field full"><label>账号类型</label>
        <div class="radio-cards">
          <label class="radio-card"><input type="radio" name="arole" value="admin" ${!acc || acc.role === 'admin' ? 'checked' : ''}><span><b>后台管理员</b><span>可维护底表、架构、目标与账号</span></span></label>
          <label class="radio-card"><input type="radio" name="arole" value="base" ${acc && acc.role === 'base' ? 'checked' : ''}><span><b>基地查看</b><span>只能查看绑定基地的看板</span></span></label>
        </div>
      </div>
      <div class="form-field"><label>登录账号</label><input class="control" id="aUser" value="${esc(acc ? acc.username : '')}" placeholder="例如 base_wh" ${isNew ? '' : 'readonly'}></div>
      <div class="form-field"><label>姓名</label><input class="control" id="aName" value="${esc(acc ? acc.name : '')}" placeholder="真实姓名"></div>
      <div class="form-field"><label>岗位说明</label><input class="control" id="aTitle" value="${esc(acc ? acc.title : '')}" placeholder="例如：武汉基地负责人"></div>
      <div class="form-field" id="aBaseField"><label>归属基地（基地账号必填）</label>
        <select class="control" id="aBase">
          <option value="">—</option>
          ${App.bases.map((b) => `<option value="${b.id}" ${acc && acc.baseId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>${isNew ? '初始密码' : '重置密码（留空不改）'}</label><input class="control" id="aPwd" type="text" placeholder="${isNew ? '默认 123456' : '不修改请留空'}"></div>
      <div class="form-field"><label>状态</label>
        <select class="control" id="aStatus">
          <option value="active" ${!acc || acc.status === 'active' ? 'selected' : ''}>启用</option>
          <option value="disabled" ${acc && acc.status === 'disabled' ? 'selected' : ''}>停用</option>
        </select>
      </div>
    </div>
    ${isNew ? '' : `<div class="alert warn mt-12">${icon('info', 15)}<div>停用后该账号将无法登录，但历史操作记录保留。</div></div>`}
  `;
  const box = openModal({
    title: isNew ? '新建账号' : '编辑账号',
    subtitle: isNew ? '账号统一在此配置，创建后即可用于登录' : `正在编辑 ${acc.username}`,
    body,
    footer: `${isNew ? '' : `<button class="btn btn-danger" id="delAcc" type="button">删除账号</button><div class="spacer"></div>`}
      <button class="btn" id="accCancel" type="button">取消</button>
      <button class="btn btn-primary" id="accSave" type="button">保存</button>`
  });

  const roleSync = () => {
    const role = box.querySelector('input[name="arole"]:checked').value;
    box.querySelector('#aBaseField').style.opacity = role === 'admin' ? '.45' : '1';
    box.querySelector('#aBase').disabled = role === 'admin';
  };
  box.querySelectorAll('input[name="arole"]').forEach((r) => r.addEventListener('change', roleSync));
  roleSync();

  box.querySelector('#accCancel').addEventListener('click', closeModal);
  box.querySelector('#accSave').addEventListener('click', async () => {
    const payload = {
      role: box.querySelector('input[name="arole"]:checked').value,
      username: box.querySelector('#aUser').value.trim(),
      name: box.querySelector('#aName').value.trim(),
      title: box.querySelector('#aTitle').value.trim(),
      baseId: box.querySelector('#aBase').value,
      password: box.querySelector('#aPwd').value.trim(),
      status: box.querySelector('#aStatus').value
    };
    try {
      if (isNew) {
        await api('/api/admin/accounts', { method: 'POST', body: payload });
      } else {
        await api(`/api/admin/accounts/${acc.id}`, { method: 'PUT', body: payload });
      }
      await refreshBootstrap();
      closeModal();
      renderAccounts();
      toast(isNew ? '账号已创建' : '账号已更新', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });

  const del = box.querySelector('#delAcc');
  if (del) del.addEventListener('click', async () => {
    try {
      await api(`/api/admin/accounts/${acc.id}`, { method: 'DELETE' });
      await refreshBootstrap();
      closeModal();
      renderAccounts();
      toast('账号已删除', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  });
}

/* ---------------------------------------------------------------- 日志 */
/* ---------------------------------------------------------------- 操作日志（版本管理 + 底表状态 + 操作留痕） */
const AuditState = { page: 1, pageSize: 20, rows: [] };

async function renderAudit() {
  $('#topActions').innerHTML = `
    <button class="btn btn-sm" id="refreshAudit" type="button">${icon('history', 14)}刷新</button>
    <button class="btn btn-primary" id="publishVer" type="button">${icon('version', 15)}发布新版本</button>`;

  const view = $('#view-audit');
  view.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <section class="card">
        <div class="card-head">
          <div><h2><span class="head-icon">${icon('version', 14)}</span>版本管理</h2><p class="sub" id="verCurrentSub">—</p></div>
        </div>
        <div class="table-wrap" style="max-height:420px">
          <table class="table" id="verTable">
            <thead><tr><th>版本</th><th class="num">数据行数</th><th>发布人</th><th>发布时间</th><th>状态</th><th style="text-align:right">操作</th></tr></thead>
            <tbody id="verBody"><tr><td colspan="6"><div class="skeleton" style="height:32px"></div></td></tr></tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <div class="card-head">
          <div><h2><span class="head-icon green">${icon('database', 14)}</span>底表状态</h2><p class="sub">行点击可上传数据</p></div>
          <div class="card-head-actions"><button class="btn btn-sm" data-go2="datasets" type="button">管理底表</button></div>
        </div>
        <div class="table-wrap" style="max-height:420px">
          <table class="table">
            <thead><tr><th>数据类别</th><th class="num">行数</th><th>最近更新</th></tr></thead>
            <tbody>
              ${App.datasets.map((d) => `
                <tr class="link-row" data-ds="${d.id}" style="cursor:pointer">
                  <td><span class="badge ${toneBadge(d.tone)}">${esc(d.name)}</span></td>
                  <td class="num">${fmtInt(d.rowCount)}</td>
                  <td class="muted nowrap">${esc(d.updatedAt || '—')}</td>
                </tr>`).join('') || '<tr><td colspan="3"><div class="empty"><h3>暂无底表</h3></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    <section class="card">
      <div class="card-head"><div><h2><span class="head-icon">${icon('history', 14)}</span>操作日志</h2><p class="sub" id="auditSub">后台关键操作留痕</p></div></div>
      <div class="table-wrap" style="max-height:480px">
        <table class="table">
          <thead><tr><th style="width:150px">时间</th><th style="width:110px">操作人</th><th style="width:130px">操作</th><th>详情</th><th style="width:120px">IP</th></tr></thead>
          <tbody id="auditBody"><tr><td colspan="5"><div class="skeleton" style="height:32px"></div></td></tr></tbody>
        </table>
      </div>
      <div class="card-body" style="padding-top:10px;border-top:1px solid var(--border,#e5e7eb)" id="auditPager"></div>
    </section>`;

  const loadVersions = async () => {
    try {
      const d = await api('/api/admin/versions');
      App.versions = d.versions;
      App.activeVersionId = d.activeVersionId;
      const active = d.versions.find((v) => v.id === d.activeVersionId);
      $('#verCurrentSub').innerHTML = active
        ? `当前展示：<b>${esc(active.label)}</b> · ${esc(active.createdAt)} · ${esc(active.createdBy)}`
        : '暂无展示版本';
      $('#verBody').innerHTML = d.versions.map((v) => `
        <tr>
          <td class="strong">${esc(v.label)}<div class="text-xs muted mono">${esc(v.id)}</div></td>
          <td class="num">${fmtInt(v.rows)}</td>
          <td>${esc(v.createdBy)}</td>
          <td class="nowrap muted">${esc(v.createdAt)}</td>
          <td>${v.id === d.activeVersionId ? '<span class="badge green">当前展示</span>' : '<span class="badge plain">历史快照</span>'}</td>
          <td style="text-align:right;white-space:nowrap">
            ${v.id === d.activeVersionId ? '' : `<button class="btn btn-sm" data-act="${v.id}" type="button">切换到此版本</button><button class="btn btn-sm btn-danger" data-del="${v.id}" type="button">删除</button>`}
          </td>
        </tr>`).join('') || '<tr><td colspan="6"><div class="empty"><h3>暂无版本</h3></div></td></tr>';

      $$('#view-audit [data-act]').forEach((btn) => btn.addEventListener('click', async () => {
        const v = App.versions.find((x) => x.id === btn.dataset.act);
        if (!confirm(`确认切换到「${v.label}」？当前全部底表与取数逻辑将被该快照覆盖。`)) return;
        try {
          await api(`/api/admin/versions/${btn.dataset.act}/activate`, { method: 'POST' });
          toast(`已切换到「${v.label}」，前台与看板即时生效`, 'ok');
          await refreshBootstrap();
          renderAudit();
        } catch (err) { toast(err.message, 'err'); }
      }));
      $$('#view-audit [data-del]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm('确认删除该版本快照？此操作不可恢复。')) return;
        try {
          await api(`/api/admin/versions/${btn.dataset.del}`, { method: 'DELETE' });
          toast('版本已删除', 'ok');
          loadVersions();
        } catch (err) { toast(err.message, 'err'); }
      }));
    } catch (err) { toast(err.message, 'err'); }
  };

  const renderAuditPage = () => {
    const total = AuditState.rows.length;
    const pages = Math.max(1, Math.ceil(total / AuditState.pageSize));
    if (AuditState.page > pages) AuditState.page = pages;
    const slice = AuditState.rows.slice((AuditState.page - 1) * AuditState.pageSize, AuditState.page * AuditState.pageSize);
    $('#auditBody').innerHTML = slice.map((a) => `
      <tr><td class="muted nowrap">${esc(a.at)}</td><td class="strong">${esc(a.user)}</td>
      <td><span class="badge plain">${esc(a.action)}</span></td><td>${esc(a.detail)}</td>
      <td class="muted mono text-xs">${esc(a.ip || '')}</td></tr>`).join('')
      || '<tr><td colspan="5"><div class="empty"><h3>暂无日志</h3></div></td></tr>';
    $('#auditSub').textContent = `后台关键操作留痕 · 共 ${total} 条`;
    $('#auditPager').innerHTML = `
      <div class="flex gap-8" style="justify-content:space-between;align-items:center">
        <span class="text-xs muted">第 ${AuditState.page} / ${pages} 页 · 每页 ${AuditState.pageSize} 条</span>
        <div class="flex gap-8">
          <button class="btn btn-sm" id="pgPrev" type="button" ${AuditState.page <= 1 ? 'disabled' : ''}>上一页</button>
          <button class="btn btn-sm" id="pgNext" type="button" ${AuditState.page >= pages ? 'disabled' : ''}>下一页</button>
        </div>
      </div>`;
    $('#pgPrev').addEventListener('click', () => { AuditState.page -= 1; renderAuditPage(); });
    $('#pgNext').addEventListener('click', () => { AuditState.page += 1; renderAuditPage(); });
  };

  const loadAudits = async () => {
    try {
      const d = await api('/api/admin/audit');
      AuditState.rows = d.rows || [];
      renderAuditPage();
    } catch (err) { toast(err.message, 'err'); }
  };

  $$('#view-audit [data-go2]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go2)));
  $$('#view-audit .link-row[data-ds]').forEach((r) => r.addEventListener('click', () => openDataset(r.dataset.ds, 'upload')));
  $('#refreshAudit').addEventListener('click', async () => {
    await refreshBootstrap();
    await Promise.all([loadVersions(), loadAudits()]);
    toast('已刷新', 'ok');
  });
  $('#publishVer').addEventListener('click', () => openPublishVersionModal(async () => { await loadVersions(); await loadAudits(); }));

  await Promise.all([loadVersions(), loadAudits()]);
}

/** 发布新版本弹窗（操作日志视图使用） */
function openPublishVersionModal(reload) {
  const box = openModal({
    title: '发布新版本',
    subtitle: '以当前全部底表与取数逻辑生成快照',
    body: `<div class="form-field"><label>版本名称</label>
      <input class="control" id="verLabel" placeholder="例如：2026-11 武汉基地转介绍名单"></div>
      <div class="alert mt-12">${icon('info', 15)}<div>发布后前台「版本」标识将更新为新版本。</div></div>`,
    footer: `<button class="btn" id="verCancel" type="button">取消</button><button class="btn btn-primary" id="verSave" type="button">发布</button>`
  });
  box.querySelector('#verCancel').addEventListener('click', closeModal);
  box.querySelector('#verSave').addEventListener('click', async () => {
    try {
      await api('/api/admin/versions/publish', { method: 'POST', body: { label: box.querySelector('#verLabel').value.trim() } });
      closeModal();
      toast('新版本已发布', 'ok');
      await refreshBootstrap();
      if (reload) await reload();
    } catch (err) { toast(err.message, 'err'); }
  });
}

/* ---------------------------------------------------------------- 公共 */
async function refreshBootstrap() {
  const b = await api('/api/bootstrap');
  Object.assign(App, {
    user: b.user, bases: b.bases, managers: b.managers, datasets: b.datasets,
    accounts: b.accounts, audits: b.audits, overview: b.overview, targetPeriods: b.targetPeriods,
    settings: b.settings, versions: b.versions || [], activeVersionId: b.activeVersionId || ''
  });
  $('#dsCount').textContent = App.datasets.length;
}

/* ---------------------------------------------------------------- 高经归属（2.9 高经团队业绩配置） */

const gjState = { data: null, base: '', gj: '', picked: [], includeSelf: false, ruleSource: 'ys', ruleBase: '' };

async function renderGjteamView() {
  $('#topActions').innerHTML = '';
  $('#view-gjteam').innerHTML = `
    <div class="alert">
      ${icon('info', 15)}
      <div><b>高经团队业绩 = Σ 勾选经理业绩 + 本人在经理层的业绩</b>，双口径（直推 / 接leads）各自闭环。经理列=null 的行按下方「null 归属规则」计入对应高经的直管桶；经理列为"/"的脏数据行不会计入任何数字。历史业绩按成交行固化，经理跨基地调动时两个基地各算各的行，不会重复计。</div>
    </div>
    <div id="gjAdmBody" style="margin-top:14px"><div class="skeleton sk-line" style="height:60px"></div></div>`;

  try {
    gjState.data = await api('/api/gj-team');
  } catch (err) {
    $('#gjAdmBody').innerHTML = `<div class="alert err">${icon('alert', 15)}<div>${esc(err.message)}</div></div>`;
    return;
  }
  const baseNames = Object.keys((gjState.data || {}).bases || {});
  if (!baseNames.length) {
    $('#gjAdmBody').innerHTML = '<div class="card"><div class="card-body"><div class="empty"><h3>暂无数据</h3><p>有数完成度或转介绍转化跟踪底表未上传</p></div></div></div>';
    return;
  }
  gjState.base = gjState.base && baseNames.includes(gjState.base) ? gjState.base : baseNames[0];
  const gjs = gjState.data.bases[gjState.base].gjs || [];
  if (!gjs.some((x) => x.name === gjState.gj)) gjState.gj = gjs.length ? gjs[0].name : '';
  if (!['ys', 'dc'].includes(gjState.ruleSource)) gjState.ruleSource = 'ys';
  if (!baseNames.includes(gjState.ruleBase)) gjState.ruleBase = gjState.base;
  renderGjteamAdmin();
}

function renderGjteamAdmin() {
  const d = gjState.data || {};
  const bases = d.bases || {};
  const baseNames = Object.keys(bases);
  const b = bases[gjState.base] || { gjs: [], mgrs: [] };
  const gjs = b.gjs || [];
  const saved = ((d.selections || {})[gjState.base + '|' + gjState.gj]) || null;
  const rules = d.nullRules || [];
  const fmtN = (n) => '¥' + Math.round(n).toLocaleString('zh-CN');

  // 经理勾选列表
  const mgrRows = (b.mgrs || []).map((m) => {
    const on = gjState.picked.includes(m.name);
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--line);cursor:pointer;${on ? 'background:#eff6ff' : ''}">
      <input type="checkbox" class="gjadm-mgr" value="${esc(m.name)}" ${on ? 'checked' : ''}>
      <b>${esc(m.name)}</b><span class="num muted" style="font-size:11px">${esc(m.empId || '—')}</span>
      <span class="muted" style="font-size:11px;margin-left:auto">直推 ${m.ys.n}行 ${fmtN(m.ys.amt)} · leads ${m.dc.n}单 ${fmtN(m.dc.amt)}</span>
    </label>`;
  }).join('') || '<div class="muted" style="padding:12px">该基地暂无经理数据</div>';

  // 当前映射表
  const selRows = Object.entries(d.selections || {}).map(([k, s]) => `
    <tr>
      <td class="strong">${esc(s.gjName)}</td>
      <td>${esc(s.base)}</td>
      <td>${esc(s.mgrs.join('、') || '—')}${s.includeSelf ? ' <span class="badge blue">+本人直管</span>' : ''}</td>
      <td class="muted">${esc(s.by || '—')} · ${esc(s.at || '—')}</td>
      <td><button class="btn btn-sm" type="button" data-clear-sel="${esc(k)}">清除</button></td>
    </tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:18px">尚未配置任何归属映射</td></tr>';

  // 规则表
  const SRC_LABEL = { ys: '直推', dc: '接leads' };
  const ruleRows = rules.map((r) => `
    <tr>
      <td>${SRC_LABEL[r.source] || esc(r.source)}</td>
      <td>${esc(r.base)}</td>
      <td class="strong">${esc(r.targetName)}${r.targetEmpId ? ` <span class="num muted">${esc(r.targetEmpId)}</span>` : ''}</td>
      <td>${r.enabled ? '<span class="badge green">启用</span>' : '<span class="muted">停用</span>'}</td>
      <td class="muted">${esc(r.by || '—')} · ${esc(r.at || '—')}</td>
      <td><button class="btn btn-sm" type="button" data-del-rule="${esc(r.id)}">删除</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">暂无规则（经理列=null 的行将全部待指定，不计入任何高经）</td></tr>';

  $('#gjAdmBody').innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h2><span class="head-icon blue">${icon('users', 14)}</span>经理归属映射（选择经理并核算）</h2>
        <p class="sub">勾选该高经名下的经理与「本人直管」，保存后前台「明细名单 → 高经团队」即时生效</p></div>
      </div>
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;border-bottom:1px solid var(--line)">
        <div class="field"><label>基地</label>
          <select class="control" id="gjAdmBase" style="width:140px">${baseNames.map((x) => `<option value="${esc(x)}" ${x === gjState.base ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="field"><label>高经</label>
          <select class="control" id="gjAdmGj" style="width:200px">${gjs.map((x) => `<option value="${esc(x.name)}" ${x.name === gjState.gj ? 'selected' : ''}>${esc(x.name)}${x.empId ? ' ' + esc(x.empId) : ''}</option>`).join('')}</select></div>
        <label class="field" style="gap:6px;cursor:pointer"><input type="checkbox" id="gjAdmSelf" ${gjState.includeSelf ? 'checked' : ''}><span style="font-size:13px">计入本人直管（经理列=本人的行）</span></label>
        <button class="btn btn-primary btn-sm" id="gjAdmSave" type="button">${icon('check', 14)}保存映射并核算</button>
        ${saved ? `<button class="btn btn-sm" id="gjAdmClear" type="button" style="color:var(--danger)">${icon('refresh', 13)}清除映射重选</button>` : ''}
        ${saved ? `<span class="muted" style="font-size:12px">当前：${saved.mgrs.length} 位经理${saved.includeSelf ? ' + 本人' : ''}（${esc(saved.by)} · ${esc(saved.at)}）</span>` : '<span class="muted" style="font-size:12px">尚未配置</span>'}
      </div>
      <div class="table-wrap" style="max-height:360px">${mgrRows}</div>
      <div class="table-wrap" style="max-height:280px;border-top:1px solid var(--line)">
        <table class="table"><thead><tr><th>高经</th><th>基地</th><th>归属经理</th><th>调整记录</th><th></th></tr></thead><tbody>${selRows}</tbody></table>
      </div>
    </section>
    <section class="card" style="margin-top:14px">
      <div class="card-head">
        <div><h2><span class="head-icon amber">${icon('spark', 14)}</span>null 归属规则（经理列=null 的行归谁）</h2>
        <p class="sub">按数据源分开维护：直推（有数完成度）与接leads（转化跟踪）各基地各一条；删除规则后对应行回到「待指定」</p></div>
      </div>
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;border-bottom:1px solid var(--line)">
        <div class="field"><label>数据源</label>
          <select class="control" id="gjAdmRuleSrc" style="width:120px">
            <option value="ys" ${gjState.ruleSource === 'ys' ? 'selected' : ''}>直推</option>
            <option value="dc" ${gjState.ruleSource === 'dc' ? 'selected' : ''}>接leads</option>
          </select></div>
        <div class="field"><label>基地</label>
          <select class="control" id="gjAdmRuleBase" style="width:140px">${baseNames.map((x) => `<option value="${esc(x)}" ${x === gjState.ruleBase ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="field"><label>归属高经</label>
          <select class="control" id="gjAdmRuleTarget" style="width:200px">${((bases[gjState.ruleBase] || {}).gjs || []).map((x) => `<option value="${esc(x.name)}">${esc(x.name)}${x.empId ? ' ' + esc(x.empId) : ''}</option>`).join('')}</select></div>
        <button class="btn btn-primary btn-sm" id="gjAdmRuleSave" type="button">${icon('check', 14)}保存规则</button>
      </div>
      <div class="table-wrap">
        <table class="table"><thead><tr><th>数据源</th><th>基地</th><th>归属高经</th><th>状态</th><th>调整记录</th><th></th></tr></thead><tbody>${ruleRows}</tbody></table>
      </div>
    </section>`;

  $$('#gjAdmBody [id^=gjAdm]').forEach((el) => {
    const id = el.id;
    if (id === 'gjAdmBase') el.addEventListener('change', (e) => {
      gjState.base = e.target.value; gjState.ruleBase = e.target.value;
      const gjs2 = ((gjState.data.bases[gjState.base] || {}).gjs) || [];
      gjState.gj = gjs2.length ? gjs2[0].name : '';
      const saved2 = ((gjState.data.selections || {})[gjState.base + '|' + gjState.gj]) || null;
      gjState.picked = saved2 ? [...saved2.mgrs] : [];
      gjState.includeSelf = saved2 ? !!saved2.includeSelf : false;
      renderGjteamAdmin();
    });
    if (id === 'gjAdmGj') el.addEventListener('change', (e) => {
      gjState.gj = e.target.value;
      const saved2 = ((gjState.data.selections || {})[gjState.base + '|' + gjState.gj]) || null;
      gjState.picked = saved2 ? [...saved2.mgrs] : [];
      gjState.includeSelf = saved2 ? !!saved2.includeSelf : false;
      renderGjteamAdmin();
    });
    if (id === 'gjAdmSelf') el.addEventListener('change', (e) => { gjState.includeSelf = e.target.checked; });
    if (id === 'gjAdmClear') el.addEventListener('click', async () => {
      if (!confirm(`确认清除 ${gjState.base} · ${gjState.gj} 的归属映射？清除后该高经名下经理回到「待指定」，可重新勾选。`)) return;
      try {
        await api('/api/gj-team/select', { method: 'POST', body: { base: gjState.base, gjName: gjState.gj, mgrs: [], includeSelf: false, clear: true } });
        delete gjState.data.selections[gjState.base + '|' + gjState.gj];
        gjState.picked = [];
        gjState.includeSelf = false;
        toast('映射已清除，可重新勾选经理', 'ok');
        renderGjteamAdmin();
      } catch (err) { toast(err.message, 'err'); }
    });
    if (id === 'gjAdmSave') el.addEventListener('click', async () => {
      const mgrs = $$('.gjadm-mgr').filter((x) => x.checked).map((x) => x.value);
      try {
        const r = await api('/api/gj-team/select', { method: 'POST', body: { base: gjState.base, gjName: gjState.gj, mgrs, includeSelf: gjState.includeSelf } });
        gjState.data.selections[gjState.base + '|' + gjState.gj] = { base: gjState.base, gjName: gjState.gj, mgrs, includeSelf: gjState.includeSelf, at: (r.calc && r.calc.selection && r.calc.selection.at) || '', by: App.user.name };
        const t = calcTotalText(r.calc);
        toast(`已保存：${t}`, 'ok');
        renderGjteamAdmin();
      } catch (err) { toast(err.message, 'err'); }
    });
    if (id === 'gjAdmRuleSrc') el.addEventListener('change', (e) => { gjState.ruleSource = e.target.value; renderGjteamAdmin(); });
    if (id === 'gjAdmRuleBase') el.addEventListener('change', (e) => { gjState.ruleBase = e.target.value; renderGjteamAdmin(); });
    if (id === 'gjAdmRuleSave') el.addEventListener('click', async () => {
      const target = $('#gjAdmRuleTarget');
      const targetName = target ? target.value : '';
      if (!targetName) { toast('该基地暂无高结名单，无法设置规则', 'err'); return; }
      const gjs2 = ((gjState.data.bases[gjState.ruleBase] || {}).gjs) || [];
      const hit = gjs2.find((x) => x.name === targetName) || {};
      try {
        const r = await api('/api/gj-team/nullrule', { method: 'POST', body: { source: gjState.ruleSource, base: gjState.ruleBase, targetName, targetEmpId: hit.empId || '', enabled: true } });
        gjState.data.nullRules = r.nullRules;
        toast('规则已保存，前台即时生效', 'ok');
        renderGjteamAdmin();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
  $$('#gjAdmBody [data-del-rule]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rule = (gjState.data.nullRules || []).find((x) => x.id === btn.dataset.delRule);
      if (!rule) return;
      if (!confirm(`确认删除规则：${SRC_LABEL[rule.source] || rule.source} · ${rule.base} → ${rule.targetName}？删除后对应行回到待指定。`)) return;
      try {
        const r = await api('/api/gj-team/nullrule', { method: 'POST', body: { source: rule.source, base: rule.base, targetName: '' } });
        gjState.data.nullRules = r.nullRules;
        toast('规则已删除', 'ok');
        renderGjteamAdmin();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
  // 2.12 映射总表逐行清除：选错经理时点「清除」重选
  $$('#gjAdmBody [data-clear-sel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.clearSel;
      const sel = (gjState.data.selections || {})[key];
      if (!sel) return;
      if (!confirm(`确认清除 ${sel.base} · ${sel.gjName} 的归属映射（${sel.mgrs.join('、')}${sel.includeSelf ? ' + 本人直管' : ''}）？清除后可重新勾选。`)) return;
      try {
        await api('/api/gj-team/select', { method: 'POST', body: { base: sel.base, gjName: sel.gjName, mgrs: [], includeSelf: false, clear: true } });
        delete gjState.data.selections[key];
        if (sel.base === gjState.base && sel.gjName === gjState.gj) { gjState.picked = []; gjState.includeSelf = false; }
        toast('映射已清除，可重新勾选经理', 'ok');
        renderGjteamAdmin();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}

function calcTotalText(calc) {
  if (!calc) return '';
  const f = (n) => '¥' + Math.round(n).toLocaleString('zh-CN');
  return `${calc.base} · ${calc.gjName}：直推 ${f(calc.total.ys.amt)}（${calc.total.ys.n}行）+ 接leads ${f(calc.total.dc.amt)}（${calc.total.dc.n}单）`;
}

boot();

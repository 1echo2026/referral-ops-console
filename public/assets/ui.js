'use strict';

/* =========================================================================
   通用 UI 工具：图标、格式化、请求、提示、弹窗、图表
   ========================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- 图标 ---------------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  chart: '<path d="M4 20V10M10 20V5M16 20v-7M22 20H2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4m0 0 4 4m-4-4L8 8"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12m0 0 4-4m-4 4-4-4"/><path d="M4 18v2h16v-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  arrowRight: '<path d="M5 12h14m0 0-6-6m6 6-6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  spark: '<path d="m12 3 2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4Z"/>',
  wallet: '<path d="M20 8H5a2 2 0 0 1 0-4h12v4"/><path d="M3 6v12a2 2 0 0 0 2 2h15V8"/><circle cx="17" cy="14" r="1.4"/>',
  phone: '<path d="M15.5 21a13 13 0 0 1-12.5-12.5A2.5 2.5 0 0 1 5.5 6H8l2 4-2 1.5a11 11 0 0 0 4.5 4.5L14 14l4 2v2.5A2.5 2.5 0 0 1 15.5 21Z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  alert: '<path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  filter: '<path d="M4 5h16l-6.4 7.7V20l-3.2-1.6v-5.7Z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 11a4 4 0 0 0-6-.5l-2 2A4 4 0 0 0 11.7 18l1-1"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m13.5 5.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 3 3-3 3-2-2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4h1V6h-1L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  medal: '<circle cx="12" cy="14" r="6"/><path d="m12 12 1 2h2l-1.6 1.2.6 1.8-2-1.2-2 1.2.6-1.8L9 14h2Z"/><path d="M8.5 8.5 6 3h4l2 4 2-4h4l-2.5 5.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  version: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6.3 11.5 3.75 3.75 0 0 0 7 19h10.5Z"/>'
};

function icon(name, size = 16, stroke = 1.8) {
  const body = ICONS[name] || ICONS.grid;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/* ---------------- 格式化 ---------------- */
function fmtParts(value, format, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { main: '—', unit: unit || '' };
  if (format === 'pct') return { main: (v * 100).toFixed(1), unit: '%' };
  if (format === 'money') {
    if (Math.abs(v) >= 1e8) return { main: (v / 1e8).toFixed(2), unit: '亿' };
    if (Math.abs(v) >= 1e4) return { main: (v / 1e4).toFixed(1), unit: '万' };
    return { main: Math.round(v).toLocaleString('zh-CN'), unit: '元' };
  }
  return { main: Math.round(v).toLocaleString('zh-CN'), unit: unit || '' };
}

function fmt(value, format, unit) {
  const p = fmtParts(value, format, unit);
  if (format === 'pct') return `${p.main}%`;
  return `${p.main}${p.unit || ''}`;
}

function fmtCompact(value, format) {
  const p = fmtParts(value, format, '');
  return p.main + (format === 'pct' ? '%' : p.unit || '');
}

function fmtInt(v) { return Number(v || 0).toLocaleString('zh-CN'); }
function fmtPct(v) { return `${(Number(v || 0) * 100).toFixed(0)}%`; }
function fmtMoney(v) { return '¥' + Number(v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }); }

/* ---------------- 脱敏（前台展示） ---------------- */
function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return '—';
  if (s.length <= 1) return s + '*';
  if (s.length === 2) return s[0] + '*';
  return s[0] + '*'.repeat(Math.min(2, s.length - 1)) + s[s.length - 1];
}
function maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (s.length < 7) return s ? s[0] + '****' + s.slice(-1) : '—';
  return s.slice(0, 3) + '****' + s.slice(-4);
}

/* ---------------- 请求 ---------------- */
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'content-type': 'application/json' } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `请求失败 (${res.status})`);
    err.status = res.status;
    // 登录态失效统一回登录页（登录页自身的失败由页面处理，避免循环跳转）
    if (res.status === 401 && !/^\/login/.test(location.pathname) && !options.noAuthRedirect) {
      location.href = '/login';
    }
    throw err;
  }
  return data;
}

/* ---------------- 提示 ---------------- */
function toast(message, type = '') {
  let wrap = $('.toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toasts';
    document.body.appendChild(wrap);
  }
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(type === 'err' ? 'alert' : type === 'ok' ? 'check' : 'info', 14)}<span>${esc(message)}</span>`;
  wrap.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s, transform .2s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 220);
  }, 2600);
}

/* ---------------- 弹窗 ---------------- */
function openModal({ title, subtitle = '', body, footer = '', wide = false, onMount }) {
  let back = $('#modalBackdrop');
  if (!back) {
    back = document.createElement('div');
    back.id = 'modalBackdrop';
    back.className = 'backdrop';
    back.innerHTML = `<div class="modal" id="modalBox"></div>`;
    document.body.appendChild(back);
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
  }
  const box = $('#modalBox');
  box.className = `modal${wide ? ' wide' : ''}`;
  box.innerHTML = `
    <div class="modal-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
      <button class="modal-close" type="button" data-close>${icon('close', 14)}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  `;
  box.querySelector('[data-close]').addEventListener('click', closeModal);
  back.classList.add('open');
  if (onMount) onMount(box);
  return box;
}

function closeModal() {
  const back = $('#modalBackdrop');
  if (back) back.classList.remove('open');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------------- 图表 ---------------- */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  function tooltipFor(wrap) {
    let tip = wrap.querySelector('.chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      wrap.appendChild(tip);
    }
    return tip;
  }

  /** 折线 / 面积趋势图 */
  function trend(wrap, { labels = [], series = [], format = 'int', height = 216 }) {
    if (!labels.length || !series.length) {
      wrap.innerHTML = `<div class="chart-empty">暂无可展示数据</div>`;
      return;
    }
    const W = 720;
    const H = height;
    const hasRight = series.some((s) => s.axis === 'right');
    const padL = 44, padR = hasRight ? 48 : 12, padT = 14, padB = 26;
    const iw = W - padL - padR;
    const ih = H - padT - padB;
    const leftSeries = series.filter((s) => s.axis !== 'right');
    const rightSeries = series.filter((s) => s.axis === 'right');
    const niceMax = niceCeil(Math.max(1, ...leftSeries.flatMap((s) => s.values.map((v) => Number(v) || 0))));
    const rightMax = rightSeries.length
      ? niceCeil(Math.max(1, ...rightSeries.flatMap((s) => s.values.map((v) => Number(v) || 0))))
      : 0;
    const x = (i) => padL + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
    const yScale = (s) => (v) => padT + ih - (Math.max(0, Number(v) || 0) / (s.axis === 'right' ? rightMax : niceMax)) * ih;

    const gridCount = 4;
    let gridLines = '';
    for (let g = 0; g <= gridCount; g += 1) {
      const gy = padT + (ih * g) / gridCount;
      const val = niceMax - (niceMax * g) / gridCount;
      gridLines += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#eef3f9" stroke-width="1"/>`;
      gridLines += `<text x="${padL - 8}" y="${gy + 3.5}" text-anchor="end" font-size="10" fill="#94a3b8">${fmtCompact(val, format)}</text>`;
      if (rightMax) {
        const rv = rightMax - (rightMax * g) / gridCount;
        gridLines += `<text x="${W - padR + 8}" y="${gy + 3.5}" text-anchor="start" font-size="10" fill="#a99be3">${fmtCompact(rv, rightSeries[0].format || format)}</text>`;
      }
    }

    let paths = '';
    series.forEach((s, si) => {
      const y = yScale(s);
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      if (!pts.length) return;
      const d = smoothPath(pts);
      if (si === 0 && s.area !== false) {
        const gid = `grad-${Math.random().toString(36).slice(2, 8)}`;
        paths += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${s.color}" stop-opacity=".22"/>
          <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/>
        </linearGradient></defs>`;
        paths += `<path d="${d} L ${pts[pts.length - 1][0]} ${padT + ih} L ${pts[0][0]} ${padT + ih} Z" fill="url(#${gid})"/>`;
      }
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
      pts.forEach(([px, py], i) => {
        paths += `<circle class="pt" data-i="${i}" cx="${px}" cy="${py}" r="3.2" fill="#fff" stroke="${s.color}" stroke-width="2" opacity="0"/>`;
      });
    });

    const step = Math.max(1, Math.ceil(labels.length / 8));
    const xLabels = labels.map((l, i) => (i % step === 0 || i === labels.length - 1
      ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#94a3b8">${esc(l)}</text>` : '')).join('');

    const hoverCols = labels.map((l, i) => `<rect class="hover-col" data-i="${i}" x="${x(i) - iw / labels.length / 2}" y="${padT}" width="${Math.max(12, iw / labels.length)}" height="${ih}" fill="transparent" style="cursor:crosshair"/>`).join('');

    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${gridLines}${paths}${xLabels}${hoverCols}</svg>`;

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = series.map((s) => `<span class="legend-item"><i style="background:${s.color}"></i>${esc(s.name)}${s.axis === 'right' ? '<span style="opacity:.55;font-size:10px;margin-left:1px">右轴</span>' : ''}</span>`).join('');
    wrap.appendChild(legend);

    const tip = tooltipFor(wrap);
    const svg = wrap.querySelector('svg');
    const svgRect = () => svg.getBoundingClientRect();
    wrap.querySelectorAll('.hover-col').forEach((col) => {
      col.addEventListener('mouseenter', () => {
        const i = Number(col.dataset.i);
        const r = svgRect();
        const wr = wrap.getBoundingClientRect();
        const px = (x(i) / W) * r.width + (r.left - wr.left);
        tip.innerHTML = `<div style="margin-bottom:3px;opacity:.75">${esc(labels[i])}</div>`
          + series.map((s) => `<div><b style="color:${s.color}">●</b> ${esc(s.name)}：<b>${fmtCompact(s.values[i], s.format || format)}</b></div>`).join('');
        tip.style.left = `${px}px`;
        const anchorY = yScale(series[0])(series[0].values[i]);
        tip.style.top = `${(anchorY / H) * r.height + (r.top - wr.top)}px`;
        tip.classList.add('show');
        wrap.querySelectorAll('.pt').forEach((p) => { p.setAttribute('opacity', p.dataset.i === String(i) ? '1' : '0'); });
      });
      col.addEventListener('mouseleave', () => {
        tip.classList.remove('show');
        wrap.querySelectorAll('.pt').forEach((p) => p.setAttribute('opacity', '0'));
      });
    });
  }

  function niceCeil(v) {
    if (v <= 5) return 5;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * exp;
  }

  function smoothPath(pts) {
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  }

  /** 横向条形列表 */
  function bars(wrap, { items = [], format = 'int', color = '#3b82f6' }) {
    if (!items.length) { wrap.innerHTML = `<div class="chart-empty">暂无可展示数据</div>`; return; }
    const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
    wrap.innerHTML = `<div class="bar-list">${items.map((it) => `
      <div class="bar-row">
        <span class="name" title="${esc(it.label)}">${esc(it.label)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(2, (Number(it.value) / max) * 100)}%;background:${it.color || color}"></span></span>
        <span class="val">${fmtCompact(it.value, format)}</span>
      </div>`).join('')}</div>`;
  }

  /** 负责人条形（颜色深浅编码比率指标：颜色越深比率越高） */
  function owners(wrap, { items = [], format = 'int', color = '#3b82f6', rateLabel = '转化率' }) {
    const list = items.filter((i) => Number(i.value) > 0);
    if (!list.length) { wrap.innerHTML = `<div class="chart-empty">暂无可展示数据</div>`; return; }
    const max = Math.max(1, ...list.map((i) => Number(i.value) || 0));
    wrap.innerHTML = `<div class="bar-list">${list.map((it) => {
      const rate = Number(it.rate);
      const hasRate = Number.isFinite(rate) && rate >= 0;
      const opacity = hasRate ? (0.32 + Math.min(0.68, rate * 1.9)) : 0.55;
      const title = `${it.label}${it.sub ? ' · ' + esc(it.sub) : ''}${hasRate ? ` · ${rateLabel} ${(rate * 100).toFixed(1)}%` : ''}`;
      return `
      <div class="bar-row" title="${title}">
        <span class="name">${esc(it.label)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(2, (Number(it.value) / max) * 100)}%;background:rgba(59,130,246,${opacity.toFixed(2)})"></span></span>
        <span class="val">${fmtCompact(it.value, format)}</span>
      </div>`;
    }).join('')}</div>`;
  }

  /** 环形图 */
  function donut(wrap, { items = [], format = 'int', center = '合计' }) {
    const list = items.filter((i) => Number(i.value) > 0);
    if (!list.length) { wrap.innerHTML = `<div class="chart-empty">暂无可展示数据</div>`; return; }
    const total = list.reduce((a, b) => a + Number(b.value), 0);
    const R = 58, r = 40, C = 2 * Math.PI * ((R + r) / 2);
    let offset = 0;
    const arcs = list.map((it) => {
      const frac = Number(it.value) / total;
      const dash = frac * C;
      const seg = `<circle cx="70" cy="70" r="${(R + r) / 2}" fill="none" stroke="${it.color}" stroke-width="${R - r}"
        stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 70 70)" stroke-linecap="butt"/>`;
      offset += dash;
      return seg;
    }).join('');
    wrap.innerHTML = `
      <div class="donut-wrap">
        <div style="position:relative;width:148px;height:148px;flex:none">
          <svg viewBox="0 0 140 140" style="width:148px;height:148px">${arcs}</svg>
          <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
            <div>
              <div style="font-size:10.5px;color:#94a3b8">${esc(center)}</div>
              <div style="font-size:17px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;letter-spacing:-.02em">${fmtCompact(total, format)}</div>
            </div>
          </div>
        </div>
        <div class="donut-legend">
          ${list.slice(0, 7).map((it) => `
            <div class="donut-row">
              <i style="background:${it.color}"></i>
              <span class="nm" title="${esc(it.label)}">${esc(it.label)}</span>
              <span class="vl">${fmtCompact(it.value, format)}</span>
              <span class="pc">${((Number(it.value) / total) * 100).toFixed(0)}%</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  return { trend, bars, owners, donut };
})();

const PALETTE = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#84cc16'];

/* ---------------- 其他 ---------------- */
function debounce(fn, wait = 240) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function requireLogin(user) {
  if (!user) { location.href = '/login'; return false; }
  return true;
}

function downloadCsv(filename, rows, headers) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map((h) => escape(h.label)).join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => escape(typeof h.value === 'function' ? h.value(r) : r[h.value])).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- 计算公式悬浮提示（hover 显示 / 移出隐藏，fixed 浮层避免被滚动容器裁剪） ---------------- */
(function () {
  let box = null;
  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'fTipBox';
    document.body.appendChild(box);
    return box;
  }
  document.addEventListener('mouseover', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('.f-tip') : null;
    if (!t) return;
    const b = ensure();
    b.textContent = t.dataset.f || '';
    b.style.display = 'block';
    b.style.left = '0px'; b.style.top = '0px';
    const r = t.getBoundingClientRect();
    const bw = b.offsetWidth, bh = b.offsetHeight;
    let x = r.left + r.width / 2 - bw / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - bw - 8));
    let y = r.top - bh - 8;
    if (y < 8) y = r.bottom + 8;
    b.style.left = x + 'px';
    b.style.top = y + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('.f-tip') : null;
    if (!t) return;
    if (box) box.style.display = 'none';
  });
  document.addEventListener('scroll', () => { if (box) box.style.display = 'none'; }, true);
})();

'use strict';

/**
 * 演示种子数据生成器
 * 目的：让系统首次启动即有完整的基地 / 架构 / 目标 / 四类底表数据，
 *      便于直接体验「底表 -> 取数逻辑 -> 看板」的完整链路。
 * 注意：底表行使用真实业务表头（中文列名），必须依赖「字段映射」才能进入看板，
 *      这样才能演示映射配置的作用。
 */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASES = [
  { id: 'wh', name: '武汉基地', code: 'WH', color: '#3b82f6', sort: 1 },
  { id: 'cd', name: '成都基地', code: 'CD', color: '#8b5cf6', sort: 2 },
  { id: 'cs', name: '长沙基地', code: 'CS', color: '#06b6d4', sort: 3 },
  { id: 'zz', name: '郑州基地', code: 'ZZ', color: '#f59e0b', sort: 4 },
  { id: 'hf', name: '合肥基地', code: 'HF', color: '#10b981', sort: 5 },
  { id: 'xa', name: '西安基地', code: 'XA', color: '#ec4899', sort: 6 }
];

const MANAGERS = [
  { empId: 'M101', name: '陈立', baseId: 'wh', teamName: '武汉一组' },
  { empId: 'M102', name: '周敏', baseId: 'wh', teamName: '武汉二组' },
  { empId: 'M201', name: '李维', baseId: 'cd', teamName: '成都一组' },
  { empId: 'M202', name: '郭倩', baseId: 'cd', teamName: '成都二组' },
  { empId: 'M301', name: '何川', baseId: 'cs', teamName: '长沙一组' },
  { empId: 'M401', name: '徐凯', baseId: 'zz', teamName: '郑州一组' },
  { empId: 'M501', name: '沈瑶', baseId: 'hf', teamName: '合肥一组' },
  { empId: 'M601', name: '秦朗', baseId: 'xa', teamName: '西安一组' }
];

const SURNAME = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何林高罗郑梁谢宋唐许韩冯邓曹彭曾';
const GIVEN = ['雨桐', '子豪', '思远', '嘉怡', '文轩', '梦琪', '浩然', '欣怡', '宇航', '佳宁', '俊杰', '雅雯', '泽宇', '若曦', '明轩', '诗涵'];
const CHANNELS = ['企业微信', '电话外呼', '社群运营', '老客转介', '直播间', '短信触达'];
const PRODUCTS = ['基础套餐', '进阶套餐', '年度会员', '家庭版'];

const COLS = {
  direct: { date: '日期', base: '基地', empId: '工号', name: '姓名', customer: '客户姓名', phone: '手机号', status: '跟进状态', channel: '渠道', remark: '备注' },
  high: { date: '跟进日期', base: '基地', empId: '工号', name: '姓名', customer: '客户姓名', phone: '手机号', status: '跟进结果', channel: '渠道', remark: '备注' },
  deal: { date: '成交日期', base: '基地', empId: '工号', name: '姓名', customer: '客户姓名', phone: '手机号', amount: '成交金额', product: '产品', channel: '渠道' },
  activity: { date: '触达日期', base: '基地', empId: '工号', name: '姓名', phone: '客户手机号', channel: '触达方式', status: '触达结果' }
};

function buildEmployees(rand) {
  const list = [];
  let seq = 1001;
  MANAGERS.forEach((m, mi) => {
    const count = 3 + (mi % 2);
    for (let i = 0; i < count; i += 1) {
      const name = SURNAME[Math.floor(rand() * SURNAME.length)] + GIVEN[Math.floor(rand() * GIVEN.length)];
      list.push({
        empId: `E${seq}`,
        name,
        baseId: m.baseId,
        managerId: m.empId,
        managerName: m.name,
        teamName: m.teamName,
        level: '一线',
        role: i === 0 ? '储备主管' : '顾问',
        status: '在职'
      });
      seq += 1;
    }
  });
  return list;
}

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function buildOrg(employees) {
  const org = [];
  MANAGERS.forEach((m) => {
    org.push({
      empId: m.empId, name: m.name, baseId: m.baseId, managerId: '', managerName: '',
      teamName: m.teamName, level: '高经', role: '高级经理', status: '在职', effectiveDate: '2026-01-01'
    });
  });
  employees.forEach((e) => org.push({ ...e, effectiveDate: '2026-01-01' }));
  // 演示一条架构变更：E1004 于 2026-09-01 从武汉一组转入武汉二组
  const moved = employees.find((e) => e.empId === 'E1004');
  if (moved) {
    org.push({
      empId: moved.empId, name: moved.name, baseId: 'wh', managerId: 'M102', managerName: '周敏',
      teamName: '武汉二组', level: '一线', role: '顾问', status: '在职', effectiveDate: '2026-09-01'
    });
  }
  return org;
}

const DATASET_DEFS = [
  {
    id: 'ds_direct', key: 'direct', name: '新用户直推未转化明细', category: '线索类',
    desc: '一线每日新增的直推线索与跟进状态，用于统计线索量、转化数与转化率。',
    icon: 'user-plus', tone: 'blue',
    columns: ['日期', '基地', '工号', '姓名', '客户姓名', '手机号', '跟进状态', '渠道', '备注'],
    standardFields: [
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'base', label: '基地', type: 'text', required: true },
      { key: 'empId', label: '工号', type: 'text', required: true },
      { key: 'empName', label: '姓名', type: 'text', required: false },
      { key: 'customer', label: '客户姓名', type: 'text', required: false },
      { key: 'phone', label: '客户手机号', type: 'text', required: false },
      { key: 'status', label: '跟进状态', type: 'enum', required: false },
      { key: 'channel', label: '渠道', type: 'text', required: false },
      { key: 'amount', label: '金额', type: 'number', required: false }
    ],
    mapping: { date: '日期', base: '基地', empId: '工号', empName: '姓名', customer: '客户姓名', phone: '手机号', status: '跟进状态', channel: '渠道' },
    caliber: '仅统计状态不为「无效号码」的线索；转化数以状态=已转化计；客户数按手机号去重。',
    metrics: [
      { key: 'list', name: '线索量', type: 'count', field: '', filter: { field: 'status', op: 'neq', value: '无效号码' }, unit: '条', format: 'int', scope: 'base', desc: '底表有效行数' },
      { key: 'cust', name: '客户数', type: 'distinct', field: 'phone', filter: { field: 'status', op: 'neq', value: '无效号码' }, unit: '人', format: 'int', scope: 'base', desc: '按手机号去重（不含无效号码）' },
      { key: 'conv', name: '转化数', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '已转化' }, unit: '人', format: 'int', scope: 'base', desc: '状态=已转化' },
      { key: 'rate', name: '转化率', type: 'ratio', formula: 'conv / list', unit: '%', format: 'pct', scope: 'global', desc: '转化数 ÷ 线索量' }
    ]
  },
  {
    id: 'ds_high', key: 'high', name: '高潜老用户跟进表', category: '线索类',
    desc: '存量高潜客户的跟进记录，关注跟进覆盖与二次转化。',
    icon: 'spark', tone: 'violet',
    columns: ['跟进日期', '基地', '工号', '姓名', '客户姓名', '手机号', '跟进结果', '渠道', '备注'],
    standardFields: [
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'base', label: '基地', type: 'text', required: true },
      { key: 'empId', label: '工号', type: 'text', required: true },
      { key: 'empName', label: '姓名', type: 'text', required: false },
      { key: 'customer', label: '客户姓名', type: 'text', required: false },
      { key: 'phone', label: '客户手机号', type: 'text', required: false },
      { key: 'status', label: '跟进结果', type: 'enum', required: false },
      { key: 'channel', label: '渠道', type: 'text', required: false },
      { key: 'amount', label: '金额', type: 'number', required: false }
    ],
    mapping: { date: '跟进日期', base: '基地', empId: '工号', empName: '姓名', customer: '客户姓名', phone: '手机号', status: '跟进结果', channel: '渠道' },
    caliber: '跟进结果含「待跟进 / 跟进中 / 已转化 / 流失」；转化率 = 已转化 ÷ 跟进总量。',
    metrics: [
      { key: 'list', name: '跟进量', type: 'count', field: '', filter: null, unit: '条', format: 'int', scope: 'base', desc: '底表总行数' },
      { key: 'cust', name: '覆盖客户', type: 'distinct', field: 'phone', filter: null, unit: '人', format: 'int', scope: 'base', desc: '按手机号去重' },
      { key: 'conv', name: '二次转化', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '已转化' }, unit: '人', format: 'int', scope: 'base', desc: '跟进结果=已转化' },
      { key: 'rate', name: '转化率', type: 'ratio', formula: 'conv / list', unit: '%', format: 'pct', scope: 'global', desc: '二次转化 ÷ 跟进量' }
    ]
  },
  {
    id: 'ds_deal', key: 'deal', name: '成交明细表', category: '业绩类',
    desc: '实际成交订单，含金额与产品，用于业绩与客单价分析。',
    icon: 'wallet', tone: 'green',
    columns: ['成交日期', '基地', '工号', '姓名', '客户姓名', '手机号', '成交金额', '产品', '渠道'],
    standardFields: [
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'base', label: '基地', type: 'text', required: true },
      { key: 'empId', label: '工号', type: 'text', required: true },
      { key: 'empName', label: '姓名', type: 'text', required: false },
      { key: 'customer', label: '客户姓名', type: 'text', required: false },
      { key: 'phone', label: '客户手机号', type: 'text', required: false },
      { key: 'amount', label: '成交金额', type: 'number', required: true },
      { key: 'channel', label: '渠道', type: 'text', required: false }
    ],
    mapping: { date: '成交日期', base: '基地', empId: '工号', empName: '姓名', customer: '客户姓名', phone: '手机号', amount: '成交金额', channel: '渠道' },
    caliber: '成交金额以底表金额列为准，单位元；客单价 = 成交金额 ÷ 成交单数。',
    metrics: [
      { key: 'orders', name: '成交单数', type: 'count', field: '', filter: null, unit: '单', format: 'int', scope: 'base', desc: '底表行数' },
      { key: 'amount', name: '成交金额', type: 'sum', field: 'amount', filter: null, unit: '元', format: 'money', scope: 'base', desc: '金额列求和' },
      { key: 'avg', name: '客单价', type: 'ratio', formula: 'amount / orders', unit: '元', format: 'money', scope: 'global', desc: '成交金额 ÷ 成交单数' },
      { key: 'cust', name: '成交客户', type: 'distinct', field: 'phone', filter: null, unit: '人', format: 'int', scope: 'base', desc: '按手机号去重' }
    ]
  },
  {
    id: 'ds_activity', key: 'activity', name: '过程量触达表', category: '过程类',
    desc: '电联 / 企微触达记录，衡量过程量与有效沟通率。',
    icon: 'phone', tone: 'amber',
    columns: ['触达日期', '基地', '工号', '姓名', '客户手机号', '触达方式', '触达结果'],
    standardFields: [
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'base', label: '基地', type: 'text', required: true },
      { key: 'empId', label: '工号', type: 'text', required: true },
      { key: 'empName', label: '姓名', type: 'text', required: false },
      { key: 'phone', label: '客户手机号', type: 'text', required: false },
      { key: 'status', label: '触达结果', type: 'enum', required: false },
      { key: 'channel', label: '触达方式', type: 'text', required: false }
    ],
    mapping: { date: '触达日期', base: '基地', empId: '工号', empName: '姓名', phone: '客户手机号', status: '触达结果', channel: '触达方式' },
    caliber: '有效沟通指触达结果=有效沟通；触达客户数按手机号去重。',
    metrics: [
      { key: 'touch', name: '触达次数', type: 'count', field: '', filter: null, unit: '次', format: 'int', scope: 'base', desc: '底表总行数' },
      { key: 'valid', name: '有效沟通', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '有效沟通' }, unit: '次', format: 'int', scope: 'base', desc: '触达结果=有效沟通' },
      { key: 'cust', name: '触达客户', type: 'distinct', field: 'phone', filter: null, unit: '人', format: 'int', scope: 'base', desc: '按手机号去重' },
      { key: 'rate', name: '有效率', type: 'ratio', formula: 'valid / touch', unit: '%', format: 'pct', scope: 'global', desc: '有效沟通 ÷ 触达次数' }
    ]
  }
];

const STATUS_MAP = {
  direct: ['待跟进', '跟进中', '已转化', '已转化', '无效号码', '跟进中', '已转化'],
  high: ['待跟进', '跟进中', '已转化', '流失', '跟进中', '待跟进', '已转化'],
  deal: ['已成交'],
  activity: ['有效沟通', '未接通', '有效沟通', '无效号码', '未接通', '有效沟通']
};

const PHONE_POOL = (() => {
  const r = mulberry32(90210);
  const out = [];
  for (let i = 0; i < 4200; i += 1) out.push(`1${[3, 5, 7, 8, 9][Math.floor(r() * 5)]}${String(Math.floor(r() * 1e9)).padStart(9, '0')}`);
  return out;
})();

function buildDatasetRows(rand, kind, employees, baseMap) {
  const rows = [];
  const C = COLS[kind];
  const start = new Date(2026, 5, 1);
  const end = new Date(2026, 10, 4);
  const prob = { direct: 0.92, high: 0.55, deal: 0.26, activity: 1 }[kind];
  const statuses = STATUS_MAP[kind];
  let rowNo = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0) continue;
    const dateStr = ymd(d);
    const monthIdx = d.getMonth();
    const ramp = 0.78 + (monthIdx - 5) * 0.05;
    employees.forEach((e, idx) => {
      const skill = 0.62 + ((idx * 37) % 11) / 13;
      const p = prob * skill * ramp * (dow === 6 ? 0.5 : 1);
      const times = kind === 'activity' ? (p > 0.7 ? 3 : p > 0.45 ? 2 : 1) : (rand() < p ? 1 : 0);
      for (let k = 0; k < times; k += 1) {
        const base = baseMap[e.baseId];
        const status = statuses[Math.floor(rand() * statuses.length)];
        const customer = SURNAME[Math.floor(rand() * SURNAME.length)] + (rand() > 0.5 ? '先生' : '女士');
        const phone = PHONE_POOL[Math.floor(rand() * PHONE_POOL.length)];
        const row = { _rowNo: (rowNo += 1) };
        row[C.date] = dateStr;
        row[C.base] = base.name;
        row[C.empId] = e.empId;
        row[C.name] = e.name;
        if (C.customer) row[C.customer] = customer;
        row[C.phone] = phone;
        row[C.status] = status;
        row[C.channel] = CHANNELS[Math.floor(rand() * CHANNELS.length)];
        if (C.remark) row[C.remark] = kind === 'activity' ? ['第1次触达', '第2次触达', '回访', ''][Math.floor(rand() * 4)] : '';
        if (kind === 'deal') {
          row[C.amount] = Math.round((3200 + rand() * 26000) / 100) * 100;
          row[C.status] = '已成交';
          row[C.product] = PRODUCTS[Math.floor(rand() * PRODUCTS.length)];
        }
        rows.push(row);
      }
    });
  }
  return rows;
}

/** 根据底表实际数据反推目标，保证达成率落在 88% ~ 118% 的合理区间 */
function buildTargets(rand, rows, employees, baseMap) {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const empMgr = {};
  employees.forEach((e) => { empMgr[e.empId] = e.managerId; });

  const agg = {};
  const mgrAgg = {};
  months.forEach((m) => {
    agg[m] = {};
    mgrAgg[m] = {};
    BASES.forEach((b) => { agg[m][b.id] = { list: 0, conv: 0, amount: 0 }; });
    MANAGERS.forEach((x) => { mgrAgg[m][x.empId] = { conv: 0, amount: 0 }; });
  });

  const baseByName = {};
  BASES.forEach((b) => { baseByName[b.name] = b.id; });

  rows.ds_direct.forEach((r) => {
    const period = String(r['日期']).slice(0, 7);
    const bid = baseByName[r['基地']];
    if (!agg[period] || !bid) return;
    agg[period][bid].list += 1;
    if (r['跟进状态'] === '已转化') {
      agg[period][bid].conv += 1;
      const mgr = empMgr[r['工号']];
      if (mgr && mgrAgg[period][mgr]) mgrAgg[period][mgr].conv += 1;
    }
  });
  rows.ds_deal.forEach((r) => {
    const period = String(r['成交日期']).slice(0, 7);
    const bid = baseByName[r['基地']];
    if (!agg[period] || !bid) return;
    const amt = Number(r['成交金额']) || 0;
    agg[period][bid].amount += amt;
    const mgr = empMgr[r['工号']];
    if (mgr && mgrAgg[period][mgr]) mgrAgg[period][mgr].amount += amt;
  });

  const targets = [];
  const complete = months.filter((m) => m !== '2026-11');
  // 完整月份均值：用于推算「进行中月份」的整月目标，避免用几天数据反推出过小的目标
  const avgOf = (source, key) => {
    const o = { list: 0, conv: 0, amount: 0 };
    complete.forEach((m) => {
      const a = source[m][key] || {};
      o.list += a.list || 0;
      o.conv += a.conv || 0;
      o.amount += a.amount || 0;
    });
    const n = complete.length || 1;
    return { list: o.list / n, conv: o.conv / n, amount: o.amount / n };
  };
  const elapsed = 4 / 30; // 演示数据截止 2026-11-04

  months.forEach((period) => {
    const partial = period === '2026-11';
    const factor = partial ? elapsed : 1;
    BASES.forEach((b) => {
      const a = partial ? avgOf(agg, b.id) : agg[period][b.id];
      const noise = () => 0.92 + rand() * 0.2;
      targets.push({ period, scope: 'base', key: b.id, keyName: b.name, metric: 'list', metricName: '线索量', value: Math.max(1, Math.round(a.list * noise() * factor)) });
      targets.push({ period, scope: 'base', key: b.id, keyName: b.name, metric: 'conv', metricName: '转化数', value: Math.max(1, Math.round(a.conv * noise() * factor)) });
      targets.push({ period, scope: 'base', key: b.id, keyName: b.name, metric: 'amount', metricName: '成交金额', value: Math.max(1000, Math.round((a.amount * noise() * factor) / 1000) * 1000) });
    });
    MANAGERS.forEach((m) => {
      const a = partial ? avgOf(mgrAgg, m.empId) : mgrAgg[period][m.empId];
      const noise = () => 0.9 + rand() * 0.24;
      targets.push({ period, scope: 'manager', key: m.empId, keyName: `${m.name} · ${m.teamName}`, metric: 'conv', metricName: '转化数', value: Math.max(1, Math.round(a.conv * noise() * factor)) });
      targets.push({ period, scope: 'manager', key: m.empId, keyName: `${m.name} · ${m.teamName}`, metric: 'amount', metricName: '成交金额', value: Math.max(1000, Math.round((a.amount * noise() * factor) / 1000) * 1000) });
    });
  });
  return targets;
}

function buildSeed() {
  const rand = mulberry32(20261104);
  const baseMap = {};
  BASES.forEach((b) => { baseMap[b.id] = b; });
  const employees = buildEmployees(rand);
  const org = buildOrg(employees);

  const rows = {};
  DATASET_DEFS.forEach((ds) => {
    rows[ds.id] = buildDatasetRows(rand, ds.key, employees, baseMap);
  });

  const accounts = [
    {
      id: 'acc_admin', username: 'admin', password: 'admin123', name: '张运营',
      role: 'admin', title: '数据运营', baseId: '', scopes: [], status: 'active',
      createdAt: '2026-08-01 09:00', lastLogin: ''
    }
  ];
  BASES.forEach((b, i) => {
    accounts.push({
      id: `acc_${b.id}`, username: `base_${b.code.toLowerCase()}`, password: '123456',
      name: `${b.name}负责人`, role: 'base', title: '基地负责人', baseId: b.id,
      scopes: [], status: 'active', createdAt: '2026-08-01 09:00',
      lastLogin: i === 0 ? '2026-11-04 09:12' : ''
    });
  });

  const datasets = DATASET_DEFS.map((ds) => {
    const r = rows[ds.id];
    return {
      ...ds,
      dimensions: ['base', 'manager', 'team', 'month', 'status', 'empId'],
      visibility: { scopeToggle: true, allowManagerDrill: true },
      status: 'ready',
      rowCount: r.length,
      fileName: `${ds.name}-2026年6-11月.xlsx`,
      updatedAt: '2026-11-04 08:40',
      updatedBy: '张运营',
      history: [
        { at: '2026-11-04 08:40', by: '张运营', rows: r.length, mode: 'replace', file: `${ds.name}-2026年6-11月.xlsx` },
        { at: '2026-10-08 09:15', by: '张运营', rows: Math.round(r.length * 0.82), mode: 'replace', file: `${ds.name}-2026年6-10月.xlsx` }
      ]
    };
  });

  return {
    version: 1,
    createdAt: '2026-08-01 09:00',
    bases: BASES,
    accounts,
    datasets,
    rows,
    org,
    targets: buildTargets(rand, rows, employees, baseMap),
    audits: [
      { at: '2026-11-04 08:40', user: '张运营', action: '上传底表', detail: '新用户直推未转化明细 · 替换导入完成', ip: '10.6.2.31' },
      { at: '2026-11-04 08:36', user: '张运营', action: '更新取数逻辑', detail: '新用户直推未转化明细 · 修改「转化率」口径', ip: '10.6.2.31' },
      { at: '2026-11-03 18:02', user: '张运营', action: '上传架构', detail: '销售架构 · 更新 37 人（含 1 条架构变更）', ip: '10.6.2.31' },
      { at: '2026-11-01 10:20', user: '张运营', action: '下发目标', detail: '6-11 月基地 / 高经目标', ip: '10.6.2.31' }
    ]
  };
}

module.exports = { buildSeed, BASES };

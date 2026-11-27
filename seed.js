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

/* ---------- 演示扩展：有数业绩完成度 / 钻石商城财务报表（合成数据） ---------- */
const EXTRA_DEFS = [
  {
    id: 'ds_youshu', key: 'youshu', name: '有数业绩完成度', preset: 'perf', category: '业绩类',
    desc: '有数系统导出的一线业绩明细：按工号累计转化金额，用于一线直推业绩排名、团队完成度与龙珠奖。',
    icon: 'wallet', tone: 'green',
    columns: ['下单时间', '基地', '工号', '销售姓名', '高经', '经理', '销售直推业绩', '退款'],
    standardFields: [
      { key: 'date', label: '下单时间', type: 'date', required: true },
      { key: 'base', label: '基地', type: 'text', required: false },
      { key: 'empId', label: '工号', type: 'text', required: true },
      { key: 'empName', label: '销售姓名', type: 'text', required: false },
      { key: 'amount', label: '销售直推业绩', type: 'number', required: true },
      { key: 'refund', label: '退款', type: 'number', required: false }
    ],
    mapping: { date: '下单时间', base: '基地', empId: '工号', empName: '销售姓名', amount: '销售直推业绩' },
    caliber: '按工号数透销售直推业绩；退款列存在时净营收 = 业绩 − 退款。',
    metrics: [
      { key: 'list', name: '订单数', type: 'count', field: '', filter: null, unit: '单', format: 'int', scope: 'base', desc: '底表行数' },
      { key: 'amount', name: '转化金额', type: 'sum', field: 'amount', filter: null, unit: '元', format: 'money', scope: 'base', desc: '销售直推业绩求和' }
    ]
  },
  {
    id: 'ds_diamond', key: 'diamond', name: '钻石商城财务报表', preset: '', category: '业绩类',
    desc: '钻石发放与消耗流水：匹配已转化老用户，用于钻石未使用名单与兑换明细。',
    icon: 'spark', tone: 'violet',
    columns: ['用户id', '钻石消耗/发放', '钻石数量', '钻石消耗/发放原因', '消耗/发放时间', '唯一id（包括兑换商品id）', '订单情况'],
    standardFields: [
      { key: 'userId', label: '用户ID', type: 'text', required: true, aliases: ['用户id', '老用户ID'] },
      { key: 'type', label: '类型', type: 'text', required: false, aliases: ['钻石消耗/发放'] },
      { key: 'diamonds', label: '钻石数量', type: 'number', required: false },
      { key: 'date', label: '时间', type: 'text', required: false, aliases: ['消耗/发放时间'] }
    ],
    mapping: {},
    caliber: '发放/消耗流水按用户ID聚合；发放原因=邀请平台新用户报名正价课对应转介绍奖励。',
    metrics: [
      { key: 'list', name: '流水数', type: 'count', field: '', filter: null, unit: '笔', format: 'int', scope: 'base', desc: '底表行数' }
    ]
  }
];

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
    id: 'ds_high', key: 'high', name: '高潜老用户跟进表', preset: 'koc', category: '线索类',
    desc: '存量高潜客户的跟进记录，关注跟进覆盖与二次转化。',
    icon: 'spark', tone: 'violet',
    columns: ['老用户ID', '工号', '姓名', '基地', '高经', '经理', '主管', '组长', '累计新体验用户数量', '累计新正价用户数量', '累计金额', '26年新体验用户数量', '26年新正价用户数量'],
    standardFields: [
      { key: 'oldUserId', label: '老用户ID', type: 'text', required: false },
      { key: 'empId', label: '工号', type: 'text', required: true },
      { key: 'empName', label: '姓名', type: 'text', required: true },
      { key: 'base', label: '基地', type: 'text', required: true },
      { key: 'managerName', label: '高经', type: 'text', required: false },
      { key: 'manager2', label: '经理', type: 'text', required: false },
      { key: 'manager3', label: '主管', type: 'text', required: false },
      { key: 'manager4', label: '组长', type: 'text', required: false },
      { key: 'cumExp', label: '累计新体验用户数量', type: 'number', required: false, segment: 'cum' },
      { key: 'cumPay', label: '累计新正价用户数量', type: 'number', required: false, segment: 'cum' },
      { key: 'amount', label: '累计金额', type: 'number', required: false, segment: 'cum' },
      { key: 'y26Exp', label: '26年新体验用户数量', type: 'number', required: false, segment: 'y26' },
      { key: 'y26Pay', label: '26年新正价用户数量', type: 'number', required: false, segment: 'y26' },
      { key: 'y26Amount', label: '26年金额', type: 'number', required: false, segment: 'y26' },
      { key: 'status', label: 'KOC层级', type: 'enum', required: false, computed: true },
      { key: 'overlapNote', label: '重合备注', type: 'text', required: false, computed: true }
    ],
    mapping: { oldUserId: '老用户ID', empId: '工号', empName: '姓名', base: '基地', managerName: '高经', manager2: '经理', manager3: '主管', manager4: '组长', cumExp: '累计新体验用户数量', cumPay: '累计新正价用户数量', amount: '累计金额', y26Exp: '26年新体验用户数量', y26Pay: '26年新正价用户数量', y26Amount: '26年金额', status: 'KOC层级' },
    caliber: '历史累计与26年转介绍两段上传，按工号合并为一人一行，自动分层并标记重合。',
    metrics: [
      { key: 'list', name: '名单总人数', type: 'count', field: '', filter: null, unit: '人', format: 'int', scope: 'base', desc: '底表全部行数' },
      { key: 'tierA', name: '历史累计≥6人', type: 'count', field: '', filter: { field: 'status', op: 'eq', value: '历史累计≥6' }, unit: '人', format: 'int', scope: 'base', desc: '累计新正价≥6 的用户数' },
      { key: 'cumPay', name: '历史累计新正价', type: 'sum', field: 'cumPay', filter: null, unit: '人', format: 'int', scope: 'base', desc: '累计新正价用户数量求和' },
      { key: 'y26Pay', name: '26年新正价', type: 'sum', field: 'y26Pay', filter: null, unit: '人', format: 'int', scope: 'base', desc: '26年新正价用户数量求和' }
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

/* ---------- 演示扩展：a-b-c 绑定 / KOC 列 / 业绩表 / 钻石流水 / 团队目标段 ---------- */
function enrichDirectRows(rand, rows, employees) {
  const empMap = {};
  employees.forEach((e) => { empMap[e.empId] = e; });
  const phoneMap = new Map();
  let seq = 7000;
  rows.forEach((r) => {
    const e = empMap[r['工号']] || {};
    if (!phoneMap.has(r['手机号'])) phoneMap.set(r['手机号'], { b: `urs-demo${seq}@163.com`, c: `urs-demo${seq}@163.com` });
    seq += 1;
    const ids = phoneMap.get(r['手机号']);
    r['b'] = ids.b;
    r['c'] = ids.c;
    r['转化userid'] = ids.c;
    r['a'] = `demo-a${e.managerId || e.empId || 'x'}`;
    r['高经'] = e.managerName || '';
    r['经理'] = e.teamName || '';
    r['主管'] = '';
    r['组长'] = '';
    if (r['跟进状态'] === '已转化') {
      r['转化金额'] = Math.round((3200 + rand() * 26000) / 100) * 100;
      r['转化日期'] = r['日期'];
      r['转化时间'] = `${r['日期']}T${pad(Math.floor(rand() * 24))}:${pad(Math.floor(rand() * 60))}:00`;
      r['转介绍日期'] = r['日期'];
      r['转介绍系统'] = '哥伦布';
      r['订单行数'] = 1;
      r['转化订单ID'] = `DEMO${seq}`;
    } else {
      r['转化金额'] = '';
      r['转介绍日期'] = r['日期'];
    }
  });
  return phoneMap;
}

function buildHighRows(rand, employees, baseMap) {
  const gjByBase = { wh: '沈国栋', cd: '唐启明', cs: '罗静怡', zz: '赵天宇', hf: '李杰', xa: '吴梦洁' };
  const zgPool = ['钱进', '孙梅', '高峰', '胡伟', '林芳', '郑涛', '吴磊', '宋江'];
  const zzPool = ['杨帆', '白雪', '吕明', '朱婷', '张强', '黄蓉'];
  const rows = [];
  let seq = 5000;
  employees.forEach((e) => {
    const n = 3 + Math.floor(rand() * 6); // 每名销售 3~8 个老用户
    for (let k = 0; k < n; k += 1) {
      const cumExp = Math.floor(rand() * 10);
      const x = rand();
      const cumPay = x < 0.08 ? 6 + Math.floor(rand() * 6) : x < 0.38 ? 3 + Math.floor(rand() * 3) : Math.floor(rand() * 3);
      const y26Exp = Math.floor(rand() * 3);
      const y26Pay = rand() < 0.35 ? Math.floor(rand() * 3) : 0;
      const tier = cumPay >= 6 ? '历史累计≥6' : cumPay >= 3 ? '历史累计3-6' : (y26Pay > 0 ? '26年推荐成功' : '未入选');
      const overlap = cumPay >= 3 && y26Pay > 0 ? '与26年推荐重合' : '';
      rows.push({
        _rowNo: rows.length + 1,
        '老用户ID': `urs-demo${seq}@163.com`,
        '工号': e.empId,
        '姓名': e.name,
        '基地': (baseMap[e.baseId] || {}).name || '',
        '高经': gjByBase[e.baseId] || '',
        '经理': e.managerName || '',
        '主管': zgPool[Math.floor(rand() * zgPool.length)],
        '组长': zzPool[Math.floor(rand() * zzPool.length)],
        '累计新体验用户数量': cumExp,
        '累计新正价用户数量': cumPay,
        '累计金额': cumPay * 8000 + Math.floor(rand() * 5000),
        '26年新体验用户数量': y26Exp,
        '26年新正价用户数量': y26Pay,
        'KOC层级': tier,
        '重合备注': overlap
      });
      seq += 1;
    }
  });
  return rows;
}

function buildYoushuRows(rand, employees, baseMap, phoneMap) {
  const rows = [];
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const cList = [...phoneMap.values()].map((v) => v.c);
  let rowNo = 0;
  months.forEach((m, mi) => {
    const ramp = 0.78 + mi * 0.05;
    employees.forEach((e, idx) => {
      const skill = 0.62 + ((idx * 37) % 11) / 13;
      const n = Math.floor(rand() * 5) + (rand() < skill * ramp ? 1 : 0);
      for (let k = 0; k < n; k += 1) {
        const day = 1 + Math.floor(rand() * 28);
        rows.push({
          _rowNo: (rowNo += 1),
          '下单时间': `${m}-${String(day).padStart(2, '0')}`,
          '基地': baseMap[e.baseId].name,
          '工号': e.empId,
          '销售姓名': e.name,
          '高经': e.managerName,
          '经理': e.teamName,
          '销售直推业绩': Math.round((2800 + rand() * 32000) / 100) * 100,
          '退款': rand() < 0.08 ? Math.round((200 + rand() * 2400) / 100) * 100 : '',
          'c': rand() < 0.5 ? cList[Math.floor(rand() * cList.length)] : ''
        });
      }
    });
  });
  return rows;
}

function buildDiamondRows(rand, phoneMap, directRows) {
  const converted = new Set();
  directRows.forEach((r) => { if (r['跟进状态'] === '已转化' && Number(r['转化金额']) > 0) converted.add(r['b']); });
  const rows = [];
  let seq = 90000;
  phoneMap.forEach((ids, phone) => {
    const grantDate = `2026-0${6 + Math.floor(rand() * 6)}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`;
    rows.push({
      _rowNo: rows.length + 1,
      '用户id': ids.b,
      '钻石消耗/发放': '发放',
      '钻石数量': 50000,
      '钻石消耗/发放原因': '邀请平台新用户报名正价课',
      '消耗/发放时间': grantDate,
      '唯一id（包括兑换商品id）': `inviteOrder:${ids.c}`,
      '订单情况': ''
    });
    if (converted.has(ids.b)) {
      const n = rand() < 0.6 ? 1 + Math.floor(rand() * 3) : 0;
      for (let k = 0; k < n; k += 1) {
        rows.push({
          _rowNo: rows.length + 1,
          '用户id': ids.b,
          '钻石消耗/发放': '消耗',
          '钻石数量': Math.round((1000 + rand() * 18000) / 100) * 100,
          '钻石消耗/发放原因': '兑换商品',
          '消耗/发放时间': grantDate,
          '唯一id（包括兑换商品id）': `redeem:${seq++}`,
          '订单情况': '已完成'
        });
      }
    }
  });
  return rows;
}

function buildPerfTargetSegs(rand, employees) {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const mk = (names) => months.flatMap((m) => names.map((n) => ({ month: m, name: n, target: Math.round((60000 + rand() * 60000) / 100) * 100 })));
  return {
    gj: mk([...new Set(employees.map((e) => e.managerName))]),
    jl: mk([...new Set(employees.map((e) => e.teamName))])
  };
}

/* 接例子链路段：leads 分配表 + 订单池 + 接例子目标（合成） */
function buildUncvSegs(rand, employees, phoneMap) {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const leads = [];
  const orders = [];
  let seq = 30000;
  phoneMap.forEach((ids) => {
    const e = employees[Math.floor(rand() * employees.length)];
    const m = months[Math.floor(rand() * months.length)];
    const st = rand() < 0.08 ? '无效' : rand() < 0.05 ? '不分配' : '';
    leads.push({
      _rowNo: leads.length + 1,
      userId: ids.c,
      month: m,
      time: `${m}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
      base: '',
      ccId: e.name,
      empId: e.empId,
      status: st
    });
    if (!st && rand() < 0.42) {
      orders.push({
        _rowNo: orders.length + 1,
        userId: ids.c,
        ccId: e.name,
        amount: Math.round((3200 + rand() * 26000) / 100) * 100,
        status: rand() < 0.05 ? '完全退款' : '',
        month: m,
        base: ''
      });
    }
    seq += 1;
  });
  return { leads, orders };
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
  const phoneMap = enrichDirectRows(rand, rows.ds_direct, employees);
  rows.ds_high = buildHighRows(rand, employees, baseMap);
  rows.ds_youshu = buildYoushuRows(rand, employees, baseMap, phoneMap);
  rows.ds_diamond = buildDiamondRows(rand, phoneMap, rows.ds_direct);
  const segs = buildPerfTargetSegs(rand, employees);
  // 段同时挂在 ds_deal（龙珠奖读取）与 ds_youshu（rankings 取数按 perf 数据集 id 读段）
  ['targetDirectGj', 'targetDirectJl', 'targetLeads'].forEach((k) => { rows[`ds_deal:${k}`] = []; rows[`ds_youshu:${k}`] = []; });
  rows['ds_deal:targetDirectGj'] = segs.gj;
  rows['ds_deal:targetDirectJl'] = segs.jl;
  rows['ds_deal:targetLeads'] = segs.gj.map((t) => ({ month: t.month, name: t.name, target: Math.round(t.target * 0.6 / 100) * 100 }));
  rows['ds_youshu:targetDirectGj'] = segs.gj;
  rows['ds_youshu:targetDirectJl'] = segs.jl;
  rows['ds_youshu:targetLeads'] = rows['ds_deal:targetLeads'];
  const uncvSegs = buildUncvSegs(rand, employees, phoneMap);
  rows['ds_deal:leads'] = uncvSegs.leads;
  rows['ds_deal:orders'] = uncvSegs.orders;
  rows['ds_youshu:leads'] = uncvSegs.leads;
  rows['ds_youshu:orders'] = uncvSegs.orders;

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

  const datasets = [...DATASET_DEFS, ...EXTRA_DEFS].map((ds) => {
    const r = rows[ds.id] || [];
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

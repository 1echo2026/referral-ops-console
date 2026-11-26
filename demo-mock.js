/* 演示环境 mock：拦截 /api/* 请求，返回构建时快照的 JSON（api/*.json）。
 * 只读演示：登录任意账号均可进入；写操作返回提示。 */
(function () {
  'use strict';
  var ORIG = window.fetch.bind(window);
  var NAV = { bootstrap: '/api/bootstrap', me: '/api/me', login: '/api/login' };

  function jres(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json' } });
  }
  function file(name) {
    return ORIG('api/' + name, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    });
  }
  function dsId(url) {
    var m = /[?&]dataset=([^&]*)/.exec(url);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function qv(url, key) {
    var m = new RegExp('[?&]' + key + '=([^&]*)').exec(url);
    return m ? decodeURIComponent(m[1]) : '';
  }

  /* 明细名单：客户端过滤 + 分页（语义与 server.js listRecords 一致） */
  function serveRecords(url) {
    var ds = dsId(url) || 'ds_deal';
    var page = Math.max(1, Number(qv(url, 'page') || 1));
    var pageSize = Math.min(100, Math.max(5, Number(qv(url, 'pageSize') || 20)));
    return file('records_' + ds + '.json').then(function (d) {
      if (!d) return jres({ error: '数据集不存在' }, 404);
      var rows = d.rows || [];
      var base = qv(url, 'base'), status = qv(url, 'status'), channel = qv(url, 'channel');
      var from = qv(url, 'from'), to = qv(url, 'to'), kw = (qv(url, 'q') || '').trim().toLowerCase();
      if (base && base !== 'all') rows = rows.filter(function (r) { return r.baseId === base; });
      if (status && status !== 'all') rows = rows.filter(function (r) { return r.status === status; });
      if (channel && channel !== 'all') rows = rows.filter(function (r) { return r.channel === channel; });
      if (from) rows = rows.filter(function (r) { return r.date && r.date >= from; });
      if (to) rows = rows.filter(function (r) { return r.date && r.date <= to; });
      if (kw) rows = rows.filter(function (r) { return ((r.customer || '') + ' ' + (r.phone || '') + ' ' + (r.empName || '') + ' ' + (r.empId || '')).toLowerCase().indexOf(kw) >= 0; });
      rows = rows.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || ((a._rowNo || 0) - (b._rowNo || 0)); });
      var total = rows.length;
      var slice = rows.slice((page - 1) * pageSize, page * pageSize);
      return jres({ dataset: d.dataset, total: total, page: page, pageSize: pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), statuses: d.statuses || [], rows: slice });
    });
  }

  /* CSV 导出（客户端生成，替代 /api/records/export） */
  window.demoExportRecords = function (qs) {
    var ds = dsId('?' + qs) || 'ds_deal';
    file('records_' + ds + '.json').then(function (d) {
      if (!d) return;
      var rows = d.rows || [];
      var base = qv('?' + qs, 'base'), status = qv('?' + qs, 'status');
      if (base && base !== 'all') rows = rows.filter(function (r) { return r.baseId === base; });
      if (status && status !== 'all') rows = rows.filter(function (r) { return r.status === status; });
      var head = ['数据类别', '基地', '客户', '手机号', '状态', '渠道', '负责人', '工号', '日期'];
      var esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      var lines = [head.map(esc).join(',')];
      rows.forEach(function (r) {
        lines.push([d.dataset.name, r.baseName, r.customer, r.phone, r.status, r.channel, r.empName, r.empId, r.date].map(esc).join(','));
      });
      var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '明细名单-' + (d.dataset.name || ds) + '.csv';
      a.click();
    });
  };

  var ADMIN_USER = { id: 'acc_admin', username: 'admin', name: '张运营', role: 'admin', title: '数据运营', baseId: '', scopes: [], status: 'active' };

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || 'GET').toUpperCase();
    if (url.indexOf('/api/') !== 0 && url.indexOf('api/') !== 0) return ORIG(input, init);
    var clean = url.replace(/^\/?api\//, '/api/');
    if (method !== 'GET') {
      if (clean === '/api/login') return file('bootstrap.json').then(function (b) { return jres({ user: ADMIN_USER }); });
      if (clean === '/api/logout') return jres({ ok: true });
      return jres({ error: '演示环境为只读快照，不支持修改操作' }, 400);
    }
    if (clean === '/api/me') return jres({ user: null });
    if (clean === '/api/bootstrap') return file('bootstrap.json').then(function (d) { return jres(d || { error: '快照缺失' }); });
    if (clean === '/api/meta') return file('meta.json').then(function (d) { return jres(d || {}); });
    if (clean.indexOf('/api/dashboard') === 0) {
      var ds = dsId(clean), range = qv(clean, 'range') || 'all', base = qv(clean, 'base') || 'all';
      return file('dashboard_' + ds + '_' + range + '_' + base + '.json')
        .then(function (d) { return d || file('dashboard_' + ds + '_' + range + '_all.json'); })
        .then(function (d) { return d ? jres(d) : jres({ error: '演示快照未包含该筛选组合' }, 404); });
    }
    if (clean.indexOf('/api/rankings') === 0) {
      var ds2 = dsId(clean), range2 = qv(clean, 'range') || 'all';
      return file('rankings_' + ds2 + '_' + range2 + '.json').then(function (d) { return d ? jres(d) : jres({ error: '演示快照未包含该范围' }, 404); });
    }
    if (clean.indexOf('/api/tables') === 0) {
      return file('tables_' + (dsId(clean) || 'ds_deal') + '.json').then(function (d) { return d ? jres(d) : jres({ error: '演示快照缺失' }, 404); });
    }
    if (clean.indexOf('/api/records') === 0) return serveRecords(clean);
    var specials = { 'koc-tier': 1, 'diamond-unused': 1, 'diamond-orders': 1, dragon: 1, 'direct-uncv': 1, 'abc-chain': 1 };
    var ep = clean.replace('/api/', '').split('?')[0];
    if (specials[ep]) return file(ep + '.json').then(function (d) { return d ? jres(d) : jres({ error: '演示快照缺失' }, 404); });
    return jres({ error: '演示环境未提供该接口' }, 404);
  };
})();

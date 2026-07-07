const crypto = require('crypto');

const { saveConfig, verifyPassword } = require('./config.js');
const { audit } = require('./audit.js');

const adminSessions = new Map();
const COOKIE_NAME = 'admin_session';

const CSS = `*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;color:#1a1a2e}
.page{max-width:1100px;margin:0 auto;padding:1rem}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:1.25rem;margin-bottom:1rem}
.card h2{font-size:1rem;font-weight:600;margin:0 0 .8rem;padding-bottom:.5rem;border-bottom:1px solid #eee;display:flex;align-items:center;gap:.4rem}
.card h2 .count{font-weight:400;color:#888;font-size:.8rem}
.nav{display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1rem}
.nav a{color:#0066ff;text-decoration:none;font-size:.85rem;font-weight:500}
.nav a:hover{text-decoration:underline}
.nav .right{margin-left:auto;color:#888;font-size:.8rem;display:flex;align-items:center;gap:.5rem}
.stat{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.stat-item{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:.75rem 1rem;flex:1;min-width:120px;text-align:center}
.stat-item .num{font-size:1.5rem;font-weight:700;color:#1a1a2e}
.stat-item .lbl{font-size:.75rem;color:#888;margin-top:.2rem}
.grid-2{display:grid;grid-template-columns:1.2fr 2fr;gap:1rem}
@media(max-width:720px){.grid-2{grid-template-columns:1fr}}
.form-group{margin-bottom:.75rem}
.form-group label{display:block;font-size:.8rem;font-weight:500;color:#555;margin-bottom:.25rem}
.form-group input,.form-group select{width:100%;padding:.45rem .6rem;border:1px solid #d0d0d0;border-radius:6px;font-size:.85rem;outline:none;transition:border-color .15s}
.form-group input:focus,.form-group select:focus{border-color:#0066ff;box-shadow:0 0 0 2px rgba(0,102,255,.12)}
.form-row{display:flex;gap:.6rem;flex-wrap:wrap}
.form-row>*{flex:1;min-width:130px}
.btn{display:inline-flex;align-items:center;gap:.3rem;padding:.4rem .75rem;border:none;border-radius:6px;cursor:pointer;font-size:.8rem;font-weight:500;text-decoration:none;transition:opacity .12s}
.btn:hover{opacity:.85}
.btn-primary{background:#0066ff;color:#fff}
.btn-danger{background:#d32f2f;color:#fff}
.btn-outline{background:transparent;border:1px solid #d0d0d0;color:#555}
.btn-sm{padding:.25rem .5rem;font-size:.75rem;border-radius:4px}
.btn-row{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.alert{margin-bottom:.75rem;padding:.5rem .75rem;border-radius:6px;font-size:.8rem;display:flex;align-items:center;gap:.4rem}
.alert-error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
.alert-success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.badge{display:inline-block;padding:.15rem .45rem;border-radius:4px;font-size:.7rem;font-weight:500;white-space:nowrap}
.badge-red{background:#fef2f2;color:#b91c1c}
.badge-green{background:#f0fdf4;color:#166534}
code{background:#f5f5f5;padding:.1rem .3rem;border-radius:4px;font-size:.8rem}
table{width:100%;border-collapse:collapse}
.sessions{table-layout:fixed}
th{text-align:left;font-weight:600;padding:.55rem .4rem;border-bottom:2px solid #eee;font-size:.8rem;color:#555}
td{padding:.55rem .4rem;border-bottom:1px solid #f0f0f0;font-size:.82rem;vertical-align:middle}
tr:last-child td{border-bottom:none}
.route-host{font-weight:500}
.route-target{color:#666;font-size:.78rem}
.route-desc{color:#888;font-size:.78rem}
.empty{text-align:center;color:#aaa;padding:1.5rem;font-size:.85rem}
.back-link{display:inline-flex;align-items:center;gap:.3rem;color:#666;font-size:.82rem;text-decoration:none;margin-bottom:.75rem}
.back-link:hover{color:#0066ff}
.auth-col{width:70px}
.action-col{width:110px}
`;

function tag(s, ...vals) {
  let r = s[0];
  for (let i = 0; i < vals.length; i++) r += vals[i] + s[i + 1];
  return r;
}

function page(title, content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 统一认证</title><style>${CSS}</style></head><body><div class="page">${content}</div></body></html>`;
}

function navBar() {
  return `<div class="nav"><a href="/_admin">仪表盘</a><span class="right"><a href="/_admin/logout" style="color:#b91c1c">退出</a></span></div>`;
}

function h(res, code, title, content) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page(title, content));
}

function rd(res, url) {
  res.writeHead(302, { 'Location': url });
  res.end();
}

function parseCookies(req) {
  const c = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(kv => {
      const [k, ...v] = kv.trim().split('=');
      c[k] = v.join('=');
    });
  }
  return c;
}

function getAdminSession(req) {
  const c = parseCookies(req);
  const id = c[COOKIE_NAME];
  if (!id) return null;
  const s = adminSessions.get(id);
  if (!s || s.expiresAt < Date.now()) {
    if (s) adminSessions.delete(id);
    return null;
  }
  return s;
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

async function handleAdmin(req, res, backend) {
  const { config } = backend;

  if (!config.admin_password) {
    return h(res, 403, '已禁用', '<div class="card" style="text-align:center;padding:3rem"><h1>403</h1><p style="color:#888;margin-top:.5rem">管理面板已禁用</p></div>');
  }

  const pathname = req.url.split('?')[0];

  if (pathname === '/_admin/login') {
    return renderLogin(req, res, config);
  }

  if (pathname === '/_admin/logout') {
    const c = parseCookies(req);
    if (c[COOKIE_NAME]) { adminSessions.delete(c[COOKIE_NAME]); audit('ADMIN_LOGOUT', '', req.socket.remoteAddress || ''); }
    res.writeHead(302, {
      'Location': '/_admin/login',
      'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
    res.end();
    return;
  }

  if (!getAdminSession(req)) {
    return rd(res, '/_admin/login');
  }

  try {
    if (pathname === '/_admin' || pathname === '/_admin/') {
      const urlP = new URL(req.url, 'http://localhost');
      const editingIdx = parseInt(urlP.searchParams.get('_edit') || '-1', 10);
      const qError = urlP.searchParams.get('error') || '';
      const qMsg = urlP.searchParams.get('msg') || '';
      return renderDashboard(req, res, backend, editingIdx, qError, qMsg);
    }
    if (pathname === '/_admin/config/reload') {
      return reloadConfig(req, res, backend);
    }
    if (pathname === '/_admin/routes/add') {
      return addRoute(req, res, backend);
    }
    if (pathname.startsWith('/_admin/routes/edit/')) {
      return editRoute(req, res, backend);
    }
    if (pathname.startsWith('/_admin/routes/delete/')) {
      return deleteRoute(req, res, backend);
    }
    if (pathname === '/_admin/kick') {
      return kickSession(req, res, backend);
    }
    if (pathname === '/_admin/clear') {
      return clearSessions(req, res, backend);
    }
  } catch (err) {
    console.error('Admin error:', err);
    return h(res, 500, '错误', `<div class="card" style="text-align:center;padding:2rem"><div class="alert alert-error">${err.message}</div></div>`);
  }

  h(res, 404, '404', '<div class="card" style="text-align:center;padding:2rem"><h1>404</h1></div>');
}

// ── Login ──

function renderLogin(req, res, config) {
  if (req.method === 'GET') {
    return h(res, 200, '管理员登录', `<div class="card" style="max-width:380px;margin:3rem auto;padding:2rem">
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;text-align:center">管理员登录</h1>
<form method="post">
<div class="form-group"><label>用户名</label><input name="username" autofocus></div>
<div class="form-group"><label>密码</label><input type="password" name="password"></div>
<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem">登录</button>
</form></div>`);
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const params = new URLSearchParams(body);
    const ok = params.get('username') === config.admin_username
            && verifyPassword(params.get('password') || '', config.admin_password);
    if (ok) {
      const id = crypto.randomBytes(32).toString('hex');
      adminSessions.set(id, {
        createdAt: Date.now(),
        expiresAt: Date.now() + 4 * 3600000,
      });
      const ip = req.socket.remoteAddress || '';
      audit('ADMIN_LOGIN_OK', 'admin=' + params.get('username'), ip);
      res.writeHead(302, {
        'Location': '/_admin',
        'Set-Cookie': `${COOKIE_NAME}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=14400`,
      });
      res.end();
    } else {
      h(res, 200, '管理员登录', `<div class="card" style="max-width:380px;margin:3rem auto;padding:2rem">
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:1rem;text-align:center">管理员登录</h1>
<div class="alert alert-error">用户名或密码错误</div>
<form method="post">
<div class="form-group"><label>用户名</label><input name="username" value="${esc(params.get('username') || '')}" autofocus></div>
<div class="form-group"><label>密码</label><input type="password" name="password"></div>
<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem">登录</button>
</form></div>`);
    }
  });
}

// ── Dashboard ──

function renderDashboard(req, res, backend, editingIdx, editError, successMsg) {
  const { config, sessions } = backend;
  const now = Date.now();
  const active = [...sessions.entries()].filter(([_, s]) => s.expiresAt > now).map(([id, s]) => ({ id, ...s, _type: 'user' }));
  const adminActive = [...adminSessions.entries()].filter(([_, s]) => s.expiresAt > now).map(([id, s]) => ({ id, host: '(管理员)', userAgent: s.username || 'admin', ip: s.ip || '', createdAt: s.createdAt, expiresAt: s.expiresAt, _type: 'admin' }));
  const allSessions = [...active, ...adminActive].sort((a, b) => b.createdAt - a.createdAt);

  const routeCards = config.routes.map((r, i) => {
    if (editingIdx === i) {
      const er = editError; // may have error msg from query param
      return `<tr><td colspan="5" style="padding:0;border-bottom:2px solid #0066ff">
<form method="post" action="/_admin/routes/edit/${i}" style="display:flex;flex-wrap:wrap;gap:.5rem;padding:.6rem;background:#f8faff;align-items:end">
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:130px">
<label style="font-size:.7rem;color:#666">Host</label>
<input name="host" value="${esc(r.host)}" required style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:130px">
<label style="font-size:.7rem;color:#666">目标</label>
<input name="target" value="${esc(r.target)}" required style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:0 0 90px">
<label style="font-size:.7rem;color:#666">鉴权</label>
<select name="auth" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem">
<option value="true"${r.auth ? ' selected' : ''}>开</option>
<option value="false"${!r.auth ? ' selected' : ''}>关</option>
</select>
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:100px">
<label style="font-size:.7rem;color:#666">描述</label>
<input name="description" value="${esc(r.description || '')}" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:100px">
<label style="font-size:.7rem;color:#666">豁免路径</label>
<input name="auth_exempt" value="${esc((r.auth_exempt || []).join(','))}" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;gap:.3rem;align-items:end;padding-bottom:.15rem">
<button class="btn btn-sm btn-primary">保存</button>
<a href="/_admin" class="btn btn-sm btn-outline" style="text-decoration:none">取消</a>
</div>
</form>
${er ? `<div style="padding:.3rem .6rem .5rem;background:#fef2f2;font-size:.78rem;color:#b91c1c">${esc(er)}</div>` : ''}
</td></tr>`;
    }
    return `<tr>
<td><span class="route-host">${esc(r.host)}</span></td>
<td><span class="route-target">${esc(r.target)}</span></td>
<td><span class="badge ${r.auth ? 'badge-red' : 'badge-green'}">${r.auth ? '需鉴权' : '免鉴权'}</span></td>
<td><span class="route-desc">${esc(r.description || '')}</span></td>
<td><div class="btn-row"><a href="/_admin?_edit=${i}" class="btn btn-sm btn-outline">编辑</a>
<form method="post" action="/_admin/routes/delete/${i}" style="display:inline" onsubmit="return confirm('确定删除「${esc(r.host)}」?')"><button class="btn btn-sm btn-outline" style="color:#b91c1c">删除</button></form></div></td>
</tr>`;
  }).join('');

  const sessionRows = allSessions.map(s => `<tr>
<td><code>${s.id.slice(0, 8)}...</code>${s._type === 'admin' ? ' <span class="badge badge-green" style="font-size:.65rem">管理</span>' : ''}</td>
<td>${esc(s.label || '')}</td>
<td>${s.host || ''}</td>
<td title="${esc(s.userAgent || '')}">${esc((s.userAgent || '').slice(0, 30))}</td>
<td>${s.ip || ''}</td>
<td style="font-size:.78rem;color:#666;white-space:nowrap">${new Date(s.createdAt).toLocaleString('zh-CN')}</td>
<td style="font-size:.78rem;color:#666;white-space:nowrap">${new Date(s.expiresAt).toLocaleString('zh-CN')}</td>
<td>${s._type === 'admin' ? '<span style="color:#999;font-size:.75rem">—</span>' : `<form method="post" action="/_admin/kick" style="display:inline"><input type="hidden" name="sid" value="${s.id}"><button class="btn btn-sm btn-outline">踢下线</button></form>`}</td>
</tr>`).join('');

  const addError = !isNaN(editingIdx) && editingIdx >= 0 ? '' : editError;

  h(res, 200, '仪表盘', `${navBar()}
${successMsg ? `<div class="alert alert-success">${esc(successMsg)}</div>` : ''}
<div class="stat">
<div class="stat-item"><div class="num">${config.routes.length}</div><div class="lbl">路由</div></div>
<div class="stat-item"><div class="num">${allSessions.length}</div><div class="lbl">活跃会话</div></div>
</div>

<div class="grid-2">
<div class="card">
<h2>添加路由</h2>
${addError ? `<div class="alert alert-error">${esc(addError)}</div>` : ''}
<form method="post" action="/_admin/routes/add">
<div class="form-group"><label>Host（域名）</label><input name="host" placeholder="svc.example.com" required></div>
<div class="form-group"><label>目标地址</label><input name="target" placeholder="http://127.0.0.1:8080" required></div>
<div class="form-row">
<div class="form-group" style="flex:2"><label>描述</label><input name="description" placeholder="My Service"></div>
<div class="form-group" style="flex:1"><label>鉴权</label><select name="auth"><option value="true" selected>需鉴权</option><option value="false">免鉴权</option></select></div>
</div>
<div class="form-group"><label>豁免路径（逗号分隔）</label><input name="auth_exempt" placeholder="/api/*,/health"></div>
<button class="btn btn-primary" style="margin-top:.25rem">添加</button>
</form>
</div>

<div class="card">
<h2>路由列表 <span class="count">(${config.routes.length})</span></h2>
${routeCards ? `<table><thead><tr><th>Host</th><th>目标</th><th class="auth-col">鉴权</th><th>描述</th><th class="action-col">操作</th></tr></thead><tbody>${routeCards}</tbody></table>` : '<div class="empty">暂无路由</div>'}
</div>
</div>

<div class="card">
<h2 style="display:flex;align-items:center;justify-content:space-between;border-bottom:none;padding-bottom:0;margin-bottom:0">
<span>活跃会话 <span class="count">(${allSessions.length})</span></span>
<span style="font-size:.8rem;font-weight:400;display:flex;gap:.4rem;align-items:center">
<span id="refreshIndicator" style="color:#999;font-size:.75rem"></span>
<form method="post" action="/_admin/clear" style="display:inline"><button class="btn btn-sm btn-outline" onclick="return confirm('确定清空所有会话?')">清空所有</button></form>
<form method="post" action="/_admin/config/reload" style="display:inline"><button class="btn btn-sm btn-outline" title="从 routes.yaml 重新读取配置，无需重启服务">重载配置</button></form>
</span>
</h2>
${sessionRows ? `<table class="sessions"><thead><tr><th style="width:13%">会话</th><th style="width:9%">标记</th><th style="width:13%">Host</th><th>设备</th><th style="width:11%">IP</th><th style="width:14%">创建</th><th style="width:14%">过期</th><th style="width:10%">操作</th></tr></thead><tbody>${sessionRows}</tbody></table>` : '<div class="empty" style="margin-top:.5rem">暂无活跃会话</div>'}
</div>
<script>
(function(){var c=0,e=document.getElementById('refreshIndicator');if(e)e.textContent='10s后自动刷新'
setInterval(function(){c=10-(Date.now()/1000|0)%10;if(e)e.textContent=c+'s后刷新'
if(location.href.indexOf('_edit')<0&&c<=1){location.reload()}},1000)})();
</script>`);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Route CRUD ──

async function addRoute(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { config } = backend;
  const host = (params.get('host') || '').trim();
  const target = (params.get('target') || '').trim();
  if (!host || !target) {
    return rd(res, '/_admin?error=' + encodeURIComponent('Host 和目标地址不能为空'));
  }
  if (config.routes.some(r => r.host === host)) {
    return rd(res, '/_admin?error=' + encodeURIComponent(`主机名「${host}」已存在，不能重复`));
  }
  const ip = req.socket.remoteAddress || '';
  config.routes.push({
    host,
    target,
    auth: params.get('auth') !== 'false',
    auth_exempt: (params.get('auth_exempt') || '').split(',').map(s => s.trim()).filter(Boolean),
    description: params.get('description') || host,
  });
  saveConfig(config);
  audit('ROUTE_ADD', `host=${host} target=${target}`, ip);
  rd(res, '/_admin');
}

async function editRoute(req, res, backend) {
  const idx = parseInt(req.url.split('/').pop(), 10);
  const { config } = backend;

  if (isNaN(idx) || idx < 0 || idx >= config.routes.length) {
    return rd(res, '/_admin?error=' + encodeURIComponent('无效索引'));
  }

  if (req.method === 'GET') {
    return rd(res, '/_admin?_edit=' + idx);
  }

  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const host = (params.get('host') || '').trim();
  const target = (params.get('target') || '').trim();
  if (!host || !target) {
    return rd(res, '/_admin?_edit=' + idx + '&error=' + encodeURIComponent('Host 和目标地址不能为空'));
  }
  const dup = config.routes.findIndex((r, i) => r.host === host && i !== idx);
  if (dup !== -1) {
    return rd(res, '/_admin?_edit=' + idx + '&error=' + encodeURIComponent(`主机名「${host}」已被其他路由使用`));
  }
  const ip = req.socket.remoteAddress || '';
  config.routes[idx] = {
    host,
    target,
    auth: params.get('auth') !== 'false',
    auth_exempt: (params.get('auth_exempt') || '').split(',').map(s => s.trim()).filter(Boolean),
    description: params.get('description') || host,
  };
  saveConfig(config);
  audit('ROUTE_EDIT', `host=${host} target=${target}`, ip);
  rd(res, '/_admin');
}

function deleteRoute(req, res, backend) {
  const idx = parseInt(req.url.split('/').pop(), 10);
  const { config } = backend;
  const ip = req.socket.remoteAddress || '';
  if (!isNaN(idx) && idx >= 0 && idx < config.routes.length) {
    const removed = config.routes[idx];
    config.routes.splice(idx, 1);
    saveConfig(config);
    audit('ROUTE_DEL', `host=${removed.host} target=${removed.target}`, ip);
  }
  rd(res, '/_admin');
}

// ── Session ops ──

async function kickSession(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { sessions } = backend;
  const sid = params.get('sid') || '';
  const ip = req.socket.remoteAddress || '';
  let kicked = false;
  for (const [id] of sessions) {
    if (id.startsWith(sid.replace('...', ''))) {
      sessions.delete(id);
      audit('SESSION_KICK', `sid=${id.slice(0, 8)}...`, ip);
      kicked = true;
      break;
    }
  }
  rd(res, '/_admin?msg=' + encodeURIComponent(kicked ? '已踢下线' : '未找到该会话'));
}

function clearSessions(req, res, backend) {
  const ip = req.socket.remoteAddress || '';
  const count = backend.sessions.size;
  backend.sessions.clear();
  audit('SESSION_CLEAR', 'all sessions cleared', ip);
  rd(res, '/_admin?msg=' + encodeURIComponent(`已清空 ${count} 个会话`));
}

function reloadConfig(req, res, backend) {
  const ip = req.socket.remoteAddress || '';
  try {
    const newConfig = require('./config.js').loadConfig();
    Object.assign(backend.config, newConfig);
    audit('CONFIG_RELOAD', '', ip);
    h(res, 200, '仪表盘', `${navBar()}<div class="card" style="text-align:center;padding:2rem"><div class="alert alert-success">配置已重载</div><a href="/_admin" style="font-size:.85rem;color:#0066ff">返回仪表盘</a></div>`);
  } catch (e) {
    audit('CONFIG_RELOAD_FAIL', e.message, ip);
    h(res, 200, '仪表盘', `${navBar()}<div class="card" style="text-align:center;padding:2rem"><div class="alert alert-error">重载失败: ${e.message}</div></div>`);
  }
}

module.exports = { handleAdmin };

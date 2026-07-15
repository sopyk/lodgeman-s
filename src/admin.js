const crypto = require('crypto');

const { saveConfig, verifyPassword, hashPassword, loadConfig } = require('./config.js');
const { audit } = require('./audit.js');

const adminSessions = new Map();
const COOKIE_NAME = 'admin_session';

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of adminSessions) {
    if (s.expiresAt < now) adminSessions.delete(id);
  }
}, 3600000);

const CSS = `*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;color:#1a1a2e}
.page{max-width:1100px;margin:0 auto;padding:1rem}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:1.25rem;margin-bottom:1rem}
.card h2{font-size:1rem;font-weight:600;margin:0 0 .8rem;padding-bottom:.5rem;border-bottom:1px solid #eee;display:flex;align-items:center;gap:.4rem}
.card h2 .count{font-weight:400;color:#888;font-size:.8rem}
.nav{display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1rem}
.nav a{color:#0066ff;text-decoration:none;font-size:1rem;font-weight:500}
.nav a:hover{text-decoration:underline}
.nav .right{margin-left:auto;color:#888;font-size:.8rem;display:flex;align-items:center;gap:.5rem}
.stat{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.stat-item{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:.75rem 1rem;flex:1;min-width:120px;text-align:center}
.stat-item .num{font-size:1.5rem;font-weight:700;color:#1a1a2e}
.stat-item .lbl{font-size:.75rem;color:#888;margin-top:.2rem}


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
.pwd-wrap{position:relative;display:flex;align-items:center}.pwd-wrap input{flex:1;padding-right:2rem}.pwd-toggle{position:absolute;right:2px;background:none;border:none;cursor:pointer;padding:0;line-height:1;user-select:none;display:flex;align-items:center;justify-content:center;width:28px;height:100%}.pwd-toggle svg{width:18px;height:18px;fill:none;stroke:#999;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.pwd-toggle:hover svg{stroke:#666}
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
.label-display{cursor:pointer;border-bottom:1px dashed #ddd;display:inline-block;min-width:24px;padding:0 2px}
.label-display:hover{border-bottom-color:#0066ff}
.label-input{padding:.2rem .35rem;border:1px solid #0066ff;border-radius:4px;font-size:.82rem;width:90px;outline:none}
.table-wrap{overflow-x:auto;margin-top:.5rem}
.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start}
@media(max-width:720px){.settings-grid{grid-template-columns:1fr}}
.taddr-wrap{display:flex;align-items:stretch;border:1px solid #d0d0d0;border-radius:4px;overflow:hidden}
.taddr-wrap .target-scheme{display:flex;align-items:center;padding:0 .35rem;color:#999;font-size:.75rem;background:#f5f5f5;flex-shrink:0}
.taddr-wrap .target-input{flex:1;min-width:0;border:none;padding:.35rem .4rem;font-size:.82rem;outline:none}
.taddr-wrap .target-input:focus{background:#f4f7ff}
@media(max-width:640px){
.page{padding:.5rem}
.card{padding:.75rem}
.card h2{font-size:.9rem}
.nav{gap:.6rem;padding:.75rem .85rem}
.nav a{font-size:1rem}
.stat{gap:.5rem}
.stat-item{min-width:70px;padding:.5rem .75rem}
.stat-item .num{font-size:1.2rem}
th,td{padding:.35rem .25rem;font-size:.75rem}
.auth-col{width:auto}
.action-col{width:auto}
}
`;

function tag(s, ...vals) {
  let r = s[0];
  for (let i = 0; i < vals.length; i++) r += vals[i] + s[i + 1];
  return r;
}

function page(title, content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 门房大爷</title><link rel="icon" href="/assets/favicon.png"><style>${CSS}</style></head><body><svg style="display:none"><symbol id="eye" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></symbol><symbol id="eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></symbol></svg><div class="page">${content}</div><script>function pwdtoggle(b){var i=b.previousElementSibling,e=b.querySelector('use');if(i.type==='password'){i.type='text';e.setAttribute('href','#eye-off')}else{i.type='password';e.setAttribute('href','#eye')}}</script></body></html>`;
}

function navBar() {
  return `<div class="nav"><img src="/assets/lodgemans-logo.png" alt="" style="height:36px;width:36px"><a href="/_admin">仪表盘</a><a href="/_admin/settings">设置</a><a href="/_admin/about">关于</a><span class="right"><a href="/_admin/logout" style="color:#b91c1c">退出</a></span></div>`;
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

const MAX_BODY = 1048576;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => {
      body += c;
      if (Buffer.byteLength(body) > MAX_BODY) {
        req.destroy(new Error('Payload too large'));
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleAdmin(req, res, backend) {
  const { config } = backend;

  const pathname = req.url.split('?')[0];

  // 登录页始终可访问（首次设置管理密码）
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

  if (!config.admin_password) {
    // 无管理密码时，有有效会话仍可访问（首次空密码登录后设置密码）
    if (!getAdminSession(req)) {
      return h(res, 403, '已禁用', '<div class="card" style="text-align:center;padding:3rem"><h1>403</h1><p style="color:#888;margin-top:.5rem">管理面板已禁用</p></div>');
    }
  } else if (!getAdminSession(req)) {
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
    if (pathname === '/_admin/session/label') {
      return updateSessionLabel(req, res, backend);
    }
    if (pathname === '/_admin/settings') {
      return renderSettings(req, res, backend);
    }
    if (pathname === '/_admin/settings/password') {
      return changePassword(req, res, backend);
    }
    if (pathname === '/_admin/settings/admin') {
      return changeAdmin(req, res, backend);
    }
    if (pathname === '/_admin/settings/timezone') {
      return changeTimezone(req, res, backend);
    }
    if (pathname === '/_admin/routes/export') {
      return exportRoutes(req, res, backend);
    }
    if (pathname === '/_admin/routes/import') {
      return importRoutes(req, res, backend);
    }
    if (pathname === '/_admin/about') {
      return renderAbout(req, res, backend);
    }
  } catch (err) {
    console.error('Admin error:', err);
    return h(res, 500, '错误', `<div class="card" style="text-align:center;padding:2rem"><div class="alert alert-error">${err.message}</div></div>`);
  }

  h(res, 404, '404', '<div class="card" style="text-align:center;padding:2rem"><h1>404</h1></div>');
}

// ── Login / Register ──

function renderLogin(req, res, config) {
  // ── 首次注册（无管理密码） ──
  if (!config.admin_password) {
    if (req.method === 'GET') {
      return h(res, 200, '管理员注册', `<div class="card" style="max-width:380px;margin:3rem auto;padding:2rem">
<div style="text-align:center;margin-bottom:1rem"><img src="/assets/lodgemans-banner.png" alt="门房大爷LodgeManS" style="max-width:100%;height:auto;border-radius:6px"></div>
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:.25rem;text-align:center">门房大爷LodgeManS</h1>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:0">统一认证网关 管理入口</p>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:1rem;font-style:italic">首次使用</p>
<form method="post">
<div class="form-group"><label>管理员用户名</label><input name="username" value="${esc(config.admin_username)}" autofocus></div>
<div class="form-group"><label>密码（至少6个字符）</label><div class="pwd-wrap"><input type="password" name="password"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<div class="form-group"><label>确认密码</label><div class="pwd-wrap"><input type="password" name="confirm"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem">注册</button>
<p style="margin-top:.8rem;font-size:.78rem;color:#999;text-align:center;line-height:1.5">当前未设置管理员密码，请立即设置管理员密码。可以修改用户名。</p>
</form></div>`);
    }

    let body = '';
    let size = 0;
    req.on('data', c => { body += c; size += c.length; });
    req.on('end', () => {
      if (size > MAX_BODY) { h(res, 413, '错误', '<div class="card"><div class="alert alert-error">请求体过大</div></div>'); return; }
      const params = new URLSearchParams(body);
      const username = (params.get('username') || '').trim();
      const password = params.get('password') || '';
      const confirm = params.get('confirm') || '';

      const err = !username ? '请输入管理员用户名'
        : username.length < 2 ? '用户名至少2个字符'
        : password.length < 6 ? '密码至少6个字符'
        : password !== confirm ? '两次输入的密码不一致'
        : null;

      if (err) {
        return h(res, 200, '管理员注册', `<div class="card" style="max-width:380px;margin:3rem auto;padding:2rem">
<div style="text-align:center;margin-bottom:1rem"><img src="/assets/lodgemans-banner.png" alt="门房大爷LodgeManS" style="max-width:100%;height:auto;border-radius:6px"></div>
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:.25rem;text-align:center">门房大爷LodgeManS</h1>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:0">统一认证网关 管理入口</p>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:1rem;font-style:italic">首次使用</p>
<div class="alert alert-error">${esc(err)}</div>
<form method="post">
<div class="form-group"><label>管理员用户名</label><input name="username" value="${esc(username)}" autofocus></div>
<div class="form-group"><label>密码（至少6个字符）</label><div class="pwd-wrap"><input type="password" name="password"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<div class="form-group"><label>确认密码</label><div class="pwd-wrap"><input type="password" name="confirm"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem">注册</button>
<p style="margin-top:.8rem;font-size:.78rem;color:#999;text-align:center;line-height:1.5">当前未设置管理员密码，请立即设置管理员密码。可以修改用户名。</p>
</form></div>`);
      }

      config.admin_username = username;
      config.admin_password = hashPassword(password);
      if (saveConfig(config)) {
        audit('ADMIN_REGISTER', 'admin=' + username, req.socket.remoteAddress || '');
        const id = crypto.randomBytes(32).toString('hex');
        adminSessions.set(id, { createdAt: Date.now(), expiresAt: Date.now() + 4 * 3600000 });
        res.writeHead(302, {
          'Location': '/_admin',
          'Set-Cookie': `${COOKIE_NAME}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=14400`,
        });
        res.end();
      } else {
        h(res, 200, '管理员注册', `<div class="card" style="max-width:380px;margin:3rem auto;padding:2rem">
<div style="text-align:center;margin-bottom:1rem"><img src="/assets/lodgemans-banner.png" alt="门房大爷LodgeManS" style="max-width:100%;height:auto;border-radius:6px"></div>
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:.25rem;text-align:center">门房大爷LodgeManS</h1>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:0">统一认证网关 管理入口</p>
<div class="alert alert-error">保存配置失败，请检查权限</div>
</div>`);
      }
    });
    return;
  }

  if (req.method === 'GET') {
    return h(res, 200, '管理员登录', `<div class="card" style="max-width:380px;margin:3rem auto;padding:2rem">
<div style="text-align:center;margin-bottom:1rem"><img src="/assets/lodgemans-banner.png" alt="门房大爷LodgeManS" style="max-width:100%;height:auto;border-radius:6px"></div>
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:.25rem;text-align:center">门房大爷LodgeManS</h1>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:0">统一认证网关 管理入口</p>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:1rem;font-style:italic">"领导回来啦～"</p>
<form method="post">
<div class="form-group"><label>用户名</label><input name="username" autofocus></div>
<div class="form-group"><label>密码</label><div class="pwd-wrap"><input type="password" name="password"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem">登录</button>
</form></div>`);
  }

  let body = '';
  let size = 0;
  req.on('data', c => { body += c; size += c.length; });
  req.on('end', () => {
    if (size > MAX_BODY) { h(res, 413, '错误', '<div class="card"><div class="alert alert-error">请求体过大</div></div>'); return; }
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
<div style="text-align:center;margin-bottom:1rem"><img src="/assets/lodgemans-banner.png" alt="门房大爷LodgeManS" style="max-width:100%;height:auto;border-radius:6px"></div>
<h1 style="font-size:1.1rem;font-weight:600;margin-bottom:.25rem;text-align:center">门房大爷LodgeManS</h1>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:0">统一认证网关 管理入口</p>
<p style="text-align:center;color:#888;font-size:.8rem;margin-bottom:1rem;font-style:italic">"领导回来啦～"</p>
<div class="alert alert-error">用户名或密码错误</div>
<form method="post">
<div class="form-group"><label>用户名</label><input name="username" value="${esc(params.get('username') || '')}" autofocus></div>
<div class="form-group"><label>密码</label><div class="pwd-wrap"><input type="password" name="password"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
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
    const pt = parseTarget(r.target);
    if (editingIdx === i) {
      const er = editError; // may have error msg from query param
      return `<tr><td colspan="5" style="padding:0;border-bottom:2px solid #0066ff">
<form method="post" action="/_admin/routes/edit/${i}" style="display:flex;flex-wrap:wrap;gap:.5rem;padding:.6rem;background:#f8faff;align-items:end">
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:130px">
<label style="font-size:.7rem;color:#666">Host</label>
<input name="host" value="${esc(r.host)}" placeholder="svc.example.com" required style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:200px">
<label style="font-size:.7rem;color:#666">目标 <span style="font-weight:400;color:#999">(仅支持 http)</span></label>
<div class="taddr-wrap">
<span class="target-scheme">http://</span>
<input name="target" class="target-input" value="${esc(r.target.replace(/^https?:\/\//, ''))}" placeholder="地址:端口" required>
</div>
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
<input name="description" value="${esc(r.description || '')}" placeholder="My Service" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:100px">
<label style="font-size:.7rem;color:#666">豁免路径</label>
<input name="auth_exempt" value="${esc((r.auth_exempt || []).join(','))}" placeholder="/api/*,/health" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
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
<td><a href="https://${esc(r.host)}" target="_blank" class="route-host" style="color:#0066ff;text-decoration:none">${esc(r.host)}</a></td>
<td><span class="route-target"><span style="color:#999">http://</span>${esc(pt.addr)}<span style="color:#999">:${pt.port}</span></span></td>
<td><span class="badge ${r.auth ? 'badge-red' : 'badge-green'}">${r.auth ? '需鉴权' : '免鉴权'}</span></td>
<td><span class="route-desc">${esc(r.description || '')}</span></td>
<td><div class="btn-row"><a href="/_admin?_edit=${i}" class="btn btn-sm btn-outline">编辑</a>
<form method="post" action="/_admin/routes/delete/${i}" style="display:inline" onsubmit="return confirm('确定删除「${esc(r.host)}」?')"><button class="btn btn-sm btn-outline" style="color:#b91c1c">删除</button></form></div></td>
</tr>`;
  }).join('');

  const sessionRows = allSessions.map(s => `<tr>
<td><code>${s.id.slice(0, 8)}...</code>${s._type === 'admin' ? ' <span class="badge badge-green" style="font-size:.65rem">管理</span>' : ''}</td>
<td>${s._type === 'admin' ? (s.label || '') : `<span class="label-display" data-sid="${s.id}">${esc(s.label || '<span style="color:#bbb">点击添加</span>')}</span>`}</td>
<td>${s.host || ''}</td>
<td title="${esc(s.userAgent || '')}">${esc((s.userAgent || '').slice(0, 30))}</td>
<td>${s.ip || ''}</td>
<td style="font-size:.78rem;color:#666;white-space:nowrap">${new Date(s.createdAt).toLocaleString('zh-CN', {timeZone:config.timezone||'UTC'})}</td>
<td style="font-size:.78rem;color:#666;white-space:nowrap">${new Date(s.expiresAt).toLocaleString('zh-CN', {timeZone:config.timezone||'UTC'})}</td>
<td>${s._type === 'admin' ? '<span style="color:#999;font-size:.75rem">—</span>' : `<form method="post" action="/_admin/kick" style="display:inline"><input type="hidden" name="sid" value="${s.id}"><button class="btn btn-sm btn-outline">踢下线</button></form>`}</td>
</tr>`).join('');

  const addRow = `<tr id="addRouteForm" style="display:none"><td colspan="5" style="padding:0;border-bottom:2px solid #0066ff">
<form method="post" action="/_admin/routes/add" style="display:flex;flex-wrap:wrap;gap:.5rem;padding:.6rem;background:#f8faff;align-items:end">
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:130px">
<label style="font-size:.7rem;color:#666">Host</label>
<input name="host" placeholder="svc.example.com" required style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:200px">
<label style="font-size:.7rem;color:#666">目标 <span style="font-weight:400;color:#999">(仅支持 http)</span></label>
<div class="taddr-wrap">
<span class="target-scheme">http://</span>
<input name="target" class="target-input" value="127.0.0.1:8080" placeholder="地址:端口" required>
</div>
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:0 0 90px">
<label style="font-size:.7rem;color:#666">鉴权</label>
<select name="auth" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem">
<option value="true" selected>开</option>
<option value="false">关</option>
</select>
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:80px">
<label style="font-size:.7rem;color:#666">描述</label>
<input name="description" placeholder="My Service" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;flex-direction:column;gap:.2rem;flex:1;min-width:80px">
<label style="font-size:.7rem;color:#666">豁免路径</label>
<input name="auth_exempt" placeholder="/api/*,/health" style="padding:.35rem .5rem;border:1px solid #d0d0d0;border-radius:4px;font-size:.82rem;width:100%">
</div>
<div style="display:flex;gap:.3rem;align-items:end;padding-bottom:.15rem">
<button class="btn btn-sm btn-primary">添加</button>
<button type="button" class="btn btn-sm btn-outline" onclick="toggleAddRoute()">取消</button>
</div>
</form>
</td></tr>`;

  h(res, 200, '仪表盘', `${navBar()}
${successMsg ? `<div class="alert alert-success">${esc(successMsg)}</div>` : ''}
<div class="stat">
<div class="stat-item"><div class="num">${config.routes.length}</div><div class="lbl">路由</div></div>
<div class="stat-item"><div class="num">${allSessions.length}</div><div class="lbl">活跃会话</div></div>
</div>

<div class="card">
<h2 style="display:flex;align-items:center;justify-content:space-between;border-bottom:none;padding-bottom:0;margin-bottom:0">
<span>路由列表 <span class="count">(${config.routes.length})</span></span>
<span style="font-size:.8rem;font-weight:400;display:flex;gap:.4rem;align-items:center">
<a href="/_admin/routes/export" class="btn btn-sm btn-outline" style="text-decoration:none">导出</a>
<input type="file" accept=".yaml,.yml" style="display:none" id="importFileInput" onchange="importRouteFile(event)">
<button class="btn btn-sm btn-outline" onclick="document.getElementById('importFileInput').click()">导入</button>
<span id="importStatus" style="font-size:.75rem;color:#888"></span>
</span>
</h2>
<div class="table-wrap"><table><thead><tr><th>Host</th><th>目标</th><th class="auth-col">鉴权</th><th>描述</th><th class="action-col">操作</th></tr></thead><tbody>${routeCards || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:1.5rem;font-size:.85rem">暂无路由</td></tr>'}
<tr id="addRouteToggle"><td colspan="5" style="text-align:center;border-bottom:none;padding:.25rem"><button class="btn btn-sm btn-outline" onclick="toggleAddRoute()" style="color:#0066ff">＋ 添加路由</button></td></tr>${addRow}
</tbody></table></div>
<div style="font-size:.72rem;color:#888;padding:.3rem 0 0;line-height:1.5">
<strong>目标地址说明：</strong><br>
当后端与门房大爷在同一网络（裸机、同容器、<code>--network host</code>），地址填 <code>127.0.0.1</code><br>
当后端在宿主机、门房大爷在 Docker 桥接容器，地址填 <code>host.docker.internal</code><br>
其他情况填自定义地址（仅支持 http 协议）
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
${sessionRows ? `<div class="table-wrap"><table class="sessions"><thead><tr><th style="width:13%">会话</th><th style="width:9%">标记</th><th style="width:13%">Host</th><th>设备</th><th style="width:11%">IP</th><th style="width:14%">创建</th><th style="width:14%">过期</th><th style="width:10%">操作</th></tr></thead><tbody>${sessionRows}</tbody></table></div>` : '<div class="empty" style="margin-top:.5rem">暂无活跃会话</div>'}
</div>
<script>
(function(){var c=0,e=document.getElementById('refreshIndicator');if(e)e.textContent='10s后自动刷新'
setInterval(function(){c=10-(Date.now()/1000|0)%10;if(e)e.textContent=c+'s后刷新'
var addForm=document.getElementById('addRouteForm'),labelInput=document.querySelector('.label-input');if(location.href.indexOf('_edit')<0&&(!addForm||addForm.style.display!='table-row')&&(!labelInput||document.activeElement!==labelInput)&&c<=1){location.reload()}},1000)})();
document.addEventListener('click',function(e){var t=e.target.closest('.label-display');if(!t||t.tagName==='INPUT')return;
var sid=t.dataset.sid,val=t.textContent.replace(/^点击添加$/,'');t.innerHTML='<input class="label-input" value="'+val.replace(/"/g,'&quot;')+'">';
var inp=t.querySelector('input');inp.focus();inp.select();
function save(){var v=inp.value.trim();var x=new XMLHttpRequest();x.open('POST','/_admin/session/label',true);
x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
x.onload=function(){t.innerHTML=v||'<span style="color:#bbb">点击添加</span>';if(!v)t.innerHTML='<span style="color:#bbb">点击添加</span>'};
x.send('sid='+encodeURIComponent(sid)+'&label='+encodeURIComponent(v))}
inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();save();}
if(e.key==='Escape'){t.innerHTML=val||'<span style="color:#bbb">点击添加</span>'}});
inp.addEventListener('blur',save)});
function toggleAddRoute(){var f=document.getElementById('addRouteForm'),t=document.getElementById('addRouteToggle');if(f&&t){var show=f.style.display!='table-row';f.style.display=show?'table-row':'none';t.style.display=show?'none':'table-row';}}
function importRouteFile(e){var file=e.target.files[0];if(!file)return;
var st=document.getElementById('importStatus');st.textContent='导入中...';st.style.color='#888';
var reader=new FileReader();reader.onload=function(){
var x=new XMLHttpRequest();x.open('POST','/_admin/routes/import',true);
x.setRequestHeader('Content-Type','application/x-yaml');
x.onload=function(){try{var r=JSON.parse(x.responseText);if(r.ok){st.textContent='已导入 '+r.count+' 条路由';st.style.color='#166534';setTimeout(function(){location.reload()},1500)}else{st.textContent='导入失败: '+r.error;st.style.color='#b91c1c'}}catch(e){st.textContent='导入失败';st.style.color='#b91c1c'}};
x.onerror=function(){st.textContent='网络错误';st.style.color='#b91c1c'};
x.send(reader.result)};reader.readAsText(file);e.target.value=''}
</script>`);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseTarget(t) {
  try { const u = new URL(t); return { addr: u.hostname, port: u.port || '80' } }
  catch { return { addr: t || '', port: '80' } }
}

// ── Route CRUD ──

async function addRoute(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { config } = backend;
  const host = (params.get('host') || '').trim();
  const rawTarget = (params.get('target') || '').trim();
  const target = rawTarget.includes('://') ? rawTarget : `http://${rawTarget}`;
  if (!host || !rawTarget) {
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
  const rawTarget = (params.get('target') || '').trim();
  const target = rawTarget.includes('://') ? rawTarget : `http://${rawTarget}`;
  if (!host || !rawTarget) {
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
  if (req.method !== 'POST') return rd(res, '/_admin');
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

// ── Route Import/Export ──

function exportRoutes(req, res, backend) {
  const yaml = require('js-yaml');
  const doc = { routes: backend.config.routes.map(r => ({
    host: r.host,
    target: r.target,
    auth: r.auth,
    auth_exempt: r.auth_exempt.length > 0 ? r.auth_exempt : undefined,
    description: r.description,
  }))};
  const yamlStr = yaml.dump(doc, { indent: 2, lineWidth: -1 });
  res.writeHead(200, {
    'Content-Type': 'application/x-yaml',
    'Content-Disposition': 'attachment; filename="routes.yaml"',
  });
  res.end(yamlStr);
}

async function importRoutes(req, res, backend) {
  const { config } = backend;
  const ip = req.socket.remoteAddress || '';
  const body = await readBody(req);
  try {
    const yaml = require('js-yaml');
    let yamlContent = body;
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      const boundaryMatch = ct.match(/boundary=(.+?)(?:;|$)/);
      if (!boundaryMatch) throw new Error('无法解析 multipart boundary');
      let boundary = boundaryMatch[1].trim();
      if (boundary.startsWith('"') && boundary.endsWith('"')) boundary = boundary.slice(1, -1);
      const parts = body.split('--' + boundary);
      yamlContent = '';
      for (const part of parts) {
        if (part.includes('Content-Disposition') && part.includes('name="file"')) {
          const idx = part.indexOf('\r\n\r\n');
          if (idx !== -1) yamlContent = part.slice(idx + 4).trim();
        }
      }
      if (!yamlContent) throw new Error('未找到上传文件内容');
    }
    const imported = yaml.load(yamlContent);
    if (!imported || !Array.isArray(imported.routes)) {
      throw new Error('YAML 中未找到有效的 routes 列表');
    }
    const existing = new Map(config.routes.map(r => [r.host, r]));
    for (const r of imported.routes) {
      if (!r.host || !r.target) continue;
      existing.set(r.host, {
        host: r.host,
        target: r.target,
        auth: r.auth !== false,
        auth_exempt: Array.isArray(r.auth_exempt) ? r.auth_exempt : [],
        description: r.description || r.host,
      });
    }
    config.routes = [...existing.values()];
    saveConfig(config);
    audit('ROUTES_IMPORT', `count=${imported.routes.length}`, ip);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: imported.routes.length }));
  } catch (e) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

// ── Session ops ──

async function kickSession(req, res, backend) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { sessions } = backend;
  const sid = params.get('sid') || '';
  const ip = req.socket.remoteAddress || '';
  let kicked = false;
  const matchId = sid.endsWith('...') ? sid.slice(0, -3) : sid;
  for (const [id] of sessions) {
    if (id.startsWith(matchId)) {
      sessions.delete(id);
      audit('SESSION_KICK', `sid=${id.slice(0, 8)}...`, ip);
      kicked = true;
      break;
    }
  }
  rd(res, '/_admin?msg=' + encodeURIComponent(kicked ? '已踢下线' : '未找到该会话'));
}

function clearSessions(req, res, backend) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const ip = req.socket.remoteAddress || '';
  const count = backend.sessions.size;
  backend.sessions.clear();
  audit('SESSION_CLEAR', 'all sessions cleared', ip);
  rd(res, '/_admin?msg=' + encodeURIComponent(`已清空 ${count} 个会话`));
}

async function updateSessionLabel(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const sid = params.get('sid') || '';
  const label = (params.get('label') || '').trim();
  const ip = req.socket.remoteAddress || '';
  const matchId = sid.endsWith('...') ? sid.slice(0, -3) : sid;
  for (const [id, s] of backend.sessions) {
    if (id.startsWith(matchId)) {
      s.label = label || '';
      const safeLabel = (label || '').replace(/[\n\r]/g, '\\n');
      audit('SESSION_LABEL_UPDATE', `sid=${id.slice(0, 8)}... label=${safeLabel}`, ip);
      break;
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// ── Settings ──

const TIMEZONES = [
  'UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Taipei',
  'Asia/Kolkata', 'Asia/Dubai',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Pacific/Auckland', 'Australia/Sydney',
];

function renderSettings(req, res, backend, alert) {
  if (req.method === 'POST' && !alert) return rd(res, '/_admin/settings');
  const { config } = backend;
  const tzOpts = TIMEZONES.map(tz =>
    `<option value="${tz}"${config.timezone === tz ? ' selected' : ''}>${tz}</option>`
  ).join('');
  h(res, 200, '设置', `${navBar()}
${alert ? `<div class="alert alert-${alert.type}">${esc(alert.text)}</div>` : ''}
<div class="settings-grid">
<div class="card">
<h2>修改访问密码</h2>
<form method="post" action="/_admin/settings/password">
<div class="form-group"><label>新访问密码</label><div class="pwd-wrap"><input type="password" name="password" required><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<div class="form-group"><label>确认新密码</label><div class="pwd-wrap"><input type="password" name="confirm" required><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<button class="btn btn-primary">保存</button>
</form>
</div>
<div class="card">
<h2>修改管理员账号</h2>
<form method="post" action="/_admin/settings/admin">
<div class="form-group"><label>当前管理员密码</label><div class="pwd-wrap"><input type="password" name="current" required><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<div class="form-group"><label>新用户名</label><input name="username" value="${esc(config.admin_username)}" required></div>
<div class="form-group"><label>新密码</label><div class="pwd-wrap"><input type="password" name="password" placeholder="留空则不修改"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<div class="form-group"><label>确认新密码</label><div class="pwd-wrap"><input type="password" name="confirm" placeholder="留空则不修改"><button type="button" class="pwd-toggle" onclick="pwdtoggle(this)" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div></div>
<button class="btn btn-primary">保存</button>
</form>
</div>
<div class="card">
<h2>时区设置</h2>
<form method="post" action="/_admin/settings/timezone">
<div class="form-group"><label>显示时间时区</label><select name="timezone" style="padding:.45rem .6rem;border:1px solid #d0d0d0;border-radius:6px;font-size:.85rem;width:100%">${tzOpts}</select></div>
<button class="btn btn-primary">保存</button>
</form>
</div>
</div>`);
}

async function changePassword(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { config } = backend;
  const password = params.get('password') || '';
  const confirm = params.get('confirm') || '';
  const ip = req.socket.remoteAddress || '';
  if (password.length < 6) {
    return renderSettings(req, res, backend, { type: 'error', text: '密码至少 6 位' });
  }
  if (password !== confirm) {
    return renderSettings(req, res, backend, { type: 'error', text: '两次密码不一致' });
  }
  config.password = hashPassword(password);
  saveConfig(config);
  audit('PASSWORD_CHANGE', '', ip);
  renderSettings(req, res, backend, { type: 'success', text: '访问密码已更新' });
}

async function changeAdmin(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { config } = backend;
  const current = params.get('current') || '';
  const username = (params.get('username') || '').trim();
  const password = params.get('password') || '';
  const confirm = params.get('confirm') || '';
  const ip = req.socket.remoteAddress || '';
  if (!verifyPassword(current, config.admin_password)) {
    return renderSettings(req, res, backend, { type: 'error', text: '当前管理员密码错误' });
  }
  if (!username) {
    return renderSettings(req, res, backend, { type: 'error', text: '用户名不能为空' });
  }
  if (password && password !== confirm) {
    return renderSettings(req, res, backend, { type: 'error', text: '两次密码不一致' });
  }
  config.admin_username = username;
  if (password) config.admin_password = hashPassword(password);
  adminSessions.clear();
  saveConfig(config);
  audit('ADMIN_ACCOUNT_CHANGE', 'username=' + username, ip);
  renderSettings(req, res, backend, { type: 'success', text: '管理员账号已更新' });
}

async function changeTimezone(req, res, backend) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const { config } = backend;
  const tz = params.get('timezone') || 'UTC';
  if (!TIMEZONES.includes(tz)) {
    return renderSettings(req, res, backend, { type: 'error', text: '无效的时区' });
  }
  config.timezone = tz;
  saveConfig(config);
  audit('TIMEZONE_CHANGE', tz, req.socket.remoteAddress || '');
  renderSettings(req, res, backend, { type: 'success', text: `时区已设为 ${tz}` });
}

function reloadConfig(req, res, backend) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const ip = req.socket.remoteAddress || '';
  try {
    const newConfig = loadConfig();
    Object.assign(backend.config, newConfig);
    audit('CONFIG_RELOAD', '', ip);
    h(res, 200, '仪表盘', `${navBar()}<div class="card" style="text-align:center;padding:2rem"><div class="alert alert-success">配置已重载</div><a href="/_admin" style="font-size:.85rem;color:#0066ff">返回仪表盘</a></div>`);
  } catch (e) {
    audit('CONFIG_RELOAD_FAIL', e.message, ip);
    h(res, 200, '仪表盘', `${navBar()}<div class="card" style="text-align:center;padding:2rem"><div class="alert alert-error">重载失败: ${e.message}</div></div>`);
  }
}

function renderAbout(req, res, backend) {
  h(res, 200, '关于', `${navBar()}
<div class="card" style="max-width:720px;margin:0 auto">
<div style="text-align:center;margin-bottom:1rem">
<img src="/assets/lodgemans-banner.png" alt="lodgeman-s" style="max-width:100%;height:auto;border-radius:8px">
</div>
<h1 style="font-size:1.5rem;margin:0 0 .25rem">门房大爷LodgeManS</h1>
<p style="color:#666;font-size:.85rem;margin:0 0 1.5rem">统一认证网关</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
<div class="stat-item"><div class="num">v1.0.3</div><div style="font-size:.8rem;color:#888">当前版本</div></div>
<div class="stat-item"><div class="num">MIT</div><div style="font-size:.8rem;color:#888">开源许可</div></div>
</div>
<h2 style="font-size:1.05rem;margin:0 0 .5rem">项目信息</h2>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .75rem">
很多自建服务本身不带鉴权，反代后直接暴露在公网，有信息泄露之顾虑。
门房大爷就是在这些服务前面加一道大门——统一认证网关。
登录一次后，所有受保护的浏览器请求自动通过，保护隐私的同时也减少反复登录的麻烦。
</p>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .25rem">
项目地址：<a href="https://github.com/sopyk/lodgeman-s" target="_blank" style="color:#0066ff">https://github.com/sopyk/lodgeman-s</a>
</p>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 1rem">
问题反馈：<a href="https://github.com/sopyk/lodgeman-s/issues" target="_blank" style="color:#0066ff">https://github.com/sopyk/lodgeman-s/issues</a>
</p>
<h2 style="font-size:1.05rem;margin:0 0 .5rem">核心功能</h2>
<ul style="margin:0 0 1.5rem;padding-left:1.2rem;color:#555;font-size:.85rem;line-height:1.8">
<li>多站点统一登录认证，一次登录访问所有服务</li>
<li>请求路由转发，支持目标 URL 和继承域名（仅 HTTP 后端）</li>
<li>每条路由独立控制是否启用统一认证——本身带鉴权的服务可以直接放行</li>
<li>独立管理面板：在线会话管理、配置修改</li>
<li>管理员 / 普通用户双层权限控制</li>
<li>配置导入导出，支持 YAML 合并</li>
<li>登录会话时长可选，记住状态</li>
<li>会话备注名自动生成，轻松识别不同登录</li>
</ul>
<h2 style="font-size:1.05rem;margin:1.5rem 0 .5rem">部署说明</h2>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .75rem">
<strong>门房大爷本身不带 TLS 终止功能，只是一个统一认证网关。</strong>
它基于 Host 头进行路由分发，需要在前面挂载反代（Nginx / Caddy / Cloudflare Tunnel）处理 HTTPS。
</p>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .75rem">
推荐架构：
</p>
<pre style="background:#f5f5f5;padding:.6rem;border-radius:4px;font-size:.78rem;line-height:1.5;overflow-x:auto;margin:0 0 .75rem;color:#333">
用户 → HTTPS → 反代（TLS 终止）→ HTTP :4082 → 门房大爷 → 后端服务
</pre>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .25rem">
方式一（推荐）：Nginx / Caddy / Cloudflare Tunnel 监听 80/443，将泛域名流量转发到 <code>:4082</code>，访问无需端口号。
</p>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .75rem">
方式二：DNS <code>*.example.com</code> 解析到服务器 IP，直接 <code>http://svc.example.com:4082</code> 访问（需开放 4082 端口）。
</p>
<p style="color:#555;font-size:.85rem;line-height:1.6;margin:0 0 .25rem">
详细配置请参考 <a href="https://github.com/sopyk/lodgeman-s?tab=readme-ov-file#使用前提" target="_blank" style="color:#0066ff">README 前置反代说明</a>。
</p>
</div>`);
}

module.exports = { handleAdmin };

const config = require('./config.js');
const { hashPassword, loadConfig } = config;
const { sessions, saveSessions } = require('./session.js');
const { rd, h, json } = require('./utils.js');
const { addAuditLog } = require('./audit.js');
const crypto = require('crypto');

const MAX_BODY = 1048576;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', (err) => reject(err));
  });
}

const DURATIONS = [
  { value: 900, label: '15 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 10800, label: '3 小时' },
  { value: 43200, label: '12 小时' },
  { value: 86400, label: '24 小时' },
  { value: 259200, label: '3 天' },
  { value: 604800, label: '7 天' },
  { value: 2592000, label: '30 天' },
  { value: 31536000, label: '1 年' },
  { value: 0, label: '永久' },
];

const LOGIN_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>门房大爷 - 请输入访问密码</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#2d3436;display:flex;min-height:100vh;align-items:center;justify-content:center}
.login-wrap{background:#fff;border-radius:8px;padding:30px;width:340px;box-shadow:0 4px 20px rgba(0,0,0,.15)}.login-wrap h2{text-align:center;margin-bottom:4px;font-size:18px;display:flex;align-items:center;justify-content:center;gap:6px}
.login-wrap .sub{text-align:center;font-size:12px;color:#636e72;margin-bottom:16px}.field{margin-bottom:14px}.field label{display:block;font-size:12px;color:#636e72;margin-bottom:3px;font-weight:600}
.field input{width:100%;padding:8px;border:1px solid #dfe6e9;border-radius:4px;font-size:13px;outline:0}.field input:focus{border-color:#0984e3}.btn{width:100%;padding:8px;background:#0984e3;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:14px}.btn:hover{opacity:.85}.error{color:#d63031;font-size:13px;text-align:center;margin-bottom:10px}.success{color:#00b894;font-size:13px;text-align:center;margin-bottom:10px}.duration-select{display:flex;gap:6px;flex-wrap:wrap}.duration-select button{flex:1;min-width:60px;padding:4px 2px;font-size:11px;border:1px solid #dfe6e9;border-radius:4px;background:#fff;cursor:pointer;color:#636e72}.duration-select button.active{border-color:#0984e3;background:#0984e3;color:#fff}@media(max-width:480px){.login-wrap{width:90%;margin:10px}}
.pwd-wrap{position:relative;display:flex;align-items:stretch}.pwd-wrap input{flex:1;padding-right:36px!important}
.pwd-mask{-webkit-text-security:disc}.pwd-toggle{position:absolute;right:0;top:0;bottom:0;width:32px;border:0;background:0 0;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:#636e72;font-size:16px}
.pwd-toggle:hover{color:#2d3436}
</style></head><body><div class="login-wrap"><h2>🏠 门房大爷</h2><div class="sub">请输入访问密码</div><div id="err" class="error"></div><div id="msg" class="success"></div><div class="field"><label>访问密码</label><div class="pwd-wrap"><input type="text" class="pwd-mask" id="pwd" name="access_pwd" autocomplete="off" placeholder="输入访问密码"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd(this)" title="显示/隐藏">👁</button></div></div><div class="field"><label>会话时长</label><div class="duration-select" id="duration-select">
<button onclick="setDuration(900,this)" class="active">15分</button><button onclick="setDuration(3600,this)">1小时</button><button onclick="setDuration(43200,this)">12小时</button><button onclick="setDuration(86400,this)">1天</button><button onclick="setDuration(604800,this)">7天</button><button onclick="setDuration(2592000,this)">30天</button><button onclick="setDuration(31536000,this)">1年</button><button onclick="setDuration(0,this)">永久</button>
</div></div><div class="field"><label>备注名（可选）</label><input type="text" id="label" name="label" placeholder="如：办公室电脑" autocomplete="off"/></div><button class="btn" onclick="login()">进入</button></div><script>
var dur=900;function setDuration(d,btn){dur=d;document.querySelectorAll('.duration-select button').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}
function togglePwd(btn){const inp=document.getElementById('pwd');if(inp.classList.contains('pwd-mask')){inp.classList.remove('pwd-mask');btn.textContent='🙈'}else{inp.classList.add('pwd-mask');btn.textContent='👁'}}
function login(){const p=document.getElementById('pwd').value;const l=document.getElementById('label').value.trim();if(!p)return document.getElementById('err').textContent='请输入访问密码';fetch('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({access_pwd:p,duration:dur,label:l}).toString()}).then(r=>{if(r.redirected)location.href=r.url;return r.json()}).then(d=>{if(d.ok)location.reload();else document.getElementById('err').textContent=d.error||'密码错误'}).catch(()=>document.getElementById('err').textContent='请求失败')}
</script></body></html>`;

function genSessionId() {
  return (
    crypto.randomBytes(8).toString('hex') +
    '...' +
    Date.now().toString(36) +
    '...' +
    crypto.randomBytes(4).toString('hex')
  );
}

function auth(req, res) {
  if (req.url === '/login' && req.method === 'GET') {
    return res.end(LOGIN_PAGE);
  }

  if (req.url === '/login' && req.method === 'POST') {
    return handleLogin(req, res);
  }

  const conf = loadConfig();
  if (!conf.password) {
    return rd(res, '/_admin/login');
  }

  const cookies = (req.headers.cookie || '').split(';').map((c) => c.trim());
  let sessionId = null;
  for (const c of cookies) {
    if (c.startsWith('auth_session=')) {
      sessionId = c.slice('auth_session='.length);
      break;
    }
  }
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    if (session.expiresAt !== 0 && Date.now() > session.expiresAt) {
      sessions.delete(sessionId);
      saveSessions();
    } else {
      return null;
    }
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const exemptPaths = ['/login', '/_admin', '/assets/', '/favicon.ico'];
  for (const p of exemptPaths) {
    if (req.url.startsWith(p)) return null;
  }

  const targetHost = req.headers.host || '';
  const route = (conf.routes || []).find((r) => targetHost.includes(r.host));
  if (route && route.auth === false) return null;

  if (route) {
    const pathExempt = (route.auth_exempt || []).some((pattern) => {
      if (pattern.endsWith('/*')) {
        return urlObj.pathname.startsWith(pattern.slice(0, -1));
      }
      return urlObj.pathname === pattern;
    });
    if (pathExempt) return null;
  }

  rd(res, '/login');
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const conf = loadConfig();
  const pwd = params.get('access_pwd') || '';
  let dur = parseInt(params.get('duration')) || 3600;
  const label = (params.get('label') || '').trim();

  if (!DURATIONS.some((d) => d.value === dur)) dur = 3600;

  if (!conf.password) {
    return json(res, { ok: false, error: '未设置访问密码' });
  }

  if (hashPassword(pwd, conf.password) !== conf.password) {
    return json(res, { ok: false, error: '密码错误' });
  }

  const sid = genSessionId();
  const expiresAt = dur === 0 ? 0 : Date.now() + dur * 1000;
  const ua = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress || '';
  sessions.set(sid, {
    createdAt: Date.now(),
    expiresAt,
    label: label || undefined,
    ua,
    ip,
  });
  saveSessions();
  const maxAge = dur === 0 ? 365 * 86400 : dur;
  res.setHeader(
    'Set-Cookie',
    `auth_session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
  addAuditLog('login', `用户登录 (${label || '无备注'})`);
  json(res, { ok: true });
}

module.exports = { auth, handleLogin, LOGIN_PAGE };

const crypto = require('crypto');

const { verifyPassword } = require('./config.js');
const { audit } = require('./audit.js');

const DURATIONS = [
  { label: '15 分钟', value: 15 * 60 },
  { label: '1 小时', value: 3600, def: true },
  { label: '6 小时', value: 6 * 3600 },
  { label: '24 小时', value: 24 * 3600 },
  { label: '7 天', value: 7 * 86400 },
  { label: '15 天', value: 15 * 86400 },
  { label: '30 天', value: 30 * 86400 },
  { label: '永久', value: 365 * 86400 },
];

const WORDS = '熊猫,火箭,星辰,清风,明月,青山,绿水,阳光,雨露,白云,大海,森林,草原,沙漠,极光,流星,彩虹,闪电,雪花,春风,梧桐,银杏,琥珀,珊瑚,翡翠,珍珠,琉璃,瑞雪,丰收,启航,远山,近水,书签,灯塔,港湾,原野,苍穹,晨曦,暮色,星河'.split(',');

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)] + WORDS[Math.floor(Math.random() * WORDS.length)] + Math.floor(Math.random() * 100);
}

const OPTS = DURATIONS.map(d =>
  `<option value="${d.value}"${d.def ? ' selected' : ''}>${d.label}</option>`
).join('');

const LOGIN_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 · 门房大爷</title><link rel="icon" href="/assets/favicon.png">
<style>
body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
form{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);width:360px}
h1{margin:0 0 .5rem;font-size:1.2rem;color:#333;text-align:center}
.desc{margin:0 0 1rem;color:#666;font-size:.85rem;text-align:center}
input,select{width:100%;padding:.5rem;margin:.25rem 0 .6rem;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;font-size:1rem}
select{font-size:.9rem;background:#fff;cursor:pointer}
label{display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:#555;margin-bottom:.25rem;cursor:pointer}
input[type=checkbox]{width:auto;margin:0}
.check-row{display:flex;gap:.6rem;margin-bottom:0}
.check-row>div{flex:1;min-width:0}
.check-row label{width:fit-content;margin-bottom:0}
button{width:100%;padding:.6rem;background:#0066ff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:1rem}
button:hover{background:#0052cc}
.error{color:#d32f2f;font-size:.85rem;margin:.5rem 0}
.logged_out{color:#2e7d32;font-size:.85rem;margin:.5rem 0}
.hint{color:#888;font-size:.75rem;margin:0 0 .6rem 1.3rem;line-height:1.3}
.sublabel{font-size:.8rem;color:#555;margin:.2rem 0 0}
.banner{text-align:center;margin-bottom:1rem}
.banner img{max-width:100%;height:auto;border-radius:6px}
.pwd-wrap{position:relative;display:flex;align-items:center}
.pwd-wrap input{flex:1;padding-right:2rem}
.pwd-toggle{position:absolute;right:2px;top:1px;bottom:1px;background:none;border:none;cursor:pointer;padding:0;line-height:1;user-select:none;display:flex;align-items:center;justify-content:center;width:28px;height:auto}
button.pwd-toggle:hover{background:none}
.pwd-toggle svg{width:18px;height:18px;fill:none;stroke:#999;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.pwd-toggle:hover svg{stroke:#666}
</style></head>
<body>
<form method="post">
<div class="banner"><img src="/assets/lodgemans-banner.png" alt="门房大爷LodgeManS"></div>
<h1 style="font-size:1.3rem">门房大爷LodgeManS</h1>
<p class="desc">统一认证网关</p>
<p class="desc" style="font-style:italic">"先来登个记～"</p>
ALERTS
<div class="pwd-wrap"><input type="password" name="password" placeholder="密码" autofocus><button type="button" class="pwd-toggle" onclick="var i=this.previousElementSibling,e=this.querySelector('use');if(i.type==='password'){i.type='text';e.setAttribute('href','#eye-off')}else{i.type='password';e.setAttribute('href','#eye')}" aria-label="切换密码显示"><svg><use href="#eye"/></svg></button></div>
<svg style="display:none"><symbol id="eye" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></symbol><symbol id="eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></symbol></svg>
<div class="check-row">
<div><label><input type="checkbox" name="remember" value="1" checked> 保持登录</label></div>
<div><span style="font-size:.85rem;color:#555">时长 </span><select name="duration" style="width:auto;display:inline-block;padding:.3rem .4rem;font-size:.85rem;margin:0">${OPTS}</select></div>
</div>
<div id="hint" class="hint">建议仅在私人设备上勾选。公共设备请勿勾选。</div>
<div style="margin:.5rem 0 .75rem">
<label style="margin-bottom:.2rem;font-size:.82rem">备注名 <input name="label" id="labelInput" placeholder="给自己一个标记，方便后台识别这个登录" style="font-size:.85rem;padding:.4rem .5rem;margin:0"></label>
<div style="color:#888;font-size:.72rem;margin-top:.15rem">方便你在管理后台识别不同的登录，建议填个有意义的词</div>
</div>
<button type="submit">登录</button>
</form>
<script>
var w = ['${WORDS.join("','")}'];
document.getElementById('labelInput').value = w[Math.floor(Math.random()*w.length)] + w[Math.floor(Math.random()*w.length)] + Math.floor(Math.random()*100);
</script>
</body></html>`;

function getIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function handleAuth(req, res, backend) {
  const { config, sessions } = backend;
  const ip = getIp(req);

  if (!config.password) {
    const page = LOGIN_PAGE
      .replace('<form method="post">', '<div>')
      .replace('ALERTS', '<div class="error" style="margin-bottom:1.5rem;line-height:1.6;text-align:center;font-size:.9rem;padding:.5rem 0">未设置访问密码，无法访问网页，请联系管理员<a href="/_admin/login" style="color:#0066ff;text-decoration:underline">设置</a>访问密码</div>')
      .replace(/<input[\s\S]*?<\/form>/, '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  const MAX_BODY = 1048576;

  if (req.method === 'POST') {
    let body = '';
    let size = 0;
    req.on('data', c => { body += c; size += c.length; });
    req.on('end', () => {
      if (size > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Payload too large');
        return;
      }
      const params = new URLSearchParams(body);
      if (verifyPassword(params.get('password') || '', config.password)) {
        audit('LOGIN_OK', 'user login', ip);

        const remember = params.get('remember') === '1';
        let dur = parseInt(params.get('duration') || '3600', 10);
        if (!DURATIONS.some(d => d.value === dur)) dur = 3600;
        const durMs = dur * 1000;
        const id = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        const expiresAt = now + durMs;

        sessions.set(id, {
          username: 'user',
          createdAt: now,
          expiresAt,
          userAgent: req.headers['user-agent'] || '',
          ip,
          host: req.headers['host'] || '',
          label: (params.get('label') || '').trim() || '',
          duration: dur,
        });

        const cookieOpts = [
          `auth_session=${id}`,
          'HttpOnly', 'SameSite=Lax', 'Path=/',
          remember ? `Max-Age=${dur}` : '',
        ].filter(Boolean);

        res.writeHead(302, { 'Location': '/', 'Set-Cookie': cookieOpts.join('; ') });
        res.end();
      } else {
        audit('LOGIN_FAIL', '', ip);
        const page = LOGIN_PAGE.replace('ALERTS', '<div class="error">密码错误</div>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
      }
    });
    return;
  }

  const isLogout = req.url.includes('logged_out');
  const alerts = isLogout
    ? '<div class="logged_out">已退出登录</div>'
    : '';
  const page = LOGIN_PAGE.replace('ALERTS', alerts);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
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

function getSession(req, sessions) {
  const c = parseCookies(req);
  const id = c['auth_session'];
  if (!id) return null;
  const s = sessions.get(id);
  if (!s || s.expiresAt < Date.now()) {
    if (s) sessions.delete(id);
    return null;
  }
  return { id, ...s };
}

module.exports = { handleAuth, parseCookies, getSession };

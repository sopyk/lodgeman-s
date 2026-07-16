const { hashPassword } = require('./config.js');
const config = require('./config.js');
const { loadConfig } = config;
const { addAuditLog } = require('./audit.js');
const {
  adminSessions,
  sessions,
  saveSessions,
} = require('./session.js');
const { rd, h, json } = require('./utils.js');

const { configPath } = config;
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

const SUBMENU = ['dashboard', 'settings', 'log', 'about'];
const ICONS = {
  dashboard: 'ic:round-dashboard',
  settings: 'ic:round-settings',
  log: 'ic:round-list-alt',
  about: 'ic:round-info-outline',
};
const LABELS = {
  dashboard: '控制台',
  settings: '设置',
  log: '审计日志',
  about: '关于',
};

const ADMIN_HTML = `<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>LodgeManS 管理面板</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6fa;color:#2d3436;min-height:100vh}
.layout{display:flex;min-height:100vh}.sidebar{width:180px;background:#2d3436;color:#fff;padding:0}.sidebar h1{font-size:16px;padding:16px;background:rgba(0,0,0,.2)}
.sidebar nav{display:flex;flex-direction:column}.sidebar nav a{color:rgba(255,255,255,.7);text-decoration:none;padding:10px 16px;font-size:13px}.sidebar nav a.active,.sidebar nav a:hover{color:#fff;background:rgba(255,255,255,.1)}
.main{flex:1;padding:20px;max-width:960px}.main h2{font-size:18px;margin-bottom:16px}.main .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.card{background:#fff;border-radius:6px;padding:16px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card table{width:100%;border-collapse:collapse;font-size:13px}.card table th,.card table td{text-align:left;padding:8px;border-bottom:1px solid #ecf0f1}
.card table th{font-weight:600;color:#636e72}.card table tr:last-child td{border-bottom:0}
.card label{display:block;margin-bottom:4px;font-size:12px;color:#636e72;font-weight:600}
.card input[type=text],.card input[type=password],.card input[type=number],.card select{width:100%;padding:8px;border:1px solid #dfe6e9;border-radius:4px;font-size:13px}
.card .row{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}.card .row>*{flex:1;min-width:180px}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border:0;border-radius:4px;cursor:pointer;font-size:13px;text-decoration:none;color:#fff;background:#0984e3}
.btn:hover{opacity:.85}.btn-sm{padding:4px 8px;font-size:12px}.btn-danger{background:#d63031}.btn-warning{background:#fdcb6e;color:#2d3436}
.btn-success{background:#00b894}.btn-outline{background:0 0;border:1px solid #0984e3;color:#0984e3}.btn-outline:hover{background:#0984e3;color:#fff}
.tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:#dfe6e9;color:#636e72}
.tag.on{background:#00b894;color:#fff}.tag.off{background:#d63031;color:#fff}
.alert{padding:10px;border-radius:4px;margin-bottom:12px;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.alert.error{background:#ffeaa7;color:#b53b3b}.alert.success{background:#dfe6e9;color:#2d3436}.alert .close{cursor:pointer;font-size:16px;line-height:1;opacity:.6}
.alert .close:hover{opacity:1}.tab-group{display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #dfe6e9}.tab-group a{padding:8px 16px;text-decoration:none;font-size:13px;color:#636e72;border-bottom:2px solid transparent;margin-bottom:-2px}
.tab-group a.active,.tab-group a:hover{color:#0984e3;border-bottom-color:#0984e3}.tab-group .badge{background:#d63031;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px}
.form-inline{display:flex;flex-wrap:wrap;gap:8px;align-items:end}.form-inline .field{flex:1;min-width:140px}
.form-inline .field input{width:100%;padding:6px;border:1px solid #dfe6e9;border-radius:4px;font-size:13px}
@media(max-width:640px){.layout{flex-direction:column}.sidebar{width:100%;display:flex;align-items:center;flex-wrap:wrap}
.sidebar h1{padding:10px 16px;font-size:14px;margin-right:auto}.sidebar nav{flex-direction:row;overflow-x:auto;width:100%}
.sidebar nav a{flex-shrink:0;padding:8px 12px;font-size:12px}.main{padding:12px;max-width:100%}
.card .row{flex-direction:column}.card .row>*{min-width:0}}
.pwd-wrap{position:relative;display:flex;align-items:stretch}.pwd-wrap input{flex:1;padding-right:36px!important}.pwd-toggle{position:absolute;right:0;top:0;bottom:0;width:32px;border:0;background:0 0;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:#636e72;font-size:16px}
.pwd-toggle:hover{color:#2d3436}
</style></head>`;

function adminPage(content, tab) {
  const tabs = SUBMENU.map(
    (m) =>
      `<a href="/_admin/${m}" class="${m === tab ? 'active' : ''}">${
        LABELS[m]
      }</a>`
  ).join('');
  const sc = ICONS[tab];
  return `<html>${ADMIN_HTML}<body><div class="layout"><div class="sidebar"><h1>⚙ LodgeManS</h1><nav>${tabs}</nav></div><div class="main"><span id="pg" style="display:none">${tab}</span>${content}</div></div></body></html>`;
}

function renderDashboard(
  conf,
  editingIdx,
  editError,
  addError
) {
  let msg = '';
  const urlParams = new URLSearchParams(h.req.url.split('?')[1] || '');
  const msgCode = urlParams.get('msg');
  const errorCode = urlParams.get('error');
  if (addError) {
    msg = `<div class="alert error"><span>${h(addError)}</span><span class="close" onclick="this.parentElement.remove()">×</span></div>`;
  } else if (editingIdx >= 0 && editError) {
    msg = `<div class="alert error"><span>${h(editError)}</span><span class="close" onclick="this.parentElement.remove()">×</span></div>`;
  } else if (msgCode && msgCode !== 'saved') {
    const msgs = { kicked: '会话已强制下线', cleared: `已清除全部 ${urlParams.get('count')||''} 个会话`, reloaded: '配置已重载', saved: '配置已保存' };
    msg = `<div class="alert success"><span>${msgs[msgCode] || msgCode}</span><span class="close" onclick="this.parentElement.remove()">×</span></div>`;
  } else if (errorCode) {
    const errors = { host_empty: '域名不能为空', target_empty: '目标地址不能为空', duplicate_host: '该域名已存在', invalid: '参数错误' };
    msg = `<div class="alert error"><span>${errors[errorCode] || errorCode}</span><span class="close" onclick="this.parentElement.remove()">×</span></div>`;
  }
  const routes = conf.routes || [];
  let editForm = '';
  if (editingIdx >= 0 && editingIdx < routes.length) {
    const r = routes[editingIdx];
    editForm = `<div class="card"><h3 style="margin-bottom:10px">编辑路由</h3><div class="row"><div class="field"><label>域名</label><input type="text" id="edit-host" value="${h(r.host)}" placeholder="xxx.example.com"/></div><div class="field"><label>目标地址</label><div style="display:flex;gap:4px"><select id="edit-scheme" style="width:80px;flex-shrink:0"><option value="http"${r.target.startsWith('https')?'':' selected'}>http://</option><option value="https"${r.target.startsWith('https')?' selected':''}>https://</option></select><input type="text" id="edit-target" value="${h(r.target.replace(/^https?:\/\//,''))}" placeholder="192.168.1.100:8080"/></div></div><div class="field"><label>描述</label><input type="text" id="edit-desc" value="${h(r.description||'')}" placeholder="可选备注"/></div></div><div class="actions"><label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" id="edit-auth"${r.auth===false?'':' checked'}/> 启用认证</label><button class="btn btn-sm btn-success" onclick="saveEdit(${editingIdx})">保存</button><button class="btn btn-sm" onclick="cancelEdit()">取消</button></div></div>`;
  }
  const rows = routes.length
    ? routes
        .map(
          (r, i) =>
            `<tr><td>${h(r.host)}</td><td>${h(r.target)}</td><td>${h(r.description||'-')}</td><td><span class="tag${r.auth===false?' off':' on'}">${r.auth===false?'关闭':'开启'}</span></td><td><div class="actions"><button class="btn btn-sm" onclick="editRoute(${i})">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteRoute(${i})">删除</button></div></td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" style="text-align:center;color:#b2bec3;padding:20px">暂无路由，请在下方添加</td></tr>';
  return adminPage(
    `
    <h2>路由管理</h2>
    ${msg}
    ${editForm}
    <div class="card">
      <table><thead><tr><th>域名</th><th>目标地址</th><th>描述</th><th>认证</th><th style="width:120px">操作</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px">添加路由</h3>
      <div class="row">
        <div class="field"><label>域名</label><input type="text" id="new-host" placeholder="xxx.example.com" autocomplete="off"/></div>
        <div class="field"><label>目标地址</label><div style="display:flex;gap:4px"><select id="new-scheme" style="width:80px;flex-shrink:0"><option value="http">http://</option><option value="https">https://</option></select><input type="text" id="new-target" placeholder="192.168.1.100:8080" autocomplete="off"/></div></div>
        <div class="field"><label>描述</label><input type="text" id="new-desc" placeholder="可选备注" autocomplete="off"/></div>
      </div>
      <div class="actions" style="margin-top:8px">
        <label style="display:flex;align-items:center;gap:4px;font-size:13px"><input type="checkbox" id="new-auth" checked/> 启用认证</label>
        <button class="btn btn-sm btn-success" onclick="addRoute()">添加</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px">全局操作</h3>
      <div class="actions" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-warning" onclick="reloadConfig()">重载配置</button>
        <button class="btn btn-sm btn-danger" onclick="clearSessions()">清空所有会话</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px">导入 / 导出</h3>
      <div class="row"><div class="field"><label>导出配置</label><div><button class="btn btn-sm" onclick="exportConfig()">下载 YAML</button></div></div><div class="field"><label>导入配置（YAML 合并）</label><div><input type="file" id="import-file" accept=".yaml,.yml" style="font-size:13px"/><button class="btn btn-sm" onclick="importConfig()" style="margin-top:4px">上传并合并</button></div></div></div>
    </div>
    <script>
    function msg(s){const d=document.createElement('div');d.className='alert success';d.innerHTML='<span>'+s+'</span><span class="close" onclick="this.parentElement.remove()">×</span>';document.querySelector('.main').insertBefore(d,document.querySelector('.main h2').nextSibling)}
    function err(s){const d=document.createElement('div');d.className='alert error';d.innerHTML='<span>'+s+'</span><span class="close" onclick="this.parentElement.remove()">×</span>';document.querySelector('.main').insertBefore(d,document.querySelector('.main h2').nextSibling)}
    function addRoute(){const host=document.getElementById('new-host').value.trim();const target=document.getElementById('new-target').value.trim();if(!host)return err('域名不能为空');if(!target)return err('目标地址不能为空');fetch('/_admin/addRoute',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({host,target,desc:document.getElementById('new-desc').value.trim(),auth:document.getElementById('new-auth').checked?'1':'0',scheme:document.getElementById('new-scheme').value}).toString()}).then(r=>r.json()).then(d=>{if(d.ok){location.href='/_admin/dashboard'}else{err(d.error||'添加失败')}}).catch(()=>err('请求失败'))}
    function editRoute(i){location.href='/_admin/dashboard?edit='+i}
    function cancelEdit(){location.href='/_admin/dashboard'}
    function saveEdit(i){const host=document.getElementById('edit-host').value.trim();const target=document.getElementById('edit-target').value.trim();if(!host)return err('域名不能为空');if(!target)return err('目标地址不能为空');const desc=document.getElementById('edit-desc').value.trim();const auth=document.getElementById('edit-auth').checked?'1':'0';const scheme=document.getElementById('edit-scheme').value;fetch('/_admin/editRoute',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({idx:i,host,target,desc,auth,scheme}).toString()}).then(r=>r.json()).then(d=>{if(d.ok){location.href='/_admin/dashboard'}else{err(d.error||'编辑失败')}}).catch(()=>err('请求失败'))}
    function deleteRoute(i){if(!confirm('确定删除该路由？'))return;fetch('/_admin/deleteRoute',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({idx:i}).toString()}).then(r=>r.json()).then(d=>{if(d.ok)location.href='/_admin/dashboard';else err(d.error||'删除失败')}).catch(()=>err('请求失败'))}
    function reloadConfig(){fetch('/_admin/reloadConfig',{method:'POST'}).then(r=>r.json()).then(d=>{if(d.ok)location.href='/_admin/dashboard?msg=reloaded';else err(d.error||'重载失败')}).catch(()=>err('请求失败'))}
    function clearSessions(){if(!confirm('确定清空所有会话？'))return;fetch('/_admin/clearSessions',{method:'POST'}).then(r=>r.json()).then(d=>{if(d.ok)location.href='/_admin/dashboard?msg=cleared';else err(d.error||'操作失败')}).catch(()=>err('请求失败'))}
    function exportConfig(){window.open('/_admin/export','_blank')}
    function importConfig(){const f=document.getElementById('import-file').files[0];if(!f)return err('请选择文件');const form=new FormData();form.append('file',f);fetch('/_admin/import',{method:'POST',body:form}).then(r=>r.json()).then(d=>{if(d.ok)msg('配置导入成功');else err(d.error||'导入失败')}).catch(()=>err('导入失败'))}
    </script>`,
    'dashboard'
  );
}

function renderLog(logEntries) {
  const rows =
    logEntries && logEntries.length
      ? logEntries
          .map(
            (e, i) =>
              `<tr><td style="white-space:nowrap">${h(e.time||'')}</td><td>${h(e.action||'')}</td><td>${h(e.detail||'')}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3" style="text-align:center;color:#b2bec3;padding:20px">暂无审计日志</td></tr>';
  return adminPage(
    `<h2>审计日志</h2><div class="card"><table><thead><tr><th>时间</th><th>操作</th><th>详情</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    'log'
  );
}

function renderSettings() {
  return adminPage(
    `<h2>设置</h2>
    <div id="settings-msg"></div>
    <div class="card">
      <h3 style="margin-bottom:10px">修改管理密码</h3>
      <div class="row">
        <div class="field"><label>当前密码</label><input type="password" id="cur-pwd" autocomplete="off"/></div>
        <div class="field"><label>新密码</label><div class="pwd-wrap"><input type="password" id="new-pwd" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('new-pwd',this)" title="显示/隐藏">👁</button></div></div>
        <div class="field"><label>确认新密码</label><div class="pwd-wrap"><input type="password" id="confirm-pwd" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('confirm-pwd',this)" title="显示/隐藏">👁</button></div></div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="changePassword()">修改管理密码</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px">修改访问密码</h3>
      <div class="row">
        <div class="field"><label>当前管理密码</label><div class="pwd-wrap"><input type="password" id="cur-admin-pwd" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('cur-admin-pwd',this)" title="显示/隐藏">👁</button></div></div>
        <div class="field"><label>新访问密码</label><div class="pwd-wrap"><input type="password" id="new-access-pwd" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('new-access-pwd',this)" title="显示/隐藏">👁</button></div></div>
        <div class="field"><label>确认新密码</label><div class="pwd-wrap"><input type="password" id="confirm-access-pwd" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('confirm-access-pwd',this)" title="显示/隐藏">👁</button></div></div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="changeAccessPassword()">修改访问密码</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px">修改管理员账号</h3>
      <div class="row">
        <div class="field"><label>当前管理密码</label><div class="pwd-wrap"><input type="password" id="cur-admin-pwd2" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('cur-admin-pwd2',this)" title="显示/隐藏">👁</button></div></div>
        <div class="field"><label>新管理员用户名</label><input type="text" id="new-username" autocomplete="off"/></div>
        <div class="field"><label>新管理员密码</label><div class="pwd-wrap"><input type="password" id="new-admin-pwd" autocomplete="off"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd('new-admin-pwd',this)" title="显示/隐藏">👁</button></div></div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="changeAdmin()">修改管理员账号</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:10px">时区设置</h3>
      <div class="row">
        <div class="field"><label>时区</label><select id="timezone-select"><option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option><option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option><option value="America/New_York">America/New_York (UTC-5)</option><option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option><option value="Europe/London">Europe/London (UTC+0)</option><option value="Europe/Berlin">Europe/Berlin (UTC+1)</option><option value="Pacific/Auckland">Pacific/Auckland (UTC+12)</option></select></div>
      </div>
      <button class="btn btn-sm" onclick="saveTimezone()">保存时区</button>
    </div>
    <script>
    function togglePwd(id,btn){const inp=document.getElementById(id);if(inp.type==='password'){inp.type='text';btn.textContent='🙈'}else{inp.type='password';btn.textContent='👁'}}
    function showMsg(ok,text){const el=document.getElementById('settings-msg');el.innerHTML='<div class="alert '+(ok?'success':'error')+'">'+text+'<span class="close" onclick="this.parentElement.remove()">×</span></div>'}
    function getFields(ids){const o={};ids.forEach(id=>{const el=document.getElementById(id);if(el)o[id]=el.value});return o}
    function changePassword(){const f=getFields(['cur-pwd','new-pwd','confirm-pwd']);if(!f['cur-pwd'])return showMsg(0,'请输入当前密码');if(f['new-pwd']!==f['confirm-pwd'])return showMsg(0,'两次输入的新密码不一致');fetch('/_admin/changePassword',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)}).then(r=>r.json()).then(d=>{showMsg(d.ok,d.error||'密码已修改')}).catch(()=>showMsg(0,'请求失败'))}
    function changeAccessPassword(){const f=getFields(['cur-admin-pwd','new-access-pwd','confirm-access-pwd']);if(!f['cur-admin-pwd'])return showMsg(0,'请输入当前管理密码');if(f['new-access-pwd']!==f['confirm-access-pwd'])return showMsg(0,'两次输入的新密码不一致');fetch('/_admin/changeAccessPassword',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)}).then(r=>r.json()).then(d=>{showMsg(d.ok,d.error||'访问密码已修改')}).catch(()=>showMsg(0,'请求失败'))}
    function changeAdmin(){const f=getFields(['cur-admin-pwd2','new-username','new-admin-pwd']);if(!f['cur-admin-pwd2'])return showMsg(0,'请输入当前管理密码');fetch('/_admin/changeAdmin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)}).then(r=>r.json()).then(d=>{showMsg(d.ok,d.error||'管理员账号已修改')}).catch(()=>showMsg(0,'请求失败'))}
    function saveTimezone(){const tz=document.getElementById('timezone-select').value;fetch('/_admin/saveTimezone',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({timezone:tz}).toString()}).then(r=>r.json()).then(d=>{showMsg(d.ok,d.error||'时区已保存')}).catch(()=>showMsg(0,'请求失败'))}
    </script>`,
    'settings'
  );
}

function renderAbout(version) {
  return adminPage(
    `<h2>关于</h2>
    <div class="card" style="text-align:center;padding:30px;font-size:14px">
      <div style="font-size:48px;margin-bottom:10px">🏠</div>
      <h3 style="font-size:20px;margin-bottom:6px">门房大爷 LodgeManS</h3>
      <p style="color:#636e72;margin-bottom:4px">统一认证反向代理</p>
      <p style="color:#636e72;margin-bottom:16px">版本: v${h(version)}</p>
      <p><a href="https://github.com/sopyk/lodgeman-s" target="_blank" style="color:#0984e3">GitHub</a></p>
    </div>`,
    'about'
  );
}

const routes = [
  { name: 'dashboard', handler: handleDashboard },
  { name: 'settings', handler: handleSettings },
  { name: 'log', handler: handleLog },
  { name: 'about', handler: handleAbout },
  { name: 'login', handler: handleLogin },
  { name: 'export', handler: handleExport },
  { name: 'import', handler: handleImport },
  { name: 'addRoute', handler: handleAddRoute },
  { name: 'editRoute', handler: handleEditRoute },
  { name: 'deleteRoute', handler: handleDeleteRoute },
  { name: 'reloadConfig', handler: handleReloadConfig },
  { name: 'changePassword', handler: handleChangePassword },
  { name: 'changeAccessPassword', handler: handleChangeAccessPassword },
  { name: 'changeAdmin', handler: handleChangeAdmin },
  { name: 'clearSessions', handler: handleClearSessions },
  { name: 'kickSession', handler: handleKickSession },
  { name: 'updateSessionLabel', handler: handleUpdateSessionLabel },
  { name: 'saveTimezone', handler: handleSaveTimezone },
];

function getAdminSession(req) {
  const cookies = (req.headers.cookie || '').split(';').map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith('admin_session=')) {
      const sid = c.slice('admin_session='.length);
      return adminSessions.get(sid) || null;
    }
  }
  return null;
}

function requireAdmin(req, res) {
  const session = getAdminSession(req);
  if (!session) {
    rd(res, '/_admin/login');
    return null;
  }
  return session;
}

function addAdminSession(sid, username) {
  adminSessions.set(sid, { username, createdAt: Date.now() });
}

// 清理过期 admin session（每 1 小时）
setInterval(() => {
  const now = Date.now();
  const ADMIN_SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 小时
  for (const [sid, s] of adminSessions) {
    if (now - s.createdAt > ADMIN_SESSION_MAX_AGE) {
      adminSessions.delete(sid);
    }
  }
}, 60 * 60 * 1000);

async function handleDashboard(req, res, conf) {
  const s = requireAdmin(req, res);
  if (!s) return;
  const urlObj = new URL(req.url, 'http://localhost');
  const editingIdx = parseInt(urlObj.searchParams.get('edit')) || -1;
  let editError = '';
  if (editingIdx >= 0 && editingIdx >= (conf.routes || []).length) {
    editError = '路由索引无效';
  }
  res.end(
    renderDashboard(conf, editingIdx, editError, '')
  );
}

async function handleSettings(req, res) {
  const s = requireAdmin(req, res);
  if (!s) return;
  res.end(renderSettings());
}

async function handleLog(req, res) {
  const s = requireAdmin(req, res);
  if (!s) return;
  const logPath = require('path').join(__dirname, '..', 'data', 'audit.log');
  let entries = [];
  try {
    const fs = require('fs');
    const data = fs.readFileSync(logPath, 'utf8');
    entries = data
      .trim()
      .split('\n')
      .filter(Boolean)
      .reverse()
      .map((line) => {
        try {
          const j = JSON.parse(line);
          const t = new Date(j.t || Date.now());
          const timezone = loadConfig().timezone || 'Asia/Shanghai';
          const time = t.toLocaleString('zh-CN', { timeZone: timezone });
          return { time, action: j.a || '', detail: j.d || '' };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {}
  res.end(renderLog(entries));
}

async function handleAbout(req, res) {
  const s = requireAdmin(req, res);
  if (!s) return;
  const version = '1.0.4';
  res.end(renderAbout(version));
}

async function handleLogin(req, res) {
  if (req.method === 'GET') {
    const html = `<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>管理员登录 - LodgeManS</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f6fa;color:#2d3436;display:flex;min-height:100vh;align-items:center;justify-content:center}
.login-wrap{background:#fff;border-radius:8px;padding:30px;width:340px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.login-wrap h2{text-align:center;margin-bottom:20px;font-size:18px}
.field{margin-bottom:14px}.field label{display:block;font-size:12px;color:#636e72;margin-bottom:3px;font-weight:600}
.field input[type=text],.field input[type=password]{width:100%;padding:8px;border:1px solid #dfe6e9;border-radius:4px;font-size:13px}
.btn{width:100%;padding:8px;background:#0984e3;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:14px}.btn:hover{opacity:.85}.error{color:#d63031;font-size:13px;text-align:center;margin-bottom:10px}
.pwd-wrap{position:relative;display:flex;align-items:stretch}.pwd-wrap input{flex:1;padding-right:36px!important}
.pwd-toggle{position:absolute;right:0;top:0;bottom:0;width:32px;border:0;background:0 0;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:#636e72;font-size:16px}
.pwd-toggle:hover{color:#2d3436}
</style></head><body><div class="login-wrap"><h2>管理员登录</h2><div id="err" class="error"></div><div class="field"><label>用户名</label><input type="text" id="username" autocomplete="username"/></div><div class="field"><label>密码</label><div class="pwd-wrap"><input type="password" id="password" autocomplete="current-password"/><button class="pwd-toggle" tabindex="-1" onclick="togglePwd(this)" title="显示/隐藏">👁</button></div></div><button class="btn" onclick="login()">登录</button></div><script>
function togglePwd(btn){const inp=document.getElementById('password');if(inp.type==='password'){inp.type='text';btn.textContent='🙈'}else{inp.type='password';btn.textContent='👁'}}
function login(){const u=document.getElementById('username').value.trim();const p=document.getElementById('password').value;if(!u||!p)return document.getElementById('err').textContent='请输入用户名和密码';fetch('/_admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}).then(r=>r.json()).then(d=>{if(d.ok)location.href='/_admin/dashboard';else document.getElementById('err').textContent=d.error||'登录失败'}).catch(()=>document.getElementById('err').textContent='请求失败')}
</script></body></html>`;
    return res.end(html);
  }
  if (req.method !== 'POST') return rd(res, '/_admin/login');
  const body = await readBody(req);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(res, { ok: false, error: '无效的请求格式' });
  }
  const { username, password } = parsed;
  const conf = loadConfig();
  if (!conf.admin_username || !conf.admin_password) {
    return json(res, { ok: false, error: '管理员未初始化' });
  }
  if (username !== conf.admin_username) {
    return json(res, { ok: false, error: '用户名错误' });
  }
  const pwHash = hashPassword(password, conf.admin_password);
  if (pwHash !== conf.admin_password) {
    return json(res, { ok: false, error: '密码错误' });
  }
  const crypto = require('crypto');
  const sid = crypto.randomBytes(16).toString('hex');
  addAdminSession(sid, username);
  res.setHeader(
    'Set-Cookie',
    `admin_session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
  addAuditLog('admin_login', `管理员 ${username} 登录`);
  json(res, { ok: true });
}

async function handleChangePassword(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const conf = loadConfig();
  const body = await readBody(req);
  let parsed;
  try {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/json')) {
      parsed = JSON.parse(body);
    } else {
      parsed = Object.fromEntries(new URLSearchParams(body));
    }
  } catch {
    return json(res, { ok: false, error: '无效的请求格式' });
  }
  const { 'cur-pwd': curPwd, 'new-pwd': newPwd, 'confirm-pwd': confirmPwd } = parsed;
  if (!curPwd || !newPwd || !confirmPwd) {
    return json(res, { ok: false, error: '请填写所有字段' });
  }
  if (newPwd !== confirmPwd) {
    return json(res, { ok: false, error: '两次输入的新密码不一致' });
  }
  if (newPwd.length < 6) {
    return json(res, { ok: false, error: '密码长度至少 6 位' });
  }
  if (hashPassword(curPwd, conf.admin_password) !== conf.admin_password) {
    return json(res, { ok: false, error: '当前密码错误' });
  }
  const newHash = hashPassword(newPwd);
  conf.admin_password = newHash;
  const fs = require('fs');
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
  adminSessions.clear();
  addAuditLog('change_password', '管理员密码已修改');
  json(res, { ok: true });
}

async function handleChangeAccessPassword(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const conf = loadConfig();
  const body = await readBody(req);
  let parsed;
  try {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/json')) {
      parsed = JSON.parse(body);
    } else {
      parsed = Object.fromEntries(new URLSearchParams(body));
    }
  } catch {
    return json(res, { ok: false, error: '无效的请求格式' });
  }
  const { 'cur-admin-pwd': curAdminPwd, 'new-access-pwd': newAccessPwd, 'confirm-access-pwd': confirmAccessPwd } = parsed;
  if (!curAdminPwd || !newAccessPwd || !confirmAccessPwd) {
    return json(res, { ok: false, error: '请填写所有字段' });
  }
  if (newAccessPwd !== confirmAccessPwd) {
    return json(res, { ok: false, error: '两次输入的新密码不一致' });
  }
  if (newAccessPwd.length < 6) {
    return json(res, { ok: false, error: '密码长度至少 6 位' });
  }
  if (hashPassword(curAdminPwd, conf.admin_password) !== conf.admin_password) {
    return json(res, { ok: false, error: '当前管理密码错误' });
  }
  const newHash = hashPassword(newAccessPwd);
  conf.password = newHash;
  const fs = require('fs');
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
  addAuditLog('change_access_password', '访问密码已修改');
  json(res, { ok: true });
}

async function handleChangeAdmin(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const conf = loadConfig();
  const body = await readBody(req);
  let parsed;
  try {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/json')) {
      parsed = JSON.parse(body);
    } else {
      parsed = Object.fromEntries(new URLSearchParams(body));
    }
  } catch {
    return json(res, { ok: false, error: '无效的请求格式' });
  }
  const { 'cur-admin-pwd2': curPwd2, 'new-username': newUsername, 'new-admin-pwd': newAdminPwd } = parsed;
  if (!curPwd2 || !newUsername || !newAdminPwd) {
    return json(res, { ok: false, error: '请填写所有字段' });
  }
  if (newAdminPwd.length < 6) {
    return json(res, { ok: false, error: '密码长度至少 6 位' });
  }
  if (hashPassword(curPwd2, conf.admin_password) !== conf.admin_password) {
    return json(res, { ok: false, error: '当前管理密码错误' });
  }
  conf.admin_username = newUsername;
  conf.admin_password = hashPassword(newAdminPwd);
  const fs = require('fs');
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
  adminSessions.clear();
  addAuditLog('change_admin', `管理员账号已修改为 ${newUsername}`);
  json(res, { ok: true });
}

async function handleAddRoute(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const host = (params.get('host') || '').trim();
  const target = (params.get('target') || '').trim();
  if (!host) return json(res, { ok: false, error: '域名不能为空' });
  if (!target) return json(res, { ok: false, error: '目标地址不能为空' });
  const conf = loadConfig();
  if ((conf.routes || []).some((r) => r.host === host)) {
    return json(res, { ok: false, error: '该域名已存在' });
  }
  const scheme = params.get('scheme') || 'http';
  const auth = params.get('auth') !== '0';
  const description = (params.get('desc') || '').trim();
  if (!conf.routes) conf.routes = [];
  conf.routes.push({
    host,
    target: scheme + '://' + target,
    auth,
    description: description || undefined,
  });
  const fs = require('fs');
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
  addAuditLog('add_route', `添加路由 ${host} -> ${scheme}://${target}`);
  json(res, { ok: true });
}

async function handleEditRoute(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const idx = parseInt(params.get('idx'));
  const host = (params.get('host') || '').trim();
  const target = (params.get('target') || '').trim();
  if (!host) return json(res, { ok: false, error: '域名不能为空' });
  if (!target) return json(res, { ok: false, error: '目标地址不能为空' });
  const conf = loadConfig();
  const dupe = (conf.routes || []).findIndex(
    (r, i) => r.host === host && i !== idx
  );
  if (dupe >= 0) return json(res, { ok: false, error: '该域名已存在' });
  const scheme = params.get('scheme') || 'http';
  const auth = params.get('auth') !== '0';
  const description = (params.get('desc') || '').trim();
  if (conf.routes && conf.routes[idx]) {
    conf.routes[idx] = {
      host,
      target: scheme + '://' + target,
      auth,
      description: description || undefined,
    };
  }
  const fs = require('fs');
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
  addAuditLog('edit_route', `编辑路由 ${host} -> ${scheme}://${target}`);
  json(res, { ok: true });
}

async function handleDeleteRoute(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const idx = parseInt(params.get('idx'));
  const conf = loadConfig();
  if (conf.routes && conf.routes[idx]) {
    const removed = conf.routes.splice(idx, 1);
    const fs = require('fs');
    const yaml = require('js-yaml');
    fs.writeFileSync(
      configPath,
      yaml.dump(conf, { indent: 2, lineWidth: -1 })
    );
    addAuditLog(
      'delete_route',
      `删除路由 ${removed[0].host} -> ${removed[0].target}`
    );
  }
  json(res, { ok: true });
}

async function handleReloadConfig(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  try {
    loadConfig(true);
    addAuditLog('reload_config', '配置已重载');
    json(res, { ok: true });
  } catch (e) {
    json(res, { ok: false, error: '配置加载失败' });
  }
}

async function handleClearSessions(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const count = sessions.size;
  sessions.clear();
  saveSessions();
  addAuditLog('clear_sessions', `清空了 ${count} 个会话`);
  json(res, { ok: true });
}

async function handleKickSession(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const sid = params.get('sid') || '';
  const fullSid = [...sessions.keys()].find((k) =>
    sid.endsWith('...') ? k.endsWith(sid.slice(0, -3)) : k.endsWith(sid)
  );
  if (fullSid) {
    const session = sessions.get(fullSid);
    const label = session ? session.label || '' : '';
    addAuditLog(
      'kick_session',
      `踢出会话 ${fullSid.slice(0, 8)}... 标签: ${label.replace(/[\n\r]/g, '\\n')}`
    );
    sessions.delete(fullSid);
    saveSessions();
  }
  json(res, { ok: true });
}

async function handleUpdateSessionLabel(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const sid = params.get('sid') || '';
  const label = (params.get('label') || '').trim();
  const fullSid = [...sessions.keys()].find((k) =>
    sid.endsWith('...') ? k.endsWith(sid.slice(0, -3)) : k.endsWith(sid)
  );
  if (fullSid) {
    const session = sessions.get(fullSid);
    if (session) {
      session.label = label || undefined;
      saveSessions();
    }
  }
  json(res, { ok: true });
}

async function handleExport(req, res) {
  const s = requireAdmin(req, res);
  if (!s) return;
  const conf = loadConfig();
  const yaml = require('js-yaml');
  const yamlStr = yaml.dump(conf, { indent: 2, lineWidth: -1 });
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="routes.yaml"'
  );
  res.end(yamlStr);
}

async function handleImport(req, res) {
  const s = requireAdmin(req, res);
  if (!s) return;
  const busboy = require('busboy');
  try {
    const bb = busboy({ headers: req.headers, limits: { fileSize: 1048576, files: 1 } });
    let fileContent = '';
    let fileProcessed = false;
    await new Promise((resolve, reject) => {
      bb.on('file', (fieldname, file, info) => {
        file.on('data', (data) => {
          fileContent += data.toString();
        });
        file.on('limit', () => {
          reject(new Error('FILE_TOO_LARGE'));
        });
        file.on('end', () => {
          fileProcessed = true;
        });
      });
      bb.on('finish', () => {
        if (!fileProcessed) return reject(new Error('NO_FILE'));
        resolve();
      });
      bb.on('error', reject);
      req.pipe(bb);
    });
    const yaml = require('js-yaml');
    const imported = yaml.load(fileContent);
    if (!imported || typeof imported !== 'object') {
      return json(res, { ok: false, error: '无效的 YAML 文件' });
    }
    const conf = loadConfig();
    if (Array.isArray(imported.routes)) {
      if (!conf.routes) conf.routes = [];
      for (const r of imported.routes) {
        if (r.host && !conf.routes.some((x) => x.host === r.host)) {
          conf.routes.push(r);
        }
      }
    }
    ['password', 'admin_username', 'admin_password', 'timezone'].forEach(
      (k) => {
        if (imported[k] !== undefined) conf[k] = imported[k];
      }
    );
    const fs = require('fs');
    fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
    addAuditLog('import_config', '配置已导入');
    json(res, { ok: true });
  } catch (e) {
    if (e.message === 'FILE_TOO_LARGE') {
      return json(res, { ok: false, error: '文件过大' });
    }
    if (e.message === 'NO_FILE') {
      return json(res, { ok: false, error: '未选择文件' });
    }
    json(res, { ok: false, error: '导入失败: ' + e.message });
  }
}

async function handleSaveTimezone(req, res) {
  if (req.method !== 'POST') return rd(res, '/_admin');
  const s = requireAdmin(req, res);
  if (!s) return;
  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const timezone = params.get('timezone');
  if (!timezone) return json(res, { ok: false, error: '时区不能为空' });
  const conf = loadConfig();
  conf.timezone = timezone;
  const fs = require('fs');
  const yaml = require('js-yaml');
  fs.writeFileSync(configPath, yaml.dump(conf, { indent: 2, lineWidth: -1 }));
  addAuditLog('save_timezone', `时区已修改为 ${timezone}`);
  json(res, { ok: true });
}

module.exports = { routes, getAdminSession, renderDashboard, renderLog, renderSettings, renderAbout };

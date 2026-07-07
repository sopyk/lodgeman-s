const http = require('http');

const { loadConfig, matchRoute, isPathExempt, upgradePlaintextConfig } = require('./config.js');
const { handleAuth, getSession, parseCookies } = require('./auth.js');
const { handleAdmin } = require('./admin.js');
const { proxyRequest, proxyUpgrade } = require('./proxy.js');
const { audit } = require('./audit.js');

const config = loadConfig();
upgradePlaintextConfig(config);
const sessions = new Map();
const backend = { config, sessions };

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(id);
  }
}, 3600000);

function isJsonReq(req) {
  const accept = req.headers.accept || '';
  return accept.includes('json') || req.url.startsWith('/api/');
}

function respondJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const host = req.headers['host'] || '';

  if (req.url.startsWith('/_login')) {
    return handleAuth(req, res, backend);
  }

  if (req.url === '/_logout') {
    const session = getSession(req, sessions);
    if (session) { sessions.delete(session.id); audit('LOGOUT', '', req.socket.remoteAddress || ''); }
    res.writeHead(302, {
      'Location': '/_login?logged_out',
      'Set-Cookie': 'auth_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/',
    });
    res.end();
    return;
  }

  if (req.url.startsWith('/_admin')) {
    return handleAdmin(req, res, backend);
  }

  const route = matchRoute(config, host);
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  if (route.auth) {
    const pathname = req.url.split('?')[0];
    if (!isPathExempt(route, pathname)) {
      const session = getSession(req, sessions);
      if (!session) {
        if (isJsonReq(req)) {
          return respondJson(res, 401, { error: 'unauthorized' });
        }
        res.writeHead(302, { 'Location': '/_login' });
        res.end();
        return;
      }
    }
  }

  proxyRequest(req, res, route);
});

server.on('upgrade', (req, socket, head) => {
  const host = req.headers['host'] || '';
  const route = matchRoute(config, host);
  if (!route) { socket.destroy(); return; }

  if (route.auth) {
    const pathname = req.url.split('?')[0];
    if (!isPathExempt(route, pathname)) {
      const session = getSession(req, sessions);
      if (!session) { socket.destroy(); return; }
    }
  }

  proxyUpgrade(req, socket, head, route);
});

const PORT = config.port;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Unified Auth Proxy → http://127.0.0.1:${PORT}`);
  console.log(`Routes: ${config.routes.map(r => r.description || r.host).join(', ')}`);
  console.log(`Admin: ${config.admin_password ? 'enabled' : 'disabled'}`);
});

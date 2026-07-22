const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start a temporary HTTP server, resolve with { server, url } */
function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/** Start a temporary proxy server that delegates to proxyRequest */
function startProxy(proxyRequest, route) {
  return startServer((req, res) => proxyRequest(req, res, route));
}

/** HTTP GET helper – returns { statusCode, headers, body } */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { ...res.headers },
          body: Buffer.concat(chunks).toString(),
        });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Echo backend used by the "forwarding" and "cookie" tests
// ---------------------------------------------------------------------------

let echoServer;
let echoUrl;

before(async () => {
  const srv = await startServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Echo-Host': req.headers['host'] || '',
      'X-Echo-Cookie': req.headers['cookie'] || '',
    });
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      headers: req.headers,
    }));
  });
  echoServer = srv.server;
  echoUrl = srv.url;
});

after(() => {
  if (echoServer) echoServer.close();
});

// ---------------------------------------------------------------------------
// proxyRequest — forwarding, 502, cookie stripping
// ---------------------------------------------------------------------------

describe('proxy.js — proxyRequest', () => {
  let proxy;
  let proxyUrl;

  afterEach(() => {
    if (proxy) proxy.close();
  });

  it('forwards request to backend and returns response', async () => {
    const { proxyRequest } = require('../src/proxy.js');
    const route = { target: echoUrl, description: 'test-backend', auth: false };

    const p = await startProxy(proxyRequest, route);
    proxy = p.server;
    proxyUrl = p.url;

    // Send request with cookies via headers, not query string
    const options = new URL(`${proxyUrl}/test-path?q=1`);
    const res = await new Promise((resolve, reject) => {
      http.get({
        hostname: options.hostname,
        port: options.port,
        path: '/test-path?q=1',
        headers: {
          'host': 'example.com:4082',
          'user-agent': 'test-agent',
          'accept': '*/*',
          'cookie': 'other_cookie=val; auth_session=abc123',
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          headers: { ...res.headers },
          body: Buffer.concat(chunks).toString(),
        }));
        res.on('error', reject);
      }).on('error', reject);
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.method, 'GET');
    assert.equal(body.url, '/test-path?q=1');

    // Verify auth_session cookie was stripped from forwarded request
    const cookieHeader = body.headers.cookie || '';
    assert.equal(cookieHeader.includes('auth_session='), false,
      'auth_session cookie should be stripped');
    assert.equal(cookieHeader.includes('other_cookie=val'), true,
      'other cookies should be preserved');
  });

  it('returns 502 when backend is unreachable', async () => {
    const { proxyRequest } = require('../src/proxy.js');
    const route = { target: 'http://127.0.0.1:1', description: 'unreachable', auth: false };

    const p = await startProxy(proxyRequest, route);
    proxy = p.server;
    proxyUrl = p.url;

    // Proxy connection to port 1 will fail → 502
    const res = await httpGet(`${proxyUrl}/`);
    assert.equal(res.statusCode, 502);
    assert.ok(res.body.includes('Bad Gateway'));
  });

  it('does not send auth_session cookie', async () => {
    const { proxyRequest } = require('../src/proxy.js');
    const route = { target: echoUrl, description: 'test', auth: false };

    const p = await startProxy(proxyRequest, route);
    proxy = p.server;
    proxyUrl = p.url;

    // Note: cookies are set on the request TO the proxy — the proxy reads
    // req.headers.cookie and strips auth_session before forwarding.
    // We pass the cookie via the header option in http.get.
    const options = new URL(`${proxyUrl}/`);
    const get = new Promise((resolve, reject) => {
      http.get({
        hostname: options.hostname,
        port: options.port,
        path: '/',
        headers: {
          host: 'test.com',
          cookie: 'auth_session=secret123; other=keep',
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          body: Buffer.concat(chunks).toString(),
        }));
        res.on('error', reject);
      }).on('error', reject);
    });

    const result = await get;
    const body = JSON.parse(result.body);
    const cookie = body.headers.cookie || '';
    assert.equal(cookie.includes('auth_session='), false);
    assert.equal(cookie.includes('other=keep'), true);
  });
});

// ---------------------------------------------------------------------------
// proxyRequest — header sanitization
// ---------------------------------------------------------------------------

describe('proxy.js — proxyRequest header sanitization', () => {
  let backend;
  let proxy;
  let proxyUrl;

  afterEach(() => {
    if (proxy) proxy.close();
    if (backend) backend.close();
  });

  it('strips Connection and Keep-Alive from backend response and sets shouldKeepAlive=false', async () => {
    const { proxyRequest } = require('../src/proxy.js');

    // Backend that returns keep-alive related headers
    const b = await startServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=5',
      });
      res.end('ok');
    });
    backend = b.server;

    const p = await startProxy(proxyRequest, { target: b.url, auth: false });
    proxy = p.server;
    proxyUrl = p.url;

    const res = await httpGet(`${proxyUrl}/`);

    assert.equal(res.statusCode, 200);
    // Connection: close is injected by Node when shouldKeepAlive is false
    assert.equal(res.headers['connection'], 'close',
      'Connection must be "close" (shouldKeepAlive=false prevents keep-alive)');
    // Keep-Alive must be stripped from backend response
    assert.equal(res.headers['keep-alive'], undefined,
      'Keep-Alive header must be stripped');
    assert.equal(res.body, 'ok');
  });

  it('preserves business headers when stripping Connection/Keep-Alive', async () => {
    const { proxyRequest } = require('../src/proxy.js');

    const b = await startServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, private',
        'X-Custom': 'custom-value',
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=5',
      });
      res.end('{"ok":true}');
    });
    backend = b.server;

    const p = await startProxy(proxyRequest, { target: b.url, auth: false });
    proxy = p.server;
    proxyUrl = p.url;

    const res = await httpGet(`${proxyUrl}/`);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['connection'], 'close');
    assert.equal(res.headers['keep-alive'], undefined);

    // Business headers preserved
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['cache-control'], 'no-cache, private');
    assert.equal(res.headers['x-custom'], 'custom-value');

    assert.equal(res.body, '{"ok":true}');
  });

  it('handles case-insensitive header names (CONNECTION in uppercase from backend)', async () => {
    const { proxyRequest } = require('../src/proxy.js');

    // Raw TCP backend to send uppercase header names
    backend = await new Promise((resolve) => {
      const srv = net.createServer((conn) => {
        conn.once('data', () => {
          conn.write('HTTP/1.1 200 OK\r\n');
          conn.write('Content-Type: text/plain\r\n');
          conn.write('CONNECTION: keep-alive\r\n');
          conn.write('Keep-Alive: timeout=5\r\n');
          conn.write('Content-Length: 4\r\n');
          conn.write('\r\n');
          conn.write('body');
          conn.end();
        });
      });
      srv.listen(0, '127.0.0.1', () => resolve(srv));
    });

    const bUrl = `http://127.0.0.1:${backend.address().port}`;
    const p = await startProxy(proxyRequest, { target: bUrl, auth: false });
    proxy = p.server;
    proxyUrl = p.url;

    const res = await httpGet(`${proxyUrl}/`);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['connection'], 'close',
      'CONNECTION (uppercase from backend) must be stripped');
    assert.equal(res.headers['keep-alive'], undefined,
      'Keep-Alive must be stripped regardless of input case');
    assert.equal(res.headers['content-type'], 'text/plain');
    assert.equal(res.body, 'body');
  });
});

// ---------------------------------------------------------------------------
// proxyUpgrade — header sanitization in 101 Switching Protocols
// ---------------------------------------------------------------------------

describe('proxy.js — proxyUpgrade', () => {
  let upgradeBackend;
  let proxy;
  let proxyUrl;

  afterEach(() => {
    if (proxy) proxy.close();
    if (upgradeBackend) upgradeBackend.close();
  });

  it('strips Connection and Keep-Alive from 101 Switching Protocols response', async () => {
    const { proxyUpgrade } = require('../src/proxy.js');

    // Raw TCP backend that responds with 101 (WebSocket handshake)
    upgradeBackend = await new Promise((resolve) => {
      const srv = net.createServer((conn) => {
        conn.once('data', () => {
          conn.write('HTTP/1.1 101 Switching Protocols\r\n');
          conn.write('Upgrade: websocket\r\n');
          conn.write('Connection: Upgrade\r\n');
          conn.write('Keep-Alive: timeout=5\r\n');
          conn.write('Sec-WebSocket-Accept: abc123\r\n');
          conn.write('\r\n');
        });
      });
      srv.listen(0, '127.0.0.1', () => resolve(srv));
    });

    const bPort = upgradeBackend.address().port;

    // Create proxy server with upgrade handler
    proxy = await new Promise((resolve) => {
      const srv = http.createServer();
      srv.on('upgrade', (req, socket, head) => {
        proxyUpgrade(req, socket, head, {
          target: `http://127.0.0.1:${bPort}`,
          auth: false,
        });
      });
      srv.listen(0, '127.0.0.1', () => resolve(srv));
    });

    const pPort = proxy.address().port;

    // Client: connect to proxy and send upgrade request
    const response = await new Promise((resolve, reject) => {
      const client = net.connect(pPort, '127.0.0.1', () => {
        client.write('GET /ws HTTP/1.1\r\n');
        client.write('Host: test.com\r\n');
        client.write('Upgrade: websocket\r\n');
        client.write('Connection: Upgrade\r\n');
        client.write('\r\n');
      });

      let data = '';
      client.on('data', (chunk) => {
        data += chunk.toString();
        // Headers end with \r\n\r\n — once we have the full header block, resolve
        if (data.includes('\r\n\r\n')) {
          client.end();
          resolve(data);
        }
      });
      client.on('error', reject);
      // Safety timeout
      setTimeout(() => reject(new Error('timeout waiting for upgrade response')), 3000);
    });

    // Verify 101 response
    assert.ok(response.includes('101 Switching Protocols'),
      'must include 101 status line');
    // Node.js HTTP parser lowercases header names, so proxy writes them lowercase
    assert.ok(response.toLowerCase().includes('upgrade: websocket'),
      'must include Upgrade header');
    assert.ok(response.toLowerCase().includes('sec-websocket-accept: abc123'),
      'must include Sec-WebSocket-Accept header');

    // Connection header must be stripped (proxy skips it)
    assert.equal(response.includes('Connection:'), false,
      'Connection header must not appear in 101 response');

    // Keep-Alive must be stripped
    assert.equal(response.toLowerCase().includes('keep-alive'), false,
      'Keep-Alive header must not appear in 101 response');
  });
});

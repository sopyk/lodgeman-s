const http = require('http');
const { Transform } = require('stream');

const TIMEOUT = 10000;

function proxyRequest(req, res, route) {
  const url = new URL(route.target);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: { ...req.headers },
    timeout: TIMEOUT,
  };
  delete options.headers['host'];
  delete options.headers['connection'];
  if (options.headers['cookie']) {
    const cookies = options.headers['cookie'].split('; ').filter(c => !c.startsWith('auth_session='));
    if (cookies.length) options.headers['cookie'] = cookies.join('; ');
    else delete options.headers['cookie'];
  }

  const proxyReq = http.request(options, proxyRes => {
    // 清洗响应头，剔除 keep-alive 相关字段：
    // Node.js http.Server 默认附加 Connection: keep-alive + Keep-Alive: timeout=5，
    // 可能误导 Cloudflare edge 对 SSE 长连接应用连接级超时管理而中途取消流。
    // Caddy 反向代理会自动剥离这些头，所以直连路径不受影响。
    // 注意：仅从 proxyRes.headers 中 delete 不够——Node.js _storeHeader()
    // 在 res.shouldKeepAlive === true（HTTP/1.1 默认）时会重新注入这两个头，
    // 因此需同时设 shouldKeepAlive = false。
    const headers = {};
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'connection' || lower === 'keep-alive') continue;
      headers[key] = value;
    }
    res.shouldKeepAlive = false;
    res.writeHead(proxyRes.statusCode, headers);

    // SSE 心跳注入：对 text/event-stream 长连接，上游 20 秒无数据时
    // 门房自行写入注释行，防止 Cloudflare edge / 运营商 NAT 因空闲超时取消流。
    // 前端 EventSource 忽略以 ':' 开头的注释行，完全无感。
    // 使用 Transform 流注入（而非直接 res.write），避免与 pipe 竞争。
    const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('text/event-stream')) {
      let lastData = Date.now();

      const heartbeat = new Transform({
        transform(chunk, encoding, callback) {
          lastData = Date.now();
          callback(null, chunk);
        },
      });

      const cleanup = () => {
        clearInterval(keepaliveTimer);
        proxyRes.unpipe(heartbeat);
        heartbeat.destroy();
      };

      const keepaliveTimer = setInterval(() => {
        if (heartbeat.destroyed || res.destroyed) {
          clearInterval(keepaliveTimer);
          return;
        }
        if (Date.now() - lastData >= 20000) {
          heartbeat.push(':keepalive\n\n');
        }
      }, 10000);

      proxyRes.on('end', cleanup);
      proxyRes.on('error', cleanup);
      req.on('close', cleanup);

      proxyRes.pipe(heartbeat).pipe(res);
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('timeout', () => {
    // 不 destroy：SSE 长连接可能因 HTTP/2 流控短暂空闲
    // destroy 会切断 SSE 流，导致前端 60s 心跳超时后全页刷新
    console.warn(`[proxy] idle ${TIMEOUT}ms for ${req.url} (not destroying — SSE compatible)`);
  });
  proxyReq.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad Gateway: ${route.description || route.target}`);
    }
  });

  req.pipe(proxyReq);
}

function proxyUpgrade(req, socket, head, route) {
  const url = new URL(route.target);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: req.url,
    method: 'GET',
    headers: { ...req.headers },
    timeout: TIMEOUT,
  };
  delete options.headers['host'];
  delete options.headers['connection'];
  if (options.headers['cookie']) {
    const cookies = options.headers['cookie'].split('; ').filter(c => !c.startsWith('auth_session='));
    if (cookies.length) options.headers['cookie'] = cookies.join('; ');
    else delete options.headers['cookie'];
  }

  const proxyReq = http.request(options);
  proxyReq.on('upgrade', (proxyRes, proxySocket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n');
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'connection' || lower === 'keep-alive') continue;
      socket.write(key + ': ' + value + '\r\n');
    }
    socket.write('\r\n');
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
  proxyReq.on('timeout', () => proxyReq.destroy());
  proxyReq.on('error', () => { try { socket.destroy(); } catch {} });
  proxyReq.end();
}

module.exports = { proxyRequest, proxyUpgrade };

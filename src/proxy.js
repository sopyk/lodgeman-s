const http = require('http');

function proxyRequest(req, res, route) {
  const url = new URL(route.target);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: { ...req.headers },
  };
  delete options.headers['cookie'];

  const proxyReq = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, { ...proxyRes.headers });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error(`Proxy error [${route.description}]: ${err.message}`);
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
  };
  delete options.headers['cookie'];

  const proxyReq = http.request(options);
  proxyReq.on('upgrade', (proxyRes, proxySocket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n');
    socket.write('Upgrade: websocket\r\n');
    socket.write('Connection: Upgrade\r\n');
    const accept = proxyRes.headers['sec-websocket-accept'];
    if (accept) socket.write('Sec-WebSocket-Accept: ' + accept + '\r\n');
    const proto = proxyRes.headers['sec-websocket-protocol'];
    if (proto) socket.write('Sec-WebSocket-Protocol: ' + proto + '\r\n');
    socket.write('\r\n');
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
}

module.exports = { proxyRequest, proxyUpgrade };

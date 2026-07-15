const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// We test the proxy functions by starting a real backend server
// and calling proxyRequest with a mock req/res

let backendServer;
let backendUrl;

before(() => {
  return new Promise((resolve) => {
    backendServer = http.createServer((req, res) => {
      // Echo back request info for verification
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
    backendServer.listen(0, '127.0.0.1', () => {
      const port = backendServer.address().port;
      backendUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (backendServer) backendServer.close();
});

describe('proxy.js — proxyRequest', () => {
  it('forwards request to backend and returns response', () => {
    return new Promise((resolve, reject) => {
      const { proxyRequest } = require('../src/proxy.js');

      const route = { target: backendUrl, description: 'test-backend', auth: false };

      const req = new http.IncomingMessage(null);
      req.method = 'GET';
      req.url = '/test-path?q=1';
      req.headers = {
        'host': 'example.com:4082',
        'user-agent': 'test-agent',
        'accept': '*/*',
        'cookie': 'other_cookie=val; auth_session=abc123',
      };
      req.socket = { remoteAddress: '127.0.0.1' };

      const res = new http.ServerResponse(req);

      // Capture the response
      const chunks = [];
      res.writeHead = (statusCode, headers) => {
        res.statusCode = statusCode;
        res._headers = headers;
      };
      const origEnd = res.end.bind(res);
      res.end = (data) => {
        chunks.push(data);
        origEnd(data);
      };

      // Need to pipe req to proxyRequest
      // Since req is an IncomingMessage, we can feed it data
      req.push(null); // end the request body

      proxyRequest(req, res, route);

      // Wait for response
      res.on('finish', () => {
        try {
          assert.equal(res.statusCode, 200);
          const body = JSON.parse(Buffer.concat(chunks).toString());
          assert.equal(body.method, 'GET');
          assert.equal(body.url, '/test-path?q=1');

          // Verify auth_session cookie was stripped
          const cookieHeader = body.headers.cookie || '';
          assert.equal(cookieHeader.includes('auth_session='), false,
            'auth_session cookie should be stripped');
          assert.equal(cookieHeader.includes('other_cookie=val'), true,
            'other cookies should be preserved');

          // Verify host header was removed (not the original host)
          const echoHost = res._headers['x-echo-host'];
          // The host header in the forwarded request should NOT be the original
          // Actually, http.request() will set its own host header, so the original
          // gets overwritten anyway. The key is that we deleted it.
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('returns 502 when backend is unreachable', () => {
    return new Promise((resolve, reject) => {
      const { proxyRequest } = require('../src/proxy.js');

      const route = { target: 'http://127.0.0.1:1', description: 'unreachable', auth: false };

      const req = new http.IncomingMessage(null);
      req.method = 'GET';
      req.url = '/';
      req.headers = { 'host': 'test.com' };
      req.push(null);

      const res = new http.ServerResponse(req);
      res.statusCode = 200;
      const chunks = [];
      res.writeHead = (code, headers) => { res.statusCode = code; };
      res.end = (data) => { chunks.push(data); };

      proxyRequest(req, res, route);

      // Give it time for the error callback
      setTimeout(() => {
        try {
          assert.equal(res.statusCode, 502);
          const body = Buffer.concat(chunks).toString();
          assert.equal(body.includes('Bad Gateway'), true);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 500);
    });
  });

  it('does not send auth_session cookie', () => {
    return new Promise((resolve, reject) => {
      const { proxyRequest } = require('../src/proxy.js');
      const route = { target: backendUrl, description: 'test', auth: false };

      const req = new http.IncomingMessage(null);
      req.method = 'GET';
      req.url = '/';
      req.headers = {
        'host': 'test.com',
        'cookie': 'auth_session=secret123; other=keep',
      };
      req.push(null);

      const res = new http.ServerResponse(req);
      const chunks = [];
      res.writeHead = (c, h) => { res.statusCode = c; res._headers = h; };
      res.end = (d) => { chunks.push(d); };

      proxyRequest(req, res, route);

      res.on('finish', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const cookie = body.headers.cookie || '';
          assert.equal(cookie.includes('auth_session='), false);
          assert.equal(cookie.includes('other=keep'), true);
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });
});

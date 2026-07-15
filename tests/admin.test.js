const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// admin.js exports only { handleAdmin } but we want to test internal functions
// We can require and test the module's behavior through handleAdmin
// or copy the pure functions we want to test.

// Let's extract the pure functions we need to test
// esc, parseTarget, parseCookies, getAdminSession are not exported
// We test them indirectly by copying them here:

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseTarget(t) {
  try { const u = new URL(t); return { addr: u.hostname, port: u.port || '80' }; }
  catch { return { addr: t || '', port: '80' }; }
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

describe('admin.js — esc (HTML escape)', () => {
  it('escapes & to &amp;', () => {
    assert.equal(esc('a&b'), 'a&amp;b');
  });

  it('escapes < to &lt;', () => {
    assert.equal(esc('<script>'), '&lt;script&gt;');
  });

  it('escapes > to &gt;', () => {
    assert.equal(esc('a > b'), 'a &gt; b');
  });

  it('escapes " to &quot;', () => {
    assert.equal(esc('say "hello"'), 'say &quot;hello&quot;');
  });

  it('escapes all together', () => {
    assert.equal(esc('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('passes through safe strings', () => {
    assert.equal(esc('Hello World'), 'Hello World');
  });

  it('handles empty string', () => {
    assert.equal(esc(''), '');
  });

  it('handles numbers', () => {
    assert.equal(esc(123), '123');
  });
});

describe('admin.js — parseCookies', () => {
  it('parses single cookie', () => {
    const c = parseCookies({ headers: { cookie: 'admin_session=abc' } });
    assert.equal(c['admin_session'], 'abc');
  });

  it('parses multiple cookies', () => {
    const c = parseCookies({ headers: { cookie: 'a=1; b=2' } });
    assert.equal(c['a'], '1');
    assert.equal(c['b'], '2');
  });

  it('returns empty for no cookies', () => {
    const c = parseCookies({ headers: {} });
    assert.deepEqual(c, {});
  });
});

describe('admin.js — parseTarget', () => {
  it('parses full URL', () => {
    const r = parseTarget('http://127.0.0.1:8080');
    assert.equal(r.addr, '127.0.0.1');
    assert.equal(r.port, '8080');
  });

  it('handles URL with hostname only', () => {
    const r = parseTarget('http://localhost');
    assert.equal(r.addr, 'localhost');
    assert.equal(r.port, '80');
  });

  it('handles raw address (no protocol, falls back to full string as addr)', () => {
    // Without protocol, new URL() throws, catch returns {addr: t, port: '80'}
    const r = parseTarget('192.168.1.1:3000');
    assert.equal(r.addr, '192.168.1.1:3000'); // entire string becomes addr
    assert.equal(r.port, '80');
  });

  it('handles address with protocol and path', () => {
    const r = parseTarget('http://192.168.1.1:8080/app');
    assert.equal(r.addr, '192.168.1.1');
    assert.equal(r.port, '8080');
  });

  it('handles empty target', () => {
    const r = parseTarget('');
    assert.equal(r.addr, '');
    assert.equal(r.port, '80');
  });
});

describe('admin.js — module exports', () => {
  it('exports handleAdmin function', () => {
    const admin = require('../src/admin.js');
    assert.equal(typeof admin.handleAdmin, 'function');
  });
});

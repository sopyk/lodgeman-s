const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { parseCookies, getSession } = require('../src/auth.js');

function makeReq(cookieHeader) {
  return {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    socket: { remoteAddress: '127.0.0.1' },
  };
}

describe('auth.js — parseCookies', () => {
  it('parses a single cookie', () => {
    const c = parseCookies(makeReq('auth_session=abc123'));
    assert.equal(c['auth_session'], 'abc123');
  });

  it('parses multiple cookies', () => {
    const c = parseCookies(makeReq('auth_session=abc123; other=def456'));
    assert.equal(c['auth_session'], 'abc123');
    assert.equal(c['other'], 'def456');
  });

  it('handles cookies with special characters', () => {
    const c = parseCookies(makeReq('key=value%20with%20spaces'));
    assert.equal(c['key'], 'value%20with%20spaces');
  });

  it('handles cookies with = in value', () => {
    const c = parseCookies(makeReq('key=base64==value=='));
    assert.equal(c['key'], 'base64==value==');
  });

  it('returns empty object for no cookies', () => {
    const c = parseCookies(makeReq(null));
    assert.deepEqual(c, {});
  });

  it('returns empty object for empty cookie header', () => {
    const c = parseCookies(makeReq(''));
    assert.deepEqual(c, {});
  });

  it('handles malformed cookie with only key', () => {
    const c = parseCookies(makeReq('justkey'));
    assert.equal(c['justkey'], '');
  });

  it('handles cookie with leading spaces', () => {
    const c = parseCookies(makeReq('  key=val'));
    assert.equal(c['key'], 'val');
  });
});

describe('auth.js — getSession', () => {
  const validSession = {
    username: 'user',
    createdAt: Date.now() - 1000,
    expiresAt: Date.now() + 3600000,
    userAgent: 'test-agent',
    ip: '127.0.0.1',
    host: 'example.com',
    label: 'test-session',
    duration: 3600,
  };

  const expiredSession = {
    ...validSession,
    expiresAt: Date.now() - 1000,
  };

  it('returns session for valid session ID', () => {
    const sessions = new Map();
    sessions.set('abc123', { ...validSession });

    const req = makeReq('auth_session=abc123');
    const s = getSession(req, sessions);
    assert.notEqual(s, null);
    assert.equal(s.id, 'abc123');
    assert.equal(s.username, 'user');
  });

  it('returns null for missing cookie', () => {
    const sessions = new Map();
    const s = getSession(makeReq(null), sessions);
    assert.equal(s, null);
  });

  it('returns null for non-existent session ID', () => {
    const sessions = new Map();
    const s = getSession(makeReq('auth_session=nonexistent'), sessions);
    assert.equal(s, null);
  });

  it('returns null for expired session', () => {
    const sessions = new Map();
    sessions.set('expired1', { ...expiredSession });

    const req = makeReq('auth_session=expired1');
    const s = getSession(req, sessions);
    assert.equal(s, null);
  });

  it('deletes expired session from map', () => {
    const sessions = new Map();
    sessions.set('expired2', { ...expiredSession });
    assert.equal(sessions.has('expired2'), true);

    getSession(makeReq('auth_session=expired2'), sessions);
    assert.equal(sessions.has('expired2'), false);
  });

  it('returns session with id spread into object', () => {
    const sessions = new Map();
    sessions.set('sess123', { ...validSession });

    const s = getSession(makeReq('auth_session=sess123'), sessions);
    assert.equal(s.id, 'sess123');
    assert.equal(s.duration, 3600);
  });
});

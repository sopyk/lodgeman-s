const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// We need to test the config module functions directly
// Since config.js uses `require('js-yaml')` and reads from a hardcoded path,
// we need to mock the module loading by testing the exported pure functions

const configModule = require('../src/config.js');

describe('config.js — verifyPassword', () => {
  it('matches plaintext password', () => {
    assert.equal(configModule.verifyPassword('hello', 'hello'), true);
  });

  it('rejects wrong plaintext password', () => {
    assert.equal(configModule.verifyPassword('hello', 'world'), false);
  });

  it('matches scrypt hash password', () => {
    const hash = configModule.hashPassword('test123');
    assert.equal(configModule.verifyPassword('test123', hash), true);
  });

  it('rejects wrong password for scrypt hash', () => {
    const hash = configModule.hashPassword('test123');
    assert.equal(configModule.verifyPassword('wrong', hash), false);
  });

  it('rejects empty password when stored is scrypt', () => {
    const hash = configModule.hashPassword('test123');
    assert.equal(configModule.verifyPassword('', hash), false);
  });

  it('handles malformed scrypt hash prefix', () => {
    assert.equal(configModule.verifyPassword('x', 'scrypt:invalidsalt'), false);
  });

  it('handles empty stored password', () => {
    assert.equal(configModule.verifyPassword('', ''), true);
  });
});

describe('config.js — isHashed', () => {
  it('detects scrypt prefix', () => {
    assert.equal(configModule.isHashed('scrypt:abc123:def456'), true);
  });

  it('returns false for plaintext', () => {
    assert.equal(configModule.isHashed('plaintext'), false);
  });

  it('returns falsy (null/undefined) for null/undefined input', () => {
    assert.equal(configModule.isHashed(null), null);
    assert.equal(configModule.isHashed(undefined), undefined);
  });
});

describe('config.js — matchRoute', () => {
  const config = {
    routes: [
      { host: 'example.com', target: 'http://127.0.0.1:8080', auth: true, auth_exempt: [], description: 'Test' },
      { host: 'svc.test', target: 'http://127.0.0.1:9090', auth: false, auth_exempt: [], description: '' },
    ],
  };

  it('matches exact host', () => {
    const r = configModule.matchRoute(config, 'example.com');
    assert.equal(r?.host, 'example.com');
  });

  it('matches case-insensitive', () => {
    const r = configModule.matchRoute(config, 'EXAMPLE.COM');
    assert.equal(r?.host, 'example.com');
  });

  it('strips port from host header', () => {
    const r = configModule.matchRoute(config, 'example.com:4082');
    assert.equal(r?.host, 'example.com');
  });

  it('returns null for non-matching host', () => {
    const r = configModule.matchRoute(config, 'nonexistent.com');
    assert.equal(r, null);
  });

  it('returns null for empty host', () => {
    const r = configModule.matchRoute(config, '');
    assert.equal(r, null);
  });

  it('returns null for null host', () => {
    const r = configModule.matchRoute(config, null);
    assert.equal(r, null);
  });

  it('matches second route if first does not match', () => {
    const r = configModule.matchRoute(config, 'svc.test');
    assert.equal(r?.host, 'svc.test');
  });

  it('handles host with trailing dot', () => {
    const r = configModule.matchRoute(config, 'example.com.');
    assert.equal(r, null);
  });
});

describe('config.js — isPathExempt', () => {
  it('returns true for wildcard "*"', () => {
    const route = { auth_exempt: ['*'] };
    assert.equal(configModule.isPathExempt(route, '/anything'), true);
  });

  it('returns true for "/*"', () => {
    const route = { auth_exempt: ['/*'] };
    assert.equal(configModule.isPathExempt(route, '/any/path'), true);
  });

  it('returns true for prefix wildcard match', () => {
    const route = { auth_exempt: ['/api/*'] };
    assert.equal(configModule.isPathExempt(route, '/api/v1/users'), true);
  });

  it('returns false for non-matching prefix', () => {
    const route = { auth_exempt: ['/api/*'] };
    assert.equal(configModule.isPathExempt(route, '/admin'), false);
  });

  it('returns true for exact path match', () => {
    const route = { auth_exempt: ['/health'] };
    assert.equal(configModule.isPathExempt(route, '/health'), true);
  });

  it('returns false for exact path mismatch', () => {
    const route = { auth_exempt: ['/health'] };
    assert.equal(configModule.isPathExempt(route, '/health/check'), false);
  });

  it('returns false for empty exempt list', () => {
    const route = { auth_exempt: [] };
    assert.equal(configModule.isPathExempt(route, '/anything'), false);
  });

  it('matches /api/ prefix but not /api exact path', () => {
    // /api/* matches /api/v1 but NOT /api (because /api is not a prefix of /api/*)
    // Actually /api/*.slice(0, -1) = /api/ and /api.startsWith(/api/) is false
    const route = { auth_exempt: ['/api/*'] };
    assert.equal(configModule.isPathExempt(route, '/api'), false);
  });

  it('/api/* matches /api/ (the directory root)', () => {
    const route = { auth_exempt: ['/api/*'] };
    assert.equal(configModule.isPathExempt(route, '/api/'), true);
  });
});

describe('config.js — hashPassword', () => {
  it('returns a string starting with scrypt:', () => {
    const hash = configModule.hashPassword('mypassword');
    assert.equal(hash.startsWith('scrypt:'), true);
  });

  it('produces different hashes for same password (different salt)', () => {
    const h1 = configModule.hashPassword('test');
    const h2 = configModule.hashPassword('test');
    assert.notEqual(h1, h2);
  });

  it('produces hash with format scrypt:salt:hash', () => {
    const hash = configModule.hashPassword('test');
    const parts = hash.slice('scrypt:'.length).split(':');
    assert.equal(parts.length, 2);
    assert.equal(parts[0].length, 32); // 16 bytes hex = 32 chars
    assert.equal(parts[1].length, 64); // 32 bytes hex = 64 chars
  });
});

describe('config.js — isJsonReq (via server.js)', () => {
  // isJsonReq is defined in server.js but not exported
  // We test it indirectly via integration
  it('config module exports all expected functions', () => {
    const expected = ['loadConfig', 'matchRoute', 'isPathExempt', 'saveConfig', 'hashPassword', 'verifyPassword', 'isHashed', 'upgradePlaintextConfig'];
    for (const fn of expected) {
      assert.equal(typeof configModule[fn], 'function', `${fn} should be exported`);
    }
  });
});

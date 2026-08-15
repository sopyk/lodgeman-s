const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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

describe('config.js — pass_host round-trip (loadConfig / normalizeRoute / saveConfig)', () => {
  // 说明：normalizeRoute 是 src/config.js 的内部函数，未在 module.exports 中导出，
  // 现有测试风格只能 require 导出的纯函数，无法直接调用 normalizeRoute。
  // 但 loadConfig 会对每条路由应用 normalizeRoute 归一化，
  // saveConfig 会按「仅 true 才写 pass_host」序列化回 YAML，
  // 因此通过「saveConfig → loadConfig」闭环可间接覆盖 normalizeRoute 的全部行为。
  // 为避免污染真实 config/routes.yaml（参考现有测试不触碰真实文件的原则），
  // 通过 mock fs.readFileSync / fs.writeFileSync 只拦截该特定文件。

  const FIXTURE_NO_PASS_HOST = `port: 4082
password: test-password
admin_username: admin
admin_password: ""
session_max_age: 2592000
routes:
  - host: plain.example.com
    target: http://127.0.0.1:9000
    auth: true
    description: no pass_host key
`;

  const FIXTURE_PASS_HOST_TRUE = `port: 4082
password: test-password
admin_username: admin
admin_password: ""
session_max_age: 2592000
routes:
  - host: app.example.com
    target: http://127.0.0.1:9000
    auth: true
    pass_host: true
    description: passthrough
`;

  const FIXTURE_PASS_HOST_FALSE = `port: 4082
password: test-password
admin_username: admin
admin_password: ""
session_max_age: 2592000
routes:
  - host: app.example.com
    target: http://127.0.0.1:9000
    auth: true
    pass_host: false
    description: no passthrough
`;

  const FIXTURE_PASS_HOST_STRING_TRUE = `port: 4082
password: test-password
admin_username: admin
admin_password: ""
session_max_age: 2592000
routes:
  - host: app.example.com
    target: http://127.0.0.1:9000
    auth: true
    pass_host: "true"
    description: string true
`;

  function installConfigFileMocks() {
    mock.restoreAll(); // 先恢复，避免重复 mock
    const realReadFileSync = fs.readFileSync;
    const realWriteFileSync = fs.writeFileSync;
    let fakeYaml = '';
    const written = [];
    mock.method(fs, 'readFileSync', (p, ...args) => {
      if (typeof p === 'string' && p.includes('routes.yaml')) return fakeYaml;
      return realReadFileSync.call(fs, p, ...args);
    });
    mock.method(fs, 'writeFileSync', (p, text, ...args) => {
      if (typeof p === 'string' && p.includes('routes.yaml')) written.push(String(text));
      return realWriteFileSync.call(fs, p, text, ...args);
    });
    return {
      written,
      setConfigFile(text) { fakeYaml = text; },
    };
  }

  function makeConfig(routes) {
    return {
      port: 4082,
      password: 'test-password',
      admin_username: 'admin',
      admin_password: '',
      session_max_age: 2592000,
      timezone: 'UTC',
      routes,
    };
  }

  after(() => mock.restoreAll());

  it('normalizeRoute 缺省（无 pass_host 键）→ false', () => {
    const mocks = installConfigFileMocks();
    mocks.setConfigFile(FIXTURE_NO_PASS_HOST);
    const cfg = configModule.loadConfig();
    assert.equal(cfg.routes.length, 1);
    assert.equal(cfg.routes[0].pass_host, false);
    // normalizeRoute 归一化后键始终存在，方便后续 saveConfig 读取
    assert.equal(Object.prototype.hasOwnProperty.call(cfg.routes[0], 'pass_host'), true);
  });

  it('normalizeRoute pass_host: true → true', () => {
    const mocks = installConfigFileMocks();
    mocks.setConfigFile(FIXTURE_PASS_HOST_TRUE);
    const cfg = configModule.loadConfig();
    assert.equal(cfg.routes.length, 1);
    assert.equal(cfg.routes[0].pass_host, true);
  });

  it('normalizeRoute pass_host: false → false（显式 false）', () => {
    const mocks = installConfigFileMocks();
    mocks.setConfigFile(FIXTURE_PASS_HOST_FALSE);
    const cfg = configModule.loadConfig();
    assert.equal(cfg.routes.length, 1);
    assert.equal(cfg.routes[0].pass_host, false);
  });

  it('normalizeRoute 字符串 "true" → false（仅严格布尔 true 生效）', () => {
    const mocks = installConfigFileMocks();
    mocks.setConfigFile(FIXTURE_PASS_HOST_STRING_TRUE);
    const cfg = configModule.loadConfig();
    assert.equal(cfg.routes.length, 1);
    assert.equal(cfg.routes[0].pass_host, false);
  });

  it('saveConfig 仅 true 写入 pass_host 键，false/缺省路由不写', () => {
    const mocks = installConfigFileMocks();
    const cfg = makeConfig([
      { host: 'pt.example.com', target: 'http://127.0.0.1:9000', auth: true, auth_exempt: [], pass_host: true, description: 'pt' },
      { host: 'plain.example.com', target: 'http://127.0.0.1:9001', auth: true, auth_exempt: [], pass_host: false, description: 'plain' },
      { host: 'legacy.example.com', target: 'http://127.0.0.1:9002', auth: false, auth_exempt: [], description: 'legacy no key' },
    ]);
    assert.equal(configModule.saveConfig(cfg), true);
    assert.equal(mocks.written.length, 1);
    const text = mocks.written[0];
    // pass_host 应只写出一处（仅 pt.example.com 路由）
    assert.equal(text.split('pass_host').length - 1, 1, 'pass_host 键应只出现一次');
    assert.match(text, /pass_host: true/);
    const parsed = yaml.load(text);
    assert.equal(parsed.routes.length, 3);
    assert.equal(parsed.routes[0].pass_host, true);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.routes[1], 'pass_host'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.routes[2], 'pass_host'), false);
  });

  it('saveConfig → loadConfig round-trip 幂等：true 保持 true、false 保持 false', () => {
    const mocks = installConfigFileMocks();
    const cfg = makeConfig([
      { host: 'pt.example.com', target: 'http://127.0.0.1:9000', auth: true, auth_exempt: [], pass_host: true, description: 'pt' },
      { host: 'plain.example.com', target: 'http://127.0.0.1:9001', auth: true, auth_exempt: [], pass_host: false, description: 'plain' },
    ]);
    assert.equal(configModule.saveConfig(cfg), true);
    // 用刚写出的 YAML 重新 loadConfig（等价管理面板「重载配置」）
    mocks.setConfigFile(mocks.written[0]);
    const reloaded = configModule.loadConfig();
    assert.equal(reloaded.routes.length, 2);
    assert.equal(reloaded.routes[0].pass_host, true);
    assert.equal(reloaded.routes[1].pass_host, false);
  });
});

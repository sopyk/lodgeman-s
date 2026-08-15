// E2E 配置（针对管理面板 UI 冒烟）。
// 复用本机已安装的 playwright（node_modules/playwright + 全局 CLI），
// 浏览器内核已缓存于 ~/.cache/ms-playwright，无需重新下载。
//
// 隔离原则：每次运行在本文件加载时重新生成一份**独立**的
// tests/e2e/.tmp/routes.e2e.yaml（端口 4090、独立账号、已哈希密码），
// 通过 LODGEMAN_CONFIG 注入子进程 —— 绝不触碰真实 config/routes.yaml。
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { hashPassword } = require('./src/config.js');

const PORT = 4090;
const fixtureDir = path.join(__dirname, 'tests', 'e2e', '.tmp');
fs.mkdirSync(fixtureDir, { recursive: true });
const configPath = path.join(fixtureDir, 'routes.e2e.yaml');
const dataDir = path.join(fixtureDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(configPath, yaml.dump({
  port: PORT,
  password: hashPassword('e2e-user-pass'),      // 用户端统一密码（本组用例暂未使用）
  session_max_age: 86400,
  admin_username: 'e2eadmin',
  admin_password: hashPassword('e2e-admin-pass'),
  timezone: 'Asia/Shanghai',
  routes: [
    { host: 'e2e-seed.example', target: 'http://127.0.0.1:9', auth: true, description: 'e2e seed' },
  ],
}, { indent: 2, lineWidth: -1 }), 'utf8');

module.exports = {
  testDir: './tests/e2e',
  workers: 1,            // 用例共享同一份临时配置，串行执行以保证确定性
  fullyParallel: false,
  timeout: 20000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    locale: 'zh-CN',
  },
  webServer: {
    command: 'node src/server.js',
    env: { ...process.env, LODGEMAN_CONFIG: configPath, LODGEMAN_DATA: dataDir },
    port: PORT,
    reuseExistingServer: false,   // 每次运行拉起全新实例，避免复用旧配置
    timeout: 30000,
  },
};
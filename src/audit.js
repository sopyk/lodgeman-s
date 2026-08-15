const fs = require('fs');
const path = require('path');

// 数据目录可通过 LODGEMAN_DATA 覆盖（E2E 隔离用），默认仓库 data/。
const LOG_PATH = process.env.LODGEMAN_DATA
  ? path.join(process.env.LODGEMAN_DATA, 'audit.log')
  : path.join(__dirname, '..', 'data', 'audit.log');

function audit(event, detail, ip) {
  const line = `[${new Date().toISOString()}] ${event} ip=${ip} ${detail}\n`;
  fs.appendFile(LOG_PATH, line, 'utf8', err => {
    if (err) console.error('Audit write failed:', err.message);
  });
}

module.exports = { audit };

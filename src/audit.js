const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'data', 'audit.log');

function audit(event, detail, ip) {
  const line = `[${new Date().toISOString()}] ${event} ip=${ip} ${detail}\n`;
  fs.appendFile(LOG_PATH, line, 'utf8', err => {
    if (err) console.error('Audit write failed:', err.message);
  });
}

module.exports = { audit };

const fs = require('fs');
const path = require('path');

// 数据目录可通过 LODGEMAN_DATA 覆盖（E2E 隔离用），默认仓库 data/。
const SESSION_PATH = process.env.LODGEMAN_DATA
  ? path.join(process.env.LODGEMAN_DATA, 'sessions.json')
  : path.join(__dirname, '..', 'data', 'sessions.json');

function loadSessions() {
  try {
    const raw = fs.readFileSync(SESSION_PATH, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Map();
    return new Map(arr.map(item => [item.id, { ...item }]));
  } catch {
    return new Map();
  }
}

function saveSessions(sessions) {
  try {
    const arr = [...sessions.entries()].map(([id, s]) => ({ id, ...s }));
    fs.writeFileSync(SESSION_PATH, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Session save failed:', err.message);
    return false;
  }
}

module.exports = { loadSessions, saveSessions };

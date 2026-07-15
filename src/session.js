const fs = require('fs');
const path = require('path');

const SESSION_PATH = path.join(__dirname, '..', 'data', 'sessions.json');

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

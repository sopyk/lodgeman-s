const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'routes.yaml');

const DEFAULTS = {
  port: 4082,
  password: 'changeme',
  admin_username: 'admin',
  admin_password: '',
  session_max_age: 2592000,
  routes: [],
};

const HASH_PREFIX = 'scrypt:';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${HASH_PREFIX}${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (stored.startsWith(HASH_PREFIX)) {
    const parts = stored.slice(HASH_PREFIX.length).split(':');
    if (parts.length !== 2) return false;
    const salt = parts[0];
    const hash = parts[1];
    const computed = crypto.scryptSync(password, salt, 32).toString('hex');
    return computed === hash;
  }
  return password === stored;
}

function isHashed(val) {
  return val && val.startsWith(HASH_PREFIX);
}

function loadConfig() {
  try {
    const yaml = require('js-yaml');
    const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') throw new Error('empty config');
    return {
      port: raw.port || DEFAULTS.port,
      password: raw.password ?? DEFAULTS.password,
      admin_username: raw.admin_username || DEFAULTS.admin_username,
      admin_password: raw.admin_password ?? DEFAULTS.admin_password,
      session_max_age: raw.session_max_age || DEFAULTS.session_max_age,
      routes: Array.isArray(raw.routes) ? raw.routes.map(normalizeRoute) : [],
    };
  } catch (err) {
    console.error('Config load failed, using defaults:', err.message);
    return { ...DEFAULTS };
  }
}

function upgradePlaintextConfig(config) {
  let changed = false;
  if (config.password && !isHashed(config.password)) {
    config.password = hashPassword(config.password);
    changed = true;
  }
  if (config.admin_password && !isHashed(config.admin_password)) {
    config.admin_password = hashPassword(config.admin_password);
    changed = true;
  }
  if (changed) saveConfig(config);
}

function normalizeRoute(r) {
  return {
    host: r.host || '',
    target: r.target || '',
    auth: r.auth !== false,
    auth_exempt: Array.isArray(r.auth_exempt) ? r.auth_exempt : [],
    description: r.description || '',
  };
}

function matchRoute(config, host) {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();
  for (const route of config.routes) {
    if (route.host.toLowerCase() === hostname) return route;
  }
  return null;
}

function isPathExempt(route, pathname) {
  for (const pattern of route.auth_exempt) {
    if (matchPattern(pattern, pathname)) return true;
  }
  return false;
}

function matchPattern(pattern, pathname) {
  if (pattern === '*' || pattern === '/*') return true;
  if (pattern.endsWith('/*')) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  return pattern === pathname;
}

function saveConfig(config) {
  try {
    const yaml = require('js-yaml');
    const doc = {
      port: config.port,
      password: config.password,
      admin_username: config.admin_username,
      admin_password: config.admin_password,
      session_max_age: config.session_max_age,
      routes: config.routes.map(r => ({
        host: r.host,
        target: r.target,
        auth: r.auth,
        auth_exempt: r.auth_exempt.length > 0 ? r.auth_exempt : undefined,
        description: r.description,
      })),
    };
    fs.writeFileSync(CONFIG_PATH, yaml.dump(doc, { indent: 2, lineWidth: -1 }), 'utf8');
    return true;
  } catch (err) {
    console.error('Config save failed:', err.message);
    return false;
  }
}

module.exports = {
  loadConfig, matchRoute, isPathExempt, saveConfig,
  hashPassword, verifyPassword, isHashed, upgradePlaintextConfig,
};

#!/usr/bin/env node
const { hashPassword } = require('../src/config.js');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js <password>');
  console.error('Generates a scrypt hash for use in routes.yaml');
  process.exit(1);
}

console.log(hashPassword(password));

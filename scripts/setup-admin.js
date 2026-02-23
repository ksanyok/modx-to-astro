#!/usr/bin/env node
/**
 * setup-admin.js — generate a random admin password and store in .env
 * Run: node scripts/setup-admin.js
 *
 * Writes to .env at workspace root:
 *   ADMIN_PASSWORD=<plaintext — shown once, for the client>
 *   ADMIN_PASSWORD_HASH=<sha256 — baked into Astro build>
 *   ADMIN_REBUILD_WEBHOOK=   ← fill in manually if needed
 *
 * After running this, rebuild and redeploy the Astro site.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

// Generate a 16-char URL-safe random password
const password = crypto.randomBytes(12).toString('base64url');
const hash = crypto.createHash('sha256').update(password).digest('hex');

// Read existing .env (best-effort)
let env = '';
try {
  env = fs.readFileSync(envPath, 'utf-8');
} catch {
  // No .env yet — OK
}

// Remove old ADMIN_ lines
const cleaned = env
  .split('\n')
  .filter(l => !l.startsWith('ADMIN_PASSWORD') && !l.startsWith('ADMIN_REBUILD_WEBHOOK'))
  .join('\n')
  .trim();

const newEnv = [
  cleaned,
  '',
  '# ── Admin panel ──────────────────────────────────────────────────',
  `ADMIN_PASSWORD=${password}`,
  `ADMIN_PASSWORD_HASH=${hash}`,
  'ADMIN_REBUILD_WEBHOOK=',
  '',
].join('\n');

fs.writeFileSync(envPath, newEnv);

console.log('');
console.log('✓ Admin credentials written to .env');
console.log('');
console.log('  Password :', password);
console.log('  SHA-256  :', hash);
console.log('  Route    : /admin-b7264r9s');
console.log('');
console.log('⚠ NEXT STEPS:');
console.log('  1. Optionally set ADMIN_REBUILD_WEBHOOK in .env');
console.log('  2. npm run build   (in astro-theme/)');
console.log('  3. Redeploy → the hash is now baked into the HTML');
console.log('');

#!/usr/bin/env node
/**
 * setup-admin.js — generate a random admin password and store in .env
 * Run: node scripts/setup-admin.js
 *
 * Writes ADMIN_PASSWORD_HASH to:
 *   - .env                  (workspace root — stores plaintext password)
 *   - astro-theme/.env      (Astro project — bakes hash into build)
 *
 * After running this, rebuild and redeploy the Astro site.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootEnvPath  = path.join(__dirname, '..', '.env');
const astroEnvPath = path.join(__dirname, '..', 'astro-theme', '.env');

// Generate a 16-char URL-safe random password
const password = crypto.randomBytes(12).toString('base64url');
const hash = crypto.createHash('sha256').update(password).digest('hex');

// ── Helper: patch or create an .env file ──────────────────────────
function patchEnv(filePath, vars) {
  let existing = '';
  try { existing = fs.readFileSync(filePath, 'utf-8'); } catch { /* new file */ }
  const keys = Object.keys(vars);
  let lines = existing.split('\n').filter(l => !keys.some(k => l.startsWith(k + '=')));
  // Remove trailing blank lines
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const additions = keys.map(k => `${k}=${vars[k]}`);
  const result = [...lines, '', ...additions, ''].join('\n');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, result);
}

// ── Write credentials ──────────────────────────────────────────────
// Root .env — stores plaintext password (human reference, never committed)
patchEnv(rootEnvPath, {
  ADMIN_PASSWORD:        password,
  ADMIN_PASSWORD_HASH:   hash,
  ADMIN_REBUILD_WEBHOOK: '',
});

// astro-theme/.env — Astro reads this at build time
patchEnv(astroEnvPath, {
  ADMIN_PASSWORD_HASH:   hash,
  ADMIN_REBUILD_WEBHOOK: '',
});

console.log('\n✓ Admin credentials written');
console.log('  Root .env        →', rootEnvPath);
console.log('  Astro .env       →', astroEnvPath);

console.log('');
console.log('  Password :', password);
console.log('  SHA-256  :', hash);
console.log('  Route    : /admin-b7264r9s');
console.log('');
console.log('⚠ NEXT STEPS:');
console.log('  1. Optionally set ADMIN_REBUILD_WEBHOOK in astro-theme/.env');
console.log('  2. cd astro-theme && npm run build');
console.log('  3. Redeploy → the hash is now baked into the HTML');
console.log('');

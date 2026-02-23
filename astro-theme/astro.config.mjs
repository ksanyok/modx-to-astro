// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'node:fs';

// ─── Conditional Keystatic CMS ──────────────────────────────────────
// Enable with: KEYSTATIC=true npm run dev  (local editing only)
// Production builds are always static — Keystatic is a local dev tool.
const isKeystatic = process.env.KEYSTATIC === 'true';

let keystatic, node;
if (isKeystatic) {
  keystatic = (await import('@keystatic/astro')).default;
  node = (await import('@astrojs/node')).default;
}

// ─── Load Redirects from Migration Data ─────────────────────────────
const astroRedirects = {};
try {
  const redirectsPath = './src/content/redirects.json';
  if (existsSync(redirectsPath)) {
    const data = JSON.parse(readFileSync(redirectsPath, 'utf-8'));
    for (const r of data) {
      if (r.old_url && r.new_url && r.old_url !== r.new_url) {
        const oldPath = r.old_url.startsWith('/') ? r.old_url : `/${r.old_url}`;
        const newPath = r.new_url.startsWith('/') ? r.new_url : `/${r.new_url}`;
        astroRedirects[oldPath] = {
          destination: newPath,
          status: parseInt(r.redirect_type) || 301,
        };
      }
    }
  }
} catch {}

// ─── Site URL from site-config.json ─────────────────────────────────
let siteUrl = 'https://example.ch';
try {
  if (existsSync('./src/content/site-config.json')) {
    const cfg = JSON.parse(readFileSync('./src/content/site-config.json', 'utf-8'));
    if (cfg.siteUrl) siteUrl = cfg.siteUrl;
  }
} catch {}

// https://astro.build/config
export default defineConfig({
  site: siteUrl,
  output: isKeystatic ? 'server' : 'static',
  adapter: isKeystatic ? node({ mode: 'standalone' }) : undefined,
  redirects: astroRedirects,
  integrations: [
    sitemap(),
    ...(isKeystatic && keystatic ? [keystatic()] : []),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
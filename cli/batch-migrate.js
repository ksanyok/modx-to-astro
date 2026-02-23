#!/usr/bin/env node

/**
 * Batch Migration Script
 * 
 * Processes multiple MODX sites through the migration pipeline.
 * Supports TRUE parallel execution for fast bulk processing of 200+ sites.
 * 
 * @author ksanyok <buyreadysite.com>
 * @license Proprietary — All rights reserved.
 * @copyright (c) 2025-2026 buyreadysite.com
 * @build b7264r9s
 * 
 * Directory structure expected:
 *   sites/
 *     site-name-1/
 *       dump.sql       (or *.sql)
 *       assets/        (MODX assets directory)
 *     site-name-2/
 *       dump.sql
 *       assets/
 *     ...
 * 
 * Usage:
 *   node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output
 *   node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output --build --parallel 4
 *   node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output --build --deploy-host user@host --deploy-base ~/www
 *   node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output --only site1,site2
 *   node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output --dry-run
 * 
 * Options:
 *   --sites         Directory containing site folders (required)
 *   --theme         Path to the Astro theme template (required)
 *   --output        Output directory for built sites (required)
 *   --only          Comma-separated list of site names to process (optional)
 *   --skip          Comma-separated list of site names to skip (optional)
 *   --build         Also run astro build for each site (default: false)
 *   --deploy-host   SSH host for rsync deploy (optional, e.g., user@server)
 *   --deploy-base   Remote base path (optional, e.g., ~/www)
 *   --domain-suffix Domain suffix for auto SITE_DOMAIN (e.g., ".example.ch")
 *   --parallel      Number of parallel workers (default: 1, max: 10)
 *   --dry-run       Show plan without executing
 *   --verbose       Enable verbose logging
 *   --help          Show help
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// ─── CLI Arguments ─────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
Batch MODX → Astro Migration

Usage:
  node batch-migrate.js --sites <dir> --theme <dir> --output <dir> [options]

Options:
  --sites         Directory containing site folders with SQL + assets (required)
  --theme         Path to the Astro theme template (required)
  --output        Output directory for built sites (required)
  --only          Comma-separated list of site names to process
  --skip          Comma-separated list of site names to skip
  --build         Also build each site with Astro (default: false)
  --deploy-host   SSH host for rsync deploy (e.g., user@server)
  --deploy-base   Remote base path (e.g., ~/www)
  --domain-suffix Domain suffix (e.g., ".example.ch" → site-name.example.ch)
  --parallel      Number of parallel workers (default: 1, max: 10)
  --dry-run       Show plan without executing
  --verbose       Enable verbose logging
  --help          Show this help

Examples:
  # Migrate only (fastest — just generates JSON + copies assets)
  node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output

  # Full pipeline with 4 parallel workers
  node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output \\
    --build --parallel 4 --deploy-host user@host --deploy-base ~/www

  # Process specific sites
  node batch-migrate.js --sites ./sites --theme ../astro-theme --output ./output \\
    --only azotea,kp-services --build
`);
  process.exit(0);
}

const SITES_DIR = args.sites;
const THEME_DIR = args.theme;
const OUTPUT_DIR = args.output;
const ONLY = args.only ? args.only.split(',').map(s => s.trim()) : null;
const SKIP = args.skip ? args.skip.split(',').map(s => s.trim()) : [];
const DO_BUILD = !!args.build;
const DEPLOY_HOST = args['deploy-host'] || '';
const DEPLOY_BASE = args['deploy-base'] || '';
const DOMAIN_SUFFIX = args['domain-suffix'] || '';
const PARALLEL = Math.min(Math.max(parseInt(args.parallel) || 1, 1), 10);
const VERBOSE = !!args.verbose;
const DRY_RUN = !!args['dry-run'];

if (!SITES_DIR || !THEME_DIR || !OUTPUT_DIR) {
  console.error('Error: --sites, --theme, and --output are required. Use --help.');
  process.exit(1);
}

// ─── Logging ───────────────────────────────────────────────────────

const log = {
  header: (msg) => console.log(`\n${'═'.repeat(60)}\n  ${msg}\n${'═'.repeat(60)}`),
  info: (msg) => console.log(`  ✓ ${msg}`),
  warn: (msg) => console.log(`  ⚠ ${msg}`),
  error: (msg) => console.error(`  ✗ ${msg}`),
  verbose: (msg) => VERBOSE && console.log(`    ${msg}`),
  timing: (label, ms) => console.log(`  ⏱  ${label}: ${formatDuration(ms)}`),
};

// ─── Helpers ───────────────────────────────────────────────────────

function countHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countHtmlFiles(path.join(dir, entry.name));
    } else if (entry.name.endsWith('.html')) {
      count++;
    }
  }
  return count;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

// ─── Site Discovery ────────────────────────────────────────────────

function discoverSites(sitesDir) {
  const sites = [];
  const entries = fs.readdirSync(sitesDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const siteName = entry.name;
    
    if (ONLY && !ONLY.includes(siteName)) continue;
    if (SKIP.includes(siteName)) continue;
    
    const siteDir = path.join(sitesDir, siteName);
    
    // Find SQL file
    const sqlFiles = fs.readdirSync(siteDir).filter(f => f.endsWith('.sql'));
    if (sqlFiles.length === 0) {
      log.warn(`Skipping ${siteName}: no .sql file found`);
      continue;
    }
    
    // Find assets directory
    const assetsDir = path.join(siteDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
      log.warn(`Skipping ${siteName}: no assets/ directory`);
      continue;
    }
    
    sites.push({
      name: siteName,
      sqlPath: path.join(siteDir, sqlFiles[0]),
      assetsPath: assetsDir,
      domain: DOMAIN_SUFFIX ? `${siteName}${DOMAIN_SUFFIX}` : '',
    });
  }
  
  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Single Site Processing ────────────────────────────────────────

async function processSite(site, index, total) {
  const timings = {};
  const totalStart = Date.now();
  const prefix = `[${index + 1}/${total}] ${site.name}`;
  log.header(prefix);
  
  if (DRY_RUN) {
    log.info(`DRY RUN — would process: ${site.sqlPath}`);
    return { name: site.name, status: 'dry-run', duration: 0, timings: {} };
  }
  
  const siteOutputDir = path.join(OUTPUT_DIR, site.name);
  const contentDir = path.join(siteOutputDir, 'src', 'content');
  
  // ── Step 1: Run migration ──
  const migrateStart = Date.now();
  log.info('Migrating...');
  try {
    const siteFlag = site.domain ? ` --site https://${site.domain}` : '';
    const migrateCmd = `node ${path.join(__dirname, 'migrate.js')} --sql "${site.sqlPath}" --assets "${site.assetsPath}" --out "${contentDir}"${siteFlag}${VERBOSE ? ' --verbose' : ''}`;
    const result = execSync(migrateCmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    
    const pagesMatch = result.match(/Pages generated: (\d+)/);
    const pages = pagesMatch ? pagesMatch[1] : '?';
    timings.migrate = Date.now() - migrateStart;
    log.info(`Migration: ${pages} pages`);
    log.timing('Migrate', timings.migrate);
  } catch (err) {
    log.error(`Migration failed: ${err.message}`);
    return { name: site.name, status: 'error', step: 'migrate', duration: Date.now() - totalStart, timings };
  }
  
  // ── Step 2: Prepare build directory ──
  if (DO_BUILD || DEPLOY_HOST) {
    const prepStart = Date.now();
    log.info('Preparing build...');
    const buildDir = path.join(siteOutputDir, 'build');
    
    // Copy theme files (skip node_modules, dist, .astro, .env)
    await fs.ensureDir(buildDir);
    const themeFiles = fs.readdirSync(THEME_DIR).filter(f => 
      !['node_modules', 'dist', '.astro', '.env'].includes(f)
    );
    for (const file of themeFiles) {
      await fs.copy(path.join(THEME_DIR, file), path.join(buildDir, file), { overwrite: true });
    }
    
    // Symlink node_modules (saves ~200MB per site)
    const nmLink = path.join(buildDir, 'node_modules');
    const nmTarget = path.resolve(THEME_DIR, 'node_modules');
    if (fs.existsSync(nmLink)) await fs.remove(nmLink);
    await fs.symlink(nmTarget, nmLink);
    
    // Replace content
    const buildContentDir = path.join(buildDir, 'src', 'content');
    if (fs.existsSync(buildContentDir)) await fs.remove(buildContentDir);
    await fs.copy(contentDir, buildContentDir);
    
    // Copy assets from migration output to build/public/assets
    const migratedPublic = path.join(siteOutputDir, 'public', 'assets');
    if (fs.existsSync(migratedPublic)) {
      const publicAssetsDir = path.join(buildDir, 'public', 'assets');
      await fs.copy(migratedPublic, publicAssetsDir, { overwrite: true });
    }
    
    timings.prepare = Date.now() - prepStart;
    log.timing('Prepare', timings.prepare);
    
    // ── Step 3: Build ──
    const buildStart = Date.now();
    log.info('Building Astro site...');
    try {
      const buildEnv = { ...process.env };
      if (site.domain) buildEnv.SITE_URL = `https://${site.domain}`;
      
      execSync('npx astro build', { 
        cwd: buildDir, 
        encoding: 'utf-8', 
        maxBuffer: 50 * 1024 * 1024,
        env: buildEnv,
      });
      
      const distDir = path.join(buildDir, 'dist');
      const pageCount = countHtmlFiles(distDir);
      timings.build = Date.now() - buildStart;
      log.info(`Build: ${pageCount} HTML pages`);
      log.timing('Build', timings.build);
    } catch (err) {
      log.error(`Build failed: ${(err.stderr || err.message).slice(0, 500)}`);
      return { name: site.name, status: 'error', step: 'build', duration: Date.now() - totalStart, timings };
    }
    
    // ── Step 4: Deploy ──
    if (DEPLOY_HOST && DEPLOY_BASE) {
      const deployStart = Date.now();
      const remotePath = `${DEPLOY_BASE}/${site.name}`;
      log.info(`Deploying to ${DEPLOY_HOST}:${remotePath}...`);
      try {
        const distDir = path.join(buildDir, 'dist');
        const deployCmd = [
          'rsync -az --delete --inplace --compress-level=9',
          "--exclude='.well-known'",
          "--exclude='cgi-bin'",
          "--exclude='.htaccess'",
          "--exclude='.user.ini'",
          `"${distDir}/"`,
          `${DEPLOY_HOST}:"${remotePath}/"`,
        ].join(' ');
        
        execSync(deployCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        timings.deploy = Date.now() - deployStart;
        log.info('Deploy complete');
        log.timing('Deploy', timings.deploy);
      } catch (err) {
        log.error(`Deploy failed: ${err.message}`);
        return { name: site.name, status: 'error', step: 'deploy', duration: Date.now() - totalStart, timings };
      }
    }
  }
  
  const duration = Date.now() - totalStart;
  log.info(`Done in ${formatDuration(duration)}`);
  return { name: site.name, status: 'success', duration, timings };
}

// ─── Parallel Execution (Worker Pool) ──────────────────────────────

async function runParallel(sites, workers) {
  const results = new Array(sites.length);
  let nextIndex = 0;
  
  async function worker() {
    while (nextIndex < sites.length) {
      const idx = nextIndex++;
      results[idx] = await processSite(sites[idx], idx, sites.length);
    }
  }
  
  const actualWorkers = Math.min(workers, sites.length);
  const workerPromises = [];
  for (let i = 0; i < actualWorkers; i++) {
    workerPromises.push(worker());
  }
  await Promise.all(workerPromises);
  
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         MODX → Astro Batch Migration Pipeline           ║
╠══════════════════════════════════════════════════════════╣
║  Workers: ${String(PARALLEL).padEnd(46)}║
║  Build:   ${String(DO_BUILD || !!DEPLOY_HOST).padEnd(46)}║
║  Deploy:  ${String(DEPLOY_HOST ? DEPLOY_HOST + ':' + DEPLOY_BASE : 'disabled').padEnd(46)}║
╚══════════════════════════════════════════════════════════╝
`);
  
  // Validate paths
  if (!fs.existsSync(SITES_DIR)) {
    log.error(`Sites directory not found: ${SITES_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(THEME_DIR)) {
    log.error(`Theme directory not found: ${THEME_DIR}`);
    process.exit(1);
  }
  
  await fs.ensureDir(OUTPUT_DIR);
  
  // Discover sites
  const sites = discoverSites(SITES_DIR);
  log.info(`Found ${sites.length} site(s) to process`);
  
  if (sites.length === 0) {
    log.warn('No sites found. Check your --sites directory structure.');
    process.exit(0);
  }
  
  if (DRY_RUN) {
    log.info('DRY RUN — no changes will be made');
    sites.forEach((s, i) => log.info(`  ${i + 1}. ${s.name} (${s.sqlPath})`));
    process.exit(0);
  }
  
  // Process sites (parallel or sequential)
  let results;
  if (PARALLEL > 1) {
    log.info(`Running with ${PARALLEL} parallel workers`);
    results = await runParallel(sites, PARALLEL);
  } else {
    results = [];
    for (let i = 0; i < sites.length; i++) {
      results.push(await processSite(sites[i], i, sites.length));
    }
  }
  
  // ── Summary ──
  const totalTime = Date.now() - startTime;
  const success = results.filter(r => r.status === 'success');
  const errors = results.filter(r => r.status === 'error');
  
  const avgTime = success.length > 0
    ? formatDuration(success.reduce((sum, r) => sum + r.duration, 0) / success.length)
    : '-';
  
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                    BATCH SUMMARY                        ║
╠══════════════════════════════════════════════════════════╣
║  Total sites:     ${String(results.length).padEnd(38)}║
║  Successful:      ${String(success.length).padEnd(38)}║
║  Failed:          ${String(errors.length).padEnd(38)}║
║  Avg per site:    ${avgTime.padEnd(38)}║
║  Total time:      ${formatDuration(totalTime).padEnd(38)}║
║  Workers:         ${String(PARALLEL).padEnd(38)}║
╚══════════════════════════════════════════════════════════╝
`);
  
  // Per-site timing breakdown
  if (success.length > 0) {
    console.log('  Per-site breakdown:');
    results.forEach(r => {
      const icon = r.status === 'success' ? '✓' : '✗';
      const time = r.duration ? formatDuration(r.duration) : '-';
      const detail = r.timings && Object.keys(r.timings).length > 0
        ? ` (migrate: ${formatDuration(r.timings.migrate || 0)}, build: ${formatDuration(r.timings.build || 0)}, deploy: ${formatDuration(r.timings.deploy || 0)})`
        : '';
      console.log(`    ${icon} ${r.name}: ${time}${detail}`);
    });
    console.log('');
  }
  
  if (errors.length > 0) {
    console.log('  Failed sites:');
    errors.forEach(e => log.error(`${e.name}: failed at ${e.step} step`));
    console.log('');
  }
  
  // Write results JSON
  const reportPath = path.join(OUTPUT_DIR, 'batch-report.json');
  await fs.writeJson(reportPath, {
    timestamp: new Date().toISOString(),
    totalSites: results.length,
    successful: success.length,
    failed: errors.length,
    totalTimeMs: totalTime,
    totalTimeFormatted: formatDuration(totalTime),
    avgPerSiteMs: success.length > 0
      ? Math.round(success.reduce((sum, r) => sum + r.duration, 0) / success.length)
      : 0,
    parallel: PARALLEL,
    sites: results,
  }, { spaces: 2 });
  log.info(`Report: ${reportPath}`);
  
  // Estimate for 200 sites
  if (success.length > 0) {
    const avgMs = success.reduce((sum, r) => sum + r.duration, 0) / success.length;
    const est200seq = formatDuration(avgMs * 200);
    const est200par5 = formatDuration((avgMs * 200) / 5);
    const est200par10 = formatDuration((avgMs * 200) / 10);
    console.log(`  Estimate for 200 sites:`);
    console.log(`    Sequential (--parallel 1):  ~${est200seq}`);
    console.log(`    Parallel   (--parallel 5):  ~${est200par5}`);
    console.log(`    Parallel   (--parallel 10): ~${est200par10}`);
    console.log('');
  }
  
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Batch migration failed:', err);
  process.exit(1);
});

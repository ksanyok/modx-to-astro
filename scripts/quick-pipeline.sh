#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Quick Pipeline Script — single site, full cycle with timing
# b7264r9s | ksanyok | buyreadysite.com
# ═══════════════════════════════════════════════════════════════
#
# Runs the complete pipeline (clean → migrate → build → deploy)
# with per-step timing. Useful for quick manual deploys.
#
# Usage:
#   ./scripts/quick-pipeline.sh                    # uses .env
#   ./scripts/quick-pipeline.sh --no-deploy        # skip deploy
#   SQL_PATH=../site/dump.sql ASSETS_PATH=../site/assets \
#     DEPLOY_HOST=user@host DEPLOY_PATH=/www/site \
#     ./scripts/quick-pipeline.sh
#
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ROOT_DIR}/.env"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

THEME_DIR="${ROOT_DIR}/astro-theme"
CLI_DIR="${ROOT_DIR}/cli"

# Parse args
SKIP_DEPLOY=false
[[ "${1:-}" == "--no-deploy" ]] && SKIP_DEPLOY=true

# Validate
SQL_PATH="${SQL_PATH:-}"
ASSETS_PATH="${ASSETS_PATH:-}"
if [[ -z "$SQL_PATH" || -z "$ASSETS_PATH" ]]; then
  echo "Error: SQL_PATH and ASSETS_PATH must be set in .env or env vars."
  exit 1
fi

SITE_FLAG=""
[[ -n "${SITE_DOMAIN:-}" ]] && SITE_FLAG="--site https://${SITE_DOMAIN}"

TOTAL_START=$(date +%s)

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Quick Pipeline (timed)                     ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  SQL:    ${SQL_PATH}"
echo "║  Domain: ${SITE_DOMAIN:-<not set>}"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Clean ──
echo "→ [1/4] Cleaning..."
STEP_START=$(date +%s)
rm -rf "${THEME_DIR}/src/content/pages/"*
rm -f  "${THEME_DIR}/src/content/site-config.json"
rm -f  "${THEME_DIR}/src/content/redirects.json"
rm -rf "${THEME_DIR}/public/assets/"*
rm -rf "${THEME_DIR}/dist"
STEP_END=$(date +%s)
echo "  ✓ Clean: $((STEP_END - STEP_START))s"

# ── Step 2: Migrate ──
echo "→ [2/4] Migrating..."
STEP_START=$(date +%s)
cd "$CLI_DIR"
node migrate.js \
  --sql "../${SQL_PATH}" \
  --assets "../${ASSETS_PATH}" \
  --out "${THEME_DIR}/src/content" \
  $SITE_FLAG \
  --verbose
STEP_END=$(date +%s)
MIGRATE_TIME=$((STEP_END - STEP_START))
echo "  ✓ Migrate: ${MIGRATE_TIME}s"

# ── Step 3: Build ──
echo "→ [3/4] Building..."
STEP_START=$(date +%s)
cd "$THEME_DIR"
npx astro build
PAGE_COUNT=$(find dist -name '*.html' | wc -l | tr -d ' ')
DIST_SIZE=$(du -sh dist | cut -f1)
STEP_END=$(date +%s)
BUILD_TIME=$((STEP_END - STEP_START))
echo "  ✓ Build: ${BUILD_TIME}s (${PAGE_COUNT} pages, ${DIST_SIZE})"

# ── Step 4: Deploy ──
DEPLOY_TIME=0
if [[ "$SKIP_DEPLOY" == "false" ]]; then
  DEPLOY_HOST="${DEPLOY_HOST:-}"
  DEPLOY_PATH="${DEPLOY_PATH:-}"
  if [[ -n "$DEPLOY_HOST" && -n "$DEPLOY_PATH" ]]; then
    echo "→ [4/4] Deploying to ${DEPLOY_HOST}..."
    STEP_START=$(date +%s)
    cd "$ROOT_DIR"
    bash scripts/deploy.sh "$DEPLOY_HOST" "$DEPLOY_PATH"
    STEP_END=$(date +%s)
    DEPLOY_TIME=$((STEP_END - STEP_START))
    echo "  ✓ Deploy: ${DEPLOY_TIME}s"
  else
    echo "→ [4/4] Skipping deploy (DEPLOY_HOST/DEPLOY_PATH not set)"
  fi
else
  echo "→ [4/4] Skipping deploy (--no-deploy)"
fi

TOTAL_END=$(date +%s)
TOTAL_TIME=$((TOTAL_END - TOTAL_START))

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ Pipeline Complete                                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Migrate:  ${MIGRATE_TIME}s"
echo "║  Build:    ${BUILD_TIME}s"
echo "║  Deploy:   ${DEPLOY_TIME}s"
echo "║  ──────────────────"
echo "║  Total:    ${TOTAL_TIME}s"
echo "╚══════════════════════════════════════════════════════════╝"

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Zero-Downtime Deploy Script
# b7264r9s | ksanyok | buyreadysite.com
# ═══════════════════════════════════════════════════════════════
#
# Deploys the built Astro site to a remote server via rsync
# with atomic directory swap (zero-downtime).
#
# Usage:
#   ./scripts/deploy.sh                           # uses .env defaults
#   ./scripts/deploy.sh user@host /var/www/site    # override host + path
#   DEPLOY_HOST=user@host ./scripts/deploy.sh      # env override
#
# Rollback:
#   ./scripts/deploy.sh --rollback
#
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Load .env if present ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ROOT_DIR}/.env"
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

# ── Rollback shortcut (before parsing positional args) ──
if [[ "${1:-}" == "--rollback" ]]; then
  DEPLOY_HOST="${DEPLOY_HOST:-}"
  DEPLOY_PATH="${DEPLOY_PATH:-}"
  if [[ -z "$DEPLOY_HOST" || -z "$DEPLOY_PATH" ]]; then
    echo "Error: DEPLOY_HOST and DEPLOY_PATH must be set in .env for rollback."
    exit 1
  fi
  echo "══════════════════════════════════"
  echo "  ROLLBACK"
  echo "══════════════════════════════════"
  PREVIOUS="${DEPLOY_PATH}-prev"
  ssh "$DEPLOY_HOST" "
    set -e
    if [ ! -d '${PREVIOUS}' ]; then
      echo '✗ No previous release found'
      exit 1
    fi
    [ -d '${DEPLOY_PATH}' ] && rm -rf '${DEPLOY_PATH}'
    mv '${PREVIOUS}' '${DEPLOY_PATH}'
    echo '✓ Rolled back to previous release'
  "
  echo "══════════════════════════════════"
  echo "  ✓ Rollback complete"
  echo "══════════════════════════════════"
  exit 0
fi

# ── Configuration ──
DEPLOY_HOST="${1:-${DEPLOY_HOST:-}}"
DEPLOY_PATH="${2:-${DEPLOY_PATH:-}}"
DIST_DIR="${ROOT_DIR}/astro-theme/dist"

# ── Validation ──
if [[ -z "$DEPLOY_HOST" || -z "$DEPLOY_PATH" ]]; then
  echo "Error: DEPLOY_HOST and DEPLOY_PATH required."
  echo ""
  echo "Usage:"
  echo "  $0 user@host /path/to/webroot"
  echo "  Or set DEPLOY_HOST and DEPLOY_PATH in .env"
  exit 1
fi

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Error: dist/ not found. Run 'npm run build' in astro-theme/ first."
  exit 1
fi

PAGE_COUNT=$(find "$DIST_DIR" -name '*.html' | wc -l | tr -d ' ')
DIST_SIZE=$(du -sh "$DIST_DIR" | cut -f1)

echo "══════════════════════════════════"
echo "  DEPLOY → ${DEPLOY_HOST}"
echo "══════════════════════════════════"
echo "  Path:   ${DEPLOY_PATH}"
echo "  Pages:  ${PAGE_COUNT}"
echo "  Size:   ${DIST_SIZE}"
echo ""

STAGING="${DEPLOY_PATH}-staging"
PREVIOUS="${DEPLOY_PATH}-prev"

# ── Step 1: rsync to staging directory ──
echo "→ Syncing to staging..."
rsync -az --delete --inplace --compress-level=9 \
  --exclude='.well-known' \
  --exclude='cgi-bin' \
  --exclude='.user.ini' \
  "$DIST_DIR/" \
  "${DEPLOY_HOST}:${STAGING}/"

# ── Step 2: Atomic swap on server ──
echo "→ Atomic swap..."
ssh "$DEPLOY_HOST" "
  set -e
  # Remove old backup
  [ -d '${PREVIOUS}' ] && rm -rf '${PREVIOUS}'
  # Current → backup
  [ -d '${DEPLOY_PATH}' ] && mv '${DEPLOY_PATH}' '${PREVIOUS}'
  # Staging → live
  mv '${STAGING}' '${DEPLOY_PATH}'
"

echo ""
echo "══════════════════════════════════"
echo "  ✓ Deployed successfully"
echo "  Rollback: $0 --rollback"
echo "══════════════════════════════════"

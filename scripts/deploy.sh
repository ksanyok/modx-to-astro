#!/usr/bin/env bash
# ======================================================================
# Symlink-Based Zero-Downtime Deploy Script
# b7264r9s | ksanyok | buyreadysite.com
# ======================================================================
#
# Strategy: timestamped releases + atomic symlink swap (ln -sfn).
#
#  Server layout after first deploy:
#    /var/www/vhosts/example.ch/
#    ├── releases/
#    │   ├── 20260302_120000/    (older release, kept for rollback)
#    │   └── 20260302_130000/    (current live release)
#    └── httpdocs -> releases/20260302_130000   (SYMLINK = webroot)
#
#  DEPLOY_PATH = the symlink path (e.g. the Plesk httpdocs directory).
#  First deploy backs up any existing /httpdocs dir and creates symlink.
#
# Usage:
#   ./scripts/deploy.sh                   # reads .env
#   ./scripts/deploy.sh user@host /path   # positional override
#   ./scripts/deploy.sh --rollback        # roll back one release
#   ./scripts/deploy.sh --rollback 2      # roll back N releases
#   ./scripts/deploy.sh --dry-run         # print plan, no changes
#   ./scripts/deploy.sh --list            # list releases on server
#
# Env vars (set in .env):
#   DEPLOY_HOST      user@hostname
#   DEPLOY_PATH      absolute webroot path on server (becomes symlink)
#   DEPLOY_PORT      SSH port (default: 22)
#   KEEP_RELEASES    number of releases to keep (default: 3)
#   HEALTH_URL       URL to verify after deploy (optional)
#
# ======================================================================
set -euo pipefail

# -- Load .env ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${ROOT_DIR}/.env"
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

# -- Defaults ----------------------------------------------------------
DEPLOY_PORT="${DEPLOY_PORT:-22}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
HEALTH_URL="${HEALTH_URL:-}"
DRY_RUN=false
DO_ROLLBACK=false
ROLLBACK_STEPS=1
DO_LIST=false

# -- Argument parsing --------------------------------------------------
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true; shift ;;
    --rollback)
      DO_ROLLBACK=true
      if [[ "${2:-}" =~ ^[0-9]+$ ]]; then ROLLBACK_STEPS="$2"; shift; fi
      shift ;;
    --list)
      DO_LIST=true; shift ;;
    --port)
      DEPLOY_PORT="$2"; shift 2 ;;
    --keep)
      KEEP_RELEASES="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,2\}//' | head -45
      exit 0 ;;
    -*)
      echo "Unknown flag: $1  (use --help)"; exit 1 ;;
    *)
      POSITIONAL+=("$1"); shift ;;
  esac
done

[[ ${#POSITIONAL[@]} -ge 1 ]] && DEPLOY_HOST="${POSITIONAL[0]}"
[[ ${#POSITIONAL[@]} -ge 2 ]] && DEPLOY_PATH="${POSITIONAL[1]}"

# -- Validation --------------------------------------------------------
if [[ -z "${DEPLOY_HOST:-}" || -z "${DEPLOY_PATH:-}" ]]; then
  echo "Error: DEPLOY_HOST and DEPLOY_PATH are required (set in .env or as args)."
  exit 1
fi

DIST_DIR="${ROOT_DIR}/astro-theme/dist"
SSH_OPTS="-p ${DEPLOY_PORT} -o BatchMode=yes -o ConnectTimeout=10"
# shellcheck disable=SC2086
SSH_CMD="ssh ${SSH_OPTS}"
RSYNC_SSH="ssh ${SSH_OPTS}"

RELEASES_BASE="$(dirname "${DEPLOY_PATH}")/releases"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
NEW_RELEASE="${RELEASES_BASE}/${TIMESTAMP}"

DRY_PREFIX=""
$DRY_RUN && DRY_PREFIX="[DRY-RUN] "

# -- List releases -----------------------------------------------------
if $DO_LIST; then
  echo "======================================"
  echo "  Releases on ${DEPLOY_HOST}"
  echo "  ${RELEASES_BASE}/"
  echo "======================================"
  # shellcheck disable=SC2086
  $SSH_CMD "$DEPLOY_HOST" "
    ls -1t '${RELEASES_BASE}/' 2>/dev/null | while read -r r; do
      current=\$(readlink '${DEPLOY_PATH}' 2>/dev/null | xargs basename 2>/dev/null || true)
      manifest='${RELEASES_BASE}'/\"\$r\"/.deploy-manifest.json
      label=\"  \$r\"
      [ \"\$r\" = \"\$current\" ] && label=\"-> \$r  [LIVE]\"
      if [ -f \"\$manifest\" ]; then
        pages=\$(python3 -c \"import json,sys; d=json.load(open(sys.argv[1])); print(d.get('pages','?'))\" \"\$manifest\" 2>/dev/null || echo '?')
        label=\"\$label  (pages: \$pages)\"
      fi
      echo \"\$label\"
    done
  "
  exit 0
fi

# -- Rollback ----------------------------------------------------------
if $DO_ROLLBACK; then
  echo "======================================"
  echo "  ROLLBACK (${ROLLBACK_STEPS} step(s))"
  echo "======================================"
  if $DRY_RUN; then
    echo "${DRY_PREFIX}Would roll back ${ROLLBACK_STEPS} release(s) on ${DEPLOY_HOST}:${DEPLOY_PATH}"
  else
    # shellcheck disable=SC2086
    $SSH_CMD "$DEPLOY_HOST" "
      set -e
      releases=\$(ls -1t '${RELEASES_BASE}/' 2>/dev/null)
      count=\$(echo \"\$releases\" | grep -c .)
      target_idx=\$((${ROLLBACK_STEPS} + 1))
      if [ \"\$count\" -lt \"\$target_idx\" ]; then
        echo 'Error: not enough releases to roll back (found '\$count', need '\$target_idx')'
        exit 1
      fi
      target=\$(echo \"\$releases\" | sed -n \"\${target_idx}p\")
      # Atomic symlink swap - no crash gap
      ln -sfn '${RELEASES_BASE}'/\"\$target\" '${DEPLOY_PATH}'
      echo 'Rolled back to: '\"\$target\"
    "
  fi
  echo "  Done."
  echo "======================================"
  exit 0
fi

# -- Pre-flight --------------------------------------------------------
if [[ ! -d "$DIST_DIR" ]]; then
  echo "Error: ${DIST_DIR} not found. Run 'npm run build' in astro-theme/ first."
  exit 1
fi

PAGE_COUNT=$(find "$DIST_DIR" -name '*.html' | wc -l | tr -d ' ')
DIST_SIZE=$(du -sh "$DIST_DIR" | cut -f1)
GIT_SHA=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || echo "unknown")
DEPLOYER="$(whoami)@$(hostname -s 2>/dev/null || echo unknown)"

echo "======================================"
$DRY_RUN && echo "  *** DRY RUN - no changes will be made ***"
echo "  DEPLOY -> ${DEPLOY_HOST}:${DEPLOY_PORT}"
echo "======================================"
echo "  Target:   ${DEPLOY_PATH}"
echo "  Release:  ${TIMESTAMP}"
echo "  Pages:    ${PAGE_COUNT}"
echo "  Size:     ${DIST_SIZE}"
echo "  Git:      ${GIT_SHA} (${GIT_BRANCH})"
echo "  Keep:     ${KEEP_RELEASES} releases"
[[ -n "$HEALTH_URL" ]] && echo "  Health:   ${HEALTH_URL}"
echo ""

# -- Write deploy manifest locally ------------------------------------
MANIFEST_FILE="${DIST_DIR}/.deploy-manifest.json"
printf '{
  "timestamp": "%s",
  "git_sha": "%s",
  "git_branch": "%s",
  "pages": %s,
  "dist_size": "%s",
  "deployed_by": "%s",
  "deploy_host": "%s",
  "deploy_path": "%s"
}\n' \
  "${TIMESTAMP}" "${GIT_SHA}" "${GIT_BRANCH}" "${PAGE_COUNT}" \
  "${DIST_SIZE}" "${DEPLOYER}" "${DEPLOY_HOST}" "${DEPLOY_PATH}" \
  > "$MANIFEST_FILE"

# -- Step 1: Create release directory on server -----------------------
echo "-> Preparing release directory..."
if $DRY_RUN; then
  echo "${DRY_PREFIX}mkdir -p ${NEW_RELEASE}"
else
  # shellcheck disable=SC2086
  $SSH_CMD "$DEPLOY_HOST" "mkdir -p '${NEW_RELEASE}'"
fi

# -- Step 2: Rsync files to new release directory ---------------------
echo "-> Syncing files..."
RSYNC_XTRA=""
$DRY_RUN && RSYNC_XTRA="--dry-run --itemize-changes"

# shellcheck disable=SC2086
rsync -az --delete --compress-level=9 \
  $RSYNC_XTRA \
  --exclude='.well-known' --exclude='cgi-bin' --exclude='.user.ini' \
  -e "$RSYNC_SSH" \
  "$DIST_DIR/" \
  "${DEPLOY_HOST}:${NEW_RELEASE}/"

# -- Step 3: Atomic symlink swap (ln -sfn, zero crash gap) ------------
echo "-> Atomic symlink swap..."
if $DRY_RUN; then
  echo "${DRY_PREFIX}ln -sfn ${NEW_RELEASE} ${DEPLOY_PATH}"
else
  # shellcheck disable=SC2086
  $SSH_CMD "$DEPLOY_HOST" "
    set -e
    # First deploy: back up existing httpdocs if it is a plain directory
    if [ -d '${DEPLOY_PATH}' ] && [ ! -L '${DEPLOY_PATH}' ]; then
      mv '${DEPLOY_PATH}' '${DEPLOY_PATH}.bak.${TIMESTAMP}'
      echo '  Backed up existing webroot -> ${DEPLOY_PATH}.bak.${TIMESTAMP}'
    fi
    # Atomic symlink update - if server crashes between mkdir and here,
    # the old symlink still points to the previous valid release.
    ln -sfn '${NEW_RELEASE}' '${DEPLOY_PATH}'
    echo '  Symlink: ${DEPLOY_PATH} -> ${NEW_RELEASE}'
  "
fi

# -- Step 4: Prune old releases ---------------------------------------
echo "-> Pruning old releases (keeping ${KEEP_RELEASES})..."
if $DRY_RUN; then
  echo "${DRY_PREFIX}Would delete releases beyond the newest ${KEEP_RELEASES} in ${RELEASES_BASE}/"
else
  # shellcheck disable=SC2086
  $SSH_CMD "$DEPLOY_HOST" "
    ls -1t '${RELEASES_BASE}/' | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
      rm -rf '${RELEASES_BASE}/'\"\$old\"
      echo '  Removed old release: '\"\$old\"
    done
  "
fi

# -- Step 5: Post-deploy health check ---------------------------------
if [[ -n "$HEALTH_URL" ]]; then
  echo "-> Health check: ${HEALTH_URL}"
  if $DRY_RUN; then
    echo "${DRY_PREFIX}curl --max-time 15 -o /dev/null -w '%{http_code}' ${HEALTH_URL}"
  else
    sleep 2  # allow web server to pick up the new symlink
    HTTP_CODE=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' "${HEALTH_URL}" 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
      echo "  Health check passed (HTTP ${HTTP_CODE})"
    else
      echo ""
      echo "  ERROR: health check failed (HTTP ${HTTP_CODE})"
      echo "  To roll back:  bash scripts/deploy.sh --rollback"
      echo ""
      exit 1
    fi
  fi
fi

# -- Done -------------------------------------------------------------
echo ""
echo "======================================"
$DRY_RUN && echo "  *** DRY RUN - nothing was changed ***" || echo "  Deployed successfully"
echo "  Release:  ${TIMESTAMP}"
echo "  Rollback: bash scripts/deploy.sh --rollback"
echo "  List:     bash scripts/deploy.sh --list"
echo "======================================"

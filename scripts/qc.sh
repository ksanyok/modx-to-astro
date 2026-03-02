#!/usr/bin/env bash
# ======================================================================
# QC (Quality Control) Automation Script
# b7264r9s | ksanyok | buyreadysite.com
# ======================================================================
#
# Runs three quality-control checks on migrated content:
#   1. Remaining MODX template tags ( {{ , [[ , {[ )
#   2. Broken image references (paths in JSON not found in assets dir)
#   3. UTF-8 validity of all JSON content files
#
# Usage:
#   bash scripts/qc.sh                   # check everything
#   bash scripts/qc.sh --check modx      # only MODX-tags check
#   bash scripts/qc.sh --check images    # only broken-images check
#   bash scripts/qc.sh --check utf8      # only UTF-8 check
#   bash scripts/qc.sh --strict          # exit 1 on any warning
#
# Returns exit code 0 when all checks pass, 1 when issues are found.
# ======================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Paths to check
CONTENT_DIR="${ROOT_DIR}/astro-theme/src/content"
ASSETS_DIR="${ROOT_DIR}/astro-theme/public"
PUBLIC_DIR="${ROOT_DIR}/public"

# Flags
STRICT=false
CHECK_FILTER="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)  STRICT=true; shift ;;
    --check)   CHECK_FILTER="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \{0,2\}//' | head -25
      exit 0 ;;
    *) echo "Unknown arg: $1  (use --help)"; exit 1 ;;
  esac
done

ERRORS=0
WARNINGS=0

print_header() {
  echo ""
  echo "======================================"
  echo "  QC CHECK: $1"
  echo "======================================"
}

print_pass()  { echo "  [PASS] $*"; }
print_warn()  { echo "  [WARN] $*"; WARNINGS=$((WARNINGS + 1)); }
print_fail()  { echo "  [FAIL] $*"; ERRORS=$((ERRORS + 1)); }

# ======================================================================
# CHECK 1: Remaining MODX template tags
# ======================================================================
check_modx_tags() {
  print_header "Remaining MODX template tags"

  if [[ ! -d "$CONTENT_DIR" ]]; then
    print_warn "Content directory not found: ${CONTENT_DIR}"
    print_warn "Run 'make migrate' first."
    return
  fi

  local found=0

  # Search for {{, [[, or {[ in JSON files
  while IFS= read -r -d '' file; do
    local hits
    hits=$(grep -nP '\{\{|\[\[|\{\[' "$file" 2>/dev/null || true)
    if [[ -n "$hits" ]]; then
      print_fail "MODX tags in: ${file#"$ROOT_DIR/"}"
      echo "$hits" | head -5 | while IFS= read -r line; do
        echo "    $line"
      done
      found=$((found + 1))
    fi
  done < <(find "$CONTENT_DIR" -name '*.json' -print0 2>/dev/null)

  if [[ $found -eq 0 ]]; then
    print_pass "No remaining MODX tags found."
  else
    print_fail "${found} file(s) contain unresolved MODX template tags."
  fi
}

# ======================================================================
# CHECK 2: Broken image references
# ======================================================================
check_broken_images() {
  print_header "Broken image references in JSON"

  if [[ ! -d "$CONTENT_DIR" ]]; then
    print_warn "Content directory not found: ${CONTENT_DIR}"
    return
  fi

  local broken=0
  local checked=0

  # Extract all "src" values that look like /assets/... or /uploads/...
  while IFS= read -r -d '' file; do
    local srcs
    srcs=$(grep -oP '"(?:src|image|url)"\s*:\s*"\K[^"]+(?=")' "$file" 2>/dev/null \
      | grep -E '^/' || true)

    while IFS= read -r src; do
      [[ -z "$src" ]] && continue
      checked=$((checked + 1))

      # Check in astro-theme/public and /public
      local found_in_public=false
      if [[ -f "${ASSETS_DIR}${src}" ]] || [[ -f "${PUBLIC_DIR}${src}" ]]; then
        found_in_public=true
      fi

      if ! $found_in_public; then
        print_fail "Missing asset: ${src}"
        echo "    referenced in: ${file#"$ROOT_DIR/"}"
        broken=$((broken + 1))
      fi
    done <<< "$srcs"
  done < <(find "$CONTENT_DIR" -name '*.json' -print0 2>/dev/null)

  if [[ $broken -eq 0 ]]; then
    print_pass "All ${checked} image reference(s) resolved."
  else
    print_fail "${broken} broken image reference(s) found."
  fi
}

# ======================================================================
# CHECK 3: UTF-8 validity of JSON files
# ======================================================================
check_utf8() {
  print_header "UTF-8 validity of JSON files"

  if [[ ! -d "$CONTENT_DIR" ]]; then
    print_warn "Content directory not found: ${CONTENT_DIR}"
    return
  fi

  if ! command -v python3 &>/dev/null; then
    print_warn "python3 not available, skipping UTF-8 check."
    return
  fi

  local invalid=0
  local total=0

  while IFS= read -r -d '' file; do
    total=$((total + 1))
    if ! python3 -c "
import sys, json
try:
    with open(sys.argv[1], encoding='utf-8', errors='strict') as f:
        json.load(f)
except UnicodeDecodeError as e:
    print(f'UTF-8 error: {e}')
    sys.exit(1)
except json.JSONDecodeError as e:
    print(f'JSON parse error: {e}')
    sys.exit(1)
" "$file" 2>/tmp/qc_utf8_err; then
      local errmsg
      errmsg=$(cat /tmp/qc_utf8_err 2>/dev/null || echo "unknown error")
      print_fail "${file#"$ROOT_DIR/"}: ${errmsg}"
      invalid=$((invalid + 1))
    fi
  done < <(find "$CONTENT_DIR" -name '*.json' -print0 2>/dev/null)

  if [[ $invalid -eq 0 ]]; then
    print_pass "All ${total} JSON file(s) are valid UTF-8."
  else
    print_fail "${invalid} file(s) failed UTF-8 / JSON validation."
  fi
}

# ======================================================================
# Run checks
# ======================================================================
echo ""
echo "======================================"
echo "  MODX -> Astro  QC Report"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"

case "$CHECK_FILTER" in
  all)    check_modx_tags; check_broken_images; check_utf8 ;;
  modx)   check_modx_tags ;;
  images) check_broken_images ;;
  utf8)   check_utf8 ;;
  *)      echo "Unknown check: ${CHECK_FILTER}. Use modx|images|utf8|all."; exit 1 ;;
esac

# ======================================================================
# Summary
# ======================================================================
echo ""
echo "======================================"
echo "  Summary"
echo "======================================"
if [[ $ERRORS -gt 0 ]]; then
  echo "  FAIL   ${ERRORS} error(s)  |  ${WARNINGS} warning(s)"
  echo "======================================"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo "  WARN   0 errors  |  ${WARNINGS} warning(s)"
  echo "======================================"
  $STRICT && exit 1 || exit 0
else
  echo "  PASS   All checks passed."
  echo "======================================"
  exit 0
fi

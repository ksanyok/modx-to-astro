# ═══════════════════════════════════════════════════════════════
# MODX → Astro  ·  Makefile# b7264r9s | ksanyok | buyreadysite.com# ═══════════════════════════════════════════════════════════════
#
# Quick commands for daily migration workflow.
#
# Usage:
#   make install          Install all dependencies
#   make migrate          Migrate current site (uses .env)
#   make build            Build Astro site
#   make preview          Local preview of built site
#   make deploy           Zero-downtime deploy to server
#   make rollback         Restore previous release
#   make test             Run CLI unit tests
#   make all              migrate + build + deploy (full pipeline)
#   make clean            Remove generated content & assets
#   make batch            Batch-migrate a folder of sites
#   make batch-deploy     Batch full pipeline with deploy
#   make pipeline         Quick single-site pipeline with timing
#
# Configuration: copy .env.example → .env and fill in values.
# Override via: make migrate SQL_PATH=x ASSETS_PATH=y
# ═══════════════════════════════════════════════════════════════

# Defaults
SQL_PATH       ?= data/dump.sql
ASSETS_PATH    ?= data/assets
SITE_DOMAIN    ?=
DEPLOY_HOST    ?=
DEPLOY_PATH    ?=
DEPLOY_PORT    ?= 22
KEEP_RELEASES  ?= 3
HEALTH_URL     ?= $(if $(SITE_DOMAIN),https://$(SITE_DOMAIN),)

# Batch defaults
SITES_DIR    ?= ./sites
BATCH_OUTPUT ?= ./output
BATCH_PARALLEL ?= 4
DOMAIN_SUFFIX ?=

# Load .env (overrides defaults, but CLI args override .env)
-include .env
export

THEME_DIR    := astro-theme
CLI_DIR      := cli
CONTENT_DIR  := $(THEME_DIR)/src/content
DIST_DIR     := $(THEME_DIR)/dist

SITE_FLAG    := $(if $(SITE_DOMAIN),--site https://$(SITE_DOMAIN),)

.PHONY: install migrate qc build preview deploy rollback healthcheck test clean all help batch batch-deploy pipeline

# ── Help (default) ──────────────────────────────────────────

help:
	@echo ""
	@echo "  MODX → Astro Migration Pipeline"
	@echo "  ───────────────────────────────"
	@echo ""
	@echo "  make install      Install CLI + theme dependencies"
	@echo "  make migrate      Run migration (SQL → JSON)"
	@echo "  make qc           Quality-control checks on migrated content"
	@echo "  make build        Build Astro static site"
	@echo "  make preview      Preview built site locally"
	@echo "  make deploy       Deploy to server (symlink, zero-downtime)"
	@echo "  make rollback     Restore previous release (atomic symlink)"
	@echo "  make healthcheck  Verify deployed site returns HTTP 200"
	@echo "  make test         Run CLI unit tests"
	@echo "  make all          Full pipeline: migrate → qc → build → deploy → healthcheck"
	@echo "  make clean        Remove generated content & dist"
	@echo ""
	@echo "  ── Batch (200+ sites) ──────────────────"
	@echo "  make batch       Batch migrate all sites in SITES_DIR"
	@echo "  make batch-deploy  Batch full pipeline with deploy"
	@echo "  make pipeline    Quick single-site pipeline with timing"
	@echo ""
	@echo "  Configuration: .env (copy from .env.example)"
	@echo ""

# ── Install ─────────────────────────────────────────────────

install:
	cd $(CLI_DIR) && npm install
	cd $(THEME_DIR) && npm install

# ── Migrate ─────────────────────────────────────────────────

migrate:
	@echo "━━━ Migrating: $(SQL_PATH) ━━━"
	cd $(CLI_DIR) && node migrate.js \
		--sql "../$(SQL_PATH)" \
		--assets "../$(ASSETS_PATH)" \
		--out ../$(CONTENT_DIR) \
		$(SITE_FLAG) \
		--verbose
	@echo ""
	@echo "Pages:  $$(ls $(CONTENT_DIR)/pages/*.json 2>/dev/null | wc -l | tr -d ' ')"
	@echo "Assets: $$(find $(THEME_DIR)/public/assets -type f 2>/dev/null | wc -l | tr -d ' ')"

# ── Build ───────────────────────────────────────────────────

build:
	@echo "━━━ Building Astro site ━━━"
	cd $(THEME_DIR) && npx astro build
	@echo "Pages built: $$(find $(DIST_DIR) -name '*.html' | wc -l | tr -d ' ')"

# ── Preview ─────────────────────────────────────────────────

preview:
	cd $(THEME_DIR) && npx astro preview

# ── Deploy ──────────────────────────────────────────────────

deploy:
	@test -n "$(DEPLOY_HOST)" || (echo "Error: DEPLOY_HOST not set. See .env"; exit 1)
	@test -n "$(DEPLOY_PATH)" || (echo "Error: DEPLOY_PATH not set. See .env"; exit 1)
	DEPLOY_PORT=$(DEPLOY_PORT) KEEP_RELEASES=$(KEEP_RELEASES) HEALTH_URL=$(HEALTH_URL) \
	  bash scripts/deploy.sh "$(DEPLOY_HOST)" "$(DEPLOY_PATH)"

# ── Rollback ────────────────────────────────────────────────

rollback:
	@test -n "$(DEPLOY_HOST)" || (echo "Error: DEPLOY_HOST not set. See .env"; exit 1)
	DEPLOY_PORT=$(DEPLOY_PORT) bash scripts/deploy.sh --rollback

# -- QC ----------------------------------------------------------------

qc:
	@echo "━━━ QC checks ━━━"
	bash scripts/qc.sh

# -- Health check -------------------------------------------------------

healthcheck:
	@test -n "$(HEALTH_URL)" || (echo "Error: HEALTH_URL not set. See .env"; exit 1)
	@echo "━━━ Health check: $(HEALTH_URL) ━━━"
	@code=$$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' "$(HEALTH_URL)") && \
	  echo "  HTTP $$code" && \
	  [ "$$code" = "200" ] || (echo "  ERROR: expected 200"; exit 1)

# ── Test ────────────────────────────────────────────────────

test:
	cd $(CLI_DIR) && npx jest --verbose

# ── Clean ───────────────────────────────────────────────────

clean:
	rm -rf $(CONTENT_DIR)/pages/*
	rm -f  $(CONTENT_DIR)/site-config.json
	rm -f  $(CONTENT_DIR)/redirects.json
	rm -rf $(THEME_DIR)/public/assets/*
	rm -rf $(DIST_DIR)
	@echo "Cleaned generated content and dist/"

# ── Full pipeline ───────────────────────────────────────────

all: migrate qc build deploy healthcheck

# ── Batch targets (200+ sites) ──────────────────────────────

batch:
	@echo "━━━ Batch Migration ($(SITES_DIR)) — $(BATCH_PARALLEL) workers ━━━"
	node $(CLI_DIR)/batch-migrate.js \
		--sites "$(SITES_DIR)" \
		--theme $(THEME_DIR) \
		--output "$(BATCH_OUTPUT)" \
		--parallel $(BATCH_PARALLEL) \
		$(if $(DOMAIN_SUFFIX),--domain-suffix "$(DOMAIN_SUFFIX)",)

batch-deploy:
	@test -n "$(DEPLOY_HOST)" || (echo "Error: DEPLOY_HOST not set. See .env"; exit 1)
	@test -n "$(DEPLOY_PATH)" || (echo "Error: DEPLOY_PATH not set (used as --deploy-base). See .env"; exit 1)
	@echo "━━━ Batch Pipeline + Deploy ($(SITES_DIR)) — $(BATCH_PARALLEL) workers ━━━"
	node $(CLI_DIR)/batch-migrate.js \
		--sites "$(SITES_DIR)" \
		--theme $(THEME_DIR) \
		--output "$(BATCH_OUTPUT)" \
		--build \
		--parallel $(BATCH_PARALLEL) \
		--deploy-host "$(DEPLOY_HOST)" \
		--deploy-base "$(DEPLOY_PATH)" \
		$(if $(DOMAIN_SUFFIX),--domain-suffix "$(DOMAIN_SUFFIX)",)

# ── Quick pipeline with timing (single site from .env) ──────

pipeline:
	@echo "━━━ Quick Pipeline (timed) ━━━"
	@START=$$(date +%s) && \
	$(MAKE) -s clean && \
	echo "→ Migrating..." && \
	$(MAKE) -s migrate && \
	echo "→ QC checks..." && \
	$(MAKE) -s qc && \
	echo "→ Building..." && \
	$(MAKE) -s build && \
	echo "→ Deploying..." && \
	$(MAKE) -s deploy && \
	echo "→ Health check..." && \
	$(MAKE) -s healthcheck && \
	END=$$(date +%s) && \
	echo "" && \
	echo "═══════════════════════════════════" && \
	echo "  ✓ Pipeline complete: $$((END - START))s total" && \
	echo "═══════════════════════════════════"

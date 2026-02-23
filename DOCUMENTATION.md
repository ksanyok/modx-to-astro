# MODX → Astro Migration System — Documentation

> Automated pipeline for converting 200+ MODX CMS websites into fast, static Astro sites with zero-downtime deployment.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Quick Start](#4-quick-start)
5. [Project Structure](#5-project-structure)
6. [CLI Migration Script](#6-cli-migration-script)
7. [Astro Theme](#7-astro-theme)
8. [Content Collections & Schemas](#8-content-collections--schemas)
9. [Components Reference](#9-components-reference)
10. [Keystatic CMS](#10-keystatic-cms)
11. [Deployment](#11-deployment)
12. [GitLab CI/CD Pipeline](#12-gitlab-cicd-pipeline)
13. [Batch Migration (200+ Sites)](#13-batch-migration-200-sites)
14. [Makefile Commands](#14-makefile-commands)
15. [Troubleshooting](#15-troubleshooting)
16. [FAQ](#16-faq)

---

## 1. Overview

This system migrates MODX CMS websites to static Astro sites. It reads a MySQL/MariaDB SQL dump and the MODX `assets/` directory, then generates:

- **JSON content files** compatible with Astro Content Collections (pages, site config, redirects)
- **Static assets** (images, PDFs, videos) copied to `public/assets/`
- **A fully pre-built Astro site** with all pages, sitemap, 404, and SEO metadata

The result is a fast, secure, zero-maintenance static website that can be hosted anywhere.

### Key Features

| Feature | Description |
|---------|-------------|
| **ContentBlocks mapping** | 17 MODX ContentBlocks layouts → Astro components |
| **5-level image resolution** | Exact match → fuzzy match → phpthumbof cache → glob → skip |
| **Idempotent** | Re-running the migration produces identical output |
| **Theme extraction** | Colors, fonts, logo, navigation from ClientConfig + SQL |
| **Keystatic CMS** | Optional visual editor for post-migration content edits |
| **Zero-downtime deploy** | rsync + atomic directory swap on production server |
| **Batch support** | Migrate/build/deploy hundreds of sites in one command |
| **48 unit tests** | Full test coverage for CLI migration logic |
| **GitLab CI/CD** | 4-stage pipeline with one-click rollback |

---

## 2. Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│  MODX SQL Dump  │──┐   │   CLI migrate.js │──┐   │   Astro Theme      │
│  (dump.sql)     │  │   │                  │  │   │   (astro-theme/)   │
├─────────────────┤  ├──▶│  Parse SQL        │  ├──▶│   src/content/     │
│  MODX Assets    │  │   │  Map blocks       │  │   │     pages/*.json   │
│  (assets/)      │──┘   │  Resolve images   │  │   │     site-config.json│
│                 │      │  Build config      │  │   │   public/assets/   │
│                 │      │  Copy assets       │──┘   │   dist/ (built)    │
└─────────────────┘      └──────────────────┘      └────────────────────┘
                                                            │
                                                            ▼
                                                   ┌────────────────────┐
                                                   │   Production       │
                                                   │   Server (rsync)   │
                                                   │   Zero-downtime    │
                                                   └────────────────────┘
```

**Data flow:**
1. **Input:** SQL dump + `assets/` directory from MODX
2. **CLI parses SQL** → extracts resources, ContentBlocks, ClientConfig, redirects
3. **Maps ContentBlocks layouts** to typed JSON blocks (17 layout types)
4. **Resolves images** using a 5-level resolution strategy
5. **Outputs JSON** files into `astro-theme/src/content/`
6. **Copies assets** to `astro-theme/public/assets/`
7. **Astro builds** the static site using Content Collections
8. **Deploy** via rsync with atomic swap

---

## 3. Prerequisites

- **Node.js** ≥ 18 (recommended: 20 LTS)
- **npm** ≥ 8
- **SSH access** to the deployment server (for deploy/rollback)
- **SQL dump** from MODX (exported via phpMyAdmin, mysqldump, or Plesk)
- **MODX assets directory** (the `assets/` folder from the MODX installation)

### Installing Node.js

```bash
# macOS (Homebrew)
brew install node@20

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

---

## 4. Quick Start

### 4.1 — Single-Site Migration

```bash
# 1. Clone the repository
git clone <repo-url> && cd modx-to-astro

# 2. Install dependencies
make install
# — or manually:
cd cli && npm install && cd ../astro-theme && npm install && cd ..

# 3. Place your data
mkdir -p data
cp /path/to/dump.sql data/dump.sql
cp -r /path/to/assets data/assets

# 4. Configure
cp .env.example .env
# Edit .env with your site's domain, deploy host, etc.

# 5. Run migration
make migrate

# 6. Preview locally
make preview
# Open http://localhost:4321

# 7. Build & deploy
make build
make deploy
```

### 4.2 — Minimal Example (No Makefile)

```bash
# Migrate
cd cli
node migrate.js --sql ../data/dump.sql --assets ../data/assets --out ../astro-theme/src/content --site https://example.ch --verbose

# Build
cd ../astro-theme
npx astro build

# Preview
npx astro preview
```

---

## 5. Project Structure

```
modx-to-astro/
├── .env.example              # Environment config template
├── .env                      # Your site's configuration (git-ignored)
├── .gitlab-ci.yml            # GitLab CI/CD pipeline (4 stages + rollback)
├── Makefile                  # Convenience commands (make migrate, etc.)
├── DOCUMENTATION.md          # This file
│
├── cli/                      # Migration CLI
│   ├── migrate.js            # Main migration script (~1660 lines, 28 functions)
│   ├── migrate.test.js       # Jest unit tests (48 tests)
│   ├── batch-migrate.js      # Batch migration for 200+ sites
│   └── package.json          # Node.js dependencies (fs-extra, minimist)
│
├── astro-theme/              # Astro static site template
│   ├── astro.config.mjs      # Astro configuration
│   ├── keystatic.config.ts   # Keystatic CMS configuration
│   ├── package.json          # Astro + Tailwind dependencies
│   │
│   ├── src/
│   │   ├── content.config.ts # Content Collection schemas (Zod)
│   │   ├── content/          # Generated content (populated by CLI)
│   │   │   ├── pages/        # Page JSON files (one per MODX resource)
│   │   │   ├── site-config.json  # Global site configuration
│   │   │   └── redirects.json    # 301 redirect mappings
│   │   │
│   │   ├── styles/
│   │   │   └── global.css    # Global styles + CSS custom properties
│   │   │
│   │   ├── layouts/
│   │   │   ├── BaseLayout.astro  # HTML shell, meta tags, theme vars
│   │   │   └── PageLayout.astro  # Header + Footer + content wrapper
│   │   │
│   │   ├── components/       # 14 UI components
│   │   │   ├── Header.astro      # Navigation, dropdowns, mobile menu
│   │   │   ├── Footer.astro      # Footer with links, social, legal
│   │   │   ├── Hero.astro        # Hero banner (image/video background)
│   │   │   ├── ContentRenderer.astro  # Block-type dispatcher (17 types)
│   │   │   ├── Section.astro     # Content section wrapper
│   │   │   ├── Grid.astro        # Multi-column grid layout
│   │   │   ├── TextBlock.astro   # Rich text / HTML content
│   │   │   ├── ImageBlock.astro  # Responsive image with caption
│   │   │   ├── Gallery.astro     # Image gallery with lightbox
│   │   │   ├── Slider.astro      # Touch-enabled carousel
│   │   │   ├── Heading.astro     # Section heading
│   │   │   ├── Divider.astro     # Visual separator
│   │   │   ├── FeatureList.astro # Icon feature list
│   │   │   └── ContactForm.astro # Contact form with submission handler
│   │   │
│   │   ├── utils/
│   │   │   └── socialIcons.ts    # Shared social media SVG icons
│   │   │
│   │   └── pages/
│   │       ├── index.astro       # Homepage
│   │       ├── [...slug].astro   # Dynamic catch-all page
│   │       └── 404.astro         # Custom 404 page
│   │
│   ├── public/
│   │   └── assets/           # Static assets (copied by CLI)
│   │       └── uploads/      # Images, PDFs, etc.
│   │
│   └── dist/                 # Built output (git-ignored)
│
├── scripts/
│   └── deploy.sh             # Zero-downtime deploy script
│
└── data/                     # Site data (git-ignored or per-fork)
    ├── dump.sql              # MODX SQL dump
    └── assets/               # MODX assets directory
```

---

## 6. CLI Migration Script

### Location: `cli/migrate.js`

The migration script is a single Node.js file (~1660 lines) with 28 exported functions. It parses a MODX SQL dump and generates Astro-compatible content.

### Usage

```bash
node migrate.js [options]

Options:
  --sql <path>      Path to the SQL dump file (required)
  --assets <path>   Path to the MODX assets directory (required)
  --out <path>      Output directory for content files (required)
  --site <url>      Production site URL (for canonical/sitemap)
  --verbose         Enable detailed logging
```

### What It Does (Step by Step)

1. **Reads the SQL dump** and extracts all INSERT statements for:
   - `modx_site_content` (resources/pages)
   - `modx_content_type` (MIME types)
   - `modx_contentblocks_*` (ContentBlocks layouts, fields, content)
   - `modx_clientconfig_*` (ClientConfig settings — theme, logo, etc.)
   - `modx_seosuite_redirects` (301 redirects from SEO Suite)

2. **Parses SQL values** with a custom SQL value parser that handles:
   - Escaped quotes, backslashes, NULL values
   - Multi-value INSERT statements
   - Unicode content

3. **Maps each resource** to a page JSON file:
   - `title`, `description`, `slug`, `isHomepage`, `template`
   - `blocks[]` — array of typed content blocks

4. **Processes ContentBlocks layouts** (17 types):
   - `hero`, `section`, `text`, `image`, `gallery`, `slider`, `grid`
   - `heading`, `divider`, `video`, `youtube`, `button`, `form`
   - `accordion`, `featureList`, `html`, `columns`

5. **Resolves images** using 5-level strategy:
   - Level 1: Exact file path match in assets directory
   - Level 2: Normalized filename match (lowercase, no spaces/special chars)
   - Level 3: phpthumbof cache filename extraction & match
   - Level 4: Glob-based pattern search
   - Level 5: Skip with warning

6. **Builds site configuration:**
   - Company name, address, phone, email from ClientConfig
   - Logo, favicon, social links
   - Navigation tree (from MODX menu structure)
   - Theme colors & fonts
   - Footer content, legal pages

7. **Extracts redirects** from SEO Suite tables

8. **Copies assets** from source `assets/` to `astro-theme/public/assets/`

### Key Functions

| Function | Purpose |
|----------|---------|
| `main()` | Entry point — orchestrates the full migration |
| `extractResources(sql)` | Parses INSERT statements for site_content |
| `parseSQLValues(str)` | Custom SQL value string parser |
| `mapRowToResource(row)` | Maps SQL columns to resource object |
| `processContentBlocks(properties, resourceMap)` | Converts CB data to typed blocks |
| `processLayoutBlock(layoutBlock, resourceMap)` | Routes to layout-specific processor |
| `resolveImagePath(url, source)` | 5-level image resolution |
| `fuzzyFindFile(filename)` | Normalized filename matching |
| `resolvePhpThumbOf(cacheUrl)` | Extracts original path from phpthumbof cache URL |
| `cleanHtml(html)` | Strips MODX tags, fixes links |
| `buildSiteConfig(resources, clientConfig, pages)` | Generates site-config.json |
| `extractClientConfig(sql)` | Reads ClientConfig settings |
| `extractRedirects(sql)` | Reads SEO Suite redirects |
| `copyAssets(srcDir, destDir)` | Copies + deduplicates asset files |

### Unit Tests

```bash
cd cli
npx jest --verbose
# 48 tests across all major functions
```

Test coverage includes:
- SQL parsing (escaped strings, NULLs, multi-value INSERTs)
- Image resolution (all 5 levels)
- ContentBlocks mapping (all 17 layout types)
- HTML cleaning (MODX tags, links, entities)
- Site config generation (navigation, theme, social links)
- Redirect extraction
- Edge cases (empty inputs, malformed data)

---

## 7. Astro Theme

### Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Astro | 5.x | Static site generator |
| Tailwind CSS | 4.x | Utility-first CSS |
| Keystatic | latest | Optional CMS admin panel |
| TypeScript | 5.x | Type safety for schemas |

### Configuration: `astro.config.mjs`

```javascript
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import keystatic from '@keystatic/astro';

const isKeystatic = process.env.KEYSTATIC === 'true';

export default defineConfig({
  output: isKeystatic ? 'hybrid' : 'static',
  site: 'https://example.ch',
  vite: { plugins: [tailwindcss()] },
  integrations: isKeystatic ? [keystatic()] : [],
});
```

### Theming System

The theme uses CSS custom properties that are overridden per-site via `BaseLayout.astro`:

| CSS Variable | Default | Controlled By |
|-------------|---------|--------------|
| `--color-primary` | `#18181b` | `theme.primaryColor` |
| `--color-accent` | `#3b82f6` | `theme.accentColor` |
| `--color-accent-dark` | `#2563eb` | `theme.accentColorDark` |
| `--color-accent-light` | `#eff6ff` | Auto-calculated (8% mix) |
| `--color-bg` | `#ffffff` | `theme.backgroundColor` |
| `--color-text` | `#1e1e2e` | `theme.textColor` |
| `--font-body` | Inter, sans-serif | `theme.bodyFont` |
| `--font-heading` | Inter, sans-serif | `theme.headingFont` |

Google Fonts are automatically loaded based on the font families configured in the theme.

---

## 8. Content Collections & Schemas

### Location: `astro-theme/src/content.config.ts`

The content schema defines three collections:

#### Pages Collection

Each page has:
- `title` (string, required)
- `description` (string, optional — meta description)
- `slug` (string — URL path)
- `isHomepage` (boolean)
- `template` (number — MODX template ID for reference)
- `blocks` (array — discriminated union of 17 block types)

#### Site Config (Singleton)

Global settings:
- `companyName`, `companyAddress`, `companyPhone`, `companyEmail`
- `siteUrl`, `logo`, `favicon`
- `socialLinks[]` (platform + URL)
- `navigation[]` (label + href + children)
- `legalPages[]` (Impressum, Datenschutz, etc.)
- `theme{}` (colors, fonts)
- `footer{}` (text, copyright)

#### Redirects Collection

Array of `{ from, to, code }` for 301 redirects, generated from SEO Suite data.

### Block Types (Discriminated Union)

The `blocks` array uses a `type` discriminator. All 17 types:

| Type | Component | Description |
|------|-----------|-------------|
| `hero` | `Hero.astro` | Full-width hero with image/video background |
| `section` | `Section.astro` | Content section with background options |
| `text` | `TextBlock.astro` | Rich HTML text content |
| `image` | `ImageBlock.astro` | Single image with alt text and caption |
| `gallery` | `Gallery.astro` | Image grid with lightbox |
| `slider` | `Slider.astro` | Touch-enabled card carousel |
| `grid` | `Grid.astro` | Multi-column layout (2-4 columns) |
| `heading` | `Heading.astro` | Section heading (h2/h3/h4) |
| `divider` | `Divider.astro` | Visual separator line |
| `video` | inline | HTML5 video with poster |
| `youtube` | inline | YouTube embed (privacy-mode) |
| `button` | inline | CTA button with link |
| `form` | `ContactForm.astro` | Contact form with submission handler |
| `accordion` | inline | Expandable FAQ/accordion items |
| `featureList` | `FeatureList.astro` | Feature cards with icons |
| `html` | inline | Raw HTML passthrough |
| `columns` | `Grid.astro` | Multi-column content wrapper |

---

## 9. Components Reference

### Header.astro
- Sticky header with scroll-shadow effect
- Desktop navigation with dropdown sub-menus
- Mobile hamburger menu with slide-in animation
- Social media icon links
- **Accessibility:** Keyboard-navigable dropdowns (Enter/Space/Arrow/Escape), aria-haspopup, aria-expanded, body scroll lock on mobile menu

### Footer.astro
- Company information (name, address, phone, email)
- Page navigation links
- Legal page links (Impressum, Datenschutz)
- Social media icons
- Copyright notice

### Hero.astro
- Title (`<h1>`) and subtitle (`<p>`)
- Supports image background, video background, or gradient fallback
- Configurable: min-height (small/medium/full), text alignment, vertical alignment
- Background position control, overlay opacity
- Scroll-down chevron animation on full-height heroes

### ContentRenderer.astro
- Block-type dispatcher — maps `block.type` to the appropriate component
- Handles all 17 block types
- Wraps most blocks in `animate-on-scroll` for scroll-reveal animations
- YouTube embeds use privacy-enhanced mode (`youtube-nocookie.com`)

### Gallery.astro
- Responsive image grid (2, 3, or 4 columns)
- Click-to-expand lightbox with prev/next navigation
- Keyboard support (Arrow keys, Escape to close)
- Touch-friendly on mobile

### Slider.astro
- Card carousel with prev/next buttons
- Responsive: 1 card on mobile, 3 on desktop
- Touch swipe support with gesture detection
- Auto-recalculates on window resize
- ARIA carousel roles and labels

### ContactForm.astro
- Form with name, email, phone, message fields
- Honeypot anti-spam field (hidden, detected on submit)
- Loading state with spinner
- Success/error message feedback
- Supports API endpoint (Formspree/Web3Forms) or mailto fallback

### Grid.astro
- Renders multi-column layouts (1-4 columns)
- Responsive breakpoints: stack on mobile, side-by-side on desktop
- Each column renders its own array of blocks recursively

### Section.astro
- Content wrapper with optional background color/image
- Adds subtle animations and spacing

### Other Components
- **TextBlock.astro** — Renders rich HTML content with prose styling
- **ImageBlock.astro** — Responsive image with optional caption, link, alt text
- **Heading.astro** — Section heading with configurable level (h2–h4)
- **Divider.astro** — Visual separator with configurable width
- **FeatureList.astro** — Feature cards in a responsive grid

---

## 10. Keystatic CMS

Keystatic provides a visual admin panel for editing content after migration. It is **optional** and only available in development mode.

### Enabling Keystatic

```bash
cd astro-theme
KEYSTATIC=true npm run dev
# Then open: http://localhost:4321/keystatic
```

### What You Can Edit

| Section | Editable Fields |
|---------|----------------|
| **Site Configuration** | Company name, address, phone, email, logo, favicon, social links, navigation, theme colors/fonts |
| **Pages** | Title, meta description, slug, homepage flag, content blocks |

### How It Works

1. Keystatic reads/writes to the same JSON files in `src/content/` that the CLI generates
2. Changes are saved directly to the local filesystem
3. For production, the site is always built as a static site (`output: 'static'`)
4. When `KEYSTATIC=true`, Astro switches to `output: 'hybrid'` to serve the admin UI

### Typical Workflow

1. Run CLI migration to generate initial content
2. Enable Keystatic to make manual adjustments (fix text, update images, etc.)
3. Build the static site: `npx astro build`
4. Deploy

---

## 11. Deployment

### Zero-Downtime Deploy Strategy

The deployment uses rsync + atomic directory swap:

```
1. rsync dist/ → server:/path-staging/     (upload new files)
2. mv /path → /path-prev                   (backup current)
3. mv /path-staging → /path                (go live — atomic)
```

This ensures:
- **Zero downtime** — the swap is instant (single `mv` operation)
- **Instant rollback** — previous release is kept as `-prev`
- **Safe** — if rsync fails, the live site is unaffected

### Manual Deploy

```bash
# Ensure .env has DEPLOY_HOST and DEPLOY_PATH set
make deploy

# Or directly:
bash scripts/deploy.sh user@server /var/www/vhosts/example.ch/httpdocs
```

### Rollback

```bash
make rollback
# Or:
bash scripts/deploy.sh --rollback
```

### Deploy Configuration (.env)

```dotenv
# SSH user@host for rsync
DEPLOY_HOST=user@server.example.com

# Remote document root path
DEPLOY_PATH=/var/www/vhosts/example.ch/httpdocs
```

### Preserved Files

The deploy script preserves these files on the server (never overwritten):
- `.well-known/` (SSL verification, etc.)
- `cgi-bin/`
- `.htaccess` (Apache rules)
- `.user.ini` (PHP configuration)

---

## 12. GitLab CI/CD Pipeline

### Overview

The `.gitlab-ci.yml` defines a 4-stage pipeline with an additional rollback job:

```
migrate → test → build → deploy (manual) → rollback (manual)
```

| Stage | Image | Action |
|-------|-------|--------|
| **migrate** | `node:20-alpine` | Run CLI: SQL + assets → JSON content |
| **test** | `node:20-alpine` | Run Jest unit tests |
| **build** | `node:20-alpine` | Run `npx astro build` |
| **deploy** | `alpine` | rsync to server + atomic swap |
| **rollback** | `alpine` | Restore previous release |

### How GitLab CI Works Without Direct Access

**Important:** The GitLab pipeline does NOT need direct access to your local machine or your MODX server. Here's how it works:

#### Step 1: Repository Setup

Each site gets its own GitLab repository. The repository contains:
```
repo/
├── data/
│   ├── dump.sql          ← SQL dump committed to the repo
│   └── assets/           ← MODX assets committed to the repo
├── cli/                  ← Migration scripts (shared)
├── astro-theme/          ← Astro theme template (shared)
└── .gitlab-ci.yml        ← Pipeline definition
```

You export the SQL dump and assets directory from the MODX site, place them in the `data/` folder, and push to GitLab. The pipeline runs entirely on GitLab's servers (GitLab Runners).

#### Step 2: CI/CD Variables

You must configure three variables in **GitLab → Settings → CI/CD → Variables**:

| Variable | Type | Value | Example |
|----------|------|-------|---------|
| `SSH_PRIVATE_KEY` | File or Variable | SSH private key for the deploy server | Contents of `~/.ssh/id_rsa` |
| `DEPLOY_HOST` | Variable | SSH user@host | `user@your-server.com` |
| `DEPLOY_PATH` | Variable | Remote document root path | `/var/www/vhosts/domain.ch/httpdocs` |

Optional variables (can also be set in `.gitlab-ci.yml`):
| Variable | Default | Purpose |
|----------|---------|---------|
| `SITE_DOMAIN` | `example.ch` | Production domain for sitemap/canonical URLs |
| `SQL_PATH` | `data/dump.sql` | Path to SQL dump in repo |
| `ASSETS_PATH` | `data/assets` | Path to assets in repo |

#### Step 3: SSH Key Setup

The deployment server needs to authorize the SSH key:

```bash
# 1. Generate a key pair (on your local machine)
ssh-keygen -t ed25519 -C "gitlab-deploy" -f gitlab-deploy-key

# 2. Add the PUBLIC key to the server's authorized_keys
ssh user@server "echo '$(cat gitlab-deploy-key.pub)' >> ~/.ssh/authorized_keys"

# 3. Add the PRIVATE key to GitLab CI/CD Variables
#    Variable name: SSH_PRIVATE_KEY
#    Value: contents of gitlab-deploy-key
#    Type: File (recommended) or Variable
```

#### Step 4: Pipeline Execution

When you push to `main`/`master` or trigger the pipeline manually (via GitLab UI → CI/CD → Pipelines → Run pipeline):

1. **GitLab Runner** (a cloud VM) picks up the job
2. It pulls a Docker image (`node:20-alpine` or `alpine`)
3. It clones your repository (including `data/dump.sql` and `data/assets/`)
4. It runs the migration, tests, and build inside the container
5. For deploy: it installs `rsync` + `openssh-client`, loads the SSH key from CI/CD Variables, and connects to your production server

**The pipeline never needs access to your MODX server.** It only needs:
- The SQL dump (committed to the repo)
- The assets directory (committed to the repo)
- SSH access to the **deployment server** (via the private key in CI/CD Variables)

#### Step 5: Deploy and Rollback

- **Deploy** is a **manual** action — you must click the "play" button in the GitLab UI
- **Rollback** is also manual — one click to restore the previous release

### Pipeline Rules

| Trigger | migrate | test | build | deploy | rollback |
|---------|---------|------|-------|--------|----------|
| Push to main/master | ✅ Auto | ✅ Auto | ✅ Auto | 🔵 Manual | 🔵 Manual |
| Merge request | ✅ Auto | ✅ Auto | ❌ Skip | ❌ Skip | ❌ Skip |
| Manual (web) | ✅ Auto | ✅ Auto | ✅ Auto | 🔵 Manual | ❌ Skip |

---

## 13. Batch Migration (200+ Sites)

### Location: `cli/batch-migrate.js`

For migrating many sites at once, use the batch migration script.

### Directory Structure

```
sites/
├── azotea/
│   ├── dump.sql          (or azotea.sql — any *.sql file)
│   └── assets/
│       └── components/
│       └── uploads/
├── kp-services/
│   ├── kpservices.sql
│   └── assets/
│       └── ...
├── another-site/
│   ├── dump.sql
│   └── assets/
│       └── ...
└── ...
```

### Usage

```bash
# Migrate all sites
node cli/batch-migrate.js \
  --sites ./sites \
  --theme ./astro-theme \
  --output ./output \
  --verbose

# Migrate + build
node cli/batch-migrate.js \
  --sites ./sites \
  --theme ./astro-theme \
  --output ./output \
  --build \
  --verbose

# Migrate + build + deploy
node cli/batch-migrate.js \
  --sites ./sites \
  --theme ./astro-theme \
  --output ./output \
  --build \
  --deploy-host user@your-server.com \
  --deploy-base ~/www \
  --verbose

# Process only specific sites
node cli/batch-migrate.js \
  --sites ./sites \
  --theme ./astro-theme \
  --output ./output \
  --only azotea,kp-services

# Skip certain sites
node cli/batch-migrate.js \
  --sites ./sites \
  --theme ./astro-theme \
  --output ./output \
  --skip broken-site
```

### Options

| Flag | Required | Description |
|------|----------|-------------|
| `--sites` | Yes | Directory containing site folders |
| `--theme` | Yes | Path to the Astro theme template |
| `--output` | Yes | Output directory for built sites |
| `--only` | No | Comma-separated list of site names to process |
| `--skip` | No | Comma-separated list of site names to skip |
| `--build` | No | Build each site with Astro after migration |
| `--deploy-host` | No | SSH host for rsync deploy |
| `--deploy-base` | No | Remote base path for deployment |
| `--domain-suffix` | No | Auto-generate SITE_DOMAIN (e.g., `.example.ch`) |
| `--parallel` | No | Number of parallel workers (default: 1, max: 10) |
| `--dry-run` | No | Show plan without executing |
| `--verbose` | No | Enable detailed logging |

### Parallel Processing

The batch script supports true parallel execution via a worker pool.
Each worker picks the next available site from the queue, so all workers are kept busy.

```bash
# Process 4 sites at a time in parallel
node cli/batch-migrate.js \
  --sites ./sites --theme ./astro-theme --output ./output \
  --build --parallel 4

# Full pipeline: 5 workers + deploy + auto-domains
node cli/batch-migrate.js \
  --sites ./sites --theme ./astro-theme --output ./output \
  --build --parallel 5 \
  --deploy-host user@server --deploy-base ~/www \
  --domain-suffix ".example.ch"

# Dry run to see what would happen
node cli/batch-migrate.js \
  --sites ./sites --theme ./astro-theme --output ./output --dry-run
```

The batch script produces:
- Per-site timing breakdown (migrate / build / deploy)
- `batch-report.json` with full results
- Estimate for 200 sites at different parallelism levels

### Three Approaches for 200+ Sites

#### Approach A: Local Batch (Recommended for First Run)

Best for initial migration and verification:

```bash
# 1. Place all site folders in sites/
# 2. Run batch migration
node cli/batch-migrate.js --sites ./sites --theme ./astro-theme --output ./output --build --verbose

# 3. Check output
ls output/*/dist/

# 4. Deploy individually or write a deploy loop
for site in output/*/; do
  name=$(basename "$site")
  rsync -az --delete "$site/dist/" "user@server:/www/$name/"
done
```

#### Approach B: Per-Site GitLab Repos

Best for ongoing maintenance (each site is independent):

1. Create one GitLab repo per site
2. Each repo has: `data/dump.sql`, `data/assets/`, shared `cli/`, `astro-theme/`, `.gitlab-ci.yml`
3. Configure CI/CD Variables per repo (SSH_PRIVATE_KEY, DEPLOY_HOST, DEPLOY_PATH)
4. Push to trigger the pipeline

#### Approach C: Single Repo with Matrix Pipeline

Best for teams managing all sites centrally. Use GitLab CI/CD with a parameter matrix to build each site as a separate job. Configure `SITE_NAME` as a trigger variable.

---

## 14. Makefile Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make install` | Install CLI + theme npm dependencies |
| `make migrate` | Run migration (SQL → JSON + copy assets) |
| `make build` | Build the Astro static site |
| `make preview` | Preview the built site locally (port 4321) |
| `make deploy` | Zero-downtime deploy to server |
| `make rollback` | Restore previous release |
| `make test` | Run CLI unit tests (Jest) |
| `make clean` | Remove generated content, assets, and dist |
| `make all` | Full pipeline: `migrate` → `build` → `deploy` |
| `make batch` | Batch-migrate all sites in `SITES_DIR` |
| `make batch-deploy` | Full batch pipeline with deploy |
| `make pipeline` | Quick single-site pipeline with timing |

### Override Variables

```bash
# Override SQL path
make migrate SQL_PATH=path/to/other.sql ASSETS_PATH=path/to/other/assets

# Override deploy target
make deploy DEPLOY_HOST=user@server DEPLOY_PATH=/var/www/site

# Batch with custom settings
make batch SITES_DIR=./my-sites BATCH_PARALLEL=6
make batch-deploy SITES_DIR=./sites BATCH_PARALLEL=8 DEPLOY_HOST=user@server DEPLOY_PATH=~/www

# Quick pipeline (clean → migrate → build → deploy) 
make pipeline
```

### Quick Pipeline Script

A standalone shell script for single-site full pipeline with per-step timing:

```bash
# Uses .env for all settings
./scripts/quick-pipeline.sh

# Skip deploy step
./scripts/quick-pipeline.sh --no-deploy

# Override via environment
SQL_PATH=../site/dump.sql ASSETS_PATH=../site/assets ./scripts/quick-pipeline.sh
```

---

## 15. Troubleshooting

### Common Issues

#### "No pages generated"

- Check that the SQL dump contains `modx_site_content` table
- Ensure resources have `published = 1`
- Run with `--verbose` to see which resources are being processed

#### "Images not found"

- Verify the assets directory structure matches the MODX installation
- The CLI logs all unresolved images — check the output
- Common structure: `assets/uploads/`, `assets/components/phpthumbof/cache/`

#### "Build fails with schema errors"

- Run `make clean` first to remove stale content
- Check that `content.config.ts` matches the JSON output format
- Look at the specific error — usually a missing required field

#### "Deploy permission denied"

- Verify SSH key is correct and the user has write access
- Test manually: `ssh user@server "ls /path/to/webroot"`
- Ensure the deploy path exists on the server

#### "ContentBlocks not converting"

- The CLI requires `modx_contentblocks_layouts`, `modx_contentblocks_fields`, and `modx_contentblocks_content` tables
- If these tables are missing, the page falls back to the `content` field from `modx_site_content`

### Debug Mode

```bash
# Verbose migration output
cd cli && node migrate.js --sql ../data/dump.sql --assets ../data/assets --out ../astro-theme/src/content --verbose 2>&1 | tee migration.log

# Check generated content
cat astro-theme/src/content/site-config.json | python3 -m json.tool
ls -la astro-theme/src/content/pages/

# Check Astro build errors
cd astro-theme && npx astro build --verbose
```

---

## 16. FAQ

### Q: Can I customize the theme per site?

**Yes.** Each site's `site-config.json` includes theme colors, fonts, logo, and navigation. The CLI extracts these from MODX ClientConfig. After migration, you can also edit them via Keystatic or directly in the JSON files.

### Q: What happens to MODX plugins/snippets?

MODX tags (`[[*field]]`, `[[snippet]]`, `[[++setting]]`) are stripped during migration. Dynamic functionality (forms, search, etc.) needs to be replaced with static alternatives or third-party services.

### Q: Can I add new pages after migration?

**Yes.** Either:
- Add a new JSON file to `src/content/pages/` manually
- Use Keystatic CMS to create pages visually
- Re-run the migration with an updated SQL dump

### Q: How do redirects work in static sites?

Redirects are generated as a `redirects.json` collection. They are applied via:
- Astro's built-in redirect support (in `astro.config.mjs`)
- Meta refresh tags in generated redirect pages
- Server-side `.htaccess` rules (if on Apache)

### Q: How much disk space do I need?

Typical site: 50-200 MB (mostly images). The batch output for 200 sites could be 10-40 GB. Build artifacts (dist/) are typically 5-30 MB per site.

### Q: Can I use a different CSS framework?

The theme uses Tailwind CSS 4.x. You can replace it, but you'd need to restyle all 14 components. The CSS custom properties (`--color-*`, `--font-*`) work independently of Tailwind.

### Q: What if a MODX site doesn't use ContentBlocks?

The CLI falls back to the `content` field in `modx_site_content`. The page will have a single `text` block containing the raw HTML content.

### Q: How do I add analytics or tracking scripts?

Edit `BaseLayout.astro` and add your script tags (e.g., Google Analytics, Matomo) to the `<head>` or before `</body>`.

---

## License

Internal tool — not for public distribution.

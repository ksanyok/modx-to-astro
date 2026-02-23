# MODX → Astro Migration System

> Scalable migration pipeline: Import → Transform → Generate → Deploy

## Architecture

```
modx-to-astro/
├── cli/                        # Migration CLI tool
│   ├── migrate.js              # Main migration script (~1660 lines)
│   ├── batch-migrate.js        # Batch migration for N sites
│   └── migrate.test.js         # 48 unit tests (Jest)
├── astro-theme/                # Universal Astro master theme
│   ├── src/
│   │   ├── components/         # 14 reusable components
│   │   ├── layouts/            # BaseLayout, PageLayout
│   │   ├── pages/              # index.astro, [...slug].astro, 404.astro
│   │   ├── styles/             # global.css (Tailwind 4 + CSS vars)
│   │   ├── content/            # Generated per-site content (JSON)
│   │   └── content.config.ts   # Zod schemas for Content Collections
│   ├── keystatic.config.ts     # Keystatic CMS config (dev-mode)
│   ├── public/assets/          # Media files (copied from MODX)
│   └── astro.config.mjs
├── scripts/
│   └── deploy.sh               # Zero-downtime deploy (rsync + atomic swap)
├── docs/
│   └── migration-guide.md      # Full team documentation
├── .gitlab-ci.yml              # CI/CD: migrate → test → build → deploy + rollback
├── Makefile                    # Quick commands: make migrate / build / deploy / all
└── .env.example                # Configuration template
```

---

## Quick Start (Migrate a New Site)

### 1. Prerequisites

```bash
# Install dependencies once
make install
# Or manually:
cd cli && npm install && cd ../astro-theme && npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your site details:
#   SQL_PATH=data/dump.sql
#   ASSETS_PATH=data/assets
#   SITE_DOMAIN=client.ch
#   DEPLOY_HOST=user@server
#   DEPLOY_PATH=/var/www/vhosts/client.ch/httpdocs
```

### 3. One-command pipeline

```bash
make all    # migrate → build → deploy (zero-downtime)
```

Or step by step:

```bash
make migrate    # SQL + assets → JSON content
make build      # Astro static build
make preview    # Check locally at localhost:4321
make deploy     # Zero-downtime rsync deploy
make rollback   # Instant rollback if needed
```

---

## Per-Site Customization

### Automatic (from MODX ClientConfig)

The migration script automatically extracts from `modx_clientconfig_setting`:

| MODX Key | Output | Description |
|----------|--------|-------------|
| `site_name` | `companyName` | Company name |
| `client-adress` | `companyAddress` | Address (HTML) |
| `clientphone` | `companyPhone` | Phone number |
| `clientmail` | `companyEmail` | Email address |
| `logo` | `logo` | Logo image path |
| `favicon` | `favicon` | Favicon path |
| `pagecolor1` | `theme.primaryColor` | Primary color (hex) |
| `pagecolor2` | `theme.secondaryColor` | Secondary color |
| `body-color` | `theme.backgroundColor` | Background color |
| `font-color` | `theme.textColor` | Text color |
| `font1` | `theme.bodyFont` | Body font family |
| `font2` | `theme.headingFont` | Heading font family |
| `facebook` | `socialLinks` | Facebook URL |
| `insta` | `socialLinks` | Instagram URL |

### Manual Override

Edit `astro-theme/src/content/site-config.json`:

```json
{
  "companyName": "Client GmbH",
  "logo": "/assets/userupload/logo.png",
  "theme": {
    "primaryColor": "#1e365a",
    "accentColor": "#3b82f6",
    "accentColorDark": "#2563eb",
    "backgroundColor": "#ffffff",
    "textColor": "#1e365a",
    "bodyFont": "'Montserrat', sans-serif",
    "headingFont": "'Comfortaa', cursive"
  }
}
```

Theme colors are injected as CSS custom properties on `<body>`. Google Fonts are loaded automatically if custom fonts are specified.

### What's configurable without code changes:
- **Colors**: Edit `theme.*` in site-config.json
- **Fonts**: Edit `theme.bodyFont` / `theme.headingFont`
- **Logo**: Replace image, update `logo` path
- **Navigation**: Auto-generated from MODX menu, or edit `navigation` array
- **Social links**: Auto-extracted, or edit `socialLinks` array

---

## Migration CLI Details

### How it works

1. Reads the raw SQL dump file (no running database needed)
2. Parses `INSERT INTO modx_site_content` to extract all resources
3. For each resource, parses the `properties` column (index 43) which contains ContentBlocks JSON
4. ContentBlocks data is a nested structure: `properties.contentblocks.content` → stringified JSON array of layout blocks
5. Maps each layout + field combination to Astro component data
6. Extracts `modx_clientconfig_setting` for site-level config
7. Extracts `modx_seosuite_redirect` for SEO redirects
8. Resolves `[[~ID]]` MODX tags to actual page URLs
9. Strips MODX tags (`[[$chunk]]`, `[[!snippet]]`, `[[+placeholder]]`, etc.)
10. Resolves phpThumbOf cache paths to original files
11. Copies media assets to `public/assets/`

### Supported ContentBlocks Layouts

| ID | Name | Astro Component |
|----|------|-----------------|
| 1 | 1-Column | `<Section>` |
| 2 | 50/50 | `<Grid columns="50-50">` |
| 3 | 60/40 | `<Grid columns="60-40">` |
| 4 | 40/60 | `<Grid columns="40-60">` |
| 5 | Divider | `<Divider>` |
| 6 | 30/30/30 | `<Grid columns="30-30-30">` / `<Gallery>` |
| 8 | 30/70 | `<Grid columns="30-70">` |
| 9 | Hero | `<Hero>` |
| 18 | 25/25/25/25 | `<Grid columns="25-25-25-25">` |
| 19 | AI Article | Section + Heading + Text |
| 20 | AI Expert | Section + Heading + Text |

### Supported ContentBlocks Fields

| ID | Type | Output |
|----|------|--------|
| 2 | Heading | `{ type: "heading", text, level }` |
| 3 | Richtext | `{ type: "text", content }` |
| 4 | Image | `{ type: "image", src, alt }` |
| 5 | Link Box | `{ type: "buttons", links }` |
| 11 | Accordion | `{ type: "accordion", items }` |
| 14 | Slider | `{ type: "slider", slides }` |
| 22/78 | Gallery | `{ type: "gallery", images }` |
| 25 | Video | `{ type: "video", src }` |
| 26 | YouTube | `{ type: "youtube", url }` |
| 27/77 | Code/Iframe | `{ type: "html", content }` |
| 28 | Buttons | `{ type: "buttons", links }` |
| 33 | Icon List | `{ type: "features", items }` |
| 37 | Spacer | Skipped |
| 38 | Contact Form | `{ type: "contact-form" }` |
| 124 | Trapez Richtext | `{ type: "text", content }` |
| 177 | FAQ | `{ type: "html", content }` |
| 180 | Content Sections | Heading + Text blocks |
| 183 | LLM Info | Heading + Text blocks |
| 186/196/202 | Expert | Heading + Text + Image |

### MODX Tag Resolution

- `[[~ID]]` → Resolved to actual page URLs via resource ID map
- `[[$chunk]]` → Stripped
- `[[!snippet]]` → Stripped
- `[[+placeholder]]` → Stripped
- `[[*field]]` → Stripped
- `phpthumbof/cache/` paths → Resolved to original files

### Idempotency

The script is fully idempotent — running it multiple times on the same data produces identical output. It overwrites existing files.

---

## Astro Theme Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `Header` | Sticky nav with logo | `navigation`, `companyName`, `logo` |
| `Hero` | Full-width hero section | `title`, `subtitle`, `backgroundImage`, `minHeight` |
| `Section` | Content wrapper | `marginTop`, `marginBottom`, `backgroundColor`, `textAlign` |
| `Heading` | h1-h6 elements | `text`, `level`, `textAlign` |
| `TextBlock` | Rich text (prose) | `content`, `maxWidth` |
| `ImageBlock` | Single image | `src`, `alt`, `cover`, `position` |
| `Grid` | Multi-column layout | `columns` (50-50, 60-40, etc.) |
| `Gallery` | Image grid | `images`, `columns` |
| `Slider` | Card carousel | `slides` |
| `FeatureList` | Icon + label grid | `items` |
| `Divider` | Horizontal rule | `width`, `marginTop`, `marginBottom` |
| `ContactForm` | Contact form card | `title`, `submitLabel` |
| `ContentRenderer` | Block-to-component mapper | `blocks` |
| `Footer` | Site footer | `companyName`, `navigation`, `socialLinks` |

### Routing

- `src/pages/index.astro` — Homepage (loads `content/pages/index.json`)
- `src/pages/[...slug].astro` — All other pages (auto-discovers all `.json` files recursively)

Pages support nested paths: `content/pages/dienstleistungen/flachdach.json` → `/dienstleistungen/flachdach/`

---

## Theming System

The theme uses CSS custom properties (variables) for all colors. These have sensible defaults in `global.css` but are **overridden at runtime** from `site-config.json`.

### How it works:

1. `global.css` defines default values in `@theme {}` block
2. `BaseLayout.astro` reads `siteConfig.theme` and injects CSS vars as inline `style` on `<body>`
3. All components reference `var(--color-accent)`, `var(--color-primary)`, etc.
4. Google Fonts are loaded automatically based on `theme.bodyFont` / `theme.headingFont`

### CSS Variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `--color-primary` | `#0f172a` | Header bg, footer bg |
| `--color-accent` | `#3b82f6` | Links, buttons, active states |
| `--color-accent-dark` | `#2563eb` | Hover states |
| `--color-accent-light` | `#eff6ff` | Active nav pill bg |
| `--color-bg` | `#ffffff` | Page background |
| `--color-text` | `#0f172a` | Body text |
| `--color-text-light` | `#64748b` | Secondary text |
| `--color-border` | `#e2e8f0` | Borders |
| `--font-body` | Inter | Body font |
| `--font-heading` | Inter | Heading font |

---

## DevOps / Deployment

### Local: Makefile

```bash
make migrate    # SQL → JSON
make build      # Astro build
make deploy     # rsync + atomic swap (zero-downtime)
make rollback   # Instant rollback to previous release
make all        # Full pipeline: migrate → build → deploy
make clean      # Remove all generated files
make test       # Run 48 CLI unit tests
```

### Local: deploy.sh script

```bash
# Deploy with zero-downtime
./scripts/deploy.sh user@server /var/www/vhosts/site.ch/httpdocs

# Rollback
./scripts/deploy.sh --rollback
```

### GitLab CI/CD (`.gitlab-ci.yml`)

Four stages + rollback:

| Stage | Purpose | Trigger |
|-------|---------|---------|
| `migrate` | SQL + assets → JSON content | auto on push to main |
| `test` | 48 unit tests (Jest) | auto |
| `build` | `npx astro build` → static HTML | auto |
| `deploy` | rsync + atomic swap | manual (button) |
| `rollback` | Restore previous release | manual (button) |

**Required CI/CD Variables:**

| Variable | Description | Protected |
|----------|-------------|-----------|
| `SSH_PRIVATE_KEY` | SSH private key for rsync | ✅ |
| `DEPLOY_HOST` | `user@server` | ✅ |
| `DEPLOY_PATH` | `/var/www/vhosts/site/httpdocs` | ❌ |
| `SITE_DOMAIN` | `site.ch` | ❌ |

### Zero-downtime deploy strategy

```
1. rsync dist/ → server:path-staging/
2. mv path → path-prev          (backup)
3. mv path-staging → path       (go live)
```

No moment of downtime. Rollback = reverse swap (instant).

---

## Scaling to 200 Sites

### Pipeline per site:

```
┌─────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
│ SQL dump │───>│ migrate.js│───>│ astro    │───>│ rsync    │
│ + assets │    │ (parse +  │    │ build    │    │ deploy   │
│          │    │  generate)│    │ (static) │    │ (zero-dt)│
└─────────┘    └───────────┘    └──────────┘    └──────────┘
```

### Batch migration:

```bash
# Migrate + build + deploy all sites at once
node cli/batch-migrate.js \
  --sites ./sites \
  --theme ./astro-theme \
  --output ./output \
  --build \
  --deploy-host user@server \
  --deploy-base /var/www/vhosts

# Only specific sites
node cli/batch-migrate.js --sites ./sites --theme ./astro-theme --output ./output --only site1,site2
```

### Per-site GitLab repos:

For ongoing maintenance, each site gets its own GitLab repo:

```
site-repo/
├── data/
│   ├── dump.sql
│   └── assets/
├── cli/              (submodule → shared)
├── astro-theme/      (submodule → shared)
├── .gitlab-ci.yml
└── .env
```

Push to `main` → auto pipeline → manual deploy button.

---

## Test Results

| Site | Pages | Edge Cases | Build Time | Live Preview |
|------|-------|------------|------------|-------------|
| azotea.ch | 36 | 0 | ~2.1s | — |
| kpservices.ch | 13 | 0 | ~1.2s | — |

### Unit Tests

```
48 tests passing — SQL parsing, mapping, HTML cleaning, image resolution,
                   config extraction, redirects, content fields, args parsing
```

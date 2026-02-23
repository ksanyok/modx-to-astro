# MODX → Astro · Quick Start Guide
> For complete beginners. Each section is less than 10 lines.

---

## 1. Install Prerequisites (one time only)

Install **Node.js** (JavaScript runtime) and **Git** (version control):

```bash
# macOS — install Homebrew first, then Node + Git
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node git

# Windows — download installers from:
#   https://nodejs.org   (LTS version)
#   https://git-scm.com
```

Verify:
```bash
node --version    # should print v20 or higher
git --version     # should print git version 2.x
```

---

## 2. Get the Project

Clone the repository (download it to your computer):

```bash
git clone https://github.com/ksanyok/modx-to-astro.git
cd modx-to-astro

# Install CLI dependencies
cd cli && npm install && cd ..

# Install Astro theme dependencies
cd astro-theme && npm install && cd ..
```

> Do this only once. After that, just `cd modx-to-astro` to return to the project.

---

## 3. Open a Terminal

| System | How to open terminal |
|--------|---------------------|
| **macOS** | Press `Cmd + Space`, type `Terminal`, press Enter |
| **Windows** | Press `Win + R`, type `cmd`, press Enter |
| **VS Code** | Menu → Terminal → New Terminal |

Navigate to the project folder:
```bash
cd /path/to/modx-to-astro
# Example macOS: cd ~/Desktop/modx-to-astro
# Example Windows: cd C:\Users\YourName\Desktop\modx-to-astro
```

---

## 4. Migrate One Site

You need two things from the MODX site:
- **SQL dump** — export from phpMyAdmin (`site.sql`)
- **Assets folder** — the `/assets/` directory from the MODX site

Run the migration:
```bash
node cli/migrate.js \
  --sql   /path/to/site.sql \
  --assets /path/to/assets \
  --out   astro-theme \
  --site  https://yourdomain.com
```

Output: the `astro-theme/src/content/` folder is filled with your site's pages.

---

## 5. Build the Site

Converts content → static HTML files ready for the web:

```bash
cd astro-theme
npm run build
cd ..
```

Built files are in `astro-theme/dist/`. Takes 3–10 seconds.

---

## 6. Preview Locally

See the site in your browser before uploading:

```bash
cd astro-theme
npm run preview
```

Open → http://localhost:4321

Press `Ctrl+C` to stop.

---

## 7. Edit Content Locally (Keystatic CMS)

Keystatic is a visual editor — edit pages like a CMS, no code needed.

```bash
cd astro-theme
KEYSTATIC=true npm run dev
```

Open → http://localhost:4321/keystatic

- Click a page → edit text/images → Save
- Changes are saved as JSON files in `src/content/`
- Run `npm run build` afterward to rebuild

---

## 8. Deploy to Server (Upload to Web)

After building, upload to your hosting server via SSH:

```bash
bash scripts/deploy.sh user@your-server.com /path/to/website/root
# Example:
bash scripts/deploy.sh topbit@topbit.ftp.tools /home/topbit/tester-buyreadysite.website/upwork2
```

> **Requirement:** SSH key authentication must be configured on the server.
> The script uses `rsync` — only changed files are uploaded (fast).

To save your server settings so you don't repeat them every time, add to `.env`:
```bash
DEPLOY_HOST=topbit@topbit.ftp.tools
DEPLOY_PATH=/home/topbit/tester-buyreadysite.website/upwork2
```
Then just run:
```bash
bash scripts/deploy.sh
```

---

## 9. Rollback (Undo Last Deploy)

If something went wrong, restore the previous version instantly:

```bash
bash scripts/deploy.sh --rollback
```

---

## 10. Batch: Process 200 Sites

To migrate and deploy many sites at once, organize them in a folder:

```
sites/
  site-001/
    dump.sql
    assets/
  site-002/
    dump.sql
    assets/
  ...
```

Then run:
```bash
node cli/batch-migrate.js \
  --sites-dir ./sites \
  --out-dir   ./output \
  --parallel  4
```

Or with the Makefile:
```bash
SITES_DIR=./sites BATCH_OUTPUT=./output make batch
```

Each site gets its own built folder in `./output/site-001/`, etc.

For batch deploy (migrate + build + upload all sites):
```bash
SITES_DIR=./sites DEPLOY_HOST=user@server.com DOMAIN_SUFFIX=.yourdomain.com make batch-deploy
```

---

## 11. Git: Save and Share Changes

Git tracks every change you make. Use it to save progress and collaborate.

```bash
# Save all current changes
git add -A
git commit -m "describe what you changed"

# Upload to GitHub (so others can see / GitHub stores backup)
git push

# Download latest changes from GitHub (after someone else pushed)
git pull
```

Common commands:
```bash
git status          # what changed since last commit?
git log --oneline   # history of all commits
git diff            # see exact changes line by line
```

---

## 12. Full Pipeline (one command)

When your `.env` is configured, run everything in one shot:

```bash
SQL_PATH=../site/dump.sql \
ASSETS_PATH=../site/assets \
SITE_DOMAIN=yourdomain.com \
bash scripts/quick-pipeline.sh
```

This does: **migrate → build → deploy** with timing per step.

---

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` (in `cli/` and `astro-theme/`) |
| Migrate one site | `node cli/migrate.js --sql x --assets y --out astro-theme` |
| Build | `cd astro-theme && npm run build` |
| Preview | `cd astro-theme && npm run preview` |
| Edit (Keystatic) | `KEYSTATIC=true npm run dev` |
| Deploy | `bash scripts/deploy.sh user@host /path` |
| Rollback | `bash scripts/deploy.sh --rollback` |
| Batch migrate | `node cli/batch-migrate.js --sites-dir ./sites` |
| Save with Git | `git add -A && git commit -m "message" && git push` |

---

> **Need help?** Open [DOCUMENTATION.md](DOCUMENTATION.md) for the full technical reference.

# Input Data Directory

Place your MODX export files here before running the migration:

```
data/
├── dump.sql        ← SQL dump exported from MODX (required)
└── assets/         ← Unzipped MODX assets folder (required)
    ├── uploads/
    └── userupload/
```

## How to export from MODX

1. **SQL dump** — use phpMyAdmin, Plesk DB tools, or SSH:
   ```bash
   mysqldump -u USER -p DATABASE_NAME > data/dump.sql
   ```

2. **Assets folder** — download the `assets/` directory from your MODX install
   (typically at `/httpdocs/assets/` in Plesk) and unzip it here as `data/assets/`.

These files are excluded from git (see `.gitignore`).
After migration the content lands in `astro-theme/src/content/` which is also excluded from git.

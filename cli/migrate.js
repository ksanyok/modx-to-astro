#!/usr/bin/env node

/**
 * MODX → Astro Migration CLI
 * 
 * Parses a MODX SQL dump, extracts content from modx_site_content
 * (including ContentBlocks JSON), and generates structured JSON files
 * for the Astro theme.
 * 
 * @author ksanyok <buyreadysite.com>
 * @license Proprietary — All rights reserved.
 * @copyright (c) 2025-2026 buyreadysite.com — Unauthorized copying prohibited.
 * @build b7264r9s
 * 
 * Usage:
 *   node migrate.js --sql ./dump.sql --assets ./assets --out ../astro-theme/src/content
 */

const fs = require('fs-extra');
const path = require('path');

// ─── CLI Arguments ──────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
MODX → Astro Migration CLI

Usage:
  node migrate.js --sql <path> --assets <path> --out <path> [options]

Options:
  --sql       Path to the MODX SQL dump file (required)
  --assets    Path to the assets directory (required)
  --out       Output directory for generated content (required)
  --site      Site domain for canonical URLs (optional)
  --verbose   Enable verbose logging
  --help      Show this help message
`);
  process.exit(0);
}

const SQL_PATH = args.sql;
const ASSETS_PATH = args.assets;
const OUT_PATH = args.out;
const SITE_URL = args.site || '';
const VERBOSE = !!args.verbose;

if (!SQL_PATH || !ASSETS_PATH || !OUT_PATH) {
  console.error('Error: --sql, --assets, and --out are required. Use --help for usage.');
  process.exit(1);
}

// ─── Logging ────────────────────────────────────────────────────────
const log = {
  info: (msg) => console.log(`  ✓ ${msg}`),
  warn: (msg) => console.log(`  ⚠ ${msg}`),
  error: (msg) => console.error(`  ✗ ${msg}`),
  verbose: (msg) => VERBOSE && console.log(`    ${msg}`),
  section: (msg) => console.log(`\n━━━ ${msg} ━━━`),
};

const edgeCases = [];

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  log.section('MODX → Astro Migration');
  log.info(`SQL: ${SQL_PATH}`);
  log.info(`Assets: ${ASSETS_PATH}`);
  log.info(`Output: ${OUT_PATH}`);

  // 1. Read & parse SQL
  log.section('Step 1: Parsing SQL dump');
  const sqlContent = await fs.readFile(SQL_PATH, 'utf-8');

  // 2. Extract resources from modx_site_content
  const resources = extractResources(sqlContent);
  log.info(`Found ${resources.length} resources`);

  // 3. Build resource ID → alias/uri map for link resolution
  const resourceMap = buildResourceMap(resources);

  // 4. Extract client config settings
  const clientConfig = extractClientConfig(sqlContent);
  log.info(`Client config: ${Object.keys(clientConfig).length} settings`);

  // 5. Extract SEO redirects
  const redirects = extractRedirects(sqlContent);
  log.info(`SEO redirects: ${redirects.length}`);

  // 6. Process each resource
  log.section('Step 2: Processing resources');
  const pages = [];

  for (const resource of resources) {
    if (resource.deleted) {
      log.verbose(`Skipping deleted: ${resource.pagetitle}`);
      continue;
    }

    try {
      const page = processResource(resource, resourceMap, clientConfig);
      if (page) {
        pages.push(page);
        log.info(`Processed: ${resource.pagetitle} → ${page.outputPath}`);
      }
    } catch (err) {
      log.error(`Failed to process "${resource.pagetitle}": ${err.message}`);
      edgeCases.push({ resource: resource.pagetitle, error: err.message });
    }
  }

  // 7. Post-processing: resolve anchor-only pages
  // Pages whose sole content is "#anchor" should set that anchor ID on the homepage's matching section
  log.section('Step 2b: Resolving anchor links');
  const homePage = pages.find(p => p.outputPath === 'index.json');
  if (homePage) {
    for (const page of pages) {
      const blocks = page.data.blocks || [];
      // Detect anchor-only pages: single text block with content = "#something"
      if (blocks.length === 1 && blocks[0].type === 'text' && /^#[\w-]+$/.test((blocks[0].content || '').trim())) {
        const anchorId = blocks[0].content.trim().replace('#', '');
        log.info(`Anchor page: "${page.data.title}" → #${anchorId} (redirects to homepage anchor)`);
        
        // Find matching section on homepage by heading text
        const setAnchorRecursive = (homeBlocks) => {
          for (const block of homeBlocks) {
            if (block.type === 'section' && !block.anchor && block.children) {
              for (const child of block.children) {
                if (child.type === 'heading' && child.text) {
                  const headingText = child.text.replace(/<[^>]+>/g, '').trim().toLowerCase();
                  if (headingText === anchorId.toLowerCase()) {
                    block.anchor = anchorId;
                    log.info(`  → Set anchor #${anchorId} on homepage section with heading "${headingText}"`);
                    return true;
                  }
                }
              }
            }
          }
          return false;
        };
        setAnchorRecursive(homePage.data.blocks || []);
      }
    }
  }

  // 8. Generate output files
  log.section('Step 3: Writing output');
  // Clean previous output for idempotency
  await fs.emptyDir(path.join(OUT_PATH, 'pages'));
  log.verbose('Cleaned pages/ directory');

  // Write page JSON files
  for (const page of pages) {
    const outFile = path.join(OUT_PATH, 'pages', page.outputPath);
    await fs.ensureDir(path.dirname(outFile));
    const pageData = { ...page.data, _m: 'b7264r9s' };
    await fs.writeJson(outFile, pageData, { spaces: 2 });
    log.verbose(`Written: ${page.outputPath}`);
  }

  // Write site config (pass processed pages for anchor-page detection)
  const siteConfig = buildSiteConfig(resources, clientConfig, pages);
  siteConfig._m = 'b7264r9s';
  await fs.writeJson(path.join(OUT_PATH, 'site-config.json'), siteConfig, { spaces: 2 });
  log.info('Written: site-config.json');

  // Write redirects
  if (redirects.length > 0) {
    await fs.writeJson(path.join(OUT_PATH, 'redirects.json'), redirects, { spaces: 2 });
    log.info(`Written: redirects.json (${redirects.length} redirects)`);
  }

  // Copy assets
  log.section('Step 4: Copying media assets');
  const publicAssetsDir = path.join(OUT_PATH, '..', '..', 'public', 'assets');
  await copyAssets(ASSETS_PATH, publicAssetsDir);

  // Step 5: Convert images to WebP
  log.section('Step 5: Converting images to WebP');
  const pathMap = await convertToWebP(publicAssetsDir);
  if (pathMap.size > 0) {
    patchImagePaths(OUT_PATH, pathMap);
    log.info(`WebP: ${pathMap.size} images converted, paths updated`);
  } else {
    log.info('WebP: sharp not available or no images to convert');
  }

  // Summary
  log.section('Migration Complete');
  log.info(`Pages generated: ${pages.length}`);
  log.info(`Edge cases: ${edgeCases.length}`);

  if (edgeCases.length > 0) {
    await fs.writeJson(path.join(OUT_PATH, 'edge-cases.json'), edgeCases, { spaces: 2 });
    log.warn('See edge-cases.json for details');
  }
}

// ─── SQL Parsing ────────────────────────────────────────────────────

/**
 * Extract INSERT data from modx_site_content table.
 * Handles the complex multi-value INSERT format from mysqldump.
 */
function extractResources(sql) {
  const resources = [];
  
  // Find INSERT INTO modx_site_content VALUES section
  const insertRegex = /INSERT INTO `modx_site_content` VALUES\s*(.+?);\s*$/ms;
  const match = sql.match(insertRegex);
  
  if (!match) {
    log.error('Could not find modx_site_content INSERT statement');
    return resources;
  }

  const valuesStr = match[1];
  
  // Parse individual row tuples - they start with ( and end with )
  // This is tricky because values can contain parentheses, quotes, etc.
  const rows = parseSQLValues(valuesStr);
  
  for (const row of rows) {
    try {
      const resource = mapRowToResource(row);
      resources.push(resource);
    } catch (err) {
      log.verbose(`Failed to parse row: ${err.message}`);
    }
  }

  return resources;
}

/**
 * Parse SQL VALUES(...),(...),... into arrays of values.
 * Handles escaped quotes, nested parentheses in strings, etc.
 */
function parseSQLValues(str) {
  const rows = [];
  let i = 0;
  
  while (i < str.length) {
    // Find start of tuple
    while (i < str.length && str[i] !== '(') i++;
    if (i >= str.length) break;
    i++; // skip opening (
    
    const values = [];
    let inString = false;
    let stringChar = '';
    let current = '';
    let depth = 0;
    
    while (i < str.length) {
      const ch = str[i];
      
      if (inString) {
        if (ch === '\\' && i + 1 < str.length) {
          // Escaped character
          current += ch + str[i + 1];
          i += 2;
          continue;
        }
        if (ch === stringChar) {
          // Check for '' escaped quote
          if (i + 1 < str.length && str[i + 1] === stringChar) {
            current += ch + ch;
            i += 2;
            continue;
          }
          inString = false;
          current += ch;
          i++;
          continue;
        }
        current += ch;
        i++;
        continue;
      }
      
      if (ch === '\'' || ch === '"') {
        inString = true;
        stringChar = ch;
        current += ch;
        i++;
        continue;
      }
      
      if (ch === '(') {
        depth++;
        current += ch;
        i++;
        continue;
      }
      
      if (ch === ')') {
        if (depth > 0) {
          depth--;
          current += ch;
          i++;
          continue;
        }
        // End of tuple
        values.push(parseSQLValue(current.trim()));
        rows.push(values);
        i++;
        break;
      }
      
      if (ch === ',' && depth === 0) {
        values.push(parseSQLValue(current.trim()));
        current = '';
        i++;
        continue;
      }
      
      current += ch;
      i++;
    }
  }
  
  return rows;
}

/**
 * Parse a single SQL value (remove quotes, handle NULL, numbers, etc.)
 * Uses character-by-character unescaping to correctly handle nested
 * escape sequences (e.g. \\\" → \" for JSON inside SQL).
 */
function parseSQLValue(val) {
  if (val === 'NULL') return null;
  if (val === '') return '';
  
  // Remove surrounding quotes
  if ((val.startsWith("'") && val.endsWith("'")) || 
      (val.startsWith('"') && val.endsWith('"'))) {
    val = val.slice(1, -1);
    // Single-pass character-by-character unescape (MySQL backslash escapes)
    let result = '';
    for (let i = 0; i < val.length; i++) {
      if (val[i] === '\\' && i + 1 < val.length) {
        const next = val[i + 1];
        switch (next) {
          case '\\': result += '\\'; break;
          case "'":  result += "'";  break;
          case '"':  result += '"';  break;
          case 'n':  result += '\n'; break;
          case 'r':  result += '\r'; break;
          case 't':  result += '\t'; break;
          case '0':  result += '\0'; break;
          default:   result += '\\' + next; break;
        }
        i++; // skip next char
      } else {
        result += val[i];
      }
    }
    return result;
  }
  
  // Try number
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  
  return val;
}

/**
 * Map a parsed SQL row array to a resource object.
 * Based on modx_site_content column order.
 */
function mapRowToResource(row) {
  return {
    id: row[0],
    type: row[1],
    contentType: row[2],
    pagetitle: row[3],
    longtitle: row[4],
    description: row[5],
    alias: row[6],
    alias_visible: row[7],
    link_attributes: row[8],
    published: row[9],
    pub_date: row[10],
    unpub_date: row[11],
    parent: row[12],
    isfolder: row[13],
    introtext: row[14],
    content: row[15],
    richtext: row[16],
    template: row[17],
    menuindex: row[18],
    searchable: row[19],
    cacheable: row[20],
    createdby: row[21],
    createdon: row[22],
    editedby: row[23],
    editedon: row[24],
    deleted: row[25],
    deletedon: row[26],
    deletedby: row[27],
    publishedon: row[28],
    publishedby: row[29],
    menutitle: row[30],
    donthit: row[31],
    privateweb: row[32],
    privatemgr: row[33],
    content_dispo: row[34],
    hidemenu: row[35],
    class_key: row[36],
    context_key: row[37],
    content_type_id: row[38],
    uri: row[39],
    uri_override: row[40],
    hide_children_in_tree: row[41],
    show_in_tree: row[42],
    properties: row[43],
  };
}

// ─── Resource Map (for link resolution) ─────────────────────────────

function buildResourceMap(resources) {
  const map = {};
  for (const r of resources) {
    map[r.id] = {
      alias: r.alias,
      uri: r.uri,
      pagetitle: r.pagetitle,
      parent: r.parent,
      contentType: r.contentType,
    };
  }
  return map;
}

/**
 * Resolve [[~ID]] tags to actual URLs
 */
/**
 * Fix relative image paths in HTML strings to have a leading slash.
 * Prevents 404 errors on subpages where relative paths fail.
 * Converts: src="assets/... → src="/assets/...
 * Also strips MODX placeholder "(link)" text from content.
 */
function fixHtmlRelativePaths(html) {
  if (!html) return html;
  // Add leading slash to relative src/href paths
  html = html.replace(/(src|href)="(?!\/|http|mailto|tel|#)(assets\/)/gi, '$1="/$2');
  // Strip MODX (link) placeholder text left in richtext/slider fields
  html = html.replace(/<p>\s*\(link\)\s*<strong[^>]*><\/strong>\s*<\/p>/gi, '');
  html = html.replace(/<p>\s*\(link\)\s*<\/p>/gi, '');
  // Make iframe widths responsive — replace fixed width="NNN" and width:NNNpx
  // so maps/embeds don't cause horizontal overflow on narrow screens.
  html = html.replace(/(<iframe\b[^>]*)\bwidth="\d+"([^>]*>)/gi, '$1width="100%"$2');
  html = html.replace(/(<iframe\b[^>]*)\bwidth:\s*\d+px/gi, '$1width:100%');
  return html;
}

/**
 * Extract the primary linked URL from service-card richtext HTML.
 * MODX ContentBlocks service cards wrap their thumbnail image in an <a href="..."> link.
 * We extract this link so Astro can render a universal "mehr" CTA button below the card.
 * Works for any site – if the pattern isn't present, returns ''.
 */
function extractCardLink(html) {
  if (!html) return '';
  // Find the first <a href="..."> that wraps an <img> (appears within first 600 chars)
  const head = html.slice(0, 600);
  const m = head.match(/<a\s+[^>]*href="([^"#][^"]*)"[^>]*>\s*(?:<[^>]+>\s*)*<img/i);
  if (!m) return '';
  const href = m[1];
  // Skip external links, mailto, tel, anchors
  if (/^https?:\/\//.test(href) || /^(mailto|tel):/.test(href)) return '';
  return href;
}

/**
 * Fallback card link detection: if richtext has no <a href><img> pattern, match
 * the card's first H1-H4 heading text against resource URIs in resourceMap.
 * Normalises German umlauts and special chars, then picks the URI with the most
 * matching word segments (≥60% of words must match, minimum word length 3).
 * Handles sites like AZOTEA where card links are injected by the PHP template
 * rather than stored inside ContentBlocks HTML.
 */
function matchCardLinkByHeading(html, resourceMap) {
  if (!html || !resourceMap) return '';
  const hMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!hMatch) return '';
  const headingText = hMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
  if (headingText.length < 3) return '';
  const norm = headingText
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/&/g, 'und')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!norm) return '';
  const normWords = norm.split('-').filter(w => w.length >= 3);
  if (normWords.length === 0) return '';
  let bestMatch = null;
  let bestScore = 0;
  for (const res of Object.values(resourceMap)) {
    const uri = res.uri || '';
    if (!uri || uri === '/') continue;
    const uriNorm = uri.toLowerCase();
    const score = normWords.filter(w => uriNorm.includes(w)).length;
    if (score > bestScore && score >= Math.ceil(normWords.length * 0.6)) {
      bestScore = score;
      let cleanUri = uri.startsWith('/') ? uri : '/' + uri;
      cleanUri = cleanUri.replace(/\.html$/, '');
      bestMatch = cleanUri;
    }
  }
  return bestMatch || '';
}

function resolveResourceLinks(html, resourceMap) {
  if (!html) return html;
  
  return html.replace(/\[\[~(\d+)\]\]/g, (match, id) => {
    const resource = resourceMap[parseInt(id)];
    if (resource) {
      let uri = resource.uri || resource.alias || '';
      // Ensure leading slash
      if (uri && !uri.startsWith('/')) uri = '/' + uri;
      // Remove .html extension for clean URLs
      uri = uri.replace(/\.html$/, '');
      return uri;
    }
    edgeCases.push({ type: 'unresolved_link', id, context: match });
    return '#';
  });
}

// ─── ContentBlocks Processing ───────────────────────────────────────

/**
 * Extract and process ContentBlocks data from the properties field.
 */
function processContentBlocks(properties, resourceMap) {
  if (!properties) return [];

  let propsObj;
  try {
    propsObj = JSON.parse(properties);
  } catch (err) {
    return [];
  }

  const cb = propsObj.contentblocks;
  if (!cb || !cb.content) return [];

  let contentArray;
  try {
    contentArray = JSON.parse(cb.content);
  } catch (err) {
    return [];
  }

  if (!Array.isArray(contentArray)) return [];

  const blocks = [];

  for (const layoutBlock of contentArray) {
    try {
      const processed = processLayoutBlock(layoutBlock, resourceMap);
      if (processed) {
        blocks.push(...(Array.isArray(processed) ? processed : [processed]));
      }
    } catch (err) {
      log.verbose(`  Block processing error: ${err.message}`);
      edgeCases.push({ type: 'block_error', layout: layoutBlock.layout, error: err.message });
    }
  }

  return blocks;
}

/**
 * Process a single ContentBlocks layout block.
 */
function processLayoutBlock(layoutBlock, resourceMap) {
  const layoutId = layoutBlock.layout;
  const content = layoutBlock.content || {};
  const settings = layoutBlock.settings || {};
  const title = layoutBlock.title || '';

  // Common section settings
  const sectionSettings = {
    marginTop: settings.marginT || '',
    marginBottom: settings.marginB || '',
    backgroundColor: settings.bgcolor || '',
    textAlign: settings.salign || '',
    anchor: settings.anchor_r || '',
    fullWidth: settings.randlos === 'fullwidth',
  };

  switch (layoutId) {
    // Layout 9: Hero / Header with background image
    case 9:
      return processHeroLayout(content, settings, resourceMap);

    // Layout 1: 1-column
    case 1:
      return processOneColumnLayout(content, settings, sectionSettings, resourceMap);

    // Layout 2: 50|50
    case 2:
      return processTwoColumnLayout(content, settings, sectionSettings, '50-50', resourceMap);

    // Layout 3: 60|40
    case 3:
      return processTwoColumnLayout(content, settings, sectionSettings, '60-40', resourceMap);

    // Layout 4: 40|60
    case 4:
      return processTwoColumnLayout(content, settings, sectionSettings, '40-60', resourceMap);

    // Layout 5: Divider
    case 5:
      return {
        type: 'divider',
        width: mapTrennerWidth(settings.trennerwidth),
        marginTop: settings.marginT || '',
        marginBottom: settings.marginB || '',
      };

    // Layout 6: 30|30|30
    case 6:
      return processThreeColumnLayout(content, settings, sectionSettings, resourceMap);

    // Layout 8: 30|70
    case 8:
      return processTwoColumnLayout(content, settings, sectionSettings, '30-70', resourceMap);

    // Layout 18: 25|25|25|25
    case 18:
      return processFourColumnLayout(content, settings, sectionSettings, resourceMap);

    // Layout 19: AI Article
    case 19:
      return processArticleLayout(content, settings, resourceMap);

    // Layout 20: AI Expert Page
    case 20:
      return processExpertLayout(content, settings, resourceMap);

    default:
      edgeCases.push({ type: 'unknown_layout', layoutId, title });
      // Try generic processing
      return processGenericLayout(content, settings, sectionSettings, resourceMap);
  }
}

function processHeroLayout(content, settings, resourceMap) {
  // Extract heading text from the "inhalt" content area
  const inhaltFields = content.inhalt || [];
  let title = '';
  let subtitle = '';

  // Use the heading 'level' attribute to identify the main h1 vs eyebrow/subtitle.
  // In ContentBlocks hero layouts, the eyebrow is typically h5/h2 and the main heading is h1.
  const heroH1Texts = [];
  const heroEyebrowTexts = [];
  for (const field of inhaltFields) {
    if (field.field === 2) { // Heading field
      const text = cleanHtml(resolveResourceLinks(field.value || '', resourceMap));
      if (!text) continue;
      if (field.level === 'h1') {
        heroH1Texts.push(text);
      } else {
        heroEyebrowTexts.push(text);
      }
    }
  }

  if (heroH1Texts.length > 0) {
    // Explicit h1 found — use it as title, first non-h1 as subtitle
    title = heroH1Texts[0];
    subtitle = heroEyebrowTexts[0] || '';
  } else {
    // No explicit h1 — fall back to order-based: first = eyebrow, last = title
    const allTexts = heroEyebrowTexts;
    if (allTexts.length === 1) {
      title = allTexts[0];
    } else if (allTexts.length >= 2) {
      subtitle = allTexts[0];
      title = allTexts[allTexts.length - 1];
    }
  }

  // Fallback: if no heading fields found, try richtext (field=3)
  // Some hero blocks store content as HTML in richtext fields
  if (!title) {
    for (const field of inhaltFields) {
      if (field.field === 3 && field.value) {
        const html = resolveResourceLinks(field.value, resourceMap);
        // Extract heading (h1-h6) as title
        const headingMatch = html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/is);
        if (headingMatch) {
          title = cleanHtml(headingMatch[1].replace(/<[^>]+>/g, ''));
          // Everything after the heading is the subtitle
          const afterHeading = html.replace(/<h[1-6][^>]*>.*?<\/h[1-6]>/is, '').trim();
          if (afterHeading) {
            subtitle = cleanHtml(afterHeading.replace(/<[^>]+>/g, ''));
          }
        }
      }
    }
  }

  return {
    type: 'hero',
    title,
    subtitle,
    backgroundImage: resolveImagePath(settings.bgimg || ''),
    backgroundVideo: resolveImagePath(settings.bgvideo || ''),
    backgroundPosition: mapPosition(settings.obPos || ''),
    overlayOpacity: parseInt(settings.overlay || '40') || 40,
    minHeight: mapMinHeight(settings.minheight65 || ''),
    textAlign: settings.salign || '',
    verticalAlign: mapVerticalAlign(settings.valign || ''),
  };
}

function processOneColumnLayout(content, settings, sectionSettings, resourceMap) {
  const mainFields = content.main || [];
  const children = processContentFields(mainFields, resourceMap);

  if (children.length === 0) return null;

  return {
    type: 'section',
    ...sectionSettings,
    children,
  };
}

function processTwoColumnLayout(content, settings, sectionSettings, columns, resourceMap) {
  const leftFields = content.left || [];
  const rightFields = content.right || [];

  const leftBlocks = processContentFields(leftFields, resourceMap);
  const rightBlocks = processContentFields(rightFields, resourceMap);

  if (leftBlocks.length === 0 && rightBlocks.length === 0) return null;

  return {
    type: 'section',
    ...sectionSettings,
    children: [
      {
        type: 'grid',
        columns,
        cells: [leftBlocks, rightBlocks],
      },
    ],
  };
}

function processThreeColumnLayout(content, settings, sectionSettings, resourceMap) {
  const leftFields = content.left || [];
  const middleFields = content.middle || [];
  const rightFields = content.right || [];

  const leftBlocks = processContentFields(leftFields, resourceMap);
  const middleBlocks = processContentFields(middleFields, resourceMap);
  const rightBlocks = processContentFields(rightFields, resourceMap);

  // Check if all columns are just images — make it a gallery
  const allImages = [...leftBlocks, ...middleBlocks, ...rightBlocks];
  if (allImages.length > 0 && allImages.every(b => b.type === 'image')) {
    return {
      type: 'section',
      ...sectionSettings,
      children: [{
        type: 'gallery',
        columns: 3,
        images: allImages.map(b => ({ src: b.src, alt: b.alt, width: b.width, height: b.height })),
      }],
    };
  }

  return {
    type: 'section',
    ...sectionSettings,
    children: [{
      type: 'grid',
      columns: '30-30-30',
      cells: [leftBlocks, middleBlocks, rightBlocks],
    }],
  };
}

function processFourColumnLayout(content, settings, sectionSettings, resourceMap) {
  const cols = ['left', 'middle', 'middle2', 'right'].map(key => 
    processContentFields(content[key] || [], resourceMap)
  );

  return {
    type: 'section',
    ...sectionSettings,
    children: [{
      type: 'grid',
      columns: '25-25-25-25',
      cells: cols,
    }],
  };
}

function processArticleLayout(content, settings, resourceMap) {
  const blocks = [];
  
  // Process expert section
  const expertFields = content.expert || [];
  for (const field of expertFields) {
    if (field.rows) {
      for (const row of field.rows) {
        blocks.push({
          type: 'html',
          content: buildExpertCardHtml(row, resourceMap),
        });
      }
    }
  }

  // Process content sections
  const contentFields = content.content || [];
  for (const field of contentFields) {
    if (field.rows) {
      for (const row of field.rows) {
        if (row.title && row.text) {
          blocks.push({
            type: 'heading',
            text: resolveResourceLinks(row.title.value || '', resourceMap),
            level: 'h2',
          });
          blocks.push({
            type: 'text',
            content: resolveResourceLinks(row.text.value || '', resourceMap),
          });
        }
        // FAQ items
        if (row.question && row.answer) {
          blocks.push({
            type: 'html',
            content: buildFaqHtml(row, resourceMap),
          });
        }
      }
    }
  }

  return blocks.length > 0 ? blocks : null;
}

function processExpertLayout(content, settings, resourceMap) {
  // Similar to article but different structure
  return processArticleLayout(content, settings, resourceMap);
}

function processGenericLayout(content, settings, sectionSettings, resourceMap) {
  const allFields = [];
  for (const key of Object.keys(content)) {
    const fields = content[key];
    if (Array.isArray(fields)) {
      allFields.push(...fields);
    }
  }

  const children = processContentFields(allFields, resourceMap);
  if (children.length === 0) return null;

  return {
    type: 'section',
    ...sectionSettings,
    children,
  };
}

// ─── Content Field Processing ───────────────────────────────────────

/**
 * Process an array of ContentBlocks fields into block objects.
 */
function processContentFields(fields, resourceMap) {
  const blocks = [];

  for (const field of fields) {
    const fieldType = field.field;

    switch (fieldType) {
      case 2: // Heading
        blocks.push({
          type: 'heading',
          text: cleanHtml(resolveResourceLinks(field.value || '', resourceMap)),
          level: field.level || 'h2',
          textAlign: field.settings?.talign || '',
        });
        break;

      case 3: { // Richtext / Textarea
        const richContent = fixHtmlRelativePaths(resolveResourceLinks(field.value || '', resourceMap));
        // Primary: link wrapped around an image (KP Services style)
        // Fallback: match H4 heading text to a page slug (AZOTEA style — links from PHP template)
        const cardLink = extractCardLink(richContent) || matchCardLinkByHeading(richContent, resourceMap);
        const textBlock = {
          type: 'text',
          content: richContent,
          maxWidth: field.settings?.maxtwidth === 'maxtwidth',
        };
        if (cardLink) textBlock.cardLink = cardLink;
        blocks.push(textBlock);
        break;
      }

      case 4: // Image
        blocks.push({
          type: 'image',
          src: resolveImagePath(field.url || ''),
          alt: field.title || '',
          width: parseInt(field.width) || undefined,
          height: parseInt(field.height) || undefined,
          cover: field.settings?.cover === 'img-cover',
          borderless: field.settings?.imgborderless === 'img-borderless',
          position: field.settings?.obPos || '',
        });
        break;

      case 14: // Repeater (slider with image + text)
        if (field.rows) {
          const slides = field.rows.map(row => {
            // Strip the MODX ContentBlocks "(link)" placeholder injected into slide text
            const rawText = (row.text?.value || '')
              .replace(/<p>\s*\(link\)\s*<strong[^>]*>[\s\S]*?<\/strong>\s*<\/p>/gi, '')
              .replace(/<p>\s*\(link\)\s*<\/p>/gi, '')
              .replace(/\(link\)/gi, '');
            return {
              image: resolveImagePath(row.image?.url || ''),
              title: resolveResourceLinks(extractTextFromHtml(rawText), resourceMap),
              text: resolveResourceLinks(stripTitleFromHtml(rawText), resourceMap),
              link: row['button-link']
                ? resolveResourceLinks(row['button-link'].linkType === 'resource' ? `[[~${row['button-link'].link}]]` : (row['button-link'].link || ''), resourceMap)
                : extractFirstLink(resolveResourceLinks(rawText, resourceMap)),
            };
          });
          blocks.push({ type: 'slider', slides });
        }
        break;

      case 5: // Link Box repeater — can be either card-style (headline+text+button) or plain links
        if (field.rows) {
          // Detect structure: if any row has a 'headline' subfield → card layout
          const isCardLayout = field.rows.some(row => row.headline);
          if (isCardLayout) {
            // Each row is a card: heading + body text + button link
            for (const row of field.rows) {
              const headlineText = row.headline?.value || '';
              const bodyText = row.text?.value || '';
              const btnText = row['button-text']?.value || '';
              const linkData = row.link || {};
              // Resolve resource link: {link: "7", linkType: "resource"} → url
              let url = '';
              if (linkData.link) {
                const raw = linkData.linkType === 'resource'
                  ? `[[~${linkData.link}]]`
                  : linkData.link;
                url = resolveResourceLinks(raw, resourceMap);
              }
              if (headlineText) {
                blocks.push({ type: 'heading', text: headlineText, level: 'h3' });
              }
              if (bodyText) {
                blocks.push({ type: 'text', content: bodyText });
              }
              if (btnText && url) {
                blocks.push({ type: 'buttons', links: [{ text: btnText, url }] });
              }
            }
          } else {
            // Plain link/button list: {text, url} rows
            const links = field.rows.map(row => ({
              text: row.text?.value || row.linktext?.value || '',
              url: resolveResourceLinks(row.link?.value || row.url?.value || '', resourceMap),
              file: row.file?.files?.[0]?.url || '',
              newTab: row.newtab?.checked === '1',
            })).filter(l => l.text || l.url);
            if (links.length > 0) {
              blocks.push({ type: 'buttons', links });
            }
          }
        }
        break;

      case 11: // Accordion repeater
        if (field.rows) {
          const items = field.rows.map(row => ({
            title: row.headline?.value || row.title?.value || '',
            content: resolveResourceLinks(row.inhalt?.value || row.text?.value || row.content?.value || '', resourceMap),
          })).filter(a => a.title);
          if (items.length > 0) {
            blocks.push({ type: 'accordion', items, negative: field.settings?.accordionnegativ === '1' });
          }
        }
        break;

      case 22: // Gallery (image gallery slider)
      case 78: // Gallery list
        if (field.files || field.images) {
          const images = (field.files || field.images || []).map(img => ({
            src: resolveImagePath(img.url || ''),
            alt: img.title || img.description || '',
            width: parseInt(img.width) || undefined,
            height: parseInt(img.height) || undefined,
            link: img.link || '',
          }));
          if (images.length > 0) {
            blocks.push({ type: 'gallery', columns: 3, images });
          }
        }
        break;

      case 25: // File/Video upload
        if (field.files && field.files.length > 0) {
          const file = field.files[0];
          if (file.extension === 'mp4' || file.extension === 'webm') {
            blocks.push({ type: 'video', src: file.url || '', title: file.title || '' });
          } else {
            blocks.push({ type: 'file', src: file.url || '', title: file.title || '', extension: file.extension || '' });
          }
        }
        break;

      case 26: // YouTube video
        blocks.push({
          type: 'youtube',
          url: field.value || field.url || '',
        });
        break;

      case 27: // Code / raw HTML
      case 77: // Iframe
        blocks.push({
          type: 'html',
          content: fixHtmlRelativePaths(field.value || ''),
        });
        break;

      case 28: // Buttons repeater
        if (field.rows) {
          const links = field.rows.map(row => ({
            text: row.text?.value || row.linktext?.value || '',
            url: resolveResourceLinks(row.link?.value || row.url?.value || '', resourceMap),
            file: row.file?.files?.[0]?.url || '',
            newTab: row.newtab?.checked === '1',
          })).filter(l => l.text || l.url);
          if (links.length > 0) {
            blocks.push({ type: 'buttons', links });
          }
        }
        break;

      case 33: // Repeater (feature list with icon + label)
        if (field.rows) {
          const items = field.rows.map(row => ({
            icon: resolveImagePath(row.img?.url || ''),
            label: row.wert?.value || '',
          }));
          blocks.push({ type: 'features', items });
        }
        break;

      case 37: // Spacer (margin classes) — skip, handled by section margins
        break;

      case 38: // Contact form chunk
        blocks.push({ type: 'contact-form' });
        break;

      case 124: // Richtext (trapez overlay)
        blocks.push({
          type: 'text',
          content: resolveResourceLinks(field.value || '', resourceMap),
        });
        break;

      case 177: // FAQ repeater
        if (field.rows) {
          for (const row of field.rows) {
            blocks.push({
              type: 'html',
              content: buildFaqHtml(row, resourceMap),
            });
          }
        }
        break;

      case 180: // Content section repeater (title + text)
        if (field.rows) {
          for (const row of field.rows) {
            if (row.title) {
              blocks.push({
                type: 'heading',
                text: resolveResourceLinks(row.title.value || '', resourceMap),
                level: 'h2',
              });
            }
            if (row.text) {
              blocks.push({
                type: 'text',
                content: resolveResourceLinks(row.text.value || '', resourceMap),
              });
            }
          }
        }
        break;

      case 183: // LLM info repeater (title + text sections)
      case 186: // Expert card repeater
      case 196: // Expert profile repeater
      case 202: // Expert cards grid repeater
        if (field.rows) {
          for (const row of field.rows) {
            // Generic: output all text-like values
            for (const [key, val] of Object.entries(row)) {
              if (typeof val === 'object' && val.value) {
                if (key.includes('title') || key.includes('name')) {
                  blocks.push({ type: 'heading', text: val.value, level: 'h3' });
                } else {
                  blocks.push({ type: 'text', content: resolveResourceLinks(val.value, resourceMap) });
                }
              }
              if (typeof val === 'object' && val.url) {
                blocks.push({
                  type: 'image',
                  src: resolveImagePath(val.url),
                  alt: '',
                  width: parseInt(val.width) || undefined,
                  height: parseInt(val.height) || undefined,
                });
              }
            }
          }
        }
        break;

      case 0: // Empty/default field
        break;

      default:
        if (field.value) {
          // Try to output as text
          blocks.push({
            type: 'text',
            content: resolveResourceLinks(field.value, resourceMap),
          });
        } else if (field.url) {
          // Try to output as image
          blocks.push({
            type: 'image',
            src: resolveImagePath(field.url),
            alt: field.title || '',
          });
        } else if (field.rows) {
          edgeCases.push({ type: 'unknown_repeater', fieldType, rowCount: field.rows.length });
        }
        break;
    }
  }

  return blocks;
}

// ─── Resource Processing ────────────────────────────────────────────

function processResource(resource, resourceMap, clientConfig) {
  // Skip non-document types we can't migrate
  if (resource.contentType === 'text/xml') return null;
  
  // Handle static resources (PDFs etc.)
  if (resource.class_key === 'modStaticResource') {
    return processStaticResource(resource);
  }

  // Extract content blocks from properties JSON
  const blocks = processContentBlocks(resource.properties, resourceMap);

  // If no ContentBlocks, try to extract from raw content field
  if (blocks.length === 0 && resource.content) {
    const fallbackContent = cleanModxTags(resource.content);
    if (fallbackContent.trim()) {
      blocks.push({
        type: 'text',
        content: resolveResourceLinks(fallbackContent, resourceMap),
      });
    }
  }

  // Determine output path
  let slug = resource.uri || resource.alias || '';
  slug = slug.replace(/\.html$/, '').replace(/\/$/, '');
  
  if (!slug || slug === '' || resource.parent === 0 && resource.menuindex === 0) {
    // Homepage
    return {
      outputPath: 'index.json',
      data: {
        title: decodeHtmlEntities(resource.longtitle || resource.pagetitle),
        description: decodeHtmlEntities(resource.description || ''),
        slug: '',
        isHomepage: true,
        template: resource.template,
        blocks,
      },
    };
  }

  return {
    outputPath: `${slug}.json`,
    data: {
      title: decodeHtmlEntities(resource.longtitle || resource.pagetitle),
      description: decodeHtmlEntities(resource.description || ''),
      slug,
      template: resource.template,
      menuTitle: decodeHtmlEntities(resource.menutitle || resource.pagetitle),
      hideMenu: resource.hidemenu === 1,
      published: resource.published === 1,
      blocks,
    },
  };
}

function processStaticResource(resource) {
  const slug = (resource.uri || resource.alias || '').replace(/\.pdf$/, '').replace(/\.html$/, '');
  
  return {
    outputPath: `${slug || resource.alias}.json`,
    data: {
      title: decodeHtmlEntities(resource.pagetitle),
      description: decodeHtmlEntities(resource.description || ''),
      slug,
      type: 'static',
      contentType: resource.contentType,
      staticFile: resource.content, // Path to the static file
      blocks: [],
    },
  };
}

// ─── Helper Functions ───────────────────────────────────────────────

function resolveImagePath(url, source) {
  if (!url) return '';
  
  // If it's a phpThumbOf cache path, try to find the original
  if (url.includes('phpthumbof/cache/')) {
    return resolvePhpThumbOf(url);
  }
  
  // Ensure leading slash
  if (!url.startsWith('/') && !url.startsWith('http')) {
    url = '/' + url;
  }
  
  // If URL is just a bare filename (e.g. /IMG_4010.jpg without assets/ prefix),
  // it likely comes from a MODX media source. Try to find it in known asset dirs.
  if (!url.includes('/assets/') && !url.startsWith('http')) {
    const filename = url.replace(/^\//, '');
    const candidates = [
      `/assets/userupload/assets/uploads/${filename}`,
      `/assets/uploads/${filename}`,
      `/assets/userupload/${filename}`,
    ];
    
    for (const candidate of candidates) {
      const fullPath = path.join(ASSETS_PATH, '..', candidate);
      try {
        if (fs.existsSync(fullPath)) {
          return candidate;
        }
      } catch {}
    }
    
    // Fuzzy find: case-insensitive, space/underscore, extension normalization
    const fuzzyResult = fuzzyFindFile(filename);
    if (fuzzyResult) return fuzzyResult;
    
    // Not found in assets — check phpthumbof cache for a match
    const phpthumbDir = path.join(ASSETS_PATH, 'components', 'phpthumbof', 'cache');
    try {
      if (fs.existsSync(phpthumbDir)) {
        const cacheFiles = fs.readdirSync(phpthumbDir);
        const hashPattern = /\.([a-f0-9]{32})\./;
        for (const cacheFile of cacheFiles) {
          const dehashed = decodeURIComponent(cacheFile.replace(hashPattern, '.'));
          if (dehashed === filename || normalizeFilename(dehashed) === normalizeFilename(filename)) {
            return `/assets/userupload/assets/uploads/${dehashed}`;
          }
        }
      }
    } catch {}
  }
  
  return url;
}

/**
 * Resolve phpThumbOf cache paths to original file paths.
 * Cache files follow pattern: filename.HASH.ext
 * We just need to find original in the assets.
 */
function resolvePhpThumbOf(cacheUrl) {
  // Extract the original filename from cache URL
  // Pattern: /assets/components/phpthumbof/cache/FILENAME.HASH.EXT
  const parts = cacheUrl.split('/');
  const cacheFilename = parts[parts.length - 1];
  
  // Remove the hash: filename.hash.ext -> filename.ext
  // Hash is always 32 hex chars
  const hashPattern = /\.([a-f0-9]{32})\./;
  const match = cacheFilename.match(hashPattern);
  
  if (match) {
    const originalFilename = decodeURIComponent(cacheFilename.replace(match[0], '.'));
    
    // Try common locations
    const possiblePaths = [
      `/assets/uploads/${originalFilename}`,
      `/assets/userupload/assets/uploads/${originalFilename}`,
    ];
    
    // Check if file exists in assets directory
    for (const p of possiblePaths) {
      const fullPath = path.join(ASSETS_PATH, '..', p);
      if (fs.existsSync(fullPath)) {
        return p;
      }
    }
    
    // Return best guess
    return `/assets/uploads/${originalFilename}`;
  }
  
  return cacheUrl;
}

function cleanHtml(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, '').trim();
}

/**
 * Decode common HTML entities to plain text for use in JSON meta fields
 * (page title, description). Astro handles escaping when rendering; if the
 * JSON already contains &amp; Astro will double-encode it to &amp;amp;.
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Normalize filename for fuzzy matching:
 * - lowercase
 * - spaces ↔ underscores treated as same
 * - .jpeg ↔ .jpg treated as same
 */
function normalizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '_')
    .replace(/\.jpeg$/i, '.jpg');
}

/**
 * Fuzzy-find a file in known asset directories.
 * Handles case differences, space/underscore swaps, jpeg/jpg extension.
 */
function fuzzyFindFile(filename) {
  const normalized = normalizeFilename(filename);
  const searchDirs = [
    { dir: path.join(ASSETS_PATH, '..', 'assets', 'userupload', 'assets', 'uploads'), prefix: '/assets/userupload/assets/uploads/' },
    { dir: path.join(ASSETS_PATH, '..', 'assets', 'uploads'), prefix: '/assets/uploads/' },
    { dir: path.join(ASSETS_PATH, '..', 'assets', 'userupload'), prefix: '/assets/userupload/' },
  ];
  
  for (const { dir, prefix } of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (normalizeFilename(file) === normalized) {
          return `${prefix}${file}`;
        }
      }
    } catch {}
  }
  return null;
}

function cleanModxTags(content) {
  if (!content) return '';
  
  // Remove MODX chunk calls [[$chunkname?...]]
  content = content.replace(/\[\[\$[^\]]*\]\]/g, '');
  
  // Remove MODX snippet calls [[!snippetname?...]] or [[snippetname?...]]
  content = content.replace(/\[\[!?[a-zA-Z][^\]]*\]\]/g, '');
  
  // Remove MODX output modifiers [[+placeholder:modifier]]
  content = content.replace(/\[\[\+[^\]]*\]\]/g, '');
  
  // Remove MODX system tags [[*field]] [[%lexicon]]
  content = content.replace(/\[\[\*[^\]]*\]\]/g, '');
  content = content.replace(/\[\[%[^\]]*\]\]/g, '');
  
  return content.trim();
}

function extractTextFromHtml(html) {
  // Extract just the title/heading from HTML
  const h4Match = html.match(/<h4[^>]*>(.*?)<\/h4>/is);
  if (h4Match) return h4Match[1].replace(/<[^>]+>/g, '').trim();
  
  const h3Match = html.match(/<h3[^>]*>(.*?)<\/h3>/is);
  if (h3Match) return h3Match[1].replace(/<[^>]+>/g, '').trim();
  
  return html.replace(/<[^>]+>/g, '').trim().substring(0, 100);
}

function stripTitleFromHtml(html) {
  // Remove the title heading, return remaining content
  let stripped = html.replace(/<h[1-6][^>]*>.*?<\/h[1-6]>/gis, '');
  stripped = stripped.replace(/<p>\s*<\/p>/g, '').trim();
  return stripped;
}

function extractFirstLink(html) {
  const match = html.match(/href="([^"]+)"/);
  return match ? match[1] : '';
}

function mapPosition(pos) {
  const map = {
    'img-cover-pos-t': 'top',
    'img-cover-pos-b': 'bottom',
    'img-cover-pos-l': 'left',
    'img-cover-pos-r': 'right',
    '': 'center',
  };
  return map[pos] || 'center';
}

function mapMinHeight(val) {
  if (val === 'header-fullheight') return 'full';
  if (val === 'minheight65') return 'medium';
  return 'small';
}

function mapVerticalAlign(val) {
  if (val === 'header-content-valign-t') return 'top';
  if (val === 'header-content-valign-b') return 'bottom';
  return 'center';
}

function mapTrennerWidth(val) {
  if (val === 'trenner-60') return '60';
  if (val === 'trenner-40') return '40';
  if (val === 'trenner-20') return '20';
  return 'full';
}

function buildExpertCardHtml(row, resourceMap) {
  const name = row['expert-name']?.value || '';
  const role = row['expert-role']?.value || '';
  const bio = row['expert-bio']?.value || '';
  const img = resolveImagePath(row['expert-image']?.url || '');
  
  return `
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex gap-4 items-start">
      ${img ? `<img src="${img}" alt="${name}" class="w-16 h-16 rounded-full object-cover" />` : ''}
      <div>
        <div class="font-bold text-lg">${name}</div>
        <div class="text-sm text-slate-500">${role}</div>
        ${bio ? `<p class="text-sm mt-2 text-slate-600">${resolveResourceLinks(bio, resourceMap)}</p>` : ''}
      </div>
    </div>
  `;
}

function buildFaqHtml(row, resourceMap) {
  const question = row.question?.value || '';
  const answer = resolveResourceLinks(row.answer?.value || '', resourceMap);
  
  return `
    <details class="border border-slate-200 rounded-lg mb-3">
      <summary class="p-4 font-medium cursor-pointer hover:bg-slate-50">${question}</summary>
      <div class="p-4 pt-0 text-slate-600">${answer}</div>
    </details>
  `;
}

// ─── Client Config ──────────────────────────────────────────────────

function extractClientConfig(sql) {
  const config = {};
  const insertRegex = /INSERT INTO `modx_clientconfig_setting` VALUES\s*(.+?);\s*$/ms;
  const match = sql.match(insertRegex);
  if (!match) return config;

  const rows = parseSQLValues(match[1]);
  for (const row of rows) {
    // Columns: 0=id, 1=key, 2=label, 3=xtype, 4=description, 5=is_required, 6=sortorder, 7=value, 8=default, 9=group, ...
    const key = row[1];
    const value = row[7]; // Value is at index 7, NOT index 2 (which is the label)
    if (key && value !== null && value !== undefined) {
      config[key] = value;
    }
  }

  return config;
}

// ─── SEO Redirects ──────────────────────────────────────────────────

function extractRedirects(sql) {
  const redirects = [];
  const insertRegex = /INSERT INTO `modx_seosuite_redirect` VALUES\s*(.+?);\s*$/ms;
  const match = sql.match(insertRegex);
  if (!match) return redirects;

  // Columns: 0=id, 1=context_key, 2=resource_id, 3=old_url, 4=new_url, 5=redirect_type, 6=active
  const rows = parseSQLValues(match[1]);
  for (const row of rows) {
    const oldUrl = (row[3] || '').trim();
    const newUrl = (row[4] || '').trim();
    const redirectType = (row[5] || '301').toString().trim();
    const active = row[6];

    // Skip inactive or empty redirects
    if (!oldUrl || !newUrl) continue;
    if (active !== undefined && active !== null && String(active) === '0') continue;

    // Normalize URLs — ensure leading slash
    const normalizedOld = oldUrl.startsWith('/') ? oldUrl : '/' + oldUrl;
    const normalizedNew = newUrl.startsWith('/') ? newUrl : '/' + newUrl;

    redirects.push({
      id: String(row[0]),
      old_url: normalizedOld,
      new_url: normalizedNew,
      redirect_type: redirectType.includes('301') ? '301' : redirectType.includes('302') ? '302' : '301',
    });
  }

  return redirects;
}

// ─── Site Config Builder ────────────────────────────────────────────

function buildSiteConfig(resources, clientConfig, processedPages = []) {
  // Helper: get href for a resource
  const getHref = (r) => {
    let href = r.uri || r.alias || '';
    if (href && !href.startsWith('/')) href = '/' + href;
    href = href.replace(/\.html$/, '');
    if (!href) href = '/';
    if (href === '/home') href = '/';
    return href;
  };

  // Build a map of slug → processed page data for anchor detection
  const pageBySlug = {};
  for (const p of processedPages) {
    if (p.data && p.data.slug !== undefined) {
      pageBySlug[p.data.slug] = p.data;
    }
  }

  // Helper: detect anchor-only pages from processed content
  // A page whose blocks are just [{type:"text", content:"#something"}] is an anchor redirect
  const getAnchorForResource = (r) => {
    const slug = (r.uri || r.alias || '').replace(/\.html$/, '').replace(/\/$/, '');
    const pageData = pageBySlug[slug];
    if (!pageData) return null;
    const blocks = pageData.blocks || [];
    if (blocks.length === 1 && blocks[0].type === 'text') {
      const content = (blocks[0].content || '').trim();
      if (/^#[\w-]+$/.test(content)) {
        return '/' + content; // e.g. "/#kontakt"
      }
    }
    return null;
  };

  // Build top-level resources (parent === 0)
  const topLevel = resources
    .filter(r => r.published && !r.deleted && !r.hidemenu && r.parent === 0)
    .sort((a, b) => a.menuindex - b.menuindex);

  // Build child resources by parent ID
  const childrenByParent = {};
  resources
    .filter(r => r.published && !r.deleted && !r.hidemenu && r.parent !== 0)
    .sort((a, b) => a.menuindex - b.menuindex)
    .forEach(r => {
      if (!childrenByParent[r.parent]) childrenByParent[r.parent] = [];
      childrenByParent[r.parent].push(r);
    });

  const navigation = topLevel
    .map(r => {
      const anchorHref = getAnchorForResource(r);
      const href = anchorHref || getHref(r);
      const item = {
        label: r.menutitle || r.pagetitle,
        href,
      };
      // Add children (sub-menu items) if this resource has child pages
      const children = childrenByParent[r.id];
      if (children && children.length > 0) {
        item.children = children.map(c => {
          const childAnchor = getAnchorForResource(c);
          return {
            label: c.menutitle || c.pagetitle,
            href: childAnchor || getHref(c),
          };
        });
      }
      return item;
    })
    // Skip home link (logo already links there)
    .filter(item => item.href !== '/');

  // --- Extract theme configuration from MODX clientconfig ---
  // MODX stores colors WITHOUT # prefix (e.g. "1e365a"), fonts as CSS strings
  const normalizeColor = (c) => {
    if (!c) return '';
    c = c.trim();
    if (c && !c.startsWith('#')) c = '#' + c;
    return c;
  };

  const primaryColor = normalizeColor(clientConfig.pagecolor1 || clientConfig['font-color']);
  const secondaryColor = normalizeColor(clientConfig.pagecolor2);
  const bgColor = normalizeColor(clientConfig['body-color'] || '');
  const fontColor = normalizeColor(clientConfig['font-color']);
  // pagecolor3 is "Farbe 3" — the vibrant accent/highlight color (e.g. orange for KP Services).
  // Use it only if it differs from the background color (some sites set pagecolor3=white as a placeholder).
  const pageColor3Raw = normalizeColor(clientConfig.pagecolor3);
  const effectiveBg = bgColor || '#ffffff';
  const accentColor = (pageColor3Raw && pageColor3Raw.toLowerCase() !== effectiveBg.toLowerCase() && pageColor3Raw.toLowerCase() !== '#ffffff')
    ? pageColor3Raw
    : primaryColor;

  // Logo: MODX stores just filename in userupload dir
  let logo = clientConfig.logo || '';
  if (logo && !logo.startsWith('/') && !logo.startsWith('http')) {
    logo = '/assets/userupload/' + logo;
  }

  let favicon = clientConfig.favicon || '';
  if (favicon && !favicon.startsWith('/') && !favicon.startsWith('http')) {
    favicon = '/assets/userupload/' + favicon;
  }

  // Fonts: MODX stores as "'Montserrat', sans-serif"
  const bodyFont = clientConfig.font1 || '';
  const headingFont = clientConfig.font2 || '';

  // Social links
  const socialLinks = [];
  if (clientConfig.facebook) socialLinks.push({ platform: 'facebook', url: clientConfig.facebook });
  if (clientConfig.insta) socialLinks.push({ platform: 'instagram', url: clientConfig.insta });
  if (clientConfig.linkedin) socialLinks.push({ platform: 'linkedin', url: clientConfig.linkedin });
  if (clientConfig.youtube) socialLinks.push({ platform: 'youtube', url: clientConfig.youtube });
  if (clientConfig.twitter) socialLinks.push({ platform: 'twitter', url: clientConfig.twitter });

  // Opening hours HTML from clientconfig
  const openingHours = clientConfig.oeffnungszeiten || clientConfig.oeffnungszeit || '';

  // Website URL from clientconfig
  let companyWebsite = clientConfig.internetseite || clientConfig.website || '';
  if (companyWebsite && !companyWebsite.startsWith('http')) {
    companyWebsite = 'https://' + companyWebsite;
  }

  // Maps embed iframe code — sanitize fixed width="NNN" → width="100%" so the
  // iframe is responsive and does not cause horizontal scroll on narrow screens.
  const rawMapsEmbed = clientConfig.kontaktmaps || '';
  const mapsEmbed = rawMapsEmbed
    .replace(/\bwidth="\d+"/, 'width="100%"')
    .replace(/\bwidth:\s*\d+px/, 'width:100%');

  // Middle info block (optional, used for 3-column layout)
  const middleInfos = clientConfig.middleinfos || '';

  // Show contact section at bottom of every page if not globally disabled
  // kontaktswitch = '1' → contact section disabled for this site
  const showContactSection = !clientConfig.kontaktswitch;

  // Max layout width in px (default 1200; MODX stores as plain number string)
  const maxLayoutWidth = parseInt(clientConfig.maxwidth) || 1200;

  // Hide company name in header/footer (nameswitch='1' = hide text name, show only logo)
  const showCompanyName = clientConfig.nameswitch !== '1';

  // Google Analytics / Tag Manager
  const analyticsId  = clientConfig.analytics || '';
  // anatag: 'analytics' = GA4/GA, 'tagmanager' = GTM
  const analyticsType = clientConfig.anatag || 'analytics';

  return {
    companyName: clientConfig.site_name || clientConfig.companyname || clientConfig.company_name || 
                 clientConfig.firmenname || resources[0]?.pagetitle || 'Company',
    companyAddress: clientConfig['client-adress'] || clientConfig['Adresse'] || clientConfig.adresse || clientConfig.address || '',
    companyPhone: clientConfig.clientphone || clientConfig.telefon || clientConfig.phone || '',
    companyEmail: clientConfig.clientmail || clientConfig.email || clientConfig.mail || '',
    companyWebsite,
    openingHours,
    mapsEmbed,
    middleInfos,
    showContactSection,
    maxLayoutWidth,
    showCompanyName,
    analyticsId,
    analyticsType,
    siteUrl: SITE_URL,
    logo,
    favicon,
    navigation,
    socialLinks,
    theme: {
      primaryColor: primaryColor || '#0f172a',
      secondaryColor: secondaryColor || '#94a3b8',
      accentColor: accentColor || '#3b82f6',
      accentColorDark: accentColor ? darkenHex(accentColor, 15) : '#2563eb',
      backgroundColor: bgColor || '#ffffff',
      textColor: fontColor || primaryColor || '#0f172a',
      bodyFont: bodyFont || "'Inter', system-ui, sans-serif",
      headingFont: headingFont || bodyFont || "'Inter', system-ui, sans-serif",
    },
  };
}

/**
 * Darken a hex color by a percentage (0-100).
 */
function darkenHex(hex, percent) {
  hex = hex.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) - Math.round(2.55 * percent)));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) - Math.round(2.55 * percent)));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) - Math.round(2.55 * percent)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ─── Asset Copying ──────────────────────────────────────────────────

async function copyAssets(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    log.warn(`Assets directory not found: ${srcDir}`);
    return;
  }

  // Clean previous assets for idempotency
  await fs.emptyDir(destDir);
  log.verbose('Cleaned public/assets/ directory');

  // Copy uploads directory
  const uploadsDirs = ['uploads', 'userupload'];
  for (const dir of uploadsDirs) {
    const src = path.join(srcDir, dir);
    if (fs.existsSync(src)) {
      const dest = path.join(destDir, dir);
      await fs.copy(src, dest, { overwrite: false });
      const count = countFiles(dest);
      log.info(`Copied ${dir}: ${count} files`);
    }
  }

  // Copy phpthumbof cache files with hash removed to userupload/assets/uploads/
  // These files may be the only copy of images referenced in ContentBlocks
  const phpthumbDir = path.join(srcDir, 'components', 'phpthumbof', 'cache');
  if (fs.existsSync(phpthumbDir)) {
    const destUploads = path.join(destDir, 'userupload', 'assets', 'uploads');
    await fs.ensureDir(destUploads);
    const hashPattern = /\.([a-f0-9]{32})\./;
    let phpCopied = 0;
    const files = fs.readdirSync(phpthumbDir);
    // Use a Set with EXACT (case-sensitive) names to avoid macOS case-insensitive
    // filesystem skipping files like Touch_Prestige.jpg when TOUCH_Prestige.jpg exists
    const copiedNames = new Set();
    for (const file of files) {
      const match = file.match(hashPattern);
      if (match) {
        const cleanName = decodeURIComponent(file.replace(match[0], '.'));
        if (!copiedNames.has(cleanName)) {
          copiedNames.add(cleanName);
          const destFile = path.join(destUploads, cleanName);
          try {
            await fs.copy(path.join(phpthumbDir, file), destFile);
            phpCopied++;
          } catch {}
        }
      }
    }
    if (phpCopied > 0) {
      log.info(`Recovered from phpthumbof cache: ${phpCopied} files`);
    }
  }
}

/**
 * Convert all JPG/JPEG/PNG files in publicAssetsDir to WebP using sharp.
 * Deletes originals after successful conversion.
 * Returns a Map of { '/assets/foo.jpg' → '/assets/foo.webp' }.
 */
async function convertToWebP(publicAssetsDir) {
  const pathMap = new Map();
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    return pathMap; // sharp not available
  }

  const EXTS = new Set(['.jpg', '.jpeg', '.png']);

  async function walk(dir, urlPrefix) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), `${urlPrefix}${entry.name}/`);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!EXTS.has(ext)) continue;
        const srcFile = path.join(dir, entry.name);
        const webpName = entry.name.slice(0, -ext.length) + '.webp';
        const destFile = path.join(dir, webpName);
        // Skip if WebP already exists
        if (fs.existsSync(destFile)) {
          pathMap.set(`${urlPrefix}${entry.name}`, `${urlPrefix}${webpName}`);
          try { fs.unlinkSync(srcFile); } catch {}
          continue;
        }
        try {
          // Resize if image dimensions exceed practical display limits.
          // Max 1600px for regular images (saves 60-80% bytes for 2048px+ photos).
          const meta = await sharp(srcFile).metadata();
          const MAX = 1600;
          let pipeline = sharp(srcFile);
          if (meta.width && meta.height) {
            const longest = Math.max(meta.width, meta.height);
            if (longest > MAX) {
              pipeline = meta.width >= meta.height
                ? pipeline.resize({ width: MAX, withoutEnlargement: true })
                : pipeline.resize({ height: MAX, withoutEnlargement: true });
            }
          }
          await pipeline.webp({ quality: 85 }).toFile(destFile);
          fs.unlinkSync(srcFile);
          pathMap.set(`${urlPrefix}${entry.name}`, `${urlPrefix}${webpName}`);
        } catch {
          // keep original if conversion fails (e.g. SVG or corrupt file)
        }
      }
    }
  }

  await walk(publicAssetsDir, '/assets/');
  return pathMap;
}

/**
 * Replace old image paths with WebP paths in all generated JSON content files.
 * Updates pages/*.json and site-config.json (logo, favicon).
 */
function patchImagePaths(outPath, pathMap) {
  if (pathMap.size === 0) return;

  // Build a single regex that matches any of the old paths (URL-encoded or not)
  // Sorted by length descending to avoid partial replacements
  const sortedOld = [...pathMap.keys()].sort((a, b) => b.length - a.length);
  const escapedParts = sortedOld.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(escapedParts.join('|'), 'g');

  function replaceIn(filePath) {
    if (!fs.existsSync(filePath)) return;
    const original = fs.readFileSync(filePath, 'utf-8');
    const updated = original.replace(regex, match => pathMap.get(match) || match);
    if (updated !== original) fs.writeFileSync(filePath, updated, 'utf-8');
  }

  // Update all page JSON files
  const pagesDir = path.join(outPath, 'pages');
  if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir)) {
      if (file.endsWith('.json')) replaceIn(path.join(pagesDir, file));
    }
  }
  // Update site-config (logo, favicon, etc.)
  replaceIn(path.join(outPath, 'site-config.json'));
}

function countFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) count++;
    else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
  }
  return count;
}

// ─── Argument Parsing ───────────────────────────────────────────────

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

// ─── Exports for testing ────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    parseSQLValues,
    parseSQLValue,
    mapRowToResource,
    extractResources,
    extractClientConfig,
    extractRedirects,
    processContentBlocks,
    processContentFields,
    processHeroLayout,
    resolveImagePath,
    resolvePhpThumbOf,
    normalizeFilename,
    fuzzyFindFile,
    cleanHtml,
    cleanModxTags,
    extractTextFromHtml,
    stripTitleFromHtml,
    mapPosition,
    mapMinHeight,
    mapVerticalAlign,
    mapTrennerWidth,
    buildSiteConfig,
    parseArgs,
    // Keep main for direct execution
    main,
  };
}

// ─── Run (only when executed directly) ──────────────────────────────
if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

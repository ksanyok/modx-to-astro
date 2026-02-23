/**
 * MODX → Astro Migration CLI Tests
 * 
 * Tests core parsing, mapping, and transformation functions.
 * Run: npm test
 */

// Mock globals that migrate.js expects
const path = require('path');
const os = require('os');

// We need to set these before requiring migrate.js since it reads them at module level
process.argv = ['node', 'test', '--sql', '/tmp/test.sql', '--assets', '/tmp/test-assets', '--out', '/tmp/test-out'];

const migrate = require('./migrate');

// ─── SQL Parsing ────────────────────────────────────────────────────

describe('parseSQLValue', () => {
  test('parses unquoted numeric values as numbers', () => {
    expect(migrate.parseSQLValue('42')).toBe(42);
  });

  test('parses quoted numeric values as strings', () => {
    expect(migrate.parseSQLValue("'42'")).toBe('42');
  });

  test('parses quoted strings', () => {
    expect(migrate.parseSQLValue("'hello world'")).toBe('hello world');
  });

  test('parses NULL', () => {
    expect(migrate.parseSQLValue('NULL')).toBe(null);
  });

  test('handles escaped quotes', () => {
    expect(migrate.parseSQLValue("'it\\'s here'")).toBe("it's here");
  });

  test('handles empty string', () => {
    expect(migrate.parseSQLValue("''")).toBe('');
  });
});

describe('parseSQLValues', () => {
  test('parses single row', () => {
    const result = migrate.parseSQLValues("(1,'hello','world')");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([1, 'hello', 'world']);
  });

  test('parses multiple rows', () => {
    const result = migrate.parseSQLValues("(1,'a'),(2,'b'),(3,'c')");
    expect(result).toHaveLength(3);
    expect(result[0][0]).toBe(1);
    expect(result[1][1]).toBe('b');
    expect(result[2][0]).toBe(3);
  });

  test('handles NULL values in rows', () => {
    const result = migrate.parseSQLValues("(1,NULL,'test')");
    expect(result[0]).toEqual([1, null, 'test']);
  });

  test('handles escaped content in rows', () => {
    const result = migrate.parseSQLValues("(1,'it\\'s a \\\"test\\\"')");
    expect(result).toHaveLength(1);
    expect(result[0][1]).toContain("it's");
  });
});

// ─── Resource Mapping ───────────────────────────────────────────────

describe('mapRowToResource', () => {
  test('maps row array to resource object', () => {
    // mapRowToResource column mapping: 0=id, 3=pagetitle, 6=alias, 9=published, 17=template, 37=context_key
    const row = new Array(44).fill('');
    row[0] = 5;              // id
    row[3] = 'Test';         // pagetitle
    row[6] = 'test-page';   // alias
    row[9] = 1;              // published
    row[17] = 1;             // template
    row[37] = 'web';         // context_key
    row[39] = 'test-page';   // uri
    
    const resource = migrate.mapRowToResource(row);
    expect(resource.id).toBe(5);
    expect(resource.pagetitle).toBe('Test');
    expect(resource.alias).toBe('test-page');
    expect(resource.published).toBe(1);
    expect(resource.template).toBe(1);
    expect(resource.context_key).toBe('web');
  });

  test('preserves context_key field', () => {
    const row = new Array(44).fill('');
    row[0] = 1;
    row[37] = 'mgr';
    
    const resource = migrate.mapRowToResource(row);
    expect(resource.context_key).toBe('mgr');
  });
});

// ─── HTML Cleaning ──────────────────────────────────────────────────

describe('cleanHtml', () => {
  test('removes <br> tags', () => {
    expect(migrate.cleanHtml('Hello<br>World')).toBe('HelloWorld');
    expect(migrate.cleanHtml('Hello<br/>World')).toBe('HelloWorld');
    expect(migrate.cleanHtml('Hello<br />World')).toBe('HelloWorld');
  });

  test('handles empty/null input', () => {
    expect(migrate.cleanHtml('')).toBe('');
    expect(migrate.cleanHtml(null)).toBe('');
    expect(migrate.cleanHtml(undefined)).toBe('');
  });

  test('trims whitespace', () => {
    expect(migrate.cleanHtml('  hello  ')).toBe('hello');
  });
});

describe('cleanModxTags', () => {
  test('removes chunk calls', () => {
    expect(migrate.cleanModxTags('before[[$myChunk]]after')).toBe('beforeafter');
  });

  test('removes snippet calls', () => {
    expect(migrate.cleanModxTags('[[!mySnippet?param=1]]')).toBe('');
    expect(migrate.cleanModxTags('[[mySnippet]]')).toBe('');
  });

  test('removes placeholder modifiers', () => {
    expect(migrate.cleanModxTags('[[+placeholder:default]]')).toBe('');
  });

  test('handles empty/null input', () => {
    expect(migrate.cleanModxTags('')).toBe('');
    expect(migrate.cleanModxTags(null)).toBe('');
  });
});

describe('extractTextFromHtml', () => {
  test('extracts text from simple HTML', () => {
    expect(migrate.extractTextFromHtml('<p>Hello World</p>')).toBe('Hello World');
  });

  test('handles nested tags', () => {
    expect(migrate.extractTextFromHtml('<div><p><b>Bold</b> text</p></div>')).toBe('Bold text');
  });

  test('handles empty input', () => {
    expect(migrate.extractTextFromHtml('')).toBe('');
  });
});

// ─── Position / Layout Mapping ──────────────────────────────────────

describe('mapPosition', () => {
  test('maps CSS class to position value', () => {
    expect(migrate.mapPosition('img-cover-pos-t')).toBe('top');
    expect(migrate.mapPosition('img-cover-pos-b')).toBe('bottom');
    expect(migrate.mapPosition('img-cover-pos-l')).toBe('left');
    expect(migrate.mapPosition('img-cover-pos-r')).toBe('right');
  });

  test('returns center for empty/unknown', () => {
    expect(migrate.mapPosition('')).toBe('center');
    expect(migrate.mapPosition('something-else')).toBe('center');
  });
});

describe('mapMinHeight', () => {
  test('maps hero min-height CSS classes', () => {
    expect(migrate.mapMinHeight('header-fullheight')).toBe('full');
    expect(migrate.mapMinHeight('minheight65')).toBe('medium');
    expect(migrate.mapMinHeight('other')).toBe('small');
  });
});

describe('mapVerticalAlign', () => {
  test('maps vertical align CSS classes', () => {
    expect(migrate.mapVerticalAlign('header-content-valign-t')).toBe('top');
    expect(migrate.mapVerticalAlign('header-content-valign-b')).toBe('bottom');
    expect(migrate.mapVerticalAlign('other')).toBe('center');
  });
});

describe('mapTrennerWidth', () => {
  test('maps trenner CSS classes to width', () => {
    expect(migrate.mapTrennerWidth('trenner-20')).toBe('20');
    expect(migrate.mapTrennerWidth('trenner-40')).toBe('40');
    expect(migrate.mapTrennerWidth('trenner-60')).toBe('60');
    expect(migrate.mapTrennerWidth('other')).toBe('full');
  });
});

// ─── Image Path Resolution ──────────────────────────────────────────

describe('normalizeFilename', () => {
  test('lowercases filename', () => {
    expect(migrate.normalizeFilename('MyFile.JPG')).toBe('myfile.jpg');
  });

  test('normalizes spaces and underscores', () => {
    expect(migrate.normalizeFilename('my file.jpg')).toBe('my_file.jpg');
    expect(migrate.normalizeFilename('my_file.jpg')).toBe('my_file.jpg');
    expect(migrate.normalizeFilename('my  file.jpg')).toBe('my_file.jpg');
  });

  test('normalizes jpeg to jpg', () => {
    expect(migrate.normalizeFilename('photo.jpeg')).toBe('photo.jpg');
    expect(migrate.normalizeFilename('photo.JPEG')).toBe('photo.jpg');
  });

  test('handles combined cases', () => {
    expect(migrate.normalizeFilename('My Photo.JPEG')).toBe('my_photo.jpg');
    expect(migrate.normalizeFilename('ohne Treppenauskleidung.jpg')).toBe('ohne_treppenauskleidung.jpg');
    expect(migrate.normalizeFilename('ohne_Treppenauskleidung.jpg')).toBe('ohne_treppenauskleidung.jpg');
  });
});

describe('resolveImagePath', () => {
  test('returns empty for null/undefined', () => {
    expect(migrate.resolveImagePath('')).toBe('');
    expect(migrate.resolveImagePath(null)).toBe('');
    expect(migrate.resolveImagePath(undefined)).toBe('');
  });

  test('preserves http URLs', () => {
    expect(migrate.resolveImagePath('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  test('preserves paths with /assets/ prefix', () => {
    const result = migrate.resolveImagePath('/assets/uploads/test.jpg');
    expect(result).toBe('/assets/uploads/test.jpg');
  });

  test('adds leading slash if missing', () => {
    const result = migrate.resolveImagePath('assets/uploads/test.jpg');
    expect(result).toContain('/assets/');
  });
});

// ─── Client Config Extraction ───────────────────────────────────────

describe('extractClientConfig', () => {
  test('extracts settings from SQL', () => {
    // extractClientConfig regex expects a SINGLE INSERT with multiple rows, not separate INSERTs
    // Columns: 0=id, 1=key, 2=label, 3=xtype, 4=description, 5=is_required, 6=sortorder, 7=value, 8=default, 9=group
    const sql = `
INSERT INTO \`modx_clientconfig_setting\` VALUES ('1','site_name','Site Name','textfield','','0','0','Site Name Value','','default','','0','0'),('2','clientmail','Email','textfield','','0','0','test@example.com','','default','','0','0');
`;
    const config = migrate.extractClientConfig(sql);
    expect(config.site_name).toBe('Site Name Value');
    expect(config.clientmail).toBe('test@example.com');
  });

  test('returns empty object for no matches', () => {
    const config = migrate.extractClientConfig('SELECT 1;');
    expect(config).toEqual({});
  });
});

// ─── Redirect Extraction ────────────────────────────────────────────

describe('extractRedirects', () => {
  test('extracts redirects from SQL', () => {
    const sql = `
INSERT INTO \`modx_seosuite_redirect\` VALUES (1,'web',0,'old-page.html','new-page','301','1',0,NULL,NULL);
`;
    const redirects = migrate.extractRedirects(sql);
    expect(redirects).toHaveLength(1);
    expect(redirects[0].old_url).toBe('/old-page.html');
    expect(redirects[0].new_url).toBe('/new-page');
    expect(redirects[0].redirect_type).toBe('301');
  });

  test('skips inactive redirects', () => {
    const sql = `
INSERT INTO \`modx_seosuite_redirect\` VALUES (1,'web',0,'old.html','new','301','0',0,NULL,NULL);
`;
    const redirects = migrate.extractRedirects(sql);
    expect(redirects).toHaveLength(0);
  });

  test('returns empty array for no redirect table', () => {
    const redirects = migrate.extractRedirects('SELECT 1;');
    expect(redirects).toEqual([]);
  });
});

// ─── Content Field Processing ───────────────────────────────────────

describe('processContentFields', () => {
  test('processes heading field', () => {
    const fields = [
      { field: 2, value: 'Test Heading' }
    ];
    const result = migrate.processContentFields(fields, {});
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('heading');
    expect(result[0].text).toBe('Test Heading');
  });

  test('processes text/richtext field', () => {
    const fields = [
      { field: 3, value: '<p>Some rich text</p>' }
    ];
    const result = migrate.processContentFields(fields, {});
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    expect(result[0].content).toContain('Some rich text');
  });

  test('processes image field', () => {
    // Image fields use field.url not field.value, and resolve through resolveImagePath
    const fields = [
      { field: 4, url: '/assets/uploads/test.jpg', title: 'Test image' }
    ];
    const result = migrate.processContentFields(fields, {});
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('image');
    expect(result[0].src).toBe('/assets/uploads/test.jpg');
    expect(result[0].alt).toBe('Test image');
  });

  test('skips empty/spacer fields', () => {
    const fields = [
      { field: 0, value: '' },
      { field: 37, value: 'spacer' }
    ];
    const result = migrate.processContentFields(fields, {});
    expect(result).toHaveLength(0);
  });
});

// ─── Parse Args ─────────────────────────────────────────────────────

describe('parseArgs', () => {
  test('parses key-value args', () => {
    const result = migrate.parseArgs(['--sql', 'dump.sql', '--out', './output']);
    expect(result.sql).toBe('dump.sql');
    expect(result.out).toBe('./output');
  });

  test('parses boolean flags', () => {
    const result = migrate.parseArgs(['--verbose', '--help']);
    expect(result.verbose).toBe(true);
    expect(result.help).toBe(true);
  });

  test('handles mixed args', () => {
    const result = migrate.parseArgs(['--sql', 'test.sql', '--verbose']);
    expect(result.sql).toBe('test.sql');
    expect(result.verbose).toBe(true);
  });
});

// ─── Integration: stripTitleFromHtml ────────────────────────────────

describe('stripTitleFromHtml', () => {
  test('removes h1-h6 from HTML', () => {
    const html = '<h3>Title</h3><p>Content here</p>';
    const result = migrate.stripTitleFromHtml(html);
    expect(result).not.toContain('<h3>');
    expect(result).toContain('Content here');
  });
});

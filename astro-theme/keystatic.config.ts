/**
 * Keystatic CMS Configuration
 *
 * Storage adapter is controlled by environment variables:
 *
 *   KEYSTATIC_STORAGE_KIND=gitlab   → GitLab-based storage (team / CI use)
 *   (default)                       → local filesystem (development)
 *
 * Required env vars when using GitLab storage:
 *   KEYSTATIC_GITLAB_GROUP    — GitLab namespace/group (e.g. "my-org")
 *   KEYSTATIC_GITLAB_PROJECT  — repository name (e.g. "modx-to-astro")
 *
 * To start the CMS locally:
 *   KEYSTATIC=true npm run dev
 *   open http://localhost:4321/keystatic
 *
 * Production builds are always fully static (Keystatic disabled automatically).
 */
import { config, fields, collection, singleton } from '@keystatic/core';

// ─── Storage ────────────────────────────────────────────────────────
const storage =
  process.env.KEYSTATIC_STORAGE_KIND === 'gitlab'
    ? ({
        kind: 'gitlab' as const,
        repo: {
          owner: process.env.KEYSTATIC_GITLAB_GROUP as string,
          name: process.env.KEYSTATIC_GITLAB_PROJECT as string,
        },
      } as const)
    : ({ kind: 'local' } as const);

// ─── Reusable block field definitions ───────────────────────────────

const heroFields = fields.object({
  title:              fields.text({ label: 'Title' }),
  subtitle:           fields.text({ label: 'Subtitle', multiline: true }),
  backgroundImage:    fields.text({ label: 'Background Image Path' }),
  backgroundVideo:    fields.text({ label: 'Background Video Path' }),
  backgroundPosition: fields.text({ label: 'Background Position', defaultValue: 'center' }),
  overlayOpacity:     fields.integer({ label: 'Overlay Opacity (0-100)', defaultValue: 40 }),
  minHeight:          fields.select({
    label: 'Min Height',
    options: [
      { label: 'Full screen', value: 'full' },
      { label: 'Half screen', value: 'half' },
      { label: 'Auto', value: 'auto' },
    ],
    defaultValue: 'full',
  }),
  textAlign:    fields.text({ label: 'Text Align', defaultValue: '' }),
  verticalAlign: fields.text({ label: 'Vertical Align', defaultValue: '' }),
});

const textFields = fields.object({
  content:  fields.text({ label: 'HTML Content', multiline: true }),
  maxWidth: fields.checkbox({ label: 'Constrain max-width', defaultValue: false }),
  cardLink: fields.text({ label: 'Card Link URL', defaultValue: '' }),
});

const headingFields = fields.object({
  text:      fields.text({ label: 'Heading Text' }),
  level:     fields.select({
    label: 'Heading Level',
    options: [
      { label: 'H1', value: 'h1' }, { label: 'H2', value: 'h2' },
      { label: 'H3', value: 'h3' }, { label: 'H4', value: 'h4' },
      { label: 'H5', value: 'h5' }, { label: 'H6', value: 'h6' },
    ],
    defaultValue: 'h2',
  }),
  textAlign: fields.text({ label: 'Text Align', defaultValue: '' }),
});

const imageFields = fields.object({
  src:       fields.text({ label: 'Image Path' }),
  alt:       fields.text({ label: 'Alt Text', defaultValue: '' }),
  link:      fields.text({ label: 'Link URL', defaultValue: '' }),
  width:     fields.integer({ label: 'Width (px)' }),
  height:    fields.integer({ label: 'Height (px)' }),
  borderless: fields.checkbox({ label: 'Borderless', defaultValue: false }),
  cover:     fields.checkbox({ label: 'Cover (object-fit)', defaultValue: false }),
  position:  fields.text({ label: 'Object Position', defaultValue: '' }),
});

const galleryFields = fields.object({
  columns: fields.text({ label: 'Columns', defaultValue: '3' }),
  images: fields.array(
    fields.object({
      src:   fields.text({ label: 'Image Path' }),
      alt:   fields.text({ label: 'Alt Text', defaultValue: '' }),
      title: fields.text({ label: 'Caption', defaultValue: '' }),
    }),
    { label: 'Images', itemLabel: (p) => p.fields.title.value || p.fields.src.value || 'Image' },
  ),
});

const sliderFields = fields.object({
  slides: fields.array(
    fields.object({
      image: fields.text({ label: 'Image Path', defaultValue: '' }),
      title: fields.text({ label: 'Title', defaultValue: '' }),
      text:  fields.text({ label: 'Text', multiline: true, defaultValue: '' }),
      link:  fields.text({ label: 'Link URL', defaultValue: '' }),
    }),
    { label: 'Slides', itemLabel: (p) => p.fields.title.value || 'Slide' },
  ),
});

const videoFields = fields.object({
  src:   fields.text({ label: 'Video URL or Path' }),
  title: fields.text({ label: 'Title', defaultValue: '' }),
});

const youtubeFields = fields.object({
  url:     fields.text({ label: 'YouTube URL or Embed URL', defaultValue: '' }),
  videoId: fields.text({ label: 'YouTube Video ID (legacy)', defaultValue: '' }),
});

const htmlFields = fields.object({
  content: fields.text({ label: 'Raw HTML', multiline: true }),
});

const accordionFields = fields.object({
  negative: fields.checkbox({ label: 'Dark/Negative Style', defaultValue: false }),
  items: fields.array(
    fields.object({
      title:   fields.text({ label: 'Question / Title' }),
      content: fields.text({ label: 'Answer / Content', multiline: true }),
    }),
    { label: 'Accordion Items', itemLabel: (p) => p.fields.title.value || 'Item' },
  ),
});

const buttonsFields = fields.object({
  items: fields.array(
    fields.object({
      text: fields.text({ label: 'Button Text', defaultValue: '' }),
      href: fields.text({ label: 'Button URL', defaultValue: '' }),
    }),
    { label: 'Buttons', itemLabel: (p) => p.fields.text.value || 'Button' },
  ),
});

const featuresFields = fields.object({
  items: fields.array(
    fields.object({
      icon: fields.text({ label: 'Icon (emoji or SVG path)', defaultValue: '' }),
      text: fields.text({ label: 'Feature Text', multiline: true, defaultValue: '' }),
    }),
    { label: 'Features', itemLabel: (p) => p.fields.text.value?.slice(0, 40) || 'Feature' },
  ),
});

const dividerFields = fields.object({
  width:        fields.text({ label: 'Width %', defaultValue: '100' }),
  marginTop:    fields.text({ label: 'Margin Top', defaultValue: '' }),
  marginBottom: fields.text({ label: 'Margin Bottom', defaultValue: '' }),
});

const sectionFields = fields.object({
  marginTop:       fields.text({ label: 'Margin Top', defaultValue: '' }),
  marginBottom:    fields.text({ label: 'Margin Bottom', defaultValue: '' }),
  backgroundColor: fields.text({ label: 'Background Color', defaultValue: '' }),
  textAlign:       fields.text({ label: 'Text Align', defaultValue: '' }),
  anchor:          fields.text({ label: 'Anchor ID', defaultValue: '' }),
  fullWidth:       fields.checkbox({ label: 'Full Width', defaultValue: false }),
});

const fileFields = fields.object({
  src:   fields.text({ label: 'File Path' }),
  title: fields.text({ label: 'Download Label', defaultValue: '' }),
});

const contactFormFields = fields.object({});

// Block type selector shared between all block arrays
const BLOCK_TYPES = [
  { label: 'Hero',         value: 'hero' },
  { label: 'Text',         value: 'text' },
  { label: 'Heading',      value: 'heading' },
  { label: 'Image',        value: 'image' },
  { label: 'Gallery',      value: 'gallery' },
  { label: 'Slider',       value: 'slider' },
  { label: 'Video',        value: 'video' },
  { label: 'YouTube',      value: 'youtube' },
  { label: 'Accordion',    value: 'accordion' },
  { label: 'Buttons',      value: 'buttons' },
  { label: 'Features',     value: 'features' },
  { label: 'Divider',      value: 'divider' },
  { label: 'HTML (raw)',   value: 'html' },
  { label: 'File Download', value: 'file' },
  { label: 'Contact Form', value: 'contact-form' },
  { label: 'Section',      value: 'section' },
  { label: 'Grid',         value: 'grid' },
] as const;

const blockConditional = fields.conditional(
  fields.select({ label: 'Block Type', options: [...BLOCK_TYPES], defaultValue: 'text' }),
  {
    hero:           heroFields,
    text:           textFields,
    heading:        headingFields,
    image:          imageFields,
    gallery:        galleryFields,
    slider:         sliderFields,
    video:          videoFields,
    youtube:        youtubeFields,
    accordion:      accordionFields,
    buttons:        buttonsFields,
    features:       featuresFields,
    divider:        dividerFields,
    html:           htmlFields,
    file:           fileFields,
    'contact-form': contactFormFields,
    section:        sectionFields,
    grid:           sectionFields, // grid nesting edited via migration script; same meta fields
  },
);

// ─── Keystatic config ────────────────────────────────────────────────

export default config({
  storage,

  singletons: {
    // ─── Site Configuration ─────────────────────────────────────────
    siteConfig: singleton({
      label: 'Site Configuration',
      path: 'src/content/site-config',
      format: { data: 'json' },
      schema: {
        companyName: fields.text({
          label: 'Company Name',
          description: 'Displayed in header/footer',
        }),
        companyAddress: fields.text({
          label: 'Company Address',
          multiline: true,
        }),
        companyPhone: fields.text({ label: 'Phone Number' }),
        companyEmail: fields.text({ label: 'Email Address' }),
        siteUrl: fields.text({
          label: 'Site URL',
          description: 'Full production URL (e.g., https://example.ch)',
        }),
        logo: fields.text({
          label: 'Logo Path',
          description: 'e.g. /assets/userupload/logo.png',
        }),
        favicon: fields.text({ label: 'Favicon Path' }),
        socialLinks: fields.array(
          fields.object({
            platform: fields.select({
              label: 'Platform',
              options: [
                { label: 'Facebook',   value: 'facebook' },
                { label: 'Instagram',  value: 'instagram' },
                { label: 'LinkedIn',   value: 'linkedin' },
                { label: 'YouTube',    value: 'youtube' },
                { label: 'TikTok',    value: 'tiktok' },
                { label: 'Twitter/X', value: 'twitter' },
              ],
              defaultValue: 'facebook',
            }),
            url: fields.text({ label: 'URL' }),
          }),
          { label: 'Social Links', itemLabel: (p) => p.fields.platform.value },
        ),
        navigation: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
            href:  fields.text({ label: 'URL' }),
            children: fields.array(
              fields.object({
                label: fields.text({ label: 'Label' }),
                href:  fields.text({ label: 'URL' }),
              }),
              { label: 'Sub-menu Items', itemLabel: (p) => p.fields.label.value },
            ),
          }),
          { label: 'Navigation', itemLabel: (p) => p.fields.label.value },
        ),
        theme: fields.object(
          {
            primaryColor:    fields.text({ label: 'Primary Color',    description: 'Hex, e.g. #1e365a', defaultValue: '#18181b' }),
            secondaryColor:  fields.text({ label: 'Secondary Color',  defaultValue: '#e2e8f0' }),
            accentColor:     fields.text({ label: 'Accent Color',     defaultValue: '#3b82f6' }),
            accentColorDark: fields.text({ label: 'Accent Color (Dark)', defaultValue: '#1d4ed8' }),
            backgroundColor: fields.text({ label: 'Background Color', defaultValue: '#ffffff' }),
            textColor:       fields.text({ label: 'Text Color',       defaultValue: '#1e1e2e' }),
            bodyFont:        fields.text({ label: 'Body Font',    description: "CSS font-family, e.g. 'Inter', sans-serif", defaultValue: "'Inter', sans-serif" }),
            headingFont:     fields.text({ label: 'Heading Font', description: "CSS font-family for headings",               defaultValue: "'Inter', sans-serif" }),
          },
          { label: 'Theme Colors & Fonts' },
        ),
        trackingCodeHead: fields.text({
          label: 'Tracking Code <head>',
          description: 'Script tags injected into <head> (Google Analytics, GTM, Facebook Pixel, etc.)',
          multiline: true,
          defaultValue: '',
        }),
        trackingCodeBody: fields.text({
          label: 'Tracking Code <body>',
          description: 'Script/noscript tags injected right after <body> opens (e.g. GTM noscript fallback)',
          multiline: true,
          defaultValue: '',
        }),
      },
    }),
  },

  collections: {
    // ─── Pages ──────────────────────────────────────────────────────
    pages: collection({
      label: 'Pages',
      path: 'src/content/pages/**',
      format: { data: 'json' },
      slugField: 'title',
      schema: {
        title: fields.text({
          label: 'Page Title',
          validation: { isRequired: true },
        }),
        description: fields.text({
          label: 'Meta Description',
          multiline: true,
        }),
        slug: fields.text({
          label: 'URL Slug',
          description: 'URL path for this page (leave empty for homepage)',
        }),
        isHomepage: fields.checkbox({
          label: 'Is Homepage',
          defaultValue: false,
        }),
        template: fields.integer({
          label: 'Template ID',
          description: 'MODX template ID (for reference)',
        }),
        blocks: fields.array(
          blockConditional,
          {
            label: 'Content Blocks',
            itemLabel: (props) => props.discriminant || 'Block',
          },
        ),
      },
    }),
  },
});

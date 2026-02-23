/**
 * Keystatic CMS Configuration
 * 
 * This file defines the content schema for the Keystatic admin UI.
 * To enable Keystatic admin panel:
 *   1. Set KEYSTATIC=true environment variable
 *   2. Run: npm run dev (or KEYSTATIC=true npx astro dev)
 *   3. Visit: http://localhost:4321/keystatic
 * 
 * For production builds, Keystatic is disabled and the site builds as static.
 */
import { config, fields, collection, singleton } from '@keystatic/core';

export default config({
  storage: {
    kind: 'local',
  },

  singletons: {
    // ─── Site Configuration ─────────────────────────────────────────
    siteConfig: singleton({
      label: 'Site Configuration',
      path: 'src/content/site-config',
      format: { data: 'json' },
      schema: {
        companyName: fields.text({
          label: 'Company Name',
          description: 'The company or website name displayed in header/footer',
        }),
        companyAddress: fields.text({
          label: 'Company Address',
          multiline: true,
          description: 'Full address (HTML allowed)',
        }),
        companyPhone: fields.text({
          label: 'Phone Number',
        }),
        companyEmail: fields.text({
          label: 'Email Address',
        }),
        siteUrl: fields.text({
          label: 'Site URL',
          description: 'Full URL of the production site (e.g., https://example.ch)',
        }),
        logo: fields.text({
          label: 'Logo Path',
          description: 'Path to the logo image (e.g., /assets/uploads/logo.png)',
        }),
        favicon: fields.text({
          label: 'Favicon Path',
          description: 'Path to the favicon file',
        }),
        socialLinks: fields.array(
          fields.object({
            platform: fields.select({
              label: 'Platform',
              options: [
                { label: 'Facebook', value: 'facebook' },
                { label: 'Instagram', value: 'instagram' },
                { label: 'LinkedIn', value: 'linkedin' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'TikTok', value: 'tiktok' },
                { label: 'Twitter/X', value: 'twitter' },
              ],
              defaultValue: 'facebook',
            }),
            url: fields.text({ label: 'URL' }),
          }),
          {
            label: 'Social Links',
            itemLabel: (props) => props.fields.platform.value,
          },
        ),
        navigation: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
            href: fields.text({ label: 'URL' }),
            children: fields.array(
              fields.object({
                label: fields.text({ label: 'Label' }),
                href: fields.text({ label: 'URL' }),
              }),
              {
                label: 'Sub-menu Items',
                itemLabel: (props) => props.fields.label.value,
              },
            ),
          }),
          {
            label: 'Navigation',
            itemLabel: (props) => props.fields.label.value,
          },
        ),
        theme: fields.object(
          {
            primaryColor: fields.text({
              label: 'Primary Color',
              description: 'Hex color (e.g., #1e365a)',
              defaultValue: '#18181b',
            }),
            secondaryColor: fields.text({
              label: 'Secondary Color',
              defaultValue: '#e2e8f0',
            }),
            accentColor: fields.text({
              label: 'Accent Color',
              defaultValue: '#3b82f6',
            }),
            accentColorDark: fields.text({
              label: 'Accent Color (Dark)',
              defaultValue: '#1d4ed8',
            }),
            backgroundColor: fields.text({
              label: 'Background Color',
              defaultValue: '#ffffff',
            }),
            textColor: fields.text({
              label: 'Text Color',
              defaultValue: '#1e1e2e',
            }),
            bodyFont: fields.text({
              label: 'Body Font',
              description: "CSS font-family (e.g., 'Inter', sans-serif)",
              defaultValue: "'Inter', sans-serif",
            }),
            headingFont: fields.text({
              label: 'Heading Font',
              description: "CSS font-family for headings",
              defaultValue: "'Inter', sans-serif",
            }),
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
        // Blocks are stored as raw JSON — complex editing is done via migration script
        // Keystatic provides basic JSON editing capability here
        blocks: fields.array(
          fields.object({
            type: fields.text({ label: 'Block Type' }),
            // Additional fields depend on block type
            // For full block editing, use the migration script or extend this schema
          }),
          {
            label: 'Content Blocks',
            description: 'Structured content blocks (auto-generated by migration script)',
            itemLabel: (props) => props.fields.type.value || 'Block',
          },
        ),
      },
    }),
  },
});

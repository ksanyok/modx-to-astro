/**
 * Astro Content Collections Configuration
 * Defines the schema for all content types used in the migration pipeline.
 * 
 * Collections:
 * - pages: Individual page data with structured ContentBlocks
 * - siteConfig: Global site settings (singleton pattern)
 */
import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

// ─── Block Schemas ──────────────────────────────────────────────────
// Each block type has its own schema. Using passthrough() allows 
// forward-compatibility with new block types from different MODX sites.

const heroBlockSchema = z.object({
  type: z.literal('hero'),
  title: z.string().optional().default(''),
  subtitle: z.string().optional().default(''),
  backgroundImage: z.string().optional().default(''),
  backgroundVideo: z.string().optional().default(''),
  backgroundPosition: z.string().optional().default('center'),
  overlayOpacity: z.number().optional().default(40),
  minHeight: z.string().optional().default('full'),
  textAlign: z.string().optional().default(''),
  verticalAlign: z.string().optional().default(''),
});

const textBlockSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
  maxWidth: z.boolean().optional().default(false),
});

const headingBlockSchema = z.object({
  type: z.literal('heading'),
  text: z.string(),
  level: z.string().optional().default('h2'),
  textAlign: z.string().optional().default(''),
});

const imageBlockSchema = z.object({
  type: z.literal('image'),
  src: z.string(),
  alt: z.string().optional().default(''),
  link: z.string().optional().default(''),
  width: z.number().optional(),
  height: z.number().optional(),
});

const dividerBlockSchema = z.object({
  type: z.literal('divider'),
  width: z.string().optional().default('100'),
  marginTop: z.string().optional().default(''),
  marginBottom: z.string().optional().default(''),
});

const galleryBlockSchema = z.object({
  type: z.literal('gallery'),
  images: z.array(z.object({
    src: z.string(),
    alt: z.string().optional().default(''),
    title: z.string().optional().default(''),
  })).default([]),
});

const sliderBlockSchema = z.object({
  type: z.literal('slider'),
  slides: z.array(z.object({
    image: z.string().optional().default(''),
    title: z.string().optional().default(''),
    text: z.string().optional().default(''),
    link: z.string().optional().default(''),
  })).default([]),
});

const videoBlockSchema = z.object({
  type: z.literal('video'),
  src: z.string(),
});

const youtubeBlockSchema = z.object({
  type: z.literal('youtube'),
  videoId: z.string(),
});

const htmlBlockSchema = z.object({
  type: z.literal('html'),
  content: z.string(),
});

const accordionBlockSchema = z.object({
  type: z.literal('accordion'),
  items: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })).default([]),
});

const buttonsBlockSchema = z.object({
  type: z.literal('buttons'),
  items: z.array(z.object({
    text: z.string().optional().default(''),
    href: z.string().optional().default(''),
  })).default([]),
});

const featuresBlockSchema = z.object({
  type: z.literal('features'),
  items: z.array(z.object({
    icon: z.string().optional().default(''),
    text: z.string().optional().default(''),
  })).default([]),
});

const contactFormBlockSchema = z.object({
  type: z.literal('contact-form'),
});

const fileBlockSchema = z.object({
  type: z.literal('file'),
  src: z.string(),
  title: z.string().optional().default(''),
});

// Grid and Section are recursive — use passthrough for nested blocks
const gridBlockSchema = z.object({
  type: z.literal('grid'),
  columns: z.string(),
  cells: z.array(z.array(z.object({}).passthrough())),
});

const sectionBlockSchema = z.object({
  type: z.literal('section'),
  marginTop: z.string().optional().default(''),
  marginBottom: z.string().optional().default(''),
  backgroundColor: z.string().optional().default(''),
  textAlign: z.string().optional().default(''),
  anchor: z.string().optional().default(''),
  fullWidth: z.boolean().optional().default(false),
  children: z.array(z.object({}).passthrough()).default([]),
});

// Union of all known block types, with fallback for unknown types
const blockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  textBlockSchema,
  headingBlockSchema,
  imageBlockSchema,
  dividerBlockSchema,
  galleryBlockSchema,
  sliderBlockSchema,
  videoBlockSchema,
  youtubeBlockSchema,
  htmlBlockSchema,
  accordionBlockSchema,
  buttonsBlockSchema,
  featuresBlockSchema,
  contactFormBlockSchema,
  fileBlockSchema,
  gridBlockSchema,
  sectionBlockSchema,
]).catch((ctx) => ctx.input as any); // Allow unknown block types to pass through

// ─── Page Collection ────────────────────────────────────────────────

const pages = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: './src/content/pages',
  }),
  schema: z.object({
    title: z.string().default(''),
    description: z.string().optional().default(''),
    slug: z.string().optional().default(''),
    isHomepage: z.boolean().optional().default(false),
    template: z.number().optional(),
    publishedAt: z.string().optional(),
    blocks: z.array(z.any()).default([]),
  }),
});

// ─── Site Config (Singleton) ────────────────────────────────────────

const navItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  children: z.array(z.object({
    label: z.string(),
    href: z.string(),
  })).optional(),
});

const socialLinkSchema = z.object({
  platform: z.string(),
  url: z.string(),
});

const themeSchema = z.object({
  primaryColor: z.string().optional().default('#18181b'),
  secondaryColor: z.string().optional().default('#e2e8f0'),
  accentColor: z.string().optional().default('#3b82f6'),
  accentColorDark: z.string().optional().default('#1d4ed8'),
  backgroundColor: z.string().optional().default('#ffffff'),
  textColor: z.string().optional().default('#1e1e2e'),
  bodyFont: z.string().optional().default("'Inter', sans-serif"),
  headingFont: z.string().optional().default("'Inter', sans-serif"),
});

const siteConfig = defineCollection({
  loader: file('src/content/site-config.json', {
    parser: (text) => {
      const data = JSON.parse(text);
      // file loader expects an array of items with id
      return [{ id: 'config', ...data }];
    },
  }),
  schema: z.object({
    companyName: z.string().optional().default(''),
    companyAddress: z.string().optional().default(''),
    companyPhone: z.string().optional().default(''),
    companyEmail: z.string().optional().default(''),
    companyWebsite: z.string().optional().default(''),
    siteUrl: z.string().optional().default(''),
    logo: z.string().optional().default(''),
    favicon: z.string().optional().default(''),
    socialLinks: z.array(socialLinkSchema).optional().default([]),
    navigation: z.array(navItemSchema).optional().default([]),
    theme: themeSchema.optional().default({}),
    showContactSection: z.boolean().optional().default(false),
    showCompanyName: z.boolean().optional().default(true),
    openingHours: z.string().optional().default(''),
    mapsEmbed: z.string().optional().default(''),
    middleInfos: z.string().optional().default(''),
    maxLayoutWidth: z.number().optional().default(1200),
    analyticsId: z.string().optional().default(''),
    analyticsType: z.string().optional().default('analytics'),
  }),
});

// ─── Redirects ──────────────────────────────────────────────────────

const redirects = defineCollection({
  loader: file('src/content/redirects.json'),
  schema: z.object({
    id: z.union([z.string(), z.number()]),
    old_url: z.string(),
    new_url: z.string(),
    redirect_type: z.union([z.string(), z.number()]).optional().default('301'),
  }),
});

// ─── Export ─────────────────────────────────────────────────────────

export const collections = { pages, siteConfig, redirects };

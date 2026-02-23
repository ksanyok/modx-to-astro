/**
 * imageLoader.ts
 * Resolves runtime image path strings (from JSON content, e.g. "/assets/uploads/foo.jpg")
 * to Astro ImageMetadata objects so Astro's <Image> component can generate responsive srcset.
 *
 * Images must be in src/assets/ (migrated there by the CLI pipeline).
 * URL paths in JSON like "/assets/uploads/foo.jpg"
 * map to Vite glob keys  "/src/assets/uploads/foo.jpg"
 *
 * Astro's native <Image> handles WebP conversion + srcset automatically at build time.
 * Corrupt images are pre-filtered by validateImages() in the CLI pipeline.
 */
import type { ImageMetadata } from 'astro';

// Static glob — Vite resolves this at build time.
// Includes all common image formats; Astro converts to WebP/AVIF + generates srcset natively.
const allImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif,gif,svg}'
);

/**
 * Resolve a content image path like "/assets/uploads/foo.webp"
 * to an Astro ImageMetadata object. Returns null if not found (fallback to <img>).
 */
export async function resolveImage(src: string): Promise<ImageMetadata | null> {
  if (!src) return null;
  const key = src.startsWith('/assets/')
    ? '/src/assets/' + src.slice('/assets/'.length)
    : null;
  if (!key || !allImages[key]) return null;
  try {
    return (await allImages[key]()).default;
  } catch {
    return null;
  }
}

export { allImages };

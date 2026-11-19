import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Preserve the existing artwork and WebP fallbacks; add modern delivery formats.
const images = [
  ...[64, 128, 192].map(size => [`brand-mark-${size}`, 65]),
  ...[640, 1200].map(size => [`vendor-landing-hero-${size}`, 55]),
];
for (const [name, quality] of images) {
  const input = new URL(`../src/assets/images/${name}.webp`, import.meta.url);
  const output = new URL(`../src/assets/images/${name}.avif`, import.meta.url);
  await sharp(fileURLToPath(input)).avif({ quality, effort: 6 }).toFile(fileURLToPath(output));
  console.log(`${name}: ${(await stat(input)).size} → ${(await stat(output)).size} bytes`);
}

// Optional original of the existing sign-in photo, downloaded into tmp/:
// https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1600&q=85
if (process.argv[2]) {
  await sharp(process.argv[2]).resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(fileURLToPath(new URL('../src/assets/images/vendor-auth-photo-1200.webp', import.meta.url)));
}

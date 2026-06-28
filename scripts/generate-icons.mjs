/**
 * Generates PNG icons from the SVG sources using the `sharp` library.
 * Runs as part of the prebuild step (`npm run prebuild`).
 *
 * Outputs:
 *   public/icons/icon-192.png        — standard icon (any)
 *   public/icons/icon-512.png        — standard icon (any)
 *   public/icons/icon-maskable-192.png — maskable icon for Android adaptive icons
 *   public/icons/icon-maskable-512.png — maskable icon for Android adaptive icons
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'icons');

mkdirSync(outDir, { recursive: true });

const standardSvg  = readFileSync(join(root, 'public', 'icons', 'icon.svg'));
const maskableSvg  = readFileSync(join(root, 'public', 'icons', 'icon-maskable.svg'));

// Standard icons — used for iOS splash / favicon / Android "any"
await sharp(standardSvg).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'));
console.log('✓ icon-192.png');

await sharp(standardSvg).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'));
console.log('✓ icon-512.png');

// Maskable icons — used by Android for adaptive icon shapes (circle, squircle, etc.)
await sharp(maskableSvg).resize(192, 192).png().toFile(join(outDir, 'icon-maskable-192.png'));
console.log('✓ icon-maskable-192.png');

await sharp(maskableSvg).resize(512, 512).png().toFile(join(outDir, 'icon-maskable-512.png'));
console.log('✓ icon-maskable-512.png');

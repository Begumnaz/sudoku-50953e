/**
 * Generates PNG icons from the SVG source using the `sharp` library.
 * Runs as part of the prebuild step.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'icons', 'icon.svg');
const outDir = join(root, 'public', 'icons');

mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

await sharp(svgBuffer).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'));
console.log('✓ icon-192.png');

await sharp(svgBuffer).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'));
console.log('✓ icon-512.png');

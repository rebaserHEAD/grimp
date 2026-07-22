// Generates build/icon.ico (and icon.png) from the app's clown mascot on a
// dark rounded tile. Run via `npm run make-icon` when the source art changes;
// the committed build/icon.ico is what packaging actually consumes, so normal
// builds need neither sharp nor png-to-ico.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';

const SIZE = 256;
const RADIUS = 52;
const PAD = 34; // breathing room around the mascot
const BG = { r: 15, g: 16, b: 32, alpha: 1 }; // #0f1020, the app's dark space theme

const root = path.resolve(import.meta.dirname, '..');
const srcClown = path.join(root, 'public', 'images', 'clown.png');
const outDir = path.join(root, 'build');
fs.mkdirSync(outDir, { recursive: true });

const mask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
);

const clown = await sharp(srcClown)
  .resize(SIZE - PAD * 2, SIZE - PAD * 2, { fit: 'inside' })
  .toBuffer();

const base = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
  .composite([{ input: clown, gravity: 'center' }])
  .png()
  .toBuffer();

const rounded = await sharp(base)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

fs.writeFileSync(path.join(outDir, 'icon.png'), rounded);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(rounded).resize(s, s).png().toBuffer()));
fs.writeFileSync(path.join(outDir, 'icon.ico'), await pngToIco(pngs));

console.log(`Wrote build/icon.ico (${sizes.join(', ')}) and build/icon.png`);

#!/usr/bin/env node
/**
 * Renders assets/icon.svg and assets/tray.svg into the raster formats Windows
 * wants, and packs each set into a multi-resolution .ico.
 *
 *   npm run icons
 *
 * ICO is a simple container — a header, one directory entry per image, then the
 * image data — and every Windows version since Vista reads PNG-compressed
 * entries. That is little enough to write directly, so the icons are one sharp
 * call away rather than another dependency.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

/**
 * The app icon is shown everywhere from the 16px title bar to the 256px Start
 * menu tile, and no single drawing survives that whole range: below about 32px
 * the window frame turns to noise and the tail detaches from the cat. So the
 * small entries come from a simplified variant. The tray only ever renders
 * small, so it uses the bare silhouette at every size.
 */
const APP_SOURCES = [
  { svg: 'icon-small.svg', sizes: [16, 24] },
  { svg: 'icon.svg', sizes: [32, 48, 64, 128, 256] },
];
const TRAY_SOURCES = [{ svg: 'tray.svg', sizes: [16, 20, 24, 32, 40, 48] }];

async function renderPng(svgPath, size) {
  return sharp(svgPath, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Packs PNG buffers into an .ico. `size` of 256 is encoded as 0 by the format. */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, data }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 0);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size, 0 for truecolour
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

async function build(name, sources) {
  const images = [];

  for (const { svg, sizes } of sources) {
    const svgPath = path.join(ASSETS, svg);
    for (const size of sizes) {
      images.push({ size, svg, data: await renderPng(svgPath, size) });
    }
  }

  images.sort((a, b) => a.size - b.size);
  const ico = packIco(images);
  await fs.writeFile(path.join(ASSETS, `${name}.ico`), ico);

  const breakdown = sources.map(({ svg, sizes }) => `${sizes.join('/')} from ${svg}`).join(', ');
  console.log(`${name}.ico  ${images.length} sizes  ${(ico.length / 1024).toFixed(1)} KB  (${breakdown})`);
}

async function main() {
  await build('icon', APP_SOURCES);
  await build('tray', TRAY_SOURCES);

  // Plain PNGs for docs and anywhere that wants an image rather than an icon.
  for (const size of [256, 512]) {
    await fs.writeFile(path.join(ASSETS, `icon-${size}.png`), await renderPng(path.join(ASSETS, 'icon.svg'), size));
  }
  console.log('icon-256.png, icon-512.png  for docs');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

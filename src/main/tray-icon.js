'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { nativeImage } = require('electron');

const SIZE = 32;
const SAMPLES = 3; // supersampling factor per axis, for antialiased edges
const COLOR = { r: 0xe8, g: 0x88, b: 0x3a }; // reads on both light and dark taskbars

// Cat head in a unit square: a circle for the skull, a triangle per ear.
const HEAD = { cx: 0.5, cy: 0.62, r: 0.3 };
const EARS = [
  [[0.23, 0.56], [0.3, 0.12], [0.54, 0.4]],
  [[0.77, 0.56], [0.7, 0.12], [0.46, 0.4]],
];

function insideCircle(x, y) {
  const dx = x - HEAD.cx;
  const dy = y - HEAD.cy;
  return dx * dx + dy * dy <= HEAD.r * HEAD.r;
}

function insideTriangle(x, y, [a, b, c]) {
  const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = sign([x, y], a, b);
  const d2 = sign([x, y], b, c);
  const d3 = sign([x, y], c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function coverageAt(px, py) {
  let hits = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const x = (px + (sx + 0.5) / SAMPLES) / SIZE;
      const y = (py + (sy + 0.5) / SAMPLES) / SIZE;
      if (insideCircle(x, y) || EARS.some((ear) => insideTriangle(x, y, ear))) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

/**
 * The real mark, a multi-resolution .ico so Windows picks the right size for
 * the current DPI. Falls back to the drawn version below if it is missing,
 * which keeps the app runnable before `npm run icons` has ever been called.
 */
function createTrayIcon(assetsRoot) {
  const iconPath = path.join(assetsRoot, 'tray.ico');

  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) return image;
    console.warn(`[tray] ${iconPath} could not be decoded, drawing a fallback`);
  }

  return drawTrayIcon();
}

/**
 * Builds a tray icon procedurally, so the app still has one with no assets
 * built. Electron's createFromBitmap takes premultiplied BGRA.
 */
function drawTrayIcon() {
  const buffer = Buffer.alloc(SIZE * SIZE * 4);

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const alpha = coverageAt(px, py);
      const offset = (py * SIZE + px) * 4;
      buffer[offset + 0] = Math.round(COLOR.b * alpha);
      buffer[offset + 1] = Math.round(COLOR.g * alpha);
      buffer[offset + 2] = Math.round(COLOR.r * alpha);
      buffer[offset + 3] = Math.round(255 * alpha);
    }
  }

  return nativeImage.createFromBitmap(buffer, { width: SIZE, height: SIZE });
}

module.exports = { createTrayIcon };

#!/usr/bin/env node
/**
 * Imports a cutout photo as one pose of one cat.
 *
 *   node tools/prepare-cat.mjs --cat Mochi --pose sit  "C:/photos/mochi-sitting.png"
 *   node tools/prepare-cat.mjs --cat Mochi --pose walk "C:/photos/mochi-walking.png"
 *   node tools/prepare-cat.mjs --cat Mochi --height 160 --count 2
 *
 * The image must already have a transparent background. Windows 11 does this
 * without extra software: open the photo in Paint, use Remove background, then
 * save as PNG. (Photos also has Erase background under Edit.)
 *
 * Resizing uses sharp if it happens to be installed; without it the file is
 * copied as-is, which works fine, just with a larger texture in memory.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATS_ROOT = path.join(ROOT, 'cats');
const MAX_EDGE = 512; // plenty at any sane on-screen cat size

const KNOWN_POSES = [
  'sit', 'idle', 'stand', 'walk', 'run', 'chase',
  'groom', 'sleep', 'lie', 'fall', 'held', 'surprised',
];

function parseArgs(argv) {
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [flag, inline] = token.slice(2).split('=');
      options[flag] = inline ?? (argv[i + 1]?.startsWith('--') ? true : argv[++i]);
    } else {
      positional.push(token);
    }
  }

  return { options, positional };
}

/**
 * Reads width, height and alpha support straight out of the PNG header, so the
 * tool can warn about a missing cutout without pulling in an image library.
 */
async function inspectPng(filePath) {
  const buffer = await fs.readFile(filePath);
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) return { isPng: false };

  const colorType = buffer.readUInt8(25);
  const hasTransparencyChunk = buffer.includes(Buffer.from('tRNS', 'ascii'));

  return {
    isPng: true,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    // 4 = grey+alpha, 6 = RGBA; a palette image carries alpha in a tRNS chunk.
    hasAlpha: colorType === 4 || colorType === 6 || (colorType === 3 && hasTransparencyChunk),
  };
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    return null;
  }
}

async function readConfig(configPath, fallbackName) {
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch {
    return { name: fallbackName, height: 150, speed: 1, count: 1, poses: {} };
  }
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const catName = options.cat ?? options.name;

  if (!catName) {
    console.error('Usage: node tools/prepare-cat.mjs --cat <name> [--pose <pose>] [image] [--scale 1] [--height 150] [--speed 1] [--count 1]');
    console.error('  --scale  multiplies the cat height for this pose only, since photos of');
    console.error('           different poses are framed differently (a curled sleeping cat');
    console.error('           is much shorter than a sitting one).');
    console.error('  --faces  which way the cat points in this photo: left, right or front.');
    console.error('           Default is right; a left-facing photo would otherwise appear');
    console.error('           to walk backwards. A head-on photo should be front, so it');
    console.error('           is never mirrored.');
    console.error(`Poses the engine understands: ${KNOWN_POSES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const catId = String(catName).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  const catDir = path.join(CATS_ROOT, catId);
  const posesDir = path.join(catDir, 'poses');
  const configPath = path.join(catDir, 'cat.json');

  await fs.mkdir(posesDir, { recursive: true });
  const config = await readConfig(configPath, String(catName));
  config.name = String(catName);
  config.poses ??= {};

  if (options.height) config.height = Number(options.height);
  if (options.speed) config.speed = Number(options.speed);
  if (options.count) config.count = Number(options.count);

  const source = positional[0];
  if (source) {
    const pose = String(options.pose ?? path.basename(source, path.extname(source))).toLowerCase();
    if (!KNOWN_POSES.includes(pose)) {
      console.warn(`! "${pose}" is not a pose the engine looks for; it will only be used as a last-resort fallback.`);
      console.warn(`  Known poses: ${KNOWN_POSES.join(', ')}`);
    }

    const info = await inspectPng(source);
    if (!info.isPng) {
      console.warn('! Not a PNG. Only PNG, WebP and GIF keep transparency — a JPEG cannot.');
    } else if (!info.hasAlpha) {
      console.warn('! This PNG has no alpha channel, so the cat will appear inside a rectangle.');
      console.warn('  Open it in Paint, click Remove background, and save as PNG first.');
    }

    const target = path.join(posesDir, `${pose}.png`);
    const sharp = await loadSharp();

    if (sharp && info.isPng && Math.max(info.width, info.height) > MAX_EDGE) {
      await sharp(source)
        .trim()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toFile(target);
      console.log(`  resized ${info.width}x${info.height} -> max ${MAX_EDGE}px`);
    } else {
      await fs.copyFile(source, target);
      if (!sharp && info.isPng && Math.max(info.width, info.height) > MAX_EDGE) {
        console.log(`  copied at ${info.width}x${info.height} (npm i -D sharp to downscale automatically)`);
      }
    }

    config.poses[pose] = `poses/${pose}.png`;

    if (options.scale) {
      config.poseScale ??= {};
      config.poseScale[pose] = Number(options.scale);
    }

    if (options.faces) {
      const facing = String(options.faces).toLowerCase();
      if (!['left', 'right', 'front'].includes(facing)) {
        console.warn(`! --faces must be left, right or front, got "${options.faces}"; ignoring.`);
      } else {
        config.poseFaces ??= {};
        config.poseFaces[pose] = facing;
      }
    }

    console.log(`+ ${catId}/${pose}${options.scale ? ` (scale ${options.scale})` : ''}`);
  }

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`  wrote ${path.relative(ROOT, configPath)}`);
  console.log(`  poses: ${Object.keys(config.poses).join(', ') || '(none yet)'}`);
  console.log(`  height: ${config.height}px${config.poseScale ? ` (per-pose scale: ${JSON.stringify(config.poseScale)})` : ''}`);
  if (config.poseFaces) console.log(`  facing: ${JSON.stringify(config.poseFaces)}`);
  console.log('  Reload cats from the tray icon to see the change.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

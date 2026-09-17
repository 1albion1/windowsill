'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { ORIGIN } = require('./protocol');

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.gif']);

/**
 * Cats live in cats/<id>/ — a folder of cutout images plus an optional
 * cat.json. With no cat.json the pose name is taken from each file's stem, so
 * dropping sit.png / walk.png / sleep.png into a folder is enough to add a cat.
 */
function readCatFolder(catsRoot, id) {
  const folder = path.join(catsRoot, id);
  const images = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);

  let config = {};
  const configPath = path.join(folder, 'cat.json');
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.error(`[cats] ignoring malformed ${id}/cat.json:`, error.message);
    }
  }

  const poses = {};
  const poseFaces = readPoseFaces(config.poseFaces);

  for (const [pose, relative] of Object.entries(config.poses ?? {})) {
    if (typeof relative === 'string' && fs.existsSync(path.join(folder, relative))) {
      poses[pose] = toUrl(id, relative);
    }
  }

  // Loose images fill in any pose the config did not name, and may carry their
  // facing in the filename — walk-left.png — so a whole cat can be set up by
  // naming files, with no JSON at all. An explicit cat.json still wins.
  for (const name of images) {
    const stem = path.basename(name, path.extname(name)).toLowerCase();
    const tagged = /^(.+)-(left|right|front)$/.exec(stem);
    const pose = tagged ? tagged[1] : stem;

    if (poses[pose]) continue;
    poses[pose] = toUrl(id, name);
    if (tagged && !poseFaces[pose]) poseFaces[pose] = tagged[2];
  }

  if (Object.keys(poses).length === 0) return null;

  return {
    id,
    name: config.name ?? id,
    height: clampHeight(config.height),
    speed: Number.isFinite(config.speed) ? config.speed : 1,
    count: clampCount(config.count),
    poseScale: readPoseScale(config.poseScale),
    faces: readFacing(config.faces) ?? 'right',
    poseFaces,
    poses,
  };
}

function clampHeight(value) {
  const height = Number.isFinite(value) ? value : 150;
  return Math.min(500, Math.max(40, height));
}

/**
 * Photos of different poses are framed differently, so one height cannot fit
 * them all: a curled sleeping cat is far shorter than a sitting one. Each pose
 * gets a multiplier on the cat's height, defaulting to 1.
 */
function readPoseScale(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, scale]) => Number.isFinite(scale))
      .map(([pose, scale]) => [pose.toLowerCase(), Math.min(3, Math.max(0.2, scale))]),
  );
}

/**
 * Which way the cat is pointing in the photo. The engine mirrors sprites to
 * turn a cat around, so it has to know where each one started: art that faces
 * left would otherwise walk backwards when the cat heads right.
 */
function readFacing(value) {
  const facing = String(value ?? '').toLowerCase();
  // 'front' is a head-on photo with no left or right to it, so it never mirrors.
  return ['left', 'right', 'front'].includes(facing) ? facing : null;
}

/** Per-pose overrides, for a set of photos that do not all face the same way. */
function readPoseFaces(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([pose, facing]) => [pose.toLowerCase(), readFacing(facing)])
      .filter(([, facing]) => facing !== null),
  );
}

/** How many of this cat wander the desktop at once. */
function clampCount(value) {
  const count = Number.isInteger(value) ? value : 1;
  return Math.min(12, Math.max(1, count));
}

function toUrl(id, relative) {
  const segments = relative.split(/[\/]/).filter(Boolean).map(encodeURIComponent);
  return `${ORIGIN}/pets/${encodeURIComponent(id)}/${segments.join('/')}`;
}

function loadCats(catsRoot) {
  if (!fs.existsSync(catsRoot)) return [];

  return fs
    .readdirSync(catsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      try {
        return readCatFolder(catsRoot, entry.name);
      } catch (error) {
        console.error(`[cats] skipping ${entry.name}:`, error.message);
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = { loadCats };

#!/usr/bin/env node
/**
 * Pre-release checks for the things that break silently.
 *
 *   npm run check
 *
 * Both of these have already gone wrong once. 0.2.0 shipped with a broken image
 * in the welcome window because assets were filtered into the installer by
 * extension and the referenced .svg was not on the list — nothing failed, the
 * picture was just missing. And pose names live in behavior.js but are
 * documented in two other files, which drift apart the moment one is edited.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const problems = [];
const report = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
};

/** Every pose filename the engine will look for, taken from the engine itself. */
function enginePoses() {
  const poses = new Set();
  for (const match of read('src/renderer/behavior.js').matchAll(/poses:\s*\[([^\]]*)\]/g)) {
    for (const name of match[1].split(',')) {
      const clean = name.trim().replace(/['"]/g, '');
      if (clean) poses.add(clean);
    }
  }
  return [...poses].sort();
}

function checkPosesDocumented() {
  const poses = enginePoses();

  for (const [file, label] of [
    ['README.md', 'README documents every pose name'],
    ['src/renderer/welcome.html', 'Welcome window documents every pose name'],
  ]) {
    const text = read(file);
    const missing = poses.filter((pose) => !new RegExp(`\\b${pose}\\b`).test(text));
    report(label, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${poses.length} names`);
  }

  // The importer warns on unknown poses, so its list has to match too.
  const known = read('tools/prepare-cat.mjs').match(/const KNOWN_POSES = \[([\s\S]*?)\]/)?.[1] ?? '';
  const missing = poses.filter((pose) => !new RegExp(`'${pose}'`).test(known));
  report('prepare-cat knows every pose name', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : null);
}

/** Anything the UI loads from cats://app/art/ must actually ship. */
function checkAssetsShip() {
  const referenced = new Set();
  for (const file of ['src/renderer/welcome.html', 'src/renderer/index.html']) {
    for (const match of read(file).matchAll(/\/art\/([\w.-]+)/g)) referenced.add(match[1]);
  }

  const onDisk = referenced.size === 0 ? [] : [...referenced].filter(
    (name) => !fs.existsSync(path.join(ROOT, 'assets', name)),
  );
  report('referenced artwork exists in assets/', onDisk.length === 0, onDisk.length ? `missing: ${onDisk.join(', ')}` : `${referenced.size} files`);

  // extraResources decides what reaches the installer. A filter here is how the
  // 0.2.0 image broke, so require that assets ship whole.
  const { build } = JSON.parse(read('package.json'));
  const entry = (build.extraResources ?? []).find((resource) => resource.from === 'assets');
  report('assets ship unfiltered into the installer', Boolean(entry) && !entry.filter,
    entry?.filter ? `filter would drop: ${JSON.stringify(entry.filter)}` : null);
}

/**
 * Every cat image on disk should be reachable by the loader. A photo that sits
 * in a folder doing nothing, with no error to explain why, is the worst kind of
 * bug — it looks like the app ignored you.
 */
function checkCatsReachable() {
  const catsRoot = path.join(ROOT, 'cats');
  if (!fs.existsSync(catsRoot)) return;

  const { loadCats } = createRequire(import.meta.url)('../src/main/cats-library.js');
  const reachable = new Set();
  for (const cat of loadCats(catsRoot)) {
    for (const url of Object.values(cat.poses)) reachable.add(decodeURIComponent(url.split('/').pop()));
  }

  const orphans = [];
  for (const cat of fs.readdirSync(catsRoot, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const sub of ['', 'poses']) {
      const dir = path.join(catsRoot, cat.name, sub);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!/\.(png|webp|gif)$/i.test(file)) continue;
        if (!reachable.has(file)) orphans.push(path.join(cat.name, sub, file));
      }
    }
  }

  report('every cat image is reachable by the loader', orphans.length === 0,
    orphans.length ? `unreachable: ${orphans.join(', ')}` : `${reachable.size} images`);
}

function checkPackagedBuild() {
  const packaged = path.join(ROOT, 'dist', 'win-unpacked', 'resources');
  if (!fs.existsSync(packaged)) {
    console.log('skip  packaged build not present (run a build first)');
    return;
  }

  const referenced = new Set();
  for (const match of read('src/renderer/welcome.html').matchAll(/\/art\/([\w.-]+)/g)) referenced.add(match[1]);
  const missing = [...referenced].filter((name) => !fs.existsSync(path.join(packaged, 'assets', name)));
  report('artwork present in the packaged build', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : null);

  // The public installer must never carry photographs of somebody's cat.
  report('public build bundles no cats', !fs.existsSync(path.join(packaged, 'cats')));
}

console.log('Windowsill checks\n');
checkPosesDocumented();
checkAssetsShip();
checkCatsReachable();
checkPackagedBuild();

console.log('');
if (problems.length > 0) {
  console.error(`${problems.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log('all good');
}

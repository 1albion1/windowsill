#!/usr/bin/env node
/**
 * Builds an installer that carries the cats in cats/ with it, seeded into the
 * user's own folder on first run.
 *
 *   npm run dist:mine
 *
 * The default build (`npm run dist`) deliberately ships without them: that one
 * is what other people download, and it should start with the drawn sample cat
 * rather than photographs of somebody else's pet. This variant exists for your
 * own machines, where having your cats already installed is the point.
 *
 * It reuses the config in package.json and only appends, so the two builds
 * cannot drift apart.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, Platform } from 'electron-builder';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const config = structuredClone(pkg.build);

config.extraResources = [
  ...config.extraResources,
  // Processed poses only — the source/ folders hold full-resolution originals
  // and have no business inside an installer.
  { from: 'cats', to: 'cats', filter: ['**/*', '!**/source/**', '!README.md'] },
];

// Keep the two artefacts distinguishable in dist/.
config.win = { ...config.win, artifactName: '${productName}-${version}-setup-with-cats.${ext}' };

const bundled = fs
  .readdirSync(path.join(ROOT, 'cats'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

console.log(`Bundling ${bundled.length} cat(s): ${bundled.join(', ') || 'none'}`);

build({ targets: Platform.WINDOWS.createTarget('nsis'), config })
  .then((files) => {
    for (const file of files) console.log(`built ${path.relative(ROOT, file)}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

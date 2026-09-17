#!/usr/bin/env node
/**
 * Installs the freshly built installer on this machine.
 *
 *   npm run install:local
 *
 * Runs the newest setup .exe in dist/ with NSIS's /S silent flag, so there is
 * no wizard to click through. Any running copy is stopped first — the installer
 * cannot replace files that are still open, and the newly installed app would
 * lose the single-instance lock to the old one anyway.
 *
 * Silent is not unattended. If the existing install is per-machine (under
 * Program Files), Windows raises a UAC prompt that /S cannot suppress, and the
 * installer waits for someone to approve it. A per-user install needs no
 * prompt.
 *
 * Cats and settings live in %APPDATA%\Windowsill and are untouched either way.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Backslashes are doubled because this is a JS string: written singly, JS
// discards them as unrecognised escapes and the registry paths silently break.
const UNINSTALL_KEYS = [
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
];

const FIND_INSTALL = [
  `Get-ItemProperty ${UNINSTALL_KEYS.map((key) => `'${key}'`).join(',')} -ErrorAction SilentlyContinue |`,
  "  Where-Object { $_.DisplayName -like '*Windowsill*' } |",
  '  ForEach-Object { "$($_.DisplayVersion)|$($_.UninstallString)" } |',
  '  Select-Object -First 1',
].join('\n');

/**
 * Where it landed is not ours to assume. An assisted NSIS installer can go
 * per-user or per-machine, and an upgrade reuses whatever the previous install
 * chose — so ask the registry, and only guess if that comes back empty.
 */
function findInstall() {
  let version = null;
  let registered = null;

  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', FIND_INSTALL], {
      encoding: 'utf8',
    }).trim();

    if (out) {
      const [displayVersion, uninstallString] = out.split('|');
      version = displayVersion || null;
      // "C:\Path\Uninstall Windowsill.exe" /allusers -> C:\Path
      const quoted = uninstallString?.match(/^"([^"]+)"/)?.[1] ?? uninstallString?.split(' ')[0];
      if (quoted) registered = path.dirname(quoted);
    }
  } catch {
    // Registry unreadable: fall through to the well-known locations.
  }

  const candidates = [
    registered,
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Windowsill'),
    path.join(process.env.PROGRAMFILES ?? '', 'Windowsill'),
  ].filter(Boolean);

  return {
    version,
    dir: candidates.find((dir) => fs.existsSync(path.join(dir, 'Windowsill.exe'))) ?? null,
  };
}

function newestInstaller() {
  if (!fs.existsSync(DIST)) return null;
  const found = fs
    .readdirSync(DIST)
    .filter((name) => /^Windowsill-.*setup.*\.exe$/i.test(name))
    .map((name) => ({ name, mtime: fs.statSync(path.join(DIST, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return found[0] ? path.join(DIST, found[0].name) : null;
}

function stopRunning() {
  // taskkill exits non-zero when nothing matched, which is not a failure here.
  for (const image of ['Windowsill.exe', 'electron.exe']) {
    spawnSync('taskkill', ['/F', '/IM', image], { stdio: 'ignore' });
  }
}

const installer = newestInstaller();
if (!installer) {
  console.error('No installer in dist/. Run `npm run dist` first.');
  process.exit(1);
}

const before = findInstall();
if (before.dir?.startsWith(process.env.PROGRAMFILES ?? '\0')) {
  console.log('Existing install is per-machine — Windows will ask you to approve this.');
}

console.log(`Installing ${path.basename(installer)}`);
stopRunning();

try {
  // /S is NSIS silent mode. electron-builder's installer honours it, and still
  // launches the app afterwards per runAfterFinish.
  execFileSync(installer, ['/S'], { stdio: 'inherit', timeout: 10 * 60 * 1000 });
} catch (error) {
  console.error(`Installer failed: ${error.message}`);
  process.exit(1);
}

const { version, dir } = findInstall();
if (!dir) {
  console.error('Installer finished but no installed Windowsill.exe could be found.');
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const { mtime } = fs.statSync(path.join(dir, 'Windowsill.exe'));

console.log(`Installed to ${dir}`);
console.log(`  registered version  ${version ?? 'unknown'}`);
console.log(`  Windowsill.exe      ${mtime.toISOString()}`);

if (version !== expected) {
  console.error(`\nRegistered version is ${version ?? 'unknown'}, expected ${expected}.`);
  process.exit(1);
}

console.log(`\n${expected} installed.`);

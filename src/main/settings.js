'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/**
 * A small JSON file in the user's data folder. The only thing it currently
 * remembers is whether the welcome window has been shown, but anything that
 * should survive a restart belongs here rather than in renderer storage.
 */
let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    cache = {}; // missing or corrupt: start clean rather than fail to launch
  }
  return cache;
}

function get(key, fallback = undefined) {
  const value = read()[key];
  return value === undefined ? fallback : value;
}

function set(key, value) {
  const settings = read();
  settings[key] = value;
  try {
    fs.writeFileSync(file(), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.error('[settings] could not save:', error.message);
  }
}

module.exports = { get, set };

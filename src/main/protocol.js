'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Everything — UI files and cat images alike — is served from one scheme and
 * one host, so the renderer can read sprite pixels back out of a canvas to
 * build hit-test masks. Two origins would taint the canvas and break that.
 *
 *   cats://app/ui/...    -> src/renderer/
 *   cats://app/pets/...  -> cats/
 */
const SCHEME = 'cats';
const ORIGIN = `${SCHEME}://app`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function resolveWithin(root, segments) {
  const resolved = path.resolve(root, ...segments);
  const fence = path.resolve(root) + path.sep;
  return resolved.startsWith(fence) ? resolved : null;
}

function createHandler({ rendererRoot, catsRoot }) {
  const mounts = { ui: rendererRoot, pets: catsRoot };

  return async (request) => {
    let segments;
    try {
      segments = new URL(request.url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const [mount, ...rest] = segments;
    const root = mounts[mount];
    if (!root || rest.length === 0) return new Response('Not found', { status: 404 });

    const filePath = resolveWithin(root, rest);
    if (!filePath) return new Response('Forbidden', { status: 403 });

    try {
      const body = await fs.readFile(filePath);
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

module.exports = { SCHEME, ORIGIN, createHandler };

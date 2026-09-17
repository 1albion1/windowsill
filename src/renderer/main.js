import { World } from './world.js';
import { Cat } from './cat.js';
import { loadPoseSet } from './sprites.js';
import { FALLBACK_CAT } from './fallback-cat.js';

const CLICK_SLOP = 5; // px of movement still counted as a click, not a drag
const CLICK_TIME = 260; // ms
const NOTICE_RADIUS = 90; // how close the cursor gets before a cat stirs
const WAKE_CHANCE = 0.008; // per frame while it lingers there — about 1.6s to wake

const stage = document.getElementById('stage');

let world = null;
let cats = [];
let paused = false;

let cursor = null;
let interactive = false;
let dragged = null;
let pressedAt = null;

/**
 * The overlay is click-through by default, so it never intercepts clicks meant
 * for your actual work. `forward: true` on the main-process side keeps
 * mousemove flowing here, which is the only reason we can notice the cursor
 * arriving over a cat and briefly become solid.
 */
function setInteractive(next) {
  if (next === interactive) return;
  interactive = next;
  window.overlay.setInteractive(next);
  document.body.style.cursor = next ? 'grab' : 'default';
}

function catAt(x, y) {
  // Last in the list paints on top, so search backwards.
  for (let i = cats.length - 1; i >= 0; i--) {
    if (cats[i].hitTest(x, y)) return cats[i];
  }
  return null;
}

async function buildCats(definitions) {
  for (const cat of cats) cat.destroy();
  cats = [];

  const list = definitions.length > 0 ? definitions : [FALLBACK_CAT];

  for (const definition of list) {
    const poses = await loadPoseSet(definition.poses);
    if (Object.keys(poses).length === 0) {
      console.warn(`[cats] "${definition.name}" has no loadable images, skipping`);
      continue;
    }
    for (let copy = 0; copy < (definition.count ?? 1); copy++) {
      cats.push(new Cat({ definition, poses, world, stage }));
    }
  }
}

function noticeCursor() {
  if (!cursor) return;
  for (const cat of cats) {
    if (cat.state !== 'sleep') continue;
    const dx = cat.x - cursor.x;
    const dy = cat.y - cat.height / 2 - cursor.y;
    // A slow trickle rather than an instant wake: a cursor passing through can
    // be slept through, but one that lingers nearby will rouse her.
    if (dx * dx + dy * dy < NOTICE_RADIUS * NOTICE_RADIUS && Math.random() < WAKE_CHANCE) cat.wake();
  }
}

function startLoop() {
  let previous = performance.now();

  const frame = (now) => {
    // Cap dt so a stalled tab or a sleeping laptop does not teleport anyone.
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;

    if (paused) {
      // Still draw, so a cat can be picked up and moved while paused.
      for (const cat of cats) cat.render();
    } else {
      noticeCursor();
      const context = { cursor };
      for (const cat of cats) cat.update(dt, context);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

function bindPointer() {
  window.addEventListener('mousemove', (event) => {
    cursor = { x: event.clientX, y: event.clientY };

    if (dragged) {
      dragged.dragTo(cursor.x, cursor.y);
      return; // stay solid for the whole drag, even outside the cat
    }
    setInteractive(Boolean(catAt(cursor.x, cursor.y)));
  });

  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const cat = catAt(event.clientX, event.clientY);
    if (!cat) return;

    dragged = cat;
    pressedAt = { x: event.clientX, y: event.clientY, t: performance.now() };
    cat.grab(event.clientX, event.clientY);
    document.body.style.cursor = 'grabbing';
    event.preventDefault();
  });

  window.addEventListener('mouseup', (event) => {
    if (!dragged) return;

    const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
    const quick = performance.now() - pressedAt.t < CLICK_TIME;

    dragged.release();
    if (moved < CLICK_SLOP && quick) dragged.poke();

    dragged = null;
    pressedAt = null;
    document.body.style.cursor = 'default';
    interactive = true; // force the next call to re-evaluate
    setInteractive(Boolean(catAt(event.clientX, event.clientY)));
  });

  // Nothing here is a document, so suppress the browser gestures that imply one.
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('dragstart', (event) => event.preventDefault());
}

async function main() {
  const state = await window.overlay.getState();

  world = new World(state.geometry);
  paused = state.paused;

  await buildCats(state.cats);
  bindPointer();
  startLoop();

  window.overlay.reportReady({ count: cats.length, names: cats.map((cat) => cat.definition.name) });

  window.overlay.onGeometry((geometry) => world.setGeometry(geometry));
  window.overlay.onCats((definitions) => buildCats(definitions));
  window.overlay.onPaused((value) => {
    paused = value;
  });
}

main().catch((error) => console.error('[cats] failed to start:', error));

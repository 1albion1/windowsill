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
let sizeScale = 1;
let tracing = false;
const trace = (message) => { if (tracing) window.overlay.trace(message); };

let cursor = null;
let interactive = false;
let dragged = null;
let pressedAt = null;

/**
 * The overlay is click-through by default, so it never intercepts clicks meant
 * for your actual work. It goes solid only while the pointer is over a cat.
 *
 * The pointer position comes from the main process polling the global cursor,
 * not from mousemove: forwarded mouse moves stop arriving once the app is not
 * the foreground window, and this overlay is never focusable.
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
      const cat = new Cat({ definition, poses, world, stage });
      cat.sizeScale = sizeScale;
      cats.push(cat);
    }
  }
}

function noticeCursor() {
  if (!cursor) return;
  for (const cat of cats) {
    if (cat.state !== 'sleep') continue;
    const dx = cat.x - cursor.x;
    const dy = cat.y - cat.standingHeight() / 2 - cursor.y;
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

/**
 * Where the pointer is, and whether it is over a cat.
 *
 * Called both from the main process's cursor poll (which works while the
 * overlay is click-through and unfocused) and from real mousemove events
 * (which only arrive once we have gone solid, but are lower latency).
 */
function trackCursor(x, y) {
  cursor = { x, y };

  if (dragged) {
    dragged.dragTo(x, y);
    return; // stay solid for the whole drag, even outside the cat
  }
  setInteractive(Boolean(catAt(x, y)));
}

function bindPointer() {
  window.addEventListener('mousemove', (event) => trackCursor(event.clientX, event.clientY));

  window.addEventListener('mousedown', (event) => {
    trace(`mousedown button=${event.button} at ${event.clientX},${event.clientY}`);
    if (event.button !== 0) return;
    const cat = catAt(event.clientX, event.clientY);
    if (!cat) {
      trace('  no cat under that point');
      return;
    }
    trace(`  grabbed ${cat.definition.name}`);

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
  sizeScale = state.sizeScale ?? 1;

  await buildCats(state.cats);
  bindPointer();
  startLoop();

  window.overlay.reportReady({
    count: cats.length,
    names: cats.map((cat) => cat.definition.name),
    sizeScale,
    heights: cats.map((cat) => Math.round(cat.standingHeight())),
  });

  tracing = Boolean(state.traceInput);
  if (tracing) {
    setInterval(() => {
      const boxes = cats
        .map((cat) => `${cat.definition.name}@${Math.round(cat.box.left)},${Math.round(cat.box.top)} ${Math.round(cat.box.width)}x${Math.round(cat.box.height)} ${cat.state}`)
        .join('  |  ');
      trace(`boxes: ${boxes}`);
    }, 2000);
  }

  window.overlay.onGeometry((geometry) => world.setGeometry(geometry));
  window.overlay.onCats((definitions) => buildCats(definitions));
  window.overlay.onPaused((value) => {
    paused = value;
  });
  window.overlay.onCursor(({ x, y }) => trackCursor(x, y));
  window.overlay.onSize((value) => {
    sizeScale = value;
    for (const cat of cats) cat.sizeScale = value;
  });
}

main().catch((error) => console.error('[cats] failed to start:', error));

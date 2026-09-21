'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, Tray, ipcMain, protocol, screen, shell } = require('electron');

const { getDesktopGeometry } = require('./desktop');
const { loadCats } = require('./cats-library');
const { createTrayIcon } = require('./tray-icon');
const { SCHEME, ORIGIN, createHandler } = require('./protocol');
const { showWelcome } = require('./welcome-window');
const settings = require('./settings');

const APP_ID = 'com.windowsill.desktop';
const GUIDE_URL = 'https://github.com/1albion1/windowsill#add-your-cats';

/**
 * A global multiplier over each cat's own `height`, so cats can be resized
 * without editing anyone's cat.json. Kept coarse on purpose: a menu of named
 * sizes is a decision, a slider is a fiddle.
 */
const SIZES = [
  { label: 'Tiny', value: 0.5 },
  { label: 'Small', value: 0.75 },
  { label: 'Normal', value: 1 },
  { label: 'Large', value: 1.4 },
  { label: 'Huge', value: 1.9 },
];
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');
const IS_DEV = process.argv.includes('--dev');
// Diagnostic for the click-through toggle, which is otherwise invisible.
const TRACE_INPUT = process.argv.includes('--trace-input');

/**
 * A non-focusable window never steals focus from whatever you are typing in,
 * which is what you want from an overlay. If dragging a cat ever stops
 * responding on your machine, flip this to true — that is the known trade-off.
 */
const FOCUSABLE = false;

// Resolved once the app is ready, since both depend on how it was launched.
let catsRoot = null;
let assetsRoot = null;

let overlay = null;
let tray = null;
let cursorPoll = null;
let overlayOrigin = { x: 0, y: 0 };
// --paused freezes the cats at startup, which makes them clickable targets
// while debugging input.
let paused = process.argv.includes('--paused');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/**
 * Running from source, cats live in the repo next to the code. Installed, that
 * folder is inside a read-only asar, so they move to the user's own data
 * directory — somewhere they can actually drop photos.
 */
function resolvePaths() {
  catsRoot = app.isPackaged
    ? path.join(app.getPath('userData'), 'cats')
    : path.join(app.getAppPath(), 'cats');

  assetsRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'assets');
}

/**
 * Copies any cats shipped with the installer into the user's folder on first
 * run, skipping those already there. This is what stops a fresh install being
 * an empty desktop, without ever overwriting the user's own edits.
 */
function seedCats() {
  if (!app.isPackaged) return;

  const bundled = path.join(process.resourcesPath, 'cats');
  if (!fs.existsSync(bundled)) return;

  for (const entry of fs.readdirSync(bundled, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(catsRoot, entry.name);
    if (fs.existsSync(target)) continue;

    try {
      fs.cpSync(path.join(bundled, entry.name), target, { recursive: true });
      console.log(`[cats] seeded ${entry.name}`);
    } catch (error) {
      console.error(`[cats] could not seed ${entry.name}:`, error.message);
    }
  }
}

function createOverlay() {
  const geometry = getDesktopGeometry();
  overlayOrigin = geometry.origin;

  overlay = new BrowserWindow({
    ...geometry.bounds,
    title: 'Windowsill',
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: FOCUSABLE,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // 'screen-saver' keeps the cats above other always-on-top windows.
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Start fully click-through. `forward: true` delivers mousemove to the
  // renderer while the app happens to be foreground, which is a latency win but
  // not something to depend on — startCursorTracking is what actually keeps the
  // renderer informed.
  overlay.setIgnoreMouseEvents(true, { forward: true });

  overlay.loadURL(`${ORIGIN}/ui/index.html`);

  if (IS_DEV) overlay.webContents.openDevTools({ mode: 'detach' });

  // The overlay has no visible chrome, so renderer errors would otherwise be
  // silent. Mirror its console into the terminal that started the app.
  overlay.webContents.on('console-message', (...args) => {
    const details = typeof args[0] === 'object' && args[0] !== null && 'message' in args[0] ? args[0] : null;
    const message = details ? details.message : args[2];
    const level = details ? details.level : args[1];
    if (IS_DEV || level === 'error' || level === 2) console.log(`[renderer] ${message}`);
  });

  overlay.on('closed', () => {
    stopCursorTracking();
    overlay = null;
  });
}

/**
 * Tells the renderer where the pointer is, about 60 times a second.
 *
 * The overlay used to rely on `setIgnoreMouseEvents(true, { forward: true })`
 * to keep mousemove flowing while click-through. It does not, reliably: on
 * Windows those forwarded moves dry up once the app is not the foreground
 * window — and this overlay is deliberately non-focusable, so it never is.
 * The result was that cats stopped responding to the cursor as soon as you
 * clicked into any other application, which is to say almost immediately.
 *
 * Polling the global cursor costs a cheap syscall and works regardless of
 * focus. Nothing is sent while the pointer is still.
 */
function startCursorTracking() {
  stopCursorTracking();

  let lastX = null;
  let lastY = null;

  cursorPoll = setInterval(() => {
    if (!overlay || overlay.isDestroyed()) return;

    const { x, y } = screen.getCursorScreenPoint();
    if (x === lastX && y === lastY) return;
    lastX = x;
    lastY = y;

    overlay.webContents.send('overlay:cursor', {
      x: x - overlayOrigin.x,
      y: y - overlayOrigin.y,
    });
  }, 16);
}

function stopCursorTracking() {
  if (cursorPoll) clearInterval(cursorPoll);
  cursorPoll = null;
}

function pushGeometry() {
  if (!overlay) return;
  const geometry = getDesktopGeometry();
  overlayOrigin = geometry.origin;
  overlay.setBounds(geometry.bounds);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.webContents.send('overlay:geometry', geometry);
}

function currentSize() {
  const stored = settings.get('sizeScale', 1);
  return SIZES.some((size) => size.value === stored) ? stored : 1;
}

function setSize(value) {
  settings.set('sizeScale', value);
  overlay?.webContents.send('overlay:size', value);
  buildTrayMenu();
}

function setPaused(value) {
  paused = value;
  overlay?.webContents.send('overlay:paused', paused);
  buildTrayMenu();
}

function setAutoStart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, name: 'Windowsill' });
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: paused ? 'Resume cats' : 'Pause cats', click: () => setPaused(!paused) },
      { type: 'separator' },
      { label: 'Reload cats', click: () => overlay?.webContents.send('overlay:cats', loadCats(catsRoot)) },
      { label: 'Open cats folder…', click: () => shell.openPath(catsRoot) },
      { label: 'How to add your cats…', click: () => showWelcome() },
      {
        label: 'Cat size',
        submenu: SIZES.map((size) => ({
          label: size.value === 1 ? `${size.label} (default)` : size.label,
          type: 'radio',
          checked: currentSize() === size.value,
          click: () => setSize(size.value),
        })),
      },
      { type: 'separator' },
      {
        // In development this would register electron.exe rather than the app,
        // so it is only offered once installed.
        label: app.isPackaged ? 'Start with Windows' : 'Start with Windows (installed app only)',
        type: 'checkbox',
        enabled: app.isPackaged,
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => setAutoStart(item.checked),
      },
      { type: 'separator' },
      { label: 'Quit Windowsill', click: () => app.exit(0) },
    ]),
  );
}

function createTray() {
  tray = new Tray(createTrayIcon(assetsRoot));
  tray.setToolTip('Windowsill');
  tray.on('click', () => tray.popUpContextMenu());
  buildTrayMenu();
}

function registerIpc() {
  ipcMain.handle('overlay:get-state', () => ({
    geometry: getDesktopGeometry(),
    cats: loadCats(catsRoot),
    paused,
    sizeScale: currentSize(),
    traceInput: TRACE_INPUT,
  }));

  ipcMain.handle('cats:reload', () => loadCats(catsRoot));

  // The renderer owns hit-testing: it knows where every cat is and which of its
  // pixels are opaque, so it tells us when the cursor is over one.
  ipcMain.on('overlay:set-interactive', (_event, interactive) => {
    if (!overlay) return;
    if (TRACE_INPUT) {
      const { x, y } = screen.getCursorScreenPoint();
      console.log(`[input] set-interactive ${interactive} at cursor ${x},${y}`);
    }
    if (interactive) overlay.setIgnoreMouseEvents(false);
    else overlay.setIgnoreMouseEvents(true, { forward: true });
  });

  ipcMain.on('app:open-cats-folder', () => shell.openPath(catsRoot));
  ipcMain.on('app:open-guide', () => shell.openExternal(GUIDE_URL));
  ipcMain.on('app:quit', () => app.exit(0));

  ipcMain.on('welcome:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

  ipcMain.handle('app:get-auto-start', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('app:set-auto-start', (_event, enabled) => {
    setAutoStart(enabled);
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.on('overlay:trace', (_event, message) => {
    if (TRACE_INPUT) console.log(`[input] ${message}`);
  });

  ipcMain.on('overlay:ready', (_event, summary) => {
    const sizes = summary.heights?.length ? `, ${summary.heights.join('/')}px tall` : '';
    console.log(
      `[cats] overlay ready: ${summary.count} cat(s) — ${summary.names.join(', ') || 'none'}` +
        ` (size ${summary.sizeScale ?? 1}x${sizes})`,
    );
  });
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  // Without this Windows groups the app under Electron's own identity, which
  // costs it its taskbar icon and its notifications.
  app.setAppUserModelId(APP_ID);

  app.whenReady().then(() => {
    resolvePaths();
    fs.mkdirSync(catsRoot, { recursive: true });
    seedCats();

    protocol.handle(SCHEME, createHandler({ rendererRoot: RENDERER_ROOT, catsRoot, assetsRoot }));

    registerIpc();
    createOverlay();
    createTray();
    startCursorTracking();

    if (!settings.get('welcomed', false)) {
      settings.set('welcomed', true);
      showWelcome();
    }

    screen.on('display-added', pushGeometry);
    screen.on('display-removed', pushGeometry);
    screen.on('display-metrics-changed', pushGeometry);
  });

  // Tray app: closing the overlay must not end the process.
  app.on('window-all-closed', () => {});
}

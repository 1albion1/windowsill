'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

const { ORIGIN } = require('./protocol');

let welcome = null;

/**
 * The window that explains what just happened.
 *
 * Without it, installing Windowsill puts an always-on-top thing on screen with
 * no visible controls and no way to quit — the tray menu holds everything, and
 * Windows 11 hides new tray icons behind the overflow chevron by default. That
 * combination reads as malware rather than as a cat, which is why this window
 * exists and why it carries a Quit button.
 *
 * It keeps the ordinary title bar on purpose. A frameless window would look
 * better and trust it less: people want the close button where it always is.
 */
function showWelcome() {
  if (welcome && !welcome.isDestroyed()) {
    welcome.show();
    welcome.focus();
    return welcome;
  }

  welcome = new BrowserWindow({
    width: 600,
    height: 700,
    minWidth: 480,
    minHeight: 540,
    title: 'Windowsill',
    backgroundColor: '#fbf7f2',
    show: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'welcome.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  welcome.setMenuBarVisibility(false);
  welcome.loadURL(`${ORIGIN}/ui/welcome.html`);

  // The overlay sits at screen-saver level, so this has to as well or it would
  // be painted behind the cats.
  welcome.once('ready-to-show', () => {
    welcome.show();
    welcome.setAlwaysOnTop(true, 'screen-saver');
    // Only momentarily: it should not hover over everything for the rest of
    // the session, just win the race against the overlay on open.
    setTimeout(() => {
      if (welcome && !welcome.isDestroyed()) welcome.setAlwaysOnTop(false);
    }, 400);
  });

  welcome.on('closed', () => {
    welcome = null;
  });

  return welcome;
}

module.exports = { showWelcome };

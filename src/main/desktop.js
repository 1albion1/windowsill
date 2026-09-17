'use strict';

const { screen } = require('electron');

/**
 * The overlay is a single window spanning every monitor. All renderer
 * coordinates are "overlay-local": screen coordinates minus the origin of that
 * union rectangle. On Windows the virtual desktop can start at negative
 * coordinates (a monitor placed left of or above the primary one), which is
 * exactly why the offset exists.
 */
function getDesktopGeometry() {
  const displays = screen.getAllDisplays();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const display of displays) {
    const b = display.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  const origin = { x: minX, y: minY };
  const toLocal = (rect) => ({
    x: rect.x - origin.x,
    y: rect.y - origin.y,
    width: rect.width,
    height: rect.height,
  });

  return {
    origin,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    // workArea excludes the taskbar, so cats walk on top of it rather than
    // behind it or through it.
    displays: displays.map((display) => ({
      id: display.id,
      scaleFactor: display.scaleFactor,
      bounds: toLocal(display.bounds),
      workArea: toLocal(display.workArea),
    })),
  };
}

module.exports = { getDesktopGeometry };

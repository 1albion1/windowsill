/**
 * The desktop as the cats experience it: one continuous space spanning every
 * monitor, with a floor that steps up and down as they cross between screens.
 */
export class World {
  constructor(geometry) {
    this.setGeometry(geometry);
  }

  setGeometry(geometry) {
    this.geometry = geometry;
    this.displays = geometry.displays;
    this.width = geometry.bounds.width;
    this.height = geometry.bounds.height;
  }

  /**
   * The floor under a point: the bottom of the nearest work area at or below
   * it, so cats stand on the taskbar rather than behind it, and so walking off
   * a tall monitor onto a shorter one makes them fall.
   */
  groundAt(x, y) {
    const columns = this.displays.filter(
      (display) => x >= display.bounds.x && x < display.bounds.x + display.bounds.width,
    );
    const candidates = columns.length > 0 ? columns : this.displays;
    if (candidates.length === 0) return this.height;

    const below = candidates
      .map((display) => display.workArea.y + display.workArea.height)
      .filter((bottom) => bottom >= y - 1);

    return below.length > 0 ? Math.min(...below) : Math.max(
      ...candidates.map((display) => display.workArea.y + display.workArea.height),
    );
  }

  /** Where a cat may roam horizontally, with a little margin at each end. */
  clampX(x, margin = 8) {
    return Math.min(this.width - margin, Math.max(margin, x));
  }

  /** A sensible place to drop a new cat: standing on the primary work area. */
  spawnPoint() {
    const display = this.displays[0] ?? { workArea: { x: 0, y: 0, width: this.width, height: this.height } };
    const x = display.workArea.x + display.workArea.width * (0.25 + Math.random() * 0.5);
    return { x, y: display.workArea.y + display.workArea.height };
  }
}

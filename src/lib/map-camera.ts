/**
 * Camera math for the on-screen navigation HUD (NavigationHUD.tsx) — cardinal
 * panning, pitch/zoom stepping, and the keyboard shortcut matrix that drives
 * the same actions. Kept out of map.tsx for the same reason defect-overlay.ts
 * is: this is arithmetic and a data table, not JSX, and it is unit-testable
 * without a map instance.
 *
 * WHY "CARDINAL" MEANS COMPASS-TRUE, NOT SCREEN-RELATIVE
 * --------------------------------------------------------
 * The obvious implementation of a directional pad is `map.panBy([dx, dy])` —
 * pixels on screen. That is wrong for this HUD specifically: panBy moves
 * relative to the current bearing, so once an operator rotates the camera
 * (which this same HUD's pitch control invites — tilting to sight down a row
 * usually comes with some rotation to line the row up on screen), "pan north"
 * stops meaning north. For a tool whose whole job is walking a fixed compass
 * grid of racks, that drift is exactly the wrong failure mode. So panning here
 * is computed in ground metres against true compass bearings and converted to
 * lng/lat directly — bearing has no effect on what pressing "north" does.
 *
 * The flat-earth approximation (metres-per-degree treated as constant) is the
 * same one overlay-registration.ts uses and for the same reason: over this
 * ~1.1 km site the curvature term is far smaller than any placement or
 * pointing accuracy that matters here.
 */

const M_PER_DEG_LAT = 110_600;

function mPerDegLng(latDeg: number): number {
  return 111_320 * Math.cos((latDeg * Math.PI) / 180);
}

export type Cardinal = "N" | "E" | "S" | "W";

const COMPASS_DEG: Record<Cardinal, number> = { N: 0, E: 90, S: 180, W: 270 };

/** Ground distance a bearing-aware minimap arrow moves per second of travel. */
export function offsetCardinal(
  lng: number,
  lat: number,
  dir: Cardinal,
  metres: number,
): [number, number] {
  const rad = (COMPASS_DEG[dir] * Math.PI) / 180;
  const dNorth = metres * Math.cos(rad);
  const dEast = metres * Math.sin(rad);
  return [lng + dEast / mPerDegLng(lat), lat + dNorth / M_PER_DEG_LAT];
}

/**
 * How far one pan click moves, in metres, at a given zoom.
 *
 * Derived from the same ground-resolution formula used throughout this map
 * (137_867 / 2^zoom m/px at this latitude — see the dot-geometry note in
 * map.tsx) so a click always covers the same ~110 px of screen regardless of
 * zoom: coarse steps zoomed out for covering ground, sub-metre steps zoomed
 * in for lining up on one row. That is what "granular" has to mean here —
 * a fixed metre step would be either too coarse to be usable at panel scale
 * or too slow to cross the site at overview scale.
 */
const PAN_PIXELS_PER_CLICK = 110;
export function panStepMetres(zoom: number): number {
  return (137_867 / 2 ** zoom) * PAN_PIXELS_PER_CLICK;
}

export const PITCH_STEP = 12;
export const PITCH_MIN = 0;
/** Matches mapbox-gl's own default maxPitch — this HUD does not raise it. */
export const PITCH_MAX = 60;

export const ZOOM_STEP = 0.75;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ─── Defect stepper ordering ───────────────────────────────────────────────

/**
 * Sort key for "next/previous flagged panel along a string."
 *
 * Severity-first order (what the anomaly list and the dataset itself use) is
 * wrong for this control on purpose: stepping through 848 criticals in
 * dataset order jumps across the entire site table to table, which is the
 * "manual scanning" this control exists to remove. Sorting by table, then
 * physical rack/panel position, means Next always means "the next one along
 * this row," matching how a technician actually walks an array.
 */
export interface Steppable {
  id: string;
  string: string;
  row: number;
  col: number;
}

function tableNumber(stringLabel: string): number {
  const n = Number(stringLabel.replace(/^Table-/i, ""));
  return Number.isFinite(n) ? n : 0;
}

export function orderForStepping<T extends Steppable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const t = tableNumber(a.string) - tableNumber(b.string);
    if (t !== 0) return t;
    const r = a.row - b.row;
    if (r !== 0) return r;
    return a.col - b.col;
  });
}

/**
 * Index of `currentId` in `ordered`, stepping by `dir` (+1 / -1) and wrapping.
 * Returns null for an empty list. `currentId` not being found (filters just
 * changed, or nothing selected yet) starts from the front on Next and the
 * back on Previous, rather than refusing to move.
 */
export function stepIndex(
  ordered: readonly { id: string }[],
  currentId: string | null,
  dir: 1 | -1,
): number | null {
  if (ordered.length === 0) return null;
  const at = currentId ? ordered.findIndex((a) => a.id === currentId) : -1;
  if (at === -1) return dir === 1 ? 0 : ordered.length - 1;
  return (at + dir + ordered.length) % ordered.length;
}

// ─── Keyboard shortcut matrix ───────────────────────────────────────────────

/**
 * Single source of truth for both the legend UI and a sanity-check on the key
 * handler in map.tsx — display copy and behaviour are written next to each
 * other so the legend can't quietly drift out of sync with what a key
 * actually does, which is the usual way a shortcuts list goes stale.
 */
export interface ShortcutRow {
  keys: string;
  label: string;
}

export const SHORTCUT_MATRIX: ShortcutRow[] = [
  { keys: "↑ ↓ ← →", label: "Pan north / south / west / east" },
  { keys: "Shift + ↑ / ↓", label: "Camera altitude — zoom out / in" },
  { keys: "⌘/Ctrl + ↑ / ↓", label: "Pitch — tilt view up / down" },
  { keys: "N", label: "Reset heading to north" },
  { keys: "[ / ]", label: "Previous / next flagged panel" },
  { keys: "Esc", label: "Close the panel detail drawer" },
];

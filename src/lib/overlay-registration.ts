/**
 * Georeferencing for drone overlays.
 *
 * WHY THIS EXISTS
 * ---------------
 * A raster needs four ground corners before Mapbox can draw it. Where those
 * corners come from decides whether the map is a measurement or a picture.
 *
 * For the May 2025 Block 20 survey they were a guess. That deliverable arrived
 * as flat PNG, which has nowhere to store tie-points, so scripts/fit_thermal_bounds.py
 * had to *solve* for the placement by fitting against the surveyed defect
 * coordinates. It topped out at 87% of defects landing on a data pixel and could
 * not be pushed further — the information simply was not in the file. This module
 * grew a hand-alignment tool (see overlay-coverage.ts and the Align panel in
 * routes/_app/map.tsx) because 13% of markers were provably in the wrong place
 * and only an operator could fix them.
 *
 * The March 2026 survey does not have that problem. It shipped as ortho4.kmz, a
 * Google Earth superoverlay: a 6,133-tile quadtree in which every tile carries
 * its own <LatLonBox>. scripts/flatten_superoverlay.py composites those tiles
 * into one raster and the corners fall straight out of the KML — they are
 * measured, not fitted. Scored the same way the old fit was scored, all 1,249
 * surveyed defects land on a data pixel: 100.0%, against 87.0% before.
 *
 * So the alignment machinery below is now a safety net rather than a
 * requirement. It stays for three reasons: the next deliverable may well arrive
 * as a bare PNG again, an operator needs some recourse if a raster is ever
 * delivered mis-tagged, and the scoring in overlay-coverage.ts is what proved
 * the 100% figure in the first place. IDENTITY is the correct placement for
 * everything currently shipped, and the Align panel should stay untouched.
 *
 * The placement is stored as a similarity transform relative to a fixed baseline
 * rather than as four raw corners. Corners are what Mapbox wants, but they are a
 * terrible thing to edit: nudging an overlay 2 m east means editing all four, and
 * any typo silently shears the image. Four meaningful numbers — offset east,
 * offset north, scale, rotation — cannot express a shear at all, so the raster
 * stays physically plausible no matter what the operator does to it.
 */

const M_PER_DEG_LAT = 110_600.0;
/** Plant centroid latitude. Over a ~1.1 km site the cos(lat) term varies by far
 *  less than the placement's own accuracy, so one constant is enough. */
const SITE_LAT = 28.2622;
const M_PER_DEG_LNG = 111_320.0 * Math.cos((SITE_LAT * Math.PI) / 180);

export type Corner = [number, number];
/** Mapbox image-source corner order: NW, NE, SE, SW. */
export type ImageCorners = [Corner, Corner, Corner, Corner];

/** An axis-aligned starting rectangle for an overlay, in degrees. */
export interface Baseline {
  west: number;
  north: number;
  east: number;
  south: number;
}

/**
 * Operator adjustment applied on top of a baseline.
 *
 * `rotation` is degrees clockwise, matching how the control reads on screen —
 * positive turns the image the same way the number turns a compass bearing.
 */
export interface Placement {
  /** metres east */
  dx: number;
  /** metres north */
  dy: number;
  /** multiplier on the baseline ground resolution; 1 leaves it untouched */
  scale: number;
  /** degrees clockwise */
  rotation: number;
}

export const IDENTITY: Placement = { dx: 0, dy: 0, scale: 1, rotation: 0 };

export interface OverlayDef {
  id: string;
  label: string;
  url: string;
  baseline: Baseline;
}

/**
 * Every overlay the map can draw.
 *
 * One entry, and that is the honest state of the world: the March 2026
 * deliverable contains a thermal orthomosaic and nothing else. The Block 20
 * visual overlays (rgb / rgb2, "Visual V1 (east)" and "Visual V2 (west)") were
 * removed with that survey rather than left in place, because their footprints
 * sit ~1.2 km east of this block — carrying them forward would have put two
 * layers in the layer picker that draw nothing anywhere near the defects.
 *
 * The baseline below is the composited extent of ortho4.kmz, read directly from
 * the superoverlay's own <LatLonBox> tags. It is a measurement. Do not re-fit it,
 * and do not hand-align it: the placement scores 100.0% of 1,249 surveyed defects
 * on a data pixel exactly as shipped.
 *
 * The north edge is cropped to 28.2645 rather than the raster's full 28.268208.
 * Above that line the flight is empty except for one stray fragment in the
 * top-right corner, and carrying it would have spent 45% of the image's pixels
 * on transparent nothing. The northernmost defect sits at 28.264170, ~34 m
 * inside the crop.
 *
 * WebP, not PNG, and that is a deliberate departure from the Block 20 assets.
 * The composite is 8192 x 3699 — 30 MP, needed to hold ~14 cm/px over a block
 * 2x wider than the last one. As PNG-24 it is 35 MB and as quantised PNG-8 still
 * 13 MB, either of which is a bad first paint on site over mobile data. Lossy
 * WebP at q80 is 3.7 MB and indistinguishable from the source at 1:1 on the
 * thermal palette. Mapbox image sources accept anything the browser can decode.
 *
 * To add an overlay later: drop the file in public/, add an entry here, then open
 * Align on the map and register it. Nothing else needs to change.
 */
export const OVERLAYS: Record<string, OverlayDef> = {
  thermal: {
    id: "thermal",
    label: "Thermal IR",
    url: "/thermal_ortho4_hi.webp",
    baseline: { west: 73.023697, north: 28.264500, east: 73.035302, south: 28.259854 },
  },
};

// ─── Transform ────────────────────────────────────────────────────────────────

interface Frame {
  centreLng: number;
  centreLat: number;
  /** half-extent east-west, metres, after scale */
  hw: number;
  /** half-extent north-south, metres, after scale */
  hh: number;
  cos: number;
  sin: number;
}

function frame(baseline: Baseline, p: Placement): Frame {
  const theta = (p.rotation * Math.PI) / 180;
  return {
    centreLng: (baseline.west + baseline.east) / 2,
    centreLat: (baseline.north + baseline.south) / 2,
    hw: ((baseline.east - baseline.west) * M_PER_DEG_LNG * p.scale) / 2,
    hh: ((baseline.north - baseline.south) * M_PER_DEG_LAT * p.scale) / 2,
    cos: Math.cos(theta),
    sin: Math.sin(theta),
  };
}

/** Rotate clockwise by the frame's angle, then translate. Metres in, metres out. */
function place(f: Frame, p: Placement, e: number, n: number): [number, number] {
  return [e * f.cos + n * f.sin + p.dx, -e * f.sin + n * f.cos + p.dy];
}

/** Corners for a Mapbox image source, in its required NW/NE/SE/SW order. */
export function cornersFor(baseline: Baseline, p: Placement): ImageCorners {
  const f = frame(baseline, p);
  const local: [number, number][] = [
    [-f.hw, f.hh],
    [f.hw, f.hh],
    [f.hw, -f.hh],
    [-f.hw, -f.hh],
  ];
  return local.map(([e, n]) => {
    const [me, mn] = place(f, p, e, n);
    return [f.centreLng + me / M_PER_DEG_LNG, f.centreLat + mn / M_PER_DEG_LAT] as Corner;
  }) as ImageCorners;
}

/**
 * Inverse map: where does this ground position fall in the image?
 *
 * Returns normalised coordinates with (0,0) at the image's top-left and (1,1) at
 * its bottom-right. Values outside 0..1 mean the point is off the image entirely,
 * which callers need to distinguish from "on the image but on a no-data pixel".
 */
export function worldToImage(
  baseline: Baseline,
  p: Placement,
  lng: number,
  lat: number,
): { u: number; v: number } {
  const f = frame(baseline, p);
  const e = (lng - f.centreLng) * M_PER_DEG_LNG - p.dx;
  const n = (lat - f.centreLat) * M_PER_DEG_LAT - p.dy;
  // Undo the clockwise rotation applied in place().
  const le = e * f.cos - n * f.sin;
  const ln = e * f.sin + n * f.cos;
  return { u: (le / f.hw + 1) / 2, v: (1 - ln / f.hh) / 2 };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "urjascan.overlay-placement.v1";

/**
 * Saved placements, keyed by overlay id.
 *
 * localStorage rather than the database on purpose: registering an overlay is a
 * property of the *image file*, and the image files are static assets shipped with
 * the build. Once an operator is happy with a placement it should be promoted into
 * OVERLAYS above and committed, which is what the Copy button in the align panel
 * produces. localStorage is the scratch space in between, so an interrupted
 * alignment session is not lost on refresh.
 */
export function loadPlacements(): Record<string, Placement> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Placement>>;
    // Merge onto IDENTITY so a stored object written by an older build — or one
    // hand-edited in devtools — cannot produce NaN corners and blank the overlay.
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, sanitise(v)]));
  } catch {
    return {};
  }
}

export function savePlacements(all: Record<string, Placement>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota or private-mode failure. The in-memory placement still applies for
    // this session, so there is nothing useful to tell the operator here.
  }
}

function sanitise(v: Partial<Placement>): Placement {
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? x : fallback;
  return {
    dx: num(v.dx, 0),
    dy: num(v.dy, 0),
    // A zero or negative scale collapses the image to a point or mirrors it.
    scale: Math.max(0.1, num(v.scale, 1)),
    rotation: num(v.rotation, 0),
  };
}

/** The OVERLAYS entry an aligned placement should be promoted to, ready to paste. */
export function toSourceSnippet(def: OverlayDef, p: Placement): string {
  const c = cornersFor(def.baseline, p);
  const fmt = ([lng, lat]: Corner) => `[${lng.toFixed(6)}, ${lat.toFixed(6)}]`;
  return [
    `// ${def.label} — aligned placement`,
    `// dx ${p.dx.toFixed(2)} m, dy ${p.dy.toFixed(2)} m, scale ${p.scale.toFixed(4)}, rotation ${p.rotation.toFixed(3)}°`,
    `coordinates: [`,
    `  ${fmt(c[0])}, ${fmt(c[1])},`,
    `  ${fmt(c[2])}, ${fmt(c[3])},`,
    `],`,
  ].join("\n");
}

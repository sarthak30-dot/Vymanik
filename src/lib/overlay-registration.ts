/**
 * Georeferencing for drone overlays (thermal IR, visual V1/V2, and anything added later).
 *
 * WHY THIS EXISTS
 * ---------------
 * A GeoTIFF carries tie-points that say "image pixel (x,y) is at (lng,lat)". Our
 * orthomosaics arrive as PNG, which has nowhere to store that, so every overlay
 * lands on the map with unknown corners. scripts/fit_thermal_bounds.py tried to
 * recover them by fitting against the 347 surveyed defect coordinates; that tops
 * out at 87% of defects landing on a data pixel and cannot be pushed further —
 * a 4-parameter fit (translation, isotropic scale, rotation) against a
 * signed-distance objective reaches 87.0%, i.e. the same answer. The information
 * simply is not in the PNG.
 *
 * What *is* exact is the surveyed panel geometry in Block20_1GV_4.kml. So rather
 * than guess harder, this module lets an operator place the raster by hand against
 * those known-good footprints, and scores the result live (see overlay-coverage.ts)
 * so the placement is judged on a number rather than by eye.
 *
 * The placement is stored as a similarity transform relative to a fixed baseline
 * rather than as four raw corners. Corners are what Mapbox wants, but they are a
 * terrible thing to edit: nudging an overlay 2 m east means editing all four, and
 * any typo silently shears the image. Four meaningful numbers — offset east,
 * offset north, scale, rotation — cannot express a shear at all, so the raster
 * stays physically plausible no matter what the operator does to it.
 */

const M_PER_DEG_LAT = 110_600.0;
/** Plant centroid latitude. Over a ~600 m site the cos(lat) term varies by far
 *  less than the placement's own accuracy, so one constant is enough. */
const SITE_LAT = 28.2568;
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
 * Baselines are the corners that were in map.tsx before this tool existed: the
 * thermal set is the output of fit_thermal_bounds.py, the two RGB sets were never
 * derived from source georeferencing at all. Keeping them as the baseline means
 * an operator who has not aligned anything sees exactly what shipped before.
 *
 * All three `url`s point at scripts/clean_orthomosaic.py output. That matters for
 * more than looks: the raw V1/V2 exports were ~47% and ~53% opaque white letterbox
 * padding, which a Mapbox image source paints over the basemap as a solid box, and
 * which — having no alpha — also made overlay-coverage.ts read the whole rectangle
 * as covered. Cleaning them gives both an honest footprint and 4x the pixels.
 * Canvas proportions are preserved, so these baselines still apply unchanged.
 *
 * To add an overlay later: drop the PNG in public/, add an entry here, then open
 * Align on the map and register it. Nothing else needs to change.
 */
export const OVERLAYS: Record<string, OverlayDef> = {
  thermal: {
    id: "thermal",
    label: "Thermal IR",
    url: "/thermal_block20_clean.png",
    baseline: { west: 73.036467, north: 28.258982, east: 73.042336, south: 28.255081 },
  },
  rgb: {
    id: "rgb",
    label: "Visual V1 (east)",
    url: "/rgb_block20_clean.png",
    baseline: { west: 73.037842, north: 28.257479, east: 73.042711, south: 28.254353 },
  },
  rgb2: {
    id: "rgb2",
    label: "Visual V2 (west)",
    url: "/rgb2_block20_clean.png",
    baseline: { west: 73.035136, north: 28.25986, east: 73.041713, south: 28.256497 },
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

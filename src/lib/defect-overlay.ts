/**
 * The defect bounding-box overlay: zoom ladder, render states, anchoring rules,
 * presentation profile, and the click contract.
 *
 * WHY THIS IS A SEPARATE MODULE
 * -----------------------------
 * These paint expressions are a state machine — three render states across four
 * zoom bands, each with a presentation variant — and inlining a state machine
 * into JSX is how it stops being reviewable. Keeping it here also means the
 * overlay can be reasoned about (and unit-tested) without a map instance.
 *
 * WHAT "ANCHORED" MEANS HERE, AND WHAT ACTUALLY BREAKS IT
 * ------------------------------------------------------
 * A box is anchored when its four corners stay welded to the same four corners
 * of the physical module under every camera move — zoom, pan, rotate, pitch.
 * Three things buy that, and they are not the obvious ones:
 *
 * 1. GEOMETRY, NOT SCREEN OFFSETS. The boxes are `fill`/`line` layers over the
 *    surveyed Polygon rings from defpanels1.kml, so the projection itself
 *    handles rotation and pitch — a tilted camera foreshortens the box exactly
 *    as it foreshortens the module beneath it, because they are the same
 *    quadrilateral. Nothing here computes a screen position. The failure mode
 *    this avoids is an HTML `<Marker>`, which is a div positioned in CSS pixels:
 *    it cannot foreshorten, so under tilt it slides off its panel and, because
 *    the reprojection lands on fractional pixels, it visibly shimmers while the
 *    camera moves. See the layer-order note in routes/_app/map.tsx.
 *
 * 2. STATE CHANGES MUST NOT TOUCH THE SOURCE. The tempting way to render a
 *    hover state is to rebuild the FeatureCollection with a `hovered` flag and
 *    hand it back to the Source. That re-serialises 1,249 polygons and forces a
 *    full re-tile on the worker, on every pointer move — which is precisely the
 *    "boxes glitch while I move around" symptom. So hover and selection are
 *    carried in Mapbox feature state, which the expressions below read at draw
 *    time and which mutates nothing the tiler owns. This is the single most
 *    important rule in this file.
 *
 * 3. THE SOURCE HAS TO BE TILED AT PANEL SCALE. A GeoJSON source defaults to
 *    `maxzoom: 18` and `tolerance: 0.375`, so above z18 Mapbox over-zooms the
 *    z18 tile rather than re-tiling. At z18 one tile unit is ~3.3 cm on the
 *    ground here, so every vertex snaps to a 3.3 cm grid — a 1.16 m module is
 *    35 units across. That is sub-pixel until about z21.5 and invisible below
 *    it, which is why it has survived unnoticed; past z21.5, which is where
 *    somebody inspecting one module actually sits, corners start landing a
 *    pixel or two off the panel edge and the box looks skewed rather than
 *    misplaced. SOURCE_TUNING below fixes it for the cost of a few more tiles.
 *
 * WHAT IS DELIBERATELY *NOT* ANCHORED
 * -----------------------------------
 * Stroke widths and the cluster pins stay in screen pixels. A stroke scaled in
 * ground units would vanish at overview zoom and swamp the panel at z21, and a
 * cluster pin is a UI affordance rather than a thing on the ground. Only the
 * box geometry and the anchor ring are ground-truth.
 */

import type { ExpressionSpecification, FilterSpecification } from "mapbox-gl";
import {
  SEVERITY, RESOLVED, RING_WIDTH_PX, RING_INNER, RING_OUTER, shapePoints,
  PULSE_PERIOD_MS, PULSE_MIN_OPACITY, PULSE_MAX_OPACITY,
  type MarkerShape,
} from "./severity-tokens";

// ─── Zoom ladder ──────────────────────────────────────────────────────────────

/**
 * The four bands the overlay moves through, and why each boundary sits where it
 * does. Ground resolution at this latitude is 137_867 / 2^zoom metres per pixel,
 * and a surveyed module is 1.16 m x 2.28 m.
 *
 *   z <  CLUSTER_MAX_ZOOM   clustered pins
 *   z <  PANEL_DOT_MAX_ZOOM individual dots
 *   ...crossfade...
 *   z >  PANEL_FILL_MIN_ZOOM true surveyed footprints
 */
export const OVERLAY_ZOOM = {
  /**
   * Above this zoom every point is drawn individually.
   *
   * 17 is where the crowding stops being a rendering problem and starts being a
   * counting problem. At z16.2 — the default camera — the 1.14 km block is
   * ~1,081 px wide and carries 1,249 defects, so the mean spacing between
   * markers is under 4 px against a marker ~8 px across. They are not a map at
   * that point, they are a texture: you cannot tell 3 defects from 30, and the
   * densest tables read as solid colour. A cluster pin with a number on it
   * answers the question the texture destroys.
   *
   * z17 gives ~2,160 px of array, mean spacing ~7.5 px, which is where
   * individual markers start to separate.
   */
  cluster: 17,

  /** Dots have fully faded out by here; see the dot-geometry note in map.tsx. */
  dotMax: 18.5,

  /** Footprints are fully faded in by here — a module is ~9 x 17 px. */
  fillMin: 19.5,
} as const;

// ─── Source tuning ────────────────────────────────────────────────────────────

/**
 * Applied to the footprint source. See point 3 in the header.
 *
 * `maxzoom: 22` stops the over-zoom: tiles are generated at panel scale, so a
 * vertex quantises to ~0.5 cm rather than ~3.3 cm — comfortably sub-pixel at
 * every zoom the map allows.
 *
 * `tolerance: 0` disables Douglas-Peucker. On a 5-vertex rectangle simplification
 * has nothing to remove at any sane tolerance, so this changes no geometry today;
 * it is here so that a future non-rectangular footprint (a partially shaded
 * module, a merged multi-module box) cannot silently lose corners.
 *
 * `buffer: 16` rather than the default 128. The buffer exists so features
 * straddling a tile edge render without a seam, and it is measured in the same
 * units as above — 128 units is ~4.2 m at z18, which is over three modules of
 * slop carried in every tile. 16 units (~0.5 m) still covers any single panel
 * crossing an edge and cuts what the worker copies between tiles.
 *
 * `promoteId` is what makes feature state addressable: without it Mapbox has no
 * stable id per feature and setFeatureState has nothing to key on. It must name
 * a property that is unique across the collection — `anomalyId` is.
 */
export const SOURCE_TUNING = {
  maxzoom: 22,
  tolerance: 0,
  buffer: 16,
  promoteId: "anomalyId",
} as const;

/**
 * Cluster configuration for the point source.
 *
 * `clusterProperties` runs an accumulator per cluster as it is built, so each
 * pin knows how many criticals and mediums it contains without the main thread
 * ever touching the member features. That matters for the colour rule below: a
 * cluster must take the worst severity it contains, because a pin coloured by
 * the majority would paint a cluster of 40 (1 critical, 39 soiling) green and
 * hide the only thing on it that needs a truck.
 */
export const CLUSTER_TUNING = {
  cluster: true,
  clusterMaxZoom: OVERLAY_ZOOM.cluster,
  /**
   * Must be raised past the default 18, and this is not cosmetic.
   *
   * A GeoJSON source only builds tiles up to `maxzoom` and over-zooms the last
   * level beyond it. Clustering is decided per tile zoom, so with the default the
   * deepest tile that exists is z18 and every zoom above it reuses that tile's
   * clustering decisions — which left a cluster pin still drawn over individual
   * panel boxes at z20.4, counting 45 defects that were each already outlined
   * separately underneath it.
   *
   * 20 puts the last real tile above the dot band, so by the time footprints take
   * over there is nothing left to cluster. It stays below the footprint source's
   * maxzoom of 22 because points are locators, not measurements: nothing is
   * gained by tiling them at panel precision.
   */
  maxzoom: 20,
  /**
   * 44 px, slightly under the 50 px default. The default was chosen for POI maps
   * where a cluster of two is noise; here two adjacent defective modules on the
   * same table are a finding, and a tighter radius keeps them apart one zoom
   * level sooner.
   */
  clusterRadius: 44,
  clusterProperties: {
    critical: ["+", ["case", ["==", ["get", "severity"], "critical"], 1, 0]],
    medium: ["+", ["case", ["==", ["get", "severity"], "medium"], 1, 0]],
  },
} as const;

// ─── Render states ────────────────────────────────────────────────────────────

/** True when the pointer is over this box. */
const HOVERED: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
/** True when this box is the one the drawer is showing. */
const SELECTED: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
/**
 * The two are merged into one visual state on purpose. Giving hover and
 * selection different treatments means a selected box changes appearance when
 * the pointer happens to cross it, which reads as the map twitching. They differ
 * only in the anchor marker, which is selection-only.
 */
const ACTIVE: ExpressionSpecification = ["any", HOVERED, SELECTED];

/**
 * Crossfade between the dot band and the footprint band.
 *
 * `fade(0, x)` for a constant; `fade(0, ["case", …])` to vary the top of the
 * ramp by render state.
 *
 * THE ZOOM EXPRESSION MUST BE OUTERMOST. Mapbox evaluates a zoom-dependent paint
 * property once per integer zoom and interpolates between those results, which
 * it cannot do if the zoom curve is buried inside another operator. Writing the
 * natural thing —
 *
 *     ["*", fade(0, 1), ["case", ACTIVE, 0.5, 0.22]]
 *
 * — parses, typechecks, and then fails at style load with "zoom expression may
 * only be used as input to a top-level step or interpolate", taking the entire
 * layer with it and firing the map's onError. Vary the stop OUTPUTS instead:
 * data expressions, feature state included, are perfectly legal there. The dot
 * radius ramp in routes/_app/map.tsx carries the same warning for the same
 * reason; this is the second time the constraint has bitten in this file's
 * lifetime, hence the size of this comment.
 */
const fade = (from: number, to: number | ExpressionSpecification): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  OVERLAY_ZOOM.dotMax,
  from,
  OVERLAY_ZOOM.fillMin,
  to,
];

/** Colour-stroke width the black/white ring is built outward from — the one
 *  number both boxPaint() below and the ring-width comment need to agree on. */
const STROKE_WIDTH: ExpressionSpecification = ["case", ACTIVE, 2.6, 1.5];

/**
 * Paint for the whole box stack, in draw order: fill, halo, blackRing,
 * whiteCasing, stroke.
 *
 * `presentation` is the screen-share profile — see PRESENTATION below. It only
 * ever removes work; every state is still distinguishable with it on, because a
 * preset that makes the map ambiguous is worse than a dropped frame.
 */
export function boxPaint(presentation: boolean) {
  // Both rings are derived from STROKE_WIDTH so each is exactly RING_WIDTH_PX
  // (1.5px) thick on either side, by construction rather than by eye — see
  // the "ANTI-CAMOUFLAGE RING" note in lib/severity-tokens.ts for why it has
  // to be two colours and not a wider single one. line-width is centred on
  // the path, so widening by 2*RING_WIDTH_PX on top of the previous layer's
  // width leaves exactly RING_WIDTH_PX visible on each side of it.
  const whiteWidth: ExpressionSpecification = ["+", STROKE_WIDTH, RING_WIDTH_PX * 2];
  const blackWidth: ExpressionSpecification = ["+", STROKE_WIDTH, RING_WIDTH_PX * 4];

  return {
    /**
     * DEFAULT — semi-transparent, so the thermal signature the box is pointing
     * at stays readable through it. 0.22 was picked against the magma raster:
     * enough to find the box by colour, not enough to hide the hotspot.
     */
    fill: {
      "fill-opacity": fade(0, ["case", ACTIVE, 0.5, 0.22]),
      // Antialiasing on a fill is a per-fragment cost and these are rectangles
      // with near-axis-aligned edges (the racks run 0.93° off due east), so the
      // stair-stepping it removes is barely there to begin with.
      "fill-antialias": !presentation,
    },

    /**
     * HOVER / ACTIVE — the bright halo. A wide, blurred, low-opacity line under
     * the ring, so it reads as light bleeding out from the box rather than as
     * a second border.
     *
     * `line-blur` is the one genuinely expensive thing in this overlay, so the
     * presentation profile flattens it to a hard band. It still doubles the
     * apparent stroke weight, which is what carries at projector contrast.
     */
    halo: {
      "line-width": ["case", ACTIVE, presentation ? 7 : 10, 0] as ExpressionSpecification,
      "line-blur": presentation ? 0 : 5,
      "line-opacity": fade(0, ["case", ACTIVE, presentation ? 0.5 : 0.65, 0]),
    },

    /**
     * Outer black ring — drawn UNDER the white casing so only the outer
     * RING_WIDTH_PX sliver the white doesn't cover is visible. This is the
     * layer that makes the border a true anti-camouflage pair rather than a
     * (still white-only) casing: white alone reads clearly on the black
     * monocrystalline cells the brief names, and nearly vanishes on the sandy
     * soil it also names (see lib/severity-tokens.ts's measured numbers) — the
     * black ring is what still shows there.
     */
    blackRing: {
      // Colour set by the caller (map.tsx), matching casing/stroke below —
      // this object is the state machine (width/opacity by zoom and
      // hover/active), not the palette.
      "line-width": blackWidth,
      "line-opacity": fade(0, 0.95),
    },

    /**
     * White casing under the severity stroke. Not decoration: critical #ef4444
     * scores 1.94:1 against the mean thermal background and white scores 7.30:1,
     * so the ring is what makes the box findable at all, not its fill colour.
     */
    casing: {
      "line-width": whiteWidth,
      "line-opacity": fade(0, 0.9),
    },

    /** The severity-coloured stroke itself. */
    stroke: {
      "line-width": STROKE_WIDTH,
      "line-opacity": fade(0, 1),
    },
  };
}

/**
 * CLUSTERED — the aggregated pin.
 *
 * Radius steps rather than interpolates. A continuous radius invites reading
 * area as magnitude, which nobody does accurately; three sizes say "a few /
 * some / a lot" and let the printed count carry the actual number.
 */
const CLUSTER_RADIUS: ExpressionSpecification = ["step", ["get", "point_count"], 11, 10, 15, 50, 20];
const CLUSTER_STROKE_WIDTH = 1.6;

export function clusterPaint(presentation: boolean) {
  // Shared by both the black ring and the coloured circle, so the two stay
  // pinned to the same screen position and size at every zoom/tilt — if only
  // one of them had circle-pitch-alignment: "viewport", tilting the camera
  // would peel the ring away from the circle it is supposed to outline.
  const shared = {
    "circle-radius": CLUSTER_RADIUS,
    // Anchored flat to the ground would turn every pin into an ellipse the
    // moment the camera tilts, and an unreadable one at high pitch. A cluster
    // is a UI affordance, not a thing on the ground, so it faces the camera.
    "circle-pitch-alignment": "viewport" as const,
    // Scale WITH the map, though: a distant cluster shrinking with perspective
    // is what keeps the pins from stacking into a wall along the horizon.
    "circle-pitch-scale": "map" as const,
  };
  return {
    /**
     * Underlying black ring — same trick as boxPaint()'s blackRing: a wider
     * transparent-fill, black-stroked circle drawn first, at a stroke width
     * exactly RING_WIDTH_PX (1.5px) past the coloured circle's own white
     * stroke, so only that outer sliver of black is visible. See
     * lib/severity-tokens.ts's ANTI-CAMOUFLAGE RING note — the brief's border
     * spec says "boxes AND pins", and a cluster is a pin.
     */
    blackRing: {
      ...shared,
      "circle-color": "transparent",
      "circle-stroke-color": RING_INNER,
      "circle-stroke-width": CLUSTER_STROKE_WIDTH + RING_WIDTH_PX * 2,
      "circle-opacity": 1,
    },
    circle: {
      ...shared,
      // Worst-severity-present wins, using the vivid tokens so a cluster pin
      // and an individual marker for the same tier are the identical hue —
      // colour identity has to survive the transition either direction.
      "circle-color": [
        "case",
        [">", ["get", "critical"], 0], SEVERITY.critical.vivid,
        [">", ["get", "medium"], 0], SEVERITY.medium.vivid,
        SEVERITY.normal.vivid,
      ] as ExpressionSpecification,
      "circle-stroke-color": RING_OUTER,
      "circle-stroke-width": CLUSTER_STROKE_WIDTH,
      "circle-opacity": presentation ? 1 : 0.92,
      // A soft edge on a pin that sits over a busy raster helps it detach; it is
      // also a blur, so it goes first when the profile asks for cheap pixels.
      "circle-blur": presentation ? 0 : 0.15,
    },
    count: {
      "text-color": "#ffffff",
    },
  };
}

/**
 * The anchor marker shown on the selected box.
 *
 * Ground-aligned, unlike the cluster pin — `circle-pitch-alignment: "map"` lays
 * the ring flat so that under tilt it foreshortens along with the module it sits
 * on. That is the whole point of it: it is the visual assertion that this box is
 * stuck to that panel, and a ring that stayed a perfect circle while the panel
 * became a parallelogram would undercut exactly that claim.
 */
export function anchorPaint(presentation: boolean) {
  return {
    ring: {
      "circle-radius": 13,
      "circle-color": "transparent",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.6,
      "circle-stroke-opacity": 0.9,
      "circle-blur": 0,
      "circle-pitch-alignment": "map" as const,
      "circle-pitch-scale": "map" as const,
    },
    dot: {
      "circle-radius": 2.6,
      "circle-color": "#ffffff",
      "circle-stroke-color": "rgba(0,0,0,0.45)",
      "circle-stroke-width": presentation ? 0 : 1,
      "circle-pitch-alignment": "map" as const,
      "circle-pitch-scale": "map" as const,
    },
  };
}

/** Only the individual points — clusters are drawn by their own layer. */
export const UNCLUSTERED: FilterSpecification = ["!", ["has", "point_count"]];
export const CLUSTERED: FilterSpecification = ["has", "point_count"];

// ─── Shape-coded marker sprites ─────────────────────────────────────────────

/**
 * "Shape-coded pins ... to maintain full accessibility for colour-blind
 * technicians." The dot layer below OVERLAY_ZOOM.fillMin is a `circle` layer
 * today — Mapbox circles are, unavoidably, circles — so shape-coding it needs
 * switching to a `symbol` layer with a raster icon per tier. Rather than ship
 * four PNG files, these are rasterised once at map load from the exact same
 * shapePoints() geometry components/SeverityShape.tsx draws as SVG — see that
 * function's docblock for why one geometry source matters here.
 *
 * WHY THE RING CANNOT STAY A LITERAL 1.5px HERE, UNLIKE THE BOX/CLUSTER RINGS
 * --------------------------------------------------------------------------
 * boxPaint()'s and clusterPaint()'s rings are Mapbox line-width / circle-
 * stroke-width, which are always real screen pixels regardless of zoom — that
 * is what let them be built to an exact RING_WIDTH_PX. A symbol icon is a
 * raster rasterised ONCE and then scaled by a single `icon-size` multiplier
 * that itself changes across DOT_RADIUS_BY_ZOOM's range (roughly 2-4.6px
 * radius across the zoom band this layer is visible). One fixed sprite cannot
 * have a border that is simultaneously "a constant fraction of the marker"
 * (so the silhouette stays legible at every size) and "a constant number of
 * real screen pixels" (so the ring doesn't disappear at any specific size) —
 * those are two different requirements on the same one scale factor, and this
 * picks the first: SPRITE_RING_FRACTION is the ring's share of the sprite's
 * own radius, so it scales WITH the marker rather than against it. At the
 * "working zooms" comment's own dominant use case it lands close to the
 * 1.5px the line/circle rings hit exactly; at the extremes it is honestly a
 * couple of real pixels off either way. Flagged here rather than left to look
 * like an oversight: a raster sprite genuinely cannot do what a vector stroke
 * can.
 */
const SPRITE_SIZE = 64;
const SPRITE_RING_FRACTION = 0.09; // ~1.5px of a 64px sprite shown near icon-size 0.35 (~11.2px final ring pass), which is where DOT_RADIUS_BY_ZOOM sits most of its visible range

/**
 * icon-size for a target FILL-CORE radius, in real px — the radius of just
 * the coloured centre, not counting the two rings drawn around it. Derived,
 * not tuned: paintShape() insets the fill core by `ring * 2` on each side
 * (past the black ring, then the white one), so the core's own radius is
 * `SPRITE_SIZE/2 - ring*2`, i.e. `SPRITE_SIZE * (0.5 - 2*SPRITE_RING_FRACTION)`
 * at icon-size 1. Scaling that to hit `radiusPx` gives the icon-size below.
 *
 * map.tsx uses this to carry DOT_RADIUS_BY_ZOOM's own ramp over to the
 * symbol layer: the fill core renders at the same radius the old circle
 * layer's dot used to, and the anti-camouflage ring is new size added around
 * that core rather than a replacement for the old dot's footprint — the old
 * single white circle-stroke is what the ring replaces, not the dot itself.
 */
const SPRITE_CORE_RADIUS_FRACTION = 0.5 - SPRITE_RING_FRACTION * 2;
export function iconSizeForRadius(radiusPx: number): number {
  return radiusPx / (SPRITE_SIZE * SPRITE_CORE_RADIUS_FRACTION);
}

export interface MarkerSprite {
  id: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One id per tier, in the same order lib/defect-overlay.ts's dot layer will
 *  switch on via `["get","severity"]` (+ a resolved variant switched on by
 *  a synthetic property map.tsx adds — see the icon-image expression there). */
export const SPRITE_IDS = {
  critical: "sev-sprite-critical",
  medium: "sev-sprite-medium",
  normal: "sev-sprite-normal",
  resolved: "sev-sprite-resolved",
} as const;

function hexToRGBA(hex: string, alpha = 255): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/** Fills a canvas 2D context with `shape` at the given inset, matching
 *  shapePoints()'s geometry (circle handled separately — canvas has a native
 *  arc(), no reason to route it through polygon points). */
function paintShape(ctx: CanvasRenderingContext2D, shape: MarkerShape, size: number, inset: number, rgba: string) {
  ctx.fillStyle = rgba;
  ctx.beginPath();
  if (shape === "circle") {
    const r = size / 2;
    ctx.arc(r, r, Math.max(0, r - inset), 0, Math.PI * 2);
  } else {
    const pts = shapePoints(shape, size, inset);
    ctx.moveTo(...pts[0]);
    for (const pt of pts.slice(1)) ctx.lineTo(...pt);
    ctx.closePath();
  }
  ctx.fill();
}

function rasterizeSprite(id: string, shape: MarkerShape, fillHex: string): MarkerSprite {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const ring = SPRITE_SIZE * SPRITE_RING_FRACTION;
  // Back to front, same as SeverityShape.tsx: black full-size, white inset,
  // fill inset further — see that component's docblock for why three nested
  // shapes rather than a stroke.
  paintShape(ctx, shape, SPRITE_SIZE, 0, RING_INNER);
  paintShape(ctx, shape, SPRITE_SIZE, ring, RING_OUTER);
  paintShape(ctx, shape, SPRITE_SIZE, ring * 2, fillHex);
  const { data } = ctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return { id, width: SPRITE_SIZE, height: SPRITE_SIZE, data };
}

/**
 * All four sprites, generated once per map instance. Called from map.tsx on
 * `load` and again on every `styledata` (alongside the existing OVERLAY_STACK
 * re-assert effect) because toggling Hide Basemap swaps the entire style
 * object, which drops every `addImage` registration with it.
 */
export function buildSeveritySprites(): MarkerSprite[] {
  return [
    rasterizeSprite(SPRITE_IDS.critical, SEVERITY.critical.shape, SEVERITY.critical.vivid),
    rasterizeSprite(SPRITE_IDS.medium, SEVERITY.medium.shape, SEVERITY.medium.vivid),
    rasterizeSprite(SPRITE_IDS.normal, SEVERITY.normal.shape, SEVERITY.normal.vivid),
    rasterizeSprite(SPRITE_IDS.resolved, RESOLVED.shape, RESOLVED.vivid),
  ];
}

/**
 * `icon-image` expression for the dot layer — resolved status wins over
 * severity (a Closed critical shows the resolved diamond, not a red
 * triangle), matching tokenFor()'s precedence in lib/severity-tokens.ts.
 * Needs `status` on the point features; map.tsx's anomalyPointsGeoJSON adds it
 * alongside `severity` for exactly this.
 */
export const DOT_ICON_IMAGE: ExpressionSpecification = [
  "case",
  ["==", ["get", "status"], "Closed"], SPRITE_IDS.resolved,
  ["==", ["get", "severity"], "critical"], SPRITE_IDS.critical,
  ["==", ["get", "severity"], "medium"], SPRITE_IDS.medium,
  SPRITE_IDS.normal,
];

// ─── Critical pulse ─────────────────────────────────────────────────────────

/**
 * "Dynamic inner pulse" on critical markers — the one effect in this file
 * that cannot be a paint expression, because Mapbox has no time-varying
 * input (no "now()"). Driven externally: map.tsx runs one requestAnimationFrame
 * loop for the whole layer and calls setPaintProperty each frame, exactly the
 * pattern Mapbox's own "pulsing dot" example uses. One loop for every critical
 * marker at once — not one per marker — because the radius/opacity are
 * data-independent (every critical pulses in the same phase), so a single
 * shared value written to one layer's paint property animates all of them.
 *
 * Filtered to `severity == "critical"` only in map.tsx: pulsing every marker
 * would make motion carry no information, which is the opposite of what a
 * "this one means act now" signal needs. See PULSE_* in lib/severity-tokens.ts
 * for the shared timing constant the DOM version (badges) also uses.
 */
export function criticalPulseValue(t: number): { opacity: number; radiusScale: number } {
  const phase = (t % PULSE_PERIOD_MS) / PULSE_PERIOD_MS; // 0..1
  // A single cosine ease rather than a linear ramp — a linear pulse has a
  // visible "corner" at the top and bottom of its cycle; cosine has none,
  // which is what reads as "breathing" instead of "flashing".
  const eased = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0..1..0, smooth
  return {
    opacity: PULSE_MIN_OPACITY + eased * (PULSE_MAX_OPACITY - PULSE_MIN_OPACITY),
    radiusScale: 1 + eased * 0.6, // grows toward PULSE_MAX_SCALE (1.6) at peak
  };
}

// ─── Presentation profile ─────────────────────────────────────────────────────

/**
 * Screen-share preset.
 *
 * Live presentation is a different rendering problem from sitting at the map.
 * The encoder in a video call re-encodes every frame that changes, so blurs and
 * translucency — which change a large area by a small amount — cost far more
 * bandwidth than the crisp shapes around them, and the codec pays for it by
 * smearing the whole region. Turning them off makes the picture *sharper* at
 * the far end, not plainer; the local frame rate is a secondary win.
 *
 * `autoFly` is here rather than in the map because it is the same judgement:
 * a camera that jumps on click is disorienting to twenty people watching a
 * stream a second behind the presenter's pointer.
 */
export interface PresentationProfile {
  /** Blur radii, translucency and CSS shadows off. */
  reduceEffects: boolean;
  /** Skip the raster crossfade — it is a whole-screen change per tile swap. */
  fadeDuration: number;
  /** Whether clicking a box may move the camera. */
  autoFly: boolean;
}

export const PRESENTATION: Record<"desk" | "share" | "mobile", PresentationProfile> = {
  desk: { reduceEffects: false, fadeDuration: 300, autoFly: true },
  share: { reduceEffects: true, fadeDuration: 0, autoFly: false },
  // Task 6's "low-memory rendering optimization" reuses this profile rather
  // than inventing a parallel one — `reduceEffects` already strips the exact
  // GPU-expensive blur/shadow/translucency this deliverable is asking to cut
  // on constrained devices, for the same reason `share` needed it: less
  // per-frame compositing work. `autoFly` stays true, unlike `share` — a tap
  // on a marker should still move the camera there on a phone, which is not
  // the "twenty people watching a stream" problem `share` exists for.
  mobile: { reduceEffects: true, fadeDuration: 150, autoFly: true },
};

/**
 * Strips the GPU-expensive parts out of a Tailwind class list.
 *
 * Removes `blur-*`, `backdrop-blur-*`, `shadow-*` and `drop-shadow-*`. The first
 * two are the ones that matter to a video codec; `drop-shadow` is a CSS filter
 * and costs a separate compositing pass, so it goes too.
 *
 * The boundaries are `(?<![\w-])` / `(?![\w-])` rather than `\b`, and that is
 * load-bearing: `\bshadow` matches inside `drop-shadow-md`, because the hyphen
 * before it is a word boundary. That would leave a dangling `drop-` in the class
 * list and — much worse — would happily eat the `shadow` out of any future class
 * that merely contains the word.
 */
// The two alternatives matter: Tailwind's arbitrary-value form
// `shadow-[0_2px_8px_rgba(0,0,0,0.4)]` carries commas and parentheses that a
// plain \w-class cannot span, and half-matching it leaves fragments of the
// value behind as garbage class names. Match the whole bracket or nothing.
const HEAVY_CLASSES =
  /(?<![\w-])(?:backdrop-)?(?:drop-)?(?:blur|shadow)(?:-\[[^\]]*\]|-[\w/.]+)?(?![\w-])/g;

export function panelChrome(presentation: boolean, base: string): string {
  return presentation
    ? base
        .replace(HEAVY_CLASSES, "")
        .replace(/\s{2,}/g, " ")
        .trim()
    : base;
}

// ─── Click contract ───────────────────────────────────────────────────────────

/**
 * Selecting a box emits a panel id and nothing else.
 *
 * The overlay does not know what a drawer is. It reports which panel was picked
 * and lets whatever is listening decide — the map's own drawer today, a host
 * page or a second panel later — which is what keeps the overlay a rendering
 * concern rather than a routing one.
 *
 * It is dispatched on `window` as well as handed to the React callback so a
 * consumer outside this React tree can listen without being wired through props.
 *
 * NOTE ON GESTURES: the handler that emits this must never call
 * `preventDefault()` or `stopPropagation()` on the map event, and must not be
 * bound to the map container. Hit-testing goes through Mapbox's
 * `interactiveLayerIds`, which queries rendered features on a click that Mapbox
 * has already decided was a click and not a drag — so a pan that begins on top
 * of a box pans the map and emits nothing. Binding a DOM listener to the canvas
 * instead would swallow the gesture, which is the failure this note exists to
 * prevent.
 */
export const PANEL_SELECT_EVENT = "urjascan:panel-select";

export interface PanelSelectDetail {
  /** Human-readable panel id as printed on the layout, e.g. "R91-P25". */
  panelId: string;
  /** Stable id into the anomaly set — what a consumer should route on. */
  anomalyId: string;
  severity: string;
  /** Where the box is, so a listener can place its own UI without a lookup. */
  lngLat: [number, number];
  /** Distinguishes a map click from a future list or search selection. */
  source: "map-overlay";
}

export function emitPanelSelect(detail: PanelSelectDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PanelSelectDetail>(PANEL_SELECT_EVENT, { detail }));
}

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

/**
 * Paint for the whole box stack, in draw order: fill, halo, casing, stroke.
 *
 * `presentation` is the screen-share profile — see PRESENTATION below. It only
 * ever removes work; every state is still distinguishable with it on, because a
 * preset that makes the map ambiguous is worse than a dropped frame.
 */
export function boxPaint(presentation: boolean) {
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
     * the casing, so it reads as light bleeding out from the box rather than as
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
     * White casing under the severity stroke. Not decoration: critical #ef4444
     * scores 1.94:1 against the mean thermal background and white scores 7.30:1,
     * so the halo and casing are what make the box findable, not its fill colour.
     */
    casing: {
      "line-width": ["case", ACTIVE, 5, 3.5] as ExpressionSpecification,
      "line-opacity": fade(0, 0.9),
    },

    /** The severity-coloured stroke itself. */
    stroke: {
      "line-width": ["case", ACTIVE, 2.6, 1.5] as ExpressionSpecification,
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
export function clusterPaint(presentation: boolean) {
  return {
    circle: {
      "circle-color": [
        "case",
        [">", ["get", "critical"], 0],
        "#ef4444",
        [">", ["get", "medium"], 0],
        "#f59e0b",
        "#22c55e",
      ] as ExpressionSpecification,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        11,
        10,
        15,
        50,
        20,
      ] as ExpressionSpecification,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.6,
      "circle-opacity": presentation ? 1 : 0.92,
      // A soft edge on a pin that sits over a busy raster helps it detach; it is
      // also a blur, so it goes first when the profile asks for cheap pixels.
      "circle-blur": presentation ? 0 : 0.15,
      // Anchored flat to the ground would turn every pin into an ellipse the
      // moment the camera tilts, and an unreadable one at high pitch. A cluster
      // is a UI affordance, not a thing on the ground, so it faces the camera.
      "circle-pitch-alignment": "viewport" as const,
      // Scale WITH the map, though: a distant cluster shrinking with perspective
      // is what keeps the pins from stacking into a wall along the horizon.
      "circle-pitch-scale": "map" as const,
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

export const PRESENTATION: Record<"desk" | "share", PresentationProfile> = {
  desk: { reduceEffects: false, fadeDuration: 300, autoFly: true },
  share: { reduceEffects: true, fadeDuration: 0, autoFly: false },
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import {
  X, ArrowRight, MessageCircle, Thermometer, Layers,
  SplitSquareHorizontal, Navigation, Download, Map as MapIcon,
  Crosshair, RotateCcw, Copy, EyeOff, MonitorPlay, History, Loader2,
} from "lucide-react";
import {
  anomalies, anomalyTypes, plant, anomalyCounts, SEVERITY_LABEL_FULL,
  type Anomaly, type Severity,
} from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";
import { SeverityShape } from "@/components/SeverityShape";
import { usePlantContext } from "@/lib/plant-context";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { buildAnomaliesKML, downloadKML } from "@/lib/kml";
import { parseDefectImage } from "@/lib/defect-image";
import {
  OVERLAYS, IDENTITY, cornersFor, loadPlacements, savePlacements, toSourceSnippet,
  type Placement,
} from "@/lib/overlay-registration";
import {
  loadRasterMask, makeCoverageTest, scorePlacement,
  type RasterMask, type AlignmentScore,
} from "@/lib/overlay-coverage";
import {
  OVERLAY_ZOOM, SOURCE_TUNING, CLUSTER_TUNING, UNCLUSTERED, CLUSTERED,
  boxPaint, clusterPaint, anchorPaint, panelChrome,
  PRESENTATION, emitPanelSelect,
} from "@/lib/defect-overlay";
import {
  offsetCardinal, panStepMetres, orderForStepping, stepIndex,
  clamp, PITCH_STEP, PITCH_MIN, PITCH_MAX, ZOOM_STEP,
  type Cardinal,
} from "@/lib/map-camera";
import { NavigationHUD } from "@/components/NavigationHUD";
import { InspectionSheet } from "@/components/InspectionSheet";
import { useIsMobile } from "@/hooks/use-mobile";
// Task 7: lazy — see PanelAuditDrawer.tsx's own docblock for why this one
// component, jsPDF included, is deliberately kept out of map.tsx's own
// bundle rather than imported at the top like everything else on this page.
const PanelAuditDrawer = lazy(() => import("@/components/PanelAuditDrawer").then(m => ({ default: m.PanelAuditDrawer })));
import {
  SEVERITY, RESOLVED, RING_INNER,
} from "@/lib/severity-tokens";
import {
  buildSeveritySprites, DOT_ICON_IMAGE, criticalPulseValue, iconSizeForRadius, type MarkerSprite,
} from "@/lib/defect-overlay";
import MapGL, {
  Marker, Popup, Source, Layer, NavigationControl,
  type MapRef, type ViewState,
} from "react-map-gl/mapbox";
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ─── Drone orthomosaic placement ──────────────────────────────────────────────

// Corners live in src/lib/overlay-registration.ts as a baseline rectangle plus an
// operator-adjustable similarity transform, and for the March 2026 survey the
// baseline is exact.
//
// That is a change of kind, not of degree, so it is worth being explicit about.
// The May 2025 Block 20 thermal arrived as a flat PNG with its georeferencing
// stripped on export, and PNG has nowhere to put tie-points. Recovering the
// placement meant fitting it against the surveyed defect coordinates, which
// scripts/fit_thermal_bounds.py did to 87% of defects landing on a data pixel —
// a ceiling, not a stopping point: adding rotation and re-solving against a
// signed-distance objective returned the same 87.0%. The information was not in
// the file. Roughly 7% of markers were provably in the wrong place, and the Align
// tool exists because only an operator could fix them.
//
// The March 2026 thermal arrived as ortho4.kmz, a superoverlay whose every tile
// carries its own <LatLonBox>. scripts/flatten_superoverlay.py composites them and
// the corners are read straight out. Scored identically, all 1,249 surveyed
// defects land on a data pixel: 100.0%.
//
// Two consequences worth holding on to:
//   * A marker that looks misplaced is now a finding about the survey, not an
//     artefact of this map. Do not "fix" it by nudging the raster.
//   * The Align tool and the stray-marker suppression below are insurance for the
//     next deliverable, which may well arrive as a bare PNG again. They are not
//     load-bearing today, and IDENTITY is the correct placement for what ships.

// The raw stitcher output letterboxes the flight footprint onto a white canvas,
// and a Mapbox image source georeferences that filler right along with the data —
// which is why the overlay used to sit on the satellite view as an opaque box.
// scripts/clean_orthomosaic.py alpha-cuts the filler, upscales 2x and sharpens.
// Canvas proportions are preserved, so the baseline still applies unchanged.
const THERMAL_IMAGE = OVERLAYS.thermal.url;

// Applied to the thermal raster on top of the per-layer opacity. Range is -1..1
// for both; 0 is untouched source, which is what the March 2026 raster wants.
//
// These were 0.30 / 0.45 for the Block 20 thermal and had to be. That overlay was
// a 1024 px export upscaled 2x, and the upscale flattened the magma ramp until
// warm modules and warm sand were nearly the same colour at overview zoom; the
// boost bought back a separation the pixels had lost.
//
// Carrying those values onto this raster was actively harmful. Simulating
// Mapbox's own raster.fragment.glsl over the composited mosaic —
//     sat_f = 1 - 1/(1.001 - saturation);  rgb += (mean(rgb) - rgb) * sat_f
//     con_f = 1/(1 - contrast);            rgb  = (rgb - 0.5) * con_f + 0.5
// — 0.30/0.45 drives both the sand and the hot modules into clipped red, so the
// one distinction the layer exists to show is the first thing to go. 0.15/0.20 is
// already visibly worse than untouched. This source is a true 3.4 cm/px
// area-average straight off the KMZ tiles, so the ramp is intact and any boost
// only takes headroom away.
//
// Leaving these at 0 also keeps the marker-contrast figures quoted above honest:
// they were measured on the raster's own pixels, and a contrast boost would move
// the background they were measured against.
const THERMAL_CONTRAST   = 0;
const THERMAL_SATURATION = 0;

// Bilinear, not nearest. Both orthomosaics are already LANCZOS-upscaled and
// unsharp-masked by clean_orthomosaic.py, so the detail that exists is baked in;
// past native resolution `nearest` only adds a hard pixel grid that reads as a
// rendering fault rather than as data.
const RASTER_RESAMPLING = "linear" as const;

// Used when "Hide basemap" is on. Declaring a minimal style object instead of a
// mapbox:// URL means no satellite tiles are requested at all, so the thermal
// raster and the anomaly markers are the only things drawn.
const BLANK_BASEMAP_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: "blank", type: "background" as const, paint: { "background-color": "#07070b" } }],
};

// A surveyed module is 1.16 m x 2.28 m. Map resolution at this latitude works out
// to ~1.05 m/px at z17, so on the default overview a panel covers roughly 1x2
// pixels — far too small to see, which is why anomalies are drawn as fixed-size
// dots there. By z19.5 a panel is ~9x17 px and can carry its own true outline, so
// the dots hand over to the real KML footprints across this range. The dot is a
// locator; the footprint is the measurement.
//
// The ladder itself — including the clustering band below these two — is defined
// in lib/defect-overlay.ts, which is also where the reasoning for each boundary
// lives. These aliases exist because the dot-geometry notes below are written in
// terms of them.
const PANEL_DOT_MAX_ZOOM  = OVERLAY_ZOOM.dotMax;
const PANEL_FILL_MIN_ZOOM = OVERLAY_ZOOM.fillMin;

// Dot geometry.
//
// Ground resolution at this latitude is 156543.03 * cos(28.2622°) / 2^zoom, i.e.
// 137_867 / 2^zoom m/px. A module is 1.16 m across, so the radius that makes a dot
// exactly fill the tile it marks is 0.5 * 1.16 * 2^zoom / 137_867:
//
//     z17 -> 0.55 px    z18 -> 1.10 px    z19 -> 2.21 px    z19.5 -> 3.12 px
//
// This ramp used to track those figures, on the reasoning that a dot wider than
// its module is claiming an accuracy it does not have. **That reasoning was
// applied at the wrong zooms and the dots came out invisible** — 1.4 px radius
// under a 0.5 px stroke, i.e. a 3.8 px speck, on a site where the client is
// looking for 1,249 of them.
//
// The to-scale argument only holds where a module is actually resolvable. At z17
// the entire 1,137 m array is ~1,081 px wide and holds 10,790 panels, so a module
// is 1.1 px: *every* legible marker overstates it, and "to scale" degenerates to
// "not rendered". Below PANEL_DOT_MAX_ZOOM the dot is therefore a locator and is
// sized to be seen. Above it the dot fades out entirely (circle-opacity ramps to
// 0 across PANEL_DOT_MAX_ZOOM..PANEL_FILL_MIN_ZOOM) and the real surveyed KML
// footprint fades in — so precision is carried by the footprint, which is exact,
// and never by the dot. Sizing the dot for visibility costs nothing at the zooms
// where accuracy is checkable, because it is not on screen there.
//
// Historically circle-radius/circle-stroke-width, drawn width 2*(radius+stroke).
// Since Task 5, anomaly-dot is a symbol layer using the shape-coded sprites
// (DOT_ICON_IMAGE in lib/defect-overlay.ts) instead of a plain circle, so this
// ramp now feeds icon-size, a multiplier of the sprite's own 64px, rather than
// a circle-radius directly — iconSizeForRadius (also in lib/defect-overlay.ts)
// does that conversion, and its docblock has the "what replaces the old white
// stroke" reasoning. The target sizes and severity scaling below are otherwise
// unchanged from the original circle-based ramp.
//
// The white stroke was not decoration, and the sprite's ring inherits the same
// job. Re-measured against the March 2026 raster under all 1,249 defect
// positions, mean background is rgb(163,26,96) and the severity colours score:
// critical #ef4444 1.94:1, medium #f59e0b 3.40:1, normal #22c55e 3.20:1 —
// within noise of the Block 20 figures, because the DJI M3T writes the same
// IronRed palette. WCAG's floor for non-text graphics is 3:1, so *critical* —
// the one severity that must never be missed — is the least visible thing on
// the map by fill colour alone. The ring, not the fill, is what makes a marker
// readable here; see lib/severity-tokens.ts's RING_* docblock for why it's
// two colours rather than one.
//
// The severity scale is applied per stop rather than as ["*", scale, ramp]:
// Mapbox requires a "zoom" expression to be the outermost expression of a paint
// property, because it evaluates the property once per integer zoom and
// interpolates between those results — which it cannot do if the zoom curve is
// nested inside an arithmetic operator. Nesting it throws
// "zoom expression may only be used as input to a top-level step or interpolate"
// and drops the whole layer (the rAF pulse effect above hit this same trap and
// has its own note on the JS-side workaround, which isn't available here since
// this has to stay a static paint expression).
//
// Both dotRadius (still used to derive the multipliers below) and dotIconSize
// read the same SEVERITY_SIZE_SCALE constants rather than each hard-coding
// 1.25/1.1 independently — two copies of one number are how a size ramp and
// its icon-size equivalent quietly drift apart.
const SEVERITY_SIZE_SCALE: Record<"critical" | "medium", number> = { critical: 1.25, medium: 1.1 };
const dotIconSize = (px: number): ExpressionSpecification => [
  "match", ["get", "severity"],
  "critical", iconSizeForRadius(px * SEVERITY_SIZE_SCALE.critical),
  "medium", iconSizeForRadius(px * SEVERITY_SIZE_SCALE.medium),
  iconSizeForRadius(px),
];

const DOT_ICON_SIZE_BY_ZOOM: ExpressionSpecification = [
  "interpolate", ["exponential", 2], ["zoom"],
  // Whole-site view: 1,249 markers share ~135 px of array, so they must stay small
  // or they merge into one blob and stop carrying information.
  14,   dotIconSize(2.0),
  // Working zooms — this is where the client actually reads the map.
  16.5, dotIconSize(3.4),
  18,   dotIconSize(4.0),
  // Handing over to the footprint; the dot is already fading out by here.
  19.5, dotIconSize(3.0),
];

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/**
 * Overlay layers in the order they must stack, bottom first.
 *
 * The raster sits under the boxes so the defect geometry is never obscured by
 * the thing it is describing; the anchor marker sits above the box it anchors;
 * the alignment reference sits above everything, because its whole job is to be
 * the fixed grid you drag a raster underneath.
 *
 * Ids not present in the current style are skipped, so this one list covers
 * every combination of the overlay, KML-view and align toggles.
 */
/**
 * Clickable layers, in priority order — queryRenderedFeatures returns top-most
 * first within this set, so a cluster wins over the (fully transparent) box fill
 * underneath it at overview zoom.
 *
 * The box fill is queried rather than its stroke because a stroke is a few pixels
 * wide and a fill is the whole module: at z19.5 a panel is 9 x 17 px, and asking
 * someone to hit a 1.5 px line inside that is asking them to miss.
 */
const CLICK_LAYERS = ["anomaly-cluster", "anomaly-dot", "anomaly-panel-fill"] as const;

/** Hover has no cluster state, so it only tracks the two per-panel layers. */
const HOVER_LAYERS = ["anomaly-panel-fill", "anomaly-dot"] as const;

const OVERLAY_STACK = [
  "thermal-layer",
  "anomaly-panel-fill",
  "anomaly-panel-halo",
  "anomaly-panel-black-ring",  // Task 5 anti-camouflage border, under the white casing
  "anomaly-panel-casing",
  "anomaly-panel-line",
  "anomaly-critical-pulse",    // under the dots it pulses around, not on top of them
  "anomaly-dot",
  "anomaly-cluster-black-ring",
  "anomaly-cluster",
  "anomaly-cluster-count",
  "anomaly-anchor-ring",
  "anomaly-anchor-dot",
  "align-ref-line",
] as const;

// Plant boundary for the satellite overview polygon — the composited extent of
// the March 2026 thermal, so the outline and the raster are the same rectangle by
// construction rather than a separate estimate that can drift out of step with it.
const PLANT_BOUNDARY_COORDS = [
  [73.023697, 28.264500], [73.035302, 28.264500],
  [73.035302, 28.259854], [73.023697, 28.259854],
  [73.023697, 28.264500],
] as [number,number][];

// ─── Panel grid constants ─────────────────────────────────────────────────────

const PLANT_COLS = 26;
// 415 — which is also the highest rack number in the survey KML, as it should be:
// both are 10,790 modules divided into racks of 26.
const PLANT_ROWS = Math.ceil(plant.totalPanels / PLANT_COLS);

// High-contrast defect symbology (Task 5) — every hex here comes from
// lib/severity-tokens.ts's SEVERITY/RESOLVED, which is where the actual
// colour, ring, shape and pulse decisions are made and documented. This map
// keeps a flat lookup because Mapbox paint expressions need a literal string,
// not a function call, at the point they are built.
const SEV_COLOR: Record<string, string> = {
  critical: SEVERITY.critical.vivid,
  medium:   SEVERITY.medium.vivid,
  normal:   SEVERITY.normal.vivid,
  nodata:   "#374151",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildWhatsAppLink(a: Anomaly, plantName: string) {
  const msg = `[${a.severity.toUpperCase()}] ${a.type}\nPlant: ${plantName}\nPanel: ${a.panelId} (Row ${a.row}, Module ${a.col})\nGPS: ${a.gps.lat}°N, ${a.gps.lng}°E\nView: ${location.origin}/anomalies/${a.id}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

/** Defect frame thumbnail for the map popup. Renders nothing when the anomaly has
 *  no frame, or when the file 404s — a broken-image icon in a popup reads as a bug
 *  to a client, whereas an absent thumbnail just reads as "no photo for this one".
 *  484 frames cover 1,249 anomalies, so several defects legitimately share one
 *  frame and a miss is normal rather than exceptional. */
function PopupDefectImage({ note }: { note: string }) {
  const { filename, src } = parseDefectImage(note);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt={`Thermal defect frame ${filename}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full aspect-[4/3] object-cover bg-black mb-2 border border-grey-200"
    />
  );
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/map")({
  head: () => ({ meta: [{ title: "Site Map — UrjaScan" }] }),
  component: SiteMap,
});

// ─── Main component ───────────────────────────────────────────────────────────

function SiteMap() {
  const { selectedPlant } = usePlantContext();
  const isRajpur = selectedPlant.id === "plant-001";

  // Survey tooling — KML view, KML export, and hand-alignment — is for the people
  // who flew the site, not the people reading the result. A plant owner opening
  // this map wants the imagery and the defects on it; a control that lets them
  // drag the orthomosaic off its panels is a support ticket waiting to happen.
  const isSurveyor = can(getUser()?.role, "alignOverlay");
  // Task 6: gates the InspectionSheet's quick-action buttons — a read-only
  // client viewing the map on their phone gets the sheet's status/GPS/image
  // content but not write actions, same single-source-of-truth permission the
  // rest of the app checks before any anomaly edit.
  const canEditAnomaly = can(getUser()?.role, "editAnomaly");
  // Task 7: gates PanelAuditDrawer's export button — exportReports is true
  // for every role including client (read-only report export), matching how
  // the plant-wide report in reports.tsx is gated.
  const canExportReports = can(getUser()?.role, "exportReports");

  const [filters, setFilters]   = useState<Record<string, boolean>>({ critical: true, medium: true, normal: true, nodata: true });
  const [selected, setSelected] = useState<Anomaly | null>(null);
  // Task 7: whether the (lazy-loaded) audit drawer is open for `selected`.
  // Owned here rather than inside InspectionSheet/the desktop drawer so
  // there's exactly one Suspense boundary and one dynamic import() call site
  // for the whole page, regardless of which selection UI (desktop aside,
  // mobile sheet) the technician actually opened it from.
  const [auditOpen, setAuditOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter]         = useState("all");
  const [stringFilter, setStringFilter]     = useState("all");
  const [inverterFilter, setInverterFilter] = useState("all");

  // Satellite state
  // Thermal is on at load: reading defects off the IR orthomosaic is what this
  // page is for, and it is the one overlay whose registration is sound enough to
  // put defect markers on top of.
  const [thermalVisible, setThermalVisible] = useState(true);
  const [thermalOpacity, setThermalOpacity] = useState(1);
  const [hideBasemap, setHideBasemap]       = useState(false);
  // Client toggle: lets an inspector strip the coloured defect boxes off the
  // panels to read the raw thermal tiles underneath. On by default — the boxes
  // are the point of this view; hiding them is the exception. Drives the
  // `visibility` layout property of the five anomaly-panel-* layers below.
  const [showOutlines, setShowOutlines]     = useState(true);
  const [hoveringAnomaly, setHoveringAnomaly] = useState(false);
  /**
   * Screen-share profile. Off by default — the effects it removes are worth
   * having when one person is looking at their own screen, and only become a
   * liability once the frame is going through a video codec. See PRESENTATION
   * in lib/defect-overlay.ts.
   */
  const [presenting, setPresenting] = useState(false);
  // Task 6: drives the desktop-drawer/mobile-sheet split, the mobile render
  // profile, and the 2D-forced pitch lock below — one read of the same
  // breakpoint MobileBottomNav already uses (hooks/use-mobile.tsx), not a
  // second notion of "mobile" invented for this task.
  const isMobile = useIsMobile();
  // Gates the effects that need a live map object rather than a ref that may
  // still be null on first render.
  const [mapReady, setMapReady] = useState(false);
  const [compareMode, setCompareMode]       = useState(false);
  // KML View is a standalone mode — surveyed panel outlines on their own,
  // instead of mixed into the IR overlay toggle.
  const [kmlViewMode, setKmlViewMode]       = useState(false);
  const [kmlOpacity, setKmlOpacity]         = useState(0.45);
  const [splitPct, setSplitPct]             = useState(50);
  const [popup, setPopup]                   = useState<Anomaly | null>(null);
  const [mapError, setMapError]             = useState<string | null>(null);
  const [viewState, setViewState]           = useState<Omit<ViewState, "width"|"height">>({
    longitude: 73.0295, latitude: 28.2622, zoom: 16.2,
    bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const mapRef     = useRef<MapRef>(null);
  const dragging   = useRef(false);
  const pinchRef   = useRef<number | null>(null);

  // ── Box render state ──
  //
  // Held in Mapbox feature state, not in the GeoJSON. Rebuilding the
  // FeatureCollection to mark one polygon as hovered would re-serialise and
  // re-tile all 1,249 of them on every pointer move; setFeatureState writes into
  // a map the render pass reads and touches nothing the tiler owns. The rule is
  // spelled out in the header of lib/defect-overlay.ts — it is the difference
  // between a hover state and a stutter.
  //
  // These are refs rather than React state on purpose: the value is consumed by
  // the GL render loop, never by JSX, so putting it in state would re-render the
  // whole route on every mousemove to change nothing the DOM can see.
  const hoveredId  = useRef<string | null>(null);
  const selectedId = useRef<string | null>(null);

  const setBoxState = useCallback((id: string | null, key: "hover" | "selected", on: boolean) => {
    const map = mapRef.current?.getMap();
    // The source is absent while the style reloads (toggling Hide basemap swaps
    // the whole style object), and setFeatureState throws on a missing source
    // rather than no-opping.
    if (!id || !map?.getSource("anomaly-panels")) return;
    map.setFeatureState({ source: "anomaly-panels", id }, { [key]: on });
  }, []);

  /**
   * Hit-test the overlay ourselves.
   *
   * This used to lean on `interactiveLayerIds`, which react-map-gl populates
   * `event.features` from. That prop does not exist in react-map-gl 8 — it lives
   * only in the `react-map-gl/mapbox-legacy` entry point, and the one this file
   * imports never reads it. It was being passed and silently ignored, so
   * `event.features` was whatever mapbox-gl happened to attach; verified in the
   * browser, a plain map click arrives with `features` undefined. Cluster clicks
   * did nothing at all as a result.
   *
   * Querying explicitly is also the clearer contract: the layer list below says
   * exactly what is clickable, in priority order, at the point of use.
   *
   * This does NOT intercept gestures. `onClick` and `onMouseMove` are mapbox's
   * own events, already classified — a drag that starts on a box pans the map and
   * never reaches here — and nothing in this path calls preventDefault or
   * stopPropagation.
   */
  const hitAt = useCallback((point: [number, number], layers: readonly string[]) => {
    const map = mapRef.current?.getMap();
    if (!map) return undefined;
    // queryRenderedFeatures throws on a layer that is not in the style, which
    // happens routinely here as overlays and KML view come and go.
    const present = layers.filter(id => map.getLayer(id));
    if (present.length === 0) return undefined;
    return map.queryRenderedFeatures(point, { layers: present })[0];
  }, []);

  const setHoveredBox = useCallback((id: string | null) => {
    if (hoveredId.current === id) return;
    setBoxState(hoveredId.current, "hover", false);
    setBoxState(id, "hover", true);
    hoveredId.current = id;
    setHoveringAnomaly(id !== null);
  }, [setBoxState]);

  const setSelectedBox = useCallback((id: string | null) => {
    if (selectedId.current === id) return;
    setBoxState(selectedId.current, "selected", false);
    setBoxState(id, "selected", true);
    selectedId.current = id;
  }, [setBoxState]);

  // ── Overlay georeferencing ──
  // Placements are keyed by overlay id and restored from localStorage, so an
  // alignment session survives a refresh. Anything not yet aligned falls back to
  // IDENTITY, i.e. the committed baseline — an operator who has never opened the
  // Align tool sees exactly what shipped.
  const [placements, setPlacements] = useState<Record<string, Placement>>(() => loadPlacements());
  const [alignTarget, setAlignTarget] = useState<string | null>(null);
  const [masks, setMasks] = useState<Record<string, RasterMask | null>>({});
  // Markers falling outside every visible overlay are not drawn. This is now
  // unconditional rather than an operator toggle: a marker floating on bare
  // scrub beside the array reads as a broken map to a client, and the position
  // it claims is not one the imagery can support anyway. The suppression is not
  // silent — the sidebar always reports "N of 1,249 shown".

  const placementOf = useCallback(
    (id: string): Placement => placements[id] ?? IDENTITY,
    [placements],
  );

  const updatePlacement = useCallback((id: string, patch: Partial<Placement>) => {
    setPlacements(prev => {
      const next = { ...prev, [id]: { ...(prev[id] ?? IDENTITY), ...patch } };
      savePlacements(next);
      return next;
    });
  }, []);

  // Alpha masks drive both the stray filter and the live alignment score. Loaded
  // once per image; the pixels never change, only where they are placed.
  useEffect(() => {
    let live = true;
    Object.values(OVERLAYS).forEach(def => {
      loadRasterMask(def).then(m => {
        if (live) setMasks(prev => (def.id in prev ? prev : { ...prev, [def.id]: m }));
      });
    });
    return () => { live = false; };
  }, []);

  const cornersOf = useCallback(
    (id: string) => cornersFor(OVERLAYS[id].baseline, placementOf(id)),
    [placementOf],
  );

  const baseAnomalies = useMemo(() => {
    if (!isRajpur) return [];
    return anomalies.filter(a =>
      filters[a.severity] &&
      (typeFilter     === "all" || a.type     === typeFilter) &&
      (inverterFilter === "all" || a.inverter === inverterFilter) &&
      (stringFilter   === "all" || a.string   === stringFilter),
    );
  }, [isRajpur, filters, typeFilter, inverterFilter, stringFilter]);

  // Which overlays are actually drawn right now. Kept as a list even though the
  // March 2026 survey ships exactly one raster: a defect counts as a "stray" only
  // when it falls outside *every* visible overlay, and that rule has to survive the
  // next deliverable arriving with a visual ortho alongside the thermal.
  const activeOverlayIds = useMemo(() => {
    if (kmlViewMode) return [];
    return [thermalVisible ? "thermal" : null].filter(Boolean) as string[];
  }, [kmlViewMode, thermalVisible]);

  const strayIds = useMemo(() => {
    if (activeOverlayIds.length === 0) return new Set<string>();
    const tests = activeOverlayIds
      .map(id => makeCoverageTest(OVERLAYS[id], placementOf(id), masks[id] ?? null))
      .filter(Boolean);
    if (tests.length === 0) return new Set<string>();
    const out = new Set<string>();
    for (const a of baseAnomalies) {
      if (!tests.some(t => t!.insideFootprint(a.gps.lng, a.gps.lat))) out.add(a.id);
    }
    return out;
  }, [activeOverlayIds, baseAnomalies, masks, placementOf]);

  const visibleAnomalies = useMemo(
    () => (suppressionApplies(activeOverlayIds, strayIds.size, baseAnomalies.length)
      ? baseAnomalies.filter(a => !strayIds.has(a.id))
      : baseAnomalies),
    [activeOverlayIds, baseAnomalies, strayIds],
  );

  // Legend tallies. Counted from what is actually on screen rather than from the
  // dataset, so the legend agrees with the map after filters and off-overlay
  // suppression have had their say.
  const visibleCounts = useMemo(() => {
    const out: Record<Severity, number> = { critical: 0, medium: 0, normal: 0, nodata: 0 };
    for (const a of visibleAnomalies) out[a.severity]++;
    return out;
  }, [visibleAnomalies]);

  // Live registration quality for the Align panel, scored against the surveyed
  // KML centroids — the only exact geography on this map.
  const alignScore: AlignmentScore | null = useMemo(() => {
    if (!alignTarget) return null;
    return scorePlacement(
      OVERLAYS[alignTarget],
      placementOf(alignTarget),
      masks[alignTarget] ?? null,
      anomalies.map(a => ({ lng: a.gps.lng, lat: a.gps.lat })),
    );
  }, [alignTarget, placementOf, masks]);

  const baselineScore: AlignmentScore | null = useMemo(() => {
    if (!alignTarget) return null;
    return scorePlacement(
      OVERLAYS[alignTarget],
      IDENTITY,
      masks[alignTarget] ?? null,
      anomalies.map(a => ({ lng: a.gps.lng, lat: a.gps.lat })),
    );
  }, [alignTarget, masks]);

  // Surveyed panel outlines (defpanels1.kml) — real footprints, not estimated positions.
  // Drives both the zoom-in panel fills on the satellite view and KML View.
  const panelOutlinesGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAnomalies
      .filter(a => a.footprint)
      .map(a => ({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [a.footprint!] },
        properties: { severity: a.severity, anomalyId: a.id },
      })),
  }), [visibleAnomalies]);

  // Centroid points for the zoomed-out dots. Kept as a separate collection because
  // a Mapbox `circle` layer drawn over polygon features would put a circle on every
  // vertex of the footprint rather than one at its centre.
  const anomalyPointsGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAnomalies.map(a => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [a.gps.lng, a.gps.lat] },
      // `status` rides alongside `severity` specifically so DOT_ICON_IMAGE
      // (lib/defect-overlay.ts) can show the Resolved diamond for a Closed
      // finding instead of its severity's own shape — see tokenFor()'s
      // precedence rule in lib/severity-tokens.ts.
      properties: { severity: a.severity, anomalyId: a.id, status: a.status },
    })),
  }), [visibleAnomalies]);

  const anomalyById = useMemo(
    () => new Map(anomalies.map(a => [a.id, a])),
    [],
  );

  // ── Defect stepper order ──
  // Walks visibleAnomalies (respecting the sidebar filters and the
  // stray-suppression policy) rather than the full dataset, so Next/Previous
  // can never land the camera on a panel that is not actually drawn on screen
  // right now. See orderForStepping in lib/map-camera.ts for why the order
  // itself is table/rack/module rather than the dataset's severity-first order.
  const steppableAnomalies = useMemo(() => orderForStepping(visibleAnomalies), [visibleAnomalies]);

  /**
   * The state-setting half of "a panel got picked" — shared by the map click
   * handler below, the defect stepper, and the "[" / "]" keyboard shortcuts, so
   * all three ways of selecting a panel go through one place rather than three
   * copies of the same four lines quietly drifting apart. Camera movement is
   * deliberately NOT part of this: the click handler and the stepper each
   * decide separately whether and how far to move the camera (see the comment
   * at the click handler's call site for why those two cannot share one rule).
   */
  const applySelection = useCallback((anomaly: Anomaly) => {
    emitPanelSelect({
      panelId: anomaly.panelId,
      anomalyId: anomaly.id,
      severity: anomaly.severity,
      lngLat: [anomaly.gps.lng, anomaly.gps.lat],
      source: "map-overlay",
    });
    setSelectedBox(anomaly.id);
    setSelected(anomaly);
    setPopup(anomaly);
  }, [setSelectedBox]);

  /**
   * Next/Previous flagged panel. Unlike a map click — which only recenters
   * when the target is not already comfortably on screen — this always moves
   * the camera: the entire point of the stepper is reaching a panel you have
   * not scrolled to yet, so "already visible" is not a case it needs to handle.
   * Zoom only ever increases to at least panel-footprint scale, never
   * decreases — stepping through a table you are already zoomed into should
   * not zoom you back out.
   */
  const stepDefect = useCallback((dir: 1 | -1) => {
    const idx = stepIndex(steppableAnomalies, selected?.id ?? null, dir);
    if (idx === null) return;
    const target = steppableAnomalies[idx];
    applySelection(target);
    const zoom = Math.max(mapRef.current?.getZoom() ?? 0, OVERLAY_ZOOM.fillMin + 0.5);
    mapRef.current?.easeTo({ center: [target.gps.lng, target.gps.lat], zoom, duration: 600 });
  }, [steppableAnomalies, selected, applySelection]);

  // What the stepper bar actually shows — kept separate from stepDefect
  // itself so the label updates the instant the filters change the pool,
  // without waiting on a click.
  const stepperDisplay = useMemo(() => {
    const idx = selected ? steppableAnomalies.findIndex(a => a.id === selected.id) : -1;
    return {
      label: idx >= 0 ? steppableAnomalies[idx].panelId : "Next Defect",
      position: idx >= 0 ? `${idx + 1} of ${steppableAnomalies.length}` : (
        steppableAnomalies.length > 0 ? `${steppableAnomalies.length} flagged` : null
      ),
      disabled: steppableAnomalies.length === 0,
    };
  }, [selected, steppableAnomalies]);

  // ── HUD camera controls ──
  // Deliberately thin wrappers: all the actual arithmetic (compass-true pan
  // distance, clamping) lives in lib/map-camera.ts so it can be reasoned about
  // and reused from the keyboard handler below without duplicating it.
  const panCardinal = useCallback((dir: Cardinal) => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const [lng, lat] = offsetCardinal(c.lng, c.lat, dir, panStepMetres(map.getZoom()));
    map.easeTo({ center: [lng, lat], duration: 220 });
  }, []);

  const stepPitch = useCallback((sign: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: clamp(map.getPitch() + sign * PITCH_STEP, PITCH_MIN, PITCH_MAX), duration: 220 });
  }, []);

  const stepZoom = useCallback((sign: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      zoom: clamp(map.getZoom() + sign * ZOOM_STEP, map.getMinZoom(), map.getMaxZoom()),
      duration: 220,
    });
  }, []);

  const resetNorth = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, duration: 300 });
  }, []);

  /**
   * The keyboard half of the HUD (see lib/map-camera.ts's SHORTCUT_MATRIX,
   * which is the legend this must stay in sync with).
   *
   * Bound on window, not the map container, so it works regardless of what
   * has focus — matching AlignPanel's own arrow-key handler below, whose
   * input/select/textarea guard this copies verbatim for the same reason.
   *
   * GUARDS THAT MATTER:
   *   - alignTarget: AlignPanel binds its OWN window keydown listener for
   *     plain arrow keys the moment it mounts (see the "Align panel" section
   *     below), to nudge the raster under alignment. Two window-level arrow
   *     handlers firing on the same keydown would both act on one keypress —
   *     nudge the overlay AND pan the camera — so this listener steps aside
   *     entirely while Align is open rather than trying to coordinate with it.
   *   - compareMode: two independently-scrolled panes side by side have no
   *     one camera for a keypress to mean anything about.
   *   - isRajpur: the non-Rajpur placeholder map carries no real anomaly data
   *     for the stepper to walk and isn't meant to be a navigable site map.
   */
  useEffect(() => {
    if (!isRajpur || compareMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (alignTarget) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.key === "Escape") {
        if (selected) { e.preventDefault(); setSelected(null); }
        return;
      }
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        stepDefect(e.key === "]" ? 1 : -1);
        return;
      }
      if (e.key.toLowerCase() === "n" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        resetNorth();
        return;
      }

      const dirs: Partial<Record<string, Cardinal>> = {
        ArrowUp: "N", ArrowDown: "S", ArrowLeft: "W", ArrowRight: "E",
      };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();

      if (e.shiftKey) { stepZoom(e.key === "ArrowUp" ? -1 : 1); return; }
      if (e.ctrlKey || e.metaKey) { stepPitch(e.key === "ArrowUp" ? 1 : -1); return; }
      panCardinal(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isRajpur, compareMode, alignTarget, selected, stepDefect, resetNorth, stepZoom, stepPitch, panCardinal]);

  // Alignment reference: every surveyed footprint, ignoring the sidebar filters.
  // Filtering here would be actively harmful — you align against as much known-good
  // geometry as you can get, and a filter that hides two thirds of the panels would
  // let an operator "align" a raster against a handful of points in one corner.
  const alignReferenceGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: anomalies.filter(a => a.footprint).map(a => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [a.footprint!] },
      properties: {},
    })),
  }), []);

  // ── Overlay render profile ──
  // Recomputed only when the presentation toggle flips. The paint objects are
  // plain data, so handing a new one to a <Layer> is a diff of paint properties
  // rather than a layer rebuild — the boxes do not blink when the profile changes.
  // Presentation Mode wins outright when both apply — someone screen-sharing
  // from their phone still needs the codec-friendly profile, not the mobile
  // one, and reduceEffects is true either way so nothing is lost by picking one.
  const profile = presenting ? PRESENTATION.share : isMobile ? PRESENTATION.mobile : PRESENTATION.desk;
  const box     = useMemo(() => boxPaint(profile.reduceEffects), [profile.reduceEffects]);
  const cluster = useMemo(() => clusterPaint(profile.reduceEffects), [profile.reduceEffects]);
  const anchor  = useMemo(() => anchorPaint(profile.reduceEffects), [profile.reduceEffects]);
  // Layout object shared by the five anomaly-panel-* box layers so the "Show
  // Defect Outlines" toggle hides them all as one. A layout `visibility` change
  // is reactive through react-map-gl (setLayoutProperty) and, unlike removing
  // the layers, leaves OVERLAY_STACK's moveLayer ordering untouched.
  const outlineVisibility = useMemo(
    () => ({ visibility: (showOutlines ? "visible" : "none") as "visible" | "none" }),
    [showOutlines],
  );

  /**
   * The selected panel's centroid, or nothing.
   *
   * Driven by `selected` — React state — rather than by the selectedId ref, so
   * the marker also appears when a panel is chosen from somewhere other than a
   * map click. Rebuilding a one-feature collection on selection is free; doing
   * the same for hover across 1,249 features is what the feature-state plumbing
   * above exists to avoid.
   */
  const anchorGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: selected
      ? [{
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [selected.gps.lng, selected.gps.lat] },
          properties: {},
        }]
      : [],
  }), [selected]);

  // Shared by the dot, fill and outline layers so one severity palette drives all three.
  const severityColour: ExpressionSpecification = [
    "match", ["get", "severity"],
    "critical", SEV_COLOR.critical,
    "medium",   SEV_COLOR.medium,
    "normal",   SEV_COLOR.normal,
    SEV_COLOR.nodata,
  ];

  /**
   * Re-assert the overlay stacking order after any style change.
   *
   * `beforeId="anomaly-panel-fill"` on the raster is the primary mechanism and
   * it works — verified against the live style, the thermal sits below all four
   * box layers. This is a backstop for the case where it cannot work: mapbox-gl
   * treats an unknown `beforeId` as "append", silently, so if any one anomaly
   * layer fails to be added the raster lands on TOP and every marker on the map
   * disappears. That is not hypothetical — it is exactly what happened while the
   * halo paint below still had a nested zoom expression: one bad layer, and a
   * map with 1,249 defects on it rendered none of them, with the only clue a
   * "Layer with id ... does not exist" line in the console.
   *
   * Bound to `styledata` rather than run on render, because the thing it has to
   * react to is the style changing (a layer added, or the whole style swapped by
   * Hide basemap), which is not something React re-renders for. moveLayer only
   * reorders the style's layer array — no re-tile, no re-upload — so running it
   * more often than strictly needed costs nothing worth measuring.
   */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const restack = () => {
      // Confirmed live 2026-09-04: navigating away from /map fires this
      // handler with the map already mid-teardown — react-map-gl's own
      // unmount effect (a child of this component, so it cleans up first)
      // calls the underlying map.remove(), which itself emits one last
      // `styledata` synchronously as it tears down sources/layers, and this
      // listener is still attached (this effect's own `map.off` cleanup
      // hasn't run yet — it's a parent effect, cleaned up after children's).
      // getLayer/getStyle/moveLayer all reach into `map.style` internally,
      // which is already gone by that point, throwing "Cannot read
      // properties of undefined (reading 'getOwnLayer')" — uncaught, since
      // it fires from an event listener React has no visibility into.
      // There's no public "is this map still alive" check to gate on
      // instead, so the guard is a plain try/catch around the one handler
      // known to run past teardown, not a fix to the ordering itself.
      try {
        const present = OVERLAY_STACK.filter(id => map.getLayer(id));
        // Only act when the order is actually wrong. moveLayer() itself emits
        // `styledata`, so an unconditional reorder here would answer its own event
        // — harmless in practice (it converges immediately, measured at 0 extra
        // events per second) but it makes the handler re-entrant for no reason,
        // and a no-op guard is cheaper than reasoning about that every time
        // somebody adds a layer.
        const order = map.getStyle().layers.map(l => l.id);
        const idx = present.map(id => order.indexOf(id));
        if (idx.every((v, i) => i === 0 || v > idx[i - 1])) return;
        for (const id of present) map.moveLayer(id);
      } catch {
        // Map is being torn down; nothing left to restack.
      }
    };
    map.on("styledata", restack);
    restack();
    return () => { map.off("styledata", restack); };
  }, [mapReady]);

  /**
   * Register the four shape-coded marker sprites (Task 5) — same lifecycle as
   * restack() above and for the same reason: toggling Hide Basemap swaps the
   * whole style object, which drops every `addImage` registration along with
   * it, so `anomaly-dot`'s icon-image would start resolving to nothing and
   * Mapbox would silently stop drawing the layer. `hasImage` guards against
   * re-rasterising four canvases on every unrelated styledata event — only
   * add what a fresh style is actually missing.
   */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const registerSprites = () => {
      // Same teardown race restack() above documents — this is a `styledata`
      // listener too, and map.remove()'s own final `styledata` can reach it
      // before this effect's `map.off` cleanup does.
      try {
        for (const sprite of buildSeveritySprites()) {
          if (!map.hasImage(sprite.id)) {
            map.addImage(sprite.id, { width: sprite.width, height: sprite.height, data: sprite.data });
          }
        }
      } catch {
        // Map is being torn down; nothing left to register sprites onto.
      }
    };
    // styleimagemissing is Mapbox's own escape hatch for exactly the race this
    // component otherwise has on first mount: <Layer id="anomaly-dot"> (a
    // child, so its own mount effect runs before this parent effect per
    // React's child-before-parent effect order) can ask for
    // "sev-sprite-critical" a render or two before registerSprites() above
    // has run, and Mapbox logs a warning and skips the icon for that frame
    // rather than waiting. Handling the event closes that window synchronously
    // instead of relying on effect ordering staying favorable.
    const onImageMissing = (e: { id: string }) => {
      if (!map.hasImage(e.id)) registerSprites();
    };
    map.on("styledata", registerSprites);
    map.on("styleimagemissing", onImageMissing);
    registerSprites();
    return () => {
      map.off("styledata", registerSprites);
      map.off("styleimagemissing", onImageMissing);
    };
  }, [mapReady]);

  /**
   * The critical "dynamic inner pulse" — see criticalPulseValue() in
   * lib/defect-overlay.ts for why this has to be a requestAnimationFrame loop
   * rather than a paint expression. One loop drives one paint property on one
   * layer for every critical marker at once; it does not touch the dot layer
   * itself; it does not run at all when there is nothing to pulse, so an idle
   * plant with zero criticals costs nothing per frame.
   *
   * circle-radius is set as a plain number, not a ["*", interpolate, scale]
   * expression: the "zoom expression must be outermost" rule from the dot
   * geometry comment near DOT_ICON_SIZE_BY_ZOOM applies here too, and setPaintProperty
   * goes through the same expression validator a static style does — nesting
   * the zoom interpolation inside "*" would drop this layer exactly the way
   * it dropped the dot layer that first time. Reading map.getZoom() and doing
   * the interpolation in JS sidesteps the restriction entirely, which a
   * static paint expression can't do but a per-frame JS callback can.
   */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapReady) return;
    let raf = 0;
    const pulseBaseRadius = (zoom: number) => {
      const t = clamp((zoom - 14) / (18.5 - 14), 0, 1);
      return 5 + t * (9 - 5);
    };
    const tick = (t: number) => {
      // Same map.remove()-during-teardown race restack() documents (see that
      // effect's comment) — belt-and-suspenders here, since cancelAnimationFrame
      // in this effect's own cleanup should already stop future frames, but
      // getLayer/setPaintProperty reach into `map.style`, which a teardown
      // that wins the race has already cleared. Deliberately does NOT
      // reschedule from the catch branch — a torn-down map is never coming
      // back, so looping forever polling a promise that can't resolve would
      // trade one bug (a crash) for a worse one (an orphaned rAF loop that
      // never stops).
      try {
        if (map.getLayer("anomaly-critical-pulse")) {
          const { opacity, radiusScale } = criticalPulseValue(t);
          map.setPaintProperty("anomaly-critical-pulse", "circle-opacity", opacity);
          map.setPaintProperty("anomaly-critical-pulse", "circle-radius", pulseBaseRadius(map.getZoom()) * radiusScale);
        }
      } catch {
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapReady]);

  /**
   * Task 6: the live-updating half of the pitch lock — maxPitch above only
   * applies at construction, so a viewport resize or tablet rotation crossing
   * the 768px breakpoint mid-session (isMobile flipping without a remount)
   * would otherwise leave a stale pitch capability that no longer matches
   * what the HUD offers. Mirrors it into the actual mapboxgl.Map instance's
   * own live-settable interaction handlers and constraint, and eases any
   * existing tilt back to flat rather than leaving the camera stuck at a
   * pitch the map can no longer be pitched away from.
   */
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapReady) return;
    if (isMobile) {
      map.setMaxPitch(0);
      map.dragRotate.disable();
      map.touchPitch.disable();
      if (map.getPitch() !== 0) map.easeTo({ pitch: 0, duration: profile.fadeDuration });
    } else {
      map.setMaxPitch(PITCH_MAX);
      map.dragRotate.enable();
      map.touchPitch.enable();
    }
  }, [isMobile, mapReady, profile.fadeDuration]);

  // Selection can be cleared by the drawer's own close button, which knows
  // nothing about feature state. Mirroring it here keeps the highlighted box and
  // the open drawer from disagreeing.
  useEffect(() => {
    setSelectedBox(selected?.id ?? null);
  }, [selected, setSelectedBox]);

  // Task 7: the audit drawer is scoped to one anomaly's history — stepping
  // to the next flagged panel (or closing the selection entirely) without
  // closing this first would otherwise leave it open showing the *previous*
  // panel's timeline under the new panel's identity in the drawer behind it.
  useEffect(() => {
    setAuditOpen(false);
  }, [selected?.id]);

  const uniqueInverters = useMemo(() =>
    ["all", ...Array.from(new Set(anomalies.map(a => a.inverter))).sort()], []);
  const uniqueTables = useMemo(() =>
    ["all", ...Array.from(new Set(anomalies.map(a => a.string))).sort((a, b) => {
      const na = parseInt(a.replace("Table-", ""));
      const nb = parseInt(b.replace("Table-", ""));
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    })], []);

  const resetFilters = () => {
    setFilters({ critical: true, medium: true, normal: true, nodata: true });
    setTypeFilter("all"); setStringFilter("all"); setInverterFilter("all");
  };

  const exportKML = () => {
    const kml = buildAnomaliesKML({
      plantName: selectedPlant.name,
      boundary: isRajpur ? PLANT_BOUNDARY_COORDS : undefined,
      plantCenter: selectedPlant.gps,
      anomalies: visibleAnomalies,
    });
    const fileSlug = selectedPlant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadKML(`${fileSlug}-urjascan-export.kml`, kml);
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-[calc(100vh-3rem)]">

      {/* ── Sidebar ── */}
      <aside className={`${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0 fixed md:static z-20 top-12 bottom-14 md:bottom-0 left-0 w-72 bg-card border-r border-border p-5 overflow-y-auto transition-transform`}>
        <h2 className="font-bold text-foreground mb-4">Filter Panels</h2>

        <div className="space-y-2">
          {([
            { key: "critical", label: SEVERITY_LABEL_FULL.critical, dotColor: SEV_COLOR.critical, count: anomalyCounts.critical, color: "text-critical" },
            { key: "medium",   label: SEVERITY_LABEL_FULL.medium,   dotColor: SEV_COLOR.medium,   count: anomalyCounts.medium,   color: "text-medium" },
            { key: "normal",   label: SEVERITY_LABEL_FULL.normal,   dotColor: SEV_COLOR.normal,   count: anomalyCounts.normal,   color: "text-normal" },
            { key: "nodata",   label: SEVERITY_LABEL_FULL.nodata,   dotColor: "#6b7280",          count: anomalyCounts.nodata,   color: "text-muted-foreground" },
            // A row reading "(0)" is a filter that can only ever remove nothing.
          ] as const).filter(f => f.count > 0).map(f => (
            <label key={f.key} className="flex items-center gap-3 cursor-pointer py-1.5">
              <input
                type="checkbox"
                checked={filters[f.key]}
                onChange={e => setFilters({ ...filters, [f.key]: e.target.checked })}
                className="w-4 h-4 accent-ochre"
              />
              <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: f.dotColor, flexShrink: 0 }} />
              <span className="flex-1 text-sm font-medium">{f.label}</span>
              <span className={`mono text-xs ${f.color}`}>({f.count.toLocaleString()})</span>
            </label>
          ))}
        </div>

        {isRajpur && (
          <p className="mt-4 text-[11px] text-muted-foreground mono border-t border-grey-200 pt-3">
            {visibleAnomalies.length} of {anomalies.length} anomalies shown
          </p>
        )}

        <div className="mt-4 space-y-4">
          <FilterSelect label="Anomaly Type" value={typeFilter} onChange={setTypeFilter}
            options={["all", ...anomalyTypes.filter(t => anomalies.some(a => a.type === t))]} />
          <FilterSelect label="Inverter" value={inverterFilter} onChange={setInverterFilter} options={uniqueInverters} />
          <FilterSelect label="Table / String" value={stringFilter} onChange={setStringFilter} options={uniqueTables} />
        </div>

        <button onClick={resetFilters} className="mt-6 text-xs text-ochre font-medium hover:underline">
          Reset All Filters
        </button>
      </aside>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header bar */}
        <div className="px-4 md:px-6 py-3 bg-card border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-bold text-foreground">{selectedPlant.name} — Site Map</h1>
            <p className="text-xs text-muted-foreground mono">
              {selectedPlant.totalPanels.toLocaleString()} panels · {selectedPlant.location}
              {isRajpur ? ` · ${PLANT_ROWS} rows × ${PLANT_COLS} cols` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">

            {/* Satellite-only controls */}
            {isRajpur && (
              <>
                <button
                  onClick={() => { setCompareMode(v => !v); setKmlViewMode(false); }}
                  title="Compare thermal against satellite"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    compareMode ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <SplitSquareHorizontal size={13} /> Compare
                </button>

                {/* Not gated on isSurveyor: the person sharing their screen with a
                    plant owner is as often the plant owner. */}
                <button
                  onClick={() => setPresenting(v => !v)}
                  title="Screen-share mode — drops blurs, shadows and the raster crossfade so the map survives video compression, and stops the camera moving on click"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    presenting ? "bg-sky-600 text-white border-sky-600" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <MonitorPlay size={13} /> Present
                </button>

                {isSurveyor && (
                <button
                  onClick={() => { setKmlViewMode(v => !v); setCompareMode(false); }}
                  title="View surveyed panel outlines from drone KML on their own, separate from the IR overlay"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    kmlViewMode ? "bg-ochre text-ochre-fg border-ochre" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <MapIcon size={13} /> KML View
                </button>
                )}

                {isSurveyor && (
                <button
                  onClick={() => {
                    // Opening Align implies you want to see what you are aligning,
                    // so switch the target overlay on rather than making the
                    // operator remember to.
                    const next = alignTarget ? null : (activeOverlayIds[0] ?? "thermal");
                    if (next) setThermalVisible(true);
                    setAlignTarget(next);
                    setCompareMode(false); setKmlViewMode(false);
                  }}
                  title="Georeference an overlay by hand against the surveyed panel footprints"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    alignTarget ? "bg-violet-600 text-white border-violet-600" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <Crosshair size={13} /> Align
                </button>
                )}

                {!compareMode && !kmlViewMode && (
                  <div className="flex items-center border border-border divide-x divide-border overflow-hidden">
                    <span className="px-2 text-[10px] uppercase tracking-widest text-grey-400 bg-grey-50 h-8 flex items-center">Overlay</span>
                    <button onClick={() => setThermalVisible(v => !v)} className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${thermalVisible ? "bg-red-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                      <Thermometer size={13} /> IR
                    </button>
                  </div>
                )}
              </>
            )}

            {isSurveyor && (
              <button
                onClick={exportKML}
                title="Download plant boundary and visible anomalies as a .kml file for Google Earth"
                className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium border border-border bg-card text-muted-foreground hover:bg-muted"
              >
                <Download size={13} /> Export KML
              </button>
            )}

            <button onClick={() => setSidebarOpen(true)} className="md:hidden px-3 py-1.5 text-xs border border-border bg-card">
              Filters
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative flex flex-col">

          {/* ── Satellite: compare mode ── */}
          {compareMode && (
            <div
              className="absolute inset-0 flex select-none"
              onMouseMove={e => {
                if (!dragging.current) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                setSplitPct(Math.min(90, Math.max(10, ((e.clientX - rect.left) / rect.width) * 100)));
              }}
              onMouseUp={() => { dragging.current = false; }}
              onMouseLeave={() => { dragging.current = false; }}
            >
              {/* Left: Thermal */}
              <div className="relative overflow-hidden flex-shrink-0" style={{ width: `${splitPct}%` }}>
                <MapGL
                  mapboxAccessToken={MAPBOX_TOKEN}
                  longitude={viewState.longitude} latitude={viewState.latitude}
                  zoom={viewState.zoom} bearing={viewState.bearing} pitch={viewState.pitch}
                  onMove={e => setViewState({ ...e.viewState, padding: { top: 0, bottom: 0, left: 0, right: 0 } })}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                >
                  <Source id="cmp-thermal" type="image" url={THERMAL_IMAGE} coordinates={cornersOf("thermal")}>
                    <Layer id="cmp-thermal-layer" type="raster" paint={{
                      "raster-opacity": 1,
                      "raster-resampling": RASTER_RESAMPLING,
                      "raster-contrast": THERMAL_CONTRAST,
                      "raster-saturation": THERMAL_SATURATION,
                    }} />
                  </Source>
                </MapGL>
                <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold mono px-2 py-0.5 flex items-center gap-1">
                  <Thermometer size={10} /> THERMAL IR
                </div>
              </div>

              {/* Divider */}
              <div
                className="relative z-10 flex-shrink-0 cursor-col-resize"
                style={{ width: 4, background: "white", boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }}
                onMouseDown={() => { dragging.current = true; }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-8 h-8 bg-card rounded-full border border-border shadow-lg flex items-center justify-center">
                  <SplitSquareHorizontal size={14} className="text-primary" />
                </div>
              </div>

              {/* Right: satellite basemap.
                  This pane used to carry the Block 20 visual orthomosaics. The
                  March 2026 survey is thermal-only, so the comparison is now
                  thermal against Mapbox satellite — still the question a client
                  actually asks of this control ("what is physically there?"),
                  just answered from the basemap instead of from a second flight.
                  Restore the image sources here if a visual ortho ever ships. */}
              <div className="relative overflow-hidden flex-1">
                <MapGL
                  mapboxAccessToken={MAPBOX_TOKEN}
                  longitude={viewState.longitude} latitude={viewState.latitude}
                  zoom={viewState.zoom} bearing={viewState.bearing} pitch={viewState.pitch}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                >
                </MapGL>
                <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold mono px-2 py-0.5 flex items-center gap-1">
                  <Layers size={10} /> SATELLITE
                </div>
              </div>
            </div>
          )}

          {/* ── Satellite: main view ── */}
          {!compareMode && (
            <div className="absolute inset-0">
              <MapGL
                ref={mapRef}
                mapboxAccessToken={MAPBOX_TOKEN}
                // Centre of the March 2026 thermal footprint. z16.2 rather than the
                // old z17 because this block is 1.14 km across against Block 20's
                // 0.57 km — at z17 half of it starts off screen.
                initialViewState={{ longitude: 73.0295, latitude: 28.2622, zoom: isRajpur ? 16.2 : 14 }}
                key={selectedPlant.id}
                // Task 6's "simplified 2D mobile fallback": a tilted view costs
                // extra fill-rate on the exact devices least able to spare it, and
                // the pitch stepper that would produce one is already hidden on
                // mobile (NavigationHUD's pitchEnabled prop below) — this is the
                // enforcement to match, not just the affordance removal. Only sets
                // the *initial* constructor value; the mobilePitchLock effect below
                // covers a live isMobile flip (viewport resize/rotation) that this
                // prop alone would miss.
                maxPitch={isMobile ? 0 : undefined}
                style={{ width: "100%", height: "100%" }}
                mapStyle={thermalVisible && hideBasemap && !kmlViewMode
                  ? BLANK_BASEMAP_STYLE
                  : "mapbox://styles/mapbox/satellite-streets-v12"}
                cursor={hoveringAnomaly ? "pointer" : undefined}
                fadeDuration={profile.fadeDuration}
                onMouseMove={e => {
                  const hit = hitAt([e.point.x, e.point.y], HOVER_LAYERS);
                  const id = hit?.properties?.anomalyId;
                  setHoveredBox(id === undefined || id === null ? null : String(id));
                }}
                onMouseLeave={() => setHoveredBox(null)}
                onClick={e => {
                  const hit = hitAt([e.point.x, e.point.y], CLICK_LAYERS);

                  // A cluster is a "there is more here" affordance, not a panel — it
                  // expands to the zoom at which its members separate. Asking the
                  // source for that zoom is what makes one click always enough,
                  // rather than the guess a fixed zoom step would be.
                  if (hit?.properties?.cluster) {
                    const src = mapRef.current?.getMap().getSource("anomaly-points") as
                      GeoJSONSource | undefined;
                    const clusterId = hit.properties.cluster_id as number;
                    src?.getClusterExpansionZoom(clusterId, (err, zoom) => {
                      if (err || zoom == null) return;
                      const [lng, lat] = (hit.geometry as GeoJSON.Point).coordinates;
                      mapRef.current?.easeTo({ center: [lng, lat], zoom, duration: 500 });
                    });
                    return;
                  }

                  const anomaly = hit && anomalyById.get(String(hit.properties?.anomalyId));
                  if (!anomaly) {
                    setPopup(null);
                    setSelectedBox(null);
                    return;
                  }

                  // The overlay's whole output: which panel was picked. Everything
                  // downstream — this route's drawer, the popup, anything listening
                  // on the window — reacts to that rather than being called directly.
                  // See the click-contract note in lib/defect-overlay.ts, and
                  // applySelection above for why this is shared with the stepper
                  // and keyboard shortcuts rather than repeated here.
                  applySelection(anomaly);

                  // Only move the camera when the box is not yet drawn as a box.
                  // The old behaviour flew to z20 on every click, which yanked the
                  // view out from under someone who had already framed the table
                  // they were discussing. Under the share profile it never moves.
                  const zoom = mapRef.current?.getZoom() ?? 0;
                  if (profile.autoFly && zoom < PANEL_FILL_MIN_ZOOM) {
                    mapRef.current?.easeTo({
                      center: [anomaly.gps.lng, anomaly.gps.lat],
                      zoom: PANEL_FILL_MIN_ZOOM + 0.5,
                      duration: 700,
                    });
                  }
                }}
                onLoad={() => { setMapError(null); setMapReady(true); }}
                onError={e => {
                  console.error("Mapbox load error:", e.error);
                  setMapError(
                    !MAPBOX_TOKEN
                      ? "Mapbox access token is missing (VITE_MAPBOX_TOKEN not set for this build)."
                      : "Map failed to load — the Mapbox access token may be invalid, expired, or restricted to a different domain."
                  );
                }}
              >
                <NavigationControl position="top-right" />

                {/* Plant boundary outline */}
                {isRajpur && (
                  <Source id="plant-boundary" type="geojson" data={{
                    type: "Feature",
                    geometry: { type: "Polygon", coordinates: [PLANT_BOUNDARY_COORDS] },
                    properties: {},
                  } as never}>
                    <Layer id="plant-boundary-fill" type="fill" paint={{ "fill-color": "#f59e0b", "fill-opacity": 0.04 }} />
                    <Layer id="plant-boundary-line" type="line" paint={{ "line-color": "#f59e0b", "line-width": 1.5, "line-opacity": 0.6, "line-dasharray": [4, 3] }} />
                  </Source>
                )}

                {/* Non-Rajpur: centre pin */}
                {!isRajpur && (
                  <Marker longitude={selectedPlant.gps.lng} latitude={selectedPlant.gps.lat} anchor="center">
                    <div style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "var(--ochre)", border: "3px solid white", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }} />
                  </Marker>
                )}

                {/* ── Anomalies at actual drone-recorded GPS ──
                    Drawn as map layers rather than <Marker> elements. A Marker is an
                    HTML div sized in screen pixels, so it never scales with zoom — a
                    12px dot sits ~11x wider than the 1.19m module it marks and spills
                    across neighbouring tiles. These layers interpolate on zoom, so the
                    indicator becomes the panel itself once a panel is big enough to see.

                    Mounted BEFORE the orthomosaic overlays on purpose: Mapbox appends
                    each new layer to the top of the stack, so an overlay toggled on
                    later would otherwise bury the anomalies. Declaring these first
                    gives the rasters below a stable `beforeId` to insert beneath. */}
                {isRajpur && !kmlViewMode && (
                  <>
                    {/* ── Bounding boxes ──
                        The surveyed footprints, tiled at panel scale (SOURCE_TUNING)
                        and keyed by anomalyId so feature state can address them.
                        Draw order below is deliberate: fill, halo, casing, stroke —
                        Mapbox paints in declaration order, and the halo has to sit
                        under the white casing or it washes the casing out and the
                        box loses the contrast the casing exists to give it. */}
                    <Source
                      id="anomaly-panels"
                      type="geojson"
                      data={panelOutlinesGeoJSON as never}
                      {...SOURCE_TUNING}
                    >
                      <Layer id="anomaly-panel-fill" type="fill" layout={outlineVisibility} paint={{
                        "fill-color": severityColour,
                        ...box.fill,
                      }} />
                      <Layer id="anomaly-panel-halo" type="line" layout={outlineVisibility} paint={{
                        "line-color": severityColour,
                        ...box.halo,
                      }} />
                      {/* Task 5 anti-camouflage ring, black half: paired with the
                          white casing Layer just below to bracket every possible
                          background luminance — see RING_* in lib/severity-tokens.ts.
                          Declared first so casing paints over it and only the
                          intended sliver of black shows, same nested-shape logic
                          SeverityShape.tsx uses for the SVG badges. */}
                      <Layer id="anomaly-panel-black-ring" type="line" layout={outlineVisibility} paint={{
                        "line-color": RING_INNER,
                        ...box.blackRing,
                      }} />
                      <Layer id="anomaly-panel-casing" type="line" layout={outlineVisibility} paint={{
                        "line-color": "#ffffff",
                        ...box.casing,
                      }} />
                      <Layer id="anomaly-panel-line" type="line" layout={outlineVisibility} paint={{
                        "line-color": severityColour,
                        ...box.stroke,
                      }} />
                    </Source>

                    {/* ── Anchor marker ──
                        A one-feature source, rebuilt only when the selection changes,
                        so it costs nothing to keep separate from the 1,249-feature
                        collections. Ground-aligned: it foreshortens with the panel
                        under tilt, which is the point of it. */}
                    <Source id="anomaly-anchor" type="geojson" data={anchorGeoJSON as never}>
                      <Layer id="anomaly-anchor-ring" type="circle" paint={anchor.ring} />
                      <Layer id="anomaly-anchor-dot" type="circle" paint={anchor.dot} />
                    </Source>

                    {/* ── Dots and clusters ──
                        One clustered source feeds both: below OVERLAY_ZOOM.cluster
                        Mapbox emits cluster features, above it the raw points, and
                        the two layers below filter on which of those they got. */}
                    <Source
                      id="anomaly-points"
                      type="geojson"
                      data={anomalyPointsGeoJSON as never}
                      {...CLUSTER_TUNING}
                    >
                      {/* Task 5 anti-camouflage ring for clusters — same
                          nested-shape logic as anomaly-panel-black-ring above:
                          drawn first, under the white-stroked cluster circle, so
                          only its outer sliver shows as a second, opposite-
                          luminance ring around the first. */}
                      <Layer id="anomaly-cluster-black-ring" type="circle" filter={CLUSTERED}
                        paint={cluster.blackRing} />
                      <Layer id="anomaly-cluster" type="circle" filter={CLUSTERED}
                        paint={cluster.circle} />
                      <Layer
                        id="anomaly-cluster-count"
                        type="symbol"
                        filter={CLUSTERED}
                        layout={{
                          // Cluster counts hidden per client request: the sized,
                          // colour-priced cluster circle still communicates "more
                          // here", but the numeral is suppressed. Empty text-field
                          // renders nothing; the layer is kept (rather than removed)
                          // so OVERLAY_STACK's moveLayer ordering stays intact.
                          "text-field": "",
                          // The app ships a Mapbox style whose glyph set is known to
                          // carry this family; naming a font the style cannot fetch
                          // drops the layer silently with nothing in the console.
                          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                          "text-size": ["step", ["get", "point_count"], 11, 10, 12, 50, 13],
                          "text-allow-overlap": true,
                        }}
                        paint={cluster.count}
                      />
                      {/* Task 5 "dynamic inner pulse", critical only — a plain
                          circle layer the rAF effect above overwrites every frame
                          via setPaintProperty (see that effect's own comment for
                          why circle-radius is a number, not an expression); the
                          values here are just a legal first paint before that
                          effect's first tick runs. Filtered to UNCLUSTERED so a
                          clustered critical doesn't pulse behind its own cluster
                          circle — the cluster circle's own colour priority
                          (cluster.circle in lib/defect-overlay.ts) already carries
                          "something urgent is under here" once points merge. */}
                      <Layer
                        id="anomaly-critical-pulse"
                        type="circle"
                        filter={["all", UNCLUSTERED, ["==", ["get", "severity"], "critical"]] as FilterSpecification}
                        paint={{
                          "circle-color": SEVERITY.critical.vivid,
                          "circle-radius": 5,
                          "circle-opacity": 0.35,
                          "circle-pitch-alignment": "viewport",
                          "circle-pitch-scale": "map",
                        }}
                      />
                      {/* Task 5: was a plain circle layer with a white
                          circle-stroke; now a symbol layer drawing the
                          shape-coded, black+white-ringed sprites registered by
                          the useEffect above, so colour is no longer the only
                          channel carrying severity. DOT_ICON_SIZE_BY_ZOOM's own
                          comment has the target-size and severity-scaling
                          rationale behind it. icon-allow-overlap replicates
                          what a circle layer always did implicitly (draw every
                          point, no collision culling): a symbol layer hides
                          overlapping icons by default, which would silently drop
                          markers in dense clusters of unclustered points. */}
                      <Layer id="anomaly-dot" type="symbol" filter={UNCLUSTERED} layout={{
                        "icon-image": DOT_ICON_IMAGE,
                        "icon-size": DOT_ICON_SIZE_BY_ZOOM,
                        "icon-allow-overlap": true,
                        "icon-ignore-placement": true,
                        // Same perspective-correctness as the old circle-pitch-alignment.
                        "icon-pitch-alignment": "viewport",
                      }} paint={{
                        // Hands over to the panel fill rather than stacking on top of it.
                        "icon-opacity": ["interpolate", ["linear"], ["zoom"], PANEL_DOT_MAX_ZOOM, 1, PANEL_FILL_MIN_ZOOM, 0],
                      }} />
                    </Source>
                  </>
                )}

                {/* Drone orthomosaic overlays — suppressed in KML View, which shows outlines on their own.
                    `beforeId` keeps them underneath the anomaly layers no matter what order
                    the user toggles IR in. */}
                {isRajpur && thermalVisible && !kmlViewMode && (
                  <Source id="thermal" type="image" url={THERMAL_IMAGE} coordinates={cornersOf("thermal")}>
                    <Layer id="thermal-layer" type="raster" beforeId="anomaly-panel-fill" paint={{
                      "raster-opacity": thermalOpacity,
                      // The site is ~900 m across, so past roughly z18 the map is
                      // magnifying the raster beyond 1:1. Mapbox defaults to
                      // "linear", which blends neighbouring panel rows together
                      // exactly when you have zoomed in to inspect them; "nearest"
                      // keeps the row/gap boundaries hard.
                      "raster-resampling": RASTER_RESAMPLING,
                      "raster-contrast": THERMAL_CONTRAST,
                      "raster-saturation": THERMAL_SATURATION,
                      "raster-fade-duration": 0,
                    }} />
                  </Source>
                )}

                {/* Alignment reference — the surveyed footprints, drawn on top of
                    everything in a colour nothing else on the map uses. These are the
                    fixed thing: you move the raster until its panel rows sit under
                    these rectangles, never the other way round. Declared after the
                    rasters so Mapbox stacks it above them. */}
                {isRajpur && alignTarget && (
                  <Source id="align-ref" type="geojson" data={alignReferenceGeoJSON as never}>
                    <Layer id="align-ref-line" type="line" paint={{
                      "line-color": "#22d3ee",
                      "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.6, 19, 2],
                      "line-opacity": 0.95,
                    }} />
                  </Source>
                )}

                {/* Surveyed panel outlines — real footprints from defpanels1.kml — only in KML View */}
                {isRajpur && kmlViewMode && (
                  <Source id="panel-outlines" type="geojson" data={panelOutlinesGeoJSON as never}>
                    <Layer id="panel-outlines-fill" type="fill" paint={{
                      "fill-color": ["match", ["get", "severity"], "critical", SEV_COLOR.critical, "medium", SEV_COLOR.medium, "normal", SEV_COLOR.normal, SEV_COLOR.nodata],
                      "fill-opacity": kmlOpacity,
                    }} />
                    <Layer id="panel-outlines-line" type="line" paint={{
                      "line-color": ["match", ["get", "severity"], "critical", SEV_COLOR.critical, "medium", SEV_COLOR.medium, "normal", SEV_COLOR.normal, SEV_COLOR.nodata],
                      "line-width": 1.25,
                    }} />
                  </Source>
                )}

                {/* Popup for selected anomaly */}
                {popup && (
                  <Popup
                    longitude={popup.gps.lng}
                    latitude={popup.gps.lat}
                    anchor="bottom"
                    offset={10}
                    closeOnClick={false}
                    onClose={() => setPopup(null)}
                    style={{ padding: 0 }}
                  >
                    <div className="p-3 min-w-[210px] max-w-[240px] text-sm font-sans">
                      {/* The radiometric frame the defect was called from. Shown inline
                          because the map is where a client asks "what's actually wrong
                          with that panel?", and sending them to the detail route to find
                          out loses the spatial context they just clicked. */}
                      <PopupDefectImage note={popup.rgbNote} />
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="mono font-bold">{popup.panelId}</p>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px",
                          backgroundColor: SEV_COLOR[popup.severity] + "22",
                          color: SEV_COLOR[popup.severity],
                          border: `1px solid ${SEV_COLOR[popup.severity]}44`,
                          whiteSpace: "nowrap", borderRadius: 2,
                        }}>{SEVERITY_LABEL_FULL[popup.severity]}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{popup.type}</p>
                      <p className="text-[10px] text-muted-foreground mono mt-1.5">
                        {popup.gps.lat.toFixed(5)}°N, {popup.gps.lng.toFixed(5)}°E
                      </p>
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-grey-100">
                        <a
                          href={`https://maps.google.com/maps?daddr=${popup.gps.lat},${popup.gps.lng}&dirflg=d`}
                          target="_blank" rel="noreferrer"
                          className="text-[11px] text-ochre hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <Navigation size={10} /> Navigate
                        </a>
                        <Link
                          to="/anomalies/$id"
                          params={{ id: popup.id }}
                          className="text-[11px] text-primary hover:underline font-medium"
                        >
                          Full detail →
                        </Link>
                      </div>
                    </div>
                  </Popup>
                )}
              </MapGL>

              {/* Navigation HUD — pitch/elevation steppers, cardinal pan,
                  north reset, defect stepper, keyboard legend. Gated on
                  isRajpur for the same reason the anomaly layers above are:
                  the placeholder map for any other plant has no real
                  geometry for the stepper to walk. See components/
                  NavigationHUD.tsx for why it shifts rather than layers under
                  the detail drawer.

                  Also suppressed while Align is open (alignTarget), and not
                  merely to dodge the z-index collision that surfaced this: the
                  Align panel docks in this exact bottom-right corner and comes
                  with its own MOVE d-pad built for nudging a raster by
                  fractions of a metre, which is a different job at a different
                  scale than this HUD's "walk the site" panning. Running both
                  at once is confusing regardless of who paints on top, and
                  Align is an operator-only flow (isSurveyor), so the person
                  who can open it already has the keyboard nudge in
                  AlignPanel's own listener below — this HUD stepping aside
                  matches the keyboard guard in the keydown handler above,
                  which already refuses to act while alignTarget is set. */}
              {isRajpur && !kmlViewMode && !alignTarget && (
                <NavigationHUD
                  onPan={panCardinal}
                  onPitch={stepPitch}
                  onZoom={stepZoom}
                  onResetNorth={resetNorth}
                  drawerOpen={!isMobile && !!selected}
                  mobileSheetOpen={isMobile && !!selected}
                  pitchEnabled={!isMobile}
                  stepper={{
                    label: stepperDisplay.label,
                    position: stepperDisplay.position,
                    disabled: stepperDisplay.disabled,
                    onPrev: () => stepDefect(-1),
                    onNext: () => stepDefect(1),
                  }}
                />
              )}

              {/* KML View mode badge */}
              {isRajpur && kmlViewMode && (
                <div className="absolute top-2 left-2 bg-ochre text-ochre-fg text-[10px] font-bold mono px-2 py-0.5 flex items-center gap-1 z-10">
                  <MapIcon size={10} /> KML VIEW — SURVEYED PANEL OUTLINES
                </div>
              )}

              {/* Map load error — surfaces silent Mapbox tile/imagery failures instead of a blank map */}
              {mapError && (
                <div className="absolute inset-x-3 top-3 z-30 bg-red-50 border border-red-300 text-red-800 px-3 py-2 text-xs shadow max-w-md">
                  <p className="font-semibold">Satellite imagery not loading</p>
                  <p className="mt-0.5">{mapError}</p>
                </div>
              )}

              {/* Satellite legend */}
              <div className={panelChrome(profile.reduceEffects, "absolute bottom-4 left-4 bg-card/95 border border-border px-3 py-2 text-xs space-y-1.5 shadow backdrop-blur-sm")}>
                {([
                  { l: SEVERITY_LABEL_FULL.critical, s: "critical", note: "Immediate action" },
                  { l: SEVERITY_LABEL_FULL.medium,   s: "medium",   note: "Schedule repair" },
                  { l: SEVERITY_LABEL_FULL.normal,   s: "normal",   note: "No action" },
                ] as const).map(({ l, s, note }) => (
                  <div key={s} className="flex items-center gap-2">
                    {/* Task 5: was a single-colour dot with a white border and a
                        translucent black boxShadow ring bolted on separately —
                        replaced with the same shape-coded, black+white-ringed
                        swatch the map markers and table badges use, so the
                        legend actually teaches the symbol vocabulary rather
                        than a colour-only approximation of it. */}
                    <SeverityShape shape={SEVERITY[s].shape} fill={SEV_COLOR[s]} size={11} pulse={s === "critical"} />
                    <span className="flex-1">{l}</span>
                    <span className="text-[10px] text-muted-foreground">{note}</span>
                    <span className="mono font-semibold tabular-nums w-8 text-right">{visibleCounts[s]}</span>
                  </div>
                ))}
                {/* Stray markers. Never hidden silently: an anomaly the client
                    cannot see is one they cannot act on, so the count and the way
                    back are both always on screen. These are defects whose surveyed
                    position falls outside the overlay's covered area entirely —
                    a registration artefact, not a defect that has moved. Defects
                    sitting in interior road or stitch gaps are *not* counted here
                    and stay visible, because those are correctly placed. */}
                {isSurveyor && isRajpur && activeOverlayIds.length > 0 && strayIds.size > 0 && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <EyeOff size={11} /> {strayIds.size} off-overlay hidden
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug max-w-[190px]">
                      Outside this overlay's coverage — imagery registration, not a
                      moved defect. Still counted in reports.
                    </p>
                  </div>
                )}
                {isRajpur && !kmlViewMode && (
                  <div className="pt-1.5 border-t border-grey-200">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showOutlines}
                        onChange={e => setShowOutlines(e.target.checked)}
                        className="accent-red-600"
                      />
                      <span className="text-muted-foreground">Show Defect Outlines</span>
                    </label>
                  </div>
                )}
                {isRajpur && thermalVisible && !kmlViewMode && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-red-500 font-medium"><Thermometer size={11} /> Thermal IR</div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={thermalOpacity} onChange={e => setThermalOpacity(Number(e.target.value))} className="w-20 accent-red-600" />
                      <span className="mono text-muted-foreground">{Math.round(thermalOpacity * 100)}%</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hideBasemap}
                        onChange={e => setHideBasemap(e.target.checked)}
                        className="accent-red-600"
                      />
                      <span className="text-muted-foreground">Hide basemap</span>
                    </label>
                  </div>
                )}
                {isRajpur && kmlViewMode && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-ochre font-medium"><MapIcon size={11} /> KML — Surveyed Panels</div>
                    <p className="text-[10px] text-muted-foreground">
                      {panelOutlinesGeoJSON.features.length} outlines from defpanels1.kml
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Fill opacity</span>
                      <input type="range" min={0.1} max={1} step={0.05} value={kmlOpacity} onChange={e => setKmlOpacity(Number(e.target.value))} className="w-20 accent-ochre" />
                      <span className="mono text-muted-foreground">{Math.round(kmlOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Align panel */}
              {isRajpur && alignTarget && (
                <AlignPanel
                  targetId={alignTarget}
                  onTarget={id => {
                    setAlignTarget(id);
                    if (id === "thermal") setThermalVisible(true);
                  }}
                  placement={placementOf(alignTarget)}
                  onChange={patch => updatePlacement(alignTarget, patch)}
                  score={alignScore}
                  baseline={baselineScore}
                  presentation={profile.reduceEffects}
                  onClose={() => setAlignTarget(null)}
                />
              )}

              {/* Non-Rajpur info */}
              {!isRajpur && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 border border-grey-200 px-4 py-2.5 text-xs shadow text-center max-w-xs">
                  <p className="font-semibold text-foreground">{selectedPlant.name}</p>
                  <p className="text-muted-foreground mt-0.5">{selectedPlant.location} · {selectedPlant.capacityMW} MW</p>
                  <p className="text-muted-foreground mt-1">Panel-level GPS data available after first inspection.</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Detail drawer (desktop) / Inspection sheet (mobile, Task 6) ──
          Same underlying selection and the same two exits (full detail page,
          WhatsApp share) — see InspectionSheet's own docblock for why mobile
          gets more than a narrower copy of this drawer rather than just a
          resized one. isMobile picks between them rather than CSS alone
          hiding one, because they need incompatible interaction models (a
          click-outside-to-close overlay vs. a drag-to-resize sheet with its
          own backdrop rules per snap depth). */}
      {!isMobile && selected && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside
            onClick={e => e.stopPropagation()}
            className="relative w-full sm:w-[400px] bg-card border-l border-border overflow-y-auto animate-in slide-in-from-right"
          >
            <header className="p-5 border-b border-border flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-grey-400">Panel</p>
                <h3 className="mono text-2xl font-bold">{selected.panelId}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 hover:bg-muted flex items-center justify-center">
                <X size={18} />
              </button>
            </header>
            <div className="p-5 space-y-4">
              <SeverityBadge severity={selected.severity} size="lg" />
              <DataRow label="Anomaly Type" value={selected.type} />
              {selected.deltaT !== null && <DataRow label="ΔT" value={`+${selected.deltaT}°C`} mono critical />}
              <DataRow label="String" value={selected.string} />
              <DataRow label="Inverter" value={selected.inverter} />
              <DataRow label="Status" value={selected.status} />
              <DataRow label="GPS" value={`${selected.gps.lat.toFixed(5)}°N, ${selected.gps.lng.toFixed(5)}°E`} mono />
              <DataRow label="RGB Note" value={selected.rgbNote} />

              <button
                onClick={() => setAuditOpen(true)}
                className="w-full h-10 bg-card border border-border hover:bg-muted text-foreground font-semibold text-sm flex items-center justify-center gap-2"
              >
                <History size={14} /> History & Audit
              </button>
              <Link
                to="/anomalies/$id"
                params={{ id: selected.id }}
                className="w-full h-10 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm flex items-center justify-center gap-2"
              >
                View Full Detail <ArrowRight size={14} />
              </Link>
              <a
                href={buildWhatsAppLink(selected, selectedPlant.name)}
                target="_blank" rel="noreferrer"
                className="w-full h-10 bg-[#25D366] hover:opacity-90 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle size={16} /> Share on WhatsApp
              </a>
            </div>
          </aside>
        </div>
      )}

      {isMobile && selected && (
        <InspectionSheet
          key={selected.id}
          anomaly={selected}
          plantName={selectedPlant.name}
          canEdit={canEditAnomaly}
          onClose={() => setSelected(null)}
          onOpenAudit={() => setAuditOpen(true)}
        />
      )}

      {/* Task 7 — see the module import above and PanelAuditDrawer.tsx's own
          docblock for why this is the one component on the page loaded via
          dynamic import() instead of a normal top-of-file one. The fallback
          is intentionally minimal (a spinner over the same dark scrim the
          real drawer opens with) since the chunk is small and this is a
          click-triggered load, not a page-load one — there is nothing else
          useful to show for what should typically resolve in well under a
          second. */}
      {auditOpen && selected && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        }>
          <PanelAuditDrawer
            anomaly={selected}
            canEdit={canEditAnomaly}
            canExport={canExportReports}
            onClose={() => setAuditOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Should off-overlay markers be suppressed at all for the overlays now on screen?
 *
 * This is a judgement call about honesty, not a rendering detail, which is why it
 * is one named function rather than a condition buried in a memo.
 *
 * The numbers it has to arbitrate, measured against the surveyed KML centroids:
 *
 *     thermal IR   25 strays of 347   ( 7%)  — registration is sound, a few edges drift
 *     visual V1   142 strays of 347   (41%)  — carries essentially no registration
 *     visual V2   112 strays of 347   (32%)
 *
 * Suppressing 25 markers tidies up an otherwise trustworthy map. Suppressing 142
 * hides a third of the plant's defects to flatter an overlay that is known to be
 * unregistered — arguably the map should look broken there, because it is.
 *
 * Policy settled 2026-08-13: unconditional, and no longer operator-toggleable.
 * The deciding argument is that a marker outside the raster is not a defect the
 * imagery can evidence — whatever its coordinate claims, nothing on screen backs
 * it up — so drawing it invites the client to read scrubland as a fault. The
 * honesty requirement is met by the sidebar's "N of 347 shown", which moves as
 * overlays are toggled, rather than by drawing markers we cannot substantiate.
 *
 * The V1/V2 case stays ugly, and should: switching them on visibly drops a third
 * of the defects, which is the correct signal that those two rasters carry no
 * registration. Fixing that needs source georeferencing, not a display rule.
 */
function suppressionApplies(
  activeOverlayIds: string[],
  strayCount: number,
  totalCount: number,
): boolean {
  void strayCount;
  void totalCount;
  return activeOverlayIds.length > 0;
}

// ─── Align panel ──────────────────────────────────────────────────────────────

/** Nudge steps. 0.1 m is finer than the 1.155 m panel width, so the bottom of the
 *  range can resolve better than a single module; 10 m moves about two rack pitches
 *  for getting into the right neighbourhood quickly. */
const NUDGE_STEPS = [0.1, 0.5, 1, 5, 10];

/**
 * How good is good enough to trust for client reporting?
 *
 * Deliberately a single named function rather than thresholds scattered through
 * the JSX, because this is a policy decision about what the portal is willing to
 * present as measured. The thermal baseline scores ~86% on data; V1 scores ~26%,
 * which is indistinguishable from the ~25% you would get by dropping the image on
 * the map at random.
 */
function alignmentVerdict(score: AlignmentScore | null): {
  label: string;
  tone: string;
} {
  if (!score) return { label: "no coverage data", tone: "text-muted-foreground" };
  if (score.onData >= 95) return { label: "panel-accurate", tone: "text-emerald-600" };
  if (score.onData >= 85) return { label: "within a panel row", tone: "text-emerald-600" };
  if (score.onData >= 60) return { label: "approximate", tone: "text-amber-600" };
  return { label: "carries no registration", tone: "text-red-600" };
}

function AlignPanel({
  targetId, onTarget, placement, onChange, score, baseline, onClose, presentation,
}: {
  targetId: string;
  onTarget: (id: string) => void;
  placement: Placement;
  onChange: (patch: Partial<Placement>) => void;
  score: AlignmentScore | null;
  baseline: AlignmentScore | null;
  onClose: () => void;
  /** Screen-share profile — see panelChrome in lib/defect-overlay.ts. */
  presentation: boolean;
}) {
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const def = OVERLAYS[targetId];
  const verdict = alignmentVerdict(score);

  const nudge = useCallback((de: number, dn: number) => {
    onChange({ dx: placement.dx + de * step, dy: placement.dy + dn * step });
  }, [onChange, placement.dx, placement.dy, step]);

  // Arrow keys move the raster. Bound on window rather than the panel so the
  // operator can keep the cursor over the map — which is where they are looking —
  // instead of having to keep focus inside the control panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      };
      const m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      nudge(m[0], m[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toSourceSnippet(def, placement));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const delta = score && baseline ? score.onData - baseline.onData : 0;

  return (
    <div className={panelChrome(presentation, "absolute top-2 right-2 z-20 w-64 bg-card/97 border border-violet-400 shadow-lg backdrop-blur-sm text-xs")}>
      <div className="flex items-center justify-between px-3 py-2 bg-violet-600 text-white">
        <span className="font-bold flex items-center gap-1.5"><Crosshair size={12} /> ALIGN OVERLAY</span>
        <button onClick={onClose} className="hover:opacity-70"><X size={13} /></button>
      </div>

      <div className="p-3 space-y-3">
        <select
          value={targetId}
          onChange={e => onTarget(e.target.value)}
          className="w-full h-8 px-2 border border-border bg-card text-foreground text-xs"
        >
          {Object.values(OVERLAYS).map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>

        {/* Score. The comparison against the committed baseline is the point: it
            tells the operator whether their hand alignment is actually an
            improvement, rather than just different. */}
        <div className="border border-border p-2 space-y-1 bg-muted/40">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">On panel data</span>
            <span className="mono font-bold text-sm">
              {score ? `${score.onData.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">vs baseline</span>
            <span className={`mono ${delta > 0.05 ? "text-emerald-600" : delta < -0.05 ? "text-red-600" : "text-muted-foreground"}`}>
              {score && baseline ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts` : "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Strays</span>
            <span className="mono">{score ? `${score.strays} / ${score.total}` : "—"}</span>
          </div>
          <p className={`pt-1 border-t border-grey-200 font-medium ${verdict.tone}`}>{verdict.label}</p>
        </div>

        {/* Nudge pad */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-grey-400">Move</span>
            <select
              value={step}
              onChange={e => setStep(Number(e.target.value))}
              className="h-6 px-1 border border-border bg-card text-[10px] mono"
            >
              {NUDGE_STEPS.map(s => <option key={s} value={s}>{s} m</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
            <span />
            <button onClick={() => nudge(0, 1)} className="h-7 border border-border hover:bg-muted">↑</button>
            <span />
            <button onClick={() => nudge(-1, 0)} className="h-7 border border-border hover:bg-muted">←</button>
            <button
              onClick={() => onChange({ dx: 0, dy: 0 })}
              title="Recentre"
              className="h-7 border border-border hover:bg-muted flex items-center justify-center"
            >
              <Crosshair size={11} />
            </button>
            <button onClick={() => nudge(1, 0)} className="h-7 border border-border hover:bg-muted">→</button>
            <span />
            <button onClick={() => nudge(0, -1)} className="h-7 border border-border hover:bg-muted">↓</button>
            <span />
          </div>
          <p className="mono text-[10px] text-muted-foreground text-center mt-1">
            {placement.dx.toFixed(1)} m E · {placement.dy.toFixed(1)} m N
          </p>
        </div>

        <SliderRow
          label="Scale" value={placement.scale} min={0.8} max={1.25} step={0.0005}
          onChange={v => onChange({ scale: v })} format={v => `${(v * 100).toFixed(2)}%`}
        />
        <SliderRow
          label="Rotation" value={placement.rotation} min={-5} max={5} step={0.01}
          onChange={v => onChange({ rotation: v })} format={v => `${v.toFixed(2)}°`}
        />

        <div className="flex gap-1.5 pt-1">
          <button
            onClick={() => onChange({ ...IDENTITY })}
            className="flex-1 h-7 border border-border hover:bg-muted flex items-center justify-center gap-1"
          >
            <RotateCcw size={11} /> Reset
          </button>
          <button
            onClick={copy}
            title="Copy these corners for pasting into overlay-registration.ts"
            className="flex-1 h-7 border border-border hover:bg-muted flex items-center justify-center gap-1"
          >
            <Copy size={11} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug border-t border-grey-200 pt-2">
          Match the raster's panel rows to the <span className="text-cyan-500 font-medium">cyan</span> surveyed
          outlines. Arrow keys nudge. Saved locally as you go — use Copy to promote a
          final alignment into <span className="mono">overlay-registration.ts</span>.
        </p>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] uppercase tracking-widest text-grey-400">{label}</span>
        <span className="mono text-[10px] text-muted-foreground">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-violet-600"
      />
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange?: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-grey-400">{label}</label>
      <select
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className="mt-1.5 w-full h-9 px-3 border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ochre"
      >
        {options.map(o => (
          <option key={o} value={o}>{o === "all" ? `All ${label}s` : o}</option>
        ))}
      </select>
    </div>
  );
}

function DataRow({ label, value, mono, critical }: {
  label: string; value: string; mono?: boolean; critical?: boolean;
}) {
  return (
    <div className="flex items-start justify-between border-b border-grey-200 pb-2 gap-2">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-right ${mono ? "mono" : ""} ${critical ? "text-critical" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

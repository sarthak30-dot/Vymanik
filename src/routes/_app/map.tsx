import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  X, ArrowRight, MessageCircle, Thermometer, Layers,
  SplitSquareHorizontal, Navigation, Download, Map as MapIcon,
  Crosshair, RotateCcw, Copy, EyeOff,
} from "lucide-react";
import {
  anomalies, anomalyTypes, plant, anomalyCounts, SEVERITY_LABEL_FULL,
  type Anomaly, type Severity,
} from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";
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
import MapGL, {
  Marker, Popup, Source, Layer, NavigationControl,
  type MapRef, type ViewState,
} from "react-map-gl/mapbox";
import type { ExpressionSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ─── Drone orthomosaic placement ──────────────────────────────────────────────

// Corners now live in src/lib/overlay-registration.ts, as a baseline rectangle
// plus an operator-adjustable similarity transform. They moved out of here
// because a hardcoded constant cannot be corrected without a redeploy, and these
// corners are not measurements — they are the best available guess.
//
// Why they can only ever be a guess: exporting the orthomosaic to PNG discarded
// its georeferencing (a GeoTIFF holds tie-points in its tags, a PNG has nowhere to
// put them), and the usual fallback of matching the raster against satellite
// imagery is closed too, because Maxar's coverage of this site predates
// construction — the basemap is bare scrub with no array to align to.
//
// scripts/fit_thermal_bounds.py recovered the thermal baseline by fitting against
// the 347 surveyed defect coordinates and reached 87% of them on a data pixel.
// That is the ceiling, not a stopping point chosen for convenience: re-solving
// with a fourth parameter (rotation) and a signed-distance objective instead of
// raw hit rate lands on 87.0% and 0.077° — the same answer. The information is
// not in the PNG.
//
// So the remaining 13% is split, and the split matters:
//   * 25 defects sit in genuine interior gaps — roads and stitching holes, which
//     account for 11.8% of the array outline. Those markers are correctly placed.
//   * 23 defects (6.6%) fall outside the array outline. Those are real
//     misregistration, and they are what the Align tool exists to fix by hand.
//
// The V1/V2 baselines were never derived from source georeferencing at all: only
// 26.5% of surveyed defects land on a panel pixel in V1, against 25.1% expected
// from random placement, so that registration carries no information whatsoever.
// Re-fitting reaches ~51% — enough to show signal, not enough to trust — which is
// why they need aligning by hand rather than by another fit.
//
// Replace the baselines with GeoTIFF tie-points the moment a .tif surfaces.

// The raw stitcher output letterboxes the flight footprint onto a white canvas,
// and a Mapbox image source georeferences that filler right along with the data —
// which is why the overlay used to sit on the satellite view as an opaque box.
// scripts/clean_orthomosaic.py alpha-cuts the filler, upscales 2x and sharpens.
// Canvas proportions are preserved, so the baseline still applies unchanged.
const THERMAL_IMAGE = OVERLAYS.thermal.url;

// Applied to the thermal raster on top of the per-layer opacity. Range is -1..1
// for both; 0 is untouched source. See the tuning note in the legend panel below.
// Pushed up from 0.15/0.2 so the magma ramp separates warm modules from warm sand
// at overview zoom — the previous values were tuned when the layer sat at partial
// opacity over satellite, and read as washed out now that it loads at full.
const THERMAL_CONTRAST   = 0.30;
const THERMAL_SATURATION = 0.45;

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

// A surveyed module is 1.19 m x 2.29 m. Map resolution at this latitude works out
// to ~1.05 m/px at z17, so on the default overview a panel covers roughly 1x2
// pixels — far too small to see, which is why anomalies are drawn as fixed-size
// dots there. By z19.5 a panel is ~9x17 px and can carry its own true outline, so
// the dots hand over to the real KML footprints across this range. The dot is a
// locator; the footprint is the measurement.
const PANEL_DOT_MAX_ZOOM  = 18.5;
const PANEL_FILL_MIN_ZOOM = 19.5;

// Dot geometry, sized against the module rather than picked by eye.
//
// Ground resolution at this latitude is 156543.03 * cos(28.2568°) / 2^zoom, i.e.
// 137_850 / 2^zoom m/px. A module is 1.19 m across, so the radius that makes a dot
// exactly fill the tile it marks is 0.5 * 1.19 * 2^zoom / 137_850:
//
//     z17 -> 0.57 px    z18 -> 1.13 px    z19 -> 2.26 px    z19.5 -> 3.20 px
//
// Below ~z18 that is sub-pixel, so a to-scale dot would simply not render. The
// ramp below tracks module width at the top of the range — where the dot is about
// to hand over to the real KML footprint and being to-scale actually matters — and
// floors at ~1.4 px lower down, where the dot stops claiming to be the panel and
// is only a locator. Note circle-stroke-width extends *outward* from the radius,
// so drawn width is 2 * (radius + stroke); the stroke is kept hairline because it
// was previously adding 3.5 px to a 12 px dot.
// Critical stays a touch larger so triage still reads at a glance; even at 1.25x
// this is ~2.7x narrower than the 15.5 px the layer drew before.
//
// The severity scale is applied per stop rather than as ["*", scale, ramp]:
// Mapbox requires a "zoom" expression to be the outermost expression of a paint
// property, because it evaluates the property once per integer zoom and
// interpolates between those results — which it cannot do if the zoom curve is
// nested inside an arithmetic operator. Nesting it throws
// "zoom expression may only be used as input to a top-level step or interpolate"
// and drops the whole layer.
const dotRadius = (px: number): ExpressionSpecification =>
  ["match", ["get", "severity"], "critical", px * 1.25, "medium", px * 1.1, px];

const DOT_RADIUS_BY_ZOOM: ExpressionSpecification = [
  "interpolate", ["exponential", 2], ["zoom"],
  14,   dotRadius(1.4),
  17,   dotRadius(1.8),
  18.5, dotRadius(2.2),
  19.5, dotRadius(2.6),
];
const DOT_STROKE_BY_ZOOM: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"],
  14, 0.5,
  19, 0.8,
];

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

// Approximate plant boundary for the satellite overview polygon
const PLANT_BOUNDARY_COORDS = [
  [73.033843, 28.261343], [73.043200, 28.261343],
  [73.043200, 28.254336], [73.033843, 28.254336],
  [73.033843, 28.261343],
] as [number,number][];

// ─── Panel grid constants ─────────────────────────────────────────────────────

const PLANT_COLS = 26;
const PLANT_ROWS = Math.ceil(plant.totalPanels / PLANT_COLS); // 733

const SEV_COLOR: Record<string, string> = {
  critical: "#ef4444",
  medium:   "#f59e0b",
  normal:   "#22c55e",
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
 *  229 frames cover 347 anomalies, so a miss is normal rather than exceptional. */
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

  const [filters, setFilters]   = useState<Record<string, boolean>>({ critical: true, medium: true, normal: true, nodata: true });
  const [selected, setSelected] = useState<Anomaly | null>(null);
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
  // V1/V2 default to off for LAYER-STACKING reasons only — their registration is
  // correct. Both draw after the thermal at full opacity, so defaulting them on
  // would simply hide the layer this page exists to show. Use the toggles.
  //
  // 2026-08-13: the old justification here — "only 26.5% of surveyed defects land
  // on a panel pixel in V1 against 25.1% from random placement, so the registration
  // carries no information" — was WRONG, and is corrected rather than deleted
  // because it nearly triggered a pointless re-fit. That metric was measuring
  // partial coverage, not misregistration: V1's footprint geometrically contains
  // only 61.5% of the surveyed defects and V2's 74.1%, because each covers just
  // part of the site. Multiply by the ~53%/47% non-padding fraction and 26.5%
  // falls straight out. The source GeoTIFFs have since been found and both
  // baselines match their tie-points exactly. Do not re-fit these.
  const [rgbVisible, setRgbVisible]         = useState(false);
  const [rgb2Visible, setRgb2Visible]       = useState(false);
  const [thermalOpacity, setThermalOpacity] = useState(1);
  const [hideBasemap, setHideBasemap]       = useState(false);
  const [hoveringAnomaly, setHoveringAnomaly] = useState(false);
  // Full opacity now that these carry a real alpha footprint. The old 0.90 was
  // compensating for the letterbox: knocking the whole layer back made the opaque
  // white border less offensive, at the cost of muddying the actual imagery.
  const [rgbOpacity, setRgbOpacity]         = useState(1);
  const [rgb2Opacity, setRgb2Opacity]       = useState(1);
  const [compareMode, setCompareMode]       = useState(false);
  // KML View is a standalone mode — surveyed panel outlines on their own,
  // instead of mixed into the Original/V1/V2 overlay toggles.
  const [kmlViewMode, setKmlViewMode]       = useState(false);
  const [kmlOpacity, setKmlOpacity]         = useState(0.45);
  const [splitPct, setSplitPct]             = useState(50);
  const [popup, setPopup]                   = useState<Anomaly | null>(null);
  const [mapError, setMapError]             = useState<string | null>(null);
  const [viewState, setViewState]           = useState<Omit<ViewState, "width"|"height">>({
    longitude: 73.0385, latitude: 28.2568, zoom: 17,
    bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const mapRef     = useRef<MapRef>(null);
  const dragging   = useRef(false);
  const pinchRef   = useRef<number | null>(null);

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
  // silent — the sidebar always reports "N of 347 shown".

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

  // Which overlays are actually drawn right now. A defect is only a "stray" if it
  // falls outside *all* of them — one covered by V1 but not by IR must not vanish
  // the moment both are switched on.
  const activeOverlayIds = useMemo(() => {
    if (kmlViewMode) return [];
    return [
      thermalVisible ? "thermal" : null,
      rgbVisible ? "rgb" : null,
      rgb2Visible ? "rgb2" : null,
    ].filter(Boolean) as string[];
  }, [kmlViewMode, thermalVisible, rgbVisible, rgb2Visible]);

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

  // Surveyed panel outlines (Block20_1GV_4.kml) — real footprints, not estimated positions.
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
      properties: { severity: a.severity, anomalyId: a.id },
    })),
  }), [visibleAnomalies]);

  const anomalyById = useMemo(
    () => new Map(anomalies.map(a => [a.id, a])),
    [],
  );

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

  // Shared by the dot, fill and outline layers so one severity palette drives all three.
  const severityColour: ExpressionSpecification = [
    "match", ["get", "severity"],
    "critical", SEV_COLOR.critical,
    "medium",   SEV_COLOR.medium,
    "normal",   SEV_COLOR.normal,
    SEV_COLOR.nodata,
  ];

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
                  title="Compare thermal vs visual"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    compareMode ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <SplitSquareHorizontal size={13} /> Compare
                </button>

                {isSurveyor && (
                <button
                  onClick={() => { setKmlViewMode(v => !v); setCompareMode(false); }}
                  title="View surveyed panel outlines from drone KML on their own, separate from the Original/V1/V2 overlays"
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
                    if (next === "thermal") setThermalVisible(true);
                    if (next === "rgb") setRgbVisible(true);
                    if (next === "rgb2") setRgb2Visible(true);
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
                    <button onClick={() => setRgbVisible(v => !v)} className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${rgbVisible ? "bg-emerald-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                      <Layers size={13} /> V1
                    </button>
                    <button onClick={() => setRgb2Visible(v => !v)} className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${rgb2Visible ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                      <Layers size={13} /> V2
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

              {/* Right: RGB */}
              <div className="relative overflow-hidden flex-1">
                <MapGL
                  mapboxAccessToken={MAPBOX_TOKEN}
                  longitude={viewState.longitude} latitude={viewState.latitude}
                  zoom={viewState.zoom} bearing={viewState.bearing} pitch={viewState.pitch}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                >
                  <Source id="cmp-rgb" type="image" url={OVERLAYS.rgb.url} coordinates={cornersOf("rgb")}>
                    <Layer id="cmp-rgb-layer" type="raster" paint={{ "raster-opacity": 1, "raster-resampling": RASTER_RESAMPLING }} />
                  </Source>
                  <Source id="cmp-rgb2" type="image" url={OVERLAYS.rgb2.url} coordinates={cornersOf("rgb2")}>
                    <Layer id="cmp-rgb2-layer" type="raster" paint={{ "raster-opacity": 1, "raster-resampling": RASTER_RESAMPLING }} />
                  </Source>
                </MapGL>
                <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold mono px-2 py-0.5 flex items-center gap-1">
                  <Layers size={10} /> VISUAL RGB
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
                initialViewState={{ longitude: 73.0385, latitude: 28.2568, zoom: isRajpur ? 17 : 14 }}
                key={selectedPlant.id}
                style={{ width: "100%", height: "100%" }}
                mapStyle={thermalVisible && hideBasemap && !kmlViewMode
                  ? BLANK_BASEMAP_STYLE
                  : "mapbox://styles/mapbox/satellite-streets-v12"}
                interactiveLayerIds={isRajpur && !kmlViewMode ? ["anomaly-dot", "anomaly-panel-fill"] : undefined}
                cursor={hoveringAnomaly ? "pointer" : undefined}
                onMouseEnter={() => setHoveringAnomaly(true)}
                onMouseLeave={() => setHoveringAnomaly(false)}
                onClick={e => {
                  // With interactiveLayerIds set, a click that landed on an anomaly
                  // arrives with the hit features attached; anything else is a click
                  // on empty map and should dismiss the popup.
                  const hit = e.features?.[0];
                  const anomaly = hit && anomalyById.get(String(hit.properties?.anomalyId));
                  if (!anomaly) { setPopup(null); return; }
                  setSelected(anomaly);
                  setPopup(anomaly);
                  mapRef.current?.flyTo({ center: [anomaly.gps.lng, anomaly.gps.lat], zoom: 20, duration: 700 });
                }}
                onLoad={() => setMapError(null)}
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
                    <Source id="anomaly-panels" type="geojson" data={panelOutlinesGeoJSON as never}>
                      <Layer id="anomaly-panel-fill" type="fill" paint={{
                        "fill-color": severityColour,
                        "fill-opacity": ["interpolate", ["linear"], ["zoom"], PANEL_DOT_MAX_ZOOM, 0, PANEL_FILL_MIN_ZOOM, 0.75],
                      }} />
                      <Layer id="anomaly-panel-line" type="line" paint={{
                        "line-color": severityColour,
                        "line-width": 1.5,
                        "line-opacity": ["interpolate", ["linear"], ["zoom"], PANEL_DOT_MAX_ZOOM, 0, PANEL_FILL_MIN_ZOOM, 1],
                      }} />
                    </Source>

                    <Source id="anomaly-points" type="geojson" data={anomalyPointsGeoJSON as never}>
                      <Layer id="anomaly-dot" type="circle" paint={{
                        "circle-color": severityColour,
                        "circle-radius": DOT_RADIUS_BY_ZOOM,
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-width": DOT_STROKE_BY_ZOOM,
                        // Hands over to the panel fill rather than stacking on top of it.
                        "circle-opacity": ["interpolate", ["linear"], ["zoom"], PANEL_DOT_MAX_ZOOM, 1, PANEL_FILL_MIN_ZOOM, 0],
                        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], PANEL_DOT_MAX_ZOOM, 1, PANEL_FILL_MIN_ZOOM, 0],
                      }} />
                    </Source>
                  </>
                )}

                {/* Drone orthomosaic overlays — suppressed in KML View, which shows outlines on their own.
                    `beforeId` keeps them underneath the anomaly layers no matter what order
                    the user toggles IR / V1 / V2 in. */}
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
                {isRajpur && rgbVisible && !kmlViewMode && (
                  <Source id="rgb" type="image" url={OVERLAYS.rgb.url} coordinates={cornersOf("rgb")}>
                    <Layer id="rgb-layer" type="raster" beforeId="anomaly-panel-fill" paint={{ "raster-opacity": rgbOpacity, "raster-resampling": RASTER_RESAMPLING, "raster-fade-duration": 0 }} />
                  </Source>
                )}
                {isRajpur && rgb2Visible && !kmlViewMode && (
                  <Source id="rgb2" type="image" url={OVERLAYS.rgb2.url} coordinates={cornersOf("rgb2")}>
                    <Layer id="rgb2-layer" type="raster" beforeId="anomaly-panel-fill" paint={{ "raster-opacity": rgb2Opacity, "raster-resampling": RASTER_RESAMPLING, "raster-fade-duration": 0 }} />
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

                {/* Surveyed panel outlines — real footprints from Block20_1GV_4.kml — only in KML View */}
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
              <div className="absolute bottom-4 left-4 bg-card/95 border border-border px-3 py-2 text-xs space-y-1.5 shadow backdrop-blur-sm">
                {([
                  { l: SEVERITY_LABEL_FULL.critical, s: "critical", note: "Immediate action" },
                  { l: SEVERITY_LABEL_FULL.medium,   s: "medium",   note: "Schedule repair" },
                  { l: SEVERITY_LABEL_FULL.normal,   s: "normal",   note: "No action" },
                ] as const).map(({ l, s, note }) => (
                  <div key={s} className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", backgroundColor: SEV_COLOR[s], border: "1.5px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.2)" }} />
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
                {isRajpur && rgbVisible && !kmlViewMode && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-medium"><Layers size={11} /> Visual V1 (east)</div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={rgbOpacity} onChange={e => setRgbOpacity(Number(e.target.value))} className="w-20 accent-emerald-600" />
                      <span className="mono text-muted-foreground">{Math.round(rgbOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
                {isRajpur && rgb2Visible && !kmlViewMode && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-blue-600 font-medium"><Layers size={11} /> Visual V2 (west)</div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={rgb2Opacity} onChange={e => setRgb2Opacity(Number(e.target.value))} className="w-20 accent-blue-600" />
                      <span className="mono text-muted-foreground">{Math.round(rgb2Opacity * 100)}%</span>
                    </div>
                  </div>
                )}
                {isRajpur && kmlViewMode && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-ochre font-medium"><MapIcon size={11} /> KML — Surveyed Panels</div>
                    <p className="text-[10px] text-muted-foreground">
                      {panelOutlinesGeoJSON.features.length} outlines from Block20_1GV_4.kml
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
                    if (id === "rgb") setRgbVisible(true);
                    if (id === "rgb2") setRgb2Visible(true);
                  }}
                  placement={placementOf(alignTarget)}
                  onChange={patch => updatePlacement(alignTarget, patch)}
                  score={alignScore}
                  baseline={baselineScore}
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

      {/* ── Detail drawer ── */}
      {selected && (
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
  targetId, onTarget, placement, onChange, score, baseline, onClose,
}: {
  targetId: string;
  onTarget: (id: string) => void;
  placement: Placement;
  onChange: (patch: Partial<Placement>) => void;
  score: AlignmentScore | null;
  baseline: AlignmentScore | null;
  onClose: () => void;
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
    <div className="absolute top-2 right-2 z-20 w-64 bg-card/97 border border-violet-400 shadow-lg backdrop-blur-sm text-xs">
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

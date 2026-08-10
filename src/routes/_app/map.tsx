import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import {
  X, ArrowRight, MessageCircle, Thermometer, Layers,
  SplitSquareHorizontal, Navigation, Download, Map as MapIcon,
} from "lucide-react";
import { anomalies, anomalyTypes, plant, severityCounts, SEVERITY_LABEL, type Anomaly, type Severity } from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";
import { usePlantContext } from "@/lib/plant-context";
import { buildAnomaliesKML, downloadKML } from "@/lib/kml";
import { parseDefectImage } from "@/lib/defect-image";
import MapGL, {
  Marker, Popup, Source, Layer, NavigationControl,
  type MapRef, type ViewState,
} from "react-map-gl/mapbox";
import type { ExpressionSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ─── Drone orthomosaic bounds (correctly georeferenced) ───────────────────────

// Exporting the orthomosaic to PNG discarded its georeferencing — a GeoTIFF holds
// tie-points in its tags, a PNG has nowhere to put them. The usual fallback of
// matching the raster against satellite imagery is unavailable too: Maxar's
// coverage of this site predates construction, so the basemap here is bare scrub
// with no array to align to.
//
// These corners are therefore *solved*, not measured — see
// scripts/fit_thermal_bounds.py. It registers the raster against the only ground
// truth available, the 347 surveyed defect coordinates, under two physical
// constraints: an orthomosaic has square ground pixels, and 347 defects spread
// over 224 of the 733 racks must span substantially the whole array. The fit puts
// 87% of defect coordinates on a data pixel at 0.5625 m/px.
//
// The previous corners spanned 917 x 775 m against a true footprint of 575 x 431 m
// — the raster was blown up ~1.6x per axis and offset, which is why the array in
// the overlay never lined up with the anomaly markers drawn on top of it.
//
// Accurate to roughly a panel row. Replace with the GeoTIFF tie-points the moment
// the .tif surfaces; do not hand-nudge these.
const THERMAL_BOUNDS = {
  coordinates: [
    [73.036467, 28.258982], [73.042336, 28.258982],
    [73.042336, 28.255081], [73.036467, 28.255081],
  ] as [[number,number],[number,number],[number,number],[number,number]],
};
const RGB_BOUNDS = {
  coordinates: [
    [73.037842, 28.257479], [73.042711, 28.257479],
    [73.042711, 28.254353], [73.037842, 28.254353],
  ] as [[number,number],[number,number],[number,number],[number,number]],
};
const RGB2_BOUNDS = {
  coordinates: [
    [73.035136, 28.259860], [73.041713, 28.259860],
    [73.041713, 28.256497], [73.035136, 28.256497],
  ] as [[number,number],[number,number],[number,number],[number,number]],
};

// The raw stitcher output letterboxes the flight footprint onto a white canvas,
// and a Mapbox image source georeferences that filler right along with the data —
// which is why the overlay used to sit on the satellite view as an opaque box.
// scripts/clean_orthomosaic.py alpha-cuts the filler, upscales 2x and sharpens.
// Canvas proportions are preserved, so THERMAL_BOUNDS still applies unchanged.
const THERMAL_IMAGE = "/thermal_block20_clean.png";

// Applied to the thermal raster on top of the per-layer opacity. Range is -1..1
// for both; 0 is untouched source. See the tuning note in the legend panel below.
const THERMAL_CONTRAST   = 0.15;
const THERMAL_SATURATION = 0.2;

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

  const [filters, setFilters]   = useState<Record<string, boolean>>({ critical: true, medium: true, normal: true, nodata: true });
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter]         = useState("all");
  const [stringFilter, setStringFilter]     = useState("all");
  const [inverterFilter, setInverterFilter] = useState("all");

  // Satellite state
  const [thermalVisible, setThermalVisible] = useState(false);
  // V1/V2 default to off. Their corner coordinates were never derived from source
  // georeferencing and do not survive checking: only 26.5% of surveyed defects land
  // on a panel pixel in V1, against 25.1% expected from random placement — i.e. the
  // registration carries no information. Re-fitting against the defect coordinates
  // (scripts/fit_thermal_bounds.py, same method) only reaches ~51%, enough to show
  // signal but not enough to trust at panel accuracy, so the bounds are left alone
  // rather than replaced with a different wrong number. The layers stay available
  // behind their toggles; they just no longer load misaligned on top of a corrected
  // thermal. Fix properly by re-exporting these as GeoTIFF and reading the tie-points.
  const [rgbVisible, setRgbVisible]         = useState(false);
  const [rgb2Visible, setRgb2Visible]       = useState(false);
  const [thermalOpacity, setThermalOpacity] = useState(1);
  const [hideBasemap, setHideBasemap]       = useState(false);
  const [hoveringAnomaly, setHoveringAnomaly] = useState(false);
  const [rgbOpacity, setRgbOpacity]         = useState(0.90);
  const [rgb2Opacity, setRgb2Opacity]       = useState(0.90);
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

  const visibleAnomalies = useMemo(() => {
    if (!isRajpur) return [];
    return anomalies.filter(a =>
      filters[a.severity] &&
      (typeFilter     === "all" || a.type     === typeFilter) &&
      (inverterFilter === "all" || a.inverter === inverterFilter) &&
      (stringFilter   === "all" || a.string   === stringFilter),
    );
  }, [isRajpur, filters, typeFilter, inverterFilter, stringFilter]);

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
            { key: "critical", label: SEVERITY_LABEL.critical, dotColor: SEV_COLOR.critical, count: severityCounts.critical, color: "text-critical" },
            { key: "medium",   label: SEVERITY_LABEL.medium,   dotColor: SEV_COLOR.medium,   count: severityCounts.medium,   color: "text-medium" },
            { key: "normal",   label: SEVERITY_LABEL.normal,   dotColor: SEV_COLOR.normal,   count: severityCounts.normal,   color: "text-normal" },
            { key: "nodata",   label: "No Data",   dotColor: "#6b7280",          count: severityCounts.nodata,   color: "text-muted-foreground" },
          ] as const).map(f => (
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

                <button
                  onClick={() => { setKmlViewMode(v => !v); setCompareMode(false); }}
                  title="View surveyed panel outlines from drone KML on their own, separate from the Original/V1/V2 overlays"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    kmlViewMode ? "bg-ochre text-ochre-fg border-ochre" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <MapIcon size={13} /> KML View
                </button>

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

            <button
              onClick={exportKML}
              title="Download plant boundary and visible anomalies as a .kml file for Google Earth"
              className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium border border-border bg-card text-muted-foreground hover:bg-muted"
            >
              <Download size={13} /> Export KML
            </button>

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
                  <Source id="cmp-thermal" type="image" url={THERMAL_IMAGE} coordinates={THERMAL_BOUNDS.coordinates}>
                    <Layer id="cmp-thermal-layer" type="raster" paint={{
                      "raster-opacity": 1,
                      "raster-resampling": "nearest",
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
                  <Source id="cmp-rgb" type="image" url="/rgb_block20.png" coordinates={RGB_BOUNDS.coordinates}>
                    <Layer id="cmp-rgb-layer" type="raster" paint={{ "raster-opacity": 0.90 }} />
                  </Source>
                  <Source id="cmp-rgb2" type="image" url="/rgb2_block20.png" coordinates={RGB2_BOUNDS.coordinates}>
                    <Layer id="cmp-rgb2-layer" type="raster" paint={{ "raster-opacity": 0.90 }} />
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
                  <Source id="thermal" type="image" url={THERMAL_IMAGE} coordinates={THERMAL_BOUNDS.coordinates}>
                    <Layer id="thermal-layer" type="raster" beforeId="anomaly-panel-fill" paint={{
                      "raster-opacity": thermalOpacity,
                      // The site is ~900 m across, so past roughly z18 the map is
                      // magnifying the raster beyond 1:1. Mapbox defaults to
                      // "linear", which blends neighbouring panel rows together
                      // exactly when you have zoomed in to inspect them; "nearest"
                      // keeps the row/gap boundaries hard.
                      "raster-resampling": "nearest",
                      "raster-contrast": THERMAL_CONTRAST,
                      "raster-saturation": THERMAL_SATURATION,
                      "raster-fade-duration": 300,
                    }} />
                  </Source>
                )}
                {isRajpur && rgbVisible && !kmlViewMode && (
                  <Source id="rgb" type="image" url="/rgb_block20.png" coordinates={RGB_BOUNDS.coordinates}>
                    <Layer id="rgb-layer" type="raster" beforeId="anomaly-panel-fill" paint={{ "raster-opacity": rgbOpacity, "raster-fade-duration": 300 }} />
                  </Source>
                )}
                {isRajpur && rgb2Visible && !kmlViewMode && (
                  <Source id="rgb2" type="image" url="/rgb2_block20.png" coordinates={RGB2_BOUNDS.coordinates}>
                    <Layer id="rgb2-layer" type="raster" beforeId="anomaly-panel-fill" paint={{ "raster-opacity": rgb2Opacity, "raster-fade-duration": 300 }} />
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
                          textTransform: "uppercase", borderRadius: 2,
                        }}>{SEVERITY_LABEL[popup.severity]}</span>
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
                  { l: SEVERITY_LABEL.critical, s: "critical" },
                  { l: SEVERITY_LABEL.medium, s: "medium" },
                  { l: SEVERITY_LABEL.normal, s: "normal" },
                ] as const).map(({ l, s }) => (
                  <div key={s} className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", backgroundColor: SEV_COLOR[s], border: "1.5px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.2)" }} />
                    <span>{l}</span>
                  </div>
                ))}
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

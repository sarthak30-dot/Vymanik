import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import {
  X, ArrowRight, MessageCircle, Thermometer, Layers,
  SplitSquareHorizontal, Navigation, AlertTriangle, Download, Square,
} from "lucide-react";
import { anomalies, anomalyTypes, plant, severityCounts, type Anomaly, type Severity } from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";
import { usePlantContext } from "@/lib/plant-context";
import { buildAnomaliesKML, downloadKML } from "@/lib/kml";
import MapGL, {
  Marker, Popup, Source, Layer, NavigationControl,
  type MapRef, type ViewState,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

// ─── Drone orthomosaic bounds (correctly georeferenced) ───────────────────────

const THERMAL_BOUNDS = {
  coordinates: [
    [73.033843, 28.261343], [73.043200, 28.261343],
    [73.043200, 28.254336], [73.033843, 28.254336],
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
  const [rgbVisible, setRgbVisible]         = useState(true);
  const [rgb2Visible, setRgb2Visible]       = useState(true);
  const [panelsVisible, setPanelsVisible]   = useState(true);
  const [thermalOpacity, setThermalOpacity] = useState(0.75);
  const [rgbOpacity, setRgbOpacity]         = useState(0.90);
  const [rgb2Opacity, setRgb2Opacity]       = useState(0.90);
  const [compareMode, setCompareMode]       = useState(false);
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

  // Only critical + medium anomalies have reliable per-panel GPS
  const satelliteMarkers = useMemo(() =>
    visibleAnomalies.filter(a => a.severity === "critical" || a.severity === "medium"),
  [visibleAnomalies]);

  // Surveyed panel outlines (Block20_1GV_4.kml) — real footprints, not estimated positions
  const panelOutlinesGeoJSON = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAnomalies
      .filter(a => a.footprint)
      .map(a => ({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [a.footprint!] },
        properties: { severity: a.severity },
      })),
  }), [visibleAnomalies]);

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
            { key: "critical", label: "Critical",  dotColor: SEV_COLOR.critical, count: severityCounts.critical, color: "text-critical" },
            { key: "medium",   label: "Medium",    dotColor: SEV_COLOR.medium,   count: severityCounts.medium,   color: "text-medium" },
            { key: "normal",   label: "Normal",    dotColor: SEV_COLOR.normal,   count: severityCounts.normal,   color: "text-normal" },
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
                  onClick={() => setCompareMode(v => !v)}
                  title="Compare thermal vs visual"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                    compareMode ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <SplitSquareHorizontal size={13} /> Compare
                </button>

                {!compareMode && (
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
                    <button onClick={() => setPanelsVisible(v => !v)} title="Surveyed panel outlines from drone KML" className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${panelsVisible ? "bg-ochre text-ochre-fg" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                      <Square size={13} /> Panels
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
                  <Source id="cmp-thermal" type="image" url="/thermal_block20.png" coordinates={THERMAL_BOUNDS.coordinates}>
                    <Layer id="cmp-thermal-layer" type="raster" paint={{ "raster-opacity": 0.85 }} />
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
                mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                onClick={() => { setPopup(null); }}
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

                {/* Drone orthomosaic overlays */}
                {isRajpur && thermalVisible && (
                  <Source id="thermal" type="image" url="/thermal_block20.png" coordinates={THERMAL_BOUNDS.coordinates}>
                    <Layer id="thermal-layer" type="raster" paint={{ "raster-opacity": thermalOpacity, "raster-fade-duration": 300 }} />
                  </Source>
                )}
                {isRajpur && rgbVisible && (
                  <Source id="rgb" type="image" url="/rgb_block20.png" coordinates={RGB_BOUNDS.coordinates}>
                    <Layer id="rgb-layer" type="raster" paint={{ "raster-opacity": rgbOpacity, "raster-fade-duration": 300 }} />
                  </Source>
                )}
                {isRajpur && rgb2Visible && (
                  <Source id="rgb2" type="image" url="/rgb2_block20.png" coordinates={RGB2_BOUNDS.coordinates}>
                    <Layer id="rgb2-layer" type="raster" paint={{ "raster-opacity": rgb2Opacity, "raster-fade-duration": 300 }} />
                  </Source>
                )}

                {/* Surveyed panel outlines — real footprints from Block20_1GV_4.kml */}
                {isRajpur && panelsVisible && (
                  <Source id="panel-outlines" type="geojson" data={panelOutlinesGeoJSON as never}>
                    <Layer id="panel-outlines-fill" type="fill" paint={{
                      "fill-color": ["match", ["get", "severity"], "critical", SEV_COLOR.critical, "medium", SEV_COLOR.medium, "normal", SEV_COLOR.normal, SEV_COLOR.nodata],
                      "fill-opacity": 0.35,
                    }} />
                    <Layer id="panel-outlines-line" type="line" paint={{
                      "line-color": ["match", ["get", "severity"], "critical", SEV_COLOR.critical, "medium", SEV_COLOR.medium, "normal", SEV_COLOR.normal, SEV_COLOR.nodata],
                      "line-width": 1.25,
                    }} />
                  </Source>
                )}

                {/* ── Anomaly markers at actual drone-recorded GPS ── */}
                {isRajpur && satelliteMarkers.map(a => {
                  const isCrit = a.severity === "critical";
                  const sz = isCrit ? 12 : 9;
                  return (
                    <Marker
                      key={a.id}
                      longitude={a.gps.lng}
                      latitude={a.gps.lat}
                      anchor="center"
                      onClick={e => {
                        e.originalEvent.stopPropagation();
                        setSelected(a);
                        setPopup(a);
                        mapRef.current?.flyTo({ center: [a.gps.lng, a.gps.lat], zoom: 20, duration: 700 });
                      }}
                    >
                      <div style={{
                        width: sz, height: sz,
                        borderRadius: "50%",
                        backgroundColor: SEV_COLOR[a.severity],
                        border: `${isCrit ? 2.5 : 2}px solid white`,
                        boxShadow: `0 1px ${isCrit ? 8 : 5}px ${SEV_COLOR[a.severity]}99`,
                        cursor: "pointer",
                      }} />
                    </Marker>
                  );
                })}

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
                    <div className="p-3 min-w-[210px] text-sm font-sans">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="mono font-bold">{popup.panelId}</p>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px",
                          backgroundColor: SEV_COLOR[popup.severity] + "22",
                          color: SEV_COLOR[popup.severity],
                          border: `1px solid ${SEV_COLOR[popup.severity]}44`,
                          textTransform: "uppercase", borderRadius: 2,
                        }}>{popup.severity}</span>
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

              {/* Map load error — surfaces silent Mapbox tile/imagery failures instead of a blank map */}
              {mapError && (
                <div className="absolute inset-x-3 top-3 z-30 bg-red-50 border border-red-300 text-red-800 px-3 py-2 text-xs shadow max-w-md">
                  <p className="font-semibold">Satellite imagery not loading</p>
                  <p className="mt-0.5">{mapError}</p>
                </div>
              )}

              {/* GPS source disclaimer */}
              <div className="absolute top-3 left-3 bg-card/95 border border-amber-500/40 px-3 py-2 text-xs max-w-[260px] shadow backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Drone GPS coordinates</p>
                    <p className="text-muted-foreground mt-0.5">
                      Markers use recorded flight GPS from the drone flight log, not computed grid math — positions may be a few meters off.
                    </p>
                  </div>
                </div>
              </div>

              {/* Satellite legend */}
              <div className="absolute bottom-4 left-4 bg-card/95 border border-border px-3 py-2 text-xs space-y-1.5 shadow backdrop-blur-sm">
                {([{ l: "Critical", s: "critical" }, { l: "Medium", s: "medium" }] as const).map(({ l, s }) => (
                  <div key={s} className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", backgroundColor: SEV_COLOR[s], border: "1.5px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.2)" }} />
                    <span>{l}</span>
                  </div>
                ))}
                {isRajpur && thermalVisible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-red-500 font-medium"><Thermometer size={11} /> Thermal IR</div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={thermalOpacity} onChange={e => setThermalOpacity(Number(e.target.value))} className="w-20 accent-red-600" />
                      <span className="mono text-muted-foreground">{Math.round(thermalOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
                {isRajpur && rgbVisible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-medium"><Layers size={11} /> Visual V1 (east)</div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={rgbOpacity} onChange={e => setRgbOpacity(Number(e.target.value))} className="w-20 accent-emerald-600" />
                      <span className="mono text-muted-foreground">{Math.round(rgbOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
                {isRajpur && rgb2Visible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-blue-600 font-medium"><Layers size={11} /> Visual V2 (west)</div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05} value={rgb2Opacity} onChange={e => setRgb2Opacity(Number(e.target.value))} className="w-20 accent-blue-600" />
                      <span className="mono text-muted-foreground">{Math.round(rgb2Opacity * 100)}%</span>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, MessageCircle, ArrowRight, Layers, Grid3x3, Map as MapIcon, Thermometer, Navigation, SplitSquareHorizontal, LayoutGrid } from "lucide-react";
import { anomalies, anomalyTypes, plant, severityCounts, type Anomaly, type Severity } from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";
import { usePlantContext } from "@/lib/plant-context";
import Map, { Marker, Popup, NavigationControl, Source, Layer, type MapRef, type ViewState, type MapMouseEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

// Geographic bounds — Block 20 thermal orthomosaic (Day1_T_modified.tif)
const THERMAL_BOUNDS = {
  coordinates: [
    [73.033843, 28.261343], // NW
    [73.043200, 28.261343], // NE
    [73.043200, 28.254336], // SE
    [73.033843, 28.254336], // SW
  ] as [[number,number],[number,number],[number,number],[number,number]],
};

// Geographic bounds — Block 20 RGB visual orthomosaic V1 (Day1_V1.tif)
// 56155×40722 px, eastern zone of Block 20
const RGB_BOUNDS = {
  coordinates: [
    [73.037842, 28.257479], // NW
    [73.042711, 28.257479], // NE
    [73.042711, 28.254353], // SE
    [73.037842, 28.254353], // SW
  ] as [[number,number],[number,number],[number,number],[number,number]],
};

// Geographic bounds — Block 20 RGB visual orthomosaic V2 (Day1_V2.tif)
// 68854×39765 px, western zone of Block 20
const RGB2_BOUNDS = {
  coordinates: [
    [73.035136, 28.259860], // NW
    [73.041713, 28.259860], // NE
    [73.041713, 28.256497], // SE
    [73.035136, 28.256497], // SW
  ] as [[number,number],[number,number],[number,number],[number,number]],
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

interface HoverInfo {
  x: number;
  y: number;
  panelId: string;
  type: string;
  severity: Severity;
  deltaT: number | null;
}

// plant name passed at call-site from context
function buildWhatsAppLink(a: Anomaly, plantName: string) {
  const msg = `[${a.severity.toUpperCase()}] FAULT — UrjaScan Alert
Plant: ${plantName}
Panel: ${a.panelId} (Row ${a.row}, Module ${a.col})
Fault: ${a.type}${a.deltaT ? ` | ΔT: +${a.deltaT}°C` : ""}
Action: ${a.severity === "critical" ? "Immediate repair needed" : a.severity === "medium" ? "Schedule repair within 30 days" : "Monitor — no urgent action"}
GPS: ${a.gps.lat}°N, ${a.gps.lng}°E
View full report: ${typeof window !== "undefined" ? window.location.origin : ""}/anomalies/${a.id}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export const Route = createFileRoute("/_app/map")({
  head: () => ({ meta: [{ title: "Site Map — UrjaScan" }] }),
  component: SiteMap,
});

const ROWS = 24;
const COLS = 36;

function severityFor(row: number, col: number): { severity: Severity; anomaly?: Anomaly } {
  const found = anomalies.find(a => a.row === row && a.col === col);
  if (found) return { severity: found.severity, anomaly: found };
  const hash = (row * 31 + col * 17) % 100;
  if (hash < 3) return { severity: "nodata" };
  return { severity: "normal" };
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  medium:   "#f59e0b",
  normal:   "#16a34a",
  nodata:   "#9ca3af",
};

// Geographic extent of the Block 20 panel grid (matches THERMAL_BOUNDS)
const GRID_NW: [number, number] = [73.033843, 28.261343];
const GRID_SE: [number, number] = [73.043200, 28.254336];

interface PanelPopupInfo {
  lng: number;
  lat: number;
  panelId: string;
  severity: Severity;
  type: string;
  deltaT: number | null;
  deltaTNorm: number | null;
  dailyLossINR: number | null;
  anomalyId: string | null;
}

/**
 * Builds a GeoJSON FeatureCollection of panel rectangles tiled across the
 * plant's geographic bounds. Each polygon is one physical solar panel,
 * with a `color` property set by severity so Mapbox can drive fill-color
 * purely from data without any per-feature JavaScript.
 */
function buildPanelGeoJSON(
  filters: Record<string, boolean>,
  typeFilter: string,
  stringFilter: string,
  inverterFilter: string,
) {
  const [nwLng, nwLat] = GRID_NW;
  const [seLng, seLat] = GRID_SE;
  const panelW = (seLng - nwLng) / COLS;
  const panelH = (nwLat - seLat) / ROWS;
  const gap = 0.000006; // tiny inset so panel borders are visible

  const features: object[] = [];

  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const { severity, anomaly } = severityFor(r, c);
      if (!filters[severity]) continue;
      if (anomaly) {
        if (typeFilter !== "all" && anomaly.type !== typeFilter) continue;
        if (stringFilter !== "all" && anomaly.string !== stringFilter) continue;
        if (inverterFilter !== "all" && anomaly.inverter !== inverterFilter) continue;
      }

      const west  = nwLng + (c - 1) * panelW + gap;
      const east  = nwLng +  c      * panelW - gap;
      const north = nwLat - (r - 1) * panelH - gap;
      const south = nwLat -  r      * panelH + gap;
      // Panel centre point used for popup anchor
      const cLng  = nwLng + (c - 0.5) * panelW;
      const cLat  = nwLat - (r - 0.5) * panelH;

      features.push({
        type: "Feature",
        id: r * 1000 + c,
        properties: {
          panelId:      anomaly?.panelId ?? `R${String(r).padStart(2, "0")}-M${String(c).padStart(2, "0")}`,
          severity,
          anomalyId:    anomaly?.id ?? null,
          type:         anomaly?.type ?? (severity === "nodata" ? "No data captured" : "Healthy panel"),
          deltaT:       anomaly?.deltaT ?? null,
          deltaTNorm:   anomaly?.deltaTNorm ?? null,
          dailyLossINR: anomaly?.dailyLossINR ?? null,
          gpsLng:       anomaly?.gps.lng ?? cLng,
          gpsLat:       anomaly?.gps.lat ?? cLat,
          color:        SEVERITY_COLOR[severity],
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [west,  north],
            [east,  north],
            [east,  south],
            [west,  south],
            [west,  north],
          ]],
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/**
 * Builds a GeoJSON FeatureCollection of center-point dots for anomalous panels.
 * Uses Point geometry so Mapbox renders them as circle layers — one dot per
 * defective panel, positioned at the panel's geographic center. Normal panels
 * are excluded entirely; the drone RGB imagery represents healthy panels.
 */
function buildAnomalyDotsGeoJSON(
  filters: Record<string, boolean>,
  typeFilter: string,
  stringFilter: string,
  inverterFilter: string,
) {
  const [nwLng, nwLat] = GRID_NW;
  const [seLng, seLat] = GRID_SE;
  const panelW = (seLng - nwLng) / COLS;
  const panelH = (nwLat - seLat) / ROWS;
  const features: object[] = [];

  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const { severity, anomaly } = severityFor(r, c);
      if (severity === "normal" || severity === "nodata") continue;
      if (!filters[severity]) continue;
      if (anomaly) {
        if (typeFilter !== "all" && anomaly.type !== typeFilter) continue;
        if (stringFilter !== "all" && anomaly.string !== stringFilter) continue;
        if (inverterFilter !== "all" && anomaly.inverter !== inverterFilter) continue;
      }
      const cLng = nwLng + (c - 0.5) * panelW;
      const cLat = nwLat - (r - 0.5) * panelH;
      features.push({
        type: "Feature",
        id: r * 1000 + c,
        properties: {
          panelId:      anomaly?.panelId ?? `R${String(r).padStart(2, "0")}-M${String(c).padStart(2, "0")}`,
          severity,
          anomalyId:    anomaly?.id ?? null,
          type:         anomaly?.type ?? "Unknown",
          deltaT:       anomaly?.deltaT ?? null,
          deltaTNorm:   anomaly?.deltaTNorm ?? null,
          dailyLossINR: anomaly?.dailyLossINR ?? null,
          gpsLng:       anomaly?.gps.lng ?? cLng,
          gpsLat:       anomaly?.gps.lat ?? cLat,
          color:        SEVERITY_COLOR[severity],
        },
        geometry: { type: "Point", coordinates: [cLng, cLat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function SiteMap() {
  const { selectedPlant } = usePlantContext();
  const PLANT_CENTER = { lng: selectedPlant.gps.lng, lat: selectedPlant.gps.lat };
  // Only Block 20 (plant-001) has per-panel GPS anomaly data
  const isRajpur = selectedPlant.id === "plant-001";

  const [filters, setFilters] = useState<Record<string, boolean>>({ critical: true, medium: true, normal: true, nodata: true });
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [stringFilter, setStringFilter] = useState("all");
  const [inverterFilter, setInverterFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapMode, setMapMode] = useState<"grid" | "satellite">("satellite");
  const [popupAnomaly, setPopupAnomaly] = useState<Anomaly | null>(null);
  const [thermalVisible, setThermalVisible] = useState(false);
  const [thermalOpacity, setThermalOpacity] = useState(0.75);
  const [rgbVisible, setRgbVisible] = useState(true);
  const [rgbOpacity, setRgbOpacity] = useState(0.90);
  const [rgb2Visible, setRgb2Visible] = useState(true);
  const [rgb2Opacity, setRgb2Opacity] = useState(0.90);
  const [compareMode, setCompareMode] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  const [viewState, setViewState] = useState<Omit<ViewState, "width" | "height">>({
    longitude: 73.0392, latitude: 28.2569, zoom: 17,
    bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const [panelGridVisible, setPanelGridVisible] = useState(true);
  const [panelPopup, setPanelPopup] = useState<PanelPopupInfo | null>(null);
  const dragging = useRef(false);
  const pinchRef = useRef<number | null>(null);
  const hoveredPanelId = useRef<number | null>(null);
  const hoveredSource = useRef<string>("panels");

  // Unique filter options derived from real data
  const uniqueInverters = useMemo(() => ["all", ...Array.from(new Set(anomalies.map(a => a.inverter))).sort()], []);
  const uniqueTables = useMemo(() => ["all", ...Array.from(new Set(anomalies.map(a => a.string))).sort((a, b) => {
    const na = parseInt(a.replace("Table-", ""));
    const nb = parseInt(b.replace("Table-", ""));
    return na - nb;
  })], []);

  const visibleAnomalies = useMemo(() => {
    if (!isRajpur) return [];
    return anomalies.filter(a =>
      filters[a.severity] &&
      (typeFilter === "all" || a.type === typeFilter) &&
      (inverterFilter === "all" || a.inverter === inverterFilter) &&
      (stringFilter === "all" || a.string === stringFilter),
    );
  }, [isRajpur, filters, typeFilter, inverterFilter, stringFilter]);

  const mapRef = useRef<MapRef>(null);

  // 16px minimum so cells are reliably tappable on mobile
  const tile = useMemo(() => Math.max(16, Math.round(20 * zoom)), [zoom]);

  // GeoJSON for the panel grid overlay — regenerated when filters change
  const panelGeoJSON = useMemo(
    () => isRajpur ? buildPanelGeoJSON(filters, typeFilter, stringFilter, inverterFilter) : null,
    [isRajpur, filters, typeFilter, stringFilter, inverterFilter],
  );

  // GeoJSON point dots — one per anomalous panel, used for circle layer
  const anomalyDotsGeoJSON = useMemo(
    () => isRajpur ? buildAnomalyDotsGeoJSON(filters, typeFilter, stringFilter, inverterFilter) : null,
    [isRajpur, filters, typeFilter, stringFilter, inverterFilter],
  );

  const handleMarkerClick = useCallback((anomaly: Anomaly) => {
    setSelected(anomaly);
    setPopupAnomaly(anomaly);
    mapRef.current?.flyTo({
      center: [anomaly.gps.lng, anomaly.gps.lat],
      zoom: 19,
      duration: 800,
    });
  }, []);

  // Hover — use Mapbox feature-state (GPU-side) for 60fps; handles both the
  // invisible panel-fill polygon layer and the anomaly-circle dot layer.
  const onMapHover = useCallback((e: MapMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;
    const features = e.features;
    const canvas = map.getCanvas();

    if (features && features.length > 0) {
      const feature = features[0];
      const id = feature.id as number;
      const source = feature.layer?.id === "anomaly-circle" ? "anomaly-dots" : "panels";

      if (hoveredPanelId.current !== null) {
        try { map.setFeatureState({ source: hoveredSource.current, id: hoveredPanelId.current }, { hover: false }); } catch {}
      }
      hoveredPanelId.current = id;
      hoveredSource.current = source;
      map.setFeatureState({ source, id }, { hover: true });
      canvas.style.cursor = "pointer";
    } else {
      if (hoveredPanelId.current !== null) {
        try { map.setFeatureState({ source: hoveredSource.current, id: hoveredPanelId.current }, { hover: false }); } catch {}
        hoveredPanelId.current = null;
      }
      canvas.style.cursor = "";
    }
  }, []);

  // Click — show popup for any panel; open detail drawer for anomaly panels
  const onPanelClick = useCallback((e: MapMouseEvent) => {
    const features = e.features;
    if (!features || features.length === 0) return;
    const p = features[0].properties as {
      panelId: string; severity: Severity; anomalyId: string | null;
      type: string; deltaT: number | null; deltaTNorm: number | null;
      dailyLossINR: number | null; gpsLng: number; gpsLat: number;
    };

    setPanelPopup({
      lng: p.gpsLng, lat: p.gpsLat,
      panelId: p.panelId, severity: p.severity,
      type: p.type, deltaT: p.deltaT, deltaTNorm: p.deltaTNorm,
      dailyLossINR: p.dailyLossINR, anomalyId: p.anomalyId,
    });

    if (p.anomalyId) {
      const anomaly = anomalies.find(a => a.id === p.anomalyId);
      if (anomaly) {
        setSelected(anomaly);
        mapRef.current?.flyTo({ center: [p.gpsLng, p.gpsLat], zoom: 20, duration: 600 });
      }
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-[calc(100vh-3rem)]">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static z-20 top-12 bottom-14 md:bottom-0 left-0 w-72 bg-card border-r border-border p-5 overflow-y-auto transition-transform`}
      >
        <h2 className="font-bold text-foreground mb-4">Filter Panels</h2>

        <div className="space-y-2">
          {([
            { key: "critical", label: "Critical", dotColor: "var(--critical)", count: severityCounts.critical, color: "text-critical" },
            { key: "medium", label: "Medium", dotColor: "var(--medium)", count: severityCounts.medium, color: "text-medium" },
            { key: "normal", label: "Normal", dotColor: "var(--normal)", count: severityCounts.normal, color: "text-normal" },
            { key: "nodata", label: "No Data", dotColor: "var(--grey-400)", count: severityCounts.nodata, color: "text-muted-foreground" },
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
              <span className={`mono text-xs ${f.color}`}>({f.count})</span>
            </label>
          ))}
        </div>

        {isRajpur && (
          <p className="mt-4 text-[11px] text-muted-foreground mono border-t border-grey-200 pt-3">
            {visibleAnomalies.length} of {anomalies.length} anomalies shown
          </p>
        )}

        <div className="mt-4 space-y-4">
          <FilterSelect
            label="Anomaly Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={["all", ...anomalyTypes.filter(t => anomalies.some(a => a.type === t))]}
          />
          <FilterSelect
            label="Inverter"
            value={inverterFilter}
            onChange={setInverterFilter}
            options={uniqueInverters}
          />
          <FilterSelect
            label="Table / String"
            value={stringFilter}
            onChange={setStringFilter}
            options={uniqueTables}
          />
        </div>

        <button
          onClick={() => { setFilters({ critical: true, medium: true, normal: true, nodata: true }); setTypeFilter("all"); setStringFilter("all"); setInverterFilter("all"); }}
          className="mt-6 text-xs text-ochre font-medium hover:underline"
        >
          Reset All Filters
        </button>
      </aside>

      {/* Map */}
      <div className="flex-1 flex flex-col bg-grey-100 min-w-0">
        <div className="px-4 md:px-6 py-3 bg-card border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-bold text-foreground">{selectedPlant.name} — Site Map</h1>
            <p className="text-xs text-muted-foreground mono">
              {selectedPlant.totalPanels.toLocaleString()} panels · {selectedPlant.location}
              {isRajpur ? ` · ${ROWS} rows × ${COLS} cols` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center border border-border bg-muted p-0.5 gap-0.5">
              <button
                onClick={() => setMapMode("grid")}
                title="Panel grid view"
                className={`w-8 h-8 flex items-center justify-center transition ${mapMode === "grid" ? "bg-card text-ochre border border-border" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Grid3x3 size={14} />
              </button>
              <button
                onClick={() => setMapMode("satellite")}
                title="Satellite map with anomaly pins"
                className={`w-8 h-8 flex items-center justify-center transition ${mapMode === "satellite" ? "bg-card text-ochre border border-border" : "text-muted-foreground hover:text-foreground"}`}
              >
                <MapIcon size={14} />
              </button>
            </div>
            {/* Compare mode toggle */}
            {isRajpur && mapMode === "satellite" && (
              <button
                onClick={() => setCompareMode(v => !v)}
                title="Swipe compare: drag divider to compare thermal vs RGB"
                className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                  compareMode ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                <SplitSquareHorizontal size={13} /> Compare
              </button>
            )}

            {/* Overlay toggles — Block 20 satellite view */}
            {isRajpur && mapMode === "satellite" && !compareMode && (
              <div className="flex items-center border border-border divide-x divide-border overflow-hidden">
                <span className="px-2 text-[10px] uppercase tracking-widest text-grey-400 bg-grey-50 h-8 flex items-center">Overlay</span>
                {/* Panel grid toggle — on by default */}
                <button
                  onClick={() => setPanelGridVisible(v => !v)}
                  title="Panel health grid — coloured tiles on each physical panel"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${
                    panelGridVisible ? "bg-ochre text-ochre-fg" : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <LayoutGrid size={13} /> Panels
                </button>
                <button
                  onClick={() => setThermalVisible(v => !v)}
                  title="Thermal IR orthomosaic (Day1_T_modified.tif)"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${
                    thermalVisible ? "bg-red-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Thermometer size={13} /> IR
                </button>
                <button
                  onClick={() => setRgbVisible(v => !v)}
                  title="RGB visual orthomosaic V1 — eastern zone (Day1_V1.tif)"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${
                    rgbVisible ? "bg-emerald-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Layers size={13} /> V1
                </button>
                <button
                  onClick={() => setRgb2Visible(v => !v)}
                  title="RGB visual orthomosaic V2 — western zone (Day1_V2.tif)"
                  className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium transition ${
                    rgb2Visible ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Layers size={13} /> V2
                </button>
              </div>
            )}
            <button onClick={() => setSidebarOpen(true)} className="md:hidden px-3 py-1.5 text-xs border border-border bg-card">Filters</button>
            {mapMode === "grid" && <>
              <button onClick={() => setZoom(Math.max(0.6, zoom - 0.2))} className="w-8 h-8 bg-card border border-border flex items-center justify-center hover:bg-muted"><ZoomOut size={14} /></button>
              <button onClick={() => setZoom(Math.min(2, zoom + 0.2))} className="w-8 h-8 bg-card border border-border flex items-center justify-center hover:bg-muted"><ZoomIn size={14} /></button>
              <button onClick={() => setZoom(1)} className="w-8 h-8 bg-card border border-border flex items-center justify-center hover:bg-muted"><Maximize2 size={14} /></button>
            </>}
          </div>
        </div>

        <div className="flex-1 overflow-auto relative">
          {/* ── Compare (Curtain) View ── */}
          {mapMode === "satellite" && compareMode && (
            <div
              className="absolute inset-0 flex select-none"
              onMouseMove={e => {
                if (!dragging.current) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const pct = Math.min(90, Math.max(10, ((e.clientX - rect.left) / rect.width) * 100));
                setSplitPct(pct);
              }}
              onMouseUp={() => { dragging.current = false; }}
              onMouseLeave={() => { dragging.current = false; }}
            >
              {/* Left pane — Thermal IR */}
              <div className="relative overflow-hidden flex-shrink-0" style={{ width: `${splitPct}%` }}>
                <Map
                  mapboxAccessToken={MAPBOX_TOKEN}
                  longitude={viewState.longitude}
                  latitude={viewState.latitude}
                  zoom={viewState.zoom}
                  bearing={viewState.bearing}
                  pitch={viewState.pitch}
                  onMove={e => setViewState({ longitude: e.viewState.longitude, latitude: e.viewState.latitude, zoom: e.viewState.zoom, bearing: e.viewState.bearing ?? 0, pitch: e.viewState.pitch ?? 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } })}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                >
                  <Source id="cmp-thermal" type="image" url="/thermal_block20.png" coordinates={THERMAL_BOUNDS.coordinates}>
                    <Layer id="cmp-thermal-layer" type="raster" paint={{ "raster-opacity": 0.85 }} />
                  </Source>
                </Map>
                <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold mono px-2 py-0.5 flex items-center gap-1">
                  <Thermometer size={10} /> THERMAL IR
                </div>
              </div>

              {/* Draggable divider */}
              <div
                className="relative z-10 flex-shrink-0 cursor-col-resize"
                style={{ width: 4, background: "white", boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }}
                onMouseDown={() => { dragging.current = true; }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-8 h-8 bg-card rounded-full border border-border shadow-lg flex items-center justify-center cursor-col-resize">
                  <SplitSquareHorizontal size={14} className="text-primary" />
                </div>
              </div>

              {/* Right pane — RGB Visual */}
              <div className="relative overflow-hidden flex-1">
                <Map
                  mapboxAccessToken={MAPBOX_TOKEN}
                  longitude={viewState.longitude}
                  latitude={viewState.latitude}
                  zoom={viewState.zoom}
                  bearing={viewState.bearing}
                  pitch={viewState.pitch}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                >
                  <Source id="cmp-rgb" type="image" url="/rgb_block20.png" coordinates={RGB_BOUNDS.coordinates}>
                    <Layer id="cmp-rgb-layer" type="raster" paint={{ "raster-opacity": 0.90 }} />
                  </Source>
                  <Source id="cmp-rgb2" type="image" url="/rgb2_block20.png" coordinates={RGB2_BOUNDS.coordinates}>
                    <Layer id="cmp-rgb2-layer" type="raster" paint={{ "raster-opacity": 0.90 }} />
                  </Source>
                </Map>
                <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold mono px-2 py-0.5 flex items-center gap-1">
                  <Layers size={10} /> VISUAL RGB
                </div>
              </div>
            </div>
          )}

          {/* Satellite map view */}
          {mapMode === "satellite" && !compareMode && (
            <div className="absolute inset-0">
              <Map
                ref={mapRef}
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={{
                  longitude: PLANT_CENTER.lng,
                  latitude: PLANT_CENTER.lat,
                  zoom: isRajpur ? 18 : 14,
                }}
                key={selectedPlant.id}
                style={{ width: "100%", height: "100%" }}
                mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                interactiveLayerIds={isRajpur && panelGridVisible ? ["panel-fill", "anomaly-circle"] : []}
                onMouseMove={isRajpur && panelGridVisible ? onMapHover : undefined}
                onClick={isRajpur && panelGridVisible ? onPanelClick : () => { setPopupAnomaly(null); setPanelPopup(null); }}
              >
                <NavigationControl position="top-right" />

                {/* Thermal IR orthomosaic overlay (Day1_T_modified.tif) */}
                {isRajpur && thermalVisible && (
                  <Source
                    id="thermal-overlay"
                    type="image"
                    url="/thermal_block20.png"
                    coordinates={THERMAL_BOUNDS.coordinates}
                  >
                    <Layer
                      id="thermal-raster"
                      type="raster"
                      paint={{ "raster-opacity": thermalOpacity, "raster-fade-duration": 300 }}
                    />
                  </Source>
                )}

                {/* RGB visual orthomosaic V1 — eastern zone (Day1_V1.tif) */}
                {isRajpur && rgbVisible && (
                  <Source
                    id="rgb-overlay"
                    type="image"
                    url="/rgb_block20.png"
                    coordinates={RGB_BOUNDS.coordinates}
                  >
                    <Layer
                      id="rgb-raster"
                      type="raster"
                      paint={{ "raster-opacity": rgbOpacity, "raster-fade-duration": 300 }}
                    />
                  </Source>
                )}

                {/* RGB visual orthomosaic V2 — western zone (Day1_V2.tif) */}
                {isRajpur && rgb2Visible && (
                  <Source
                    id="rgb2-overlay"
                    type="image"
                    url="/rgb2_block20.png"
                    coordinates={RGB2_BOUNDS.coordinates}
                  >
                    <Layer
                      id="rgb2-raster"
                      type="raster"
                      paint={{ "raster-opacity": rgb2Opacity, "raster-fade-duration": 300 }}
                    />
                  </Source>
                )}

                {/* Plant centre marker for non-Rajpur plants */}
                {!isRajpur && (
                  <Marker longitude={PLANT_CENTER.lng} latitude={PLANT_CENTER.lat} anchor="center">
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      backgroundColor: "var(--ochre)", border: "3px solid white",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                    }} title={selectedPlant.name} />
                  </Marker>
                )}

                {/* ── Panel grid overlay ── coloured polygon per physical panel */}
                {isRajpur && panelGridVisible && panelGeoJSON && (
                  <Source id="panels" type="geojson" data={panelGeoJSON as never} generateId={false}>
                    {/* Fill — fully transparent; exists only to capture mouse events across the panel grid */}
                    <Layer
                      id="panel-fill"
                      type="fill"
                      paint={{ "fill-opacity": 0 }}
                    />
                    {/* Outline — severity-colored borders for anomalies; near-invisible for healthy panels */}
                    <Layer
                      id="panel-outline"
                      type="line"
                      paint={{
                        "line-color": [
                          "case",
                          ["==", ["get", "severity"], "critical"], "#ef4444",
                          ["==", ["get", "severity"], "medium"], "#f59e0b",
                          "rgba(255,255,255,0.10)",
                        ] as never,
                        "line-width": [
                          "case",
                          ["==", ["get", "severity"], "critical"], 2.0,
                          ["==", ["get", "severity"], "medium"], 1.5,
                          0.3,
                        ] as never,
                        "line-opacity": thermalVisible ? 0.90 : 1,
                      }}
                    />
                  </Source>
                )}

                {/* Anomaly dots — one circle per defective panel; scales with zoom */}
                {isRajpur && panelGridVisible && anomalyDotsGeoJSON && (
                  <Source id="anomaly-dots" type="geojson" data={anomalyDotsGeoJSON as never} generateId={false}>
                    <Layer
                      id="anomaly-circle"
                      type="circle"
                      paint={{
                        "circle-color": ["get", "color"],
                        "circle-radius": [
                          "case",
                          ["boolean", ["feature-state", "hover"], false],
                          ["interpolate", ["linear"], ["zoom"], 14, 4, 16, 7, 18, 11, 20, 20] as never,
                          ["interpolate", ["linear"], ["zoom"], 14, 2, 16, 4, 18,  7, 20, 14] as never,
                        ] as never,
                        "circle-opacity": [
                          "case",
                          ["boolean", ["feature-state", "hover"], false], 1.0,
                          0.88,
                        ] as never,
                        "circle-stroke-width": 1.5,
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-opacity": 0.9,
                      }}
                    />
                  </Source>
                )}

                {/* Panel popup — shown on any panel click (anomaly or healthy) */}
                {panelPopup && (
                  <Popup
                    longitude={panelPopup.lng}
                    latitude={panelPopup.lat}
                    anchor="bottom"
                    offset={8}
                    closeOnClick={false}
                    onClose={() => { setPanelPopup(null); }}
                    style={{ padding: 0 }}
                  >
                    <div className="p-3 min-w-[210px] text-sm font-sans">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-bold mono text-sm">{panelPopup.panelId}</p>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px",
                          backgroundColor: SEVERITY_COLOR[panelPopup.severity] + "22",
                          color: SEVERITY_COLOR[panelPopup.severity],
                          border: `1px solid ${SEVERITY_COLOR[panelPopup.severity]}44`,
                          textTransform: "uppercase", borderRadius: 2,
                        }}>{panelPopup.severity}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{panelPopup.type}</p>
                      {panelPopup.deltaT && (
                        <div className="mt-1.5 space-y-0.5">
                          <p className="text-xs font-semibold mono" style={{ color: SEVERITY_COLOR.critical }}>
                            ΔT +{panelPopup.deltaT}°C
                            {panelPopup.deltaTNorm && panelPopup.deltaTNorm !== panelPopup.deltaT && (
                              <span className="ml-1.5" style={{ color: "var(--ochre)" }}>
                                (norm. +{panelPopup.deltaTNorm}°C)
                              </span>
                            )}
                          </p>
                          {panelPopup.dailyLossINR && (
                            <p className="text-xs font-bold mono" style={{ color: SEVERITY_COLOR.medium }}>
                              ₹{panelPopup.dailyLossINR}/day loss
                            </p>
                          )}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mono mt-1.5">
                        {panelPopup.lat.toFixed(5)}°N, {panelPopup.lng.toFixed(5)}°E
                      </p>
                      {panelPopup.anomalyId && (
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-grey-100">
                          <a
                            href={`https://maps.google.com/maps?daddr=${panelPopup.lat},${panelPopup.lng}&dirflg=d`}
                            target="_blank" rel="noreferrer"
                            className="text-[11px] text-ochre hover:underline font-medium inline-flex items-center gap-1"
                          >
                            <Navigation size={10} /> Navigate
                          </a>
                          <Link
                            to="/anomalies/$id"
                            params={{ id: panelPopup.anomalyId }}
                            className="text-[11px] text-primary hover:underline font-medium"
                          >
                            Full detail →
                          </Link>
                        </div>
                      )}
                    </div>
                  </Popup>
                )}
              </Map>

              {/* Info overlay for plants without panel-level GPS data */}
              {!isRajpur && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur border border-grey-200 px-4 py-2.5 text-xs shadow text-center max-w-xs">
                  <p className="font-semibold text-foreground">{selectedPlant.name}</p>
                  <p className="text-muted-foreground mt-0.5">{selectedPlant.location} · {selectedPlant.capacityMW} MW</p>
                  <p className="text-muted-foreground mt-1">Panel-level GPS data available after first inspection is processed.</p>
                  <p className="font-semibold text-critical mt-1">{selectedPlant.criticalCount} critical · {selectedPlant.mediumCount} medium anomalies</p>
                </div>
              )}

              {/* Map legend overlay */}
              <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur border border-border px-3 py-2 text-xs space-y-1.5 shadow">
                {[
                  { label: "Critical", color: SEVERITY_COLOR.critical },
                  { label: "Medium",   color: SEVERITY_COLOR.medium },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: l.color, display: "inline-block", border: "1.5px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.2)" }} />
                    <span>{l.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 opacity-50">
                  <span style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", border: "1.5px solid rgba(255,255,255,0.5)", backgroundColor: "transparent" }} />
                  <span>Normal (satellite)</span>
                </div>
                {isRajpur && thermalVisible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-red-600 font-medium text-xs">
                      <Thermometer size={11} /> Thermal IR
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05}
                        value={thermalOpacity}
                        onChange={e => setThermalOpacity(Number(e.target.value))}
                        className="w-20 accent-red-600"
                      />
                      <span className="mono text-muted-foreground text-xs">{Math.round(thermalOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
                {isRajpur && rgbVisible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs">
                      <Layers size={11} /> Visual V1 (east)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05}
                        value={rgbOpacity}
                        onChange={e => setRgbOpacity(Number(e.target.value))}
                        className="w-20 accent-emerald-600"
                      />
                      <span className="mono text-muted-foreground text-xs">{Math.round(rgbOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
                {isRajpur && rgb2Visible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-blue-600 font-medium text-xs">
                      <Layers size={11} /> Visual V2 (west)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Opacity</span>
                      <input type="range" min={0.2} max={1} step={0.05}
                        value={rgb2Opacity}
                        onChange={e => setRgb2Opacity(Number(e.target.value))}
                        className="w-20 accent-blue-600"
                      />
                      <span className="mono text-muted-foreground text-xs">{Math.round(rgb2Opacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Panel grid view */}
          {mapMode === "grid" && !isRajpur && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-card border border-border p-8 text-center max-w-sm">
                <p className="font-semibold text-foreground">{selectedPlant.name}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Panel grid view is available after the first inspection has been processed for this plant.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Switch to satellite view to see the plant location.
                </p>
              </div>
            </div>
          )}
          {mapMode === "grid" && isRajpur && (
            <div
              className="p-4 md:p-6"
              onTouchStart={e => {
                if (e.touches.length === 2) {
                  pinchRef.current = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                  );
                }
              }}
              onTouchMove={e => {
                if (e.touches.length !== 2 || pinchRef.current === null) return;
                const dist = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY,
                );
                const delta = dist / pinchRef.current;
                pinchRef.current = dist;
                setZoom(z => Math.min(2.5, Math.max(0.4, z * delta)));
              }}
              onTouchEnd={() => { pinchRef.current = null; }}
            >
              <div className="inline-block bg-card border border-border p-4">
                {/* Column headers */}
                <div className="flex gap-[2px] pl-10 mb-1">
                  {Array.from({ length: COLS }).map((_, c) => (
                    <div key={c} style={{ width: tile }} className="text-[9px] text-muted-foreground text-center mono">
                      {String(c + 1).padStart(2, "0")}
                    </div>
                  ))}
                </div>
                {Array.from({ length: ROWS }).map((_, r) => (
                  <div key={r} className="flex items-center gap-[2px] mb-[2px]">
                    <div className="w-10 text-[10px] text-muted-foreground mono text-right pr-2">R{String(r + 1).padStart(2, "0")}</div>
                    {Array.from({ length: COLS }).map((_, c) => {
                      const { severity, anomaly } = severityFor(r + 1, c + 1);
                      if (!filters[severity]) {
                        return <div key={c} style={{ width: tile, height: tile }} className="bg-transparent" />;
                      }
                      const isSelected = selected?.row === r + 1 && selected?.col === c + 1;
                      const color = {
                        critical: "bg-critical hover:bg-critical/80",
                        medium: "bg-medium hover:bg-medium/80",
                        normal: "bg-normal/70 hover:bg-normal",
                        nodata: "bg-surface-dark hover:bg-border",
                      }[severity];
                      return (
                        <button
                          key={c}
                          style={{ width: tile, height: tile }}
                          onClick={() => anomaly && setSelected(anomaly)}
                          onMouseEnter={e => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setHover({
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                              panelId: anomaly?.panelId ?? `R${String(r + 1).padStart(2, "0")}-M${String(c + 1).padStart(2, "0")}`,
                              type: anomaly?.type ?? (severity === "nodata" ? "No data captured" : "Healthy panel"),
                              severity,
                              deltaT: anomaly?.deltaT ?? null,
                            });
                          }}
                          onMouseLeave={() => setHover(null)}
                          className={`${color} transition ${isSelected ? "ring-2 ring-ochre ring-offset-1" : ""}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}  {/* end isRajpur grid */}
        </div>

        {/* Floating hover tooltip (grid mode only) */}
        {hover && mapMode === "grid" && (
          <div
            className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-2"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            <div className="bg-foreground text-white px-3 py-2 min-w-[180px]">
              <p className="mono text-sm font-bold">{hover.panelId}</p>
              <p className="text-xs text-white/70 mt-0.5">{hover.type}</p>
              <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-white/15">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                  hover.severity === "critical" ? "text-critical" :
                  hover.severity === "medium" ? "text-medium" :
                  hover.severity === "normal" ? "text-normal" : "text-white/60"
                }`}>{hover.severity}</span>
                {hover.deltaT && <span className="mono text-xs font-semibold text-ochre">ΔT +{hover.deltaT}°C</span>}
              </div>
            </div>
            <div className="w-2 h-2 bg-foreground rotate-45 mx-auto -mt-1" />
          </div>
        )}

        {/* Legend (grid mode only) */}
        {mapMode === "grid" && (
          <div className="border-t border-border bg-card px-4 md:px-6 py-2 flex flex-wrap items-center gap-4 text-xs text-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-critical" style={{ borderRadius: 1 }} /> Critical</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-medium" style={{ borderRadius: 1 }} /> Medium</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-normal/70" style={{ borderRadius: 1 }} /> Healthy</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-grey-200 border border-grey-200" style={{ borderRadius: 1 }} /> No Data</span>
          </div>
        )}
      </div>

      {/* Detail drawer */}
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
              {selected.deltaT && <DataRow label="ΔT" value={`+${selected.deltaT}°C`} mono critical />}
              <DataRow label="String" value={selected.string} />
              <DataRow label="Inverter" value={selected.inverter} />
              <DataRow label="Status" value={selected.status} />
              <DataRow label="GPS" value={`${selected.gps.lat}°N, ${selected.gps.lng}°E`} mono />

              <Link
                to="/anomalies/$id"
                params={{ id: selected.id }}
                className="w-full h-10 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm flex items-center justify-center gap-2"
              >
                View Full Detail <ArrowRight size={14} />
              </Link>
              <a
                href={buildWhatsAppLink(selected, selectedPlant.name)}
                target="_blank"
                rel="noreferrer"
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

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange?: (v: string) => void; options: string[] }) {
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

function DataRow({ label, value, mono, critical }: { label: string; value: string; mono?: boolean; critical?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-grey-200 pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${mono ? "mono" : ""} ${critical ? "text-critical" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

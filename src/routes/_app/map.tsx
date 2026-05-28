import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, MessageCircle, ArrowRight, Layers, Grid3x3, Map as MapIcon, Thermometer } from "lucide-react";
import { anomalies, anomalyTypes, plant, severityCounts, type Anomaly, type Severity } from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";
import { usePlantContext } from "@/lib/plant-context";
import Map, { Marker, Popup, NavigationControl, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

// Geographic bounds of the Block 20 thermal orthomosaic (from GeoTIFF metadata)
const THERMAL_BOUNDS = {
  // [lng, lat] order — Mapbox image source: [NW, NE, SE, SW]
  coordinates: [
    [73.033843, 28.261343], // NW
    [73.043200, 28.261343], // NE
    [73.043200, 28.254336], // SE
    [73.033843, 28.254336], // SW
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

function SiteMap() {
  const { selectedPlant } = usePlantContext();
  const PLANT_CENTER = { lng: selectedPlant.gps.lng, lat: selectedPlant.gps.lat };
  // Only Rajpur (plant-001) has per-panel GPS anomaly data
  const isRajpur = selectedPlant.id === "plant-001";
  const visibleAnomalies = isRajpur ? anomalies : [];

  const [filters, setFilters] = useState({ critical: true, medium: true, normal: true, nodata: true });
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stringFilter, setStringFilter] = useState("all");
  const [inverterFilter, setInverterFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapMode, setMapMode] = useState<"grid" | "satellite">("grid");
  const [popupAnomaly, setPopupAnomaly] = useState<Anomaly | null>(null);
  const [thermalVisible, setThermalVisible] = useState(false);
  const [thermalOpacity, setThermalOpacity] = useState(0.65);

  const mapRef = useRef<MapRef>(null);

  const tile = useMemo(() => Math.max(10, Math.round(18 * zoom)), [zoom]);

  const handleMarkerClick = useCallback((anomaly: Anomaly) => {
    setSelected(anomaly);
    setPopupAnomaly(anomaly);
    mapRef.current?.flyTo({
      center: [anomaly.gps.lng, anomaly.gps.lat],
      zoom: 19,
      duration: 800,
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-[calc(100vh-3rem)]">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static z-20 top-12 bottom-14 md:bottom-0 left-0 w-72 bg-white border-r border-grey-200 p-5 overflow-y-auto transition-transform`}
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

        <div className="mt-6 space-y-4">
          <FilterSelect label="Anomaly Type" value="all" options={["all", ...anomalyTypes]} />
          <FilterSelect
            label="String"
            value={stringFilter}
            onChange={setStringFilter}
            options={["all", ...Array.from({ length: 12 }, (_, i) => `String ${String(i + 1).padStart(2, "0")}`)]}
          />
          <FilterSelect
            label="Inverter"
            value={inverterFilter}
            onChange={setInverterFilter}
            options={["all", "INV-1", "INV-2", "INV-3"]}
          />
        </div>

        <button
          onClick={() => { setFilters({ critical: true, medium: true, normal: true, nodata: true }); setStringFilter("all"); setInverterFilter("all"); }}
          className="mt-6 text-xs text-ochre font-medium hover:underline"
        >
          Reset Filters
        </button>
      </aside>

      {/* Map */}
      <div className="flex-1 flex flex-col bg-grey-100 min-w-0">
        <div className="px-4 md:px-6 py-3 bg-white border-b border-grey-200 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-bold text-foreground">{selectedPlant.name} — Site Map</h1>
            <p className="text-xs text-muted-foreground mono">
              {selectedPlant.totalPanels.toLocaleString()} panels · {selectedPlant.location}
              {isRajpur ? ` · ${ROWS} rows × ${COLS} cols` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center border border-grey-200 bg-grey-50 p-0.5 gap-0.5">
              <button
                onClick={() => setMapMode("grid")}
                title="Panel grid view"
                className={`w-8 h-8 flex items-center justify-center transition ${mapMode === "grid" ? "bg-white text-ochre border border-grey-200" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Grid3x3 size={14} />
              </button>
              <button
                onClick={() => setMapMode("satellite")}
                title="Satellite map with anomaly pins"
                className={`w-8 h-8 flex items-center justify-center transition ${mapMode === "satellite" ? "bg-white text-ochre border border-grey-200" : "text-muted-foreground hover:text-foreground"}`}
              >
                <MapIcon size={14} />
              </button>
            </div>
            {/* Thermal overlay toggle — only for plants with thermal data */}
            {isRajpur && mapMode === "satellite" && (
              <button
                onClick={() => setThermalVisible(v => !v)}
                title="Toggle thermal overlay"
                className={`h-8 px-3 flex items-center gap-1.5 text-xs font-medium border transition ${
                  thermalVisible
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-muted-foreground border-grey-200 hover:bg-grey-50"
                }`}
              >
                <Thermometer size={13} />
                Thermal
              </button>
            )}
            <button onClick={() => setSidebarOpen(true)} className="md:hidden px-3 py-1.5 text-xs border border-grey-200 bg-white">Filters</button>
            {mapMode === "grid" && <>
              <button onClick={() => setZoom(Math.max(0.6, zoom - 0.2))} className="w-8 h-8 bg-white border border-grey-200 flex items-center justify-center hover:bg-grey-50"><ZoomOut size={14} /></button>
              <button onClick={() => setZoom(Math.min(2, zoom + 0.2))} className="w-8 h-8 bg-white border border-grey-200 flex items-center justify-center hover:bg-grey-50"><ZoomIn size={14} /></button>
              <button onClick={() => setZoom(1)} className="w-8 h-8 bg-white border border-grey-200 flex items-center justify-center hover:bg-grey-50"><Maximize2 size={14} /></button>
            </>}
          </div>
        </div>

        <div className="flex-1 overflow-auto relative">
          {/* Satellite map view */}
          {mapMode === "satellite" && (
            <div className="absolute inset-0">
              <Map
                ref={mapRef}
                mapboxAccessToken={MAPBOX_TOKEN}
                initialViewState={{
                  longitude: PLANT_CENTER.lng,
                  latitude: PLANT_CENTER.lat,
                  zoom: isRajpur ? 17 : 14,
                }}
                key={selectedPlant.id}
                style={{ width: "100%", height: "100%" }}
                mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                onClick={() => setPopupAnomaly(null)}
              >
                <NavigationControl position="top-right" />

                {/* Thermal orthomosaic overlay — Block 20 */}
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

                {/* Anomaly markers — only for plants with per-panel GPS data */}
                {visibleAnomalies
                  .filter(a => filters[a.severity])
                  .map(a => (
                    <Marker
                      key={a.id}
                      longitude={a.gps.lng}
                      latitude={a.gps.lat}
                      anchor="center"
                      onClick={e => { e.originalEvent.stopPropagation(); handleMarkerClick(a); }}
                    >
                      <div
                        title={`${a.panelId} — ${a.type}`}
                        style={{
                          width: a.severity === "critical" ? 18 : 14,
                          height: a.severity === "critical" ? 18 : 14,
                          borderRadius: "50%",
                          backgroundColor: SEVERITY_COLOR[a.severity],
                          border: "2.5px solid white",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                          cursor: "pointer",
                          animation: a.severity === "critical" ? "pulse 2s infinite" : undefined,
                        }}
                      />
                    </Marker>
                  ))}

                {/* Popup on selected anomaly */}
                {popupAnomaly && (
                  <Popup
                    longitude={popupAnomaly.gps.lng}
                    latitude={popupAnomaly.gps.lat}
                    anchor="bottom"
                    offset={14}
                    closeOnClick={false}
                    onClose={() => setPopupAnomaly(null)}
                    style={{ padding: 0 }}
                  >
                    <div className="p-3 min-w-[180px] text-sm font-sans">
                      <p className="font-bold mono">{popupAnomaly.panelId}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{popupAnomaly.type}</p>
                      {popupAnomaly.deltaT && (
                        <p className="text-xs font-semibold text-critical mono mt-1">ΔT +{popupAnomaly.deltaT}°C</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mono mt-1">
                        {popupAnomaly.gps.lat.toFixed(4)}°N, {popupAnomaly.gps.lng.toFixed(4)}°E
                      </p>
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
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur border border-grey-200 px-3 py-2 text-xs space-y-1.5 shadow">
                {[
                  { label: "Critical", color: SEVERITY_COLOR.critical },
                  { label: "Medium",   color: SEVERITY_COLOR.medium },
                  { label: "Normal",   color: SEVERITY_COLOR.normal },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: l.color, display: "inline-block", border: "1.5px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.2)" }} />
                    <span>{l.label}</span>
                  </div>
                ))}
                {isRajpur && thermalVisible && (
                  <div className="pt-1.5 border-t border-grey-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-red-600 font-medium">
                      <Thermometer size={11} /> Thermal overlay
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Opacity</span>
                      <input
                        type="range" min={0.2} max={1} step={0.05}
                        value={thermalOpacity}
                        onChange={e => setThermalOpacity(Number(e.target.value))}
                        className="w-20 accent-red-600"
                      />
                      <span className="mono text-muted-foreground">{Math.round(thermalOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Panel grid view */}
          {mapMode === "grid" && !isRajpur && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white border border-grey-200 p-8 text-center max-w-sm">
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
            <div className="p-4 md:p-6">
              <div className="inline-block bg-white border border-grey-200 p-4">
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
          <div className="border-t border-grey-200 bg-white px-4 md:px-6 py-2 flex flex-wrap items-center gap-4 text-xs text-foreground">
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
            className="relative w-full sm:w-[400px] bg-white border-l border-grey-200 overflow-y-auto animate-in slide-in-from-right"
          >
            <header className="p-5 border-b border-grey-200 flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-grey-400">Panel</p>
                <h3 className="mono text-2xl font-bold">{selected.panelId}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 hover:bg-grey-50 flex items-center justify-center">
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
        className="mt-1.5 w-full h-9 px-3 border border-grey-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-ochre"
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

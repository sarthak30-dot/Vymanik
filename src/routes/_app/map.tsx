import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, MessageCircle, ArrowRight, Layers, Grid3x3 } from "lucide-react";
import { anomalies, anomalyTypes, plant, severityCounts, type Anomaly, type Severity } from "@/lib/mock-data";
import { SeverityBadge } from "@/components/SeverityBadge";

interface HoverInfo {
  x: number;
  y: number;
  panelId: string;
  type: string;
  severity: Severity;
  deltaT: number | null;
}

function buildWhatsAppLink(a: Anomaly) {
  const msg = `[${a.severity.toUpperCase()}] FAULT — UrjaScan Alert
Plant: ${plant.name}
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
  // deterministic pseudo-random "no data" sprinkle
  const hash = (row * 31 + col * 17) % 100;
  if (hash < 3) return { severity: "nodata" };
  return { severity: "normal" };
}

// Mock TGIS tile config — in production fetched from GET /api/tiles/{inspectionId}/config
const TGIS_TILE_CONFIG = {
  inspectionId: "insp-20260503",
  tileUrlTemplate: "/api/tiles/insp-20260503/{z}/{x}/{y}.png",
  thermalUrlTemplate: "/api/tiles/insp-20260503/{z}/{x}/{y}.png?colormap=inferno&rescale=20,100",
  bounds: [73.0180, 26.4514, 73.0210, 26.4535] as [number, number, number, number],
  tileCount: 18420,
  totalSizeGB: 4.1,
};

function SiteMap() {
  const [filters, setFilters] = useState({ critical: true, medium: true, normal: true, nodata: true });
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stringFilter, setStringFilter] = useState("all");
  const [inverterFilter, setInverterFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapMode, setMapMode] = useState<"grid" | "tgis">("grid");

  const tile = useMemo(() => Math.max(10, Math.round(18 * zoom)), [zoom]);

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
            <h1 className="font-bold text-foreground">{plant.name} — Site Map</h1>
            <p className="text-xs text-muted-foreground mono">{plant.totalPanels} panels · {ROWS} rows × {COLS} cols</p>
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
                onClick={() => setMapMode("tgis")}
                title="TGIS thermal orthomosaic"
                className={`w-8 h-8 flex items-center justify-center transition ${mapMode === "tgis" ? "bg-white text-ochre border border-grey-200" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Layers size={14} />
              </button>
            </div>
            <button onClick={() => setSidebarOpen(true)} className="md:hidden px-3 py-1.5 text-xs border border-grey-200 bg-white">Filters</button>
            <button onClick={() => setZoom(Math.max(0.6, zoom - 0.2))} className="w-8 h-8 bg-white border border-grey-200 flex items-center justify-center hover:bg-grey-50"><ZoomOut size={14} /></button>
            <button onClick={() => setZoom(Math.min(2, zoom + 0.2))} className="w-8 h-8 bg-white border border-grey-200 flex items-center justify-center hover:bg-grey-50"><ZoomIn size={14} /></button>
            <button onClick={() => setZoom(1)} className="w-8 h-8 bg-white border border-grey-200 flex items-center justify-center hover:bg-grey-50"><Maximize2 size={14} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          {/* TGIS tile view */}
          {mapMode === "tgis" && (
            <div className="bg-white border border-grey-200 p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-semibold text-sm flex items-center gap-2"><Layers size={15} className="text-ochre" /> Thermal Orthomosaic — TGIS Tile Layer</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Inspection: <span className="mono">{TGIS_TILE_CONFIG.inspectionId}</span> ·{" "}
                    <span className="mono">{TGIS_TILE_CONFIG.tileCount.toLocaleString()}</span> tiles ·{" "}
                    <span className="mono">{TGIS_TILE_CONFIG.totalSizeGB} GB</span> in R2
                  </p>
                </div>
              </div>

              {/* Simulated tile mosaic */}
              <div className="relative overflow-hidden border border-grey-200 aspect-video bg-black">
                <div
                  className="absolute inset-0"
                  style={{
                    background: `
                      radial-gradient(ellipse at 18% 45%, #b71c1c88 0%, transparent 18%),
                      radial-gradient(ellipse at 62% 30%, #e53e3e66 0%, transparent 12%),
                      radial-gradient(ellipse at 75% 68%, #d32f2f55 0%, transparent 15%),
                      radial-gradient(ellipse at 33% 72%, #f57f1744 0%, transparent 10%),
                      linear-gradient(135deg, #0d1842 0%, #1a237e 30%, #4a148c 55%, #880e4f 75%, #b71c1c 100%)
                    `,
                  }}
                />
                {/* Simulated tile grid overlay */}
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />
                {/* Hotspot annotation pins */}
                {[
                  { left: "18%", top: "42%", label: "R08-M03 +61°C", color: "bg-critical" },
                  { left: "61%", top: "28%", label: "R14-M07 +47°C", color: "bg-critical" },
                  { left: "75%", top: "66%", label: "R22-M11 +38°C", color: "bg-critical" },
                  { left: "33%", top: "70%", label: "R05-M14 +29°C", color: "bg-medium" },
                ].map(p => (
                  <div key={p.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.left, top: p.top }}>
                    <div className={`w-4 h-4 rounded-full ${p.color} border-2 border-white shadow-lg animate-pulse`} />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 bg-black/80 text-white text-[9px] mono px-1.5 py-0.5 rounded whitespace-nowrap">
                      {p.label}
                    </div>
                  </div>
                ))}
                {/* Colour scale */}
                <div className="absolute right-3 top-3 bottom-3 w-3 rounded" style={{ background: "linear-gradient(to top, #1a237e, #9c27b0, #e53e3e, #ff9800, #fff)" }} />
                <div className="absolute right-7 top-3 text-[9px] mono text-white/80">100°</div>
                <div className="absolute right-7 bottom-3 text-[9px] mono text-white/80">20°</div>
                <div className="absolute bottom-3 left-3 text-[9px] mono text-white/60">
                  colormap: inferno · rescale 20–100°C · z=18
                </div>
              </div>

              {/* Tile metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <TileMetaCard label="Tile Scheme" value="XYZ (z 0–20)" />
                <TileMetaCard label="Format" value="COG GeoTIFF" />
                <TileMetaCard label="CRS" value="EPSG:4326" />
                <TileMetaCard label="Bounds" value={`${TGIS_TILE_CONFIG.bounds[0]}°E – ${TGIS_TILE_CONFIG.bounds[2]}°E`} />
              </div>

              <div className="bg-grey-50 border border-grey-200 p-4 text-xs text-muted-foreground font-mono space-y-1">
                <p className="text-foreground font-semibold text-sm mb-2">Tile URL pattern (TiTiler on Fly.io → R2)</p>
                <p>{TGIS_TILE_CONFIG.tileUrlTemplate}</p>
                <p className="text-ochre">{TGIS_TILE_CONFIG.thermalUrlTemplate}</p>
              </div>

              <button onClick={() => setMapMode("grid")} className="text-xs text-ochre font-medium hover:underline">
                ← Back to panel grid
              </button>
            </div>
          )}

          {/* Panel grid view */}
          {mapMode === "grid" && (
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
          )} {/* end panel grid view */}
        </div>

        {/* Floating hover tooltip */}
        {hover && (
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

        {/* Legend */}
        <div className="border-t border-grey-200 bg-white px-4 md:px-6 py-2 flex flex-wrap items-center gap-4 text-xs text-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-critical" style={{ borderRadius: 1 }} /> Critical</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-medium" style={{ borderRadius: 1 }} /> Medium</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-normal/70" style={{ borderRadius: 1 }} /> Healthy</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-grey-200 border border-grey-200" style={{ borderRadius: 1 }} /> No Data</span>
        </div>
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

              <Link
                to="/anomalies/$id"
                params={{ id: selected.id }}
                className="w-full h-10 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm flex items-center justify-center gap-2"
              >
                View Full Detail <ArrowRight size={14} />
              </Link>
              <a
                href={buildWhatsAppLink(selected)}
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

function TileMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-grey-50 border border-grey-200 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-grey-400">{label}</p>
      <p className="mono font-semibold text-foreground text-sm mt-0.5">{value}</p>
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

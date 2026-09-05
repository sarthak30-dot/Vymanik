import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Search, Download, FileText, Loader2, MapPin, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { SeverityBadge, StatusBadge } from "@/components/SeverityBadge";
import { useAnomalies, usePatchAnomaly } from "@/lib/queries";
import { usePlantContext } from "@/lib/plant-context";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SEVERITY_LABEL, SEVERITY_LABEL_FULL } from "@/lib/mock-data";
import type { AnomalyDTO } from "@/lib/api";

/**
 * Block number for the report's "Layout Location" column.
 *
 * Prefer the anomaly's own `block`, which the March 2026 survey KML carries per
 * defect — this site spans eight blocks (06, 09, 12, 14, 16, 17, 19, 122), so a
 * single number scraped from the plant name would be wrong for seven of them.
 *
 * The name fallback is for the Block 20 deliverable, whose rows had no block
 * field and whose plant was named "Block 20 Solar Plant". Without it those rows
 * would read "Block: Block 20 Solar Plant".
 */
function blockNumber(a: AnomalyDTO, plantName: string): string {
  return a.block ?? plantName.match(/Block\s+(\d+)/i)?.[1] ?? "—";
}

// Mirrors the report's "Layout Location" string, e.g.
// "Block: 16, Inv: A, Table: 3, Panel: R8-P12"
function layoutLocation(a: AnomalyDTO, plantName: string): string {
  const inv = a.inverter.replace(/^INV-/i, "");
  const table = a.string.replace(/^Table-/i, "");
  return `Block: ${blockNumber(a, plantName)}, Inv: ${inv}, Table: ${table}, Panel: ${a.panelId}`;
}

function mapLocation(a: AnomalyDTO): string {
  return `${a.gps.lat.toFixed(7)}, ${a.gps.lng.toFixed(7)}`;
}

/** Google's documented "Search" URL API (maps.google.com/maps?q= still works
 *  but this is the form Google itself recommends going forward) — a pin at
 *  the exact coordinate, not a route, which is what a client double-checking
 *  a defect's location wants. Distinct on purpose from the "Navigate"/driving
 *  -directions links elsewhere in this app (map.tsx, InspectionSheet,
 *  anomalies/$id.tsx all use `?daddr=...&dirflg=d`) — this column exists to
 *  verify a coordinate, not to route a technician there. */
function googleMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * The Map Location cell/row, shared between the desktop table and the mobile
 * card. `onClick` exists only for the mobile case, where this renders inside
 * the card's own click-to-navigate `<div role="link">` (see the mobile cards
 * section below for why that's a div and not a `<Link>`) — without stopping
 * propagation, a tap here would fire both this anchor's own navigation *and*
 * the card's own click handler navigating to the detail page. `stopPropagation`
 * keeps the card's handler from ever seeing the click; this anchor's own
 * `target="_blank"` still fires as normal, since the browser resolves the
 * click against whichever element was actually clicked, not its ancestors.
 */
function MapLocationLink({
  a,
  onClick,
}: {
  a: AnomalyDTO;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <a
      href={googleMapsSearchUrl(a.gps.lat, a.gps.lng)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title="Open in Google Maps"
      className="inline-flex items-center gap-1 text-blue-600/80 hover:text-blue-600 hover:underline underline-offset-2 transition-colors"
    >
      <MapPin size={11} className="shrink-0" aria-hidden />
      {mapLocation(a)}
    </a>
  );
}

function exportCSV(rows: AnomalyDTO[], plantName: string) {
  const header = ["SL No","Block","Layout Location","Map Location","Defect Type","Delta_T","Severity","Status","Date","Image Ref"];
  const lines = rows.map((a, i) => [
    i + 1, blockNumber(a, plantName), layoutLocation(a, plantName), mapLocation(a), a.type,
    a.deltaTNorm ?? a.deltaT ?? "", SEVERITY_LABEL[a.severity], a.status, a.date, a.rgbNote ?? "",
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `UrjaScan_${plantName.replace(/\s+/g, "_")}_Anomalies.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Severity = AnomalyDTO["severity"];
type Status = AnomalyDTO["status"];

const SEVERITY_VALUES = ["critical", "medium", "normal", "nodata"] as const;
const STATUS_VALUES = ["New", "Acknowledged", "In Repair", "Closed"] as const;

/** Filters live in the URL, not component state, so a filtered view survives a
 *  refresh and the Back button and is shareable as a link — the same
 *  validateSearch pattern the map route uses for its `focus` param. Absent =
 *  "all"/empty, so a clean /anomalies URL stays clean. */
export type AnomalyFilters = { sev?: Severity; status?: Status; q?: string };

/** One-click saved views — each maps to filter values the URL can already
 *  express, so a preset is just a shortcut to a search state, and the active
 *  preset stays highlighted because it reads the same URL the chips write. */
const FILTER_PRESETS: { label: string; sev?: Severity; status?: Status }[] = [
  { label: "All view" },
  { label: "Critical", sev: "critical" },
  { label: "Critical · New", sev: "critical", status: "New" },
  { label: "In repair", status: "In Repair" },
  { label: "Resolved", status: "Closed" },
];

export const Route = createFileRoute("/_app/anomalies/")({
  head: () => ({ meta: [{ title: "All Anomalies — UrjaScan" }] }),
  validateSearch: (s: Record<string, unknown>): AnomalyFilters => ({
    sev: typeof s.sev === "string" && (SEVERITY_VALUES as readonly string[]).includes(s.sev) ? s.sev as Severity : undefined,
    status: typeof s.status === "string" && (STATUS_VALUES as readonly string[]).includes(s.status) ? s.status as Status : undefined,
    q: typeof s.q === "string" && s.q.trim() ? s.q : undefined,
  }),
  component: AnomalyList,
});

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, medium: 1, normal: 2, nodata: 3 };
const SEV_DOT: Record<string, string> = {
  all: "var(--grey-400)",
  critical: "var(--critical)",
  medium: "var(--medium)",
  normal: "var(--normal)",
};

function AnomalyList() {
  const { data: allAnomalies = [], isLoading } = useAnomalies();
  const { selectedPlant } = usePlantContext();
  const patchAnomaly = usePatchAnomaly();
  const navigate = useNavigate();
  const canEdit = can(getUser()?.role, "editAnomaly");

  // Filter anomalies by selected plant.
  // Mock anomalies have no plantId (they belong to Rajpur/plant-001).
  // Inspector-reported anomalies carry the correct plantId.
  const anomalies = useMemo(() =>
    allAnomalies.filter(a =>
      a.plantId === selectedPlant.id ||
      (!a.plantId && selectedPlant.id === "plant-001"),
    ),
  [allAnomalies, selectedPlant.id]);

  // Filters read from / write to the URL (see AnomalyFilters + validateSearch).
  const sp = Route.useSearch();
  const sevFilter: Severity | "all" = sp.sev ?? "all";
  const statusFilter: Status | "all" = sp.status ?? "all";
  const search = sp.q ?? "";
  const setFilter = (patch: Partial<AnomalyFilters>) =>
    navigate({ to: "/anomalies", search: (prev: AnomalyFilters) => ({ ...prev, ...patch }), replace: true });

  const rows = useMemo(() => {
    return anomalies
      .filter(a => sevFilter === "all" || a.severity === sevFilter)
      .filter(a => statusFilter === "all" || a.status === statusFilter)
      .filter(a => {
        if (!search) return true;
        const q = search.toLowerCase();
        return a.panelId.toLowerCase().includes(q) || a.type.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        return (b.deltaT ?? 0) - (a.deltaT ?? 0);
      });
  }, [anomalies, sevFilter, statusFilter, search]);

  // ── Bulk selection ──
  // Ephemeral (not URL-backed): a selection is a transient "act on these now"
  // set, not a shareable view. Cleared whenever the filter changes, so a bulk
  // action can never touch a row the operator can no longer see.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => { setSelectedIds(new Set()); }, [sevFilter, statusFilter, search]);
  const selectedRows = useMemo(() => rows.filter(a => selectedIds.has(a.id)), [rows, selectedIds]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggleOne = (id: string) => setSelectedIds(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(rows.map(a => a.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const bulkSetStatus = (status: Status) => {
    selectedRows.forEach(a => patchAnomaly.mutate({ id: a.id, status }));
    toast.success(`${selectedRows.length} ${selectedRows.length === 1 ? "anomaly" : "anomalies"} set to “${status}”`);
    clearSelection();
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Loading anomalies…
      </div>
    );
  }

  const plantName = selectedPlant.name;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">All Anomalies — {plantName}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="mono">{anomalies.length}</span> anomalies detected
          {selectedPlant.id !== "plant-001" && anomalies.length === 0 && (
            <span className="ml-2 text-xs text-ochre-fg bg-ochre-muted border border-ochre/20 px-2 py-0.5">
              Panel-level data available after first inspection is processed
            </span>
          )}
        </p>
      </header>

      {/* Saved views — one-click filter presets */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_PRESETS.map(p => {
          const active = sevFilter === (p.sev ?? "all") && statusFilter === (p.status ?? "all");
          return (
            <button
              key={p.label}
              onClick={() => setFilter({ sev: p.sev, status: p.status })}
              className={`px-3 h-7 text-xs font-medium border transition ${
                active ? "bg-ochre text-ochre-fg border-ochre" : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex gap-2 flex-wrap">
          {(["all", "critical", "medium", "normal"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter({ sev: s === "all" ? undefined : s })}
              className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold border transition ${
                sevFilter === s
                  ? "bg-grey-900 text-white border-grey-900"
                  : "bg-card text-grey-400 border-border hover:bg-muted"
              }`}
            >
              <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: SEV_DOT[s], flexShrink: 0 }} />
              {s === "all" ? "All" : SEVERITY_LABEL_FULL[s]}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={e => setFilter({ status: e.target.value === "all" ? undefined : e.target.value as Status })}
          className="h-8 px-3 border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
        >
          <option value="all">All statuses</option>
          <option>New</option>
          <option>Acknowledged</option>
          <option>In Repair</option>
          <option>Closed</option>
        </select>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setFilter({ q: e.target.value || undefined })}
            placeholder="Search by panel ID or anomaly type..."
            className="w-full h-8 pl-9 pr-3 border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
          />
        </div>
        {/* One export control instead of scattered buttons. Native <details> so
            there's no outside-click plumbing; each item closes the menu itself. */}
        <details className="relative group">
          <summary className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <Download size={12} /> Export <ChevronDown size={12} className="opacity-60" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-52 bg-card border border-border shadow-lg py-1 text-xs">
            <button onClick={e => { exportCSV(rows, plantName); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}
              className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
              <Download size={12} /> Filtered ({rows.length}) · CSV
            </button>
            <button onClick={e => { exportCSV(anomalies, plantName); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}
              className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
              <FileText size={12} /> All ({anomalies.length}) · CSV
            </button>
          </div>
        </details>
      </div>

      {/* Bulk action bar — appears only with a selection */}
      {selectedRows.length > 0 && (
        <div className="bg-grey-900 text-white px-4 py-2.5 flex items-center gap-3 flex-wrap text-xs sticky top-2 z-10 shadow-lg">
          <span className="font-semibold mono tabular-nums">{selectedRows.length} selected</span>
          <span className="text-white/40">|</span>
          {canEdit && (
            <label className="flex items-center gap-2">
              <span className="text-white/70">Set status</span>
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) { bulkSetStatus(e.target.value as Status); e.target.value = ""; } }}
                className="h-7 px-2 bg-grey-900 border border-white/25 text-white text-xs focus:outline-none focus:ring-1 focus:ring-ochre"
              >
                <option value="" disabled>Choose…</option>
                <option>New</option>
                <option>Acknowledged</option>
                <option>In Repair</option>
                <option>Closed</option>
              </select>
            </label>
          )}
          <button
            onClick={() => exportCSV(selectedRows, plantName)}
            className="h-7 px-3 border border-white/25 hover:bg-white/10 inline-flex items-center gap-1.5 font-medium"
          >
            <Download size={12} /> Export selected
          </button>
          <button onClick={clearSelection} className="ml-auto h-7 px-2 inline-flex items-center gap-1 text-white/70 hover:text-white">
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {/* Table — desktop */}
      <div className="bg-card border border-border overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all filtered anomalies"
                    className="accent-ochre align-middle cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold">SL No</th>
                <th className="text-left px-4 py-3 font-semibold">Block</th>
                <th className="text-left px-4 py-3 font-semibold">Layout Location</th>
                <th className="text-left px-4 py-3 font-semibold">Map Location</th>
                <th className="text-left px-4 py-3 font-semibold">Defect Type</th>
                <th className="text-left px-4 py-3 font-semibold">Delta_T</th>
                <th className="text-left px-4 py-3 font-semibold">Severity</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a, i) => (
                <tr key={a.id} className={`transition ${selectedIds.has(a.id) ? "bg-ochre-muted" : "hover:bg-grey-25"}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      aria-label={`Select ${a.panelId}`}
                      className="accent-ochre align-middle cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 mono text-sm text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 mono text-sm">{blockNumber(a, plantName)}</td>
                  <td className="px-4 py-3 mono text-xs">{layoutLocation(a, plantName)}</td>
                  <td className="px-4 py-3 mono text-xs">
                    <MapLocationLink a={a} />
                  </td>
                  <td className="px-4 py-3 text-sm">{a.type}</td>
                  <td className="px-4 py-3 mono font-semibold text-sm">
                    {a.deltaTNorm ? (
                      <span className="text-critical">{a.deltaTNorm.toFixed(2)}°C</span>
                    ) : a.deltaT ? (
                      <span className="text-critical">{a.deltaT.toFixed(2)}°C</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <select
                        value={a.status}
                        onChange={e => patchAnomaly.mutate({ id: a.id, status: e.target.value as AnomalyDTO["status"] })}
                        className="text-xs border border-border px-2 py-1 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
                      >
                        <option>New</option>
                        <option>Acknowledged</option>
                        <option>In Repair</option>
                        <option>Closed</option>
                      </select>
                    ) : (
                      <StatusBadge status={a.status} severity={a.severity} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/anomalies/$id" params={{ id: a.id }} className="text-ochre text-xs font-medium hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
          Showing 1–{rows.length} of {rows.length} anomalies
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((a, i) => (
          <div
            key={a.id}
            role="link"
            tabIndex={0}
            onClick={() => navigate({ to: "/anomalies/$id", params: { id: a.id } })}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate({ to: "/anomalies/$id", params: { id: a.id } });
            }}
            // Was a <Link> (an <a>) wrapping the whole card — reworked into a
            // clickable/keyboard-operable div instead, because the Google
            // Maps link inside it (MapLocationLink) is a real <a> too, and
            // React (correctly) treats a nested <a> as a hydration-breaking
            // HTML violation: verified live, "In HTML, <a> cannot be a
            // descendant of <a>." stopPropagation alone stopped the double
            // -navigation bug that nesting would otherwise cause, but not the
            // underlying invalid markup — this is the actual fix, not a
            // workaround for it. navigate() + role="link" + Enter-to-activate
            // keeps mouse, touch, and keyboard behavior equivalent to the
            // <Link> this replaces.
            className={`block border p-4 transition cursor-pointer ${selectedIds.has(a.id) ? "bg-ochre-muted border-ochre/40" : "bg-card border-border hover:bg-grey-25"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => toggleOne(a.id)}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Select ${a.panelId}`}
                  className="accent-ochre mt-0.5 cursor-pointer"
                />
                <div>
                  <p className="mono text-[11px] text-muted-foreground">SL {i + 1}</p>
                  <p className="mono font-bold text-sm mt-0.5">{layoutLocation(a, plantName)}</p>
                  <p className="text-sm mt-1 text-muted-foreground">{a.type}</p>
                </div>
              </div>
              <SeverityBadge severity={a.severity} />
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
              {a.deltaTNorm ? (
                <span className="mono text-foreground font-semibold">{a.deltaTNorm.toFixed(2)}°C</span>
              ) : a.deltaT ? (
                <span className="mono text-foreground font-semibold">{a.deltaT.toFixed(2)}°C</span>
              ) : null}
              <MapLocationLink a={a} onClick={(e) => e.stopPropagation()} />
              <StatusBadge status={a.status} severity={a.severity} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

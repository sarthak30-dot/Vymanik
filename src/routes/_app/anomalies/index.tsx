import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, Download, FileText, Loader2 } from "lucide-react";
import { SeverityBadge, StatusBadge } from "@/components/SeverityBadge";
import { useAnomalies, usePatchAnomaly } from "@/lib/queries";
import { usePlantContext } from "@/lib/plant-context";
import { getUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SEVERITY_LABEL } from "@/lib/mock-data";
import type { AnomalyDTO } from "@/lib/api";

// Block number as it appears in the inspection report's "Layout Location" column,
// e.g. "Block 20 Solar Plant" -> "20".
function blockNumber(plantName: string): string {
  return plantName.match(/Block\s+(\d+)/i)?.[1] ?? plantName;
}

// Mirrors the report's "Layout Location" string, e.g.
// "Block: 20, Inv: A, Table: 3, Panel: R8-P12"
function layoutLocation(a: AnomalyDTO, plantName: string): string {
  const inv = a.inverter.replace(/^INV-/i, "");
  const table = a.string.replace(/^Table-/i, "");
  return `Block: ${blockNumber(plantName)}, Inv: ${inv}, Table: ${table}, Panel: ${a.panelId}`;
}

function mapLocation(a: AnomalyDTO): string {
  return `${a.gps.lat.toFixed(7)}, ${a.gps.lng.toFixed(7)}`;
}

function exportCSV(rows: AnomalyDTO[], plantName: string) {
  const header = ["SL No","Block","Layout Location","Map Location","Defect Type","Delta_T","Severity","Status","Date","Image Ref"];
  const lines = rows.map((a, i) => [
    i + 1, blockNumber(plantName), layoutLocation(a, plantName), mapLocation(a), a.type,
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

export const Route = createFileRoute("/_app/anomalies/")({
  head: () => ({ meta: [{ title: "All Anomalies — UrjaScan" }] }),
  component: AnomalyList,
});

type Severity = AnomalyDTO["severity"];
type Status = AnomalyDTO["status"];

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

  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");

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

      {/* Filter bar */}
      <div className="bg-card border border-border p-4 flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex gap-2 flex-wrap">
          {(["all", "critical", "medium", "normal"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSevFilter(s)}
              className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold border transition ${
                sevFilter === s
                  ? "bg-grey-900 text-white border-grey-900"
                  : "bg-card text-grey-400 border-border hover:bg-muted"
              }`}
            >
              <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: SEV_DOT[s], flexShrink: 0 }} />
              {s === "all" ? "All" : SEVERITY_LABEL[s]}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as Status | "all")}
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by panel ID or anomaly type..."
            className="w-full h-8 pl-9 pr-3 border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV(rows, plantName)}
            className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
            title={`Export ${rows.length} filtered anomalies as CSV`}
          >
            <Download size={12} /> CSV
          </button>
          <button
            onClick={() => exportCSV(anomalies, plantName)}
            className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
            title="Export all 347 anomalies"
          >
            <FileText size={12} /> Export All
          </button>
        </div>
      </div>

      {/* Table — desktop */}
      <div className="bg-card border border-border overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
              <tr>
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
                <tr key={a.id} className="hover:bg-grey-25 transition">
                  <td className="px-4 py-3 mono text-sm text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 mono text-sm">{blockNumber(plantName)}</td>
                  <td className="px-4 py-3 mono text-xs">{layoutLocation(a, plantName)}</td>
                  <td className="px-4 py-3 mono text-xs text-muted-foreground">{mapLocation(a)}</td>
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
                      <StatusBadge status={a.status} />
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
          <Link key={a.id} to="/anomalies/$id" params={{ id: a.id }}
            className="block bg-card border border-border p-4 hover:bg-grey-25 transition">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mono text-[11px] text-muted-foreground">SL {i + 1}</p>
                <p className="mono font-bold text-sm mt-0.5">{layoutLocation(a, plantName)}</p>
                <p className="text-sm mt-1 text-muted-foreground">{a.type}</p>
              </div>
              <SeverityBadge severity={a.severity} />
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
              {a.deltaTNorm ? (
                <span className="mono text-foreground font-semibold">{a.deltaTNorm.toFixed(2)}°C</span>
              ) : a.deltaT ? (
                <span className="mono text-foreground font-semibold">{a.deltaT.toFixed(2)}°C</span>
              ) : null}
              <span className="mono">{mapLocation(a)}</span>
              <StatusBadge status={a.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

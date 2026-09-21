import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, ArrowLeft, Bug } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SeverityBadge } from "@/components/SeverityBadge";
import { useAnomalies } from "@/lib/queries";
import { usePlantContext } from "@/lib/plant-context";
import { SEVERITY_LABEL_FULL } from "@/lib/mock-data";
import type { AnomalyDTO } from "@/lib/api";

export const Route = createFileRoute("/_app/anomalies/by-defect")({
  head: () => ({ meta: [{ title: "Defect-wise Anomaly — UrjaScan" }] }),
  component: DefectwiseAnomaly,
});

// ── Tab strip shared across the three anomaly views ──────────────────────────

function AnomalyTabNav() {
  const loc = useLocation();
  const tabs = [
    { to: "/anomalies" as const,           label: "All Anomalies" },
    { to: "/anomalies/by-block" as const,  label: "Block-wise" },
    { to: "/anomalies/by-defect" as const, label: "Defect-wise" },
  ];
  return (
    <div className="flex gap-0 border-b border-border">
      {tabs.map(({ to, label }) => {
        const active = loc.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              active
                ? "border-ochre text-ochre"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

// ── Data helpers ──────────────────────────────────────────────────────────────

interface DefectStats {
  type: string;
  defects: AnomalyDTO[];
  count: number;
  pct: number;
  topBlocks: string[];       // top 3 blocks by defect count for this type
  criticalCount: number;
  mediumCount: number;
  normalCount: number;
}

function computeDefectStats(anomalies: AnomalyDTO[]): DefectStats[] {
  const grouped = new Map<string, AnomalyDTO[]>();
  for (const a of anomalies) {
    if (!grouped.has(a.type)) grouped.set(a.type, []);
    grouped.get(a.type)!.push(a);
  }
  const total = anomalies.length || 1;
  return Array.from(grouped.entries())
    .map(([type, defects]) => {
      // Top 3 blocks by count for this defect type
      const blockCounts = new Map<string, number>();
      for (const d of defects) {
        const b = d.block ?? "Unknown";
        blockCounts.set(b, (blockCounts.get(b) ?? 0) + 1);
      }
      const topBlocks = [...blockCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([b]) => `Block ${b}`);
      return {
        type,
        defects,
        count: defects.length,
        pct: Math.round((defects.length / total) * 1000) / 10,
        topBlocks,
        criticalCount: defects.filter(a => a.severity === "critical").length,
        mediumCount:   defects.filter(a => a.severity === "medium").length,
        normalCount:   defects.filter(a => a.severity === "normal").length,
      };
    })
    .sort((a, b) => b.count - a.count);
}

// Recharts-compatible color per defect rank (by count, descending)
const CHART_COLORS = [
  "#FF2E2E", "#FF8C00", "#FFE600", "#00B8D9", "#36B37E",
  "#6554C0", "#FF5630", "#00875A", "#0052CC", "#8777D9",
];

// ── Custom tooltip for the bar chart ─────────────────────────────────────────

function DefectTooltip({ active, payload }: { active?: boolean; payload?: { payload: DefectStats }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border shadow p-3 text-xs space-y-1 max-w-[200px]">
      <p className="font-semibold text-foreground leading-snug">{d.type}</p>
      <p className="text-muted-foreground"><span className="mono font-semibold text-foreground">{d.count}</span> defects ({d.pct}%)</p>
      {d.topBlocks.length > 0 && (
        <p className="text-muted-foreground">Top: {d.topBlocks.join(", ")}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function DefectwiseAnomaly() {
  const { data: allAnomalies = [], isLoading } = useAnomalies();
  const { selectedPlant } = usePlantContext();
  const navigate = useNavigate();

  const anomalies = useMemo(
    () => allAnomalies.filter(a =>
      a.plantId === selectedPlant.id || (!a.plantId && selectedPlant.id === "plant-001"),
    ),
    [allAnomalies, selectedPlant.id],
  );

  const defectStats = useMemo(() => computeDefectStats(anomalies), [anomalies]);

  // Distinct block values for cross-filter
  const allBlocks = useMemo(
    () => [...new Set(anomalies.map(a => a.block ?? "Unknown"))].sort((a, b) => Number(a) - Number(b)),
    [anomalies],
  );

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [drillBlockFilter, setDrillBlockFilter] = useState<string>("all");
  const [drillSevFilter, setDrillSevFilter] = useState<string>("all");

  const drillStat = useMemo(
    () => defectStats.find(d => d.type === selectedType) ?? null,
    [defectStats, selectedType],
  );

  const drillRows = useMemo(() => {
    if (!drillStat) return [];
    return drillStat.defects
      .filter(a => drillBlockFilter === "all" || (a.block ?? "Unknown") === drillBlockFilter)
      .filter(a => drillSevFilter === "all" || a.severity === drillSevFilter)
      .sort((a, b) => {
        const rank = { critical: 0, medium: 1, normal: 2, nodata: 3 };
        return rank[a.severity] - rank[b.severity];
      });
  }, [drillStat, drillBlockFilter, drillSevFilter]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Loading defect data…
      </div>
    );
  }

  const plantName = selectedPlant.name;
  const totalDefects = anomalies.length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Defect-wise Anomaly — {plantName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="mono">{defectStats.length}</span> defect types ·{" "}
          <span className="mono">{totalDefects}</span> total occurrences
        </p>
      </header>

      <AnomalyTabNav />

      {/* ── Summary view ── */}
      {!selectedType && (
        <div className="space-y-5">
          {/* Bar chart */}
          {defectStats.length > 0 ? (
            <div className="bg-card border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-grey-400 mb-4">
                Defect Distribution — Plant-wide
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={defectStats}
                  margin={{ top: 4, right: 16, bottom: 60, left: 8 }}
                  barCategoryGap="30%"
                >
                  <XAxis
                    dataKey="type"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground,#888)" }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground,#888)" }}
                    allowDecimals={false}
                  />
                  <Tooltip content={<DefectTooltip />} cursor={{ fill: "var(--grey-25,#fafafa)" }} />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {defectStats.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        opacity={0.85}
                        style={{ cursor: "pointer" }}
                        onClick={() => { setSelectedType(defectStats[i].type); setDrillBlockFilter("all"); setDrillSevFilter("all"); }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-muted-foreground mt-1 text-center">
                Click a bar to drill into that defect type
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border px-4 py-10 text-center text-muted-foreground text-sm">
              No anomalies detected for this plant.
            </div>
          )}

          {/* Summary table */}
          <div className="bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-widest text-grey-400">Defect Type Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Defect Type</th>
                    <th className="text-left px-4 py-3 font-semibold">Count</th>
                    <th className="text-left px-4 py-3 font-semibold">% Share</th>
                    <th className="text-left px-4 py-3 font-semibold">Severity Mix</th>
                    <th className="text-left px-4 py-3 font-semibold">Top Affected Blocks</th>
                    <th className="text-right px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {defectStats.map((ds, i) => (
                    <tr
                      key={ds.type}
                      className="hover:bg-grey-25 transition cursor-pointer"
                      onClick={() => { setSelectedType(ds.type); setDrillBlockFilter("all"); setDrillSevFilter("all"); }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                          <span className="font-medium text-sm">{ds.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 mono font-semibold tabular-nums">{ds.count}</td>
                      <td className="px-4 py-3 mono text-sm">{ds.pct}%</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {ds.criticalCount > 0 && (
                            <span className="mono text-[10px] px-1.5 py-0.5 font-semibold"
                              style={{ background: "#fff0f0", color: "#ee0000" }}>
                              {ds.criticalCount}C
                            </span>
                          )}
                          {ds.mediumCount > 0 && (
                            <span className="mono text-[10px] px-1.5 py-0.5 font-semibold"
                              style={{ background: "#fff6e5", color: "#B26200" }}>
                              {ds.mediumCount}M
                            </span>
                          )}
                          {ds.normalCount > 0 && (
                            <span className="mono text-[10px] px-1.5 py-0.5 font-semibold"
                              style={{ background: "#fdfde8", color: "#847700" }}>
                              {ds.normalCount}N
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {ds.topBlocks.join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-ochre text-xs font-medium">View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
              Multi-defect panels are counted once per defect type they exhibit.
            </div>
          </div>
        </div>
      )}

      {/* ── Defect type drill-down ── */}
      {selectedType && drillStat && (
        <div className="space-y-4">
          {/* Back + header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <button
                onClick={() => setSelectedType(null)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
              >
                <ArrowLeft size={12} /> All Defect Types
              </button>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Bug size={18} className="text-ochre" />
                {selectedType}
              </h2>
            </div>
            {/* Summary chips */}
            <div className="flex gap-3 flex-wrap text-sm">
              <div className="bg-card border border-border px-4 py-2 text-center">
                <p className="mono font-bold text-lg">{drillStat.count}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest">Occurrences</p>
              </div>
              <div className="bg-card border border-border px-4 py-2 text-center">
                <p className="mono font-bold text-lg">{drillStat.pct}%</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest">of Plant Total</p>
              </div>
              <div className="bg-card border border-border px-4 py-2 text-center">
                <p className="text-xs font-medium text-muted-foreground">Top blocks</p>
                <p className="text-xs text-foreground mt-0.5">{drillStat.topBlocks.join(", ") || "—"}</p>
              </div>
            </div>
          </div>

          {/* Cross-filters */}
          <div className="bg-card border border-border p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <p className="text-xs font-semibold text-muted-foreground shrink-0">Filter within {selectedType}:</p>
            <select
              value={drillBlockFilter}
              onChange={e => setDrillBlockFilter(e.target.value)}
              className="h-8 px-3 border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
            >
              <option value="all">All blocks</option>
              {allBlocks.map(b => <option key={b} value={b}>Block {b}</option>)}
            </select>
            <select
              value={drillSevFilter}
              onChange={e => setDrillSevFilter(e.target.value)}
              className="h-8 px-3 border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical (COA3)</option>
              <option value="medium">Medium (COA2)</option>
              <option value="normal">Normal (COA1)</option>
            </select>
            {(drillBlockFilter !== "all" || drillSevFilter !== "all") && (
              <button
                onClick={() => { setDrillBlockFilter("all"); setDrillSevFilter("all"); }}
                className="h-8 px-3 border border-border bg-card text-xs text-muted-foreground hover:bg-muted"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Defect list */}
          <div className="bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground">
              Showing <span className="mono font-semibold text-foreground">{drillRows.length}</span> of{" "}
              <span className="mono">{drillStat.count}</span> panels with "{selectedType}"
            </div>

            {drillRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-muted-foreground text-sm">
                No anomalies match the current filters.
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Panel ID</th>
                        <th className="text-left px-4 py-3 font-semibold">Block</th>
                        <th className="text-left px-4 py-3 font-semibold">String / Inverter</th>
                        <th className="text-left px-4 py-3 font-semibold">Delta_T</th>
                        <th className="text-left px-4 py-3 font-semibold">Severity</th>
                        <th className="text-left px-4 py-3 font-semibold">Status</th>
                        <th className="text-right px-4 py-3 font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {drillRows.map(a => (
                        <tr key={a.id} className="hover:bg-grey-25 transition">
                          <td className="px-4 py-3 mono font-semibold text-sm">{a.panelId}</td>
                          <td className="px-4 py-3 mono text-sm">{a.block ? `Block ${a.block}` : "—"}</td>
                          <td className="px-4 py-3 mono text-xs text-muted-foreground">
                            {a.string} · {a.inverter.replace(/^INV-/i, "Inv-")}
                          </td>
                          <td className="px-4 py-3 mono text-sm">
                            {a.deltaTNorm ? (
                              <span className="text-critical font-semibold">{a.deltaTNorm.toFixed(2)}°C</span>
                            ) : a.deltaT ? (
                              <span className="text-critical font-semibold">{a.deltaT.toFixed(2)}°C</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{a.status}</td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to="/anomalies/$id"
                              params={{ id: a.id }}
                              className="text-ochre text-xs font-medium hover:underline"
                            >
                              View →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-border">
                  {drillRows.map(a => (
                    <div
                      key={a.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate({ to: "/anomalies/$id", params: { id: a.id } })}
                      onKeyDown={e => e.key === "Enter" && navigate({ to: "/anomalies/$id", params: { id: a.id } })}
                      className="p-4 hover:bg-grey-25 transition cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="mono font-bold text-sm">{a.panelId}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.block ? `Block ${a.block}` : ""} · {a.string}
                          </p>
                        </div>
                        <SeverityBadge severity={a.severity} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

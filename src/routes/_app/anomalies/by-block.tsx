import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, ChevronUp, ChevronDown, ArrowLeft, LayoutGrid } from "lucide-react";
import { SeverityBadge } from "@/components/SeverityBadge";
import { useAnomalies } from "@/lib/queries";
import { usePlantContext } from "@/lib/plant-context";
import { plant, SEVERITY_LABEL_FULL } from "@/lib/mock-data";
import type { AnomalyDTO } from "@/lib/api";

export const Route = createFileRoute("/_app/anomalies/by-block")({
  head: () => ({ meta: [{ title: "Block-wise Anomaly — UrjaScan" }] }),
  component: BlockwiseAnomaly,
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

interface BlockStats {
  block: string;
  defects: AnomalyDTO[];
  defectCount: number;
  criticalCount: number;
  mediumCount: number;
  normalCount: number;
  healthScore: number;
}

function computeBlockStats(anomalies: AnomalyDTO[]): BlockStats[] {
  const grouped = new Map<string, AnomalyDTO[]>();
  for (const a of anomalies) {
    const b = a.block ?? "Unknown";
    if (!grouped.has(b)) grouped.set(b, []);
    grouped.get(b)!.push(a);
  }
  const blockCount = grouped.size || 1;
  const estimatedPanelsPerBlock = Math.round(plant.totalPanels / blockCount);
  return Array.from(grouped.entries()).map(([block, defects]) => ({
    block,
    defects,
    defectCount: defects.length,
    criticalCount: defects.filter(a => a.severity === "critical").length,
    mediumCount:   defects.filter(a => a.severity === "medium").length,
    normalCount:   defects.filter(a => a.severity === "normal").length,
    healthScore: Math.max(0, Math.round(100 - (defects.length / estimatedPanelsPerBlock) * 100)),
  }));
}

type SortKey = "block" | "defects" | "health";
type SortDir = "asc" | "desc";

function sortBlocks(blocks: BlockStats[], key: SortKey, dir: SortDir): BlockStats[] {
  return [...blocks].sort((a, b) => {
    let cmp = 0;
    if (key === "block")   cmp = Number(a.block) - Number(b.block);
    if (key === "defects") cmp = a.defectCount - b.defectCount;
    if (key === "health")  cmp = a.healthScore - b.healthScore;
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SortButton({
  label, col, sortKey, sortDir, onSort,
}: { label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const active = sortKey === col;
  return (
    <button
      onClick={() => onSort(col)}
      className="inline-flex items-center gap-1 hover:text-foreground transition"
    >
      {label}
      {active
        ? sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        : <ChevronDown size={12} className="opacity-30" />}
    </button>
  );
}

function SeverityPills({ c, m, n }: { c: number; m: number; n: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {c > 0 && <span className="mono text-[10px] px-1.5 py-0.5 font-semibold" style={{ background: "var(--critical-muted,#fff0f0)", color: "var(--critical,#ee0000)" }}>{c} Crit</span>}
      {m > 0 && <span className="mono text-[10px] px-1.5 py-0.5 font-semibold" style={{ background: "#fff6e5", color: "#B26200" }}>{m} Med</span>}
      {n > 0 && <span className="mono text-[10px] px-1.5 py-0.5 font-semibold" style={{ background: "#fdfde8", color: "#847700" }}>{n} Norm</span>}
      {c === 0 && m === 0 && n === 0 && <span className="text-muted-foreground text-[10px]">—</span>}
    </div>
  );
}

function HealthDot({ score }: { score: number }) {
  const color = score >= 90 ? "var(--normal,#847700)" : score >= 70 ? "var(--medium,#B26200)" : "var(--critical,#ee0000)";
  return (
    <span className="inline-flex items-center gap-1.5 mono text-sm font-semibold" style={{ color }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: color, display: "inline-block", flexShrink: 0 }} />
      {score}%
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function BlockwiseAnomaly() {
  const { data: allAnomalies = [], isLoading } = useAnomalies();
  const { selectedPlant } = usePlantContext();
  const navigate = useNavigate();

  const anomalies = useMemo(
    () => allAnomalies.filter(a =>
      a.plantId === selectedPlant.id || (!a.plantId && selectedPlant.id === "plant-001"),
    ),
    [allAnomalies, selectedPlant.id],
  );

  const [sortKey, setSortKey] = useState<SortKey>("defects");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [drillDefectFilter, setDrillDefectFilter] = useState<string>("all");
  const [drillSevFilter, setDrillSevFilter] = useState<string>("all");

  const blockStats = useMemo(() => computeBlockStats(anomalies), [anomalies]);
  const sortedBlocks = useMemo(() => sortBlocks(blockStats, sortKey, sortDir), [blockStats, sortKey, sortDir]);

  const drillBlock = useMemo(
    () => blockStats.find(b => b.block === selectedBlock) ?? null,
    [blockStats, selectedBlock],
  );

  const drillDefectTypes = useMemo(
    () => drillBlock ? [...new Set(drillBlock.defects.map(a => a.type))].sort() : [],
    [drillBlock],
  );

  const drillRows = useMemo(() => {
    if (!drillBlock) return [];
    return drillBlock.defects
      .filter(a => drillDefectFilter === "all" || a.type === drillDefectFilter)
      .filter(a => drillSevFilter === "all" || a.severity === drillSevFilter)
      .sort((a, b) => {
        const rank = { critical: 0, medium: 1, normal: 2, nodata: 3 };
        return rank[a.severity] - rank[b.severity];
      });
  }, [drillBlock, drillDefectFilter, drillSevFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Loading block data…
      </div>
    );
  }

  const plantName = selectedPlant.name;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Block-wise Anomaly — {plantName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="mono">{blockStats.length}</span> blocks ·{" "}
          <span className="mono">{anomalies.length}</span> total defects
        </p>
      </header>

      <AnomalyTabNav />

      {/* ── Block summary table ── */}
      {!selectedBlock && (
        <div className="bg-card border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-grey-400">All Blocks</p>
            <p className="text-xs text-muted-foreground">
              Click a row to drill into the block's defects
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-widest text-grey-400 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">
                    <SortButton label="Block" col="block" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    <SortButton label="Defects" col="defects" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">Severity Breakdown</th>
                  <th className="text-left px-4 py-3 font-semibold">
                    <SortButton label="Health Score" col="health" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="text-right px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedBlocks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      No anomalies detected for this plant.
                    </td>
                  </tr>
                ) : (
                  sortedBlocks.map(bs => (
                    <tr
                      key={bs.block}
                      className="hover:bg-grey-25 transition cursor-pointer"
                      onClick={() => { setSelectedBlock(bs.block); setDrillDefectFilter("all"); setDrillSevFilter("all"); }}
                    >
                      <td className="px-4 py-3 font-semibold mono">Block {bs.block}</td>
                      <td className="px-4 py-3 mono font-semibold tabular-nums">{bs.defectCount}</td>
                      <td className="px-4 py-3">
                        <SeverityPills c={bs.criticalCount} m={bs.mediumCount} n={bs.normalCount} />
                      </td>
                      <td className="px-4 py-3">
                        <HealthDot score={bs.healthScore} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-ochre text-xs font-medium">View →</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">
            Health score estimated from defect density relative to block panel count.
          </div>
        </div>
      )}

      {/* ── Block drill-down ── */}
      {selectedBlock && drillBlock && (
        <div className="space-y-4">
          {/* Back + block header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
              >
                <ArrowLeft size={12} /> All Blocks
              </button>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <LayoutGrid size={18} className="text-ochre" />
                Block {selectedBlock}
              </h2>
            </div>
            {/* Summary chips */}
            <div className="flex gap-3 flex-wrap text-sm">
              <div className="bg-card border border-border px-4 py-2 text-center">
                <p className="mono font-bold text-lg">{drillBlock.defectCount}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest">Defects</p>
              </div>
              <div className="bg-card border border-border px-4 py-2 text-center">
                <HealthDot score={drillBlock.healthScore} />
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest mt-0.5">Health</p>
              </div>
              <div className="bg-card border border-border px-4 py-2 text-center">
                <p className="mono font-bold text-lg text-critical">{drillBlock.criticalCount}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest">Critical</p>
              </div>
            </div>
          </div>

          {/* Cross-filters */}
          <div className="bg-card border border-border p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <p className="text-xs font-semibold text-muted-foreground shrink-0">Filter within Block {selectedBlock}:</p>
            <select
              value={drillDefectFilter}
              onChange={e => setDrillDefectFilter(e.target.value)}
              className="h-8 px-3 border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ochre"
            >
              <option value="all">All defect types</option>
              {drillDefectTypes.map(t => <option key={t} value={t}>{t}</option>)}
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
            {(drillDefectFilter !== "all" || drillSevFilter !== "all") && (
              <button
                onClick={() => { setDrillDefectFilter("all"); setDrillSevFilter("all"); }}
                className="h-8 px-3 border border-border bg-card text-xs text-muted-foreground hover:bg-muted"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Defect table for the selected block */}
          <div className="bg-card border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground">
              Showing <span className="mono font-semibold text-foreground">{drillRows.length}</span> of{" "}
              <span className="mono">{drillBlock.defectCount}</span> defects in Block {selectedBlock}
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
                        <th className="text-left px-4 py-3 font-semibold">Defect Type</th>
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
                          <td className="px-4 py-3 text-sm">{a.type}</td>
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
                          <p className="text-sm text-muted-foreground mt-0.5">{a.type}</p>
                          <p className="mono text-xs text-muted-foreground mt-0.5">{a.string} · {a.inverter}</p>
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

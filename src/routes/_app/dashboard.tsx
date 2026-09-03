import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, Map, ClipboardList, TrendingUp, ArrowRight, ChevronDown, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { HealthGauge } from "@/components/HealthGauge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { ExecutiveOverview } from "@/components/ExecutiveOverview";
import { useI18n } from "@/lib/i18n";
import { usePlant, useAnomalies, useInspectionHistory } from "@/lib/queries";
import { getUser } from "@/lib/auth";
import { allPlants, teamMembers } from "@/lib/mock-data";
import { usePlantContext } from "@/lib/plant-context";
import { useDensity } from "@/hooks/use-presentation";
import { useGuidedTour, hasTourRun, type TourStep } from "@/hooks/use-guided-tour";
import type { PlantDTO } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

/** Build a PlantDTO from the allPlants summary for admin multi-plant view */
function summaryToDTO(p: typeof allPlants[0]): PlantDTO {
  const dailyLossINR = p.criticalCount * 180 + p.mediumCount * 80;
  return {
    id: p.id,
    name: p.name,
    location: p.location,
    capacityMW: p.capacityMW,
    totalPanels: p.totalPanels,
    lastInspection: p.lastInspection,
    nextInspection: p.nextInspection,
    healthScore: p.healthScore,
    dailyLossINR,
    dailyLossKWh: Math.round(dailyLossINR / 4.5),
    feedInTariff: 4.5,
    lat: p.gps.lat,
    lng: p.gps.lng,
  };
}

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — UrjaScan" },
      { name: "description", content: "Plant health score, anomaly counts, and energy loss for your solar plant." },
    ],
  }),
  component: Dashboard,
});

/**
 * The prospect-landing tour. Every target here is a `data-tour` id set on
 * ExecutiveOverview's three KPIs or on the header nav (AppHeader.tsx /
 * MobileBottomNav.tsx) — nothing points inside the map, per this task's
 * guardrail against touching core map components. The tour ends by pointing at
 * Map and Reports rather than trying to explain them on this page, since the
 * whole point of "friction-free" is to hand off to the real thing quickly
 * rather than narrate it from a distance.
 */
const DASHBOARD_TOUR: TourStep[] = [
  {
    target: "kpi-defects",
    title: "Total Defects Found",
    body: "Every issue our drone thermography flagged across the site, from a single warm cell to a dead string.",
  },
  {
    target: "kpi-loss",
    title: "Estimated Generation Loss",
    body: "What these defects are costing in lost energy right now, every day they go unrepaired.",
  },
  {
    target: "kpi-health",
    title: "Site Health Score",
    body: "The share of panels operating normally. 100% would mean the drone found nothing to flag.",
  },
  {
    target: "nav-map",
    title: "See exactly where",
    body: "The Map shows every defect on the real layout of your site, down to the individual panel.",
  },
  {
    target: "nav-reports",
    title: "Take it with you",
    body: "IEC 62446-3 certified inspection reports, ready to download any time from here.",
  },
];

function trendLabel(curr: number, prev: number, unit = "from last inspection") {
  const diff = curr - prev;
  if (diff > 0) return `↑ ${diff} ${unit}`;
  if (diff < 0) return `↓ ${Math.abs(diff)} ${unit}`;
  return "No change from last inspection";
}

function Dashboard() {
  const { t } = useI18n();
  const user = getUser();
  const isAdmin = user?.role === "admin";
  // Prospect density is the default state for a client, and for team/admin
  // while Presentation Mode is on (lib/presentation.ts) — see the header
  // comment on ExecutiveOverview for what changes between the two.
  const isProspectView = useDensity(user?.role) === "prospect";
  const tour = useGuidedTour(DASHBOARD_TOUR, "urjascan.tour.dashboard.v1");

  // Plant selection from shared context (driven by header dropdown)
  const { selectedPlantId, setSelectedPlantId, selectedPlant: selectedSummary } = usePlantContext();

  const { data: fetchedPlant, isLoading: plantLoading, isError: plantError } = usePlant();
  const { data: anomalies = [], isLoading: anomaliesLoading, isError: anomaliesError } = useAnomalies();
  const { data: history = [], isLoading: historyLoading } = useInspectionHistory();

  // For admin: use allPlants data for the selected plant; anomalies/history remain Rajpur mock
  const plant: PlantDTO | undefined = isAdmin ? summaryToDTO(selectedSummary) : fetchedPlant;
  const isLoading = isAdmin ? false : (plantLoading || anomaliesLoading || historyLoading);
  const isError = !isAdmin && (plantError || anomaliesError);

  // After 7 s of unresolved loading, show a retry prompt instead of infinite skeleton
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) { setTimedOut(false); return; }
    const t = setTimeout(() => setTimedOut(true), 7000);
    return () => clearTimeout(t);
  }, [isLoading]);

  // Auto-launch the tour once per session for a prospect-density viewer, once
  // the real numbers have painted — starting it against a loading skeleton
  // would spotlight nothing. hasTourRun() is a plain sessionStorage read (see
  // hooks/use-guided-tour.tsx), so this never re-fires after the first visit
  // this session, and never fires at all for an operator who hasn't turned on
  // Presentation Mode.
  useEffect(() => {
    if (!isProspectView || isLoading || hasTourRun("urjascan.tour.dashboard.v1")) return;
    const t = setTimeout(() => tour.start(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProspectView, isLoading]);

  if (isError || (isLoading && timedOut)) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24 flex flex-col items-center gap-4 text-center">
        <p className="text-foreground font-semibold">Could not load plant data</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          {isError ? "The server returned an error." : "Data is taking longer than expected."} Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 h-9 px-4 bg-ochre hover:bg-ochre-light text-ochre-fg text-sm font-semibold"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (isLoading || !plant) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-grey-100" />
          <div className="h-24 bg-grey-100" />
          <div className="h-16 bg-grey-100" />
        </div>
      </div>
    );
  }

  const critical = anomalies.filter(a => a.severity === "critical");
  const medium = anomalies.filter(a => a.severity === "medium");

  // For admin: use allPlants summary counts for selected plant; else use live anomaly counts
  const severityCounts = isAdmin
    ? {
        critical: selectedSummary.criticalCount,
        medium: selectedSummary.mediumCount,
        normal: selectedSummary.totalPanels - selectedSummary.criticalCount - selectedSummary.mediumCount,
      }
    : {
        critical: critical.length,
        medium: medium.length,
        normal: plant.totalPanels - critical.length - medium.length,
      };

  const last = history[history.length - 1];
  const prev = history[history.length - 2];

  const criticalTrend = prev ? trendLabel(last.critical, prev.critical) : "";
  const mediumTrend = prev ? trendLabel(last.medium, prev.medium) : "";
  const normalTrend = prev ? trendLabel(last.normal, prev.normal, "panels recovered") : "";

  const chartData = history.map(i => ({
    date: i.date.split(" ").slice(0, 2).join(" "),
    Critical: i.critical,
    Medium: i.medium,
    Normal: i.normal / 50,
  }));

  // Total findings across every severity — matches the count the anomalies
  // list and equipment-audit records already show, so a prospect never sees
  // two different "how many defects" numbers between screens.
  const totalDefectCount = isAdmin
    ? (selectedSummary.anomalyCount ?? selectedSummary.criticalCount + selectedSummary.mediumCount)
    : anomalies.length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">

      {/* ── Executive Overview — the clean landing state, before the granular
          breakdown below. Shown whenever density is "prospect": always for a
          real client, and for team/admin while Presentation Mode is on. */}
      {isProspectView && (
        <ExecutiveOverview
          defectCount={totalDefectCount}
          dailyLossKWh={plant.dailyLossKWh}
          dailyLossINR={plant.dailyLossINR}
          healthScore={plant.healthScore}
          onStartTour={tour.start}
        />
      )}
      <tour.Overlay />

      {/* ── Admin: plant selector — an operator control, so it stays hidden
          under Presentation Mode even though isAdmin is still true. */}
      {isAdmin && !isProspectView && (
        <section className="bg-card border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-widest text-grey-400 mb-1">Viewing Plant Data For</p>
            <div className="relative inline-block">
              <select
                value={selectedPlantId}
                onChange={e => setSelectedPlantId(e.target.value)}
                className="appearance-none h-9 pl-3 pr-8 border border-border bg-card text-foreground text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ochre cursor-pointer"
              >
                {allPlants.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.client}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{selectedSummary.location} · <span className="mono font-medium">{selectedSummary.capacityMW} MW</span></span>
            <span className={`font-semibold ${selectedSummary.status === "Inspection Overdue" ? "text-critical" : selectedSummary.status === "Under Review" ? "text-ochre-fg" : "text-normal"}`}>
              {selectedSummary.status}
            </span>
          </div>
        </section>
      )}

      {/* Hero — health gauge */}
      <section className="bg-card border border-border p-6 md:p-8 flex flex-col md:flex-row items-center gap-8">
        <HealthGauge value={plant.healthScore} />
        <div className="flex-1 text-center md:text-left">
          <p className="text-[11px] uppercase tracking-widest text-grey-400">{t("plant_health")}</p>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 text-foreground">{plant.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{plant.location} · <span className="mono">{plant.capacityMW} MW</span> · <span className="mono">{plant.totalPanels}</span> panels</p>
          <div className="mt-4 inline-flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t("last_inspected")}: <span className="text-foreground font-medium">{plant.lastInspection}</span></span>
            <span className="text-muted-foreground">{t("next")}: <span className="text-foreground font-medium">{plant.nextInspection}</span></span>
            {isAdmin && (() => {
              const inspector = teamMembers.find(m => m.id === selectedSummary.assignedInspectorId);
              return inspector
                ? <span className="text-muted-foreground">Inspector: <span className="text-foreground font-medium">{inspector.name}</span></span>
                : <span className="text-critical font-medium text-xs">⚠ No inspector assigned</span>;
            })()}
          </div>
        </div>
      </section>

      {/* Severity data tiles */}
      <section className="bg-card border border-border grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        <DataTile color="critical" count={severityCounts.critical} label={t("critical_anomalies")} sub={t("immediate")} trend={criticalTrend} total={plant.totalPanels} />
        <DataTile color="medium" count={severityCounts.medium} label={t("medium_anomalies")} sub={t("schedule_30")} trend={mediumTrend} total={plant.totalPanels} />
        <DataTile color="normal" count={severityCounts.normal} label={t("panels_healthy")} sub={t("no_action")} trend={normalTrend} total={plant.totalPanels} />
      </section>

      {/* Financial impact */}
      <section className="bg-primary text-white p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <div className="flex items-center gap-3 md:flex-1">
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center">
            <Zap size={18} className="text-ochre" />
          </div>
          <div>
            <p className="text-sm text-white/70">{t("est_daily_loss")}</p>
            <p className="text-xs text-white/50 mt-0.5">Based on ₹ {plant.feedInTariff.toFixed(2)}/kWh feed-in tariff</p>
          </div>
        </div>
        <div className="md:text-center">
          <p className="mono text-3xl md:text-4xl font-bold text-ochre">₹ {plant.dailyLossINR.toLocaleString("en-IN")} <span className="text-base font-normal text-white/70">/ day</span></p>
        </div>
        <div className="md:text-right">
          <p className="mono text-lg text-white/90">≈ {plant.dailyLossKWh} kWh lost</p>
          <p className="text-xs text-white/50">≈ ₹ {(plant.dailyLossINR * 30).toLocaleString("en-IN")}/month</p>
        </div>
      </section>

      {/* Primary actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link to="/map" className="h-12 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold flex items-center justify-center gap-2 transition text-sm">
          <Map size={18} /> {t("view_map")}
        </Link>
        <Link to="/anomalies" className="h-12 bg-card border border-border text-foreground font-semibold flex items-center justify-center gap-2 hover:bg-grey-50 transition text-sm">
          <ClipboardList size={18} /> {t("see_all")}
        </Link>
      </section>

      {/* Critical anomalies — only shown when anomaly detail data is available */}
      {isAdmin && selectedSummary.id !== allPlants[0].id ? (
        <section className="bg-card border border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Detailed panel-level anomaly data for <span className="font-semibold text-foreground">{selectedSummary.name}</span> will appear here after the first inspection is processed.
          </p>
        </section>
      ) : (
      <section className="bg-card border border-border overflow-hidden">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
            <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--critical)", flexShrink: 0 }} />
            Critical — Needs Immediate Attention
          </h2>
          <Link to="/anomalies" className="text-xs font-medium text-ochre hover:underline inline-flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </header>
        <div className="divide-y divide-border">
          {critical.slice(0, 3).map(a => (
            <Link
              key={a.id}
              to="/anomalies/$id"
              params={{ id: a.id }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-grey-25 transition group"
            >
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
                <span className="mono font-semibold text-foreground text-sm">{a.panelId}</span>
                <span className="text-sm text-foreground">{a.type}</span>
                <span className="mono text-sm font-semibold text-critical">
                  {a.deltaT ? `+${a.deltaT}°C` : "—"}
                </span>
                <SeverityBadge severity={a.severity} />
              </div>
              <ArrowRight size={14} className="text-muted-foreground group-hover:text-ochre transition" />
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* History chart — only for plants with inspection history data */}
      {(!isAdmin || selectedSummary.id === allPlants[0].id) && chartData.length > 0 && (
        <section className="bg-card border border-border p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4 text-sm">
            <TrendingUp size={16} className="text-ochre" /> Inspection History
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grey-200)" />
                <XAxis dataKey="date" stroke="var(--grey-400)" fontSize={11} />
                <YAxis stroke="var(--grey-400)" fontSize={11} />
                <Tooltip contentStyle={{ border: "1px solid var(--grey-200)", borderRadius: 2, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Critical" stroke="var(--critical)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Medium" stroke="var(--medium)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Normal" stroke="var(--normal)" strokeWidth={2} dot={{ r: 3 }} name="Normal (÷50)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

function DataTile({
  color, count, label, sub, trend, total,
}: { color: "critical" | "medium" | "normal"; count: number; label: string; sub: string; trend: string; total?: number }) {
  const textColor = { critical: "text-critical", medium: "text-medium", normal: "text-normal" }[color];
  const dotColor = { critical: "var(--critical)", medium: "var(--medium)", normal: "var(--normal)" }[color];
  const pct = total && total > 0 ? ((count / total) * 100).toFixed(1) : null;
  return (
    <div className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <p className={`mono text-4xl font-bold ${textColor} leading-none`}>{count.toLocaleString("en-IN")}</p>
            {pct && <span className={`mono text-sm font-medium ${textColor} opacity-60`}>{pct}%</span>}
          </div>
          <p className="font-semibold text-foreground mt-3 text-sm flex items-center gap-1.5">
            <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: dotColor, flexShrink: 0 }} />
            {label}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3 mono">{trend}</p>
    </div>
  );
}

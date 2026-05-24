import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, Map, ClipboardList, TrendingUp, ArrowRight } from "lucide-react";
import { HealthGauge } from "@/components/HealthGauge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { useI18n } from "@/lib/i18n";
import { usePlant, useAnomalies, useInspectionHistory } from "@/lib/queries";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — UrjaScan" },
      { name: "description", content: "Plant health score, anomaly counts, and energy loss for your solar plant." },
    ],
  }),
  component: Dashboard,
});

function trendLabel(curr: number, prev: number, unit = "from last inspection") {
  const diff = curr - prev;
  if (diff > 0) return `↑ ${diff} ${unit}`;
  if (diff < 0) return `↓ ${Math.abs(diff)} ${unit}`;
  return "No change from last inspection";
}

function Dashboard() {
  const { t } = useI18n();
  const { data: plant, isLoading: plantLoading } = usePlant();
  const { data: anomalies = [], isLoading: anomaliesLoading } = useAnomalies();
  const { data: history = [], isLoading: historyLoading } = useInspectionHistory();

  const isLoading = plantLoading || anomaliesLoading || historyLoading;

  if (isLoading || !plant) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-grey-100 rounded" />
          <div className="h-24 bg-grey-100 rounded" />
          <div className="h-16 bg-grey-100 rounded" />
        </div>
      </div>
    );
  }

  const critical = anomalies.filter(a => a.severity === "critical");
  const medium = anomalies.filter(a => a.severity === "medium");

  const severityCounts = {
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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Hero — health gauge */}
      <section className="bg-white border border-grey-200 p-6 md:p-8 flex flex-col md:flex-row items-center gap-8">
        <HealthGauge value={plant.healthScore} />
        <div className="flex-1 text-center md:text-left">
          <p className="text-[11px] uppercase tracking-widest text-grey-400">{t("plant_health")}</p>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 text-foreground">{plant.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{plant.location} · <span className="mono">{plant.capacityMW} MW</span> · <span className="mono">{plant.totalPanels}</span> panels</p>
          <div className="mt-4 inline-flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t("last_inspected")}: <span className="text-foreground font-medium">{plant.lastInspection}</span></span>
            <span className="text-muted-foreground">{t("next")}: <span className="text-foreground font-medium">{plant.nextInspection}</span></span>
          </div>
        </div>
      </section>

      {/* Severity data tiles */}
      <section className="bg-white border border-grey-200 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-grey-200">
        <DataTile color="critical" count={severityCounts.critical} label={t("critical_anomalies")} sub={t("immediate")} trend={criticalTrend} />
        <DataTile color="medium" count={severityCounts.medium} label={t("medium_anomalies")} sub={t("schedule_30")} trend={mediumTrend} />
        <DataTile color="normal" count={severityCounts.normal} label={t("panels_healthy")} sub={t("no_action")} trend={normalTrend} />
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
        <Link to="/anomalies" className="h-12 bg-white border border-grey-200 text-foreground font-semibold flex items-center justify-center gap-2 hover:bg-grey-50 transition text-sm">
          <ClipboardList size={18} /> {t("see_all")}
        </Link>
      </section>

      {/* Critical anomalies */}
      <section className="bg-white border border-grey-200 overflow-hidden">
        <header className="px-5 py-3 border-b border-grey-200 flex items-center justify-between">
          <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
            <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--critical)", flexShrink: 0 }} />
            Critical — Needs Immediate Attention
          </h2>
          <Link to="/anomalies" className="text-xs font-medium text-ochre hover:underline inline-flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </header>
        <div className="divide-y divide-grey-200">
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
                <span className="mono text-sm font-semibold text-critical">+{a.deltaT}°C</span>
                <SeverityBadge severity={a.severity} />
              </div>
              <ArrowRight size={14} className="text-muted-foreground group-hover:text-ochre transition" />
            </Link>
          ))}
        </div>
      </section>

      {/* History chart */}
      {chartData.length > 0 && (
        <section className="bg-white border border-grey-200 p-5">
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
  color, count, label, sub, trend,
}: { color: "critical" | "medium" | "normal"; count: number; label: string; sub: string; trend: string }) {
  const textColor = { critical: "text-critical", medium: "text-medium", normal: "text-normal" }[color];
  const dotColor = { critical: "var(--critical)", medium: "var(--medium)", normal: "var(--normal)" }[color];
  return (
    <div className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className={`mono text-4xl font-bold ${textColor} leading-none`}>{count.toLocaleString("en-IN")}</p>
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

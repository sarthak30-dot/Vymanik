import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth";
import {
  Building2, Users, AlertTriangle, CheckCircle2, Clock, Plane,
  ChevronRight, Wifi, WifiOff, Activity, Shield,
} from "lucide-react";
import {
  allPlants, teamMembers, reviewQueue,
  type TeamMember, type PlantSummary,
} from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Control Center — UrjaScan" }] }),
  component: ControlCenter,
});

// ─── Status badges ─────────────────────────────────────────────────────────

function MemberStatusBadge({ status }: { status: TeamMember["status"] }) {
  const cfg = {
    "On Mission":  { bg: "bg-ochre-muted border-ochre/30", dot: "bg-ochre",   text: "text-ochre-fg" },
    "Active":      { bg: "bg-normal/10 border-normal/30",  dot: "bg-normal",  text: "text-normal" },
    "Off Duty":    { bg: "bg-grey-100 border-grey-200",    dot: "bg-grey-400", text: "text-muted-foreground" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-2 py-0.5 ${cfg.bg} ${cfg.text}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

function PlantStatusBadge({ status }: { status: PlantSummary["status"] }) {
  const cfg = {
    "Operational":         { bg: "bg-normal/10 border-normal/30", text: "text-normal" },
    "Under Review":        { bg: "bg-ochre-muted border-ochre/30", text: "text-ochre-fg" },
    "Inspection Overdue":  { bg: "bg-critical/10 border-critical/30", text: "text-critical" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-2 py-0.5 ${cfg.bg} ${cfg.text}`}>
      {status}
    </span>
  );
}

// ─── Health score pill ──────────────────────────────────────────────────────

function HealthPill({ score }: { score: number }) {
  const color = score >= 90 ? "text-normal" : score >= 75 ? "text-ochre-fg" : "text-critical";
  return <span className={`mono font-bold text-sm ${color}`}>{score}</span>;
}

// ─── Assign inspector modal ─────────────────────────────────────────────────

function AssignModal({
  plant,
  onClose,
}: {
  plant: PlantSummary;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(plant.assignedInspectorId ?? "");
  const available = teamMembers.filter(m => m.status !== "Off Duty");

  function handleAssign() {
    const member = teamMembers.find(m => m.id === selected);
    toast.success(`${member?.name ?? "Inspector"} assigned to ${plant.name}`, {
      description: "Plant owner and inspector have been notified.",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-grey-200 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">Assign Inspector</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Assigning to: <span className="font-semibold text-foreground">{plant.name}</span>
          </p>
          <div className="space-y-2">
            {available.map(m => (
              <label key={m.id} className={`flex items-center gap-3 p-3 border cursor-pointer transition ${selected === m.id ? "border-ochre bg-ochre-muted" : "border-grey-200 hover:bg-grey-50"}`}>
                <input
                  type="radio"
                  name="inspector"
                  value={m.id}
                  checked={selected === m.id}
                  onChange={() => setSelected(m.id)}
                  className="accent-ochre"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.droneModel.split("+")[0].trim()}</p>
                </div>
                <MemberStatusBadge status={m.status} />
              </label>
            ))}
          </div>
          <button
            onClick={handleAssign}
            disabled={!selected}
            className="w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

function ControlCenter() {
  const navigate = useNavigate();
  const user = getUser();
  const [assignPlant, setAssignPlant] = useState<PlantSummary | null>(null);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      navigate({ to: "/dashboard" });
    }
  }, []);

  if (!user || user.role !== "admin") return null;

  // Fleet summary numbers
  const totalCritical = allPlants.reduce((s, p) => s + p.criticalCount, 0);
  const totalPanels = allPlants.reduce((s, p) => s + p.totalPanels, 0);
  const onMission = teamMembers.filter(m => m.status === "On Mission").length;
  const overdueCount = allPlants.filter(p => p.status === "Inspection Overdue").length;
  const pendingReviews = reviewQueue.filter(j => j.stage === "Ready").length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">

      {/* ── Header ── */}
      <section className="bg-primary text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-14 h-14 bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
          <Shield size={24} className="text-ochre" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">Control Center</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Vymanik Aerospace — Operations</h1>
          <p className="text-white/60 mt-1 text-sm">
            Fleet management, inspector assignments, and cross-plant anomaly oversight.
          </p>
        </div>
        {/* Fleet quick-stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 shrink-0">
          {[
            { label: "Plants", value: allPlants.length, icon: Building2 },
            { label: "Inspectors", value: teamMembers.length, icon: Users },
            { label: "On Mission", value: onMission, icon: Activity },
            { label: "Critical", value: totalCritical, icon: AlertTriangle },
          ].map(s => (
            <div key={s.label} className="bg-white/5 px-4 py-3 text-center">
              <p className="mono text-2xl font-bold text-ochre">{s.value}</p>
              <p className="text-[11px] text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Status alerts bar ── */}
      {(overdueCount > 0 || pendingReviews > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {overdueCount > 0 && (
            <div className="bg-critical/5 border border-critical/20 px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-critical shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{overdueCount} plant{overdueCount > 1 ? "s" : ""}</span> with inspection overdue. Assign an inspector immediately.
              </p>
            </div>
          )}
          {pendingReviews > 0 && (
            <div className="bg-ochre-muted border border-ochre/20 px-4 py-3 flex items-center gap-3">
              <Clock size={16} className="text-ochre shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-semibold">{pendingReviews} job{pendingReviews > 1 ? "s" : ""}</span> ready for analyst sign-off.{" "}
                <Link to="/team" className="text-ochre font-medium hover:underline">Review in Inspector Portal →</Link>
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Team assignments ── */}
      <section className="bg-white border border-grey-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Users size={14} className="text-ochre" /> Team Members & Assignments
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Current status and plant assignments for all Vymanik Aerospace inspectors.
            </p>
          </div>
        </header>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-grey-50 text-[11px] uppercase tracking-widest text-grey-400 border-b border-grey-200">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Inspector</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Assigned Plant</th>
                <th className="text-left px-4 py-3 font-semibold">Drone</th>
                <th className="text-left px-4 py-3 font-semibold">Inspections</th>
                <th className="text-left px-4 py-3 font-semibold">Last Active</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(m => {
                const plant = m.assignedPlantId ? allPlants.find(p => p.id === m.assignedPlantId) : null;
                return (
                  <tr key={m.id} className="border-b border-grey-200 hover:bg-grey-25">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {m.initials}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4"><MemberStatusBadge status={m.status} /></td>
                    <td className="px-4 py-4">
                      {plant ? (
                        <div>
                          <p className="font-medium text-sm">{plant.name}</p>
                          <p className="text-xs text-muted-foreground">{plant.client}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground max-w-[160px] truncate">
                      {m.droneModel.split("+")[0].trim()}
                    </td>
                    <td className="px-4 py-4">
                      <p className="mono font-bold text-sm">{m.inspectionsCompleted}</p>
                      <p className="text-[10px] text-muted-foreground">{m.anomaliesFound} anomalies</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground mono">{m.lastActive}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => {
                          const plant = allPlants.find(p => p.assignedInspectorId === m.id) ?? allPlants[0];
                          setAssignPlant(plant);
                        }}
                        className="h-7 px-3 border border-grey-200 text-xs font-medium hover:bg-grey-50"
                      >
                        Reassign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-grey-200">
          {teamMembers.map(m => {
            const plant = m.assignedPlantId ? allPlants.find(p => p.id === m.assignedPlantId) : null;
            return (
              <div key={m.id} className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {m.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{m.name}</p>
                    <MemberStatusBadge status={m.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                  {plant ? (
                    <p className="text-xs mt-1">→ <span className="font-medium">{plant.name}</span></p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Unassigned</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mono mt-1">
                    {m.inspectionsCompleted} inspections · {m.anomaliesFound} anomalies
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Plant fleet overview ── */}
      <section className="bg-white border border-grey-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Building2 size={14} className="text-ochre" /> Plant Fleet — {allPlants.length} Sites · {totalPanels.toLocaleString()} Panels
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click "Assign" to change the inspector for any plant.
          </p>
        </header>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-grey-50 text-[11px] uppercase tracking-widest text-grey-400 border-b border-grey-200">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Plant / Client</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Health</th>
                <th className="text-left px-4 py-3 font-semibold">Critical</th>
                <th className="text-left px-4 py-3 font-semibold">Inspector</th>
                <th className="text-left px-4 py-3 font-semibold">Next Inspection</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {allPlants.map(p => {
                const inspector = p.assignedInspectorId
                  ? teamMembers.find(m => m.id === p.assignedInspectorId)
                  : null;
                return (
                  <tr key={p.id} className="border-b border-grey-200 hover:bg-grey-25">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.client} · {p.location} · <span className="mono">{p.capacityMW} MW</span></p>
                    </td>
                    <td className="px-4 py-4"><PlantStatusBadge status={p.status} /></td>
                    <td className="px-4 py-4"><HealthPill score={p.healthScore} /></td>
                    <td className="px-4 py-4">
                      {p.criticalCount > 0
                        ? <span className="mono font-bold text-critical">{p.criticalCount}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      {inspector ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                            {inspector.initials}
                          </div>
                          <span className="text-sm">{inspector.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-critical font-medium">⚠ Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs mono text-muted-foreground">{p.nextInspection}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setAssignPlant(p)}
                        className="h-7 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-grey-200">
          {allPlants.map(p => {
            const inspector = p.assignedInspectorId
              ? teamMembers.find(m => m.id === p.assignedInspectorId)
              : null;
            return (
              <div key={p.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.client} · {p.location}</p>
                  </div>
                  <PlantStatusBadge status={p.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Health: <HealthPill score={p.healthScore} /></span>
                  {p.criticalCount > 0 && <span className="text-critical font-semibold">{p.criticalCount} critical</span>}
                  <span className="mono">{p.nextInspection}</span>
                </div>
                <div className="flex items-center justify-between">
                  {inspector ? (
                    <p className="text-xs">Inspector: <span className="font-semibold">{inspector.name}</span></p>
                  ) : (
                    <p className="text-xs text-critical font-medium">⚠ No inspector assigned</p>
                  )}
                  <button
                    onClick={() => setAssignPlant(p)}
                    className="h-7 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs"
                  >
                    Assign
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Processing queue summary ── */}
      <section className="bg-white border border-grey-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Plane size={14} className="text-ochre" /> Active Processing Jobs
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Jobs currently in the TGIS pipeline.</p>
          </div>
          <Link to="/team" className="text-xs font-medium text-ochre hover:underline inline-flex items-center gap-1">
            Full Inspector Portal <ChevronRight size={12} />
          </Link>
        </header>
        <div className="divide-y divide-grey-200">
          {reviewQueue.map(j => (
            <div key={j.uploadId} className="px-5 py-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">{j.plant}</p>
                <p className="text-xs text-muted-foreground">{j.client} · Pilot: {j.pilot}</p>
              </div>
              <div className="text-right shrink-0">
                {j.stage === "Ready" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-normal/30 bg-normal/10 text-normal px-2 py-0.5">
                    <CheckCircle2 size={11} /> Ready for Review
                  </span>
                ) : j.stage === "Failed" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-critical/30 bg-critical/10 text-critical px-2 py-0.5">
                    <WifiOff size={11} /> Failed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-grey-200 bg-grey-50 px-2 py-0.5">
                    <Wifi size={11} className="text-ochre" /> {j.stage} · {j.progressPct}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Assign modal */}
      {assignPlant && (
        <AssignModal plant={assignPlant} onClose={() => setAssignPlant(null)} />
      )}
    </div>
  );
}

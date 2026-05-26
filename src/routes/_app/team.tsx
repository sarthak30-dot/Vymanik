import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getUser } from "@/lib/auth";
import { Upload, Image as ImageIcon, Plane, ClipboardCheck, Send, Layers, Cpu, AlertTriangle, CheckCircle2, User2, MapPin } from "lucide-react";
import { reviewQueue, teamMembers, allPlants, anomalyTypes, getTeamMemberByEmail, type QueueEntry } from "@/lib/mock-data";
import type { ProcessingStage } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/team")({
  head: () => ({ meta: [{ title: "Inspector Portal — UrjaScan" }] }),
  component: TeamDashboard,
});

// ─── Pipeline stage config ─────────────────────────────────────────────────

const STAGES: { key: ProcessingStage; label: string; detail: string }[] = [
  { key: "Queued",       label: "Queued",        detail: "Job waiting for a Fly.io compute slot" },
  { key: "Uploading",    label: "Upload to R2",  detail: "Streaming chunks to Cloudflare R2 object storage" },
  { key: "Stitching",    label: "ODM Stitch",    detail: "OpenDroneMap assembles thermal + RGB images into an orthomosaic GeoTIFF (25–40 min for 5 GB)" },
  { key: "Tiling",       label: "GDAL Tiling",   detail: "gdal2tiles generates XYZ tile pyramid (z 0–20) → Cloud-Optimized GeoTIFF pushed to R2" },
  { key: "AI Detection", label: "AI Detection",  detail: "YOLOv8 scans thermal tiles for ΔT > 15°C candidates; hotspot bboxes projected to GPS panel IDs" },
  { key: "Ready",        label: "Ready",         detail: "Anomaly rows written to D1; WS event pushed; analyst sign-off unlocked" },
];

const STAGE_DOT: Record<ProcessingStage, string> = {
  Queued:       "var(--grey-400)",
  Uploading:    "var(--medium)",
  Stitching:    "var(--medium)",
  Tiling:       "var(--medium)",
  "AI Detection": "var(--ochre)",
  Ready:        "var(--normal)",
  Failed:       "var(--critical)",
};

const stageIndex = (s: ProcessingStage) => STAGES.findIndex(st => st.key === s);

// ─── Stage badge ───────────────────────────────────────────────────────────

function StageBadge({ stage, pct }: { stage: ProcessingStage; pct: number }) {
  const dotColor = STAGE_DOT[stage];
  const label = stage === "AI Detection" ? `AI Detection · ${pct}%`
    : stage === "Failed" ? "Failed"
    : stage === "Ready" ? "Ready"
    : `${stage} · ${pct}%`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold border border-grey-200 bg-grey-25 px-2 py-1" style={{ borderRadius: "0.125rem" }}>
      <span
        aria-hidden
        style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: dotColor, flexShrink: 0 }}
      />
      {label}
    </span>
  );
}

// ─── Progress bar ──────────────────────────────────────────────────────────

function StageBar({ stage, pct }: { stage: ProcessingStage; pct: number }) {
  const idx = stageIndex(stage);
  return (
    <div className="w-full">
      <div className="flex gap-[2px]">
        {STAGES.map((s, i) => {
          const done = i < idx || stage === "Ready";
          const active = i === idx && stage !== "Ready";
          return (
            <div key={s.key} className="flex-1 h-1 overflow-hidden bg-grey-200">
              <div
                className={`h-full transition-all ${done ? "bg-ochre" : active ? "bg-primary" : ""}`}
                style={{ width: done ? "100%" : active ? `${pct}%` : "0%" }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 mono">
        {STAGES[Math.min(idx, STAGES.length - 1)].label}
      </p>
    </div>
  );
}

// ─── Queue row (desktop table) ─────────────────────────────────────────────

function QueueRow({ entry }: { entry: QueueEntry }) {
  return (
    <tr className="border-b border-grey-200 hover:bg-grey-25 text-sm">
      <td className="px-4 py-4">
        <p className="font-semibold">{entry.client}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{entry.plant}</p>
      </td>
      <td className="px-4 py-4 text-muted-foreground text-xs mono">{entry.uploadedAt}</td>
      {/* Dataset size */}
      <td className="px-4 py-4">
        <div className="inline-flex items-center gap-1.5">
          <Layers size={12} className="text-ochre shrink-0" />
          <span className="mono font-semibold text-xs">{entry.datasetGB} GB</span>
        </div>
        {entry.tileCount && (
          <p className="text-[10px] text-muted-foreground mono mt-0.5">{entry.tileCount.toLocaleString()} tiles</p>
        )}
      </td>
      {/* Compute stage */}
      <td className="px-4 py-4 min-w-[160px]">
        <StageBadge stage={entry.stage} pct={entry.progressPct} />
        <div className="mt-2">
          <StageBar stage={entry.stage} pct={entry.progressPct} />
        </div>
      </td>
      <td className="px-4 py-4 mono">
        {entry.anomalyCount !== null
          ? <span className="text-critical font-semibold text-sm">{entry.anomalyCount}</span>
          : <span className="text-muted-foreground">—</span>
        }
      </td>
      <td className="px-4 py-4 text-right">
        <button
          disabled={entry.stage !== "Ready"}
          className="h-8 px-4 bg-ochre hover:bg-ochre-light disabled:opacity-40 disabled:cursor-not-allowed text-ochre-fg font-medium text-xs"
        >
          {entry.stage === "Ready" ? "Review" : "Processing…"}
        </button>
      </td>
    </tr>
  );
}

// ─── Pipeline diagram ──────────────────────────────────────────────────────

function PipelineDiagram() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <section className="bg-white border border-grey-200 p-5 md:p-6">
      <h2 className="font-semibold flex items-center gap-2 mb-1 text-sm">
        <Cpu size={15} className="text-ochre" /> TGIS Processing Pipeline
      </h2>
      <p className="text-xs text-muted-foreground mb-5">
        Each upload triggers an async job on the Fly.io compute worker. Hover a stage to see details.
      </p>
      <div className="flex flex-col md:flex-row items-stretch gap-1">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex md:flex-col items-center gap-1 flex-1">
            <button
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={`w-full flex-1 border px-3 py-2.5 text-center transition cursor-default ${
                active === i
                  ? "border-ochre bg-ochre-muted"
                  : "border-grey-200 bg-grey-50 hover:border-grey-400"
              }`}
            >
              <p className="text-xs font-semibold text-foreground">{s.label}</p>
            </button>
            {i < STAGES.length - 1 && (
              <span className="text-muted-foreground text-sm hidden md:block shrink-0">→</span>
            )}
          </div>
        ))}
      </div>
      {active !== null && (
        <div className="mt-3 bg-grey-50 border border-grey-200 px-4 py-3 text-sm text-foreground">
          <span className="font-semibold">{STAGES[active].label}: </span>
          {STAGES[active].detail}
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-px bg-grey-200 border border-grey-200">
        <div className="bg-white px-4 py-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1 text-sm">Storage — Cloudflare R2</p>
          Raw uploads + COG GeoTIFFs + XYZ tile pyramids. No egress fees for Workers reads.
        </div>
        <div className="bg-white px-4 py-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1 text-sm">Database — Cloudflare D1</p>
          Plants, anomalies, users, inspection history. SQLite at the edge, replicated globally.
        </div>
        <div className="bg-white px-4 py-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1 text-sm">Compute — Fly.io (8 vCPU / 32 GB)</p>
          ODM stitch + GDAL tiling + YOLOv8 inference. Jobs dispatched via Cloudflare Queues.
        </div>
      </div>
    </section>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

// ─── Report Anomaly form ────────────────────────────────────────────────────

function ReportAnomalyForm({ inspectorName }: { inspectorName: string }) {
  const [plantId, setPlantId] = useState("");
  const [panelId, setPanelId] = useState("");
  const [type, setType] = useState("");
  const [deltaT, setDeltaT] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plantId || !panelId || !type) return;
    setSubmitted(true);
    const plant = allPlants.find(p => p.id === plantId);
    toast.success(`Anomaly flagged on ${plant?.name ?? "plant"}`, {
      description: `Panel ${panelId} — ${type}${deltaT ? ` · ΔT +${deltaT}°C` : ""}. Plant owner will be notified.`,
    });
    // reset
    setPlantId(""); setPanelId(""); setType(""); setDeltaT(""); setNotes(""); setSubmitted(false);
  }

  return (
    <section className="bg-white border border-grey-200 p-5 md:p-6">
      <h2 className="font-semibold flex items-center gap-2 text-sm mb-1">
        <AlertTriangle size={15} className="text-critical" /> Report New Anomaly to Plant Owner
      </h2>
      <p className="text-xs text-muted-foreground mb-5">
        Flag a new finding during an active inspection. It will appear immediately on the plant owner's Anomalies page.
      </p>
      {submitted ? (
        <div className="flex items-center gap-2 text-normal text-sm py-4">
          <CheckCircle2 size={16} /> Anomaly reported. Plant owner has been notified.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Plant">
            <select
              required
              value={plantId}
              onChange={e => setPlantId(e.target.value)}
              className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
            >
              <option value="">Select plant…</option>
              {allPlants.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.client}</option>
              ))}
            </select>
          </Field>
          <Field label="Panel ID">
            <input
              required
              value={panelId}
              onChange={e => setPanelId(e.target.value)}
              placeholder="e.g. R14-M07"
              className="w-full h-9 px-3 border border-grey-200 bg-white text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre"
            />
          </Field>
          <Field label="Anomaly Type">
            <select
              required
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
            >
              <option value="">Select type…</option>
              {anomalyTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="ΔT above reference (°C) — optional">
            <input
              type="number"
              min={0}
              value={deltaT}
              onChange={e => setDeltaT(e.target.value)}
              placeholder="e.g. 47"
              className="w-full h-9 px-3 border border-grey-200 bg-white text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Inspection Notes">
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Describe what you observed in the RGB and thermal imagery…"
                className="w-full px-3 py-2 border border-grey-200 bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ochre"
              />
            </Field>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              className="h-9 px-5 bg-critical hover:opacity-90 text-white font-semibold text-sm"
            >
              Flag Anomaly
            </button>
            <p className="text-[11px] text-muted-foreground">
              Reported by <span className="font-medium text-foreground">{inspectorName}</span>
            </p>
          </div>
        </form>
      )}
    </section>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

function TeamDashboard() {
  const navigate = useNavigate();
  const user = getUser();
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!user || (user.role !== "team" && user.role !== "admin")) {
      navigate({ to: "/dashboard" });
    }
  }, []);

  if (!user || (user.role !== "team" && user.role !== "admin")) {
    return null;
  }

  // Resolve logged-in inspector's name from teamMembers
  const member = getTeamMemberByEmail(user.userId);
  const inspectorName = member?.name ?? user.userId;
  const assignedPlant = member?.assignedPlantId
    ? allPlants.find(p => p.id === member.assignedPlantId)
    : null;

  const pendingCount = reviewQueue.filter(j => j.stage === "Ready").length;
  const processingCount = reviewQueue.filter(j => j.stage !== "Ready" && j.stage !== "Failed").length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">

      {/* ── Personal welcome banner ── */}
      <section className="bg-primary text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-14 h-14 bg-white/10 border border-white/20 flex items-center justify-center text-white font-bold text-xl shrink-0">
          {member?.initials ?? "IN"}
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-widest text-white/50 mb-1">Inspector Portal</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Welcome back, {inspectorName}</h1>
          {member && (
            <p className="text-white/60 mt-1 text-sm">{member.droneModel} · {member.certifications.join(" · ")}</p>
          )}
        </div>
        {/* Personal stats */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-px bg-white/10 border border-white/10 shrink-0">
          {[
            { label: "Inspections", value: member?.inspectionsCompleted ?? 0 },
            { label: "Anomalies Found", value: member?.anomaliesFound ?? 0 },
          ].map(s => (
            <div key={s.label} className="bg-white/5 px-5 py-3 text-center">
              <p className="mono text-2xl font-bold text-ochre">{s.value}</p>
              <p className="text-[11px] text-white/50 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Assigned plant ── */}
      {assignedPlant ? (
        <section className="bg-white border border-grey-200 p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="w-9 h-9 bg-grey-50 border border-grey-200 flex items-center justify-center shrink-0">
            <MapPin size={16} className="text-ochre" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-widest text-grey-400 mb-0.5">Currently Assigned Plant</p>
            <p className="font-semibold text-foreground">{assignedPlant.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {assignedPlant.client} · {assignedPlant.location} · {assignedPlant.capacityMW} MW · {assignedPlant.totalPanels.toLocaleString()} panels
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="mono text-2xl font-bold text-foreground">{assignedPlant.healthScore}</p>
              <p className="text-[10px] text-muted-foreground">Health</p>
            </div>
            <div className="text-center">
              <p className="mono text-2xl font-bold text-critical">{assignedPlant.criticalCount}</p>
              <p className="text-[10px] text-muted-foreground">Critical</p>
            </div>
            <Link
              to="/anomalies"
              className="h-8 px-4 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs flex items-center"
            >
              View Anomalies
            </Link>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-grey-200 p-5 flex items-center gap-4">
          <User2 size={16} className="text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">No plant currently assigned. Contact your Control Center admin.</p>
        </section>
      )}

      {/* ── Pipeline stats ── */}
      <section className="bg-white border border-grey-200 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-grey-200">
        <TeamStat label="Jobs processing now" value={processingCount} icon={Plane} />
        <TeamStat label="Ready for analyst review" value={pendingCount} icon={ClipboardCheck} />
        <TeamStat label="Published to clients this month" value={3} icon={Send} />
      </section>

      {/* ── Report new anomaly ── */}
      <ReportAnomalyForm inspectorName={inspectorName} />

      {/* Pipeline diagram */}
      <PipelineDiagram />

      {/* Upload */}
      <section className="bg-white border border-grey-200 p-5 md:p-6">
        <h2 className="font-semibold flex items-center gap-2 text-sm"><Upload size={15} className="text-ochre" /> Upload New Inspection</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Client">
            <select className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre">
              <option value="">Select client...</option>
              <option>Greenko Energy</option>
              <option>Adani Green</option>
              <option>Torrent Power</option>
            </select>
          </Field>
          <Field label="Plant">
            <select className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre">
              <option value="">Select plant...</option>
              <option>Rajpur Solar Plant</option>
              <option>Jaisalmer Wind-Solar Hybrid</option>
              <option>Kutch Solar Phase II</option>
            </select>
          </Field>
          <Field label="Inspection Date">
            <input type="date" className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Pilot">
            <input
              defaultValue={inspectorName}
              placeholder="Pilot name"
              className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
            />
          </Field>
          <Field label="Drone Model">
            <select className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre">
              <option value="">Select drone model...</option>
              <option>DJI Matrice 350 RTK + FLIR Zenmuse XT2</option>
              <option>DJI Matrice 30T</option>
              <option>Parrot ANAFI Thermal</option>
              <option>Autel EVO II Dual 640T</option>
            </select>
          </Field>
          <Field label="Irradiance (W/m²)">
            <input placeholder="e.g. 850" className="w-full h-9 px-3 border border-grey-200 bg-white text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Wind Speed (m/s)">
            <input placeholder="e.g. 3.5" className="w-full h-9 px-3 border border-grey-200 bg-white text-sm mono focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
          <Field label="Cloud Cover">
            <input placeholder="e.g. Clear (< 10%)" className="w-full h-9 px-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre" />
          </Field>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); }}
          className={`mt-5 border-2 border-dashed p-8 text-center transition ${dragOver ? "border-ochre bg-ochre-muted" : "border-grey-200 bg-grey-50"}`}
        >
          <ImageIcon className="mx-auto text-muted-foreground" size={28} />
          <p className="mt-3 font-medium text-sm">Drop thermal + RGB images here</p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports .tiff (FLIR radiometric), .jpg, .png · Up to 10 GB per upload
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Files stream directly to Cloudflare R2 — upload is non-blocking
          </p>
          <button className="mt-4 h-8 px-4 bg-white border border-grey-200 text-xs font-medium hover:bg-grey-50">Browse Files</button>
        </div>

        <button className="mt-5 h-10 px-5 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm">
          Start Processing
        </button>
      </section>

      {/* Review queue — desktop table */}
      <section className="bg-white border border-grey-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-grey-200">
          <h2 className="font-semibold text-sm">Processing Queue</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Jobs running on Fly.io compute. Review is unlocked when stage reaches Ready.
          </p>
        </header>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-grey-50 text-[11px] uppercase tracking-widest text-grey-400 border-b border-grey-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Client / Plant</th>
                <th className="text-left px-4 py-3 font-semibold">Uploaded</th>
                <th className="text-left px-4 py-3 font-semibold">Dataset</th>
                <th className="text-left px-4 py-3 font-semibold">Compute Stage</th>
                <th className="text-left px-4 py-3 font-semibold">Anomalies</th>
                <th className="text-right px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {reviewQueue.map(entry => (
                <QueueRow key={entry.uploadId} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-grey-200">
          {reviewQueue.map(entry => (
            <div key={entry.uploadId} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{entry.client}</p>
                  <p className="text-xs text-muted-foreground">{entry.plant}</p>
                </div>
                <StageBadge stage={entry.stage} pct={entry.progressPct} />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Layers size={11} /> <span className="mono">{entry.datasetGB} GB</span></span>
                {entry.tileCount && <span className="mono">{entry.tileCount.toLocaleString()} tiles</span>}
                {entry.anomalyCount !== null && <span className="text-critical font-semibold mono">{entry.anomalyCount} anomalies</span>}
              </div>
              <StageBar stage={entry.stage} pct={entry.progressPct} />
              <button
                disabled={entry.stage !== "Ready"}
                className="w-full h-9 bg-ochre hover:bg-ochre-light disabled:opacity-40 disabled:cursor-not-allowed text-ochre-fg font-medium text-sm"
              >
                {entry.stage === "Ready" ? "Review & Publish" : "Processing…"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function TeamStat({ label, value, icon: Icon }: {
  label: string; value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="p-5 flex items-center gap-3">
      <Icon size={18} className="text-grey-400 shrink-0" />
      <div>
        <p className="mono text-3xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

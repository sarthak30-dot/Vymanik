import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Thermometer, ClipboardCheck, Database, BarChart2, Zap, FileSearch,
  Radio, Eye, MapPin, ArrowRight, Download, ChevronDown, ChevronUp,
  CheckCircle2, Clock, CalendarClock,
} from "lucide-react";
import {
  anomalies, plant, severityCounts, inspectionHistory,
  equipmentAudits, digitizationRecords,
  type EquipmentAudit, type AuditStatus,
} from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/services")({
  head: () => ({ meta: [{ title: "Inspection Services — UrjaScan" }] }),
  component: ServicesPage,
});

// ─── Service definitions ───────────────────────────────────────────────────

const COMING_SOON = [
  {
    id: "iv-testing",
    title: "IV Curve Testing",
    icon: BarChart2,
    description: "I-V and P-V curve tracing to identify module degradation, bypass diode failures, and mismatch losses at string level.",
  },
  {
    id: "el-testing",
    title: "EL Testing",
    icon: Zap,
    description: "Electroluminescence imaging reveals micro-cracks, finger interruptions, and cell defects invisible to standard IR cameras.",
  },
  {
    id: "tech-dd",
    title: "Technical Due Diligence",
    icon: FileSearch,
    description: "Independent technical assessment for M&A, refinancing, or insurance — covers design review, performance analysis, and risk.",
  },
  {
    id: "transmission",
    title: "Transmission Line Inspection",
    icon: Radio,
    description: "Aerial inspection of HV transmission lines, towers, and insulators using drone-mounted thermal and visual cameras.",
  },
  {
    id: "surveillance",
    title: "Surveillance & Mapping",
    icon: Eye,
    description: "Periodic drone-based perimeter surveillance, vegetation encroachment detection, soiling assessment, and topographic mapping.",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function AuditStatusChip({ status }: { status: AuditStatus }) {
  const cfg = {
    Completed:   { icon: CheckCircle2, color: "text-normal",   bg: "bg-normal/10",   label: "Completed"   },
    "In Progress": { icon: Clock,        color: "text-medium",   bg: "bg-medium/10",   label: "In Progress" },
    Scheduled:   { icon: CalendarClock, color: "text-grey-400", bg: "bg-grey-50",     label: "Scheduled"   },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 ${cfg.color} ${cfg.bg}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

// ─── Equipment Audit card ──────────────────────────────────────────────────

function EquipmentAuditCard() {
  const [open, setOpen] = useState(true);
  const lastInspection = inspectionHistory[inspectionHistory.length - 1];

  return (
    <div className="bg-white border border-grey-200">
      <div className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 flex items-center justify-center bg-normal/10 shrink-0">
          <ClipboardCheck size={18} className="text-normal" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Equipment Audit</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-normal bg-normal/10 px-2 py-0.5">Active</span>
            </div>
            <button
              onClick={() => setOpen(v => !v)}
              className="text-xs text-ochre font-medium flex items-center gap-1 hover:underline shrink-0"
            >
              {open ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> View Audits</>}
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Systematic inspection of all plant components — PV modules, inverters, mounting structures, DC/AC cabling, and BOS equipment.
          </p>

          {/* Quick stats */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground mono">{equipmentAudits.filter(a => a.status === "Completed").length}</span> completed</span>
            <span><span className="font-semibold text-medium mono">{equipmentAudits.filter(a => a.status === "In Progress").length}</span> in progress</span>
            <span><span className="font-semibold text-grey-400 mono">{equipmentAudits.filter(a => a.status === "Scheduled").length}</span> scheduled</span>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-grey-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-grey-50 text-[11px] uppercase tracking-widest text-grey-400 border-b border-grey-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Audit Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">Started</th>
                <th className="text-left px-4 py-2.5 font-semibold">Completed</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Modules</th>
                <th className="text-left px-4 py-2.5 font-semibold">Findings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-200">
              {equipmentAudits.map(a => (
                <tr key={a.id} className="hover:bg-grey-25 transition">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{a.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.started}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.completed ?? "—"}</td>
                  <td className="px-4 py-3"><AuditStatusChip status={a.status} /></td>
                  <td className="px-4 py-3 mono">{a.modulesInspected > 0 ? a.modulesInspected.toLocaleString("en-IN") : "—"}</td>
                  <td className="px-4 py-3">
                    {a.findings > 0
                      ? <span className="mono font-semibold text-critical">{a.findings}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Thermal card ──────────────────────────────────────────────────────────

function ThermalAnomalyCard() {
  const last = inspectionHistory[inspectionHistory.length - 1];
  const critical = anomalies.filter(a => a.severity === "critical").length;
  const medium   = anomalies.filter(a => a.severity === "medium").length;

  return (
    <div className="bg-white border border-grey-200 p-5 flex items-start gap-4">
      <div className="w-10 h-10 flex items-center justify-center bg-ochre-muted shrink-0">
        <Thermometer size={18} className="text-ochre" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-foreground">Thermal Anomaly Detection</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ochre bg-ochre-muted px-2 py-0.5">IEC 62446-3</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-normal bg-normal/10 px-2 py-0.5">Active</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Drone-mounted FLIR thermography with YOLOv8 AI detection. Identifies hotspots, string failures, bypass diode faults, and PID with GPS-tagged ΔT measurements.
        </p>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-px bg-grey-200 border border-grey-200">
          <StatCell label="Critical" value={critical} color="text-critical" />
          <StatCell label="Medium" value={medium} color="text-medium" />
          <StatCell label="Total Panels" value={plant.totalPanels} color="text-foreground" />
          <StatCell label="Last Inspection" value={last.date} color="text-foreground" mono={false} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/anomalies"
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-xs"
          >
            View Anomalies <ArrowRight size={13} />
          </Link>
          <Link
            to="/map"
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-white border border-grey-200 text-foreground font-medium text-xs hover:bg-grey-50"
          >
            <MapPin size={13} /> Site Map
          </Link>
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 h-8 px-4 bg-white border border-grey-200 text-foreground font-medium text-xs hover:bg-grey-50"
          >
            Download Report
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, color, mono = true }: { label: string; value: number | string; color: string; mono?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-grey-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color} ${mono ? "font-mono" : ""}`}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </p>
    </div>
  );
}

// ─── Digitization card ─────────────────────────────────────────────────────

function DigitizationCard() {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white border border-grey-200">
      <div className="p-5 flex items-start gap-4">
        <div className="w-10 h-10 flex items-center justify-center bg-medium/10 shrink-0">
          <Database size={18} className="text-medium" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Plant Digitization</h3>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-normal bg-normal/10 px-2 py-0.5">Active</span>
            </div>
            <button
              onClick={() => setOpen(v => !v)}
              className="text-xs text-ochre font-medium flex items-center gap-1 hover:underline shrink-0"
            >
              {open ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> View Files</>}
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Georeferenced CAD layouts, string wiring diagrams, and panel-level asset mapping for your plant's digital records.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground mono">{digitizationRecords.length}</span> files available</span>
            <span>Last updated <span className="font-semibold text-foreground">12 Mar 2025</span></span>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-grey-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-grey-50 text-[11px] uppercase tracking-widest text-grey-400 border-b border-grey-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Document</th>
                <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold">Format</th>
                <th className="text-left px-4 py-2.5 font-semibold">Size</th>
                <th className="text-right px-4 py-2.5 font-semibold">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-200">
              {digitizationRecords.map(r => (
                <tr key={r.id} className="hover:bg-grey-25 transition">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold text-muted-foreground border border-grey-200 px-2 py-0.5">{r.type}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                  <td className="px-4 py-3 mono text-xs text-muted-foreground">{r.format}</td>
                  <td className="px-4 py-3 mono text-xs text-muted-foreground">{r.sizeLabel}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toast.success(`Downloading ${r.name}…`, { description: "Your file will be ready in a moment." })}
                      className="inline-flex items-center gap-1 text-ochre hover:underline font-medium text-xs"
                    >
                      <Download size={12} /> Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Coming Soon card ──────────────────────────────────────────────────────

function ComingSoonCard({ svc }: { svc: typeof COMING_SOON[number] }) {
  const Icon = svc.icon;
  return (
    <div className="bg-white border border-grey-200 p-5 flex flex-col gap-3 opacity-75">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center bg-grey-50 border border-grey-200 shrink-0">
          <Icon size={16} className="text-grey-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">{svc.title}</h3>
          <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-grey-400 bg-grey-100 px-2 py-0.5">
            Coming Soon
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{svc.description}</p>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

function ServicesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-8">

      {/* Header */}
      <header>
        <p className="text-[11px] uppercase tracking-widest text-grey-400">Vymanik Aerospace</p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">Inspection Services</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All drone inspection and analytics services for <span className="font-medium text-foreground">{plant.name}</span>.
        </p>
      </header>

      {/* Active Services */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-block w-2 h-2 bg-normal" style={{ borderRadius: "50%" }} />
          <h2 className="font-semibold text-sm uppercase tracking-widest text-grey-400">Active Services</h2>
        </div>
        <div className="space-y-4">
          <ThermalAnomalyCard />
          <EquipmentAuditCard />
          <DigitizationCard />
        </div>
      </section>

      {/* Coming Soon */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-block w-2 h-2 bg-grey-300" style={{ borderRadius: "50%" }} />
          <h2 className="font-semibold text-sm uppercase tracking-widest text-grey-400">Coming Soon</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {COMING_SOON.map(svc => (
            <ComingSoonCard key={svc.id} svc={svc} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Interested in any of these services?{" "}
          <a href="mailto:info@vymanik.com" className="text-ochre font-medium hover:underline">Contact Vymanik Aerospace</a>
          {" "}to get started.
        </p>
      </section>
    </div>
  );
}

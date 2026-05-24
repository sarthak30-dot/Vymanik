import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Download, Mail, MapPin, Check, Wrench, Loader2 } from "lucide-react";
import { SeverityBadge } from "@/components/SeverityBadge";
import { useAnomaly, usePatchAnomaly } from "@/lib/queries";
import type { AnomalyDTO } from "@/lib/api";

export const Route = createFileRoute("/_app/anomalies/$id")({
  head: ({ params }) => ({ meta: [{ title: `${params.id} — Anomaly Detail` }] }),
  component: AnomalyDetail,
});

const anomalyTypeDefs: Record<string, string> = {
  "Hotspot": "Localized overheated solar cell — caused by crack, shading, or reverse bias",
  "Multi Hotspot": "Multiple overheated cells in same module — elevated fire risk",
  "Bypassed Substring": "Faulty bypass diode causing heat across 1/3 of module",
  "Diode Failure": "Junction box bypass diode damaged — heat follows substring pattern",
  "String Open Circuit": "Entire string disconnected — 100% production loss on string",
  "PID Detected": "Potential Induced Degradation — up to 30% power loss",
  "PID": "Potential Induced Degradation — up to 30% power loss",
  "Heated Junction Box": "Abnormally warm terminal box — connection fault indicator",
  "Soiling": "Dust/bird droppings blocking panel — cleanable during next maintenance",
  "Shading": "Temporary shadow — monitor only",
  "Shaded Module": "Temporary shadow — monitor only",
};

type Status = AnomalyDTO["status"];
const STEPS: Status[] = ["New", "Acknowledged", "In Repair", "Closed"];

function AnomalyDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: anomaly, isLoading } = useAnomaly(id);
  const patchAnomaly = usePatchAnomaly();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Loading anomaly…
      </div>
    );
  }

  if (!anomaly) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center">
        <p className="text-muted-foreground">Anomaly not found.</p>
        <Link to="/anomalies" className="text-ochre hover:underline mt-3 inline-block">← Back to list</Link>
      </div>
    );
  }

  const currentIdx = STEPS.indexOf(anomaly.status);

  const whatsappMsg = encodeURIComponent(
    `[${anomaly.severity.toUpperCase()}] FAULT — UrjaScan Alert
Plant: Rajpur Solar Plant
Panel: ${anomaly.panelId} (Row ${anomaly.row}, Module ${anomaly.col})
Fault: ${anomaly.type}${anomaly.deltaT ? ` | ΔT: +${anomaly.deltaT}°C` : ""}
Action: Immediate repair needed
GPS: ${anomaly.gps.lat}°N, ${anomaly.gps.lng}°E`
  );

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      {anomaly.status === "Closed" && (
        <div className="flex items-center gap-2 px-4 py-2.5 border border-grey-200 bg-grey-25 text-sm">
          <span aria-hidden style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--normal)", flexShrink: 0 }} />
          <span className="text-foreground font-medium">Anomaly resolved</span>
          <span className="text-muted-foreground">— {anomaly.panelId} marked Closed</span>
        </div>
      )}

      <nav className="text-xs text-muted-foreground flex items-center gap-2">
        <button onClick={() => navigate({ to: "/dashboard" })} className="hover:text-foreground">Dashboard</button>
        <span>/</span>
        <Link to="/anomalies" className="hover:text-foreground">Anomaly List</Link>
        <span>/</span>
        <span className="text-foreground mono">{anomaly.panelId}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link to="/anomalies" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft size={12} /> Back
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold">Panel <span className="mono">{anomaly.panelId}</span></h1>
          <p className="text-muted-foreground mt-1 text-sm">{anomaly.type} · {anomaly.string} · {anomaly.inverter}</p>
        </div>
        <SeverityBadge severity={anomaly.severity} size="lg" />
      </div>

      {/* Images */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ThermalImage peak={anomaly.peakTemp ?? 89} />
        <RgbImage note={anomaly.rgbNote} />
      </section>

      {/* Data grid */}
      <section className="bg-white border border-grey-200 p-5 md:p-6">
        <h2 className="font-semibold mb-4 text-sm uppercase tracking-widest text-grey-400">Inspection Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <Detail label="Anomaly Type" value={anomaly.type} tooltip={anomalyTypeDefs[anomaly.type]} />
          <Detail label="GPS Coordinates" value={`${anomaly.gps.lat}° N, ${anomaly.gps.lng}° E`} mono extra={
            <a href={`https://www.google.com/maps?q=${anomaly.gps.lat},${anomaly.gps.lng}`} target="_blank" rel="noreferrer" className="text-ochre hover:underline text-xs inline-flex items-center gap-1 mt-1">
              <MapPin size={12} /> Open in Maps
            </a>
          } />
          {anomaly.deltaT && <Detail label="ΔT (Delta T)" value={`+${anomaly.deltaT}°C`} mono critical tooltip="ΔT ≥ 20°C = warranty claim eligible" />}
          <Detail label="String" value={anomaly.string} />
          {anomaly.peakTemp && <Detail label="Peak Cell Temperature" value={`${anomaly.peakTemp}°C`} mono />}
          <Detail label="Inverter" value={anomaly.inverter} />
          {anomaly.refTemp && <Detail label="Reference Cell Temp" value={`${anomaly.refTemp}°C`} mono />}
          {anomaly.moduleSerial && <Detail label="Module Serial #" value={anomaly.moduleSerial} mono />}
          {anomaly.irradiance && <Detail label="Irradiance at inspection" value={`${anomaly.irradiance} W/m²`} mono />}
          <Detail label="Inspection Date" value={`${anomaly.date}, ${anomaly.inspectionTime}`} />
        </div>
      </section>

      {/* Financial */}
      {anomaly.dailyLossINR && (
        <section className="bg-primary text-white p-6">
          <p className="font-semibold text-sm flex items-center gap-2 text-white/70 uppercase tracking-widest">Estimated Power Loss</p>
          <p className="mono text-4xl font-bold text-ochre mt-2">₹ {anomaly.dailyLossINR} <span className="text-base font-normal text-white/70">per day</span></p>
          <p className="text-white/70 text-sm mt-1 mono">≈ {anomaly.dailyLossKWh} kWh/day · ₹ {(anomaly.dailyLossINR * 30).toLocaleString("en-IN")}/month</p>
          {anomaly.severity === "critical" && (
            <p className="mt-3 inline-flex items-center gap-2 border border-critical/40 bg-white/5 text-white/80 px-3 py-1.5 text-xs">
              Risk: Panel fire possible if unresolved beyond 30 days
            </p>
          )}
        </section>
      )}

      {/* Recommendation */}
      <section className="bg-white border border-grey-200 p-5 md:p-6">
        <h2 className="font-semibold flex items-center gap-2 text-sm"><Wrench size={15} className="text-ochre" /> Recommended Action</h2>
        <p className="mt-3 text-foreground text-sm leading-relaxed">
          {anomaly.severity === "critical"
            ? "Immediate replacement or cell-level bypass required. Raise warranty claim with module manufacturer — ΔT exceeds 20°C warranty threshold."
            : anomaly.severity === "medium"
            ? "Schedule a maintenance visit within 30 days. Verify junction box wiring and bypass diode integrity."
            : "No urgent action required. Schedule cleaning during next routine O&M cycle."}
        </p>
      </section>

      {/* Status stepper */}
      <section className="bg-white border border-grey-200 p-5 md:p-6">
        <h2 className="font-semibold mb-5 text-sm">Status Workflow</h2>
        <div className="hidden sm:flex items-center justify-between">
          {STEPS.map((s, i) => {
            const done = i <= currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => patchAnomaly.mutate({ id: anomaly.id, status: s })}
                  disabled={patchAnomaly.isPending}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-10 h-10 flex items-center justify-center border-2 transition ${done ? "bg-ochre border-ochre text-ochre-fg" : "bg-white border-grey-200 text-muted-foreground"} ${active ? "ring-2 ring-ochre/30" : ""} group-hover:scale-105`}>
                    {done ? <Check size={16} /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <span className={`text-xs font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < currentIdx ? "bg-ochre" : "bg-grey-200"}`} />}
              </div>
            );
          })}
        </div>
        <div className="sm:hidden space-y-2">
          {STEPS.map((s, i) => {
            const done = i <= currentIdx;
            return (
              <button key={s} onClick={() => patchAnomaly.mutate({ id: anomaly.id, status: s })} className={`w-full flex items-center gap-3 p-3 border text-sm ${done ? "border-ochre bg-ochre-muted" : "border-grey-200 bg-white"}`}>
                <div className={`w-8 h-8 flex items-center justify-center ${done ? "bg-ochre text-ochre-fg" : "bg-grey-100 text-muted-foreground"}`}>
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span className="font-medium">{s}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Actions */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a href={`https://wa.me/?text=${whatsappMsg}`} target="_blank" rel="noreferrer" className="h-10 bg-[#25D366] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90">
          <MessageCircle size={16} /> Share on WhatsApp
        </a>
        <button className="h-10 bg-white border border-grey-200 text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-grey-50">
          <Download size={16} /> Download Fault Card PDF
        </button>
        <button className="h-10 bg-white border border-grey-200 text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-grey-50">
          <Mail size={16} /> Email to Team
        </button>
      </section>
    </div>
  );
}

function Detail({ label, value, mono, critical, tooltip, extra }: { label: string; value: string; mono?: boolean; critical?: boolean; tooltip?: string; extra?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-grey-400" title={tooltip}>
        {label}{tooltip && <span className="ml-1 text-ochre cursor-help">ⓘ</span>}
      </p>
      <p className={`mt-1 font-semibold text-sm ${mono ? "mono" : ""} ${critical ? "text-critical text-base" : "text-foreground"}`}>{value}</p>
      {extra}
    </div>
  );
}

function ThermalImage({ peak }: { peak: number }) {
  return (
    <div className="bg-white border border-grey-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-grey-200 flex items-center justify-between">
        <span className="font-semibold text-xs uppercase tracking-widest text-grey-400">Thermal Image (IR)</span>
        <span className="mono text-xs text-critical font-semibold">Peak: {peak}°C</span>
      </div>
      <div className="relative aspect-video">
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 62% 45%, #fff 0%, #ffeb3b 8%, #ff5722 16%, #d32f2f 24%, #6a1b9a 40%, #1a237e 70%, #0d1842 100%)" }} />
        <div className="absolute" style={{ left: "58%", top: "38%" }}>
          <div className="w-14 h-14 border-2 border-white animate-pulse" style={{ borderRadius: "50%" }} />
          <div className="absolute top-1/2 left-full ml-2 -translate-y-1/2 bg-black/80 text-white text-[10px] mono px-2 py-1">+{peak}°C</div>
        </div>
        <div className="absolute right-2 top-2 bottom-2 w-3" style={{ background: "linear-gradient(to top, #1a237e, #d32f2f, #ffeb3b, #fff)" }} />
        <div className="absolute right-6 top-2 text-[10px] mono text-white">{peak}°</div>
        <div className="absolute right-6 bottom-2 text-[10px] mono text-white">20°</div>
      </div>
    </div>
  );
}

function RgbImage({ note }: { note: string }) {
  return (
    <div className="bg-white border border-grey-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-grey-200 flex items-center justify-between">
        <span className="font-semibold text-xs uppercase tracking-widest text-grey-400">Visual Image (RGB)</span>
        <span className="text-xs text-muted-foreground max-w-[55%] text-right leading-tight">{note}</span>
      </div>
      <div className="relative aspect-video bg-gradient-to-br from-slate-700 to-slate-900">
        <div className="absolute inset-4 grid grid-cols-6 grid-rows-4 gap-[2px]">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-600/40" style={{ borderRadius: 1 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

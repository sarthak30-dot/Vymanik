import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, MessageCircle, Download, Mail, MapPin, Check, Wrench, Loader2, ExternalLink, Navigation } from "lucide-react";
import { SeverityBadge } from "@/components/SeverityBadge";
import { useAnomaly, usePatchAnomaly } from "@/lib/queries";
import { anomalyTypeDefs, plant, SEVERITY_LABEL } from "@/lib/mock-data";
import type { AnomalyDTO } from "@/lib/api";
import { parseDefectImage } from "@/lib/defect-image";

export const Route = createFileRoute("/_app/anomalies/$id")({
  head: () => ({ meta: [{ title: "Anomaly Detail — UrjaScan" }] }),
  component: AnomalyDetail,
});

type Status = AnomalyDTO["status"];
const STEPS: Status[] = ["New", "Acknowledged", "In Repair", "Closed"];

function AnomalyDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: anomaly, isLoading, isError } = useAnomaly(id);
  const patchAnomaly = usePatchAnomaly();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Loading anomaly…
      </div>
    );
  }

  if (isError || !anomaly) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center">
        <p className="text-muted-foreground">
          {isError ? "Failed to load anomaly data. Please try again." : "Anomaly not found."}
        </p>
        <Link to="/anomalies" className="text-ochre hover:underline mt-3 inline-block">← Back to list</Link>
      </div>
    );
  }

  const currentIdx = STEPS.indexOf(anomaly.status);

  const actionText =
    anomaly.severity === "critical" ? "⚠️ Immediate repair required" :
    anomaly.severity === "medium"   ? "Schedule maintenance within 30 days" :
    "Monitor — no urgent action";

  const whatsappMsg = encodeURIComponent(
`🔴 FAULT ALERT — UrjaScan
Plant: ${plant.name}
Panel: ${anomaly.panelId} (Row ${anomaly.row}, Module ${anomaly.col})
Type: ${anomaly.type}${anomaly.deltaT ? ` | ΔT: +${anomaly.deltaT}°C` : ""}
Severity: ${SEVERITY_LABEL[anomaly.severity]}
Action: ${actionText}
GPS: ${anomaly.gps.lat}°N, ${anomaly.gps.lng}°E
Navigate: https://www.google.com/maps?q=${anomaly.gps.lat},${anomaly.gps.lng}
Ref: ${anomaly.rgbNote}`
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
        <ThermalImage note={anomaly.rgbNote} peak={anomaly.peakTemp ?? 83} deltaT={anomaly.deltaT} />
        <RgbImage note={anomaly.rgbNote} />
      </section>

      {/* Data grid */}
      <section className="bg-card border border-border p-5 md:p-6">
        <h2 className="font-semibold mb-4 text-sm uppercase tracking-widest text-grey-400">Inspection Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <Detail label="Anomaly Type" value={anomaly.type} tooltip={anomalyTypeDefs[anomaly.type]} />
          <Detail label="GPS Coordinates" value={`${anomaly.gps.lat}° N, ${anomaly.gps.lng}° E`} mono extra={
            <div className="flex items-center gap-3 mt-1.5">
              <a href={`https://www.google.com/maps?q=${anomaly.gps.lat},${anomaly.gps.lng}`} target="_blank" rel="noreferrer" className="text-ochre hover:underline text-xs inline-flex items-center gap-1">
                <MapPin size={12} /> Open in Maps
              </a>
              <a href={`https://maps.google.com/maps?daddr=${anomaly.gps.lat},${anomaly.gps.lng}&dirflg=d`} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                <Navigation size={12} /> Navigate Here
              </a>
            </div>
          } />
          {anomaly.deltaT && <Detail label="ΔT (raw)" value={`+${anomaly.deltaT}°C`} mono critical tooltip="Measured temperature rise above reference panel" />}
          {anomaly.deltaTNorm && <Detail label="ΔT normalised @ 1000 W/m²" value={`+${anomaly.deltaTNorm}°C`} mono critical tooltip="IEC 62446-3 §6.3 — adjusted for actual irradiance (847 W/m²). Use this value for warranty claims." />}
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
      <section className="bg-card border border-border p-5 md:p-6">
        <h2 className="font-semibold flex items-center gap-2 text-sm"><Wrench size={15} className="text-ochre" /> Recommended Action</h2>
        <p className="mt-3 text-foreground text-sm leading-relaxed">
          {anomaly.type === "Diode Failure"
            ? "Bypass diode in junction box has failed — heat is following the substring pattern. Replace the faulty diode or the entire junction box assembly. Raise warranty claim if ΔT ≥ 20°C (IEC 62446-3 eligible)."
            : anomaly.type === "Multi-Module Hotspot"
            ? "Multiple full modules are overheating — elevated fire and degradation risk. Immediately dispatch field team for visual inspection. Disconnect string if temperature is rising."
            : anomaly.type === "Module Open Circuit"
            ? "Module is not producing output. Check string-level fuses, MC4 connectors, and module wiring harness. This is 100% production loss on the affected module."
            : anomaly.type === "Multi-Cell Hotspot"
            ? "Multiple cells overheating within one module — likely caused by micro-crack or partial soiling. Schedule maintenance within 30 days and monitor thermal signature at next inspection."
            : anomaly.type === "Vegetation/Multi-Cell Hotspot"
            ? "Vegetation shadow triggering cell-level hotspots. Clear vegetation around the panel row and re-inspect within 30 days to confirm whether the hotspot persists after shading is removed."
            : anomaly.type === "Cell Hotspot"
            ? "Single cell hotspot detected. Monitor at next inspection cycle. If ΔT remains above 15°C, schedule targeted maintenance."
            : anomaly.type === "Soiling"
            ? "Dust or bird droppings reducing output. Schedule panel cleaning during the next routine O&M visit. No urgent action required."
            : anomaly.type === "Shading"
            ? "Temporary shadow detected at time of inspection. No action required — monitor only. Verify obstruction has not grown since last survey."
            : anomaly.severity === "critical"
            ? "Immediate replacement or bypass required. ΔT exceeds 20°C warranty threshold — raise claim with module manufacturer."
            : anomaly.severity === "medium"
            ? "Schedule a maintenance visit within 30 days. Verify junction box wiring and bypass diode integrity."
            : "No urgent action required. Schedule during next routine O&M cycle."}
        </p>
        {anomaly.deltaTNorm && anomaly.deltaTNorm >= 20 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-ochre-muted border border-ochre/30 px-3 py-1.5 text-xs text-foreground">
            <ExternalLink size={11} className="text-ochre shrink-0" />
            ΔT<sub>norm</sub> = +{anomaly.deltaTNorm}°C @ 1000 W/m² — warranty claim eligible under IEC 62446-3
          </div>
        )}
      </section>

      {/* Status + Root Cause */}
      <section className="bg-card border border-border p-5 md:p-6">
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
              <button key={s} onClick={() => patchAnomaly.mutate({ id: anomaly.id, status: s })} className={`w-full flex items-center gap-3 p-3 border text-sm ${done ? "border-ochre bg-ochre-muted" : "border-border bg-card"}`}>
                <div className={`w-8 h-8 flex items-center justify-center ${done ? "bg-ochre text-ochre-fg" : "bg-grey-100 text-muted-foreground"}`}>
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span className="font-medium">{s}</span>
              </button>
            );
          })}
        </div>

        {/* Root Cause — filled by field engineer after site visit */}
        <div className="mt-6 pt-5 border-t border-grey-200">
          <p className="text-xs font-semibold uppercase tracking-widest text-grey-400 mb-2">Root Cause Identified</p>
          <div className="flex flex-wrap gap-2">
            {(["Manufacturing defect", "Wiring / connector fault", "Soiling / dust", "Shading / vegetation", "Physical damage", "Unknown"] as const).map(cause => (
              <button
                key={cause}
                onClick={() => patchAnomaly.mutate({ id: anomaly.id, rootCause: cause === anomaly.rootCause ? null : cause })}
                disabled={patchAnomaly.isPending}
                className={`px-3 py-1.5 text-xs font-medium border transition ${
                  anomaly.rootCause === cause
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-foreground border-border hover:border-primary hover:text-primary"
                }`}
              >
                {cause}
              </button>
            ))}
          </div>
          {anomaly.rootCause && (
            <p className="mt-2 text-xs text-muted-foreground">
              Root cause logged: <span className="font-semibold text-foreground">{anomaly.rootCause}</span> — will appear in the IEC report
            </p>
          )}
        </div>
      </section>

      {/* Actions */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <a href={`https://wa.me/?text=${whatsappMsg}`} target="_blank" rel="noreferrer" className="h-10 bg-[#25D366] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90">
          <MessageCircle size={16} /> Share on WhatsApp
        </a>
        <button className="h-10 bg-card border border-border text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-muted">
          <Download size={16} /> Download Fault Card PDF
        </button>
        <button className="h-10 bg-card border border-border text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-muted">
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

function ThermalImage({ note, peak, deltaT }: { note: string; peak: number; deltaT: number | null }) {
  const { filename, pos, src } = parseDefectImage(note);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div className="bg-card border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-grey-200 flex items-center justify-between">
        <span className="font-semibold text-xs uppercase tracking-widest text-grey-400">Thermal Image (IR)</span>
        <div className="flex items-center gap-3">
          {deltaT && <span className="mono text-xs text-critical font-semibold">ΔT: +{deltaT}°C</span>}
          <span className="mono text-xs text-muted-foreground">Peak: {peak}°C</span>
        </div>
      </div>
      <div className="relative aspect-video bg-black overflow-hidden">
        {src && !errored ? (
          <>
            <img
              src={src}
              alt={`Thermal defect image ${filename}`}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              style={{ filter: "saturate(1.1) contrast(1.05)" }}
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
            />
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {/* Position indicator — "pos a" = top panel, "pos b" = bottom panel */}
            {pos && loaded && (
              <div className={`absolute ${pos === "a" ? "top-2" : "bottom-2"} left-2 bg-black/70 text-white text-[10px] mono px-2 py-0.5 flex items-center gap-1`}>
                <span className="w-1.5 h-1.5 rounded-full bg-critical inline-block" />
                Defect: pos {pos} ({pos === "a" ? "top" : "bottom"} panel)
              </div>
            )}
            {/* Scale bar */}
            {loaded && (
              <div className="absolute right-2 top-2 bottom-2 flex flex-col items-center gap-1">
                <span className="mono text-[9px] text-white drop-shadow">{peak}°</span>
                <div className="w-3 flex-1" style={{ background: "linear-gradient(to bottom, #fff 0%, #ffeb3b 20%, #ff5722 45%, #d32f2f 65%, #6a1b9a 85%, #1a237e 100%)" }} />
                <span className="mono text-[9px] text-white drop-shadow">20°</span>
              </div>
            )}
            <div className="absolute bottom-2 right-8 bg-black/60 text-white text-[10px] mono px-2 py-0.5">
              Block 20 · 28 May 2026
            </div>
          </>
        ) : (
          /* Fallback: block-level orthomosaic if per-panel image unavailable */
          <>
            <img
              src="/thermal_block20.png"
              alt="Block 20 thermal orthomosaic"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "saturate(1.15) contrast(1.05)" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/70 text-white/70 text-xs mono px-3 py-1.5">
                Block 20 orthomosaic (per-panel image unavailable)
              </div>
            </div>
            <div className="absolute right-2 top-2 bottom-2 flex flex-col items-center gap-1">
              <span className="mono text-[9px] text-white drop-shadow">{peak}°</span>
              <div className="w-3 flex-1" style={{ background: "linear-gradient(to bottom, #fff 0%, #ffeb3b 20%, #ff5722 45%, #d32f2f 65%, #6a1b9a 85%, #1a237e 100%)" }} />
              <span className="mono text-[9px] text-white drop-shadow">20°</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RgbImage({ note }: { note: string }) {
  const { filename, pos } = parseDefectImage(note);
  // Try to load the per-panel RGB image; fall back to the block orthomosaic.
  // NB: public/rgbimages/ does not exist in this build — only the thermal frames
  // (public/defimages) were delivered — so this always takes the fallback path.
  const src = filename ? `/rgbimages/${filename}` : null;
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // Use the full RGB orthomosaic as fallback — always available
  const showOrtho = !src || errored;

  return (
    <div className="bg-card border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-grey-200 flex items-center justify-between">
        <span className="font-semibold text-xs uppercase tracking-widest text-grey-400">Visual Image (RGB)</span>
        {filename && (
          <span className="mono text-xs text-muted-foreground">
            {filename.toUpperCase()}{pos && <span className="text-grey-400"> · pos {pos}</span>}
          </span>
        )}
      </div>
      <div className="relative aspect-video bg-black overflow-hidden">

        {/* Per-panel RGB image (when available) */}
        {src && !errored && (
          <>
            <img
              src={src}
              alt={`RGB visual ${filename}`}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
            />
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {pos && loaded && (
              <div className={`absolute ${pos === "a" ? "top-2" : "bottom-2"} left-2 bg-black/70 text-white text-[10px] mono px-2 py-0.5 flex items-center gap-1`}>
                <span className="w-1.5 h-1.5 rounded-full bg-ochre inline-block" />
                Panel: pos {pos} ({pos === "a" ? "top" : "bottom"})
              </div>
            )}
          </>
        )}

        {/* Block-level RGB orthomosaic fallback — Day1_V1.tif thumbnail */}
        {showOrtho && (
          <>
            <img
              src="/rgb_block20.png"
              alt="Block 20 RGB visual orthomosaic"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] mono px-2 py-0.5">
              Block 20 visual orthomosaic · 28 May 2026
            </div>
            {filename && (
              <div className="absolute top-2 left-2 bg-black/70 text-white/70 text-[10px] mono px-2 py-0.5">
                Per-panel: {filename.toUpperCase()} (pending upload)
              </div>
            )}
          </>
        )}

        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] mono px-2 py-0.5">
          IEC 62446-3
        </div>
      </div>
    </div>
  );
}

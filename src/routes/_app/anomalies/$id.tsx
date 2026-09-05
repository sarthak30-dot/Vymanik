import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Download, Mail, MapPin, Check, Wrench, Loader2, ExternalLink, Navigation, ChevronLeft, ChevronRight } from "lucide-react";
import { SeverityBadge } from "@/components/SeverityBadge";
import { usePlantContext } from "@/lib/plant-context";
import { orderForStepping } from "@/lib/map-camera";
import { SHOW_LOSS_METRICS } from "@/lib/feature-flags";
// Lazy so the mapbox-gl runtime (~500 kB gzip) it pulls in downloads only once a
// detail page is open and after the core content paints, rather than being part
// of this route's initial bundle. Same code-split pattern as PanelAuditDrawer.
const PanelMiniMap = lazy(() =>
  import("@/components/PanelMiniMap").then(m => ({ default: m.PanelMiniMap })),
);
import { useAnomaly, useAnomalies, usePatchAnomaly } from "@/lib/queries";
import { anomalyTypeDefs, plant, SEVERITY_LABEL_FULL } from "@/lib/mock-data";
import type { AnomalyDTO } from "@/lib/api";
import { parseDefectImage } from "@/lib/defect-image";
import { tokenFor } from "@/lib/severity-tokens";

export const Route = createFileRoute("/_app/anomalies/$id")({
  head: () => ({ meta: [{ title: "Anomaly Detail — UrjaScan" }] }),
  component: AnomalyDetail,
});

type Status = AnomalyDTO["status"];
const STEPS: Status[] = ["New", "Acknowledged", "In Repair", "Closed"];

/**
 * "Download Fault Card PDF" — found wired to nothing during a portal test
 * pass (no onClick at all). Purpose-built for this page's own field set
 * (peak/reference cell temp, irradiance, root cause, normalised ΔT) rather
 * than sharing code with reports.tsx's plant-wide generatePDF() or
 * PanelAuditDrawer.tsx's exportPanelSummary() — same reasoning that file's
 * own docblock already gives for not merging with reports.tsx: one jsPDF
 * library, three genuinely different one-panel layouts (this one has no
 * audit timeline; PanelAuditDrawer has no peak/reference temp or root
 * cause), so a shared function would need as many branches as it saved.
 */
async function generateFaultCardPDF(anomaly: AnomalyDTO): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const token = tokenFor(anomaly.severity);

  doc.setFillColor(15, 40, 77);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("UrjaScan — Fault Card", 14, 17);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, 14, 23);

  let y = 40;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(anomaly.panelId, 14, y);
  if (token) {
    const [r, g, b] = token.textRGB;
    doc.setTextColor(r, g, b);
    doc.setFontSize(11);
    doc.text(anomaly.type, 14, y + 7);
  }
  y += 18;

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const fields: [string, string][] = [
    ["Severity", `${SEVERITY_LABEL_FULL[anomaly.severity]}${anomaly.deltaT ? ` · ΔT +${anomaly.deltaT}°C` : ""}`],
    ...(anomaly.deltaTNorm ? [["ΔT Normalised @ 1000 W/m²", `+${anomaly.deltaTNorm}°C`] as [string, string]] : []),
    ["Status", anomaly.status],
    ["GPS", `${anomaly.gps.lat}°N, ${anomaly.gps.lng}°E`],
    ["String / Inverter", `${anomaly.string} · ${anomaly.inverter}`],
    ...(anomaly.peakTemp ? [["Peak Cell Temperature", `${anomaly.peakTemp}°C`] as [string, string]] : []),
    ...(anomaly.refTemp ? [["Reference Cell Temp", `${anomaly.refTemp}°C`] as [string, string]] : []),
    ...(anomaly.irradiance ? [["Irradiance at Inspection", `${anomaly.irradiance} W/m²`] as [string, string]] : []),
    ["Inspection Date", anomaly.date],
    ...(anomaly.rootCause ? [["Root Cause", anomaly.rootCause] as [string, string]] : []),
  ];
  for (const [label, value] of fields) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 75, y, { maxWidth: 120 });
    y += 7;
  }

  if (anomaly.dailyLossINR) {
    y += 4;
    doc.setFillColor(15, 40, 77);
    doc.rect(14, y - 5, W - 28, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Estimated Power Loss", 20, y);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Rs ${anomaly.dailyLossINR} / day`, 20, y + 8);
    y += 22;
  }

  const { src } = parseDefectImage(anomaly.rgbNote);
  if (src) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "JPEG", 14, y + 4, 90, 72);
    } catch {
      // Frame missing/unreadable — the card is still useful without it.
    }
  }

  doc.save(`UrjaScan_FaultCard_${anomaly.panelId}.pdf`);
}

function AnomalyDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: anomaly, isLoading, isError } = useAnomaly(id);
  const patchAnomaly = usePatchAnomaly();
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ── Adjacent-defect navigation ──
  // Walk the plant's defects in the SAME order the map's stepper uses
  // (table → rack → module, via orderForStepping) so Prev/Next means the same
  // thing on both surfaces. Computed from the route `id`, not the loaded
  // `anomaly`, so these hooks run before the loading/error early-returns below
  // and the hook order stays stable. Keys mirror the map: [ / ] and j / k.
  const { data: allAnomalies = [] } = useAnomalies();
  const { selectedPlant } = usePlantContext();
  const ordered = useMemo(
    () => orderForStepping(
      allAnomalies.filter(a =>
        a.plantId === selectedPlant.id || (!a.plantId && selectedPlant.id === "plant-001"),
      ),
    ),
    [allAnomalies, selectedPlant.id],
  );
  const curIdx = ordered.findIndex(a => a.id === id);
  const prevA = curIdx > 0 ? ordered[curIdx - 1] : null;
  const nextA = curIdx >= 0 && curIdx < ordered.length - 1 ? ordered[curIdx + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if ((e.key === "]" || k === "j") && nextA) {
        e.preventDefault();
        navigate({ to: "/anomalies/$id", params: { id: nextA.id } });
      } else if ((e.key === "[" || k === "k") && prevA) {
        e.preventDefault();
        navigate({ to: "/anomalies/$id", params: { id: prevA.id } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevA, nextA, navigate]);

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
Severity: ${SEVERITY_LABEL_FULL[anomaly.severity]}
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
        <div className="flex flex-col items-end gap-3">
          {/* Adjacent-defect stepper — walk the survey without a list round-trip.
              Keyboard: [ / ] or j / k. */}
          {ordered.length > 1 && curIdx >= 0 && (
            <div className="flex items-center border border-border bg-card text-xs">
              <button
                onClick={() => prevA && navigate({ to: "/anomalies/$id", params: { id: prevA.id } })}
                disabled={!prevA}
                className="h-8 px-2.5 inline-flex items-center gap-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Previous defect ( [ or k )"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="px-3 mono tabular-nums text-muted-foreground border-x border-border h-8 inline-flex items-center">
                {curIdx + 1} <span className="opacity-50 mx-1">of</span> {ordered.length.toLocaleString("en-IN")}
              </span>
              <button
                onClick={() => nextA && navigate({ to: "/anomalies/$id", params: { id: nextA.id } })}
                disabled={!nextA}
                className="h-8 px-2.5 inline-flex items-center gap-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Next defect ( ] or j )"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
          <SeverityBadge severity={anomaly.severity} size="lg" />
        </div>
      </div>

      {/* Thermal evidence — the RGB card was removed: this is a radiometric
          thermal-only survey, so a second "no visual imagery" panel added nothing.
          Restore a two-up grid here if a visual/RGB set is ever delivered. */}
      <section className="max-w-3xl">
        <ThermalImage note={anomaly.rgbNote} peak={anomaly.peakTemp ?? 83} deltaT={anomaly.deltaT} />
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

      {/* Contextual locator — where this panel sits on the site, with a deep link
          into the full map focused on it. Suspense fallback holds the card's
          height so the surrounding layout doesn't jump while mapbox loads. */}
      <Suspense fallback={<div className="bg-card border border-border h-[19.5rem] animate-pulse" />}>
        <PanelMiniMap
          anomalyId={anomaly.id}
          panelId={anomaly.panelId}
          lat={anomaly.gps.lat}
          lng={anomaly.gps.lng}
          severity={anomaly.severity}
          status={anomaly.status}
          caption={`${anomaly.string} · ${anomaly.inverter}`}
        />
      </Suspense>

      {/* Financial — hidden at the client's request (see SHOW_LOSS_METRICS). */}
      {SHOW_LOSS_METRICS && anomaly.dailyLossINR && (
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
        <button
          onClick={async () => {
            setGeneratingPdf(true);
            try {
              await generateFaultCardPDF(anomaly);
              toast.success("Fault card downloaded", { description: "Check your Downloads folder." });
            } catch (e) {
              toast.error("PDF generation failed", { description: String(e) });
            } finally {
              setGeneratingPdf(false);
            }
          }}
          disabled={generatingPdf}
          className="h-10 bg-card border border-border text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-60"
        >
          {generatingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generatingPdf ? "Generating…" : "Download Fault Card PDF"}
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
              {plant.name} · {plant.lastInspection}
            </div>
          </>
        ) : (
          /* Fallback: the site-wide orthomosaic when this defect has no frame.
             Every one of the 1,249 March 2026 defects does have one, so this path
             is currently unreachable — it is kept for imported anomalies (see
             AnomalyCsvImport) and for any future deliverable with gaps. */
          <>
            <img
              src="/thermal_ortho4_hi.webp"
              alt="Site thermal orthomosaic"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "saturate(1.15) contrast(1.05)" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/70 text-white/70 text-xs mono px-3 py-1.5">
                Site orthomosaic (per-panel frame unavailable)
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


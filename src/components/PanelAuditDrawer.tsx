import { useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { X, ClipboardList, Camera, FileDown, Info } from "lucide-react";
import { SeverityBadge, StatusBadge } from "@/components/SeverityBadge";
import { MaintenanceTimeline } from "@/components/MaintenanceTimeline";
import { tokenFor } from "@/lib/severity-tokens";
import { parseDefectImage } from "@/lib/defect-image";
import { teamMembers, type Anomaly } from "@/lib/mock-data";
import {
  appendAuditEvent,
  buildTimeline,
  formatEventDate,
  makeEventId,
  type AuditEvent,
  type LoggedAuditEvent,
} from "@/lib/panel-audit";

/**
 * Task 7's audit drawer — the deep-history view a field lead opens from
 * either the desktop drawer or the mobile InspectionSheet (both already
 * built, Tasks 1 and 6) rather than replacing either. Those two are a quick
 * glance at what's selected; this is "show me everything about this panel,"
 * which is a heavier, less-often-needed view — exactly the split the
 * guardrail's lazy-load ask is arguing for.
 *
 * WHY THIS FILE, SPECIFICALLY, IS THE ONE THAT'S CODE-SPLIT
 * ---------------------------------------------------------------
 * jsPDF (already ~150KB+ of the reports.tsx chunk) is imported directly here
 * for the export action — pulling that into map.tsx's own bundle for a
 * button most sessions never click is exactly the "initial map bundle...
 * minimal" the guardrail names. map.tsx never imports this module directly;
 * it imports it via `React.lazy(() => import("@/components/PanelAuditDrawer"))`
 * behind a Suspense boundary that only mounts once a technician actually
 * clicks "History & Audit" on an already-selected panel — so the bytes for
 * this whole file, jsPDF included, are fetched on that click, not on page load.
 */
export function PanelAuditDrawer({
  anomaly,
  canEdit,
  canExport,
  onClose,
}: {
  anomaly: Anomaly;
  canEdit: boolean;
  canExport: boolean;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<AuditEvent[]>(() => buildTimeline(anomaly));
  const [formOpen, setFormOpen] = useState<"work_order" | null>(null);

  const logEvent = (event: LoggedAuditEvent) => {
    appendAuditEvent(anomaly.id, event);
    // Re-derive from the store rather than locally re-sorting by id: the
    // canonical chronological order is buildTimeline's own (by `at`, id only
    // as a tiebreaker), and re-implementing that comparator here just to
    // avoid one extra localStorage read would be the two-copies-of-one-rule
    // drift this app's own token-layer work spent a whole task guarding
    // against elsewhere.
    setEvents(buildTimeline(anomaly));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:w-[460px] bg-card border-l border-border overflow-y-auto animate-in slide-in-from-right flex flex-col"
      >
        <header className="p-5 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-grey-400">History & Audit</p>
              <h3 className="mono text-2xl font-bold">{anomaly.panelId}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 hover:bg-muted flex items-center justify-center shrink-0"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <SeverityBadge severity={anomaly.severity} />
            <StatusBadge status={anomaly.status} severity={anomaly.severity} />
          </div>
          <dl className="grid grid-cols-1 gap-2 mt-4 text-sm">
            <Row
              label="Module Serial / ID"
              value={
                anomaly.moduleSerial ?? "Not captured — this survey did not read module serials"
              }
              muted={!anomaly.moduleSerial}
            />
            <Row
              label="GPS"
              value={`${anomaly.gps.lat.toFixed(6)}°N, ${anomaly.gps.lng.toFixed(6)}°E`}
              mono
            />
            <Row label="String Assignment" value={stringAssignment(anomaly)} />
          </dl>
        </header>

        <div className="p-5 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Maintenance Timeline</h4>
            <span
              className="text-[11px] text-muted-foreground flex items-center gap-1"
              title="Work orders, notes, and photos logged here are stored in this browser only — there is no shared backend for them yet."
            >
              <Info size={11} /> logged in this browser
            </span>
          </div>
          <MaintenanceTimeline events={events} />
        </div>

        {(canEdit || canExport) && (
          <footer className="p-4 border-t border-border bg-grey-25 sticky bottom-0 space-y-2">
            {canEdit && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFormOpen((v) => (v === "work_order" ? null : "work_order"))}
                    className={`h-10 flex items-center justify-center gap-1.5 text-xs font-semibold border transition ${
                      formOpen === "work_order"
                        ? "bg-primary text-white border-primary"
                        : "bg-card border-border hover:bg-muted"
                    }`}
                  >
                    <ClipboardList size={14} /> Assign Work Order
                  </button>
                  <AttachPhotoButton onAttach={(photoEvent) => logEvent(photoEvent)} />
                </div>
                {formOpen === "work_order" && (
                  <WorkOrderForm
                    onCancel={() => setFormOpen(null)}
                    onSubmit={(assignee, dueDate, note) => {
                      logEvent({
                        id: makeEventId(),
                        kind: "work_order",
                        at: new Date().toISOString(),
                        assignee,
                        dueDate,
                        note,
                      });
                      setFormOpen(null);
                      toast.success("Work order assigned", {
                        description: `${assignee} · due ${dueDate}`,
                      });
                    }}
                  />
                )}
              </>
            )}
            {canExport && (
              <button
                onClick={() => exportPanelSummary(anomaly, events)}
                className="w-full h-10 flex items-center justify-center gap-1.5 text-xs font-semibold bg-ochre hover:bg-ochre-light text-ochre-fg"
              >
                <FileDown size={14} /> Export Panel Inspection Summary
              </button>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-grey-400">{label}</dt>
      <dd
        className={`font-semibold ${mono ? "mono" : ""} ${muted ? "text-muted-foreground font-normal text-xs" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Prefers the survey's own asset-register position (block/SMB/table/module —
 *  what a field engineer actually navigates by, per the Anomaly interface's
 *  own docblock in mock-data.ts) and falls back to string/inverter for rows
 *  that predate that field (the Block 20 deliverable never had it). */
function stringAssignment(a: Anomaly): string {
  if (a.block && a.smb) {
    return `Block ${a.block} · SMB ${a.smb} · ${a.string}${a.module ? ` · Module ${a.module}` : ""}`;
  }
  return `${a.string} · ${a.inverter}`;
}

function WorkOrderForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (assignee: string, dueDate: string, note: string) => void;
}) {
  const [assignee, setAssignee] = useState(teamMembers[0]?.name ?? "");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="border border-border bg-card p-3 space-y-2">
      <label className="block">
        <span className="text-[11px] uppercase tracking-widest text-grey-400">Assignee</span>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="w-full h-9 border border-border px-2 text-sm mt-1 bg-card"
        >
          {teamMembers.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-widest text-grey-400">Due Date</span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full h-9 border border-border px-2 text-sm mt-1"
        />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-widest text-grey-400">Note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full border border-border px-2 py-1.5 text-sm mt-1 resize-none"
          placeholder="What needs to happen on site"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onCancel}
          className="h-9 text-xs font-semibold border border-border hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={() => dueDate && onSubmit(assignee, dueDate, note)}
          disabled={!assignee || !dueDate}
          className="h-9 text-xs font-semibold bg-primary text-white disabled:opacity-40"
        >
          Assign
        </button>
      </div>
    </div>
  );
}

const PHOTO_MAX_DIM = 480;
const PHOTO_QUALITY = 0.6;

/**
 * Downscales the picked file to a small JPEG data URL before storing it —
 * localStorage's ~5-10MB-per-origin quota would fill after a handful of
 * full-resolution phone photos (routinely 3-8MB each). A field photo
 * attached to prove "the diode box was replaced" doesn't need print
 * resolution to do that job.
 */
function AttachPhotoButton({ onAttach }: { onAttach: (event: LoggedAuditEvent) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await downscaleToJpegDataUrl(file);
      onAttach({
        id: makeEventId(),
        kind: "photo",
        at: new Date().toISOString(),
        dataUrl,
        filename: file.name,
        by: "You",
      });
      toast.success("Photo attached");
    } catch {
      toast.error("Could not read that image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="h-10 flex items-center justify-center gap-1.5 text-xs font-semibold border border-border bg-card hover:bg-muted disabled:opacity-50"
      >
        <Camera size={14} /> {busy ? "Attaching…" : "Attach Photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
    </>
  );
}

function downscaleToJpegDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image failed to load"));
    };
    img.src = objectUrl;
  });
}

/** Single-panel PDF — the same jsPDF the plant-wide report (reports.tsx)
 *  uses, scoped to one anomaly. Kept in this file rather than factored out
 *  next to reports.tsx's generatePDF(): the two share a library, not a
 *  layout — a plant-wide multi-page IEC report and a one-panel field summary
 *  have different enough structure that a shared function would need as many
 *  branches as it saved lines. */
async function exportPanelSummary(anomaly: Anomaly, events: AuditEvent[]) {
  try {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;
    const token = tokenFor(anomaly.severity);

    doc.setFillColor(15, 40, 77);
    doc.rect(0, 0, W, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("UrjaScan — Panel Inspection Summary", 14, 17);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`,
      14,
      23,
    );

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
      [
        "Severity",
        `${anomaly.severity.toUpperCase()}${anomaly.deltaT ? ` · ΔT +${anomaly.deltaT}°C` : ""}`,
      ],
      ["Status", anomaly.status],
      ["GPS", `${anomaly.gps.lat.toFixed(6)}°N, ${anomaly.gps.lng.toFixed(6)}°E`],
      ["String / Inverter", `${anomaly.string} · ${anomaly.inverter}`],
      ["Module Serial", anomaly.moduleSerial ?? "Not captured this survey"],
      ["Inspection Date", anomaly.date],
    ];
    for (const [label, value] of fields) {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 60, y);
      y += 6;
    }

    // Defect frame, if one was captured for this anomaly — same source the
    // map/detail page use, loaded fresh here rather than passed in, since a
    // Blob->base64 round trip is cheaper to do once than to thread through
    // every caller of this function.
    const { src } = parseDefectImage(anomaly.rgbNote);
    if (src) {
      try {
        const dataUrl = await fetchAsDataUrl(src);
        doc.addImage(dataUrl, "JPEG", 14, y + 4, 80, 64);
      } catch {
        // Frame missing/unreadable — the PDF is still useful without it.
      }
    }

    y += 76;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Maintenance Timeline", 14, y);
    y += 7;
    doc.setFontSize(9);
    for (const event of events) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(formatEventDate(event.at), 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(timelineLine(event), 45, y, { maxWidth: 150 });
      y += 7;
    }

    doc.save(`UrjaScan_${anomaly.panelId}_Summary.pdf`);
    toast.success("Panel summary downloaded", { description: "Check your Downloads folder." });
  } catch (e) {
    toast.error("Export failed", { description: String(e) });
  }
}

function timelineLine(event: AuditEvent): string {
  switch (event.kind) {
    case "flight_scan":
      return `Flight scan — ${event.defectType} detected (${event.pilot})`;
    case "status_change":
      return `Status: ${event.from} -> ${event.to} (${event.by})`;
    case "work_order":
      return `Work order: ${event.assignee}, due ${event.dueDate}${event.note ? ` — ${event.note}` : ""}`;
    case "note":
      return `Note (${event.by}): ${event.text}`;
    case "photo":
      return `Photo attached: ${event.filename} (${event.by})`;
  }
}

function fetchAsDataUrl(url: string): Promise<string> {
  return fetch(url)
    .then((res) => res.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }),
    );
}

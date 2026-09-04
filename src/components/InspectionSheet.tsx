import { useState } from "react";
import {
  X,
  Navigation,
  MessageCircle,
  ArrowRight,
  Check,
  Flag,
  Loader2,
  History,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BottomSheet, type SheetSnap } from "@/components/BottomSheet";
import { DualBandImageSwitcher } from "@/components/DualBandImageSwitcher";
import { SeverityBadge, StatusBadge } from "@/components/SeverityBadge";
import { parseDefectImage } from "@/lib/defect-image";
import { useConstrainedConnection } from "@/hooks/use-mobile";
import { usePatchAnomaly } from "@/lib/queries";
import type { Anomaly } from "@/lib/mock-data";

/**
 * Task 6's Bottom-Sheet Inspection Drawer — the mobile counterpart to
 * map.tsx's desktop `<aside>` detail drawer. Same job (show what's selected,
 * offer the same "open full detail" / "share" exits), touch-first shape.
 *
 * WHY THIS DOESN'T JUST RENDER THE DESKTOP DRAWER IN A SHEET
 * --------------------------------------------------------------
 * The desktop drawer is a read-mostly summary — its only actions are two
 * links out (full detail page, WhatsApp). A field technician standing at the
 * panel is the one user this whole app has who benefits from acting *without
 * leaving the map*: confirming a fix, flagging something for a second look.
 * Those two actions are new here, not a port of anything that already
 * existed — see the quick actions section below for what they actually do.
 *
 * STATUS CHANGES HERE DO NOT RECOLOR THE MAP
 * -----------------------------------------------
 * usePatchAnomaly() persists to the same query cache /anomalies and
 * /anomalies/$id read from, so the change is real and survives navigating
 * there. But map.tsx's own markers, counts, and severity colors are computed
 * from the static `anomalies` array imported from lib/mock-data.ts, not from
 * that query cache — a pre-existing architectural fact of this route, not
 * something this task's scope covers changing. `localStatus` below exists so
 * *this sheet* reflects the change immediately; the map underneath it will
 * catch up on next load. Flagged rather than silently glossed over.
 */
export function InspectionSheet({
  anomaly,
  plantName,
  canEdit,
  onClose,
  onOpenAudit,
}: {
  anomaly: Anomaly;
  plantName: string;
  canEdit: boolean;
  onClose: () => void;
  /** Task 7 — opens map.tsx's lazy-loaded PanelAuditDrawer for this anomaly.
   *  A callback prop rather than this component importing/rendering that
   *  drawer itself, so there is exactly one dynamic import() call site for
   *  the whole page (map.tsx's), matching the desktop drawer's own trigger. */
  onOpenAudit: () => void;
}) {
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [localStatus, setLocalStatus] = useState(anomaly.status);
  const patchAnomaly = usePatchAnomaly();
  const constrained = useConstrainedConnection();

  const { src: thermalSrc, thumbSrc: thermalThumb } = parseDefectImage(anomaly.rgbNote);

  const setStatus = (status: typeof localStatus) => {
    setLocalStatus(status);
    patchAnomaly.mutate({ id: anomaly.id, status });
  };

  const whatsappMsg = encodeURIComponent(
    `[${anomaly.severity.toUpperCase()}] ${anomaly.type}\nPlant: ${plantName}\nPanel: ${anomaly.panelId} (Row ${anomaly.row}, Module ${anomaly.col})\nGPS: ${anomaly.gps.lat}°N, ${anomaly.gps.lng}°E\nView: ${location.origin}/anomalies/${anomaly.id}`,
  );

  return (
    <BottomSheet
      open
      snap={snap}
      onSnapChange={setSnap}
      onClose={onClose}
      header={
        <div className="px-4 pb-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-grey-400">Panel</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <h3 className="mono text-lg font-bold truncate">{anomaly.panelId}</h3>
                <SeverityBadge severity={anomaly.severity} />
                <StatusBadge status={localStatus} severity={anomaly.severity} />
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 shrink-0 flex items-center justify-center hover:bg-muted"
            >
              <X size={18} />
            </button>
          </div>

          {/* GPS + quick actions live in the header, not the scrollable body
              below — the brief asks for a *collapsed* sheet that already shows
              status, GPS, and the quick actions, and `header` is the only
              region BottomSheet keeps visible at `peek`. Putting them in the
              body instead would technically render them, just permanently
              scrolled out of view until a technician drags the sheet open —
              which defeats the point of a quick action being quick. */}
          <div className="flex items-center justify-between text-sm border-t border-grey-200 pt-3">
            <span className="mono text-muted-foreground text-xs">
              {anomaly.gps.lat.toFixed(5)}°N, {anomaly.gps.lng.toFixed(5)}°E
            </span>
            <a
              href={`https://maps.google.com/maps?daddr=${anomaly.gps.lat},${anomaly.gps.lng}&dirflg=d`}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium shrink-0 text-xs"
            >
              <Navigation size={13} /> Navigate
            </a>
          </div>

          {/* See the module docblock for what "fixed" persists to and what it
              does not. Hidden entirely for a role that cannot edit anomalies
              (lib/permissions.ts's editAnomaly), matching how every other
              write surface in the app gates on the same check — a read-only
              viewer on mobile should not see buttons that would fail
              silently or need a permission error to explain themselves. */}
          {canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                icon={<Check size={15} />}
                label="Mark Fixed"
                active={localStatus === "Closed"}
                pending={patchAnomaly.isPending}
                onClick={() => setStatus("Closed")}
                tone="positive"
              />
              <QuickAction
                icon={<Flag size={15} />}
                label="Flag for Review"
                active={localStatus === "Acknowledged"}
                pending={patchAnomaly.isPending}
                onClick={() => setStatus("Acknowledged")}
                tone="warning"
              />
            </div>
          )}
        </div>
      }
    >
      <div className="px-4 pb-6 space-y-4">
        <DualBandImageSwitcher
          thermal={{ src: thermalSrc, thumbSrc: thermalThumb, label: "Thermal" }}
          rgb={{ src: null, thumbSrc: null, label: "RGB" }}
          deferFull={constrained}
        />

        <div className="space-y-2 pt-1">
          <DataRow label="Anomaly Type" value={anomaly.type} />
          {anomaly.deltaT !== null && (
            <DataRow label="ΔT" value={`+${anomaly.deltaT}°C`} mono critical />
          )}
          <DataRow label="String" value={anomaly.string} />
          <DataRow label="Inverter" value={anomaly.inverter} />
        </div>

        <div className="grid grid-cols-1 gap-2 pt-1">
          <button
            onClick={onOpenAudit}
            className="w-full h-10 bg-card border border-border hover:bg-muted text-foreground font-semibold text-sm flex items-center justify-center gap-2"
          >
            <History size={14} /> History & Audit
          </button>
          <Link
            to="/anomalies/$id"
            params={{ id: anomaly.id }}
            className="w-full h-10 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm flex items-center justify-center gap-2"
          >
            View Full Detail <ArrowRight size={14} />
          </Link>
          <a
            href={`https://wa.me/?text=${whatsappMsg}`}
            target="_blank"
            rel="noreferrer"
            className="w-full h-10 bg-[#25D366] hover:opacity-90 text-white font-semibold text-sm flex items-center justify-center gap-2"
          >
            <MessageCircle size={16} /> Share on WhatsApp
          </a>
        </div>
      </div>
    </BottomSheet>
  );
}

function QuickAction({
  icon,
  label,
  active,
  pending,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  pending: boolean;
  onClick: () => void;
  tone: "positive" | "warning";
}) {
  const activeClass =
    tone === "positive"
      ? "bg-resolved text-white border-resolved"
      : "bg-medium text-white border-medium";
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={`h-11 flex items-center justify-center gap-1.5 text-xs font-semibold border transition disabled:opacity-60 ${
        active ? activeClass : "bg-card text-foreground border-border hover:bg-muted"
      }`}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

/** Same shape as map.tsx's own (private) DataRow — small enough, and tied
 *  closely enough to this sheet's own spacing, that importing it across a
 *  route/component boundary would cost more than the few duplicated lines. */
function DataRow({
  label,
  value,
  mono,
  critical,
}: {
  label: string;
  value: string;
  mono?: boolean;
  critical?: boolean;
}) {
  return (
    <div className="flex items-start justify-between border-b border-grey-200 pb-2 gap-2">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span
        className={`text-sm font-semibold text-right ${mono ? "mono" : ""} ${critical ? "text-critical" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

import {
  Plane,
  ArrowRightLeft,
  ClipboardList,
  MessageSquare,
  Image as ImageIcon,
} from "lucide-react";
import { RESOLVED, tokenFor } from "@/lib/severity-tokens";
import { formatEventDate, type AuditEvent } from "@/lib/panel-audit";

/**
 * Chronological card feed for Task 7's audit drawer — one card per
 * AuditEvent, oldest first (a maintenance history reads top-to-bottom like a
 * log, not like a chat thread). See lib/panel-audit.ts's module docblock for
 * what's a real historical record here versus what accumulates starting now.
 */
export function MaintenanceTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">No events recorded yet.</p>
    );
  }
  return (
    <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-grey-200">
      {events.map((event) => (
        <TimelineCard key={event.id} event={event} />
      ))}
    </ol>
  );
}

function TimelineCard({ event }: { event: AuditEvent }) {
  return (
    <li className="relative pl-9">
      <span className="absolute left-0 top-0.5 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center">
        <EventIcon event={event} />
      </span>
      <div className="bg-card border border-border p-3">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-grey-400">
            {eventLabel(event)}
          </span>
          <time className="text-[11px] text-muted-foreground shrink-0" dateTime={event.at}>
            {formatEventDate(event.at)}
          </time>
        </div>
        <EventBody event={event} />
      </div>
    </li>
  );
}

function EventIcon({ event }: { event: AuditEvent }) {
  switch (event.kind) {
    case "flight_scan": {
      const token = tokenFor(event.severity);
      return <Plane size={14} style={{ color: token?.text ?? "var(--grey-400)" }} />;
    }
    case "status_change":
      return <ArrowRightLeft size={14} className="text-primary" />;
    case "work_order":
      return <ClipboardList size={14} className="text-ochre" />;
    case "note":
      return <MessageSquare size={14} className="text-muted-foreground" />;
    case "photo":
      return <ImageIcon size={14} className="text-muted-foreground" />;
  }
}

function eventLabel(event: AuditEvent): string {
  switch (event.kind) {
    case "flight_scan":
      return "Flight Scan — Defect Detected";
    case "status_change":
      return "Status Changed";
    case "work_order":
      return "Work Order Assigned";
    case "note":
      return "Field Note";
    case "photo":
      return "Photo Attached";
  }
}

function EventBody({ event }: { event: AuditEvent }) {
  switch (event.kind) {
    case "flight_scan": {
      const token = tokenFor(event.severity);
      return (
        <p className="text-sm">
          <span style={{ color: token?.text }} className="font-semibold">
            {event.defectType}
          </span>
          {event.deltaT !== null && (
            <span className="text-muted-foreground"> · ΔT +{event.deltaT}°C</span>
          )}
          <span className="block text-xs text-muted-foreground mt-0.5">Pilot: {event.pilot}</span>
        </p>
      );
    }
    case "status_change":
      return (
        <p className="text-sm">
          <span className="text-muted-foreground">{event.from}</span> →{" "}
          <span className="font-semibold">{event.to}</span>
          {event.to === "Closed" && (
            <span
              className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: RESOLVED.vivid }}
            />
          )}
          <span className="block text-xs text-muted-foreground mt-0.5">by {event.by}</span>
        </p>
      );
    case "work_order":
      return (
        <div className="text-sm">
          <p>
            <span className="font-semibold">{event.assignee}</span> · due {event.dueDate}
          </p>
          {event.note && <p className="text-xs text-muted-foreground mt-1">{event.note}</p>}
        </div>
      );
    case "note":
      return (
        <p className="text-sm">
          {event.text}
          <span className="block text-xs text-muted-foreground mt-0.5">— {event.by}</span>
        </p>
      );
    case "photo":
      return (
        <div className="text-sm">
          <img
            src={event.dataUrl}
            alt={event.filename}
            className="w-full max-w-[200px] border border-border"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {event.filename} — {event.by}
          </p>
        </div>
      );
  }
}

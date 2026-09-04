/**
 * Per-panel maintenance/audit log — Task 7.
 *
 * WHAT'S REAL AND WHAT ISN'T, STATED UP FRONT
 * -------------------------------------------------
 * The brief's problem statement is "know if a panel has experienced recurring
 * hotspots... past physical damage" — implying multiple survey visits per
 * panel. This plant has flown exactly once (31 March 2026, see
 * inspectionHistory in mock-data.ts) and every panelId in the 1,249-row
 * survey appears exactly once (checked: zero duplicates), so there is no
 * second data point to show a *recurrence* against yet, for any panel. That
 * is a fact about the plant's inspection cadence, not a gap in this feature —
 * `buildTimeline()` below is written to correctly render N historical flight
 * scans the moment a second survey lands; today it renders exactly one.
 *
 * What genuinely accumulates over time, for real, starting now: work orders a
 * field lead assigns, notes and field photos attached during a visit, and
 * status transitions — all logged here, all real events with real
 * timestamps, none of it backfilled or invented to make the timeline look
 * busier than the plant's actual history.
 *
 * LOCALSTORAGE, NOT A DATABASE — SAME REASONING AS overlay-registration.ts
 * -----------------------------------------------------------------------------
 * There is no work-order or audit-log endpoint in api.ts; building one is out
 * of scope for a UI task. localStorage is the same "operator's own scratch
 * space until there's a real backend for it" this app already uses for
 * overlay alignment — an interrupted session doesn't lose a logged work
 * order, but it also doesn't survive a different browser or device. Flagged
 * in PanelAuditDrawer's own header so nobody mistakes a session-local note
 * for something the whole team can see.
 */

import type { Anomaly } from "./mock-data";
import { inspectionHistory } from "./mock-data";

export type AuditEventKind = "flight_scan" | "status_change" | "work_order" | "note" | "photo";

interface BaseEvent {
  id: string;
  kind: AuditEventKind;
  /** ISO 8601 — sorted on this, displayed via toLocaleDateString. */
  at: string;
}

export interface FlightScanEvent extends BaseEvent {
  kind: "flight_scan";
  pilot: string;
  defectType: string;
  severity: Anomaly["severity"];
  deltaT: number | null;
}

export interface StatusChangeEvent extends BaseEvent {
  kind: "status_change";
  from: Anomaly["status"];
  to: Anomaly["status"];
  by: string;
}

export interface WorkOrderEvent extends BaseEvent {
  kind: "work_order";
  assignee: string;
  dueDate: string;
  note: string;
}

export interface NoteEvent extends BaseEvent {
  kind: "note";
  text: string;
  by: string;
}

export interface PhotoEvent extends BaseEvent {
  kind: "photo";
  /** Downscaled JPEG data URL — see attachPhoto() in PanelAuditDrawer.tsx for
   *  why this is never the original file. */
  dataUrl: string;
  filename: string;
  by: string;
}

export type AuditEvent =
  | FlightScanEvent
  | StatusChangeEvent
  | WorkOrderEvent
  | NoteEvent
  | PhotoEvent;
/** The subset a technician actually creates through the UI — excludes
 *  flight_scan, which is derived from survey data, never logged by hand. */
export type LoggedAuditEvent = Exclude<AuditEvent, FlightScanEvent>;

const STORAGE_KEY = "urjascan.panel-audit-log.v1";

function readStore(): Record<string, LoggedAuditEvent[]> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LoggedAuditEvent[]>) : {};
  } catch {
    return {};
  }
}

function writeStore(all: Record<string, LoggedAuditEvent[]>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota or private-mode failure — this session's in-memory state (the
    // caller already applied the event optimistically) still reflects it;
    // only the next reload silently loses it. Nothing more useful to do
    // here without a toast system this app doesn't have.
  }
}

export function getLoggedEvents(anomalyId: string): LoggedAuditEvent[] {
  return readStore()[anomalyId] ?? [];
}

export function appendAuditEvent(anomalyId: string, event: LoggedAuditEvent) {
  const all = readStore();
  all[anomalyId] = [...(all[anomalyId] ?? []), event];
  writeStore(all);
}

export function makeEventId(): string {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The one real flight-scan event every panel in this survey has — this
 * anomaly's own detection, dated off the row's own `date`/`inspectionTime`
 * rather than a generic "the survey happened" stamp, so a future multi-flight
 * plant shows each panel's *own* detection date per scan rather than one
 * plant-wide date repeated on every panel's card.
 */
function detectionEvent(anomaly: Anomaly): FlightScanEvent {
  const pilot = inspectionHistory[0]?.pilot ?? "Unknown pilot";
  return {
    id: `detect-${anomaly.id}`,
    kind: "flight_scan",
    at: anomaly.date,
    pilot,
    defectType: anomaly.type,
    severity: anomaly.severity,
    deltaT: anomaly.deltaT,
  };
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Every `Anomaly.date` in this dataset is "D MMMM YYYY" (e.g. "31 March
 * 2026") — not ISO 8601, so `Date.parse` on it is relying on
 * implementation-defined leniency rather than a guarantee. Every event this
 * module creates itself uses `new Date().toISOString()`, which *is*
 * guaranteed. `toTimestamp` tries the reliable ISO path first and only falls
 * back to the explicit "D MMMM YYYY" parse for the one field that needs it,
 * so sorting never depends on an engine happening to be forgiving.
 */
function toTimestamp(s: string): number {
  const iso = Date.parse(s);
  if (!Number.isNaN(iso) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso;
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS.indexOf(m[2].toLowerCase());
    const year = Number(m[3]);
    if (month >= 0) return new Date(year, month, day).getTime();
  }
  // Last resort — better than crashing the sort, though nothing in this
  // dataset should ever actually reach it.
  return Number.isNaN(iso) ? 0 : iso;
}

/** Chronological (oldest first) merge of the real detection event and this
 *  panel's locally-logged events — what MaintenanceTimeline actually renders. */
export function buildTimeline(anomaly: Anomaly): AuditEvent[] {
  const events: AuditEvent[] = [detectionEvent(anomaly), ...getLoggedEvents(anomaly.id)];
  return events.sort((a, b) => toTimestamp(a.at) - toTimestamp(b.at) || a.id.localeCompare(b.id));
}

/**
 * `event.at` is one of two genuinely different shapes: the flight-scan
 * event's is the survey's own "D MMMM YYYY" display string (already
 * human-readable, passed straight through), everything logged through this
 * module is `new Date().toISOString()` (precise and sortable, but
 * "2026-09-03T21:43:44.504Z" is not what a field lead wants to read on a
 * timeline card or in the exported PDF). Format only the ISO shape; leave
 * the other alone rather than reparsing a string that was already
 * display-ready. Shared by MaintenanceTimeline.tsx and PanelAuditDrawer.tsx's
 * PDF export so the two never drift to showing a different date for the
 * same event.
 */
export function formatEventDate(at: string): string {
  if (!at.includes("T")) return at;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

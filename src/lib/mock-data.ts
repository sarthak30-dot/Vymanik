export type Severity = "critical" | "medium" | "normal" | "nodata";
export type Status = "New" | "Acknowledged" | "In Repair" | "Closed";

export interface Anomaly {
  id: string;
  panelId: string;
  row: number;
  col: number;
  type: string;
  deltaT: number | null;
  severity: Severity;
  string: string;
  inverter: string;
  status: Status;
  date: string;
  inspectionTime: string;
  rgbNote: string;
  gps: { lat: number; lng: number };
  peakTemp?: number;
  refTemp?: number;
  irradiance?: number;
  moduleSerial?: string;
  dailyLossINR?: number;
  dailyLossKWh?: number;
}

// ─── Primary plant (plant owner / inspector view) ────────────────────────────
// TODO: replace with real client plant data

export const plant = {
  name: "—",
  location: "—",
  capacityMW: 0,
  totalPanels: 0,
  lastInspection: "—",
  nextInspection: "—",
  healthScore: 0,
  dailyLossINR: 0,
  dailyLossKWh: 0,
  feedInTariff: 4.5,
};

// ─── Anomalies ───────────────────────────────────────────────────────────────
// TODO: populate from client inspection report

export const anomalies: Anomaly[] = [];

// ─── Inspection history ──────────────────────────────────────────────────────
// TODO: populate from past inspection reports

export const inspectionHistory: { date: string; critical: number; medium: number; normal: number; panels: number; pilot: string }[] = [];

// ─── Anomaly type catalogue (domain knowledge — keep as-is) ──────────────────

export const anomalyTypes = [
  "Hotspot", "Multi Hotspot", "String Fault", "Bypassed Substring",
  "Diode Failure", "PID", "Heated Junction Box", "Combiner Fault",
  "Broken Glass", "Soiling", "Shading", "Open Circuit", "Cold Spot",
];

export const anomalyTypeDefs: Record<string, string> = {
  "Hotspot": "Localized overheated solar cell — caused by crack, shading, or reverse bias",
  "Multi Hotspot": "Multiple overheated cells in same module — elevated fire risk",
  "Bypassed Substring": "Faulty bypass diode causing heat across 1/3 of module",
  "Diode Failure": "Junction box bypass diode damaged — heat follows substring pattern",
  "String Open Circuit": "Entire string disconnected — 100% production loss on string",
  "String Fault": "Entire string disconnected — 100% production loss on string",
  "PID Detected": "Potential Induced Degradation — up to 30% power loss",
  "PID": "Potential Induced Degradation — up to 30% power loss",
  "Heated Junction Box": "Abnormally warm terminal box — connection fault indicator",
  "Combiner Box Fault": "All modules on one combiner uniformly overheating",
  "Combiner Fault": "All modules on one combiner uniformly overheating",
  "Soiling": "Dust/bird droppings blocking panel — cleanable during next maintenance",
  "Shading": "Temporary shadow — monitor only",
  "Shaded Module": "Temporary shadow — monitor only",
  "Cold Spot": "Below-ambient cell temperature — possible delamination or moisture ingress",
  "Broken Glass": "Physical damage — immediate replacement required",
  "Open Circuit": "Module not producing — check connections and bypass diodes",
};

// ─── Severity counts (derived) ───────────────────────────────────────────────

export const severityCounts = {
  critical: 0,
  medium: 0,
  normal: 0,
  nodata: 0,
};

// ─── Equipment Audit ─────────────────────────────────────────────────────────

export type AuditStatus = "Completed" | "In Progress" | "Scheduled";

export interface EquipmentAudit {
  id: string;
  name: string;
  type: string;
  started: string;
  completed: string | null;
  status: AuditStatus;
  modulesInspected: number;
  findings: number;
}

export const equipmentAudits: EquipmentAudit[] = [];

// ─── Plant Digitization ──────────────────────────────────────────────────────

export type DigitizationType = "CAD Layout" | "String Diagram" | "Asset Map" | "3D Model";

export interface DigitizationRecord {
  id: string;
  name: string;
  type: DigitizationType;
  date: string;
  format: string;
  sizeLabel: string;
}

export const digitizationRecords: DigitizationRecord[] = [];

// ─── Team members ────────────────────────────────────────────────────────────
// TODO: update with real Vymanik team details

export type MemberStatus = "On Mission" | "Active" | "Off Duty";

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  droneModel: string;
  certifications: string[];
  assignedPlantId: string | null;
  status: MemberStatus;
  inspectionsCompleted: number;
  anomaliesFound: number;
  lastActive: string;
}

export const teamMembers: TeamMember[] = [];

/** Resolve an email/userId to the matching TeamMember, or null */
export function getTeamMemberByEmail(email: string): TeamMember | null {
  return teamMembers.find(m => m.email === email) ?? null;
}

// ─── Multi-plant fleet (Control Center) ──────────────────────────────────────
// TODO: replace with real client plant list

export type PlantStatus = "Operational" | "Under Review" | "Inspection Overdue";

export interface PlantSummary {
  id: string;
  name: string;
  client: string;
  location: string;
  capacityMW: number;
  totalPanels: number;
  healthScore: number;
  lastInspection: string;
  nextInspection: string;
  assignedInspectorId: string | null;
  criticalCount: number;
  mediumCount: number;
  status: PlantStatus;
  gps: { lat: number; lng: number };
}

export const allPlants: PlantSummary[] = [
  {
    id: "plant-001",
    name: "Plant 1",
    client: "—",
    location: "—",
    capacityMW: 0,
    totalPanels: 0,
    healthScore: 0,
    lastInspection: "—",
    nextInspection: "—",
    assignedInspectorId: null,
    criticalCount: 0,
    mediumCount: 0,
    status: "Operational",
    gps: { lat: 20.5937, lng: 78.9629 }, // centre of India as fallback
  },
];

// ─── Processing queue (Team portal) ──────────────────────────────────────────

import type { ProcessingStage } from "./api";

export interface QueueEntry {
  uploadId: string;
  client: string;
  plant: string;
  pilot: string;
  uploadedAt: string;
  datasetGB: number;
  tileCount: number | null;
  anomalyCount: number | null;
  stage: ProcessingStage;
  progressPct: number;
}

export const reviewQueue: QueueEntry[] = [];

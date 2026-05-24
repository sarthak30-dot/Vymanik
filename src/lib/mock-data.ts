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

export const plant = {
  name: "Rajpur Solar Plant",
  location: "Rajasthan",
  capacityMW: 2.3,
  totalPanels: 863,
  lastInspection: "3 May 2026",
  nextInspection: "3 August 2026",
  healthScore: 83,
  dailyLossINR: 2340,
  dailyLossKWh: 47,
  feedInTariff: 4.5,
};

export const anomalies: Anomaly[] = [
  { id: "1", panelId: "R14-M07", row: 14, col: 7, type: "Multi Hotspot", deltaT: 47, severity: "critical", string: "String 03", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:14 AM", rgbNote: "Surface discolouration visible — suspected cell-level cracking", gps: { lat: 26.4521, lng: 73.0192 }, peakTemp: 89, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8847", dailyLossINR: 180, dailyLossKWh: 3.6 },
  { id: "2", panelId: "R08-M03", row: 8, col: 3, type: "String Open Circuit", deltaT: 61, severity: "critical", string: "String 01", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:22 AM", rgbNote: "Junction box lid partially open — possible water ingress", gps: { lat: 26.4519, lng: 73.0188 }, peakTemp: 103, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8203", dailyLossINR: 245, dailyLossKWh: 4.9 },
  { id: "3", panelId: "R22-M11", row: 22, col: 11, type: "PID Detected", deltaT: 38, severity: "critical", string: "String 08", inverter: "INV-2", status: "Acknowledged", date: "3 May 2026", inspectionTime: "10:05 AM", rgbNote: "No visible external damage — PID confirmed via thermal signature only", gps: { lat: 26.4525, lng: 73.0197 }, peakTemp: 80, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-9011", dailyLossINR: 160, dailyLossKWh: 3.2 },
  { id: "4", panelId: "R02-M05", row: 2, col: 5, type: "Diode Failure", deltaT: 41, severity: "critical", string: "String 02", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:31 AM", rgbNote: "Burn mark on rear contact visible at module corner", gps: { lat: 26.4517, lng: 73.0185 }, peakTemp: 83, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-7755", dailyLossINR: 175, dailyLossKWh: 3.5 },
  { id: "5", panelId: "R05-M14", row: 5, col: 14, type: "Diode Failure", deltaT: 29, severity: "medium", string: "String 02", inverter: "INV-1", status: "In Repair", date: "3 May 2026", inspectionTime: "09:38 AM", rgbNote: "Slight yellowing on backsheet at bypass diode position", gps: { lat: 26.4520, lng: 73.0190 }, peakTemp: 71, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-7901", dailyLossINR: 95, dailyLossKWh: 1.9 },
  { id: "6", panelId: "R17-M02", row: 17, col: 2, type: "Bypassed Substring", deltaT: 22, severity: "medium", string: "String 06", inverter: "INV-2", status: "New", date: "3 May 2026", inspectionTime: "10:17 AM", rgbNote: "No visible damage — bypass confirmed thermally", gps: { lat: 26.4523, lng: 73.0194 }, peakTemp: 64, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8512", dailyLossINR: 75, dailyLossKWh: 1.5 },
  { id: "7", panelId: "R31-M09", row: 31, col: 9, type: "Heated Junction Box", deltaT: 24, severity: "medium", string: "String 11", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:44 AM", rgbNote: "Junction box seal degraded — O-ring replacement required", gps: { lat: 26.4528, lng: 73.0201 }, peakTemp: 66, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-9301", dailyLossINR: 80, dailyLossKWh: 1.6 },
  { id: "8", panelId: "R10-M08", row: 10, col: 8, type: "Hotspot", deltaT: 26, severity: "medium", string: "String 04", inverter: "INV-1", status: "Acknowledged", date: "3 May 2026", inspectionTime: "09:55 AM", rgbNote: "Micro-crack suspected — no surface fracture visible", gps: { lat: 26.4521, lng: 73.0191 }, peakTemp: 68, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8123", dailyLossINR: 88, dailyLossKWh: 1.8 },
  { id: "9", panelId: "R25-M04", row: 25, col: 4, type: "Bypassed Substring", deltaT: 21, severity: "medium", string: "String 09", inverter: "INV-2", status: "New", date: "3 May 2026", inspectionTime: "10:28 AM", rgbNote: "No visible damage — bypass confirmed thermally", gps: { lat: 26.4527, lng: 73.0198 }, peakTemp: 63, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8801", dailyLossINR: 72, dailyLossKWh: 1.4 },
  { id: "10", panelId: "R12-M15", row: 12, col: 15, type: "Hotspot", deltaT: 23, severity: "medium", string: "String 05", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "10:01 AM", rgbNote: "Bird dropping accumulation over affected cell — clean before re-inspection", gps: { lat: 26.4522, lng: 73.0192 }, peakTemp: 65, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8333", dailyLossINR: 78, dailyLossKWh: 1.6 },
  { id: "11", panelId: "R03-M21", row: 3, col: 21, type: "Soiling", deltaT: null, severity: "normal", string: "String 01", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:18 AM", rgbNote: "Heavy dust accumulation across top third of module", gps: { lat: 26.4518, lng: 73.0186 } },
  { id: "12", panelId: "R44-M06", row: 44, col: 6, type: "Shaded Module", deltaT: null, severity: "normal", string: "String 12", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "11:02 AM", rgbNote: "Partial shadow from adjacent structure during morning hours", gps: { lat: 26.4532, lng: 73.0205 } },
  { id: "13", panelId: "R19-M13", row: 19, col: 13, type: "Soiling", deltaT: null, severity: "normal", string: "String 07", inverter: "INV-2", status: "Closed", date: "3 May 2026", inspectionTime: "10:22 AM", rgbNote: "Module cleaned during previous O&M cycle — surface clear", gps: { lat: 26.4524, lng: 73.0195 } },
  { id: "14", panelId: "R27-M10", row: 27, col: 10, type: "Shading", deltaT: null, severity: "normal", string: "String 10", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:36 AM", rgbNote: "Nearby vegetation growth causing intermittent shading — trimming recommended", gps: { lat: 26.4528, lng: 73.0200 } },
  { id: "15", panelId: "R36-M02", row: 36, col: 2, type: "Soiling", deltaT: null, severity: "normal", string: "String 11", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:51 AM", rgbNote: "Bird dropping streak across cell row 2 — schedule cleaning", gps: { lat: 26.4530, lng: 73.0203 } },
  { id: "16", panelId: "R40-M18", row: 40, col: 18, type: "Hotspot", deltaT: 19, severity: "medium", string: "String 12", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:57 AM", rgbNote: "No visible surface defect — internal delamination possible", gps: { lat: 26.4531, lng: 73.0204 }, peakTemp: 61, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-9601", dailyLossINR: 65, dailyLossKWh: 1.3 },
];

export const inspectionHistory = [
  { date: "4 Sep 2025", critical: 11, medium: 22, normal: 830, panels: 863, pilot: "Rahul S." },
  { date: "12 Jan 2026", critical: 7, medium: 18, normal: 838, panels: 863, pilot: "Arjun K." },
  { date: "3 May 2026", critical: 4, medium: 12, normal: 847, panels: 863, pilot: "Arjun K." },
];

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
  "PID Detected": "Potential Induced Degradation — up to 30% power loss",
  "PID": "Potential Induced Degradation — up to 30% power loss",
  "Heated Junction Box": "Abnormally warm terminal box — connection fault indicator",
  "Combiner Box Fault": "All modules on one combiner uniformly overheating",
  "Soiling": "Dust/bird droppings blocking panel — cleanable during next maintenance",
  "Shading": "Temporary shadow — monitor only",
  "Shaded Module": "Temporary shadow — monitor only",
};

export const severityCounts = {
  critical: anomalies.filter(a => a.severity === "critical").length,
  medium: anomalies.filter(a => a.severity === "medium").length,
  normal: plant.totalPanels - anomalies.filter(a => a.severity === "critical" || a.severity === "medium").length,
  nodata: 23,
};

// ─── Processing queue (Team portal) ────────────────────────────────────────

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

export const reviewQueue: QueueEntry[] = [
  {
    uploadId: "job-001",
    client: "Greenko Energy",
    plant: "Jaisalmer Wind-Solar Hybrid",
    pilot: "Arjun K.",
    uploadedAt: "19 May 2026, 07:42 AM",
    datasetGB: 4.1,
    tileCount: 18420,
    anomalyCount: 31,
    stage: "Ready",
    progressPct: 100,
  },
  {
    uploadId: "job-002",
    client: "Adani Green",
    plant: "Kutch Solar Phase II",
    pilot: "Rahul S.",
    uploadedAt: "20 May 2026, 06:15 AM",
    datasetGB: 6.8,
    tileCount: null,
    anomalyCount: null,
    stage: "AI Detection",
    progressPct: 78,
  },
  {
    uploadId: "job-003",
    client: "Torrent Power",
    plant: "Charanka Solar Park Block C",
    pilot: "Priya M.",
    uploadedAt: "20 May 2026, 09:30 AM",
    datasetGB: 2.3,
    tileCount: null,
    anomalyCount: null,
    stage: "Tiling",
    progressPct: 44,
  },
];

import type { PlantDTO, AnomalyDTO } from "../../../packages/types/src/index";

export const plants: PlantDTO[] = [
  {
    id: "plant-rajpur-1",
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
    lat: 26.4521,
    lng: 73.0192,
  },
];

// Module-level mutable store — resets on cold start.
// Replace with a real database (e.g. Vercel Postgres, PlanetScale, Supabase) for persistence.
export const anomaliesStore = new Map<string, AnomalyDTO>([
  ["1", { id: "1", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R14-M07", row: 14, col: 7, type: "Multi Hotspot", deltaT: 47, severity: "critical", string: "String 03", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:14 AM", rgbNote: "Surface discolouration visible — suspected cell-level cracking", gps: { lat: 26.4521, lng: 73.0192 }, peakTemp: 89, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8847", dailyLossINR: 180, dailyLossKWh: 3.6 }],
  ["2", { id: "2", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R08-M03", row: 8, col: 3, type: "String Open Circuit", deltaT: 61, severity: "critical", string: "String 01", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:22 AM", rgbNote: "Junction box lid partially open — possible water ingress", gps: { lat: 26.4519, lng: 73.0188 }, peakTemp: 103, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8203", dailyLossINR: 245, dailyLossKWh: 4.9 }],
  ["3", { id: "3", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R22-M11", row: 22, col: 11, type: "PID Detected", deltaT: 38, severity: "critical", string: "String 08", inverter: "INV-2", status: "Acknowledged", date: "3 May 2026", inspectionTime: "10:05 AM", rgbNote: "No visible external damage — PID confirmed via thermal signature only", gps: { lat: 26.4525, lng: 73.0197 }, peakTemp: 80, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-9011", dailyLossINR: 160, dailyLossKWh: 3.2 }],
  ["4", { id: "4", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R02-M05", row: 2, col: 5, type: "Diode Failure", deltaT: 41, severity: "critical", string: "String 02", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:31 AM", rgbNote: "Burn mark on rear contact visible at module corner", gps: { lat: 26.4517, lng: 73.0185 }, peakTemp: 83, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-7755", dailyLossINR: 175, dailyLossKWh: 3.5 }],
  ["5", { id: "5", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R05-M14", row: 5, col: 14, type: "Diode Failure", deltaT: 29, severity: "medium", string: "String 02", inverter: "INV-1", status: "In Repair", date: "3 May 2026", inspectionTime: "09:38 AM", rgbNote: "Slight yellowing on backsheet at bypass diode position", gps: { lat: 26.452, lng: 73.019 }, peakTemp: 71, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-7901", dailyLossINR: 95, dailyLossKWh: 1.9 }],
  ["6", { id: "6", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R17-M02", row: 17, col: 2, type: "Bypassed Substring", deltaT: 22, severity: "medium", string: "String 06", inverter: "INV-2", status: "New", date: "3 May 2026", inspectionTime: "10:17 AM", rgbNote: "No visible damage — bypass confirmed thermally", gps: { lat: 26.4523, lng: 73.0194 }, peakTemp: 64, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8512", dailyLossINR: 75, dailyLossKWh: 1.5 }],
  ["7", { id: "7", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R31-M09", row: 31, col: 9, type: "Heated Junction Box", deltaT: 24, severity: "medium", string: "String 11", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:44 AM", rgbNote: "Junction box seal degraded — O-ring replacement required", gps: { lat: 26.4528, lng: 73.0201 }, peakTemp: 66, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-9301", dailyLossINR: 80, dailyLossKWh: 1.6 }],
  ["8", { id: "8", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R10-M08", row: 10, col: 8, type: "Hotspot", deltaT: 26, severity: "medium", string: "String 04", inverter: "INV-1", status: "Acknowledged", date: "3 May 2026", inspectionTime: "09:55 AM", rgbNote: "Micro-crack suspected — no surface fracture visible", gps: { lat: 26.4521, lng: 73.0191 }, peakTemp: 68, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8123", dailyLossINR: 88, dailyLossKWh: 1.8 }],
  ["9", { id: "9", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R25-M04", row: 25, col: 4, type: "Bypassed Substring", deltaT: 21, severity: "medium", string: "String 09", inverter: "INV-2", status: "New", date: "3 May 2026", inspectionTime: "10:28 AM", rgbNote: "No visible damage — bypass confirmed thermally", gps: { lat: 26.4527, lng: 73.0198 }, peakTemp: 63, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8801", dailyLossINR: 72, dailyLossKWh: 1.4 }],
  ["10", { id: "10", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R12-M15", row: 12, col: 15, type: "Hotspot", deltaT: 23, severity: "medium", string: "String 05", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "10:01 AM", rgbNote: "Bird dropping accumulation over affected cell — clean before re-inspection", gps: { lat: 26.4522, lng: 73.0192 }, peakTemp: 65, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-8333", dailyLossINR: 78, dailyLossKWh: 1.6 }],
  ["11", { id: "11", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R03-M21", row: 3, col: 21, type: "Soiling", deltaT: null, severity: "normal", string: "String 01", inverter: "INV-1", status: "New", date: "3 May 2026", inspectionTime: "09:18 AM", rgbNote: "Heavy dust accumulation across top third of module", gps: { lat: 26.4518, lng: 73.0186 } }],
  ["12", { id: "12", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R44-M06", row: 44, col: 6, type: "Shaded Module", deltaT: null, severity: "normal", string: "String 12", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "11:02 AM", rgbNote: "Partial shadow from adjacent structure during morning hours", gps: { lat: 26.4532, lng: 73.0205 } }],
  ["13", { id: "13", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R19-M13", row: 19, col: 13, type: "Soiling", deltaT: null, severity: "normal", string: "String 07", inverter: "INV-2", status: "Closed", date: "3 May 2026", inspectionTime: "10:22 AM", rgbNote: "Module cleaned during previous O&M cycle — surface clear", gps: { lat: 26.4524, lng: 73.0195 } }],
  ["14", { id: "14", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R27-M10", row: 27, col: 10, type: "Shading", deltaT: null, severity: "normal", string: "String 10", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:36 AM", rgbNote: "Nearby vegetation growth causing intermittent shading — trimming recommended", gps: { lat: 26.4528, lng: 73.02 } }],
  ["15", { id: "15", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R36-M02", row: 36, col: 2, type: "Soiling", deltaT: null, severity: "normal", string: "String 11", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:51 AM", rgbNote: "Bird dropping streak across cell row 2 — schedule cleaning", gps: { lat: 26.453, lng: 73.0203 } }],
  ["16", { id: "16", inspectionId: "insp-may-2026", plantId: "plant-rajpur-1", panelId: "R40-M18", row: 40, col: 18, type: "Hotspot", deltaT: 19, severity: "medium", string: "String 12", inverter: "INV-3", status: "New", date: "3 May 2026", inspectionTime: "10:57 AM", rgbNote: "No visible surface defect — internal delamination possible", gps: { lat: 26.4531, lng: 73.0204 }, peakTemp: 61, refTemp: 42, irradiance: 847, moduleSerial: "VYM-2021-9601", dailyLossINR: 65, dailyLossKWh: 1.3 }],
]);

export const inspectionHistory = [
  { date: "4 Sep 2025", critical: 11, medium: 22, normal: 830, panels: 863, pilot: "Rahul S." },
  { date: "12 Jan 2026", critical: 7, medium: 18, normal: 838, panels: 863, pilot: "Arjun K." },
  { date: "3 May 2026", critical: 4, medium: 12, normal: 847, panels: 863, pilot: "Arjun K." },
];

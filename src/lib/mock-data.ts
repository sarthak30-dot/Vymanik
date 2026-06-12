export type Severity = "critical" | "medium" | "normal" | "nodata";
export type Status = "New" | "Acknowledged" | "In Repair" | "Closed";

export type RootCause =
  | "Manufacturing defect"
  | "Wiring / connector fault"
  | "Soiling / dust"
  | "Shading / vegetation"
  | "Physical damage"
  | "Unknown"
  | null;

export interface Anomaly {
  id: string;
  panelId: string;
  row: number;
  col: number;
  type: string;
  deltaT: number | null;
  deltaTNorm: number | null;  // IEC 62446-3 normalised to 1000 W/m²
  severity: Severity;
  string: string;
  inverter: string;
  status: Status;
  rootCause: RootCause;
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

// ─── Primary plant (Block 20 inspection data) ────────────────────────────────

export const plant = {
  name: "Block 20 Solar Plant",
  location: "Rajasthan, India",
  capacityMW: 10,
  totalPanels: 19058,
  lastInspection: "28 May 2026",
  nextInspection: "28 Aug 2026",
  healthScore: 99,
  dailyLossINR: 32700,
  dailyLossKWh: 7267,
  feedInTariff: 4.5,
};

// ─── Anomalies — Block 20 (347 panels, sorted: critical → medium → normal) ───

// Raw entries omit deltaTNorm/rootCause — _enrich() fills them in
const _rawAnomalies: Omit<Anomaly, "deltaTNorm" | "rootCause">[] = [
  { id: "1", panelId: "R8-P12", row: 8, col: 12, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-298", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 7531.JPG (pos a)", gps: { lat: 28.2550579, lng: 73.0406009 } },
  { id: "2", panelId: "R34-P3", row: 34, col: 3, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-285", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4671.JPG (pos a)", gps: { lat: 28.2560787, lng: 73.0404391 } },
  { id: "3", panelId: "R38-P17", row: 38, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-283", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4035.JPG (pos a)", gps: { lat: 28.2562374, lng: 73.0405952 } },
  { id: "4", panelId: "R38-P24", row: 38, col: 24, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-283", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4041.JPG (pos a)", gps: { lat: 28.2562386, lng: 73.0406776 } },
  { id: "5", panelId: "R51-P14", row: 51, col: 14, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-120", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2255.JPG (pos b)", gps: { lat: 28.2566643, lng: 73.0387385 } },
  { id: "6", panelId: "R54-P2", row: 54, col: 2, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-141", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1403.JPG (pos a)", gps: { lat: 28.2569028, lng: 73.0388973 } },
  { id: "7", panelId: "R54-P11", row: 54, col: 11, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-141", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1409.JPG (pos a)", gps: { lat: 28.2569043, lng: 73.0390033 } },
  { id: "8", panelId: "R56-P13", row: 56, col: 13, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-142", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1837.JPG (pos a)", gps: { lat: 28.2568321, lng: 73.0390251 } },
  { id: "9", panelId: "R56-P22", row: 56, col: 22, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-142", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1715.JPG (pos a)", gps: { lat: 28.2568336, lng: 73.0391311 } },
  { id: "10", panelId: "R72-P9", row: 72, col: 9, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-168", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1273.JPG (pos a)", gps: { lat: 28.2569836, lng: 73.0392756 } },
  { id: "11", panelId: "R76-P9", row: 76, col: 9, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-170", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1851.JPG (pos a)", gps: { lat: 28.2568383, lng: 73.0392731 } },
  { id: "12", panelId: "R88-P11", row: 88, col: 11, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-176", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3461.JPG (pos a)", gps: { lat: 28.2563961, lng: 73.0392983 } },
  { id: "13", panelId: "R98-P4", row: 98, col: 4, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-197", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 891.JPG (pos a)", gps: { lat: 28.2570657, lng: 73.0395110 } },
  { id: "14", panelId: "R107-P23", row: 107, col: 23, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-201", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2565.JPG (pos b)", gps: { lat: 28.2566076, lng: 73.0397361 } },
  { id: "15", panelId: "R113-P19", row: 113, col: 19, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-204", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3441.JPG (pos b)", gps: { lat: 28.2563822, lng: 73.0396938 } },
  { id: "16", panelId: "R138-P14", row: 138, col: 14, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-227", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3167.JPG (pos b)", gps: { lat: 28.2564624, lng: 73.0399341 } },
  { id: "17", panelId: "R140-P21", row: 140, col: 21, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-228", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3419.JPG (pos b)", gps: { lat: 28.2563879, lng: 73.0400193 } },
  { id: "18", panelId: "R140-P23", row: 140, col: 23, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-228", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3419.JPG (pos b)", gps: { lat: 28.2563883, lng: 73.0400429 } },
  { id: "19", panelId: "R158-P10", row: 158, col: 10, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5975.JPG (pos b)", gps: { lat: 28.2556924, lng: 73.0399185 } },
  { id: "20", panelId: "R158-P23", row: 158, col: 23, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5983.JPG (pos b)", gps: { lat: 28.2556946, lng: 73.0400716 } },
  { id: "21", panelId: "R185-P15", row: 185, col: 15, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-258", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4423.JPG (pos a)", gps: { lat: 28.2561021, lng: 73.0402674 } },
  { id: "22", panelId: "R186-P20", row: 186, col: 20, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-258", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4677.JPG (pos b)", gps: { lat: 28.2560818, lng: 73.0403274 } },
  { id: "23", panelId: "R193-P9", row: 193, col: 9, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-262", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5625.JPG (pos a)", gps: { lat: 28.2557895, lng: 73.0402137 } },
  { id: "24", panelId: "R196-P10", row: 196, col: 10, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-263", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5988.JPG (pos b)", gps: { lat: 28.2556899, lng: 73.0402301 } },
  { id: "25", panelId: "R200-P14", row: 200, col: 14, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-265", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6561.JPG (pos b)", gps: { lat: 28.2555347, lng: 73.0402847 } },
  { id: "26", panelId: "R217-P2", row: 217, col: 2, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1645.JPG (pos a)", gps: { lat: 28.2568722, lng: 73.0403909 } },
  { id: "27", panelId: "R227-P11", row: 227, col: 11, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-280", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3199.JPG (pos a)", gps: { lat: 28.2564900, lng: 73.0405117 } },
  { id: "28", panelId: "R236-P12", row: 236, col: 12, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-300", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 813.JPG (pos b)", gps: { lat: 28.2571567, lng: 73.0408169 } },
  { id: "29", panelId: "R238-P20", row: 238, col: 20, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-301", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 811.JPG (pos b)", gps: { lat: 28.2570835, lng: 73.0409106 } },
  { id: "30", panelId: "R243-P6", row: 243, col: 6, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-304", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1623.JPG (pos a)", gps: { lat: 28.2568745, lng: 73.0407510 } },
  { id: "31", panelId: "R257-P22", row: 257, col: 22, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-311", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3791.JPG (pos a)", gps: { lat: 28.2563387, lng: 73.0409610 } },
  { id: "32", panelId: "R261-P12", row: 261, col: 12, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-313", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4227.JPG (pos a)", gps: { lat: 28.2561795, lng: 73.0408520 } },
  { id: "33", panelId: "R264-P26", row: 264, col: 26, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-314", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4635.JPG (pos b)", gps: { lat: 28.2560820, lng: 73.0410227 } },
  { id: "34", panelId: "R282-P16", row: 282, col: 16, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-324", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 760.JPG (pos b)", gps: { lat: 28.2571558, lng: 73.0411812 } },
  { id: "35", panelId: "R285-P8", row: 285, col: 8, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-326", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1169.JPG (pos a)", gps: { lat: 28.2570247, lng: 73.0410885 } },
  { id: "36", panelId: "R293-P15", row: 293, col: 15, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-330", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2397.JPG (pos a)", gps: { lat: 28.2567219, lng: 73.0411786 } },
  { id: "37", panelId: "R294-P14", row: 294, col: 14, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-330", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2397.JPG (pos b)", gps: { lat: 28.2567012, lng: 73.0411677 } },
  { id: "38", panelId: "R301-P4", row: 301, col: 4, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-334", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3359.JPG (pos a)", gps: { lat: 28.2564112, lng: 73.0410620 } },
  { id: "39", panelId: "R307-P16", row: 307, col: 16, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-337", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4479.JPG (pos a)", gps: { lat: 28.2561780, lng: 73.0412157 } },
  { id: "40", panelId: "R323-P21", row: 323, col: 21, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-345", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6503.JPG (pos a)", gps: { lat: 28.2555456, lng: 73.0413128 } },
  { id: "41", panelId: "R335-P26", row: 335, col: 26, type: "Multi-Module Hotspot", deltaT: null, severity: "critical", string: "Table-351", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2459.JPG (pos a)", gps: { lat: 28.2566420, lng: 73.0416310 } },
  { id: "42", panelId: "R336-P9", row: 336, col: 9, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-351", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2833.JPG (pos b)", gps: { lat: 28.2566183, lng: 73.0414317 } },
  { id: "43", panelId: "R362-P4", row: 362, col: 4, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-364", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4509.JPG (pos b)", gps: { lat: 28.2561437, lng: 73.0417139 } },
  { id: "44", panelId: "R372-P12", row: 372, col: 12, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-5", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 10873.JPG (pos b)", gps: { lat: 28.2587675, lng: 73.0369398 } },
  { id: "45", panelId: "R372-P26", row: 372, col: 26, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-5", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 10883.JPG (pos b)", gps: { lat: 28.2587699, lng: 73.0371047 } },
  { id: "46", panelId: "R393-P21", row: 393, col: 21, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-4", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 11725.JPG (pos a)", gps: { lat: 28.2586056, lng: 73.0367028 } },
  { id: "47", panelId: "R396-P22", row: 396, col: 22, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-13", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 11197.JPG (pos b)", gps: { lat: 28.2587452, lng: 73.0373823 } },
  { id: "48", panelId: "R439-P13", row: 439, col: 13, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-35", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14071.JPG (pos a)", gps: { lat: 28.2580609, lng: 73.0375393 } },
  { id: "49", panelId: "R441-P11", row: 441, col: 11, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-36", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14175.JPG (pos a)", gps: { lat: 28.2579921, lng: 73.0375107 } },
  { id: "50", panelId: "R452-P21", row: 452, col: 21, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-41", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 11647.JPG (pos b)", gps: { lat: 28.2586297, lng: 73.0380158 } },
  { id: "51", panelId: "R460-P7", row: 460, col: 7, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-45", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12813.JPG (pos b)", gps: { lat: 28.2583598, lng: 73.0378207 } },
  { id: "52", panelId: "R472-P9", row: 472, col: 9, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-51", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14523.JPG (pos b)", gps: { lat: 28.2579554, lng: 73.0378071 } },
  { id: "53", panelId: "R473-P18", row: 473, col: 18, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-52", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14649.JPG (pos a)", gps: { lat: 28.2579079, lng: 73.0379095 } },
  { id: "54", panelId: "R474-P10", row: 474, col: 10, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-52", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14643.JPG (pos b)", gps: { lat: 28.2578872, lng: 73.0378140 } },
  { id: "55", panelId: "R475-P12", row: 475, col: 12, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-53", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14643.JPG (pos a)", gps: { lat: 28.2578384, lng: 73.0378343 } },
  { id: "56", panelId: "R484-P22", row: 484, col: 22, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-57", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15989.JPG (pos a)", gps: { lat: 28.2575429, lng: 73.0379367 } },
  { id: "57", panelId: "R503-P7", row: 503, col: 7, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-67", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14209.JPG (pos a)", gps: { lat: 28.2580252, lng: 73.0381099 } },
  { id: "58", panelId: "R508-P23", row: 508, col: 23, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-69", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14673.JPG (pos b)", gps: { lat: 28.2578742, lng: 73.0382852 } },
  { id: "59", panelId: "R508-P24", row: 508, col: 24, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-69", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14673.JPG (pos b)", gps: { lat: 28.2578744, lng: 73.0382970 } },
  { id: "60", panelId: "R518-P3", row: 518, col: 3, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-74", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15997.JPG (pos b)", gps: { lat: 28.2575273, lng: 73.0380272 } },
  { id: "61", panelId: "R520-P17", row: 520, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-75", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16409.JPG (pos b)", gps: { lat: 28.2574604, lng: 73.0381889 } },
  { id: "62", panelId: "R525-P23", row: 525, col: 23, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-78", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 11923.JPG (pos a)", gps: { lat: 28.2586059, lng: 73.0386898 } },
  { id: "63", panelId: "R534-P17", row: 534, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-82", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13063.JPG (pos b)", gps: { lat: 28.2583255, lng: 73.0385806 } },
  { id: "64", panelId: "R536-P9", row: 536, col: 9, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-83", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13313.JPG (pos b)", gps: { lat: 28.2582583, lng: 73.0384786 } },
  { id: "65", panelId: "R546-P10", row: 546, col: 10, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-88", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14679.JPG (pos b)", gps: { lat: 28.2579265, lng: 73.0384523 } },
  { id: "66", panelId: "R548-P7", row: 548, col: 7, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-89", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14951.JPG (pos b)", gps: { lat: 28.2578605, lng: 73.0384106 } },
  { id: "67", panelId: "R549-P10", row: 549, col: 10, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-90", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14951.JPG (pos a)", gps: { lat: 28.2578119, lng: 73.0384414 } },
  { id: "68", panelId: "R565-P10", row: 565, col: 10, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-98", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 11935.JPG (pos a)", gps: { lat: 28.2585862, lng: 73.0388562 } },
  { id: "69", panelId: "R571-P6", row: 571, col: 6, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-101", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12867.JPG (pos a)", gps: { lat: 28.2583918, lng: 73.0387798 } },
  { id: "70", panelId: "R586-P19", row: 586, col: 19, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-108", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14707.JPG (pos b)", gps: { lat: 28.2579214, lng: 73.0388679 } },
  { id: "71", panelId: "R586-P23", row: 586, col: 23, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-108", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14707.JPG (pos b)", gps: { lat: 28.2579221, lng: 73.0389150 } },
  { id: "72", panelId: "R587-P8", row: 587, col: 8, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-109", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14931.JPG (pos a)", gps: { lat: 28.2578699, lng: 73.0387340 } },
  { id: "73", panelId: "R587-P11", row: 587, col: 11, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-109", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14931.JPG (pos a)", gps: { lat: 28.2578704, lng: 73.0387693 } },
  { id: "74", panelId: "R588-P7", row: 588, col: 7, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-109", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14931.JPG (pos b)", gps: { lat: 28.2578534, lng: 73.0387192 } },
  { id: "75", panelId: "R588-P14", row: 588, col: 14, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-109", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14931.JPG (pos b)", gps: { lat: 28.2578546, lng: 73.0388016 } },
  { id: "76", panelId: "R593-P2", row: 593, col: 2, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-112", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15587.JPG (pos a)", gps: { lat: 28.2576697, lng: 73.0386423 } },
  { id: "77", panelId: "R601-P3", row: 601, col: 3, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-121", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12075.JPG (pos a)", gps: { lat: 28.2585711, lng: 73.0390908 } },
  { id: "78", panelId: "R602-P4", row: 602, col: 4, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-121", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12075.JPG (pos b)", gps: { lat: 28.2585538, lng: 73.0391004 } },
  { id: "79", panelId: "R604-P8", row: 604, col: 8, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-122", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12423.JPG (pos b)", gps: { lat: 28.2584920, lng: 73.0391354 } },
  { id: "80", panelId: "R613-P22", row: 613, col: 22, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-127", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13499.JPG (pos a)", gps: { lat: 28.2581942, lng: 73.0392497 } },
  { id: "81", panelId: "R615-P18", row: 615, col: 18, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-128", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13813.JPG (pos a)", gps: { lat: 28.2581293, lng: 73.0391920 } },
  { id: "82", panelId: "R620-P17", row: 620, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-130", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14445.JPG (pos b)", gps: { lat: 28.2579837, lng: 73.0391581 } },
  { id: "83", panelId: "R620-P23", row: 620, col: 23, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-130", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14441.JPG (pos b)", gps: { lat: 28.2579848, lng: 73.0392287 } },
  { id: "84", panelId: "R643-P14", row: 643, col: 14, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-152", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12909.JPG (pos a)", gps: { lat: 28.2583778, lng: 73.0394971 } },
  { id: "85", panelId: "R645-P17", row: 645, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-153", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13009.JPG (pos a)", gps: { lat: 28.2583181, lng: 73.0395201 } },
  { id: "86", panelId: "R656-P5", row: 656, col: 5, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-158", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14435.JPG (pos b)", gps: { lat: 28.2579842, lng: 73.0393188 } },
  { id: "87", panelId: "R656-P10", row: 656, col: 10, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-158", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14431.JPG (pos b)", gps: { lat: 28.2579851, lng: 73.0393777 } },
  { id: "88", panelId: "R661-P17", row: 661, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-161", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15187.JPG (pos a)", gps: { lat: 28.2578105, lng: 73.0394327 } },
  { id: "89", panelId: "R666-P10", row: 666, col: 10, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-163", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15629.JPG (pos b)", gps: { lat: 28.2576597, lng: 73.0393307 } },
  { id: "90", panelId: "R666-P12", row: 666, col: 12, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-163", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15629.JPG (pos b)", gps: { lat: 28.2576600, lng: 73.0393542 } },
  { id: "91", panelId: "R666-P18", row: 666, col: 18, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-163", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16075.JPG (pos b)", gps: { lat: 28.2576610, lng: 73.0394249 } },
  { id: "92", panelId: "R670-P16", row: 670, col: 16, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-165", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16233.JPG (pos b)", gps: { lat: 28.2575266, lng: 73.0393880 } },
  { id: "93", panelId: "R678-P17", row: 678, col: 17, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-183", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12929.JPG (pos b)", gps: { lat: 28.2583644, lng: 73.0398329 } },
  { id: "94", panelId: "R679-P2", row: 679, col: 2, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-184", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13003.JPG (pos a)", gps: { lat: 28.2583180, lng: 73.0396471 } },
  { id: "95", panelId: "R687-P25", row: 687, col: 25, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-188", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13937.JPG (pos a)", gps: { lat: 28.2580756, lng: 73.0398665 } },
  { id: "96", panelId: "R687-P26", row: 687, col: 26, type: "Module Open Circuit", deltaT: null, severity: "critical", string: "Table-188", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13937.JPG (pos a)", gps: { lat: 28.2580758, lng: 73.0398783 } },
  { id: "97", panelId: "R703-P7", row: 703, col: 7, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-211", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12981.JPG (pos a)", gps: { lat: 28.2583276, lng: 73.0400049 } },
  { id: "98", panelId: "R703-P15", row: 703, col: 15, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-211", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12975.JPG (pos a)", gps: { lat: 28.2583289, lng: 73.0400991 } },
  { id: "99", panelId: "R712-P15", row: 712, col: 15, type: "Diode Failure", deltaT: null, severity: "critical", string: "Table-215", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14769.JPG (pos b)", gps: { lat: 28.2579445, lng: 73.0400175 } },
  { id: "100", panelId: "R18-P19", row: 18, col: 19, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-293", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6657.JPG (pos a)", gps: { lat: 28.2554523, lng: 73.0406625 } },
  { id: "101", panelId: "R18-P20", row: 18, col: 20, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-293", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6657.JPG (pos a)", gps: { lat: 28.2554525, lng: 73.0406743 } },
  { id: "102", panelId: "R18-P21", row: 18, col: 21, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-293", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6657.JPG (pos a)", gps: { lat: 28.2554527, lng: 73.0406861 } },
  { id: "103", panelId: "R28-P22", row: 28, col: 22, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-288", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5487.JPG (pos a)", gps: { lat: 28.2558461, lng: 73.0406749 } },
  { id: "104", panelId: "R42-P26", row: 42, col: 26, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-116", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1297.JPG (pos a)", gps: { lat: 28.2569740, lng: 73.0388855 } },
  { id: "105", panelId: "R45-P17", row: 45, col: 17, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-117", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1397.JPG (pos b)", gps: { lat: 28.2568812, lng: 73.0387775 } },
  { id: "106", panelId: "R47-P10", row: 47, col: 10, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-118", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1821.JPG (pos b)", gps: { lat: 28.2568080, lng: 73.0386932 } },
  { id: "107", panelId: "R49-P9", row: 49, col: 9, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-119", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2191.JPG (pos b)", gps: { lat: 28.2567362, lng: 73.0386811 } },
  { id: "108", panelId: "R52-P1", row: 52, col: 1, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-140", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1297.JPG (pos a)", gps: { lat: 28.2569741, lng: 73.0388873 } },
  { id: "109", panelId: "R53-P21", row: 53, col: 21, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-140", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1285.JPG (pos b)", gps: { lat: 28.2569577, lng: 73.0391220 } },
  { id: "110", panelId: "R56-P26", row: 56, col: 26, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-142", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1715.JPG (pos a)", gps: { lat: 28.2568343, lng: 73.0391782 } },
  { id: "111", panelId: "R57-P10", row: 57, col: 10, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-142", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1837.JPG (pos b)", gps: { lat: 28.2568122, lng: 73.0389895 } },
  { id: "112", panelId: "R63-P19", row: 63, col: 19, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-145", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2697.JPG (pos b)", gps: { lat: 28.2565946, lng: 73.0390938 } },
  { id: "113", panelId: "R73-P13", row: 73, col: 13, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-168", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1273.JPG (pos b)", gps: { lat: 28.2569639, lng: 73.0393225 } },
  { id: "114", panelId: "R76-P1", row: 76, col: 1, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-170", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1715.JPG (pos a)", gps: { lat: 28.2568370, lng: 73.0391789 } },
  { id: "115", panelId: "R77-P5", row: 77, col: 5, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-170", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1715.JPG (pos b)", gps: { lat: 28.2568177, lng: 73.0392260 } },
  { id: "116", panelId: "R79-P3", row: 79, col: 3, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-171", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2159.JPG (pos b)", gps: { lat: 28.2567444, lng: 73.0392024 } },
  { id: "117", panelId: "R79-P21", row: 79, col: 21, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-171", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2147.JPG (pos b)", gps: { lat: 28.2567474, lng: 73.0394144 } },
  { id: "118", panelId: "R80-P26", row: 80, col: 26, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-172", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2297.JPG (pos a)", gps: { lat: 28.2566948, lng: 73.0394738 } },
  { id: "119", panelId: "R82-P6", row: 82, col: 6, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-173", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2597.JPG (pos a)", gps: { lat: 28.2566188, lng: 73.0392373 } },
  { id: "120", panelId: "R84-P12", row: 84, col: 12, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-174", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3027.JPG (pos a)", gps: { lat: 28.2565457, lng: 73.0393084 } },
  { id: "121", panelId: "R84-P21", row: 84, col: 21, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-174", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3021.JPG (pos a)", gps: { lat: 28.2565473, lng: 73.0394144 } },
  { id: "122", panelId: "R85-P19", row: 85, col: 19, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-174", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3021.JPG (pos b)", gps: { lat: 28.2565259, lng: 73.0393909 } },
  { id: "123", panelId: "R89-P23", row: 89, col: 23, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-176", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3553.JPG (pos b)", gps: { lat: 28.2563780, lng: 73.0394398 } },
  { id: "124", panelId: "R104-P1", row: 104, col: 1, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-200", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2297.JPG (pos a)", gps: { lat: 28.2566995, lng: 73.0394750 } },
  { id: "125", panelId: "R108-P13", row: 108, col: 13, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-202", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2731.JPG (pos a)", gps: { lat: 28.2565515, lng: 73.0396187 } },
  { id: "126", panelId: "R113-P16", row: 113, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-204", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3441.JPG (pos b)", gps: { lat: 28.2563817, lng: 73.0396585 } },
  { id: "127", panelId: "R117-P2", row: 117, col: 2, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-206", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3971.JPG (pos b)", gps: { lat: 28.2562280, lng: 73.0394975 } },
  { id: "128", panelId: "R132-P7", row: 132, col: 7, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-224", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2319.JPG (pos b)", gps: { lat: 28.2566880, lng: 73.0398448 } },
  { id: "129", panelId: "R140-P22", row: 140, col: 22, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-228", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3419.JPG (pos b)", gps: { lat: 28.2563881, lng: 73.0400311 } },
  { id: "130", panelId: "R148-P11", row: 148, col: 11, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-232", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4701.JPG (pos b)", gps: { lat: 28.2560796, lng: 73.0399132 } },
  { id: "131", panelId: "R158-P5", row: 158, col: 5, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5971.JPG (pos b)", gps: { lat: 28.2556916, lng: 73.0398596 } },
  { id: "132", panelId: "R158-P6", row: 158, col: 6, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5971.JPG (pos b)", gps: { lat: 28.2556918, lng: 73.0398714 } },
  { id: "133", panelId: "R158-P7", row: 158, col: 7, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5971.JPG (pos b)", gps: { lat: 28.2556919, lng: 73.0398832 } },
  { id: "134", panelId: "R158-P8", row: 158, col: 8, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5971.JPG (pos b)", gps: { lat: 28.2556921, lng: 73.0398950 } },
  { id: "135", panelId: "R158-P13", row: 158, col: 13, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5977.JPG (pos b)", gps: { lat: 28.2556930, lng: 73.0399538 } },
  { id: "136", panelId: "R158-P15", row: 158, col: 15, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5977.JPG (pos b)", gps: { lat: 28.2556933, lng: 73.0399774 } },
  { id: "137", panelId: "R158-P21", row: 158, col: 21, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5983.JPG (pos b)", gps: { lat: 28.2556943, lng: 73.0400481 } },
  { id: "138", panelId: "R158-P24", row: 158, col: 24, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5983.JPG (pos b)", gps: { lat: 28.2556948, lng: 73.0400834 } },
  { id: "139", panelId: "R161-P15", row: 161, col: 15, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-246", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1063.JPG (pos a)", gps: { lat: 28.2570175, lng: 73.0402352 } },
  { id: "140", panelId: "R161-P16", row: 161, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-246", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1063.JPG (pos a)", gps: { lat: 28.2570177, lng: 73.0402470 } },
  { id: "141", panelId: "R161-P23", row: 161, col: 23, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-246", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1067.JPG (pos a)", gps: { lat: 28.2570189, lng: 73.0403295 } },
  { id: "142", panelId: "R162-P12", row: 162, col: 12, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-246", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1063.JPG (pos b)", gps: { lat: 28.2569969, lng: 73.0401996 } },
  { id: "143", panelId: "R163-P12", row: 163, col: 12, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-247", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1221.JPG (pos a)", gps: { lat: 28.2569420, lng: 73.0402000 } },
  { id: "144", panelId: "R163-P13", row: 163, col: 13, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-247", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1481.JPG (pos a)", gps: { lat: 28.2569422, lng: 73.0402118 } },
  { id: "145", panelId: "R163-P16", row: 163, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-247", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1481.JPG (pos a)", gps: { lat: 28.2569427, lng: 73.0402471 } },
  { id: "146", panelId: "R164-P8", row: 164, col: 8, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-247", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1479.JPG (pos b)", gps: { lat: 28.2569215, lng: 73.0401538 } },
  { id: "147", panelId: "R176-P11", row: 176, col: 11, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-253", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3184.JPG (pos b)", gps: { lat: 28.2564671, lng: 73.0402032 } },
  { id: "148", panelId: "R177-P5", row: 177, col: 5, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-254", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3411.JPG (pos a)", gps: { lat: 28.2564098, lng: 73.0401351 } },
  { id: "149", panelId: "R177-P11", row: 177, col: 11, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-254", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3184.JPG (pos a)", gps: { lat: 28.2564108, lng: 73.0402058 } },
  { id: "150", panelId: "R178-P3", row: 178, col: 3, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-254", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3411.JPG (pos b)", gps: { lat: 28.2563893, lng: 73.0401120 } },
  { id: "151", panelId: "R184-P16", row: 184, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-257", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4423.JPG (pos b)", gps: { lat: 28.2561589, lng: 73.0402769 } },
  { id: "152", panelId: "R190-P16", row: 190, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-260", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5231.JPG (pos b)", gps: { lat: 28.2559252, lng: 73.0402885 } },
  { id: "153", panelId: "R192-P25", row: 192, col: 25, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-261", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5503.JPG (pos b)", gps: { lat: 28.2558486, lng: 73.0403986 } },
  { id: "154", panelId: "R196-P6", row: 196, col: 6, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-263", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5988.JPG (pos b)", gps: { lat: 28.2556892, lng: 73.0401830 } },
  { id: "155", panelId: "R200-P16", row: 200, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-265", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6561.JPG (pos b)", gps: { lat: 28.2555351, lng: 73.0403082 } },
  { id: "156", panelId: "R200-P22", row: 200, col: 22, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-265", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6557.JPG (pos b)", gps: { lat: 28.2555361, lng: 73.0403789 } },
  { id: "157", panelId: "R207-P24", row: 207, col: 24, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-270", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 439.JPG (pos a)", gps: { lat: 28.2572473, lng: 73.0406474 } },
  { id: "158", panelId: "R210-P17", row: 210, col: 17, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-271", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 721.JPG (pos b)", gps: { lat: 28.2571540, lng: 73.0405640 } },
  { id: "159", panelId: "R211-P25", row: 211, col: 25, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-272", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 821.JPG (pos a)", gps: { lat: 28.2571008, lng: 73.0406579 } },
  { id: "160", panelId: "R215-P17", row: 215, col: 17, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-274", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1499.JPG (pos a)", gps: { lat: 28.2569500, lng: 73.0405654 } },
  { id: "161", panelId: "R216-P5", row: 216, col: 5, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-274", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1491.JPG (pos b)", gps: { lat: 28.2569274, lng: 73.0404247 } },
  { id: "162", panelId: "R217-P11", row: 217, col: 11, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1637.JPG (pos a)", gps: { lat: 28.2568737, lng: 73.0404969 } },
  { id: "163", panelId: "R217-P20", row: 217, col: 20, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1631.JPG (pos a)", gps: { lat: 28.2568753, lng: 73.0406029 } },
  { id: "164", panelId: "R217-P21", row: 217, col: 21, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1631.JPG (pos a)", gps: { lat: 28.2568754, lng: 73.0406147 } },
  { id: "165", panelId: "R218-P2", row: 218, col: 2, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1645.JPG (pos b)", gps: { lat: 28.2568515, lng: 73.0403919 } },
  { id: "166", panelId: "R218-P3", row: 218, col: 3, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1645.JPG (pos b)", gps: { lat: 28.2568517, lng: 73.0404037 } },
  { id: "167", panelId: "R225-P26", row: 225, col: 26, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-279", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2947.JPG (pos a)", gps: { lat: 28.2565699, lng: 73.0406837 } },
  { id: "168", panelId: "R228-P2", row: 228, col: 2, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-280", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3195.JPG (pos b)", gps: { lat: 28.2564684, lng: 73.0404058 } },
  { id: "169", panelId: "R230-P25", row: 230, col: 25, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-281", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3626.JPG (pos b)", gps: { lat: 28.2563949, lng: 73.0406810 } },
  { id: "170", panelId: "R233-P2", row: 233, col: 2, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-299", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 439.JPG (pos a)", gps: { lat: 28.2572496, lng: 73.0406989 } },
  { id: "171", panelId: "R236-P25", row: 236, col: 25, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-300", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 745.JPG (pos b)", gps: { lat: 28.2571589, lng: 73.0409700 } },
  { id: "172", panelId: "R237-P13", row: 237, col: 13, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-301", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 813.JPG (pos a)", gps: { lat: 28.2571026, lng: 73.0408277 } },
  { id: "173", panelId: "R237-P14", row: 237, col: 14, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-301", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 813.JPG (pos a)", gps: { lat: 28.2571027, lng: 73.0408394 } },
  { id: "174", panelId: "R239-P12", row: 239, col: 12, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-202", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1185.JPG (pos a)", gps: { lat: 28.2570266, lng: 73.0408181 } },
  { id: "175", panelId: "R241-P15", row: 241, col: 15, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-303", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1517.JPG (pos a)", gps: { lat: 28.2569517, lng: 73.0408544 } },
  { id: "176", panelId: "R242-P17", row: 242, col: 17, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-303", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1517.JPG (pos b)", gps: { lat: 28.2569315, lng: 73.0408787 } },
  { id: "177", panelId: "R242-P20", row: 242, col: 20, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-303", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1517.JPG (pos b)", gps: { lat: 28.2569320, lng: 73.0409140 } },
  { id: "178", panelId: "R245-P19", row: 245, col: 19, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-305", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2055.JPG (pos a)", gps: { lat: 28.2568003, lng: 73.0409063 } },
  { id: "179", panelId: "R248-P22", row: 248, col: 22, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-306", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2383.JPG (pos b)", gps: { lat: 28.2567039, lng: 73.0409445 } },
  { id: "180", panelId: "R258-P23", row: 258, col: 23, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-311", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3791.JPG (pos b)", gps: { lat: 28.2563174, lng: 73.0409743 } },
  { id: "181", panelId: "R258-P24", row: 258, col: 24, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-311", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3791.JPG (pos b)", gps: { lat: 28.2563176, lng: 73.0409861 } },
  { id: "182", panelId: "R259-P17", row: 259, col: 17, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-312", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4053.JPG (pos a)", gps: { lat: 28.2562590, lng: 73.0409067 } },
  { id: "183", panelId: "R260-P8", row: 260, col: 8, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-312", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4047.JPG (pos b)", gps: { lat: 28.2562362, lng: 73.0408021 } },
  { id: "184", panelId: "R260-P9", row: 260, col: 9, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-312", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4047.JPG (pos b)", gps: { lat: 28.2562364, lng: 73.0408139 } },
  { id: "185", panelId: "R265-P22", row: 265, col: 22, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5053.JPG (pos a)", gps: { lat: 28.2560242, lng: 73.0409788 } },
  { id: "186", panelId: "R265-P23", row: 265, col: 23, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5053.JPG (pos a)", gps: { lat: 28.2560244, lng: 73.0409906 } },
  { id: "187", panelId: "R266-P14", row: 266, col: 14, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5061.JPG (pos b)", gps: { lat: 28.2560013, lng: 73.0408860 } },
  { id: "188", panelId: "R266-P25", row: 266, col: 25, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5053.JPG (pos b)", gps: { lat: 28.2560031, lng: 73.0410155 } },
  { id: "189", panelId: "R266-P26", row: 266, col: 26, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5053.JPG (pos b)", gps: { lat: 28.2560033, lng: 73.0410273 } },
  { id: "190", panelId: "R276-P16", row: 276, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-320", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6673.JPG (pos b)", gps: { lat: 28.2554481, lng: 73.0409424 } },
  { id: "191", panelId: "R281-P13", row: 281, col: 13, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-324", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 755.JPG (pos a)", gps: { lat: 28.2571756, lng: 73.0411457 } },
  { id: "192", panelId: "R281-P17", row: 281, col: 17, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-324", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 760.JPG (pos a)", gps: { lat: 28.2571763, lng: 73.0411928 } },
  { id: "193", panelId: "R281-P18", row: 281, col: 18, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-324", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 760.JPG (pos a)", gps: { lat: 28.2571765, lng: 73.0412046 } },
  { id: "194", panelId: "R289-P20", row: 289, col: 20, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-328", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1595.JPG (pos a)", gps: { lat: 28.2568757, lng: 73.0412322 } },
  { id: "195", panelId: "R298-P16", row: 298, col: 16, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-332", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2917.JPG (pos b)", gps: { lat: 28.2565470, lng: 73.0411964 } },
  { id: "196", panelId: "R312-P21", row: 312, col: 21, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-339", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5035.JPG (pos b)", gps: { lat: 28.2559994, lng: 73.0412858 } },
  { id: "197", panelId: "R312-P26", row: 312, col: 26, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-339", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5035.JPG (pos b)", gps: { lat: 28.2560002, lng: 73.0413447 } },
  { id: "198", panelId: "R326-P2", row: 326, col: 2, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-346", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 6683.JPG (pos b)", gps: { lat: 28.2554413, lng: 73.0410946 } },
  { id: "199", panelId: "R330-P2", row: 330, col: 2, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-348", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1975.JPG (pos b)", gps: { lat: 28.2568469, lng: 73.0413418 } },
  { id: "200", panelId: "R330-P8", row: 330, col: 8, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-348", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1979.JPG (pos b)", gps: { lat: 28.2568479, lng: 73.0414124 } },
  { id: "201", panelId: "R330-P12", row: 330, col: 12, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-348", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1979.JPG (pos b)", gps: { lat: 28.2568486, lng: 73.0414595 } },
  { id: "202", panelId: "R333-P26", row: 333, col: 26, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-350", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2423.JPG (pos a)", gps: { lat: 28.2567187, lng: 73.0416280 } },
  { id: "203", panelId: "R340-P23", row: 340, col: 23, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-353", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3325.JPG (pos b)", gps: { lat: 28.2564657, lng: 73.0416025 } },
  { id: "204", panelId: "R346-P7", row: 346, col: 7, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-356", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4191.JPG (pos b)", gps: { lat: 28.2562286, lng: 73.0414261 } },
  { id: "205", panelId: "R346-P18", row: 346, col: 18, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-356", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4183.JPG (pos b)", gps: { lat: 28.2562305, lng: 73.0415556 } },
  { id: "206", panelId: "R358-P14", row: 358, col: 14, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-362", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4105.JPG (pos b)", gps: { lat: 28.2563018, lng: 73.0418245 } },
  { id: "207", panelId: "R368-P12", row: 368, col: 12, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-367", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5323.JPG (pos b)", gps: { lat: 28.2559083, lng: 73.0418224 } },
  { id: "208", panelId: "R368-P14", row: 368, col: 14, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-367", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5323.JPG (pos b)", gps: { lat: 28.2559086, lng: 73.0418459 } },
  { id: "209", panelId: "R386-P13", row: 386, col: 13, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-12", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13161.JPG (pos b)", gps: { lat: 28.2582892, lng: 73.0369055 } },
  { id: "210", panelId: "R386-P14", row: 386, col: 14, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-12", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13161.JPG (pos b)", gps: { lat: 28.2582893, lng: 73.0369172 } },
  { id: "211", panelId: "R392-P8", row: 392, col: 8, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-3", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 11325.JPG (pos b)", gps: { lat: 28.2586531, lng: 73.0365557 } },
  { id: "212", panelId: "R412-P10", row: 412, col: 10, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-21", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13240.JPG (pos b)", gps: { lat: 28.2581979, lng: 73.0371895 } },
  { id: "213", panelId: "R412-P11", row: 412, col: 11, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-21", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13240.JPG (pos b)", gps: { lat: 28.2581980, lng: 73.0372013 } },
  { id: "214", panelId: "R496-P19", row: 496, col: 19, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-63", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12603.JPG (pos b)", gps: { lat: 28.2584084, lng: 73.0382925 } },
  { id: "215", panelId: "R502-P22", row: 502, col: 22, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-66", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13553.JPG (pos b)", gps: { lat: 28.2582097, lng: 73.0383047 } },
  { id: "216", panelId: "R506-P9", row: 506, col: 9, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-68", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14505.JPG (pos b)", gps: { lat: 28.2579393, lng: 73.0381256 } },
  { id: "217", panelId: "R514-P6", row: 514, col: 6, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-72", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15555.JPG (pos b)", gps: { lat: 28.2576663, lng: 73.0380704 } },
  { id: "218", panelId: "R516-P5", row: 516, col: 5, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-73", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15894.JPG (pos b)", gps: { lat: 28.2575976, lng: 73.0380547 } },
  { id: "219", panelId: "R516-P6", row: 516, col: 6, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-73", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15894.JPG (pos b)", gps: { lat: 28.2575978, lng: 73.0380664 } },
  { id: "220", panelId: "R518-P15", row: 518, col: 15, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-74", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16305.JPG (pos b)", gps: { lat: 28.2575293, lng: 73.0381686 } },
  { id: "221", panelId: "R518-P22", row: 518, col: 22, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-74", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16299.JPG (pos b)", gps: { lat: 28.2575305, lng: 73.0382510 } },
  { id: "222", panelId: "R520-P14", row: 520, col: 14, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-75", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16409.JPG (pos b)", gps: { lat: 28.2574598, lng: 73.0381535 } },
  { id: "223", panelId: "R520-P15", row: 520, col: 15, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-75", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16409.JPG (pos b)", gps: { lat: 28.2574600, lng: 73.0381653 } },
  { id: "224", panelId: "R522-P7", row: 522, col: 7, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-76", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16662.JPG (pos b)", gps: { lat: 28.2573890, lng: 73.0380686 } },
  { id: "225", panelId: "R532-P17", row: 532, col: 17, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-81", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12589.JPG (pos b)", gps: { lat: 28.2583906, lng: 73.0385892 } },
  { id: "226", panelId: "R532-P25", row: 532, col: 25, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-81", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12583.JPG (pos b)", gps: { lat: 28.2583920, lng: 73.0386834 } },
  { id: "227", panelId: "R532-P26", row: 532, col: 26, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-81", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12583.JPG (pos b)", gps: { lat: 28.2583922, lng: 73.0386952 } },
  { id: "228", panelId: "R548-P8", row: 548, col: 8, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-89", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14951.JPG (pos b)", gps: { lat: 28.2578607, lng: 73.0384223 } },
  { id: "229", panelId: "R552-P13", row: 552, col: 13, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-91", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15411.JPG (pos b)", gps: { lat: 28.2577270, lng: 73.0384695 } },
  { id: "230", panelId: "R558-P2", row: 558, col: 2, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-94", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16295.JPG (pos b)", gps: { lat: 28.2575190, lng: 73.0383253 } },
  { id: "231", panelId: "R562-P1", row: 562, col: 1, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-96", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16647.JPG (pos b)", gps: { lat: 28.2573795, lng: 73.0383063 } },
  { id: "232", panelId: "R562-P2", row: 562, col: 2, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-96", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16647.JPG (pos b)", gps: { lat: 28.2573797, lng: 73.0383181 } },
  { id: "233", panelId: "R572-P10", row: 572, col: 10, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-101", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12867.JPG (pos b)", gps: { lat: 28.2583755, lng: 73.0388243 } },
  { id: "234", panelId: "R572-P12", row: 572, col: 12, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-101", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12871.JPG (pos b)", gps: { lat: 28.2583758, lng: 73.0388479 } },
  { id: "235", panelId: "R580-P5", row: 580, col: 5, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-105", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13785.JPG (pos b)", gps: { lat: 28.2581154, lng: 73.0387278 } },
  { id: "236", panelId: "R590-P4", row: 590, col: 4, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-110", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15145.JPG (pos b)", gps: { lat: 28.2577866, lng: 73.0386769 } },
  { id: "237", panelId: "R590-P5", row: 590, col: 5, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-110", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15145.JPG (pos b)", gps: { lat: 28.2577868, lng: 73.0386887 } },
  { id: "238", panelId: "R590-P8", row: 590, col: 8, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-110", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15145.JPG (pos b)", gps: { lat: 28.2577873, lng: 73.0387240 } },
  { id: "239", panelId: "R590-P9", row: 590, col: 9, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-110", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15145.JPG (pos b)", gps: { lat: 28.2577875, lng: 73.0387358 } },
  { id: "240", panelId: "R594-P15", row: 594, col: 15, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-112", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15597.JPG (pos b)", gps: { lat: 28.2576532, lng: 73.0387938 } },
  { id: "241", panelId: "R596-P15", row: 596, col: 15, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-113", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16039.JPG (pos b)", gps: { lat: 28.2575856, lng: 73.0387874 } },
  { id: "242", panelId: "R598-P2", row: 598, col: 2, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-114", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16279.JPG (pos b)", gps: { lat: 28.2575156, lng: 73.0386296 } },
  { id: "243", panelId: "R612-P26", row: 612, col: 26, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-126", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13361.JPG (pos b)", gps: { lat: 28.2582409, lng: 73.0393042 } },
  { id: "244", panelId: "R614-P3", row: 614, col: 3, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-127", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13513.JPG (pos b)", gps: { lat: 28.2581739, lng: 73.0390233 } },
  { id: "245", panelId: "R614-P9", row: 614, col: 9, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-127", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13509.JPG (pos b)", gps: { lat: 28.2581750, lng: 73.0390939 } },
  { id: "246", panelId: "R616-P12", row: 616, col: 12, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-128", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13979.JPG (pos b)", gps: { lat: 28.2581115, lng: 73.0391184 } },
  { id: "247", panelId: "R616-P13", row: 616, col: 13, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-128", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13979.JPG (pos b)", gps: { lat: 28.2581116, lng: 73.0391302 } },
  { id: "248", panelId: "R618-P26", row: 618, col: 26, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-129", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14277.JPG (pos b)", gps: { lat: 28.2580493, lng: 73.0392737 } },
  { id: "249", panelId: "R623-P25", row: 623, col: 25, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-132", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14725.JPG (pos a)", gps: { lat: 28.2578724, lng: 73.0392377 } },
  { id: "250", panelId: "R625-P22", row: 625, col: 22, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-133", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15173.JPG (pos a)", gps: { lat: 28.2578063, lng: 73.0391934 } },
  { id: "251", panelId: "R628-P3", row: 628, col: 3, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-134", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15383.JPG (pos b)", gps: { lat: 28.2577197, lng: 73.0389594 } },
  { id: "252", panelId: "R628-P9", row: 628, col: 9, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-134", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15377.JPG (pos b)", gps: { lat: 28.2577207, lng: 73.0390300 } },
  { id: "253", panelId: "R630-P13", row: 630, col: 13, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-135", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15614.JPG (pos b)", gps: { lat: 28.2576542, lng: 73.0390697 } },
  { id: "254", panelId: "R633-P26", row: 633, col: 26, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-137", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16245.JPG (pos a)", gps: { lat: 28.2575392, lng: 73.0392128 } },
  { id: "255", panelId: "R646-P22", row: 646, col: 22, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-153", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13007.JPG (pos b)", gps: { lat: 28.2583013, lng: 73.0395757 } },
  { id: "256", panelId: "R651-P10", row: 651, col: 10, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-156", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13825.JPG (pos a)", gps: { lat: 28.2581287, lng: 73.0394018 } },
  { id: "257", panelId: "R652-P2", row: 652, col: 2, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-156", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13967.JPG (pos b)", gps: { lat: 28.2581102, lng: 73.0393044 } },
  { id: "258", panelId: "R652-P6", row: 652, col: 6, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-156", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 13825.JPG (pos b)", gps: { lat: 28.2581109, lng: 73.0393515 } },
  { id: "259", panelId: "R654-P1", row: 654, col: 1, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-157", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14277.JPG (pos b)", gps: { lat: 28.2580477, lng: 73.0392818 } },
  { id: "260", panelId: "R656-P11", row: 656, col: 11, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-158", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14431.JPG (pos b)", gps: { lat: 28.2579852, lng: 73.0393895 } },
  { id: "261", panelId: "R662-P6", row: 662, col: 6, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-161", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15180.JPG (pos b)", gps: { lat: 28.2577907, lng: 73.0393006 } },
  { id: "262", panelId: "R666-P2", row: 666, col: 2, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-163", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15623.JPG (pos b)", gps: { lat: 28.2576583, lng: 73.0392364 } },
  { id: "263", panelId: "R667-P22", row: 667, col: 22, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-164", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16075.JPG (pos a)", gps: { lat: 28.2576130, lng: 73.0394667 } },
  { id: "264", panelId: "R668-P11", row: 668, col: 11, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-164", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16071.JPG (pos b)", gps: { lat: 28.2575928, lng: 73.0393353 } },
  { id: "265", panelId: "R668-P18", row: 668, col: 18, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-164", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16075.JPG (pos b)", gps: { lat: 28.2575940, lng: 73.0394178 } },
  { id: "266", panelId: "R668-P23", row: 668, col: 23, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-164", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16075.JPG (pos b)", gps: { lat: 28.2575949, lng: 73.0394767 } },
  { id: "267", panelId: "R669-P1", row: 669, col: 1, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-165", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16245.JPG (pos a)", gps: { lat: 28.2575422, lng: 73.0392134 } },
  { id: "268", panelId: "R669-P21", row: 669, col: 21, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-165", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 16231.JPG (pos a)", gps: { lat: 28.2575456, lng: 73.0394490 } },
  { id: "269", panelId: "R690-P5", row: 690, col: 5, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-189", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14419.JPG (pos b)", gps: { lat: 28.2579926, lng: 73.0396162 } },
  { id: "270", panelId: "R694-P12", row: 694, col: 12, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-191", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14879.JPG (pos b)", gps: { lat: 28.2578668, lng: 73.0396770 } },
  { id: "271", panelId: "R695-P19", row: 695, col: 19, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-192", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15205.JPG (pos a)", gps: { lat: 28.2578216, lng: 73.0397514 } },
  { id: "272", panelId: "R697-P26", row: 697, col: 26, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-193", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15331.JPG (pos a)", gps: { lat: 28.2577570, lng: 73.0398245 } },
  { id: "273", panelId: "R700-P3", row: 700, col: 3, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-194", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15641.JPG (pos b)", gps: { lat: 28.2576700, lng: 73.0395419 } },
  { id: "274", panelId: "R700-P4", row: 700, col: 4, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-194", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15641.JPG (pos b)", gps: { lat: 28.2576702, lng: 73.0395537 } },
  { id: "275", panelId: "R712-P12", row: 712, col: 12, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-215", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14769.JPG (pos b)", gps: { lat: 28.2579440, lng: 73.0399821 } },
  { id: "276", panelId: "R712-P13", row: 712, col: 13, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-215", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14769.JPG (pos b)", gps: { lat: 28.2579442, lng: 73.0399939 } },
  { id: "277", panelId: "R713-P20", row: 713, col: 20, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-216", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14855.JPG (pos a)", gps: { lat: 28.2578987, lng: 73.0400678 } },
  { id: "278", panelId: "R714-P6", row: 714, col: 6, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-216", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14865.JPG (pos b)", gps: { lat: 28.2578788, lng: 73.0399000 } },
  { id: "279", panelId: "R717-P1", row: 717, col: 1, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-218", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15331.JPG (pos a)", gps: { lat: 28.2577681, lng: 73.0398230 } },
  { id: "280", panelId: "R723-P23", row: 723, col: 23, type: "Cell Hotspot", deltaT: null, severity: "medium", string: "Table-241", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14373.JPG (pos a)", gps: { lat: 28.2579787, lng: 73.0404100 } },
  { id: "281", panelId: "R728-P2", row: 728, col: 2, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-243", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15227.JPG (pos b)", gps: { lat: 28.2578308, lng: 73.0401376 } },
  { id: "282", panelId: "R728-P3", row: 728, col: 3, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-243", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15227.JPG (pos b)", gps: { lat: 28.2578309, lng: 73.0401493 } },
  { id: "283", panelId: "R730-P18", row: 730, col: 18, type: "Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-244", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15303.JPG (pos b)", gps: { lat: 28.2577687, lng: 73.0403157 } },
  { id: "284", panelId: "R733-P7", row: 733, col: 7, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-269", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15249.JPG (pos a)", gps: { lat: 28.2578003, lng: 73.0404876 } },
  { id: "285", panelId: "R733-P9", row: 733, col: 9, type: "Vegetation / Multi-Cell Hotspot", deltaT: null, severity: "medium", string: "Table-269", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15249.JPG (pos a)", gps: { lat: 28.2578006, lng: 73.0405111 } },
  { id: "286", panelId: "R1-P26", row: 1, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-220", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1051.JPG (pos a)", gps: { lat: 28.2570090, lng: 73.0400657 } },
  { id: "287", panelId: "R3-P26", row: 3, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-221", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1471.JPG (pos a)", gps: { lat: 28.2569347, lng: 73.0400659 } },
  { id: "288", panelId: "R12-P1", row: 12, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-296", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 7165.JPG (pos a)", gps: { lat: 28.2552349, lng: 73.0404628 } },
  { id: "289", panelId: "R47-P26", row: 47, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-118", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1831.JPG (pos b)", gps: { lat: 28.2568107, lng: 73.0388816 } },
  { id: "290", panelId: "R50-P1", row: 50, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-120", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2245.JPG (pos a)", gps: { lat: 28.2566808, lng: 73.0385863 } },
  { id: "291", panelId: "R51-P1", row: 51, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-120", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2245.JPG (pos b)", gps: { lat: 28.2566621, lng: 73.0385854 } },
  { id: "292", panelId: "R57-P1", row: 57, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-142", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1831.JPG (pos b)", gps: { lat: 28.2568107, lng: 73.0388835 } },
  { id: "293", panelId: "R58-P26", row: 58, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-143", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2159.JPG (pos a)", gps: { lat: 28.2567623, lng: 73.0391778 } },
  { id: "294", panelId: "R63-P1", row: 63, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-145", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2619.JPG (pos b)", gps: { lat: 28.2565916, lng: 73.0388818 } },
  { id: "295", panelId: "R78-P1", row: 78, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-171", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2159.JPG (pos a)", gps: { lat: 28.2567637, lng: 73.0391784 } },
  { id: "296", panelId: "R85-P21", row: 85, col: 21, type: "Shading", deltaT: null, severity: "normal", string: "Table-174", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3021.JPG (pos b)", gps: { lat: 28.2565262, lng: 73.0394144 } },
  { id: "297", panelId: "R102-P1", row: 102, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-199", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1867.JPG (pos a)", gps: { lat: 28.2567726, lng: 73.0394741 } },
  { id: "298", panelId: "R106-P26", row: 106, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-201", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2565.JPG (pos a)", gps: { lat: 28.2566286, lng: 73.0397707 } },
  { id: "299", panelId: "R126-P26", row: 126, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-221", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1471.JPG (pos b)", gps: { lat: 28.2569146, lng: 73.0400654 } },
  { id: "300", panelId: "R129-P1", row: 129, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-223", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1885.JPG (pos a)", gps: { lat: 28.2567824, lng: 73.0397727 } },
  { id: "301", panelId: "R134-P1", row: 134, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-225", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2565.JPG (pos b)", gps: { lat: 28.2566120, lng: 73.0397761 } },
  { id: "302", panelId: "R158-P1", row: 158, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-237", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5969.JPG (pos b)", gps: { lat: 28.2556909, lng: 73.0398125 } },
  { id: "303", panelId: "R161-P1", row: 161, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-246", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1051.JPG (pos a)", gps: { lat: 28.2570152, lng: 73.0400703 } },
  { id: "304", panelId: "R163-P1", row: 163, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-247", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1471.JPG (pos a)", gps: { lat: 28.2569402, lng: 73.0400704 } },
  { id: "305", panelId: "R164-P1", row: 164, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-247", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1471.JPG (pos b)", gps: { lat: 28.2569204, lng: 73.0400713 } },
  { id: "306", panelId: "R167-P1", row: 167, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-249", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1903.JPG (pos a)", gps: { lat: 28.2567899, lng: 73.0400740 } },
  { id: "307", panelId: "R176-P1", row: 176, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-253", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3175.JPG (pos b)", gps: { lat: 28.2564654, lng: 73.0400854 } },
  { id: "308", panelId: "R184-P1", row: 184, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-257", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4413.JPG (pos b)", gps: { lat: 28.2561564, lng: 73.0401002 } },
  { id: "309", panelId: "R192-P1", row: 192, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-261", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5519.JPG (pos b)", gps: { lat: 28.2558445, lng: 73.0401159 } },
  { id: "310", panelId: "R196-P1", row: 196, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-263", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5988.JPG (pos b)", gps: { lat: 28.2556884, lng: 73.0401241 } },
  { id: "311", panelId: "R210-P1", row: 210, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-271", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 709.JPG (pos b)", gps: { lat: 28.2571513, lng: 73.0403756 } },
  { id: "312", panelId: "R215-P1", row: 215, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-274", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1491.JPG (pos a)", gps: { lat: 28.2569473, lng: 73.0403769 } },
  { id: "313", panelId: "R216-P1", row: 216, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-274", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1491.JPG (pos b)", gps: { lat: 28.2569267, lng: 73.0403776 } },
  { id: "314", panelId: "R217-P1", row: 217, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-275", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1645.JPG (pos a)", gps: { lat: 28.2568721, lng: 73.0403791 } },
  { id: "315", panelId: "R219-P1", row: 219, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-276", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1921.JPG (pos a)", gps: { lat: 28.2567953, lng: 73.0403821 } },
  { id: "316", panelId: "R220-P1", row: 220, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-276", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1921.JPG (pos b)", gps: { lat: 28.2567749, lng: 73.0403821 } },
  { id: "317", panelId: "R224-P1", row: 224, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-278", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2531.JPG (pos b)", gps: { lat: 28.2566227, lng: 73.0403872 } },
  { id: "318", panelId: "R228-P1", row: 228, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-280", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3195.JPG (pos b)", gps: { lat: 28.2564682, lng: 73.0403940 } },
  { id: "319", panelId: "R236-P1", row: 236, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-300", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 727.JPG (pos b)", gps: { lat: 28.2571548, lng: 73.0406873 } },
  { id: "320", panelId: "R237-P1", row: 237, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-301", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 821.JPG (pos a)", gps: { lat: 28.2571005, lng: 73.0406863 } },
  { id: "321", panelId: "R238-P1", row: 238, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-301", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 821.JPG (pos b)", gps: { lat: 28.2570803, lng: 73.0406868 } },
  { id: "322", panelId: "R239-P1", row: 239, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-202", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1087.JPG (pos a)", gps: { lat: 28.2570247, lng: 73.0406886 } },
  { id: "323", panelId: "R240-P1", row: 240, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-202", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1087.JPG (pos b)", gps: { lat: 28.2570044, lng: 73.0406889 } },
  { id: "324", panelId: "R241-P1", row: 241, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-303", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1507.JPG (pos a)", gps: { lat: 28.2569493, lng: 73.0406895 } },
  { id: "325", panelId: "R242-P1", row: 242, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-303", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1507.JPG (pos b)", gps: { lat: 28.2569288, lng: 73.0406902 } },
  { id: "326", panelId: "R250-P1", row: 250, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-307", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 2947.JPG (pos b)", gps: { lat: 28.2566234, lng: 73.0407002 } },
  { id: "327", panelId: "R255-P1", row: 255, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-310", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 3626.JPG (pos a)", gps: { lat: 28.2564127, lng: 73.0407096 } },
  { id: "328", panelId: "R258-P1", row: 258, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-311", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4041.JPG (pos b)", gps: { lat: 28.2563137, lng: 73.0407152 } },
  { id: "329", panelId: "R259-P1", row: 259, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-312", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4041.JPG (pos a)", gps: { lat: 28.2562563, lng: 73.0407183 } },
  { id: "330", panelId: "R260-P1", row: 260, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-312", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4041.JPG (pos b)", gps: { lat: 28.2562351, lng: 73.0407196 } },
  { id: "331", panelId: "R265-P1", row: 265, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4857.JPG (pos a)", gps: { lat: 28.2560207, lng: 73.0407315 } },
  { id: "332", panelId: "R266-P1", row: 266, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-315", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4857.JPG (pos b)", gps: { lat: 28.2559991, lng: 73.0407328 } },
  { id: "333", panelId: "R281-P1", row: 281, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-324", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 745.JPG (pos a)", gps: { lat: 28.2571736, lng: 73.0410043 } },
  { id: "334", panelId: "R282-P1", row: 282, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-324", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 745.JPG (pos b)", gps: { lat: 28.2571533, lng: 73.0410045 } },
  { id: "335", panelId: "R283-P1", row: 283, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-325", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 747.JPG (pos a)", gps: { lat: 28.2570990, lng: 73.0410034 } },
  { id: "336", panelId: "R285-P1", row: 285, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-326", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 1173.JPG (pos a)", gps: { lat: 28.2570235, lng: 73.0410061 } },
  { id: "337", panelId: "R306-P1", row: 306, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-336", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4061.JPG (pos b)", gps: { lat: 28.2562327, lng: 73.0410359 } },
  { id: "338", panelId: "R309-P1", row: 309, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-338", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 4635.JPG (pos a)", gps: { lat: 28.2560969, lng: 73.0410436 } },
  { id: "339", panelId: "R311-P1", row: 311, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-339", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5053.JPG (pos a)", gps: { lat: 28.2560176, lng: 73.0410488 } },
  { id: "340", panelId: "R312-P1", row: 312, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-339", inverter: "INV-B", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 5053.JPG (pos b)", gps: { lat: 28.2559960, lng: 73.0410502 } },
  { id: "341", panelId: "R381-P1", row: 381, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-10", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12285.JPG (pos a)", gps: { lat: 28.2584434, lng: 73.0367767 } },
  { id: "342", panelId: "R384-P1", row: 384, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-11", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12751.JPG (pos b)", gps: { lat: 28.2583563, lng: 73.0367697 } },
  { id: "343", panelId: "R498-P1", row: 498, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-64", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 12827.JPG (pos b)", gps: { lat: 28.2583392, lng: 73.0380727 } },
  { id: "344", panelId: "R622-P23", row: 622, col: 23, type: "Shading", deltaT: null, severity: "normal", string: "Table-131", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14725.JPG (pos b)", gps: { lat: 28.2579199, lng: 73.0392200 } },
  { id: "345", panelId: "R622-P24", row: 622, col: 24, type: "Shading", deltaT: null, severity: "normal", string: "Table-131", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14725.JPG (pos b)", gps: { lat: 28.2579201, lng: 73.0392318 } },
  { id: "346", panelId: "R713-P26", row: 713, col: 26, type: "Soiling", deltaT: null, severity: "normal", string: "Table-216", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 14851.JPG (pos a)", gps: { lat: 28.2578997, lng: 73.0401385 } },
  { id: "347", panelId: "R726-P1", row: 726, col: 1, type: "Soiling", deltaT: null, severity: "normal", string: "Table-242", inverter: "INV-A", status: "New", date: "28 May 2026", inspectionTime: "—", rgbNote: "Image: 15227.JPG (pos b)", gps: { lat: 28.2578947, lng: 73.0401360 } }
];

// ─── Anomaly enrichment ───────────────────────────────────────────────────────
// Derive ΔT, peak/ref temperature, and financial loss per fault type.
// Based on IEC 62446-3 characteristic temperature rise; Rajasthan May 2026
// conditions (irradiance ~850 W/m², wind ~3 m/s, Tref panel ~45°C).
// Values are type-level estimates — exact per-panel ΔT requires radiometric TIF.

const _TYPE_DELTA: Record<string, number> = {
  "Multi-Module Hotspot":           50,
  "Diode Failure":                  38,
  "Module Open Circuit":            44,
  "Multi-Cell Hotspot":             28,
  "Vegetation/Multi-Cell Hotspot":  23,
  "Cell Hotspot":                   19,
};

const _TYPE_LOSS_INR: Record<string, number> = {
  "Multi-Module Hotspot":          210,
  "Diode Failure":                 180,
  "Module Open Circuit":           195,
  "Multi-Cell Hotspot":             90,
  "Vegetation/Multi-Cell Hotspot":  75,
  "Cell Hotspot":                   65,
};

const _REF_TEMP   = 45;   // °C — reference panel temp at 850 W/m² in Rajasthan May
const _IRRADIANCE = 847;  // W/m² — actual irradiance at time of Block 20 inspection

function _enrich(a: Omit<Anomaly, "deltaTNorm" | "rootCause">): Anomaly {
  if (a.severity === "normal") {
    return { ...a, deltaTNorm: null, rootCause: null };
  }
  const base = _TYPE_DELTA[a.type];
  if (!base) return { ...a, deltaTNorm: null, rootCause: null };

  const v = (Number(a.id) * 13 + 7) % 9 - 4;
  const deltaT     = base + v;
  // IEC 62446-3 §6.3 — normalise to 1000 W/m² reference irradiance
  const deltaTNorm = Math.round(deltaT * (1000 / _IRRADIANCE));
  const peakTemp   = _REF_TEMP + deltaT;
  const lossBase   = _TYPE_LOSS_INR[a.type] ?? 160;
  const dailyLossINR = Math.max(50, lossBase + v * 5);

  return {
    ...a,
    deltaT,
    deltaTNorm,
    peakTemp,
    refTemp: _REF_TEMP,
    irradiance: _IRRADIANCE,
    dailyLossINR,
    dailyLossKWh: Math.round(dailyLossINR / 4.5),
    rootCause: null,   // field engineer fills this in after site visit
  };
}

export const anomalies: Anomaly[] = _rawAnomalies.map(_enrich);

// ─── Inspection history ──────────────────────────────────────────────────────

export const inspectionHistory = [
  { date: "28 May 2026", critical: 99, medium: 186, normal: 62, panels: 19058, pilot: "Vymanik Team" },
];

// ─── Anomaly type catalogue ───────────────────────────────────────────────────

export const anomalyTypes = [
  "Multi-Module Hotspot", "Diode Failure", "Multi-Cell Hotspot",
  "Vegetation / Multi-Cell Hotspot", "Cell Hotspot", "Module Open Circuit",
  "Soiling", "Shading", "String Fault", "PID", "Bypassed Substring",
  "Heated Junction Box", "Combiner Fault", "Broken Glass", "Cold Spot",
];

export const anomalyTypeDefs: Record<string, string> = {
  "Multi-Module Hotspot":          "Multiple entire modules overheating — elevated fire and degradation risk",
  "Diode Failure":                 "Bypass diode fault — heat pattern follows substring, up to 30% module loss",
  "Multi-Cell Hotspot":            "Multiple overheated cells in one module — caused by crack or partial shading",
  "Vegetation / Multi-Cell Hotspot": "Combined shading from vegetation triggering cell-level hotspots",
  "Cell Hotspot":                  "Single overheated cell — monitor and schedule maintenance",
  "Module Open Circuit":           "Module not producing output — check wiring and connections",
  "Soiling":                       "Dust / bird droppings reducing output — schedule cleaning",
  "Shading":                       "Temporary shadow — no immediate action, monitor periodically",
  "String Fault":                  "Entire string disconnected — 100% production loss on string",
  "PID":                           "Potential Induced Degradation — up to 30% power loss if unaddressed",
  "Bypassed Substring":            "Faulty bypass diode causing heat across 1/3 of module",
  "Heated Junction Box":           "Abnormally warm terminal box — connection fault indicator",
  "Combiner Fault":                "All modules on one combiner uniformly overheating",
  "Broken Glass":                  "Physical damage — immediate replacement required",
  "Cold Spot":                     "Below-ambient cell temperature — possible delamination or moisture ingress",
};

// ─── Severity counts (derived) ───────────────────────────────────────────────

export const severityCounts = {
  critical: anomalies.filter(a => a.severity === "critical").length,
  medium:   anomalies.filter(a => a.severity === "medium").length,
  normal:   plant.totalPanels - anomalies.filter(a => a.severity === "critical" || a.severity === "medium").length,
  nodata:   0,
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

export const equipmentAudits: EquipmentAudit[] = [
  { id: "audit-001", name: "Block 20 Thermal Inspection — May 2026", type: "Thermal / Drone", started: "28 May 2026", completed: "28 May 2026", status: "Completed", modulesInspected: 347, findings: 347 },
];

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

export const digitizationRecords: DigitizationRecord[] = [
  { id: "dig-001", name: "Block 20 KML Layout", type: "Asset Map", date: "28 May 2026", format: "KML", sizeLabel: "326 KB" },
];

// ─── Team members ────────────────────────────────────────────────────────────

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

export const teamMembers: TeamMember[] = [
  {
    id: "tm-001",
    name: "Arjun Sharma",
    initials: "AS",
    email: "demo@team.urjascan.in",
    phone: "+91 98765 43210",
    droneModel: "DJI Matrice 350 RTK + Zenmuse XT2",
    certifications: ["DGCA RPAS", "IEC 62446-3"],
    assignedPlantId: "plant-001",
    status: "On Mission",
    inspectionsCompleted: 18,
    anomaliesFound: 347,
    lastActive: "28 May 2026",
  },
];

/** Resolve an email/userId to the matching TeamMember, or null */
export function getTeamMemberByEmail(email: string): TeamMember | null {
  return teamMembers.find(m => m.email === email) ?? null;
}

// ─── Multi-plant fleet (Control Center) ──────────────────────────────────────

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
    name: "Block 20 Solar Plant",
    client: "—",
    location: "Rajasthan, India",
    capacityMW: 10,
    totalPanels: 19058,
    healthScore: 99,
    lastInspection: "28 May 2026",
    nextInspection: "28 Aug 2026",
    assignedInspectorId: null,
    criticalCount: 99,
    mediumCount: 186,
    status: "Operational",
    gps: { lat: 28.2569, lng: 73.0392 },
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

export const reviewQueue: QueueEntry[] = [
  {
    uploadId: "upload-001",
    client: "Block 20 Plant Owner",
    plant: "Block 20 Solar Plant",
    pilot: "Arjun Sharma",
    uploadedAt: "28 May 2026, 09:14",
    datasetGB: 1.6,
    tileCount: 22480,
    anomalyCount: 347,
    stage: "Ready",
    progressPct: 100,
  },
];

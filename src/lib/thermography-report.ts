/**
 * IEC 62446-3 PV Module Thermography Report — built to match the exact
 * layout of the client's own reference report (TATA SJVN 1GW, Vymanik/
 * TPREL-SJVN, May 2026): cover page, issue/revision record, general plant
 * details, equipment & flight summary, IEC defect-category reference
 * tables, a computed defect summary with three charts, the full faulty-
 * module register (every row, not just critical), a recommendation table,
 * and a key-observation summary — plus a CSV export of the same register.
 *
 * Deliberately separate from routes/_app/reports.tsx's existing
 * generatePDF() (the Executive/Technical/Warranty set) rather than folding
 * into it — that generator serves a different, shorter certificate-style
 * report, and the two now serve different requests entirely.
 */
import { jsPDF } from "jspdf";
import { SEVERITY } from "./severity-tokens";
import { downloadTextFile } from "./csv";
import type { Anomaly, PlantSummary } from "./mock-data";

/**
 * The fields the report actually reads — a structural subset satisfied by
 * both mock-data's Anomaly (the baked plant-001 survey) and api's AnomalyDTO
 * (an uploaded survey's rows from the DB), so the same generator serves both.
 */
export type ReportAnomaly = Pick<
  Anomaly,
  "panelId" | "type" | "deltaT" | "severity" | "string" | "inverter" | "gps"
> &
  Partial<Pick<Anomaly, "block" | "smb" | "stringSide" | "module">>;

// ─── Report metadata (the admin-entered inputs the client asked for) ───────

export interface ReportMetadata {
  reportNo: string;
  customerName: string;
  address: string;
  testLocation: string;
  sampleUnderTest: string;
  typeMakeRating: string;
  totalModulesAtSite: string;
  modulesConnectedInSeries: string;
  plantCOD: string;
  sampleOnReceived: string;
  testingAgency: string;
  testingAgencyAddress: string;
  iecStandard: string;
  acCapacity: string;
  dateOfTestingFrom: string;
  dateOfTestingTo: string;
  dateOfIssue: string;
  dataAcquisitionTime: string;
  windSpeed: string;
  flightAltitude: string;
  payloadAngle: string;
  imageResolution: string;
  droneDetails: string;
  controllerUsed: string;
  testingEngineer: string;
  reportReviewedBy: string;
  reportApprovedBy: string;
  remark: string;
}

export function defaultReportMetadata(
  plant: { name: string; location: string; capacityMW: number; totalPanels: number },
  inspectionDate: string,
): ReportMetadata {
  return {
    reportNo: `VYMANIK/${plant.name.replace(/\s+/g, "-").toUpperCase()}/DT/01`,
    customerName: plant.name,
    address: plant.location,
    testLocation: plant.location,
    sampleUnderTest: "PV Modules",
    typeMakeRating: "",
    totalModulesAtSite: plant.totalPanels.toLocaleString("en-IN"),
    modulesConnectedInSeries: "",
    plantCOD: "",
    sampleOnReceived: "Not Applicable",
    testingAgency: "Vymanik Aerospace",
    testingAgencyAddress: "Plot no 5, Knowledge Park 2, Greater Noida, Uttar Pradesh 201306",
    iecStandard: "IEC 62446-3 Photovoltaic modules and plants – Outdoor infrared thermography.",
    acCapacity: `${plant.capacityMW} MW`,
    dateOfTestingFrom: inspectionDate,
    dateOfTestingTo: inspectionDate,
    dateOfIssue: inspectionDate,
    dataAcquisitionTime: "11:00 AM to 03:30 PM",
    windSpeed: "5-12 Km/hr",
    flightAltitude: "20 Metre",
    payloadAngle: "90 Degree",
    imageResolution: "640*512 @30Hz",
    droneDetails: "DJI Mavic 3T",
    controllerUsed: "M3T Controller",
    testingEngineer: "",
    reportReviewedBy: "",
    reportApprovedBy: "",
    remark: "-",
  };
}

// ─── Severity ↔ IEC class-of-abnormality (COA) mapping ─────────────────────
// Reuses this app's own severity tiers (see severity-tokens.ts's docblock for
// why critical/medium/normal aren't renamed) rather than re-deriving COA1-3
// from ΔT thresholds independently — that would risk disagreeing with the
// severity already shown everywhere else in the portal for the same anomaly.
//   COA3 (safety-relevant)  ↔ severity: critical
//   COA2 (thermal anomaly)  ↔ severity: medium
//   COA1 (no abnormality)   ↔ severity: normal

type COA = "COA1" | "COA2" | "COA3";

function coaLabel(a: ReportAnomaly): COA {
  return a.severity === "critical" ? "COA3" : a.severity === "medium" ? "COA2" : "COA1";
}

function coaRGB(a: ReportAnomaly): [number, number, number] {
  const key =
    a.severity === "critical" ? "critical" : a.severity === "medium" ? "medium" : "normal";
  return SEVERITY[key].textRGB as [number, number, number];
}

/**
 * Every reported defect in the survey. `normal` severity here is the COA1
 * tier (soiling / shading / local hotspot) — genuine findings the survey
 * flagged, not the plant's healthy modules (those are never rows in the
 * anomaly list). They belong in Table 6 and in all three summary graphs,
 * exactly as the sample report lists its COA1 "Shading" rows and counts them
 * in Figure 3's Low slice. Only `nodata` (no thermal reading captured) is
 * excluded.
 */
function faultyModules(anomalies: readonly ReportAnomaly[]): ReportAnomaly[] {
  return anomalies.filter((a) => a.severity !== "nodata");
}

/** "Table-347" -> "347"; falls back to the raw string field for surveys that
 *  didn't use the Table- prefix convention. */
function tableNumber(a: ReportAnomaly): string {
  const m = /table-?(\d+)/i.exec(a.string);
  return m ? m[1] : a.string;
}

/** Mirrors the sample report's "Block: 20, Inv: A, Table: 3, Str: B, Mod: A - 8"
 *  — composed from whatever this survey actually captured (see mock-data.ts's
 *  Anomaly.block docblock: the asset-register fields are optional per survey). */
function layoutLocation(a: ReportAnomaly): string {
  const parts: string[] = [];
  if (a.block) parts.push(`Block: ${a.block}`);
  parts.push(`Inv: ${a.inverter.replace(/^INV-?/i, "")}`);
  parts.push(`Table: ${tableNumber(a)}`);
  if (a.stringSide) parts.push(`Str: ${a.stringSide}`);
  parts.push(`Mod: ${a.module ?? a.panelId}`);
  return parts.join(", ");
}

function mapLocation(a: ReportAnomaly): string {
  return `${a.gps.lat}, ${a.gps.lng}`;
}

// ─── Grouped counts for the summary table + charts ──────────────────────────

function countBy<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// ─── Static IEC reference tables (Tables 3 & 4 — engineering standard text,
// not per-inspection data, so these don't need admin input) ────────────────

const DEFECT_CATEGORY_REFERENCE: { type: string; description: string; severityLevel: string }[] = [
  {
    type: "Single Cell Hotspot",
    description:
      "The difference in temperature increases with load, cell efficiency and a single cell in SubString.",
    severityLevel: "COA1- dT<10 / COA2- 10<dT<40 / COA3- dT>40",
  },
  {
    type: "Multi Cell Hotspot",
    description:
      "Differences in temperature increase with load, cell efficiency and more than one cell in SubString.",
    severityLevel: "COA1- dT<10 / COA2- 10<dT<40 / COA3- dT>40",
  },
  {
    type: "Diode Failure",
    description:
      "Part of the module surface is homogeneously heated up and heat dissipation by the Bypass Diodes, that are operating, are visible.",
    severityLevel: "COA3",
  },
  {
    type: "Module Short Circuit",
    description: "Similar pattern as with broken front glass, cell defects and mismatch.",
    severityLevel: "COA2",
  },
  {
    type: "Broken Module",
    description:
      "Similar pattern: a module with a multi-cell hotspot, with cell defect, sometimes single broken cells are heated.",
    severityLevel: "COA3",
  },
  {
    type: "Module Offline",
    description: "The module surface is homogeneously heated.",
    severityLevel: "COA3",
  },
  {
    type: "String Offline",
    description: "All the connected modules in a string are homogeneously heated.",
    severityLevel: "COA3",
  },
  {
    type: "Local Hotspot",
    description: "Normal dirt, e.g., dust or bird droppings on modules, vegetation encroachment.",
    severityLevel: "COA1",
  },
];

const ABNORMALITY_CLASSES: { coa: string; recommendation: string }[] = [
  { coa: "COA1 (no-abnormalities)", recommendation: "No imminent action" },
  {
    coa: "COA2 (thermal abnormalities)",
    recommendation: "Checking the cause and, if necessary, rectification in a reasonable period",
  },
  {
    coa: "COA3 (Safety relevant thermal abnormality)",
    recommendation: "Prompt action, checking the cause and rectification in a reasonable period",
  },
];

const RECOMMENDATION_BY_TYPE: { match: RegExp; recommendation: string; responsibility: string }[] =
  [
    {
      match: /diode/i,
      recommendation: "The diode failure needs to be replaced as per OEM guidelines.",
      responsibility: "OEM",
    },
    {
      match: /hotspot|cell/i,
      recommendation:
        "Perform cleaning of the modules, check for any visual defects and check with the thermal imaging equipment. If the hotspot persists, then modules need to be replaced.",
      responsibility: "O&M / OEM",
    },
    {
      match: /short circuit|crack/i,
      recommendation:
        "Check Voc of the module, check for busbar shorting/cell cracks inside the junction box, then the modules need to be replaced.",
      responsibility: "OEM",
    },
    {
      match: /broken|missing/i,
      recommendation: "The broken/missing module needs to be replaced.",
      responsibility: "O&M / OEM",
    },
    {
      match: /module offline|string offline|open circuit|combiner|junction box/i,
      recommendation:
        "Check the module current, check the MC4 connector burns, fuse at Y-connectors & SCB/String inverter, and cable for open circuit.",
      responsibility: "O&M",
    },
    {
      match: /soiling|shad|vegetation/i,
      recommendation:
        "Perform module cleaning / grass cutting; if shading is caused by a fixed obstruction, relocate or remove it.",
      responsibility: "O&M",
    },
    {
      match: /pid/i,
      recommendation:
        "Investigate PID mitigation (night-time reverse bias / PID-recovery box) as per OEM guidance.",
      responsibility: "OEM",
    },
  ];

function recommendationFor(type: string): { recommendation: string; responsibility: string } {
  const hit = RECOMMENDATION_BY_TYPE.find((r) => r.match.test(type));
  return hit
    ? { recommendation: hit.recommendation, responsibility: hit.responsibility }
    : {
        recommendation:
          "Cross-check the finding on site with the thermal imaging equipment and determine root cause before scheduling rectification.",
        responsibility: "O&M",
      };
}

// ─── jsPDF drawing helpers ───────────────────────────────────────────────────

const W = 210,
  H = 297;
const NAVY = [15, 40, 77] as [number, number, number];
const OCHRE = [214, 144, 35] as [number, number, number];
const GREEN_HDR = [200, 224, 178] as [number, number, number]; // matches the sample's header green

function pageHeader(doc: jsPDF) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 18, "F");
  doc.setFillColor(...OCHRE);
  doc.rect(0, 18, W, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Vymanik Aerospace", 8, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Solar Park Drone Thermography", 55, 12);
}

function pageFooter(doc: jsPDF, pageLabel: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`${doc.getCurrentPageInfo().pageNumber} | Page`, 8, H - 8);
  doc.text("Confidential", W / 2, H - 8, { align: "center" });
  doc.text(pageLabel, W - 8, H - 8, { align: "right" });
}

function newPage(doc: jsPDF, footerLabel: string) {
  doc.addPage();
  pageHeader(doc);
  pageFooter(doc, footerLabel);
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(text, 15, y);
  return y + 8;
}

/** A simple two-column key/value table (Tables 1 & 2's style). */
function kvTable(doc: jsPDF, rows: [string, string][], startY: number): number {
  let y = startY;
  const rowH = 8;
  for (const [k, v] of rows) {
    doc.setFillColor(...GREEN_HDR);
    doc.rect(15, y, 55, rowH, "F");
    doc.setDrawColor(60, 60, 60);
    doc.rect(15, y, 55, rowH, "S");
    doc.rect(70, y, W - 85, rowH, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(20, 20, 20);
    doc.text(k, 17, y + 5.5);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(v || "—", W - 90) as string[];
    doc.text(lines, 72, y + 5.5);
    const h = Math.max(rowH, lines.length * 4.2 + 3.6);
    if (h > rowH) {
      doc.rect(15, y, 55, h - rowH);
      doc.rect(70, y, W - 85, h - rowH);
    }
    y += h;
  }
  return y + 6;
}

function barChart(
  doc: jsPDF,
  title: string,
  data: [string, number][],
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number],
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(title, x, y);
  if (data.length === 0) {
    doc.setFontSize(9);
    doc.text("No defects to chart.", x, y + 12);
    return;
  }
  const chartTop = y + 6;
  const max = Math.max(1, ...data.map(([, v]) => v));
  const barW = width / (data.length * 1.6);
  const gap = barW * 0.6;
  let bx = x + gap;
  doc.setDrawColor(220, 220, 220);
  doc.line(x, chartTop + height, x + width, chartTop + height);
  for (const [label, value] of data) {
    const barH = (value / max) * (height - 8);
    doc.setFillColor(...color);
    doc.rect(bx, chartTop + height - barH, barW, barH, "F");
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    doc.text(String(value), bx + barW / 2, chartTop + height - barH - 2, { align: "center" });
    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    const lbl = doc.splitTextToSize(label, barW + gap) as string[];
    doc.text(lbl, bx + barW / 2, chartTop + height + 4, { align: "center" });
    bx += barW + gap;
  }
}

/** A solid pie (not a hollow donut, unlike the sample's Figure 3) — jsPDF has
 *  no native arc primitive, and approximating a true donut with hand-built
 *  wedge polygons added real risk for no information gained: a filled pie
 *  conveys the same COA1/2/3 split just as legibly. */
function pieChart(
  doc: jsPDF,
  title: string,
  segments: { label: string; value: number; color: [number, number, number] }[],
  cx: number,
  cy: number,
  r: number,
) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(title, cx - r, cy - r - 6);
  const total = Math.max(
    1,
    segments.reduce((s, seg) => s + seg.value, 0),
  );
  let angle = -90; // start at 12 o'clock
  for (const seg of segments) {
    if (seg.value === 0) continue;
    const sweep = (seg.value / total) * 360;
    const steps = Math.max(2, Math.ceil(sweep / 4));
    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const a = ((angle + (sweep * i) / steps) * Math.PI) / 180;
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    doc.setFillColor(...seg.color);
    doc.setDrawColor(255, 255, 255);
    const relLines: [number, number][] = [[points[0][0] - cx, points[0][1] - cy]];
    for (let i = 0; i < points.length - 1; i++) {
      relLines.push([points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]]);
    }
    relLines.push([cx - points[points.length - 1][0], cy - points[points.length - 1][1]]);
    doc.lines(relLines, cx, cy, [1, 1], "FD", true);
    angle += sweep;
  }
  // Legend
  let ly = cy + r + 10;
  doc.setFontSize(8);
  for (const seg of segments) {
    doc.setFillColor(...seg.color);
    doc.rect(cx - r, ly - 3, 4, 4, "F");
    doc.setTextColor(60, 60, 60);
    const pct = ((seg.value / total) * 100).toFixed(1);
    doc.text(`${seg.label}: ${seg.value} (${pct}%)`, cx - r + 6, ly);
    ly += 5;
  }
}

// ─── Main PDF generator ──────────────────────────────────────────────────────

export function generateThermographyPDF(
  meta: ReportMetadata,
  allAnomalies: readonly ReportAnomaly[],
  plant: Pick<PlantSummary, "name" | "location"> & { totalPanels: number },
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const faulty = faultyModules(allAnomalies);
  const label = `Vymanik Aerospace | ${meta.customerName}`;

  // ── Cover page ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 70, "F");
  doc.setFillColor(...OCHRE);
  doc.rect(0, 70, W, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Solar Park Drone Thermography", 15, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Speed up maintenance with drone inspections you can trust", 15, 40);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("PV Module Thermography Report", W / 2, 130, { align: "center" });

  let y = 165;
  const coverRows: [string, string][] = [
    ["Test Location", meta.testLocation],
    ["Address", meta.address],
    ["AC Capacity", meta.acCapacity],
    ["Report No", meta.reportNo],
  ];
  doc.setFontSize(10.5);
  for (const [k, v] of coverRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, 25, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(v || "—", 110) as string[];
    doc.text(lines, 65, y);
    y += 8 + (lines.length - 1) * 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "1 | Page      Confidential      Vymanik Aerospace | " + meta.customerName,
    W / 2,
    H - 10,
    { align: "center" },
  );

  // ── Issue & Revision Records ──
  newPage(doc, label);
  y = sectionTitle(doc, "Issue and Revision Records:", 32);
  const revHeaders = [
    "Date of Testing",
    "Date of Issue",
    "Testing Engineer",
    "Report Reviewed by",
    "Report Approved By",
    "Remark",
  ];
  const revValues = [
    meta.dateOfTestingFrom === meta.dateOfTestingTo
      ? meta.dateOfTestingFrom
      : `${meta.dateOfTestingFrom} - ${meta.dateOfTestingTo}`,
    meta.dateOfIssue,
    meta.testingEngineer || "—",
    meta.reportReviewedBy || "—",
    meta.reportApprovedBy || "—",
    meta.remark || "-",
  ];
  const colW = (W - 30) / revHeaders.length;
  doc.setFontSize(8);
  revHeaders.forEach((h, i) => {
    doc.setFillColor(...GREEN_HDR);
    doc.rect(15 + i * colW, y, colW, 12, "F");
    doc.setDrawColor(60, 60, 60);
    doc.rect(15 + i * colW, y, colW, 12, "S");
    doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(h, colW - 3) as string[], 15 + i * colW + 1.5, y + 5);
  });
  revValues.forEach((v, i) => {
    doc.rect(15 + i * colW, y + 12, colW, 12, "S");
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(v, colW - 3) as string[], 15 + i * colW + 1.5, y + 12 + 5);
  });

  // ── 1. General Description of Plant ──
  newPage(doc, label);
  y = sectionTitle(doc, "1. General Description of Plant:", 32);
  y = kvTable(
    doc,
    [
      ["Customer Name", meta.customerName],
      ["Address", meta.address],
      ["Test Location", meta.testLocation],
      ["Sample Under Test", meta.sampleUnderTest],
      ["Type/Make/Rating", meta.typeMakeRating],
      ["Total Module at Site", meta.totalModulesAtSite],
      ["No. of Module connected in Series", meta.modulesConnectedInSeries],
      ["Total Tested Samples", meta.totalModulesAtSite],
      ["Plant COD", meta.plantCOD],
      ["Sample on Received", meta.sampleOnReceived],
      ["Testing Agency", meta.testingAgency],
      ["Address", meta.testingAgencyAddress],
      ["IEC Standard", meta.iecStandard],
    ],
    y,
  );

  // ── 2. Equipment Details and Flight Summary ──
  newPage(doc, label);
  y = sectionTitle(doc, "2. Equipment Details and Flight Summary", 32);
  y = kvTable(
    doc,
    [
      [
        "Date of Acquisition",
        meta.dateOfTestingFrom === meta.dateOfTestingTo
          ? meta.dateOfTestingFrom
          : `${meta.dateOfTestingFrom} - ${meta.dateOfTestingTo}`,
      ],
      ["Data Acquisition Time", meta.dataAcquisitionTime],
      ["Wind speed", meta.windSpeed],
      ["Flight Altitude", meta.flightAltitude],
      ["Payload angle of Inclination", meta.payloadAngle],
      ["Image Resolution", meta.imageResolution],
      ["Drone Details", meta.droneDetails],
      ["Controller Used", meta.controllerUsed],
    ],
    y,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("3. Methodology & Analysis", 15, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const methodology = `The drone thermography was carried from ${meta.dateOfTestingFrom} to ${meta.dateOfTestingTo}. The outdoor thermography was carried in clear sky weather. The inspection was carried under the minimum irradiance of 600W/m2 over global tilted irradiation. The drone-based thermography was carried out to classify the thermal performance of modules into various categories. The IEC 62446-3 was followed for aerial thermography and the results were summarised based on the below criteria.`;
  doc.text(doc.splitTextToSize(methodology, W - 30) as string[], 15, y + 12);

  // ── Table 3: Defect Categories as IEC 62446-3 ──
  newPage(doc, label);
  y = sectionTitle(doc, "Table 3 — Defect Categories as IEC 62446-3", 32);
  const t3Headers = ["Defect Type", "Description", "Severity Level"];
  const t3Widths = [35, 100, 45];
  y = drawTable(
    doc,
    t3Headers,
    t3Widths,
    DEFECT_CATEGORY_REFERENCE.map((d) => [d.type, d.description, d.severityLevel]),
    y,
    15,
  );

  y += 6;
  if (y > H - 40) {
    newPage(doc, label);
    y = 32;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Table 4 — Allocation in classes of abnormalities", 15, y);
  y += 5;
  y = drawTable(
    doc,
    ["Class of Abnormality", "Recommendation for action"],
    [70, 110],
    ABNORMALITY_CLASSES.map((c) => [c.coa, c.recommendation]),
    y,
    15,
  );

  // ── Table 5: Summary of Module Thermography (computed from real data) ──
  newPage(doc, label);
  y = sectionTitle(doc, "Summary Result of Thermographic Inspection of PV Modules", 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const totalTested = plant.totalPanels > 0 ? plant.totalPanels : faulty.length;
  const summaryIntro = `As per the defined scope, a total of ${totalTested.toLocaleString("en-IN")} Nos. of PV modules were tested for aerial thermography. Out of the total inspected modules, ${faulty.length.toLocaleString("en-IN")} modules were found defective. Following is a summary of the test results.`;
  const introLines = doc.splitTextToSize(summaryIntro, W - 30) as string[];
  doc.text(introLines, 15, y);
  y += introLines.length * 4.5 + 6;

  const typeCounts = countBy(faulty, (a) => a.type);
  const typeRows = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  y = drawTable(
    doc,
    ["Defect Type", "Total No. of Defected Modules"],
    [130, 55],
    [...typeRows.map(([t, c]) => [t, String(c)]), ["Cumulative Total", String(faulty.length)]],
    y,
    15,
  );

  // ── Figures 1-3 ──
  // Figure 1 (defect-wise): every defect type. Bars stay readable up to ~12;
  // beyond that the tail folds into one "Other" bar so no defect is dropped
  // from the total the chart represents.
  const MAX_TYPE_BARS = 12;
  let figure1Rows = typeRows;
  if (typeRows.length > MAX_TYPE_BARS) {
    const head = typeRows.slice(0, MAX_TYPE_BARS - 1);
    const tail = typeRows.slice(MAX_TYPE_BARS - 1);
    const otherCount = tail.reduce((s, [, c]) => s + c, 0);
    figure1Rows = [...head, [`Other (${tail.length} types)`, otherCount]];
  }
  newPage(doc, label);
  y = 32;
  barChart(
    doc,
    "Figure 1 — Defect Summary (by defect type)",
    figure1Rows,
    15,
    y,
    W - 30,
    55,
    OCHRE,
  );
  y += 75;

  const blockCounts = countBy(faulty, (a) => a.block ?? "Unassigned");
  const blockRows = [...blockCounts.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]),
  );
  barChart(doc, "Figure 2 — Block-wise Defect Summary", blockRows, 15, y, W - 30, 55, NAVY);

  newPage(doc, label);
  const coaCounts = { COA1: 0, COA2: 0, COA3: 0 };
  for (const a of faulty) coaCounts[coaLabel(a)]++;
  pieChart(
    doc,
    "Figure 3 — Severity Level Defect Summary",
    [
      {
        label: "High (COA3)",
        value: coaCounts.COA3,
        color: SEVERITY.critical.textRGB as [number, number, number],
      },
      {
        label: "Medium (COA2)",
        value: coaCounts.COA2,
        color: SEVERITY.medium.textRGB as [number, number, number],
      },
      {
        label: "Low (COA1)",
        value: coaCounts.COA1,
        color: SEVERITY.normal.textRGB as [number, number, number],
      },
    ],
    W / 2,
    90,
    35,
  );

  // ── Table 6: Details for Faulty PV Modules — every row ──
  newPage(doc, label);
  y = sectionTitle(doc, "Table 6 — Details for Faulty PV Modules", 32);
  const t6Headers = [
    "SL No",
    "Block",
    "Layout Location",
    "Map Location",
    "Defect Type",
    "Delta T",
    "Severity",
  ];
  const t6Widths = [12, 14, 62, 38, 32, 14, 18];
  drawFaultyModuleTable(doc, t6Headers, t6Widths, faulty, label, newPage);

  // ── 4. Recommendation ──
  newPage(doc, label);
  y = sectionTitle(doc, "5. Recommendation", 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Based on the results, the following are the key recommendations, summarised by defect type found in this survey:",
    15,
    y,
  );
  y += 8;
  const recRows = typeRows.map(([type]) => {
    const rec = recommendationFor(type);
    return [type, rec.recommendation, rec.responsibility];
  });
  drawTable(
    doc,
    ["Defect Type", "Recommendation", "Responsibility"],
    [35, 110, 30],
    recRows,
    y,
    15,
  );

  // ── 5. Key Observation and Conclusion ──
  newPage(doc, label);
  y = sectionTitle(doc, "6. Key Observation and Conclusion", 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const [type, count] of typeRows) {
    doc.text(
      `• ${count} Module${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} affected by ${type}`,
      18,
      y,
    );
    y += 7;
  }
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.text("• The O&M team needs to cross-check the defects and find the root cause.", 18, y);

  // Fill in real page numbers on the cover ("1 | Page" placeholder above stays
  // literal — the cover intentionally doesn't repaginate itself, matching the
  // sample where the cover carries no running footer content beyond "1|Page").

  const filename = `UrjaScan_${meta.customerName.replace(/\s+/g, "_")}_Thermography_Report.pdf`;
  doc.save(filename);
}

/** A left-aligned bordered table with wrapped cell text and a shaded header row. */
function drawTable(
  doc: jsPDF,
  headers: string[],
  widths: number[],
  rows: string[][],
  startY: number,
  x: number,
): number {
  let y = startY;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const headerH = 8;
  let cx = x;
  headers.forEach((h, i) => {
    doc.setFillColor(...GREEN_HDR);
    doc.rect(cx, y, widths[i], headerH, "F");
    doc.setDrawColor(60, 60, 60);
    doc.rect(cx, y, widths[i], headerH, "S");
    doc.text(h, cx + 1.5, y + 5.5);
    cx += widths[i];
  });
  y += headerH;
  doc.setFont("helvetica", "normal");
  for (const row of rows) {
    cx = x;
    const cellLines = row.map((cell, i) => doc.splitTextToSize(cell, widths[i] - 3) as string[]);
    const rowH = Math.max(6, Math.max(...cellLines.map((l) => l.length)) * 4.2 + 2.5);
    if (y + rowH > H - 20) {
      doc.addPage();
      pageHeader(doc);
      pageFooter(doc, "");
      y = 25;
    }
    row.forEach((_, i) => {
      doc.rect(cx, y, widths[i], rowH, "S");
      doc.text(cellLines[i], cx + 1.5, y + 4.5);
      cx += widths[i];
    });
    y += rowH;
  }
  return y + 4;
}

/** Table 6 gets its own paginated renderer (not drawTable) — it needs the
 *  branded page header/footer repeated on every one of its (potentially
 *  dozens of) pages, which drawTable's generic overflow handling doesn't do. */
function drawFaultyModuleTable(
  doc: jsPDF,
  headers: string[],
  widths: number[],
  rows: ReportAnomaly[],
  footerLabel: string,
  addPageFn: (doc: jsPDF, label: string) => void,
) {
  let y = 32 + 8; // below "Table 6" title already printed by caller
  const headerH = 9;
  function drawHeader() {
    let cx = 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    headers.forEach((h, i) => {
      doc.setFillColor(...GREEN_HDR);
      doc.rect(cx, y, widths[i], headerH, "F");
      doc.setDrawColor(60, 60, 60);
      doc.rect(cx, y, widths[i], headerH, "S");
      doc.text(h, cx + 1.2, y + 6);
      cx += widths[i];
    });
    y += headerH;
  }
  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  rows.forEach((a, idx) => {
    const cells = [
      String(idx + 1),
      a.block ?? "—",
      layoutLocation(a),
      mapLocation(a),
      a.type,
      a.deltaT != null ? a.deltaT.toFixed(2) : "—",
      coaLabel(a),
    ];
    const cellLines = cells.map((c, i) => doc.splitTextToSize(c, widths[i] - 2.4) as string[]);
    const rowH = Math.max(6, Math.max(...cellLines.map((l) => l.length)) * 3.6 + 2);
    if (y + rowH > H - 18) {
      addPageFn(doc, footerLabel);
      y = 25;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }
    let cx = 15;
    const rgb = coaRGB(a);
    cells.forEach((_, i) => {
      doc.rect(cx, y, widths[i], rowH, "S");
      if (i === cells.length - 1) doc.setTextColor(...rgb);
      else doc.setTextColor(30, 30, 30);
      doc.text(cellLines[i], cx + 1.2, y + 4);
      cx += widths[i];
    });
    y += rowH;
  });
  doc.setTextColor(30, 30, 30);
}

// ─── CSV export — the same faulty-module register as Table 6 ───────────────

export function generateThermographyCSV(
  meta: ReportMetadata,
  allAnomalies: readonly ReportAnomaly[],
) {
  const faulty = faultyModules(allAnomalies);
  const header = [
    "SL No",
    "Block",
    "Layout Location",
    "Map Location (Lat)",
    "Map Location (Lng)",
    "Defect Type",
    "Delta_T",
    "Severity",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  faulty.forEach((a, idx) => {
    lines.push(
      [
        String(idx + 1),
        esc(a.block ?? ""),
        esc(layoutLocation(a)),
        String(a.gps.lat),
        String(a.gps.lng),
        esc(a.type),
        a.deltaT != null ? a.deltaT.toFixed(2) : "",
        coaLabel(a),
      ].join(","),
    );
  });
  const filename = `UrjaScan_${meta.customerName.replace(/\s+/g, "_")}_Faulty_Modules.csv`;
  downloadTextFile(filename, lines.join("\n"));
}

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
import { clientDefectType, DEFECT_CATEGORIES, type Anomaly, type PlantSummary } from "./mock-data";
import { moduleMultiplier } from "./affected-modules";
import { registerLocation } from "./layout-labels";

/**
 * The fields the report actually reads — a structural subset satisfied by
 * both mock-data's Anomaly (the baked plant-001 survey) and api's AnomalyDTO
 * (an uploaded survey's rows from the DB), so the same generator serves both.
 */
export type ReportAnomaly = Pick<
  Anomaly,
  "panelId" | "type" | "deltaT" | "severity" | "string" | "inverter" | "gps" | "row" | "col"
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
  plant: { name: string; location: string; capacityMW: number; totalPanels: number; client?: string },
  inspectionDate: string,
): ReportMetadata {
  return {
    reportNo: `VYMANIK/${plant.name.replace(/\s+/g, "-").toUpperCase()}/DT/01`,
    // The client the plant belongs to (Add Plant's "Client" field), when it has
    // one — the plant's own name is the fallback, as before.
    customerName: plant.client && plant.client !== "—" ? plant.client : plant.name,
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

/**
 * The register's (rack, panel) position, for ordering Table 6 the way the
 * register itself is written.
 *
 * `row`/`col` carry it, but a caller assembling ReportAnomaly by hand can
 * leave them off, and a NaN comparator silently leaves the table in whatever
 * order it arrived in — which is how this was caught. panelId is built as
 * "R<rack>-P<panel>", so it answers the same question when they are absent.
 */
function registerOrder(a: ReportAnomaly): [number, number] {
  if (Number.isFinite(a.row) && Number.isFinite(a.col)) return [a.row, a.col];
  const m = /^R(\d+)-P(\d+)$/i.exec(a.panelId);
  return m ? [Number(m[1]), Number(m[2])] : [Number.MAX_SAFE_INTEGER, 0];
}

/** "Table-347" -> "347"; falls back to the raw string field for surveys that
 *  didn't use the Table- prefix convention. */
function tableNumber(a: ReportAnomaly): string {
  const m = /table-?(\d+)/i.exec(a.string);
  return m ? m[1] : a.string;
}

/**
 * The survey register's own wording for a defect's position, and the heading
 * its zone column carries.
 *
 * Delegated to lib/layout-labels.ts so the report and the Anomalies screens
 * cannot drift: a block/inverter survey reads "Block: 20, Inv: A, Table: 3,
 * Panel: R8-P12", and a survey with neither reads "Table: 6 | S: B | Mod:
 * A - 1" under a "Row" heading, which is exactly how the client's own Table 6
 * prints it.
 */
function layoutLocation(a: ReportAnomaly): string {
  return registerLocation(a).layout;
}

/**
 * What the zone column shows for one row. The client's report writes the
 * row-style value with its label ("Row: 1" — it is the register's own
 * Primary_Zone string); the block-style column has always carried the bare
 * number, and there is no newer reference saying otherwise, so it keeps it.
 */
function zoneCell(a: ReportAnomaly): string {
  const loc = registerLocation(a);
  if (loc.zone === "—") return "—";
  return loc.zoneLabel === "Row" ? `Row: ${loc.zone}` : loc.zone;
}

/**
 * The register's own name for a defect category.
 *
 * The app stores a short internal label ("Multi Cell"); the client's audit
 * report prints the full IEC wording ("Multi Cell Hotspot"). survey-import.ts
 * maps the long form to the short one on the way in — this is that mapping
 * read back out, so the report says what the client's own workbook says.
 */
const REGISTER_WORDING: Record<string, string> = {
  "Multi Cell": "Multi Cell Hotspot",
  "Single Cell": "Single Cell Hotspot",
  "Bypass Diode": "Diode Failure",
};

function registerDefectName(type: string): string {
  const client = clientDefectType(type);
  return REGISTER_WORDING[client] ?? client;
}

/** 6 decimals (~0.1 m) — the precision the client's own Table 6 prints, and
 *  far finer than the GPS behind it. */
function mapLocation(a: ReportAnomaly): string {
  return `${a.gps.lat.toFixed(6)}, ${a.gps.lng.toFixed(6)}`;
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

// Table 3 is just DEFECT_CATEGORIES (mock-data.ts — the single source of truth
// for the client's eight defect categories) reshaped for drawTable's
// [type, description, severityLevel] row format.
const DEFECT_CATEGORY_REFERENCE: { type: string; description: string; severityLevel: string }[] =
  DEFECT_CATEGORIES.map(c => ({
    type: c.name,
    description: c.description,
    severityLevel: c.defaultCoa,
  }));

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

// Keyed by the exact client-facing category name (see DEFECT_CATEGORIES in
// mock-data.ts) rather than a regex over the old, more varied internal `type`
// strings — every call site now passes a category name (typeRows is grouped
// by clientDefectType before recommendationFor ever sees it), so an exact
// lookup is both simpler and no longer relies on incidental substring
// matches (e.g. the old `/hotspot|cell/i` happening to also catch "Multi
// Cell" post-relabel).
const RECOMMENDATION_BY_CATEGORY: Record<string, { recommendation: string; responsibility: string }> = {
  "Single Cell": {
    recommendation:
      "Monitor the cell for progressive thermal degradation at future inspections; no immediate replacement required unless the temperature difference increases.",
    responsibility: "O&M",
  },
  "Multi Cell": {
    recommendation:
      "Schedule a field inspection to check for cracking, cell mismatch, or mechanical stress; clean the module and re-verify.",
    responsibility: "O&M / OEM",
  },
  "Bypass Diode": {
    recommendation:
      "Verify the bypass diode's condition (activated vs. shorted) and replace the diode or module as per OEM guidelines.",
    responsibility: "OEM",
  },
  "String Offline": {
    recommendation:
      "Inspect the combiner box, fuses, isolators, and MC4 connectors for the affected string; restore continuity.",
    responsibility: "O&M",
  },
  "Partial String Offline": {
    recommendation:
      "Trace the affected string for the break point — inspect MC4 connectors, interconnections and fuses along it; restore continuity.",
    responsibility: "O&M",
  },
  "Module Offline": {
    recommendation:
      "Check module interconnections and continuity within the string; repair or reconnect as needed.",
    responsibility: "O&M",
  },
  "Module Broken": {
    recommendation:
      "Isolate the module immediately (safety risk from shattered glass/burnt backsheet) and replace it.",
    responsibility: "O&M / OEM",
  },
  "Shadow": {
    recommendation:
      "Clear the shading source (vegetation/structure) or correct tracker alignment; clean the module if soiling is the cause.",
    responsibility: "O&M",
  },
  "Speckled": {
    recommendation:
      "Check string grounding and investigate PID mitigation (night-time reverse bias / PID-recovery box) as per OEM guidance.",
    responsibility: "OEM",
  },
};

function recommendationFor(category: string): { recommendation: string; responsibility: string } {
  return (
    RECOMMENDATION_BY_CATEGORY[category] ?? {
      recommendation:
        "Cross-check the finding on site with the thermal imaging equipment and determine root cause before scheduling rectification.",
      responsibility: "O&M",
    }
  );
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

/**
 * A hollow donut, matching the sample report's Figure 3. jsPDF has no arc
 * primitive, so each segment is a filled annular wedge: the outer arc forward
 * then the inner arc back, closed, drawn with doc.lines(). The count sits on
 * each slice (as in the sample), the category + percentage in the legend below.
 */
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
  const rInner = r * 0.55; // the hole — same proportion as the sample donut
  const rLabel = (r + rInner) / 2; // where the count sits, centred in the ring
  let angle = -90; // start at 12 o'clock

  for (const seg of segments) {
    if (seg.value === 0) continue;
    const sweep = (seg.value / total) * 360;
    const a0 = (angle * Math.PI) / 180;
    const a1 = ((angle + sweep) * Math.PI) / 180;
    const steps = Math.max(2, Math.ceil(sweep / 4));

    // Annular wedge: outer arc a0→a1, then inner arc a1→a0, as one closed ring.
    const ring: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (let i = steps; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / steps;
      ring.push([cx + rInner * Math.cos(a), cy + rInner * Math.sin(a)]);
    }

    const rel: [number, number][] = [];
    for (let i = 1; i < ring.length; i++) {
      rel.push([ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]]);
    }
    doc.setFillColor(...seg.color);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.7);
    doc.lines(rel, ring[0][0], ring[0][1], [1, 1], "FD", true);

    // Count on the slice, only when the slice is wide enough to hold it.
    if (sweep >= 18) {
      const mid = (a0 + a1) / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(String(seg.value), cx + rLabel * Math.cos(mid), cy + rLabel * Math.sin(mid) + 1, {
        align: "center",
      });
      doc.setFont("helvetica", "normal");
    }
    angle += sweep;
  }
  doc.setLineWidth(0.2);

  // Legend below the donut.
  let ly = cy + r + 12;
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

  // Grouped by the client-facing category (not the raw internal `type`) —
  // two internal types that read as the same category (e.g. "Diode Failure"
  // and "Bypassed Substring" both read "Bypass Diode") merge into one row/bar
  // rather than appearing twice under an identical label. See
  // clientDefectType's docblock in mock-data.ts.
  const typeCounts = countBy(faulty, (a) => clientDefectType(a.type));
  const typeRows = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

  // Modules affected, not just defects found: a String Offline puts a whole
  // string out (26 modules; Partial String Offline 13) — see
  // lib/affected-modules.ts. For a survey with neither type this equals the
  // defect count, and the table keeps the original two-column layout.
  const affectedByType = new Map(typeRows.map(([t, c]) => [t, c * moduleMultiplier(t)]));
  const affectedTotal = [...affectedByType.values()].reduce((sum, n) => sum + n, 0);
  const hasMultiplied = typeRows.some(([t]) => moduleMultiplier(t) > 1);

  const summaryIntro = `As per the defined scope, a total of ${totalTested.toLocaleString("en-IN")} Nos. of PV modules were tested for aerial thermography. Out of the total inspected modules, ${affectedTotal.toLocaleString("en-IN")} modules were found defective${hasMultiplied ? ` (${faulty.length.toLocaleString("en-IN")} defects; a String Offline is counted as the 26 modules on the string and a Partial String Offline as 13)` : ""}. Following is a summary of the test results.`;
  const introLines = doc.splitTextToSize(summaryIntro, W - 30) as string[];
  doc.text(introLines, 15, y);
  y += introLines.length * 4.5 + 6;

  if (hasMultiplied) {
    const pctOfPlant = (n: number) => (plant.totalPanels > 0 ? `${((n / plant.totalPanels) * 100).toFixed(2)}%` : "-");
    // Share of affected modules, not of defect rows — a String Offline is 26
    // modules, so the two differ and the client's table reports the former.
    const pctOfDefects = (n: number) => (affectedTotal > 0 ? `${((n / affectedTotal) * 100).toFixed(1)}%` : "-");
    // Listed by observation type, matching the client's own table order.
    const byName = [...typeRows].sort((a, b) =>
      registerDefectName(a[0]).localeCompare(registerDefectName(b[0])));
    y = drawTable(
      doc,
      ["Observation Type", "No. of Defects", "Multiplier Formula", "Affected Modules", "% of Defects", "% of Plant Panels"],
      [42, 24, 34, 28, 24, 28],
      [
        ...byName.map(([t, c]) => {
          const m = moduleMultiplier(t);
          const aff = affectedByType.get(t) ?? c;
          return [registerDefectName(t), String(c), m > 1 ? `${c} x ${m} = ${aff}` : String(c),
                  String(aff), pctOfDefects(aff), pctOfPlant(aff)];
        }),
        ["Cumulative Defective Modules", String(faulty.length), "-", String(affectedTotal),
         pctOfDefects(affectedTotal), pctOfPlant(affectedTotal)],
        ["Total Plant Scope", `${faulty.length} Defects`,
         `Plant Scope: ${plant.totalPanels.toLocaleString("en-IN")} Modules`,
         `${affectedTotal} / ${plant.totalPanels.toLocaleString("en-IN")}`, "-",
         `${pctOfPlant(affectedTotal)} Defect Impact`],
      ],
      y,
      15,
    );
  } else {
    y = drawTable(
      doc,
      ["Defect Type", "Total No. of Defected Modules"],
      [130, 55],
      [
        ...typeRows.map(([t, c]) => [t, String(c)]),
        ["Cumulative Total", String(faulty.length)],
      ],
      y,
      15,
    );
  }

  // ── Figures 1-3 ──
  // Figure 1 (defect-wise): every defect category. Bars stay readable up to
  // ~12; beyond that the tail folds into one "Other" bar so no defect is
  // dropped from the total the chart represents.
  const MAX_TYPE_BARS = 12;
  const namedRows: [string, number][] = [...typeRows]
    .map(([t, c]) => [registerDefectName(t), c] as [string, number])
    .sort((a, b) => a[0].localeCompare(b[0]));
  let figure1Rows = namedRows;
  if (namedRows.length > MAX_TYPE_BARS) {
    const head = namedRows.slice(0, MAX_TYPE_BARS - 1);
    const tail = namedRows.slice(MAX_TYPE_BARS - 1);
    const otherCount = tail.reduce((sum, [, c]) => sum + c, 0);
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

  // Figure 2 (zone-wise). A survey with no block hierarchy has no meaningful
  // zone breakdown to chart — its "zones" are individual rack rows, dozens of
  // them — and the client's own report for such a survey omits this figure,
  // numbering straight from Figure 1 to Figure 3. Omitted here on the same
  // rule rather than printed under a heading the site does not have.
  const zoneWord = registerLocation(faulty[0] ?? { inverter: "", string: "", panelId: "" });
  if (zoneWord.zoneLabel === "Block") {
    const blockCounts = countBy(faulty, (a) => a.block ?? "Unassigned");
    const blockRows = [...blockCounts.entries()].sort(
      (a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]),
    );
    barChart(doc, "Figure 2 — Block-wise Defect Summary", blockRows, 15, y, W - 30, 55, NAVY);
  }

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
  // Column order, headings and row order all follow the client's own Table 6.
  // The zone heading is the register's word for it — "Row" for a survey with
  // no blocks, which is what this table used to mislabel as "Block".
  const t6Zone = registerLocation(faulty[0] ?? { inverter: "", string: "", panelId: "" });
  const t6Headers = [
    "SI No",
    "Defect Type",
    t6Zone.zoneLabel,
    "Layout Location",
    "Map Location (Google Maps)",
    "T (°C)",
    "Severity",
  ];
  const t6Widths = [11, 33, 17, 50, 41, 13, 15];
  // The register's own order, established by diffing against the client's own
  // Table 6 until all 186 rows matched: zone, then table, then rack, then
  // panel. None of the three leading keys can be dropped — the rack number is
  // not monotonic across the file (rack 9 in row 10 precedes rack 8 in row
  // 11), and inside one zone+table the modules are not in numeric order
  // either (row 9 table 2 runs A-17 then A-15, by rack).
  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const t6Rows = [...faulty].sort((a, b) => {
    const [ar, ac] = registerOrder(a);
    const [br, bc] = registerOrder(b);
    return (
      num(a.block) - num(b.block) ||
      num(tableNumber(a)) - num(tableNumber(b)) ||
      (ar - br) ||
      (ac - bc)
    );
  });
  drawFaultyModuleTable(doc, t6Headers, t6Widths, t6Rows, label, newPage);

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
  for (const [type] of typeRows) {
    const count = affectedByType.get(type) ?? 0;
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
      registerDefectName(a.type),
      zoneCell(a),
      layoutLocation(a),
      mapLocation(a),
      a.deltaT != null ? String(a.deltaT) : "—",
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
  // Same columns and wording as Table 6, so the CSV and the PDF cannot be read
  // as two different registers.
  const zone = registerLocation(faulty[0] ?? { inverter: "", string: "", panelId: "" });
  const header = [
    "SI No",
    "Defect Type",
    zone.zoneLabel,
    "Layout Location",
    "Map Location (Lat)",
    "Map Location (Lng)",
    "T (degC)",
    "Severity",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  faulty.forEach((a, idx) => {
    lines.push(
      [
        String(idx + 1),
        esc(registerDefectName(a.type)),
        esc(zoneCell(a)),
        esc(layoutLocation(a)),
        String(a.gps.lat),
        String(a.gps.lng),
        a.deltaT != null ? String(a.deltaT) : "",
        coaLabel(a),
      ].join(","),
    );
  });
  const filename = `UrjaScan_${meta.customerName.replace(/\s+/g, "_")}_Faulty_Modules.csv`;
  downloadTextFile(filename, lines.join("\n"));
}

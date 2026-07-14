/**
 * Section 4 CSV import/export — row-level validation with partial success,
 * matching the templates in public/templates/*.csv.
 */
import { DEFECT_TYPES, CATEGORY_CODES } from "./taxonomy";

/** Minimal RFC4180-ish CSV parser: handles quoted fields and escaped quotes ("") */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ""));
}

export interface ParsedAnomalyRow {
  moduleId: string;
  plantId: string;
  severity?: string;
  categoryCode: string;
  defectType: string;
  gpsLat: number;
  gpsLng: number;
  photoFilename?: string;
  dateDetected?: string;
}

export interface RowError {
  row: number; // 1-indexed, matches the CSV file including header
  message: string;
}

const ANOMALY_HEADER = ["module_id", "plant_id", "severity", "category_code", "defect_type", "gps_lat", "gps_lng", "photo_filename", "date_detected"];
const SEVERITY_ALIASES: Record<string, string> = {
  low: "normal", medium: "medium", high: "critical",
  normal: "normal", critical: "critical", nodata: "nodata",
};

export function validateAnomalyCSV(text: string): { valid: ParsedAnomalyRow[]; errors: RowError[] } {
  const rows = parseCSV(text);
  const valid: ParsedAnomalyRow[] = [];
  const errors: RowError[] = [];
  if (rows.length === 0) return { valid, errors: [{ row: 1, message: "File is empty" }] };

  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (col: string) => header.indexOf(col);
  const missingCols = ANOMALY_HEADER.filter(c => idx(c) === -1 && c !== "severity" && c !== "photo_filename" && c !== "date_detected");
  if (missingCols.length > 0) {
    return { valid, errors: [{ row: 1, message: `Missing required column(s): ${missingCols.join(", ")}. Download the template to see the expected format.` }] };
  }

  const validCategoryCodes = new Set<string>(CATEGORY_CODES.map(c => c.code));
  const validDefectTypes = new Set<string>(DEFECT_TYPES as readonly string[]);

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (col: string) => (idx(col) >= 0 ? (cells[idx(col)] ?? "").trim() : "");
    const rowNum = r + 1; // +1 to account for header being row 1

    const moduleId = get("module_id");
    const plantId = get("plant_id");
    const categoryCode = get("category_code");
    const defectType = get("defect_type");
    const gpsLatStr = get("gps_lat");
    const gpsLngStr = get("gps_lng");

    const rowErrs: string[] = [];
    if (!moduleId) rowErrs.push("missing module_id");
    if (!plantId) rowErrs.push("missing plant_id");
    if (!gpsLatStr || !gpsLngStr || isNaN(Number(gpsLatStr)) || isNaN(Number(gpsLngStr))) rowErrs.push("missing/malformed lat/lng");
    if (!categoryCode) rowErrs.push("missing category_code");
    else if (!validCategoryCodes.has(categoryCode)) rowErrs.push(`category_code "${categoryCode}" is not in the controlled vocabulary`);
    if (!defectType) rowErrs.push("missing defect_type");
    else if (!validDefectTypes.has(defectType)) rowErrs.push(`defect_type "${defectType}" is not in the controlled vocabulary`);

    if (rowErrs.length > 0) {
      errors.push({ row: rowNum, message: `Row ${rowNum}: ${rowErrs.join(", ")}` });
      continue;
    }

    const rawSeverity = get("severity").toLowerCase();
    valid.push({
      moduleId,
      plantId,
      severity: rawSeverity ? SEVERITY_ALIASES[rawSeverity] : undefined,
      categoryCode,
      defectType,
      gpsLat: Number(gpsLatStr),
      gpsLng: Number(gpsLngStr),
      photoFilename: get("photo_filename") || undefined,
      dateDetected: get("date_detected") || undefined,
    });
  }

  return { valid, errors };
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function errorReportCSV(errors: RowError[]): string {
  const lines = ["row,error", ...errors.map(e => `${e.row},"${e.message.replace(/"/g, '""')}"`)];
  return lines.join("\n");
}

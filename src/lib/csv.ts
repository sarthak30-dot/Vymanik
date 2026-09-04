/**
 * CSV ingestion for the bulk defect-import wizard (components/CsvImportWizard.tsx).
 *
 * Three layers, in the order a file actually passes through them:
 *   parseCSV        — text -> string[][], format-agnostic
 *   autoMapHeader    — string[][] header row -> best-guess column mapping
 *   validateMappedRows — mapping + rows -> typed rows, each flagged with
 *                        every problem it has rather than the first one
 *
 * WHY AUTO-MAPPING EXISTS AT ALL
 * -------------------------------
 * The importer this replaces required an exact header —
 * "module_id,plant_id,severity,category_code,defect_type,gps_lat,gps_lng,…" —
 * so a field team's CSV with human column names ("Module ID", "Latitude")
 * failed outright with a wall of "missing required column" before a single
 * row was even looked at. Auto-mapping guesses from an alias table and lets
 * the operator confirm or correct it in the wizard's mapping step, so the
 * file's own header wording stops being the thing that decides whether an
 * import is possible.
 */
import { DEFECT_TYPES, CATEGORY_CODES } from "./taxonomy";
import { checkBoundary, looksSwapped } from "./plant-boundary";

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
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8;",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Column auto-mapping ────────────────────────────────────────────────────

export type TargetField =
  | "moduleId"
  | "latitude"
  | "longitude"
  | "defectType"
  | "categoryCode"
  | "severity"
  | "thermalImageUrl"
  | "dateDetected";

export interface TargetFieldSpec {
  field: TargetField;
  label: string;
  required: boolean;
  /** Human-readable alias forms; compared case/space/underscore-insensitively,
   *  never hand-normalized here so a typo in this list fails loudly instead
   *  of just silently never matching. */
  aliases: readonly string[];
}

export const TARGET_FIELDS: readonly TargetFieldSpec[] = [
  {
    field: "moduleId",
    label: "Module ID",
    required: true,
    aliases: [
      "module id",
      "module_id",
      "panel id",
      "panel_id",
      "module",
      "panel",
      "panel no",
      "module no",
    ],
  },
  {
    field: "latitude",
    label: "Latitude",
    required: true,
    aliases: ["latitude", "lat", "gps_lat", "gps lat", "y"],
  },
  {
    field: "longitude",
    label: "Longitude",
    required: true,
    aliases: ["longitude", "lng", "lon", "long", "gps_lng", "gps lng", "gps_long", "x"],
  },
  {
    field: "defectType",
    label: "Defect Type",
    required: true,
    aliases: ["defect type", "defect_type", "type", "anomaly type", "anomaly_type", "defect"],
  },
  {
    field: "categoryCode",
    label: "Category Code",
    required: false,
    aliases: ["category code", "category_code", "category", "coa", "coa code"],
  },
  { field: "severity", label: "Severity", required: false, aliases: ["severity", "priority"] },
  {
    field: "thermalImageUrl",
    label: "Thermal Image URL",
    required: false,
    aliases: [
      "thermal image url",
      "thermal_image_url",
      "image url",
      "image_url",
      "photo url",
      "thermal image",
      "photo filename",
      "photo_filename",
      "photo",
      "image",
    ],
  },
  {
    field: "dateDetected",
    label: "Date Detected",
    required: false,
    aliases: ["date detected", "date_detected", "date", "detected on", "inspection date"],
  },
];

function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Column index for each target field, or null where nothing in `header`
 *  matched any alias — left for the operator to fill in by hand. */
export type ColumnMapping = Record<TargetField, number | null>;

export function autoMapHeader(header: readonly string[]): ColumnMapping {
  const normalized = header.map(normalizeHeader);
  const mapping = {} as ColumnMapping;
  for (const spec of TARGET_FIELDS) {
    const aliasSet = new Set(spec.aliases.map(normalizeHeader));
    const idx = normalized.findIndex((h) => aliasSet.has(h));
    mapping[spec.field] = idx >= 0 ? idx : null;
  }
  return mapping;
}

// ─── Row validation against a mapping ───────────────────────────────────────

export type IssueKind =
  | "missing"
  | "malformed_coords"
  | "swapped_coords"
  | "out_of_boundary"
  | "bad_vocabulary"
  | "malformed_link";

export interface RowIssue {
  field: TargetField | null;
  kind: IssueKind;
  message: string;
  /** Issues that stop the row from importing. A malformed thermal-image link
   *  or a missing optional field are surfaced but do not block — the defect
   *  itself is still real and worth having on record without its photo. */
  blocking: boolean;
}

export interface MappedRow {
  /** 1-indexed against the file including its header, so this lines up with
   *  what a spreadsheet program shows the operator for the same row. */
  rowNum: number;
  moduleId: string;
  latitude: number | null;
  longitude: number | null;
  defectType: string;
  categoryCode: string | null;
  severity: "critical" | "medium" | "normal" | "nodata" | null;
  thermalImageUrl: string | null;
  dateDetected: string | null;
  issues: RowIssue[];
  boundaryDistanceM: number | null;
}

export function rowIsValid(row: MappedRow): boolean {
  return !row.issues.some((i) => i.blocking);
}

const SEVERITY_ALIASES: Record<string, MappedRow["severity"]> = {
  low: "normal",
  medium: "medium",
  high: "critical",
  normal: "normal",
  critical: "critical",
  nodata: "nodata",
};

const SEVERITY_LABEL_INPUT = new Set(Object.keys(SEVERITY_ALIASES));

function looksLikeLink(v: string): boolean {
  // Deliberately permissive: an http(s) URL, or a bare filename with an
  // image extension (the convention lib/defect-image.ts already reads for
  // the 1,249 rows imported from the March 2026 survey). Anything else —
  // a stray word, a half-pasted path — is what this flags.
  return (
    /^https?:\/\/\S+\.(jpe?g|png|webp|gif)(\?\S*)?$/i.test(v) ||
    /^[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(v)
  );
}

export function validateMappedRows(rows: readonly string[][], mapping: ColumnMapping): MappedRow[] {
  const validCategoryCodes = new Set<string>(CATEGORY_CODES.map((c) => c.code));
  const validDefectTypes = new Set<string>(DEFECT_TYPES as readonly string[]);
  const get = (cells: string[], field: TargetField): string => {
    const idx = mapping[field];
    return idx != null ? (cells[idx] ?? "").trim() : "";
  };

  return rows.map((cells, i): MappedRow => {
    const issues: RowIssue[] = [];
    const push = (field: TargetField | null, kind: IssueKind, message: string, blocking = true) =>
      issues.push({ field, kind, message, blocking });

    const moduleId = get(cells, "moduleId");
    if (!moduleId) push("moduleId", "missing", "Module ID is missing");

    const latStr = get(cells, "latitude");
    const lngStr = get(cells, "longitude");
    let latitude: number | null = null;
    let longitude: number | null = null;
    let boundaryDistanceM: number | null = null;

    if (!latStr || !lngStr) {
      push("latitude", "missing", "Latitude/longitude is missing");
    } else {
      const lat = Number(latStr),
        lng = Number(lngStr);
      if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        push(
          "latitude",
          "malformed_coords",
          `"${latStr}, ${lngStr}" is not a valid coordinate pair`,
        );
      } else if (looksSwapped(lat, lng)) {
        push(
          "latitude",
          "swapped_coords",
          `Latitude and longitude look swapped — did you mean ${lng.toFixed(5)}, ${lat.toFixed(5)}?`,
        );
      } else {
        latitude = lat;
        longitude = lng;
        const boundary = checkBoundary(lat, lng);
        boundaryDistanceM = boundary.distanceOutsideM;
        if (!boundary.withinBoundary) {
          push(
            "latitude",
            "out_of_boundary",
            `${boundary.distanceOutsideM} m outside the surveyed site boundary`,
          );
        }
      }
    }

    const defectType = get(cells, "defectType");
    if (!defectType) push("defectType", "missing", "Defect Type is missing");
    else if (!validDefectTypes.has(defectType)) {
      push("defectType", "bad_vocabulary", `"${defectType}" is not in the defect-type vocabulary`);
    }

    const categoryCode = get(cells, "categoryCode") || null;
    if (categoryCode && !validCategoryCodes.has(categoryCode)) {
      push(
        "categoryCode",
        "bad_vocabulary",
        `"${categoryCode}" is not a recognised category code`,
        false,
      );
    }

    const rawSeverity = get(cells, "severity").toLowerCase();
    const severity =
      rawSeverity && SEVERITY_LABEL_INPUT.has(rawSeverity) ? SEVERITY_ALIASES[rawSeverity] : null;
    if (rawSeverity && !severity) {
      push(
        "severity",
        "bad_vocabulary",
        `Severity "${rawSeverity}" not recognised — will be derived from ΔT instead`,
        false,
      );
    }

    const thermalImageUrl = get(cells, "thermalImageUrl") || null;
    if (thermalImageUrl && !looksLikeLink(thermalImageUrl)) {
      push(
        "thermalImageUrl",
        "malformed_link",
        `"${thermalImageUrl}" doesn't look like an image URL or filename`,
        false,
      );
    }

    return {
      rowNum: i + 2, // +1 for 0-index, +1 for the header row
      moduleId,
      latitude,
      longitude,
      defectType,
      categoryCode,
      severity,
      thermalImageUrl,
      dateDetected: get(cells, "dateDetected") || null,
      issues,
      boundaryDistanceM,
    };
  });
}

export function errorReportCSV(rows: readonly MappedRow[]): string {
  const lines = ["row,module_id,issue"];
  for (const row of rows) {
    for (const issue of row.issues) {
      lines.push(
        `${row.rowNum},"${row.moduleId.replace(/"/g, '""')}","${issue.message.replace(/"/g, '""')}"`,
      );
    }
  }
  return lines.join("\n");
}

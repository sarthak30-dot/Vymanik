/**
 * Browser ports of the two scripts that used to turn an inspection
 * deliverable into app data by hand:
 *
 *   scripts/import_defect_kml.py      -> parseDefectFile()
 *   scripts/flatten_superoverlay.py   -> compositeOrthoKmz()
 *
 * Control Center's "Upload Survey" runs these in the admin's browser and
 * sends only the results to /api/survey, so a new survey can be loaded
 * without a developer, a Python environment, or a redeploy. Keep the defect
 * code table and the compositing rules in step with the scripts: they are
 * the reference implementations and their docblocks explain every choice
 * mirrored here.
 */

import { parseCSV } from "./csv";
import { clientDefectType, DEFECT_CATEGORY_NAMES } from "./mock-data";

// ─── Minimal ZIP reader (a KMZ is a zip) ─────────────────────────────────────
// Native DecompressionStream("deflate-raw") instead of a zip library — no new
// dependency (the repo carries both package-lock.json and bun.lock, and a
// dependency added through one leaves the other stale). Handles the two
// methods KMZ writers use: stored (0) and deflate (8). No ZIP64: a KMZ over
// 4 GB is not a thing a browser tab should be opening anyway.

export interface ZipEntry {
  name: string;
  read(): Promise<Uint8Array<ArrayBuffer>>;
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(file: Blob): Promise<Map<string, ZipEntry>> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End-of-central-directory record: scan back over a possible comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip/KMZ file (no central directory found).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue; // directory
    const localNameLen = dv.getUint16(localOffset + 26, true);
    const localExtraLen = dv.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compSize);
    entries.set(normPath(name), {
      name,
      read: async () => {
        if (method === 0) return raw;
        if (method === 8) return inflateRaw(raw);
        throw new Error(`Unsupported zip compression method ${method} in ${name}.`);
      },
    });
  }
  return entries;
}

/** Resolve "a/b/../c/./d" -> "a/c/d"; zip paths always use "/". */
function normPath(path: string): string {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The KML file isn't valid XML.");
  }
  return doc;
}

/** Direct-or-nested child text by local name, e.g. text(el, "LatLonBox", "west"). */
function childText(el: Element, ...names: string[]): string | null {
  let cur: Element | undefined = el;
  for (const name of names) {
    cur = Array.from(cur.children).find((c) => c.localName === name);
    if (!cur) return null;
  }
  return cur.textContent?.trim() ?? null;
}

// ─── Defect KML -> survey rows (port of import_defect_kml.py) ────────────────

/** code -> (display type, severity). Must match CODE_MAP in
 *  scripts/import_defect_kml.py, confirmed with the client on 2026-09-03. */
export const DEFECT_CODE_MAP: Record<string, [string, "critical" | "medium" | "normal"]> = {
  MM: ["Multi-Module Hotspot", "critical"],
  BD: ["Diode Failure", "critical"],
  SP: ["Module Open Circuit", "critical"],
  MB: ["Bypassed Substring", "critical"],
  MC: ["Multi-Cell Hotspot", "medium"],
  SC: ["Cell Hotspot", "medium"],
  SO: ["Soiling", "normal"],
  SH: ["Shading", "normal"],
};

const SEV_RANK = { critical: 0, medium: 1, normal: 2 } as const;

/** One defect, in the shape POST /api/survey (action "import-defects") stores. */
export interface SurveyRow {
  panelId: string;
  row: number;
  col: number;
  type: string;
  severity: "critical" | "medium" | "normal";
  string: string;
  inverter: string;
  rgbNote: string;
  gps: { lat: number; lng: number };
  block?: string;
  smb?: string;
  stringSide?: string;
  module?: string;
  defectCode?: string;
  footprint?: [number, number][];
  /** Measured ΔT in °C — only present when the survey ships it (the Master CSV does). */
  deltaT?: number;
}

/** One KML placemark, read raw: its attribute fields and surveyed outline. */
export interface RawPlacemark {
  data: Record<string, string>;
  lat: number;
  lng: number;
  footprint?: [number, number][];
}

export interface ParsedDefects {
  rows: SurveyRow[];
  bySeverity: Record<"critical" | "medium" | "normal", number>;
  byType: [string, number][];
  blocks: string[];
  /** Codes not in DEFECT_CODE_MAP — imported as "Other"/medium, as the script does. */
  unknownCodes: string[];
  /** Placemarks skipped because they had no data or no geometry. */
  skipped: number;
  /** Every placemark that had usable geometry, raw — what mergeSurvey joins a Master CSV onto. */
  placemarks: RawPlacemark[];
  /**
   * True when the file is outlines only: no Rack/Label fields, so it carries
   * no severity, ΔT or image reference. `rows` is then NOT safe to upload —
   * its defect types and severities are guesses from a code table that means
   * different things in different deliverables (SO is "Soiling" in the
   * Block 20 file, "String Offline" in Hamirpur's). The Master CSV must be
   * merged in first.
   */
  needsCsv: boolean;
}

/** 7 decimals ≈ 1 cm — the script's num(); the source's 13 are noise. */
const round7 = (x: number) => Math.round(x * 1e7) / 1e7;

/** Every name/value pair on a placemark: <SimpleData name> (what the vendor
 *  ships) and <Data name><value> (the other ExtendedData form, so another
 *  exporter's file isn't silently read as empty). */
function placemarkData(pm: Element): Record<string, string> {
  const data: Record<string, string> = {};
  for (const sd of Array.from(pm.getElementsByTagName("SimpleData"))) {
    const name = sd.getAttribute("name");
    if (name) data[name] = (sd.textContent ?? "").trim();
  }
  for (const d of Array.from(pm.getElementsByTagName("Data"))) {
    const name = d.getAttribute("name");
    const value = childText(d, "value");
    if (name && value != null && !(name in data)) data[name] = value;
  }
  return data;
}

function parseCoords(text: string): [number, number][] {
  return text
    .trim()
    .split(/\s+/)
    .map((tok) => tok.split(",").slice(0, 2).map(Number) as [number, number])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

/**
 * A placemark's position and outline. The vendor's file draws each panel as a
 * <Polygon>/<LinearRing>; the Hamirpur export draws the same closed outline as
 * a <MultiGeometry><LineString>. Both read as a ring here. A point-only
 * placemark gets a position and no outline.
 */
function placemarkGeometry(
  pm: Element,
): { lat: number; lng: number; footprint?: [number, number][] } | null {
  const ringEl = pm.getElementsByTagName("LinearRing")[0] ?? pm.getElementsByTagName("LineString")[0];
  const ringText = ringEl ? childText(ringEl, "coordinates") : null;
  const pointEl = pm.getElementsByTagName("Point")[0];
  const pointText = pointEl ? childText(pointEl, "coordinates") : null;
  if (!ringText && !pointText) return null;

  if (ringText) {
    const pts = parseCoords(ringText);
    if (pts.length < 4) return null;
    // Closed ring: drop the repeated closing vertex before averaging, or
    // the shared corner is weighted twice and the centroid drifts to it.
    const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const uniq = closed ? pts.slice(0, -1) : pts;
    return {
      lng: uniq.reduce((s, p) => s + p[0], 0) / uniq.length,
      lat: uniq.reduce((s, p) => s + p[1], 0) / uniq.length,
      footprint: pts.map(([x, y]) => [round7(x), round7(y)] as [number, number]),
    };
  }
  // A point-only placemark — the script skips these; accepting them means
  // a survey exported without panel outlines still loads (as dots).
  const pt = parseCoords(pointText!)[0];
  return pt ? { lng: pt[0], lat: pt[1] } : null;
}

function summarise(rows: SurveyRow[]) {
  const bySeverity = { critical: 0, medium: 0, normal: 0 };
  const types = new Map<string, number>();
  const blocks = new Set<string>();
  for (const r of rows) {
    bySeverity[r.severity]++;
    types.set(r.type, (types.get(r.type) ?? 0) + 1);
    if (r.block) blocks.add(r.block);
  }
  return {
    bySeverity,
    byType: [...types.entries()].sort((a, b) => b[1] - a[1]),
    blocks: [...blocks].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)),
  };
}

function sortRows<T extends SurveyRow & { _rack: number; _panel: number }>(out: T[]): SurveyRow[] {
  // Same order the script emits: severity, then type, then rack/panel.
  out.sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
      a._rack - b._rack ||
      a._panel - b._panel,
  );
  return out.map(({ _rack: _r, _panel: _p, ...r }) => r);
}

export function parseDefectKml(kmlText: string): ParsedDefects {
  const doc = parseXml(kmlText);
  const out: (SurveyRow & { _rack: number; _panel: number })[] = [];
  const placemarks: RawPlacemark[] = [];
  const unknown = new Set<string>();
  let skipped = 0;
  let sawRackOrLabel = false;

  for (const pm of Array.from(doc.getElementsByTagName("Placemark"))) {
    const data = placemarkData(pm);
    const geom = Object.keys(data).length === 0 ? null : placemarkGeometry(pm);
    if (!geom) {
      skipped++;
      continue;
    }
    const { lat, lng, footprint } = geom;
    placemarks.push({ data, lat, lng, footprint });
    if (data.Rack != null || data.Label != null) sawRackOrLabel = true;

    const code = (data.id ?? "").toUpperCase();
    const mapped = DEFECT_CODE_MAP[code];
    if (!mapped) unknown.add(code || "(blank)");
    const [type, severity] = mapped ?? ["Other", "medium"];
    const rack = data.Rack ?? "";
    const panel = data.Panel ?? "";
    // `block` arrives zero-padded and inconsistently ("06", "6", "122");
    // normalising means two spellings of one block don't read as two.
    const blockRaw = data.block ?? "";
    const block = /^\d+$/.test(blockRaw) ? String(parseInt(blockRaw, 10)) : blockRaw;

    out.push({
      panelId: `R${rack}-P${panel}`,
      row: Number(rack) || 0,
      col: Number(panel) || 0,
      type,
      severity,
      string: `Table-${data.table ?? ""}`,
      inverter: `INV-${data.inv ?? ""}`,
      rgbNote: `Image: ${data.Label ?? ""}`,
      gps: { lat: round7(lat), lng: round7(lng) },
      block: block || undefined,
      smb: data.smb || undefined,
      stringSide: data.str || undefined,
      module: data.Module || undefined,
      defectCode: code || undefined,
      footprint,
      _rack: parseInt(rack, 10) || 0,
      _panel: parseInt(panel, 10) || 0,
    });
  }

  const rows = sortRows(out);
  return {
    rows,
    ...summarise(rows),
    unknownCodes: [...unknown].sort(),
    skipped,
    placemarks,
    needsCsv: placemarks.length > 0 && !sawRackOrLabel,
  };
}

/** A .kml, or a .kmz holding one — the vendor ships either. */
export async function parseDefectFile(file: File): Promise<ParsedDefects> {
  if (/\.kmz$/i.test(file.name)) {
    const zip = await readZip(file);
    const kmlName = [...zip.keys()]
      .filter((n) => /\.kml$/i.test(n))
      .sort((a, b) => a.split("/").length - b.split("/").length)[0];
    if (!kmlName) throw new Error("That KMZ has no .kml file inside it.");
    return parseDefectKml(new TextDecoder().decode(await zip.get(kmlName)!.read()));
  }
  return parseDefectKml(await file.text());
}

// ─── Master CSV (the analyst-reviewed register) merged onto the KMZ outlines ──
//
// The Hamirpur deliverable splits the survey across two files. The defect KMZ
// is geometry only (Module/R/T/S/id per panel outline); the Master CSV is the
// reviewed register — defect description, COA severity, ΔT, source frame.
// Neither alone is a survey, so the upload joins them. The join key is the
// five fields the two files share, which is unique in both and matched all 186
// rows to a centroid-identical coordinate in the Hamirpur files.

export interface MasterCsvRow {
  rack: string;
  panel: string;
  module: string;
  r: string;
  t: string;
  s: string;
  id: string;
  label: string;
  lat: number;
  lng: number;
  description: string;
  deltaT: number | null;
  severity: string;
}

export interface MasterCsv {
  rows: MasterCsvRow[];
  /** Required columns the file doesn't have — nothing is importable if any are missing. */
  missingColumns: string[];
}

const MASTER_CSV_COLUMNS = [
  "Rack", "Panel", "Module", "R", "T", "S", "id", "Label",
  "xcoord", "ycoord", "Defect_Description", "Delta_T", "Severity",
] as const;

/** Parse the Master CSV. Header names are matched exactly (case-insensitive,
 *  trimmed) — it's a machine-produced file, not a free-form spreadsheet. */
export function parseMasterCsv(text: string): MasterCsv {
  const cells = parseCSV(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim() !== ""));
  const header = (cells[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const missingColumns = MASTER_CSV_COLUMNS.filter((c) => col(c) < 0);
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  const idx = Object.fromEntries(MASTER_CSV_COLUMNS.map((c) => [c, col(c)])) as Record<
    (typeof MASTER_CSV_COLUMNS)[number],
    number
  >;
  const rows: MasterCsvRow[] = [];
  for (const c of cells.slice(1)) {
    const get = (name: (typeof MASTER_CSV_COLUMNS)[number]) => (c[idx[name]] ?? "").trim();
    const lat = Number(get("ycoord"));
    const lng = Number(get("xcoord"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || get("ycoord") === "" || get("xcoord") === "") continue;
    const dt = get("Delta_T");
    rows.push({
      rack: get("Rack"),
      panel: get("Panel"),
      module: get("Module"),
      r: get("R"),
      t: get("T"),
      s: get("S"),
      id: get("id"),
      label: get("Label"),
      lat,
      lng,
      description: get("Defect_Description"),
      deltaT: dt !== "" && Number.isFinite(Number(dt)) ? Number(dt) : null,
      severity: get("Severity").toUpperCase(),
    });
  }
  return { rows, missingColumns: [] };
}

/** The class-of-abnormality the register carries -> this app's severity tier
 *  (the same mapping thermography-report.ts's coaLabel applies in reverse). */
const COA_TO_SEVERITY: Record<string, SurveyRow["severity"]> = {
  COA3: "critical",
  COA2: "medium",
  COA1: "normal",
};

/** The register's own wording -> the client category names the app stores
 *  (see DEFECT_CATEGORIES in mock-data.ts). Anything else is kept verbatim. */
const REGISTER_TYPE_NAMES: Record<string, string> = {
  "Single Cell Hotspot": "Single Cell",
  "Multi Cell Hotspot": "Multi Cell",
  "Diode Failure": "Bypass Diode",
};

export interface MergeStats {
  /** Register rows that found their outline in the KMZ. */
  matched: number;
  /** Register rows with no outline in the KMZ — imported as points. */
  csvOnly: number;
  /** KMZ outlines with no register row — dropped (no severity to give them). */
  kmlOnly: number;
  /** Severities in the CSV that aren't COA1/COA2/COA3. */
  badSeverities: string[];
  /** Defect types that aren't one of the client's categories — kept as written. */
  unknownTypes: string[];
}

export interface MergedSurvey extends ParsedDefects {
  merge: MergeStats;
  /** Reasons the merge can't be uploaded — empty when it's safe to. */
  errors: string[];
}

const joinKey = (module: string, r: string, t: string, s: string, id: string) =>
  [module, r, t, s, id.toUpperCase()].join("|");

export function mergeSurvey(kml: ParsedDefects, csv: MasterCsv): MergedSurvey {
  const empty: MergedSurvey = {
    rows: [], bySeverity: { critical: 0, medium: 0, normal: 0 }, byType: [], blocks: [],
    unknownCodes: [], skipped: kml.skipped, placemarks: kml.placemarks, needsCsv: false,
    merge: { matched: 0, csvOnly: 0, kmlOnly: 0, badSeverities: [], unknownTypes: [] }, errors: [],
  };
  if (csv.missingColumns.length > 0) {
    return { ...empty, errors: [`The CSV is missing these columns: ${csv.missingColumns.join(", ")}.`] };
  }
  if (csv.rows.length === 0) return { ...empty, errors: ["The CSV has no defect rows."] };

  // key -> outlines still unclaimed (a queue, so a repeated key can't claim one outline twice)
  const outlines = new Map<string, RawPlacemark[]>();
  for (const pm of kml.placemarks) {
    const d = pm.data;
    const key = joinKey(d.Module ?? "", d.R ?? "", d.T ?? "", d.S ?? "", d.id ?? "");
    (outlines.get(key) ?? outlines.set(key, []).get(key)!).push(pm);
  }

  const out: (SurveyRow & { _rack: number; _panel: number })[] = [];
  const badSeverities = new Set<string>();
  const unknownTypes = new Set<string>();
  let matched = 0;
  let csvOnly = 0;

  for (const r of csv.rows) {
    const pm = outlines.get(joinKey(r.module, r.r, r.t, r.s, r.id))?.shift();
    if (pm) matched++;
    else csvOnly++;

    const severity = COA_TO_SEVERITY[r.severity];
    if (!severity) badSeverities.add(r.severity || "(blank)");
    const type = REGISTER_TYPE_NAMES[r.description] ?? r.description;
    if (!DEFECT_CATEGORY_NAMES.includes(clientDefectType(type))) unknownTypes.add(r.description || "(blank)");

    out.push({
      panelId: `R${r.rack}-P${r.panel}`,
      row: Number(r.rack) || 0,
      col: Number(r.panel) || 0,
      type,
      severity: severity ?? "medium",
      string: `Table-${r.t}`,
      // The Hamirpur plant has no inverter/SMB hierarchy in its register.
      inverter: "—",
      rgbNote: `Image: ${r.label}`,
      // The register's coordinate is authoritative (it equals the outline's
      // centroid to the metre); the outline only supplies the footprint.
      gps: { lat: round7(r.lat), lng: round7(r.lng) },
      // Primary zone — the rack row ("Row: 17") the register groups by. It
      // fills the same slot as a block elsewhere, so the per-block graph and
      // the jump list work for this plant.
      block: r.r || undefined,
      stringSide: r.s || undefined,
      module: r.module || undefined,
      defectCode: r.id || undefined,
      footprint: pm?.footprint,
      deltaT: r.deltaT ?? undefined,
      _rack: parseInt(r.rack, 10) || 0,
      _panel: parseInt(r.panel, 10) || 0,
    });
  }
  const kmlOnly = [...outlines.values()].reduce((n, q) => n + q.length, 0);

  const errors: string[] = [];
  if (matched === 0) {
    errors.push(
      "None of the CSV rows match an outline in the KMZ (matched on Module, R, T, S and id) — are these two files from the same survey?",
    );
  }
  if (badSeverities.size > 0) {
    errors.push(`Unrecognised severity in the CSV: ${[...badSeverities].join(", ")} (expected COA1, COA2 or COA3).`);
  }

  const rows = sortRows(out);
  return {
    rows,
    ...summarise(rows),
    unknownCodes: [],
    skipped: kml.skipped,
    placemarks: kml.placemarks,
    needsCsv: false,
    merge: { matched, csvOnly, kmlOnly, badSeverities: [...badSeverities], unknownTypes: [...unknownTypes].sort() },
    errors,
  };
}

// ─── Orthomosaic KMZ -> one web overlay (port of flatten_superoverlay.py) ────

export interface Bounds {
  west: number;
  north: number;
  east: number;
  south: number;
}

export interface CompositeResult {
  blob: Blob;
  bounds: Bounds;
  width: number;
  height: number;
  tilesPainted: number;
}

type TileBox = [west: number, east: number, south: number, north: number];

/** Walk the doc.kml tree (GroundOverlays + NetworkLinks) — script's collect(). */
async function collectTiles(zip: Map<string, ZipEntry>): Promise<Map<string, TileBox>> {
  const tiles = new Map<string, TileBox>();
  const seen = new Set<string>();
  const decoder = new TextDecoder();

  async function visit(docPath: string) {
    docPath = normPath(docPath);
    const entry = zip.get(docPath);
    if (seen.has(docPath) || !entry) return;
    seen.add(docPath);
    const base = dirOf(docPath);
    const doc = parseXml(decoder.decode(await entry.read()));
    for (const go of Array.from(doc.getElementsByTagName("GroundOverlay"))) {
      const box = Array.from(go.children).find((c) => c.localName === "LatLonBox");
      const href = childText(go, "Icon", "href");
      if (!box || !href) continue;
      const v = (t: string) => Number(childText(box, t));
      const tile: TileBox = [v("west"), v("east"), v("south"), v("north")];
      if (tile.every(Number.isFinite)) tiles.set(normPath(`${base}/${href}`), tile);
    }
    for (const nl of Array.from(doc.getElementsByTagName("NetworkLink"))) {
      const href = childText(nl, "Link", "href") ?? childText(nl, "Url", "href");
      if (href && !/^[a-z]+:\/\//i.test(href)) await visit(`${base}/${href}`);
    }
  }

  // The superoverlay root is doc.kml; a plain GroundOverlay KMZ may name its
  // single KML anything — fall back to the shallowest one.
  const root = zip.has("doc.kml")
    ? "doc.kml"
    : [...zip.keys()]
        .filter((n) => /\.kml$/i.test(n))
        .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (!root) throw new Error("That KMZ has no .kml file inside it.");
  await visit(root);
  return tiles;
}

/**
 * Composite every tile of a superoverlay KMZ (or the one image of a plain
 * GroundOverlay KMZ) into a single georeferenced WebP. Corners are read from
 * the KMZ's own <LatLonBox> tags, never fitted — see the header of
 * src/lib/overlay-registration.ts for why that matters.
 *
 * Same two rules as the script: every pyramid level is painted, shallowest
 * first, so the deepest available tile wins without leaving holes where the
 * pyramid bottoms out early; and each tile is only rasterised over the slice
 * of canvas it covers (drawImage's source rect does what PIL's resize(box=)
 * did), so a level-0 tile spanning the whole site never blows up memory.
 */
export async function compositeOrthoKmz(
  file: File,
  opts: { width?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<CompositeResult> {
  const zip = await readZip(file);
  const tiles = await collectTiles(zip);
  if (tiles.size === 0) {
    throw new Error("No image overlays found — this doesn't look like an orthomosaic KMZ.");
  }

  const boxes = [...tiles.values()];
  const rootW = Math.max(...boxes.map(([w, e]) => e - w));
  const depth = ([w, e]: TileBox) => Math.round(Math.log2(rootW / (e - w)));
  // Script's default bbox: the union of the deepest level's tiles.
  const deepest = Math.max(...boxes.map(depth));
  const deep = boxes.filter((b) => depth(b) === deepest);
  const bounds: Bounds = {
    west: Math.min(...deep.map((b) => b[0])),
    south: Math.min(...deep.map((b) => b[2])),
    east: Math.max(...deep.map((b) => b[1])),
    north: Math.max(...deep.map((b) => b[3])),
  };

  // Square ground pixels: height follows from metres, not degrees.
  const mLng = 111_320 * Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180);
  const aspect = ((bounds.north - bounds.south) * 110_600) / ((bounds.east - bounds.west) * mLng);
  let outW = opts.width ?? 8192;
  // Stay inside browser canvas limits (16,384 px a side; ~64 MP keeps memory sane).
  while (outW * outW * aspect > 64e6 || outW * aspect > 16384) outW = Math.floor(outW * 0.85);
  const outH = Math.max(1, Math.round(outW * aspect));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser couldn't allocate a canvas that large.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const sx = outW / (bounds.east - bounds.west);
  const sy = outH / (bounds.north - bounds.south);

  const ordered = [...tiles.entries()].sort((a, b) => depth(a[1]) - depth(b[1]));
  let painted = 0;
  let done = 0;
  const BATCH = 8; // decode in parallel, paint in depth order
  for (let i = 0; i < ordered.length; i += BATCH) {
    const batch = ordered.slice(i, i + BATCH);
    const decoded = await Promise.all(
      batch.map(async ([path, box]) => {
        const [w, e, s, n] = box;
        const x0 = (w - bounds.west) * sx,
          x1 = (e - bounds.west) * sx;
        const y0 = (bounds.north - n) * sy,
          y1 = (bounds.north - s) * sy;
        const cx0 = Math.max(0, x0),
          cy0 = Math.max(0, y0);
        const cx1 = Math.min(outW, x1),
          cy1 = Math.min(outH, y1);
        const px0 = Math.round(cx0),
          py0 = Math.round(cy0);
        const pw = Math.round(cx1) - px0,
          ph = Math.round(cy1) - py0;
        if (pw < 1 || ph < 1) return null;
        const entry = zip.get(path);
        if (!entry) return null; // href to a tile the KMZ doesn't contain
        const bmp = await createImageBitmap(new Blob([await entry.read()]));
        return { bmp, x0, x1, y0, y1, cx0, cy0, cx1, cy1, px0, py0, pw, ph };
      }),
    );
    for (const t of decoded) {
      if (t) {
        const { bmp } = t;
        const srcX = ((t.cx0 - t.x0) / (t.x1 - t.x0)) * bmp.width;
        const srcY = ((t.cy0 - t.y0) / (t.y1 - t.y0)) * bmp.height;
        const srcW = ((t.cx1 - t.cx0) / (t.x1 - t.x0)) * bmp.width;
        const srcH = ((t.cy1 - t.cy0) / (t.y1 - t.y0)) * bmp.height;
        ctx.drawImage(bmp, srcX, srcY, srcW, srcH, t.px0, t.py0, t.pw, t.ph);
        bmp.close();
        painted++;
      }
      done++;
    }
    opts.onProgress?.(done, ordered.length);
  }

  // WebP at q0.8, as the script does (35 MB PNG vs ~4 MB WebP for the March
  // survey). Safari can't encode WebP and hands back PNG — still valid, larger.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.8),
  );
  if (!blob) throw new Error("The browser couldn't encode the composited orthomosaic.");
  return { blob, bounds, width: outW, height: outH, tilesPainted: painted };
}

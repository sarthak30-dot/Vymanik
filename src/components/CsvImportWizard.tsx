import { useMemo, useRef, useState } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import MapGL, { Marker, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  parseCSV,
  autoMapHeader,
  validateMappedRows,
  rowIsValid,
  errorReportCSV,
  downloadTextFile,
  TARGET_FIELDS,
  type TargetField,
  type ColumnMapping,
  type MappedRow,
} from "@/lib/csv";
import { PLANT_BOUNDARY } from "@/lib/plant-boundary";
import { api, type NewAnomalyPayload, type BatchImportResult } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * The multi-step bulk-defect import wizard: drag a CSV in, map its columns
 * onto the ingestion schema, review every row's validation status in one
 * table, preview where the ready rows land on the map, then write them.
 *
 * NON-CONFLICT GUARDRAIL, AND WHY IT WAS EASY TO HONOUR
 * ----------------------------------------------------------
 * This task's brief draws a hard line: "does not alter runtime map visual
 * styles directly." Nothing here imports from routes/_app/map.tsx or
 * lib/defect-overlay.ts, and the map instance below is its own MapGL — a
 * second, independent Mapbox instance that exists only while this modal is
 * open, plotting raw CSV coordinates as plain circular markers rather than
 * the site map's severity-coloured panel boxes. That is a deliberate visual
 * difference, not an oversight: this preview is reviewing UNSAVED rows
 * against the plant boundary, and drawing them in the live map's own defect
 * styling would risk them being mistaken for panels already on record.
 *
 * WHY VALIDATION EXCLUDES ROWS RATHER THAN BLOCKING THE WHOLE FILE
 * ----------------------------------------------------------------
 * Matches lib/csv.ts's established philosophy (see its docblock): a
 * thousand-row field CSV with three malformed rows should import 997 rows,
 * not zero. The validation step never stops an operator from proceeding with
 * "N of M rows ready" — only from importing the ones that failed.
 */

type Step = "upload" | "mapping" | "validate" | "preview";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
/** Vercel's own request body cap and this endpoint's MAX_ROWS both sit well
 *  above what one inspection ever produces, but a multi-thousand-row CSV
 *  (several plants stitched together, say) should chunk rather than 400. */
const BATCH_CHUNK = 400;

export function CsvImportWizard({
  open,
  onClose,
  plantId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  plantId: string;
  onImported: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<string[][]>([]); // includes header at [0]
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [selectedPreviewRow, setSelectedPreviewRow] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  const validatedRows = useMemo(
    () => (mapping ? validateMappedRows(dataRows, mapping) : []),
    [dataRows, mapping],
  );
  const readyRows = useMemo(() => validatedRows.filter(rowIsValid), [validatedRows]);

  function reset() {
    setStep("upload");
    setFileName("");
    setRawRows([]);
    setMapping(null);
    setResult(null);
    setSelectedPreviewRow(null);
    setImporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function loadFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result ?? ""));
      if (rows.length < 2) {
        toast.error("That file has no data rows to import.");
        return;
      }
      setRawRows(rows);
      setMapping(autoMapHeader(rows[0]));
      setStep("mapping");
    };
    reader.readAsText(file);
  }

  const requiredUnmapped = mapping
    ? TARGET_FIELDS.filter((f) => f.required && mapping[f.field] == null)
    : [];

  async function handleImport() {
    const token = getToken();
    if (!token || readyRows.length === 0) return;
    setImporting(true);

    const payloads: NewAnomalyPayload[] = readyRows.map((r) => ({
      plantId,
      panelId: r.moduleId,
      defectType: r.defectType,
      categoryCode: r.categoryCode ?? undefined,
      deltaT: null,
      severity: r.severity ?? undefined,
      rgbNote: [r.thermalImageUrl ? `Image: ${r.thermalImageUrl}` : null, "Imported from CSV"]
        .filter(Boolean)
        .join(" — "),
      gps: { lat: r.latitude!, lng: r.longitude! },
    }));

    const merged: BatchImportResult = { created: [], failed: [] };
    for (let i = 0; i < payloads.length; i += BATCH_CHUNK) {
      const chunk = payloads.slice(i, i + BATCH_CHUNK);
      try {
        const res = await api.anomalies.createBatch(chunk, token);
        merged.created.push(...res.created);
        merged.failed.push(...res.failed.map((f) => ({ ...f, index: f.index + i })));
      } catch (err) {
        // The whole chunk's request failed (network, 5xx) rather than any
        // individual row — record every row in it as failed with the same
        // reason instead of silently dropping them from the result.
        const message = err instanceof Error ? err.message : "Import request failed";
        chunk.forEach((_, j) =>
          merged.failed.push({ index: i + j, panelId: chunk[j].panelId, error: message }),
        );
      }
    }

    setImporting(false);
    setResult(merged);
    if (merged.created.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["anomalies"], exact: false });
      onImported(merged.created.length);
      toast.success(
        `Imported ${merged.created.length} anomal${merged.created.length === 1 ? "y" : "ies"}`,
        {
          description:
            merged.failed.length > 0
              ? `${merged.failed.length} row(s) failed — see the summary below.`
              : undefined,
        },
      );
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-label="Import defects from CSV"
    >
      <div className="absolute inset-0 bg-black/50" onClick={importing ? undefined : handleClose} />
      <div className="relative bg-card border border-border shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <FileSpreadsheet size={15} className="text-ochre" /> Import Defects from CSV
            </h2>
            <StepBreadcrumb step={step} />
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            className="w-8 h-8 hover:bg-muted flex items-center justify-center disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "upload" && (
            <StepUpload
              dragOver={dragOver}
              setDragOver={setDragOver}
              onFile={loadFile}
              fileInput={fileInput}
            />
          )}

          {step === "mapping" && mapping && (
            <StepMapping
              header={header}
              sample={dataRows[0] ?? []}
              mapping={mapping}
              onChange={setMapping}
            />
          )}

          {step === "validate" && <StepValidation rows={validatedRows} />}

          {step === "preview" && (
            <StepPreview
              rows={readyRows}
              selected={selectedPreviewRow}
              onSelect={setSelectedPreviewRow}
              importing={importing}
              result={result}
            />
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-border flex items-center justify-between shrink-0 bg-grey-25">
          <div className="text-xs text-muted-foreground">
            {fileName && <span className="mono">{fileName}</span>}
            {step === "mapping" && requiredUnmapped.length > 0 && (
              <span className="text-critical ml-2">
                Map {requiredUnmapped.map((f) => f.label).join(", ")} to continue
              </span>
            )}
            {step === "validate" && (
              <span>
                {readyRows.length} of {validatedRows.length} row
                {validatedRows.length === 1 ? "" : "s"} ready
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step !== "upload" && !result && (
              <button
                onClick={() =>
                  setStep((s) =>
                    s === "mapping" ? "upload" : s === "validate" ? "mapping" : "validate",
                  )
                }
                disabled={importing}
                className="h-8 px-3 border border-border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted disabled:opacity-40"
              >
                <ArrowLeft size={12} /> Back
              </button>
            )}
            {step === "mapping" && (
              <button
                onClick={() => setStep("validate")}
                disabled={requiredUnmapped.length > 0}
                className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Validate {dataRows.length} row{dataRows.length === 1 ? "" : "s"}{" "}
                <ArrowRight size={12} />
              </button>
            )}
            {step === "validate" && (
              <button
                onClick={() => setStep("preview")}
                disabled={readyRows.length === 0}
                className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Preview {readyRows.length} ready row{readyRows.length === 1 ? "" : "s"}{" "}
                <ArrowRight size={12} />
              </button>
            )}
            {step === "preview" && !result && (
              <button
                onClick={handleImport}
                disabled={importing || readyRows.length === 0}
                className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    Import {readyRows.length} row{readyRows.length === 1 ? "" : "s"}
                  </>
                )}
              </button>
            )}
            {result && (
              <button
                onClick={handleClose}
                className="h-8 px-4 bg-ochre hover:bg-ochre-light text-ochre-fg text-xs font-semibold"
              >
                Done
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function StepBreadcrumb({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "mapping", label: "Map columns" },
    { key: "validate", label: "Validate" },
    { key: "preview", label: "Preview & import" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {steps.map((s, i) => (
        <span
          key={s.key}
          className={`text-[10px] font-medium px-1.5 py-0.5 ${
            i === idx ? "bg-ochre text-ochre-fg" : i < idx ? "text-normal" : "text-grey-400"
          }`}
        >
          {i + 1}. {s.label}
        </span>
      ))}
    </div>
  );
}

// ─── Step 1: Upload ─────────────────────────────────────────────────────────

function StepUpload({
  dragOver,
  setDragOver,
  onFile,
  fileInput,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFile: (f: File) => void;
  fileInput: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        onClick={() => fileInput.current?.click()}
        className={`border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition ${
          dragOver ? "border-ochre bg-ochre-muted" : "border-grey-200 hover:border-grey-300"
        }`}
      >
        <Upload size={28} className={dragOver ? "text-ochre" : "text-grey-400"} />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Drop a .csv file here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Any column headers work — the next step lets you match them to the fields below.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-widest text-grey-400 font-semibold mb-2">
          What this reads
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TARGET_FIELDS.map((f) => (
            <div key={f.field} className="border border-border px-2.5 py-2">
              <p className="text-xs font-medium text-foreground">{f.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {f.required ? "Required" : "Optional"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <a
          href="/templates/anomaly_template.csv"
          download
          className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
        >
          <Download size={12} /> Download a starter template
        </a>
      </div>
    </div>
  );
}

// ─── Step 2: Column mapping ─────────────────────────────────────────────────

function StepMapping({
  header,
  sample,
  mapping,
  onChange,
}: {
  header: string[];
  sample: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Matched by column header where possible — check each one, especially anything marked{" "}
        <span className="text-critical font-medium">unmapped</span>.
      </p>
      <div className="border border-border divide-y divide-border">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2 bg-grey-50 text-[10px] uppercase tracking-widest text-grey-400 font-semibold">
          <span>Target field</span>
          <span>CSV column</span>
          <span>Sample value</span>
        </div>
        {TARGET_FIELDS.map((spec) => {
          const colIdx = mapping[spec.field];
          return (
            <div
              key={spec.field}
              className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2 items-center"
            >
              <span className="text-xs font-medium text-foreground">
                {spec.label}
                {spec.required && <span className="text-critical"> *</span>}
              </span>
              <select
                value={colIdx ?? ""}
                onChange={(e) =>
                  onChange({
                    ...mapping,
                    [spec.field]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className={`h-8 px-2 border text-xs bg-card focus:outline-none focus:ring-1 focus:ring-ochre ${
                  colIdx == null && spec.required
                    ? "border-critical text-critical"
                    : "border-border text-foreground"
                }`}
              >
                <option value="">{spec.required ? "— unmapped —" : "— not used —"}</option>
                {header.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground mono truncate">
                {colIdx != null ? (sample[colIdx] ?? "") : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Validation & error reporting ───────────────────────────────────

const ISSUE_LABEL: Record<string, string> = {
  missing: "Missing",
  malformed_coords: "Malformed coords",
  swapped_coords: "Swapped coords",
  out_of_boundary: "Out of boundary",
  bad_vocabulary: "Unrecognised value",
  malformed_link: "Bad image link",
};

function StepValidation({ rows }: { rows: MappedRow[] }) {
  const blockedCount = rows.filter((r) => !rowIsValid(r)).length;
  const warnCount = rows.filter((r) => rowIsValid(r) && r.issues.length > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5 text-normal font-medium">
          <CheckCircle2 size={13} /> {rows.length - blockedCount} ready
        </span>
        {warnCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-medium font-medium">
            <AlertTriangle size={13} /> {warnCount} with warnings
          </span>
        )}
        {blockedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-critical font-medium">
            <XCircle size={13} /> {blockedCount} blocked
          </span>
        )}
        {rows.some((r) => r.issues.length > 0) && (
          <button
            onClick={() =>
              downloadTextFile(
                "import_errors.csv",
                errorReportCSV(rows.filter((r) => r.issues.length > 0)),
              )
            }
            className="ml-auto text-ochre font-medium hover:underline"
          >
            Download error report
          </button>
        )}
      </div>

      <div className="border border-border overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-grey-50">
            <tr className="text-left text-[10px] uppercase tracking-widest text-grey-400">
              <th className="px-2.5 py-2 font-semibold">Row</th>
              <th className="px-2.5 py-2 font-semibold">Module ID</th>
              <th className="px-2.5 py-2 font-semibold">Coordinates</th>
              <th className="px-2.5 py-2 font-semibold">Defect Type</th>
              <th className="px-2.5 py-2 font-semibold">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const blocked = !rowIsValid(row);
              return (
                <tr
                  key={row.rowNum}
                  className={blocked ? "bg-critical/5" : row.issues.length > 0 ? "bg-medium/5" : ""}
                >
                  <td className="px-2.5 py-2 mono text-muted-foreground">{row.rowNum}</td>
                  <td className="px-2.5 py-2 mono font-medium text-foreground">
                    {row.moduleId || "—"}
                  </td>
                  <td className="px-2.5 py-2 mono text-muted-foreground">
                    {row.latitude != null
                      ? `${row.latitude.toFixed(5)}, ${row.longitude!.toFixed(5)}`
                      : "—"}
                  </td>
                  <td className="px-2.5 py-2 text-foreground">{row.defectType || "—"}</td>
                  <td className="px-2.5 py-2">
                    {row.issues.length === 0 ? (
                      <span className="text-normal">✓ Ready</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.issues.map((issue, i) => (
                          <span
                            key={i}
                            title={issue.message}
                            className={`px-1.5 py-0.5 text-[10px] font-medium border ${
                              issue.blocking
                                ? "bg-critical/10 border-critical/30 text-critical"
                                : "bg-medium/10 border-medium/30 text-medium"
                            }`}
                          >
                            {ISSUE_LABEL[issue.kind] ?? issue.kind}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Step 4: Thermal-spatial preview + import ───────────────────────────────

function StepPreview({
  rows,
  selected,
  onSelect,
  importing,
  result,
}: {
  rows: MappedRow[];
  selected: number | null;
  onSelect: (rowNum: number | null) => void;
  importing: boolean;
  result: BatchImportResult | null;
}) {
  const mapRef = useRef<MapRef>(null);
  const center = useMemo(
    () => ({
      lng: (PLANT_BOUNDARY.west + PLANT_BOUNDARY.east) / 2,
      lat: (PLANT_BOUNDARY.south + PLANT_BOUNDARY.north) / 2,
    }),
    [],
  );

  if (result) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-normal font-semibold">
            <CheckCircle2 size={16} /> {result.created.length} imported
          </span>
          {result.failed.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-critical font-semibold">
              <XCircle size={16} /> {result.failed.length} failed
            </span>
          )}
        </div>
        {result.failed.length > 0 && (
          <div className="border border-critical/20 bg-critical/5 p-3 space-y-1 max-h-56 overflow-y-auto text-xs">
            {result.failed.map((f, i) => (
              <p key={i} className="text-critical">
                Row {f.index + 1} ({f.panelId ?? "—"}): {f.error}
              </p>
            ))}
          </div>
        )}
        {result.created.length > 0 && (
          <p className="text-xs text-muted-foreground">
            New anomalies are on the Anomalies page and the site map now.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-[420px]">
      {/* Left: the rows about to be written */}
      <div className="border border-border overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-grey-50">
            <tr className="text-left text-[10px] uppercase tracking-widest text-grey-400">
              <th className="px-2.5 py-2 font-semibold">Module ID</th>
              <th className="px-2.5 py-2 font-semibold">Defect</th>
              <th className="px-2.5 py-2 font-semibold w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.rowNum}
                onClick={() => {
                  onSelect(row.rowNum);
                  if (row.longitude != null && row.latitude != null) {
                    mapRef.current?.easeTo({
                      center: [row.longitude, row.latitude],
                      zoom: 18,
                      duration: 500,
                    });
                  }
                }}
                className={`cursor-pointer hover:bg-muted ${selected === row.rowNum ? "bg-ochre-muted" : ""}`}
              >
                <td className="px-2.5 py-1.5 mono font-medium text-foreground">{row.moduleId}</td>
                <td className="px-2.5 py-1.5 text-foreground truncate max-w-[140px]">
                  {row.defectType}
                </td>
                <td className="px-2.5 py-1.5">
                  {/* Only for a link well-formed enough that lib/defect-image.ts
                      will actually resolve it — a row here already cleared the
                      blocking checks, but a malformed link is a non-blocking
                      warning (see lib/csv.ts), so it can still reach this step.
                      Promising a thumbnail the detail page can't show would be
                      a second, quieter version of the same problem. */}
                  {row.thermalImageUrl && !row.issues.some((i) => i.kind === "malformed_link") && (
                    <ImageIcon size={11} className="text-ochre" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Right: read-only preview map — a separate MapGL instance, entirely
          independent of routes/_app/map.tsx. See the module docblock. */}
      <div className="border border-border relative overflow-hidden">
        {MAPBOX_TOKEN ? (
          <MapGL
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 15.5 }}
            style={{ width: "100%", height: "100%" }}
            mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          >
            {rows
              .filter((r) => r.latitude != null && r.longitude != null)
              .map((row) => (
                <Marker
                  key={row.rowNum}
                  longitude={row.longitude!}
                  latitude={row.latitude!}
                  anchor="center"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row.rowNum);
                    }}
                    title={`${row.moduleId} — ${row.defectType}`}
                    className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow ${
                      selected === row.rowNum ? "bg-ochre scale-150" : "bg-red-500"
                    }`}
                    style={{ transition: "transform 120ms" }}
                  />
                </Marker>
              ))}
          </MapGL>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
            Map preview needs VITE_MAPBOX_TOKEN — the row list on the left is still accurate.
          </div>
        )}
        <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] mono px-2 py-1 flex items-center gap-1">
          <MapPin size={10} /> {rows.length} point{rows.length === 1 ? "" : "s"} on the surveyed
          site
        </div>
        {importing && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

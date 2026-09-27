/**
 * Control Center → Upload Survey. The in-browser replacement for running
 * scripts/import_defect_kml.py and scripts/flatten_superoverlay.py by hand:
 * the admin picks a plant, a defect KML/KMZ and (optionally) an orthomosaic
 * KMZ, sees a parsed preview, and uploads. Parsing/compositing is
 * src/lib/survey-import.ts; persistence is useUploadSurvey.
 */
import { useState } from "react";
import {
  X,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { PlantSummary } from "@/lib/mock-data";
import { useUploadSurvey } from "@/lib/queries";
import { parseDefectFile, compositeOrthoKmz, type ParsedDefects } from "@/lib/survey-import";

interface OrthoResult {
  blob: Blob;
  bounds: { west: number; north: number; east: number; south: number };
  width: number;
  height: number;
  tilesPainted: number;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function UploadSurveyModal({
  plants,
  defaultPlantId,
  onClose,
  onUploaded,
}: {
  plants: PlantSummary[];
  defaultPlantId: string;
  onClose: () => void;
  onUploaded: (plantId: string, defectCount: number) => void;
}) {
  const [plantId, setPlantId] = useState(defaultPlantId || plants[0]?.id || "");
  const [inspectionDate, setInspectionDate] = useState("");

  const [defectFile, setDefectFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedDefects | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [orthoFile, setOrthoFile] = useState<File | null>(null);
  const [ortho, setOrtho] = useState<OrthoResult | null>(null);
  const [compositing, setCompositing] = useState(false);
  const [orthoError, setOrthoError] = useState<string | null>(null);
  const [orthoProgress, setOrthoProgress] = useState(0);

  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const upload = useUploadSurvey();

  async function handleDefectFile(file: File | undefined) {
    if (!file) return;
    setDefectFile(file);
    setParsed(null);
    setParseError(null);
    setParsing(true);
    try {
      const result = await parseDefectFile(file);
      setParsed(result);
      if (result.rows.length === 0) setParseError("No defects found in that file.");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  async function handleOrthoFile(file: File | undefined) {
    if (!file) return;
    setOrthoFile(file);
    setOrtho(null);
    setOrthoError(null);
    setOrthoProgress(0);
    setCompositing(true);
    try {
      const result = await compositeOrthoKmz(file, {
        onProgress: (done, total) => setOrthoProgress(total ? done / total : 0),
      });
      setOrtho(result);
    } catch (e) {
      setOrthoError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompositing(false);
    }
  }

  const canUpload =
    !!plantId &&
    !!inspectionDate.trim() &&
    !!parsed &&
    parsed.rows.length > 0 &&
    !parsing &&
    !compositing &&
    !upload.isPending;

  async function handleUpload() {
    if (!parsed) return;
    try {
      const survey = await upload.mutateAsync({
        plantId,
        inspectionDate: inspectionDate.trim(),
        rows: parsed.rows,
        overlay: ortho ? { blob: ortho.blob, bounds: ortho.bounds } : null,
        onProgress: (stage, done, total) =>
          setUploadStage(
            stage === "defects" ? `Saving defects… ${done}/${total}` : "Uploading orthomosaic…",
          ),
      });
      toast.success("Survey uploaded", {
        description: `${survey.defectCount} defects${survey.overlay ? " + orthomosaic" : ""} saved for this plant.`,
      });
      onUploaded(plantId, survey.defectCount);
      onClose();
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploadStage(null);
    }
  }

  const busy = upload.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200 sticky top-0 bg-card">
          <p className="font-semibold text-sm flex items-center gap-2">
            <UploadCloud size={15} className="text-ochre" /> Upload Survey
          </p>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground text-lg leading-none disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground -mt-1">
            Load a new inspection from its defect KML/KMZ and (optionally) its orthomosaic KMZ — no
            script or redeploy needed. Re-uploading the same date replaces that survey.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Plant">
              <select
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                disabled={busy}
                className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
              >
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Inspection Date">
              <input
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                disabled={busy}
                placeholder="e.g. 31 March 2026"
                className="w-full h-9 px-3 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
              />
            </Field>
          </div>

          {/* Defect file (required) */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400 flex items-center gap-1.5">
              <FileText size={12} /> Defect File (.kml / .kmz) — required
            </label>
            <input
              type="file"
              accept=".kml,.kmz"
              disabled={busy}
              onChange={(e) => handleDefectFile(e.target.files?.[0])}
              className="mt-1.5 w-full text-xs file:mr-3 file:h-8 file:px-3 file:border file:border-border file:bg-muted file:text-xs file:font-medium file:cursor-pointer"
            />
            {parsing && (
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Parsing {defectFile?.name}…
              </p>
            )}
            {parseError && (
              <p className="mt-2 text-xs text-critical flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {parseError}
              </p>
            )}
            {parsed && parsed.rows.length > 0 && (
              <div className="mt-2 border border-border bg-muted/50 p-3 text-xs space-y-1.5">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-normal" /> {parsed.rows.length} defects
                  parsed
                </p>
                <p className="text-muted-foreground">
                  <span className="text-critical font-semibold">
                    {parsed.bySeverity.critical} critical
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold" style={{ color: "#B26200" }}>
                    {parsed.bySeverity.medium} medium
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold" style={{ color: "#847700" }}>
                    {parsed.bySeverity.normal} normal
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {parsed.blocks.length} blocks: {parsed.blocks.join(", ")}
                </p>
                {parsed.skipped > 0 && (
                  <p className="text-muted-foreground">
                    {parsed.skipped} placemarks skipped (no data or geometry).
                  </p>
                )}
                {parsed.unknownCodes.length > 0 && (
                  <p className="text-ochre-fg">
                    Unmapped defect codes imported as “Other”: {parsed.unknownCodes.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Orthomosaic file (optional) */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400 flex items-center gap-1.5">
              <ImageIcon size={12} /> Orthomosaic (.kmz) — optional
            </label>
            <input
              type="file"
              accept=".kmz"
              disabled={busy}
              onChange={(e) => handleOrthoFile(e.target.files?.[0])}
              className="mt-1.5 w-full text-xs file:mr-3 file:h-8 file:px-3 file:border file:border-border file:bg-muted file:text-xs file:font-medium file:cursor-pointer"
            />
            {compositing && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Compositing tiles…{" "}
                  {Math.round(orthoProgress * 100)}%
                </p>
                <div className="mt-1 h-1 bg-grey-200">
                  <div className="h-1 bg-ochre" style={{ width: `${orthoProgress * 100}%` }} />
                </div>
              </div>
            )}
            {orthoError && (
              <p className="mt-2 text-xs text-critical flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {orthoError}
              </p>
            )}
            {ortho && (
              <p className="mt-2 text-xs text-foreground flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-normal" /> {ortho.width}×{ortho.height}px
                from {ortho.tilesPainted} tiles ({(ortho.blob.size / 1e6).toFixed(1)} MB)
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="w-full h-10 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {busy ? (uploadStage ?? "Uploading…") : "Upload Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}

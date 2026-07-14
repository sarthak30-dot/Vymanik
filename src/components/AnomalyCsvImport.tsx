import { useState } from "react";
import { Download, Upload, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { validateAnomalyCSV, downloadTextFile, errorReportCSV, type ParsedAnomalyRow, type RowError } from "@/lib/csv";

/**
 * Section 4 bulk anomaly import: parse the CSV client-side, show row-level
 * errors immediately, and only submit the rows that passed validation
 * (partial success) — one POST /api/anomalies per valid row, since there's
 * no bulk-insert endpoint yet and the per-row endpoint already enforces the
 * controlled vocabulary server-side.
 */
export function AnomalyCsvImport() {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [valid, setValid] = useState<ParsedAnomalyRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImported(null);
    const reader = new FileReader();
    reader.onload = () => {
      const { valid, errors } = validateAnomalyCSV(String(reader.result ?? ""));
      setValid(valid);
      setErrors(errors);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    const token = getToken();
    if (!token || valid.length === 0) return;
    setImporting(true);
    let ok = 0;
    const failed: RowError[] = [];
    for (let i = 0; i < valid.length; i++) {
      const row = valid[i];
      try {
        await api.anomalies.create(
          {
            plantId: row.plantId,
            panelId: row.moduleId,
            defectType: row.defectType,
            categoryCode: row.categoryCode,
            deltaT: null,
            severity: row.severity as "critical" | "medium" | "normal" | "nodata" | undefined,
            rgbNote: row.photoFilename ? `Imported from CSV — photo: ${row.photoFilename}` : "Imported from CSV",
            gps: { lat: row.gpsLat, lng: row.gpsLng },
          },
          token,
        );
        ok++;
      } catch (err) {
        failed.push({ row: i + 2, message: `Row ${i + 2} (${row.moduleId}): ${err instanceof Error ? err.message : "import failed"}` });
      }
    }
    setImporting(false);
    setImported(ok);
    if (failed.length > 0) setErrors(prev => [...prev, ...failed]);
    queryClient.invalidateQueries({ queryKey: ["anomalies"], exact: false });
    if (ok > 0) toast.success(`Imported ${ok} anomal${ok === 1 ? "y" : "ies"}`, {
      description: failed.length > 0 ? `${failed.length} row(s) failed during import — see the error list.` : "Visible on the Anomalies page now.",
    });
  }

  return (
    <section className="bg-card border border-border overflow-hidden">
      <header className="px-5 py-4 border-b border-grey-200">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Upload size={14} className="text-ochre" /> Bulk Import — Anomalies (CSV)
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          One canonical template, validated row-by-row on upload. Rows with errors are skipped and listed below — everything else still imports.
        </p>
      </header>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <a
            href="/templates/anomaly_template.csv"
            download
            className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
          >
            <Download size={12} /> Download anomaly_template.csv
          </a>
          <a
            href="/templates/layout_template.csv"
            download
            className="h-8 px-3 border border-border bg-card text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted"
          >
            <Download size={12} /> Download layout_template.csv
          </a>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-widest text-grey-400">Upload filled-in anomaly CSV</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="mt-1.5 block w-full text-xs file:mr-3 file:h-8 file:px-3 file:border-0 file:bg-ochre file:text-ochre-fg file:font-medium file:text-xs file:cursor-pointer"
          />
        </div>

        {fileName && (
          <div className="border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{fileName}</span> — {valid.length} row{valid.length === 1 ? "" : "s"} valid, {errors.length} error{errors.length === 1 ? "" : "s"}
            </p>

            {errors.length > 0 && (
              <div className="border border-critical/20 bg-critical/5 p-3 space-y-1 max-h-40 overflow-y-auto">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-critical flex items-start gap-1.5">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" /> {e.message}
                  </p>
                ))}
                <button
                  onClick={() => downloadTextFile("import_errors.csv", errorReportCSV(errors))}
                  className="text-[11px] font-medium text-critical underline mt-1"
                >
                  Download error report
                </button>
              </div>
            )}

            {imported !== null ? (
              <p className="text-xs text-normal flex items-center gap-1.5">
                <CheckCircle2 size={13} /> {imported} row{imported === 1 ? "" : "s"} imported
              </p>
            ) : (
              <button
                onClick={handleImport}
                disabled={valid.length === 0 || importing}
                className="h-8 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg font-medium text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <><Loader2 size={12} className="animate-spin" /> Importing…</> : `Import ${valid.length} valid row${valid.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

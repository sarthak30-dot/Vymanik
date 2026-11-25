/**
 * CSV export for the anomalies table — shared by the three anomaly "sheets"
 * (All Anomalies, Block-wise, Defect-wise) so every view produces the same
 * column layout for every plant. The zone heading ("Block" vs "Row") still
 * comes from registerLocation, so a Hamirpur-style (row) survey and a
 * block/inverter survey each get their own vocabulary in the same file shape.
 */
import { SEVERITY_LABEL, clientDefectType } from "./mock-data";
import { registerLocation } from "./layout-labels";
import type { AnomalyDTO } from "./api";

export function blockNumber(a: AnomalyDTO, plantName: string): string {
  return registerLocation(a, plantName).zone;
}

export function layoutLocation(a: AnomalyDTO, plantName: string): string {
  return registerLocation(a, plantName).layout;
}

export function mapLocation(a: AnomalyDTO): string {
  return `${a.gps.lat.toFixed(7)}, ${a.gps.lng.toFixed(7)}`;
}

/** Google's documented "Search" URL API — a pin at the exact coordinate. */
export function googleMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function exportAnomaliesCSV(rows: AnomalyDTO[], plantName: string, filenameSuffix = "Anomalies") {
  // Heading taken from the rows themselves, so the export says "Row" for a
  // survey that groups by rack row and "Block" for one that groups by block —
  // the same word the client's own register uses.
  const zoneLabel = rows[0] ? registerLocation(rows[0], plantName).zoneLabel : "Block";
  const header = ["SL No", zoneLabel, "Layout Location", "Map Location", "Defect Type", "Delta_T", "Severity", "Status", "Date", "Image Ref"];
  const lines = rows.map((a, i) => [
    i + 1, blockNumber(a, plantName), layoutLocation(a, plantName), mapLocation(a), clientDefectType(a.type),
    a.deltaTNorm ?? a.deltaT ?? "", SEVERITY_LABEL[a.severity], a.status, a.date, a.rgbNote ?? "",
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `UrjaScan_${plantName.replace(/\s+/g, "_")}_${filenameSuffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

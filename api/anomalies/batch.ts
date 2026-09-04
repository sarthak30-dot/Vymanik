import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase";
import { setCors } from "../_lib/cors";
import { getAuthUser } from "../_lib/auth";
import { can } from "../_lib/permissions";
import { toAnomalyDTO } from "../_lib/mappers";
import { DEFECT_TYPES } from "../../packages/types/src/taxonomy";

/**
 * Bulk insert for the CSV import wizard — one request in place of one
 * POST /api/anomalies per row, which is what the client-side importer did
 * before this existed (see the retired components/AnomalyCsvImport.tsx).
 *
 * WHY THIS LOOPS INSTEAD OF ONE MULTI-ROW INSERT
 * --------------------------------------------------
 * A single `.insert([...rows])` would be one round trip, but Postgres commits
 * an array insert as one transaction: if row 400 of a 1,200-row file violates
 * a constraint, the previous 399 roll back with it. That is the opposite of
 * this app's established CSV philosophy — see lib/csv.ts's docblock and the
 * single-row route in ../anomalies.ts, both explicit about row-level
 * validation with partial success. A field team's CSV having one bad row
 * should cost that one row, not the whole batch.
 *
 * So "batch" here means batched from the CALLER's side — one HTTP request
 * instead of hundreds — while each row is still its own INSERT server-side,
 * preserving the fault isolation. The client has already run the same rows
 * through lib/csv.ts's validateMappedRows() and excluded blocking failures,
 * so in the common case every row here succeeds; this endpoint's per-row
 * try/catch exists for what client-side validation cannot see — a
 * concurrent write conflict, a constraint the client doesn't know about, a
 * transient Supabase error on one row of many.
 *
 * A hard cap keeps one request from tying up the function for an unbounded
 * file — the wizard chunks anything larger than this client-side instead of
 * sending it in one call.
 */
const MAX_ROWS = 500;

interface BatchAnomalyInput {
  plantId?: string;
  inspectionId?: string;
  panelId?: string;
  row?: number;
  col?: number;
  type?: string;
  defectType?: string;
  categoryCode?: string;
  deltaT?: number | null;
  severity?: "critical" | "medium" | "normal" | "nodata";
  string?: string;
  inverter?: string;
  stringId?: string;
  rgbNote?: string;
  gps?: { lat?: number; lng?: number };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  // Matches the single-row route's own check — "editAnomaly" is the only
  // action api/_lib/permissions.ts defines that covers writing anomaly rows;
  // there is no separate "uploadData" on the backend side.
  if (!can(user.role, "editAnomaly")) {
    return res.status(403).json({ error: "Client Access accounts cannot import anomalies" });
  }

  const body = (req.body ?? {}) as { rows?: BatchAnomalyInput[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: "rows must be a non-empty array" });
  if (rows.length > MAX_ROWS) {
    return res.status(400).json({
      error: `A single batch is capped at ${MAX_ROWS} rows — split the file client-side and send it in chunks.`,
    });
  }

  const now = new Date();
  const created: ReturnType<typeof toAnomalyDTO>[] = [];
  const failed: { index: number; panelId: string | null; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.plantId || !r.panelId || r.gps?.lat == null || r.gps?.lng == null) {
      failed.push({
        index: i,
        panelId: r.panelId ?? null,
        error: "plantId, panelId and gps {lat,lng} are required",
      });
      continue;
    }
    if (r.defectType && !(DEFECT_TYPES as readonly string[]).includes(r.defectType)) {
      failed.push({
        index: i,
        panelId: r.panelId,
        error: `defectType must be one of: ${DEFECT_TYPES.join(", ")}`,
      });
      continue;
    }

    const id = `insp-${Date.now().toString(36)}-${i}`;
    const { data, error } = await supabase
      .from("anomalies")
      .insert({
        id,
        inspection_id: r.inspectionId ?? `insp-${now.getFullYear()}-${now.getMonth() + 1}`,
        plant_id: r.plantId,
        panel_id: r.panelId.toUpperCase(),
        row: r.row ?? 0,
        col: r.col ?? 0,
        type: r.type ?? r.defectType ?? "Other",
        defect_type: r.defectType ?? null,
        category_code: r.categoryCode ?? null,
        delta_t: r.deltaT ?? null,
        severity:
          r.severity ??
          (r.deltaT == null
            ? "normal"
            : r.deltaT >= 30
              ? "critical"
              : r.deltaT >= 15
                ? "medium"
                : "normal"),
        string: r.string ?? "CSV Import",
        inverter: r.inverter ?? "—",
        string_id: r.stringId ?? null,
        status: "New",
        date: now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        inspection_time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        rgb_note: r.rgbNote ?? null,
        gps_lat: r.gps.lat,
        gps_lng: r.gps.lng,
      })
      .select()
      .single();

    if (error || !data) {
      failed.push({ index: i, panelId: r.panelId, error: error?.message ?? "Insert failed" });
    } else {
      created.push(toAnomalyDTO(data));
    }
  }

  return res.status(created.length > 0 ? 201 : 207).json({ created, failed });
}

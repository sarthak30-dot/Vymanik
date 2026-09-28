import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { setCors } from "./_lib/cors.js";
import { getAuthUser } from "./_lib/auth.js";

/**
 * Survey upload from Control Center — the server half of what
 * scripts/import_defect_kml.py + scripts/flatten_superoverlay.py did by hand.
 * The browser does the parsing and compositing (src/lib/survey-import.ts);
 * this endpoint only stores the results.
 *
 *   GET  ?plantId=               -> { survey } — the plant's current survey, or null
 *   POST { action: "import-defects", plantId, inspectionId, inspectionDate, rows, replace }
 *   POST { action: "sign-overlay",   plantId, inspectionId }  -> signed upload URL
 *   POST { action: "save-survey",    plantId, inspectionId, inspectionDate, defectCount, overlay? }
 *
 * One function for all of it on purpose: Vercel's Hobby plan caps a project
 * at 12 serverless functions and this makes the twelfth.
 *
 * The orthomosaic never passes through here. A composited ortho is several
 * MB and Vercel rejects request bodies over 4.5 MB, so "sign-overlay" hands
 * the browser a one-time Supabase Storage upload URL and the file goes
 * straight to storage.
 */

const BUCKET = "survey-overlays";
/** Rows per multi-row insert. The client already chunks requests to stay
 *  under the body limit; this bounds each Postgres statement. */
const INSERT_CHUNK = 500;

interface SurveyRow {
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
}

/** Postgres "relation does not exist" — migration 007 not run yet. */
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

function surveyDTO(row: Record<string, unknown>) {
  const hasOverlay = row.overlay_url != null && row.overlay_west != null;
  return {
    plantId: row.plant_id as string,
    inspectionId: row.inspection_id as string,
    inspectionDate: row.inspection_date as string,
    defectCount: Number(row.defect_count ?? 0),
    uploadedAt: row.uploaded_at as string,
    overlay: hasOverlay
      ? {
          url: row.overlay_url as string,
          west: Number(row.overlay_west),
          north: Number(row.overlay_north),
          east: Number(row.overlay_east),
          south: Number(row.overlay_south),
        }
      : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const plantId = typeof req.query.plantId === "string" ? req.query.plantId : "";
    if (!plantId) return res.status(400).json({ error: "plantId is required" });
    const { data, error } = await supabase
      .from("plant_surveys")
      .select("*")
      .eq("plant_id", plantId)
      .maybeSingle();
    // Before migration 007 there are no uploaded surveys — not an error.
    if (error && isMissingTable(error.code)) return res.json({ survey: null });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ survey: data ? surveyDTO(data) : null });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (user.role !== "admin") return res.status(403).json({ error: "Only admins can upload surveys" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const plantId = typeof body.plantId === "string" ? body.plantId : "";
  const inspectionId = typeof body.inspectionId === "string" ? body.inspectionId : "";
  if (!plantId || !inspectionId) {
    return res.status(400).json({ error: "plantId and inspectionId are required" });
  }

  switch (body.action) {
    case "import-defects": {
      const rows = Array.isArray(body.rows) ? (body.rows as SurveyRow[]) : [];
      const inspectionDate = typeof body.inspectionDate === "string" ? body.inspectionDate : "";
      if (!inspectionDate) return res.status(400).json({ error: "inspectionDate is required" });

      // First chunk of an upload clears any earlier upload of the SAME
      // inspection, so re-uploading a corrected file replaces it rather than
      // doubling every defect. Earlier inspections are left alone — they're
      // the history a future comparison view will need.
      if (body.replace === true) {
        const { error } = await supabase
          .from("anomalies")
          .delete()
          .eq("plant_id", plantId)
          .eq("inspection_id", inspectionId);
        if (error) return res.status(500).json({ error: `Could not clear the previous upload: ${error.message}` });
      }
      if (rows.length === 0) return res.json({ inserted: 0 });

      const stamp = Date.now().toString(36);
      const records = rows.map((r, i) => ({
        id: `${inspectionId}-${stamp}-${i}`,
        inspection_id: inspectionId,
        plant_id: plantId,
        panel_id: String(r.panelId).toUpperCase(),
        row: Number(r.row) || 0,
        col: Number(r.col) || 0,
        type: r.type,
        // The survey KML carries no temperatures — stored as unknown rather
        // than estimated from the defect type.
        delta_t: null,
        severity: r.severity,
        string: r.string,
        inverter: r.inverter,
        status: "New",
        date: inspectionDate,
        inspection_time: "—",
        rgb_note: r.rgbNote ?? null,
        gps_lat: r.gps.lat,
        gps_lng: r.gps.lng,
        block: r.block ?? null,
        smb: r.smb ?? null,
        string_side: r.stringSide ?? null,
        module: r.module ?? null,
        defect_code: r.defectCode ?? null,
        footprint: r.footprint ?? null,
      }));

      // Multi-row inserts, not the per-row loop /api/anomalies/batch uses for
      // CSV: a survey is one machine-generated file, so a partially-loaded
      // survey is worse than a failed one — and 1,200 sequential inserts
      // would outlive a serverless function's time limit.
      for (let i = 0; i < records.length; i += INSERT_CHUNK) {
        const { error } = await supabase.from("anomalies").insert(records.slice(i, i + INSERT_CHUNK));
        if (error) {
          const hint = error.code === "42703" || error.code === "PGRST204"
            ? " — run packages/db/migrations/007_survey_upload.sql in Supabase first."
            : error.code === "23503"
              ? " — this plant isn't in the plants table (run migration 007 for plant-001)."
              : "";
          return res.status(500).json({ error: `Saving defects failed: ${error.message}${hint}` });
        }
      }
      return res.status(201).json({ inserted: records.length });
    }

    case "sign-overlay": {
      // Public bucket: the map loads the ortho as a plain image URL.
      const { error: getErr } = await supabase.storage.getBucket(BUCKET);
      if (getErr) {
        const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
        if (createErr && !/already exists/i.test(createErr.message)) {
          return res.status(500).json({ error: `Could not create storage bucket: ${createErr.message}` });
        }
      }
      const ext = body.contentType === "image/png" ? "png" : "webp";
      const path = `${plantId}/${inspectionId}-${Date.now().toString(36)}.${ext}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return res.status(500).json({ error: error?.message ?? "Could not create upload URL" });
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return res.json({ signedUrl: data.signedUrl, publicUrl: pub.publicUrl });
    }

    case "save-survey": {
      const inspectionDate = typeof body.inspectionDate === "string" ? body.inspectionDate : "";
      const overlay = body.overlay as
        | { url?: string; west?: number; north?: number; east?: number; south?: number }
        | null
        | undefined;
      const { data, error } = await supabase
        .from("plant_surveys")
        .upsert({
          plant_id: plantId,
          inspection_id: inspectionId,
          inspection_date: inspectionDate,
          defect_count: Number(body.defectCount) || 0,
          overlay_url: overlay?.url ?? null,
          overlay_west: overlay?.west ?? null,
          overlay_north: overlay?.north ?? null,
          overlay_east: overlay?.east ?? null,
          overlay_south: overlay?.south ?? null,
          uploaded_by: user.email,
          uploaded_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error || !data) {
        const hint = error && isMissingTable(error.code)
          ? " — run packages/db/migrations/007_survey_upload.sql in Supabase first."
          : "";
        return res.status(500).json({ error: `Saving the survey failed: ${error?.message ?? "unknown error"}${hint}` });
      }
      // Keep the plant's own "last inspected" date in step with its survey.
      await supabase.from("plants").update({ last_inspection: inspectionDate }).eq("id", plantId);
      return res.json({ survey: surveyDTO(data) });
    }

    default:
      return res.status(400).json({ error: "Unknown action" });
  }
}

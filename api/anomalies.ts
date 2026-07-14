import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase";
import { setCors } from "./_lib/cors";
import { getAuthUser } from "./_lib/auth";
import { can } from "./_lib/permissions";
import { toAnomalyDTO } from "./_lib/mappers";
import { DEFECT_TYPES } from "../packages/types/src/taxonomy";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    if (!can(user.role, "editAnomaly")) {
      return res.status(403).json({ error: "Client Access accounts cannot create anomalies" });
    }

    const body = (req.body ?? {}) as {
      plantId?: string; inspectionId?: string; panelId?: string;
      row?: number; col?: number; type?: string; defectType?: string;
      categoryCode?: string; deltaT?: number | null; string?: string;
      inverter?: string; stringId?: string; rgbNote?: string; gps?: { lat?: number; lng?: number };
      /** Explicit override — used by CSV import, which carries severity but no ΔT reading */
      severity?: "critical" | "medium" | "normal" | "nodata";
    };
    const { plantId, panelId, gps } = body;
    if (!plantId || !panelId || gps?.lat == null || gps?.lng == null) {
      return res.status(400).json({ error: "plantId, panelId and gps {lat,lng} are required" });
    }
    // Server-side enforcement of the controlled vocabulary — the frontend
    // dropdown already restricts this, but a raw API call shouldn't be able
    // to write an arbitrary free-text defect type.
    if (body.defectType && !(DEFECT_TYPES as readonly string[]).includes(body.defectType)) {
      return res.status(400).json({ error: `defectType must be one of: ${DEFECT_TYPES.join(", ")}` });
    }

    const now = new Date();
    const id = `insp-${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from("anomalies")
      .insert({
        id,
        inspection_id: body.inspectionId ?? `insp-${now.getFullYear()}-${now.getMonth() + 1}`,
        plant_id: plantId,
        panel_id: panelId.toUpperCase(),
        row: body.row ?? 0,
        col: body.col ?? 0,
        type: body.type ?? body.defectType ?? "Other",
        defect_type: body.defectType ?? null,
        category_code: body.categoryCode ?? null,
        delta_t: body.deltaT ?? null,
        severity: body.severity
          ?? (body.deltaT == null ? "normal" : body.deltaT >= 30 ? "critical" : body.deltaT >= 15 ? "medium" : "normal"),
        string: body.string ?? "Inspector Report",
        inverter: body.inverter ?? "—",
        string_id: body.stringId ?? null,
        status: "New",
        date: now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        inspection_time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        rgb_note: body.rgbNote ?? null,
        gps_lat: gps.lat,
        gps_lng: gps.lng,
      })
      .select()
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? "Failed to create anomaly" });
    return res.status(201).json(toAnomalyDTO(data));
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { plantId, inspectionId } = req.query as {
    plantId?: string;
    inspectionId?: string;
  };

  let query = supabase.from("anomalies").select("*");
  if (plantId)      query = query.eq("plant_id", plantId);
  if (inspectionId) query = query.eq("inspection_id", inspectionId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json((data ?? []).map(toAnomalyDTO));
}

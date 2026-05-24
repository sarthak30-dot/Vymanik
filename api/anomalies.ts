import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase";
import { setCors } from "./_lib/cors";
import { verifyAuth } from "./_lib/auth";
import { toAnomalyDTO } from "./_lib/mappers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!await verifyAuth(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });
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

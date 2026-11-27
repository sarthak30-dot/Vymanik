import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import { setCors } from "../_lib/cors.js";
import { verifyAuth, getAuthUser } from "../_lib/auth.js";
import { toPlantDTO } from "../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const { id } = req.query as { id: string };

  if (req.method === "DELETE") {
    const user = await getAuthUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "admin") return res.status(403).json({ error: "Only admins can delete plants" });

    // Everything that references this plant cascades or is cleared by the FKs
    // in packages/db/migrations (anomalies, inspection_history, plant_surveys,
    // blocks->inverters->strings->modules, service_enquiries all ON DELETE
    // CASCADE; team_members.assigned_plant_id ON DELETE SET NULL) — one delete
    // here is enough, no manual cleanup of related tables.
    const { data, error } = await supabase.from("plants").delete().eq("id", id).select().maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Plant not found" });
    return res.status(200).json({ deleted: true, id });
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!await verifyAuth(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await supabase
    .from("plants")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Plant not found" });
  return res.json(toPlantDTO(data));
}

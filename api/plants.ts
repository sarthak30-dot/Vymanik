import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase";
import { setCors } from "./_lib/cors";
import { verifyAuth } from "./_lib/auth";
import { toPlantDTO } from "./_lib/mappers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!await verifyAuth(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;

  if (id) {
    const { data, error } = await supabase
      .from("plants")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Plant not found" });
    return res.json(toPlantDTO(data));
  }

  const { data, error } = await supabase.from("plants").select("*");
  if (error) return res.status(500).json({ error: error.message });
  return res.json((data ?? []).map(toPlantDTO));
}

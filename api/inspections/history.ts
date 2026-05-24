import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase";
import { setCors, checkAuth } from "../_lib/cors";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!checkAuth(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });

  const plantId = (req.query.plantId as string) ?? "plant-rajpur-1";

  const { data, error } = await supabase
    .from("inspection_history")
    .select("date, critical, medium, normal, panels, pilot")
    .eq("plant_id", plantId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
}

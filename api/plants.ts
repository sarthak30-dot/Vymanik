import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase";
import { setCors } from "./_lib/cors";
import { verifyAuth, getAuthUser } from "./_lib/auth";
import { toPlantDTO } from "./_lib/mappers";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    const user = await getAuthUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "admin") return res.status(403).json({ error: "Only admins can add plants" });

    const { name, location, capacityMW, totalPanels, lat, lng } = (req.body ?? {}) as {
      name?: string; location?: string; capacityMW?: number; totalPanels?: number; lat?: number; lng?: number;
    };
    if (!name || !location || !capacityMW || !totalPanels || lat == null || lng == null) {
      return res.status(400).json({ error: "name, location, capacityMW, totalPanels, lat and lng are required" });
    }

    const id = `plant-${slugify(name)}-${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from("plants")
      .insert({
        id, name, location,
        capacity_mw: capacityMW,
        total_panels: totalPanels,
        health_score: 100,
        daily_loss_inr: 0,
        daily_loss_kwh: 0,
        feed_in_tariff: 4.5,
        lat, lng,
      })
      .select()
      .single();

    if (error || !data) return res.status(500).json({ error: error?.message ?? "Failed to create plant" });
    return res.status(201).json(toPlantDTO(data));
  }

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

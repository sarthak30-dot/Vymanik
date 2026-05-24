import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase";
import { setCors } from "../_lib/cors";
import { verifyAuth } from "../_lib/auth";
import { toAnomalyDTO } from "../_lib/mappers";
import type { AnomalyStatus } from "../../packages/types/src/index";

const VALID_STATUSES: AnomalyStatus[] = ["New", "Acknowledged", "In Repair", "Closed"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!await verifyAuth(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query as { id: string };

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("anomalies")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Anomaly not found" });
    return res.json(toAnomalyDTO(data));
  }

  if (req.method === "PATCH") {
    const { status } = (req.body ?? {}) as { status?: AnomalyStatus };
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data, error } = await supabase
      .from("anomalies")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: "Anomaly not found" });
    return res.json(toAnomalyDTO(data));
  }

  return res.status(405).json({ error: "Method not allowed" });
}

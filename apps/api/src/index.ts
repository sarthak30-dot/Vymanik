import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import type { AnomalyStatus } from "../../../packages/types/src/index";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = "3001",
} = process.env;

if (!SUPABASE_URL)            throw new Error("Missing env: SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Mappers (snake_case DB rows → camelCase DTOs) ─────────────────────────

function toPlantDTO(r: Record<string, unknown>) {
  return {
    id: r.id, name: r.name, location: r.location,
    capacityMW: Number(r.capacity_mw), totalPanels: Number(r.total_panels),
    lastInspection: r.last_inspection, nextInspection: r.next_inspection,
    healthScore: Number(r.health_score),
    dailyLossINR: Number(r.daily_loss_inr), dailyLossKWh: Number(r.daily_loss_kwh),
    feedInTariff: Number(r.feed_in_tariff),
    lat: Number(r.lat), lng: Number(r.lng),
  };
}

function toAnomalyDTO(r: Record<string, unknown>) {
  return {
    id: r.id, inspectionId: r.inspection_id, plantId: r.plant_id,
    panelId: r.panel_id, row: Number(r.row), col: Number(r.col),
    type: r.type, deltaT: r.delta_t != null ? Number(r.delta_t) : null,
    severity: r.severity, string: r.string, inverter: r.inverter,
    status: r.status, date: r.date, inspectionTime: r.inspection_time,
    rgbNote: r.rgb_note,
    gps: { lat: Number(r.gps_lat), lng: Number(r.gps_lng) },
    peakTemp:     r.peak_temp      != null ? Number(r.peak_temp)      : undefined,
    refTemp:      r.ref_temp       != null ? Number(r.ref_temp)       : undefined,
    irradiance:   r.irradiance     != null ? Number(r.irradiance)     : undefined,
    moduleSerial: r.module_serial  != null ? String(r.module_serial)  : undefined,
    dailyLossINR: r.daily_loss_inr != null ? Number(r.daily_loss_inr) : undefined,
    dailyLossKWh: r.daily_loss_kwh != null ? Number(r.daily_loss_kwh) : undefined,
  };
}

// ─── Express app ───────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ─── Auth (demo: accept any email, return a signed-looking token) ──────────

app.post("/api/auth/login", (req, res) => {
  const { email, role = "client" } = req.body as { email?: string; role?: string };
  if (!email) return res.status(400).json({ error: "Email is required" });

  const token = `demo-${Buffer.from(email).toString("base64")}-${Date.now()}`;
  res.json({
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    userId: `user-${email.split("@")[0]}`,
    role,
    plantIds: ["plant-rajpur-1"],
  });
});

app.post("/api/auth/logout", (_req, res) => res.status(204).end());

// ─── Bearer token check ────────────────────────────────────────────────────

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.headers.authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── Plants ────────────────────────────────────────────────────────────────

app.get("/api/plants", requireAuth, async (_req, res) => {
  const { data, error } = await supabase.from("plants").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json((data ?? []).map(toPlantDTO));
});

app.get("/api/plants/:id", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("plants").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Plant not found" });
  res.json(toPlantDTO(data));
});

// ─── Anomalies ─────────────────────────────────────────────────────────────

app.get("/api/anomalies", requireAuth, async (req, res) => {
  const { plantId, inspectionId } = req.query as { plantId?: string; inspectionId?: string };
  let q = supabase.from("anomalies").select("*");
  if (plantId)      q = q.eq("plant_id", plantId);
  if (inspectionId) q = q.eq("inspection_id", inspectionId);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json((data ?? []).map(toAnomalyDTO));
});

app.get("/api/anomalies/:id", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("anomalies").select("*").eq("id", req.params.id).single();
  if (error || !data) return res.status(404).json({ error: "Anomaly not found" });
  res.json(toAnomalyDTO(data));
});

app.patch("/api/anomalies/:id", requireAuth, async (req, res) => {
  const valid: AnomalyStatus[] = ["New", "Acknowledged", "In Repair", "Closed"];
  const { status } = req.body as { status: AnomalyStatus };
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const { data, error } = await supabase
    .from("anomalies").update({ status }).eq("id", req.params.id).select().single();
  if (error || !data) return res.status(404).json({ error: "Anomaly not found" });
  res.json(toAnomalyDTO(data));
});

// ─── Inspection history ────────────────────────────────────────────────────

app.get("/api/inspections/history", requireAuth, async (req, res) => {
  const plantId = (req.query.plantId as string) ?? "plant-rajpur-1";
  const { data, error } = await supabase
    .from("inspection_history")
    .select("date, critical, medium, normal, panels, pilot")
    .eq("plant_id", plantId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// ─── Health ────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(Number(PORT), () =>
  console.log(`API server → http://localhost:${PORT}`)
);

export default app;

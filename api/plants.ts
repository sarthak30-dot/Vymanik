import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { supabase } from "./_lib/supabase.js";
import { setCors } from "./_lib/cors.js";
import { verifyAuth, getAuthUser } from "./_lib/auth.js";
import { toPlantDTO } from "./_lib/mappers.js";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Vymanik Aerospace's WhatsApp number — plant owners are handed a click-to-chat
// link pre-filled with their enquiry, no WhatsApp Business API needed.
const WHATSAPP_NUMBER = "918182830960";

function buildWhatsAppLink(serviceName: string, plantName: string, name: string): string {
  const text = `Hi, I'm ${name}, regarding ${plantName}. I'd like to enquire about ${serviceName}.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/**
 * Plant owners enquiring about a "Coming Soon" service (src/routes/_app/services.tsx).
 * Folded into this file rather than its own api/enquiries.ts — Vercel's Hobby
 * plan caps a project at 12 serverless functions and this project is already
 * at that limit (see the same note in api/survey.ts).
 */
async function handleEnquiry(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { plantId, plantName, serviceId, serviceName, name, phone, email, message } = (req.body ?? {}) as {
    plantId?: string; plantName?: string; serviceId?: string; serviceName?: string;
    name?: string; phone?: string; email?: string; message?: string;
  };
  if (!plantId || !serviceId || !serviceName || !name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: "plantId, serviceId, serviceName, name and phone are required" });
  }

  const id = `enq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.from("service_enquiries").insert({
    id,
    plant_id: plantId,
    service_id: serviceId,
    service_name: serviceName,
    name: name.trim(),
    phone: phone.trim(),
    email: email?.trim() || null,
    message: message?.trim() || null,
  });
  if (error) return res.status(500).json({ error: error.message });

  // Best-effort email notification — the enquiry is already saved even if this fails.
  try {
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.ENQUIRY_NOTIFY_EMAIL || process.env.GMAIL_USER,
        subject: `New service enquiry: ${serviceName} — ${plantName ?? plantId}`,
        text: [
          `Service: ${serviceName}`,
          `Plant: ${plantName ?? plantId} (${plantId})`,
          `Name: ${name.trim()}`,
          `Phone: ${phone.trim()}`,
          email ? `Email: ${email.trim()}` : null,
          message ? `Message: ${message.trim()}` : null,
          `Submitted by: ${user.email} (${user.role})`,
        ].filter(Boolean).join("\n"),
      });
    }
  } catch (mailErr) {
    console.error("Enquiry email failed:", mailErr);
  }

  return res.status(201).json({
    id,
    whatsappUrl: buildWhatsAppLink(serviceName, plantName ?? plantId, name.trim()),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.action === "enquiry") return handleEnquiry(req, res);

    const user = await getAuthUser(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "admin") return res.status(403).json({ error: "Only admins can add plants" });

    const { name, client, location, capacityMW, totalPanels, lat, lng } = (req.body ?? {}) as {
      name?: string; client?: string; location?: string; capacityMW?: number; totalPanels?: number; lat?: number; lng?: number;
    };
    if (!name || !location || !capacityMW || !totalPanels || lat == null || lng == null) {
      return res.status(400).json({ error: "name, location, capacityMW, totalPanels, lat and lng are required" });
    }

    const id = `plant-${slugify(name)}-${Date.now().toString(36)}`;
    const row = {
      id, name, location,
      capacity_mw: capacityMW,
      total_panels: totalPanels,
      health_score: 100,
      daily_loss_inr: 0,
      daily_loss_kwh: 0,
      feed_in_tariff: 4.5,
      lat, lng,
    };
    let { data, error } = await supabase
      .from("plants")
      .insert({ ...row, client: client?.trim() || null })
      .select()
      .single();

    // Migration 006 (plants.client) not run on this project yet — save the
    // plant without the client name rather than failing Add Plant outright.
    if (error && (error.code === "PGRST204" || error.code === "42703")) {
      ({ data, error } = await supabase.from("plants").insert(row).select().single());
    }

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

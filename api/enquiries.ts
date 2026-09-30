import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { supabase } from "./_lib/supabase.js";
import { setCors } from "./_lib/cors.js";
import { getAuthUser } from "./_lib/auth.js";

// Vymanik Aerospace's WhatsApp number — plant owners are handed a click-to-chat
// link pre-filled with their enquiry, no WhatsApp Business API needed.
const WHATSAPP_NUMBER = "918182830960";

function buildWhatsAppLink(serviceName: string, plantName: string, name: string): string {
  const text = `Hi, I'm ${name}, regarding ${plantName}. I'd like to enquire about ${serviceName}.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await getAuthUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { plantId, plantName, serviceId, serviceName, name, phone, email, message } = (req.body ??
    {}) as {
    plantId?: string;
    plantName?: string;
    serviceId?: string;
    serviceName?: string;
    name?: string;
    phone?: string;
    email?: string;
    message?: string;
  };
  if (!plantId || !serviceId || !serviceName || !name?.trim() || !phone?.trim()) {
    return res
      .status(400)
      .json({ error: "plantId, serviceId, serviceName, name and phone are required" });
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
        ]
          .filter(Boolean)
          .join("\n"),
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

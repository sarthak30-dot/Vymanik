import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomInt } from "node:crypto";
import { supabase } from "../_lib/supabase.js";
import { setCors } from "../_lib/cors.js";
import { getAuthUser } from "../_lib/auth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[randomInt(chars.length)];
  return out;
}

/**
 * Creates a real Supabase Auth user for a client, scoped to the plants the
 * admin selects (stored in user_metadata.plantIds, read back by /api/auth/login).
 * Returns a one-time temporary password — there's no email delivery configured,
 * so the admin shares it with the client directly.
 *
 * Uses the same service-role SDK client as /api/team-members (which works in
 * production) rather than a hand-rolled fetch to /auth/v1/admin/users, so the
 * two admin flows can't drift apart on headers or key format.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await getAuthUser(req.headers.authorization);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });
  if (caller.role !== "admin") return res.status(403).json({ error: "Only admins can invite clients" });

  const body = (req.body ?? {}) as { name?: string; email?: string; plantIds?: string[] };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const plantIds = Array.isArray(body.plantIds) ? body.plantIds.filter(Boolean) : [];

  if (!name || !email || plantIds.length === 0) {
    return res.status(400).json({ error: "Name, email and at least one plant are required." });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: `"${email}" is not a valid email address.` });
  }
  if (email === caller.email?.toLowerCase()) {
    return res.status(409).json({
      error: "That's your own admin login. Use the client's email address. Each client needs a separate account.",
    });
  }

  const tempPassword = generateTempPassword();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: "client", plantIds, name },
  });

  if (error || !data?.user) {
    console.error("invite-client: createUser failed", { status: error?.status, code: error?.code, message: error?.message });
    const isDuplicate =
      error?.code === "email_exists" ||
      error?.status === 422 ||
      /already (been )?registered|already exists/i.test(error?.message ?? "");
    if (isDuplicate) {
      return res.status(409).json({
        error: `An account for ${email} already exists. Use a different email, or ask us to update that account's plant access.`,
      });
    }
    const status = error?.status && error.status >= 400 && error.status < 500 ? 400 : 500;
    return res.status(status).json({
      error: error?.message
        ? `Could not create client login: ${error.message}`
        : "Could not create client login. Please try again.",
    });
  }

  return res.status(201).json({
    userId: data.user.id,
    email,
    tempPassword,
  });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors } from "../_lib/cors";
import { getAuthUser } from "../_lib/auth";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Creates a real Supabase Auth user for a client, scoped to the plants the
 * admin selects (stored in user_metadata.plantIds, read back by /api/auth/login).
 * Returns a one-time temporary password — there's no email delivery configured,
 * so the admin shares it with the client directly.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await getAuthUser(req.headers.authorization);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });
  if (caller.role !== "admin") return res.status(403).json({ error: "Only admins can invite clients" });

  const { name, email, plantIds } = (req.body ?? {}) as {
    name?: string; email?: string; plantIds?: string[];
  };
  if (!name || !email || !plantIds?.length) {
    return res.status(400).json({ error: "name, email and at least one plantId are required" });
  }

  const tempPassword = generateTempPassword();

  let createRes: Response;
  try {
    createRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { role: "client", plantIds, name },
      }),
    });
  } catch (error) {
    console.error("Supabase admin create user error:", error);
    return res.status(500).json({ error: "Authentication service is currently unreachable." });
  }

  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({})) as { msg?: string; message?: string };
    const msg = body.msg ?? body.message ?? "Failed to create client account. The email may already be registered.";
    return res.status(createRes.status === 422 ? 409 : 500).json({ error: msg });
  }

  const created = await createRes.json() as { id: string };

  return res.status(201).json({
    userId: created.id,
    email,
    tempPassword,
  });
}

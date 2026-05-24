import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = (req.body ?? {}) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Call Supabase Auth — only users created in the Supabase Dashboard can sign in
  const authRes = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      body: JSON.stringify({ email, password }),
    },
  );

  if (!authRes.ok) {
    // Return a generic message — don't reveal whether the email exists
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const session = await authRes.json() as {
    access_token: string;
    expires_in: number;
    user: {
      id: string;
      email: string;
      user_metadata?: { role?: string; plantIds?: string[] };
      app_metadata?: { role?: string };
    };
  };

  // Role and plantIds are stored in user_metadata when the user is created
  const role = session.user.user_metadata?.role
    ?? session.user.app_metadata?.role
    ?? "client";

  const plantIds = session.user.user_metadata?.plantIds ?? ["plant-rajpur-1"];

  return res.status(200).json({
    token: session.access_token,
    expiresAt: new Date(Date.now() + session.expires_in * 1000).toISOString(),
    userId: session.user.id,
    role,
    plantIds,
  });
}

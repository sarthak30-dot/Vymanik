import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, role: requestedRole } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    role?: string;
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

  // Role is set in user_metadata when the user is created in Supabase Dashboard
  const accountRole = session.user.user_metadata?.role
    ?? session.user.app_metadata?.role
    ?? "client";

  // Admin accounts are super-users: they can log in via any role tab and will
  // receive a session scoped to the requested role (so they can experience each
  // portal). Non-admin accounts must use the tab that matches their stored role.
  const isAdmin = accountRole === "admin";
  if (requestedRole && requestedRole !== accountRole && !isAdmin) {
    return res.status(403).json({
      error: `This account does not have ${requestedRole} access. Please select the correct portal tab.`,
    });
  }

  // For admin users logging in via a non-admin tab, reflect the requested role
  // back so the frontend renders the correct portal experience.
  const role = (isAdmin && requestedRole) ? requestedRole : accountRole;

  const plantIds = session.user.user_metadata?.plantIds ?? ["plant-rajpur-1"];

  return res.status(200).json({
    token: session.access_token,
    expiresAt: new Date(Date.now() + session.expires_in * 1000).toISOString(),
    userId: session.user.id,
    role,
    plantIds,
  });
}

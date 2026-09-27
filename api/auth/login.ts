import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";

/**
 * TEMPORARY, auto-disabling demo login for running the portal without a
 * Supabase project connected.
 *
 * The whole app sits behind this endpoint, and everything a client reads is
 * served from the frontend's mock data, so the only thing a missing database
 * actually blocks is signing in. These three demo accounts let the site be
 * used on that mock data with no Supabase at all.
 *
 * AUTO-DISABLE: this fallback is only consulted when Supabase can't authorise
 * the request — either it isn't configured, or the Auth call is unreachable
 * (dead/paused project). The moment a working Supabase is connected, its Auth
 * server answers (a real user succeeds, a bad password 401s) and this map is
 * never reached, so real auth resumes on its own. Remove this block once
 * Supabase is back if you want no fallback at all. The credentials here are
 * the already-shared demo logins — treat this as demo access, not security.
 */
const DEMO_ACCOUNTS: Record<string, { password: string; role: "admin" | "team" | "client"; plantIds: string[] }> = {
  "admin@vymanikdemo.com":     { password: "Demo@2026", role: "admin",  plantIds: ["plant-001"] },
  "inspector@vymanikdemo.com": { password: "Demo@2026", role: "team",   plantIds: ["plant-001"] },
  "owner@block20demo.com":     { password: "Demo@2026", role: "client",  plantIds: ["plant-001"] },
};

function demoLogin(email: string, password: string, requestedRole: string | undefined, res: VercelResponse) {
  const acct = DEMO_ACCOUNTS[email.trim().toLowerCase()];
  if (!acct || acct.password !== password) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  // Same role-tab rule as real auth: admin can enter via any tab, others must
  // use their own tab.
  const isAdmin = acct.role === "admin";
  if (requestedRole && requestedRole !== acct.role && !isAdmin) {
    return res.status(403).json({
      error: `This account does not have ${requestedRole} access. Please select the correct portal tab.`,
    });
  }
  const role = (isAdmin && requestedRole) ? requestedRole : acct.role;
  // Opaque token — the frontend only checks that one exists; write endpoints
  // still validate against Supabase, so they stay unavailable (as expected)
  // until the database is reconnected.
  return res.status(200).json({
    token: `demo.${role}.${randomBytes(16).toString("hex")}`,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    userId: `demo-${email.trim().toLowerCase()}`,
    role,
    plantIds: acct.plantIds,
    demo: true,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN ?? "*");
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

  // No Supabase configured at all → demo login is the only path.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return demoLogin(email, password, requestedRole, res);
  }

  // Call Supabase Auth — only users created in the Supabase Dashboard can sign in
  let authRes: Response;
  try {
    authRes = await fetch(
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
  } catch (error) {
    // Supabase is configured but unreachable (e.g. a deleted/paused project).
    // Fall back to demo login so the site stays usable.
    console.error("Supabase connection error — using demo login fallback:", error);
    return demoLogin(email, password, requestedRole, res);
  }

  // A 5xx means the Auth service is down/unreachable → fall back to demo.
  // A 4xx means Supabase is alive and rejected the credentials → that's a real
  // rejection, so DON'T fall back (this is what auto-disables the demo path
  // once a working Supabase is connected).
  if (authRes.status >= 500) {
    console.error(`Supabase Auth returned ${authRes.status} — using demo login fallback.`);
    return demoLogin(email, password, requestedRole, res);
  }

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

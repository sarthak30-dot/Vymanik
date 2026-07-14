/**
 * Verifies a Supabase JWT from the Authorization header by calling the
 * Supabase Auth REST API directly.
 *
 * We use a raw fetch() instead of supabase.auth.getUser() because the SDK's
 * auth module can behave unexpectedly when the client is initialised with the
 * service_role key in a stateless serverless environment.
 */
export async function verifyAuth(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface AuthedUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Like verifyAuth, but also returns the caller's id/email/role so admin-only
 * routes (create plant, create team member, invite client) can check role
 * server-side rather than trusting the client.
 */
export async function getAuthUser(authHeader: string | undefined): Promise<AuthedUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      },
    });
    if (!res.ok) return null;
    const user = await res.json() as {
      id: string;
      email: string;
      user_metadata?: { role?: string };
      app_metadata?: { role?: string };
    };
    const role = user.user_metadata?.role ?? user.app_metadata?.role ?? "client";
    return { id: user.id, email: user.email, role };
  } catch {
    return null;
  }
}

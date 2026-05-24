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

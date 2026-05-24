import { supabase } from "./supabase";

/**
 * Verifies a Supabase JWT from the Authorization header.
 * Returns the Supabase user object if valid, null otherwise.
 *
 * Called on every protected API route so only real Supabase Auth
 * users (created in the Dashboard) can access data.
 */
export async function verifyAuth(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    // supabase.auth.getUser() can throw (not just return {error}) when given
    // a malformed token — wrap in try/catch so routes return 401, not 500.
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

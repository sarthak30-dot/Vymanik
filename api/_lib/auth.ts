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
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

import { supabase } from "./supabaseClient";

/**
 * Returns an Authorization header carrying the current agent's Supabase
 * access token, so protected /api/* routes can verify the caller. Empty
 * object when there's no session (the route will then answer 401).
 */
export async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

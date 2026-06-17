import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY client using the service role key. This bypasses RLS
 * entirely, so it must never be imported into any client component or
 * exposed to the browser. It is only used inside app/api/* route
 * handlers (which run on the server), after the caller's identity has
 * been verified with verifyAdmin() below.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Verifies that the bearer token belongs to a signed-in user whose
 * profile has role = 'admin'. Returns the admin's user id on success,
 * or null if verification fails for any reason.
 */
export async function verifyAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") return null;

  return userData.user.id;
}

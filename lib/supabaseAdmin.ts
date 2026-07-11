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
  const ctx = await verifyAdminContext(authHeader);
  return ctx?.id ?? null;
}

/**
 * Like verifyAdmin but also reports whether the caller is a super admin.
 * Sensitive actions (delete / deactivate / change role / touch another admin)
 * must be gated on `isSuper` in the ROUTE — the UI hiding buttons is not
 * enough, since the API can be called directly.
 */
export async function verifyAdminContext(
  authHeader: string | null
): Promise<{ id: string; isSuper: boolean } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role, is_super, is_active")
    .eq("id", userData.user.id)
    .single();

  // A deactivated admin loses admin powers immediately (not just at next login).
  if (profileError || !profile || profile.role !== "admin" || profile.is_active === false) return null;

  return { id: userData.user.id, isSuper: !!profile.is_super };
}

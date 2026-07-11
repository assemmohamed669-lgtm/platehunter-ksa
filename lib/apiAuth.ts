/**
 * apiAuth.ts — SERVER-ONLY guards for the /api/* route handlers.
 *
 * `verifySession` confirms the caller is a signed-in agent (any valid Supabase
 * session), so the endpoints that spend server-side API credits can't be hit
 * anonymously. `rateLimit` is a light in-memory limiter — per serverless
 * instance only (Vercel doesn't share memory across instances), so it's a
 * first layer against a single hammering client, not a hard global cap.
 */
import { supabaseAdmin } from "./supabaseAdmin";

/** Returns the caller's user id if the Bearer token is a valid session, else null. */
export async function verifySession(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Sliding-window counter keyed by "route:userId". Kept in module memory.
const _hits = new Map<string, number[]>();

/** True if this key is still under `limit` calls within `windowMs`; records the hit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (_hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    _hits.set(key, recent);
    return false;
  }
  recent.push(now);
  _hits.set(key, recent);
  return true;
}

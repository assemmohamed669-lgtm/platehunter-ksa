/**
 * apiAuth.ts — SERVER-ONLY guards for the /api/* route handlers.
 *
 * `verifySession` confirms the caller is a signed-in agent (any valid Supabase
 * session), so the endpoints that spend server-side API credits can't be hit
 * anonymously. `rateLimit` is a light in-memory limiter — per serverless
 * instance only (Vercel doesn't share memory across instances), so it's a
 * first layer against a single hammering client, not a hard global cap. The
 * real global limit belongs at the edge (Vercel Firewall rules).
 *
 * Both also RECORD the failure in the security log so a probe leaves a trace.
 * The `req` argument is optional so existing call sites keep working; passing
 * it just enriches the log with the path, IP and user-agent.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { logSecurityEvent, requestMeta } from "./securityLogServer";

/** أقل ما نحتاجه من الطلب — يقبل NextRequest أو Request عادي. */
interface ReqLike {
  url?: string;
  headers: { get(name: string): string | null };
}

function pathOf(req?: ReqLike): string | null {
  if (!req?.url) return null;
  try {
    return new URL(req.url).pathname;
  } catch {
    return null;
  }
}

/** Returns the caller's user id if the Bearer token is a valid session, else null. */
export async function verifySession(
  authHeader: string | null,
  req?: ReqLike
): Promise<string | null> {
  const deny = (reason: string): null => {
    const meta = req ? requestMeta(req) : { ip: null, userAgent: null };
    logSecurityEvent({
      type: "api_unauthorized",
      detail: `${pathOf(req) ?? "?"} — ${reason}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      // نخنق على المصدر + المسار: مهاجم بيضرب نفس الراوت = صف واحد كل دقيقة.
      throttleKey: `unauth:${meta.ip ?? "?"}:${pathOf(req) ?? "?"}`,
    });
    return null;
  };

  if (!authHeader?.startsWith("Bearer ")) return deny("no_token");
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return deny("empty_token");
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return deny("bad_token");
    // Deactivated accounts can't spend the server API keys.
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("is_active").eq("id", data.user.id).single();
    if (profile?.is_active === false) return deny("inactive_account");
    return data.user.id;
  } catch {
    return deny("verify_failed");
  }
}

// Sliding-window counter keyed by "route:userId". Kept in module memory.
const _hits = new Map<string, number[]>();

/** True if this key is still under `limit` calls within `windowMs`; records the hit. */
export function rateLimit(key: string, limit: number, windowMs: number, req?: ReqLike): boolean {
  const now = Date.now();
  const recent = (_hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    _hits.set(key, recent);
    const meta = req ? requestMeta(req) : { ip: null, userAgent: null };
    logSecurityEvent({
      type: "api_rate_limited",
      detail: `${pathOf(req) ?? key}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      throttleKey: `ratelimit:${key}`,
    });
    return false;
  }
  recent.push(now);
  _hits.set(key, recent);
  return true;
}

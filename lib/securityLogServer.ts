/**
 * securityLogServer — الكتابة الفعلية لسجل الأمان. **سيرفر فقط** (بيستورد
 * supabaseAdmin) — عمره ما يتستورد في مكوّن عميل.
 *
 * قاعدتين ملزمتين:
 *  ١) **عمره ما يرمي استثناء.** فشل التسجيل مايوقفش الطلب — أهون ألف مرة
 *     نفقد صف سجل من إننا نكسّر دخول مندوب.
 *  ٢) **عمره ما يتنطر (await).** الكتابة fire-and-forget فمابتزوّدش زمن الرد.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { createLogThrottle, type SecurityEventType } from "./securityLog";

// مرة كل دقيقة لكل مفتاح — يمنع مهاجم من إغراق الجدول.
const throttle = createLogThrottle(60_000);

export interface SecurityEventInput {
  type: SecurityEventType;
  agentId?: string | null;
  actorLabel?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  /** المسار أو اسم الإجراء. */
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** مفتاح الخنق — الافتراضي نوع+فاعل+تفصيل. */
  throttleKey?: string;
}

/** يستخرج الـIP والمتصفح من الطلب (Vercel بيحط x-forwarded-for). */
export function requestMeta(req: { headers: { get(n: string): string | null } }): {
  ip: string | null;
  userAgent: string | null;
} {
  try {
    const fwd = req.headers.get("x-forwarded-for");
    return {
      ip: (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || null,
      userAgent: (req.headers.get("user-agent") || "").slice(0, 300) || null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export function logSecurityEvent(e: SecurityEventInput): void {
  try {
    const key = e.throttleKey ?? `${e.type}:${e.agentId ?? e.ip ?? "?"}:${e.detail ?? ""}`;
    const decision = throttle.allow(key, Date.now());
    if (!decision.log) return;

    void supabaseAdmin
      .from("security_events")
      .insert({
        type: e.type,
        agent_id: e.agentId ?? null,
        actor_label: e.actorLabel ?? null,
        target_id: e.targetId ?? null,
        target_label: e.targetLabel ?? null,
        detail: e.detail ?? null,
        suppressed: decision.suppressed,
        ip: e.ip ?? null,
        user_agent: e.userAgent ?? null,
      })
      .then(
        ({ error }) => { if (error) console.error("security log failed:", error.message); },
        (err) => { console.error("security log threw:", err instanceof Error ? err.message : err); }
      );
  } catch (err) {
    console.error("security log threw:", err instanceof Error ? err.message : err);
  }
}

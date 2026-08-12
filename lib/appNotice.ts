/**
 * appNotice — رسالة الأدمن المؤقتة في شريط البرنامج.
 *
 * الأدمن بيكتب رسالة من لوحة الأدمن ويحدد مدتها (يوم/يومين/…)، وبتظهر لكل
 * المناديب في **أي صفحة** يفتحوها. بتختفي لوحدها لما المدة تخلص، أو لما
 * الأدمن يشيلها بنفسه.
 *
 * المندوب يقدر يقفلها بـ✕ عشان ماتزنّقهوش وهو شغّال — بس بترجع تظهرله في
 * **أول تسجيل دخول جديد** طول ما هي لسه سارية (بطلب المندوب: «كل مرة يعمل
 * فيها تسجيل دخول تظهرله»). عشان كده الإغلاق بيتخزّن محلياً وبيتمسح وقت
 * تسجيل الدخول.
 *
 * محتاج تشغيل SQL مرة واحدة: docs/sql/app-notice.sql
 */

/** مفتاح تخزين الرسائل اللي المندوب قفلها (بيتمسح كل تسجيل دخول). */
export const DISMISS_KEY = "ph:noticeDismissed";

export interface AppNotice {
  text: string;
  /** وقت النشر (ISO) — جزء من هوية الرسالة. */
  at: string | null;
  /** وقت الانتهاء (ISO)، أو null = من غير مدة. */
  until: string | null;
}

/** مدد الظهور اللي الأدمن بيختار منها. 0 = من غير مدة. */
export const NOTICE_DURATIONS: { label: string; hours: number }[] = [
  { label: "ساعة", hours: 1 },
  { label: "٦ ساعات", hours: 6 },
  { label: "يوم", hours: 24 },
  { label: "يومين", hours: 48 },
  { label: "من غير مدة", hours: 0 },
];

/** شكل الصف الراجع من `get_app_notice`. */
interface NoticeRow {
  notice_text?: string | null;
  notice_at?: string | null;
  notice_until?: string | null;
}

/**
 * بيحسم الرسالة السارية من رد السيرفر. بيرجّع null لو مفيش نص أو المدة خلصت.
 * (السيرفر بيفلتر المنتهية كمان — الفحص هنا حماية إضافية لو الجهاز فضل فاتح.)
 */
export function resolveNotice(raw: unknown, now: number = Date.now()): AppNotice | null {
  const row = (Array.isArray(raw) ? raw[0] : raw) as NoticeRow | null | undefined;
  const text = String(row?.notice_text ?? "").trim();
  if (!text) return null;

  const until = row?.notice_until ?? null;
  if (until) {
    const end = Date.parse(until);
    if (Number.isFinite(end) && end <= now) return null;
  }
  return { text, at: row?.notice_at ?? null, until };
}

/** هوية الرسالة — لو النص أو وقت النشر اتغيّر تبقى رسالة جديدة وتظهر تاني. */
export function noticeKey(n: AppNotice): string {
  return `${n.at ?? ""}|${n.text}`;
}

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch { return []; }
}

export function isNoticeDismissed(key: string): boolean {
  return readDismissed().includes(key);
}

export function dismissNotice(key: string): void {
  try {
    const next = [...new Set([...readDismissed(), key])].slice(-5);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch { /* تخزين معطّل — الرسالة هتفضل ظاهرة، مش مشكلة */ }
}

/** بتتنده وقت تسجيل الدخول — فالرسالة السارية تظهر للمندوب من جديد. */
export function clearNoticeDismissals(): void {
  try { localStorage.removeItem(DISMISS_KEY); } catch { /* تخزين معطّل */ }
}

/** يقرا الرسالة السارية (لأي مستخدم مسجّل). null لو مفيش/فشل. */
export async function fetchAppNotice(): Promise<AppNotice | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_app_notice");
    if (error) return null;
    return resolveNotice(data);
  } catch { return null; }
}

/**
 * ينشر رسالة أو يشيلها (نص فاضي = مسح). الأدمن فقط — الدالة على السيرفر
 * بتتحقق من الصلاحية.
 */
export async function setAppNotice(text: string, hours: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.rpc("set_app_notice", { p_text: text, p_hours: hours });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

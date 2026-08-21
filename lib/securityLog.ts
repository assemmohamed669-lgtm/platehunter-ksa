/**
 * securityLog — تسجيل الأحداث الأمنية المشبوهة عشان السوبر أدمن يشوف
 * مين بيحاول يوصل للتطبيق بلا تصريح.
 *
 * ليه الخنق (throttle): مهاجم بيضرب راوت ألف مرة في الدقيقة يبقى ألف صف —
 * يعني إحنا اللي عملنا هجوم على داتابيزنا بنفسنا، والحدث المهم يغرق في
 * التكرار. فنفس المفتاح مايتسجّلش أكتر من مرة كل فترة، والمحاولات اللي
 * اتخنقت بتتعدّ وتتسجّل مع الصف اللي بعده (فمفيش معلومة بتضيع).
 *
 * الكتابة الفعلية للجدول بتحصل على السيرفر بمفتاح الخدمة — **مش** بدالة
 * جديدة مكشوفة على الـAPI. المنطق هنا نقي وقابل للاختبار لوحده.
 */

/** أنواع الأحداث المسموحة. قايمة مقفولة عشان السجل يفضل قابل للفلترة. */
export const SECURITY_EVENT_TYPES = [
  "api_unauthorized",       // نداء API بتوكن باطل أو بلا توكن
  "api_rate_limited",       // تعدّى حد الاستهلاك
  "login_device_mismatch",  // دخول بحساب مربوط بجهاز تاني
  "login_account_disabled", // دخول بحساب موقوف
  "login_cut_off",          // دخول بحساب اشتراكه انتهى
  "admin_action",           // إجراء أدمن (مين عمل إيه لمين)
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/**
 * الأحداث اللي **العميل** مسموح له يبلّغ عنها. أحداث السيرفر (خصوصاً
 * admin_action) ممنوعة من العميل تماماً — وإلا أي مندوب يقدر يحشو سجل
 * التدقيق بصفوف كاذبة تلبّس أدمن أو تغرق الأحداث الحقيقية.
 */
const CLIENT_REPORTABLE: readonly string[] = [
  "login_device_mismatch",
  "login_account_disabled",
  "login_cut_off",
];

export function isClientReportable(t: unknown): boolean {
  return typeof t === "string" && CLIENT_REPORTABLE.includes(t);
}

export function isKnownEventType(t: unknown): boolean {
  return typeof t === "string" && (SECURITY_EVENT_TYPES as readonly string[]).includes(t);
}

/** أقصى عدد مفاتيح في الذاكرة — مهاجم بيغيّر IP كل طلب مايملّيش الذاكرة. */
const MAX_KEYS = 2000;

export interface ThrottleDecision {
  /** نسجّل الصف ده؟ */
  log: boolean;
  /** عدد المحاولات اللي اتخنقت (بتنزل مع الصف اللي بيتسجّل). */
  suppressed: number;
}

/**
 * يبني خانق تسجيل: نفس المفتاح يتسجّل مرة كل `windowMs`.
 * @param windowMs الفترة بين تسجيلين لنفس المفتاح.
 */
export function createLogThrottle(windowMs: number) {
  /** key → { at: وقت آخر تسجيل, n: عدد اللي اتخنق بعده } */
  const seen = new Map<string, { at: number; n: number }>();

  function prune(now: number) {
    // نشيل اللي فترته خلصت خلاص — مش محتاجينه، ومفيش معلومة بتضيع لأن
    // عدّاد الخنق بيتسجّل مع الصف اللي قبله.
    for (const [k, v] of seen) {
      if (now - v.at >= windowMs) seen.delete(k);
      if (seen.size <= MAX_KEYS / 2) break;
    }
  }

  return {
    allow(key: string, now: number): ThrottleDecision {
      const prev = seen.get(key);
      if (!prev) {
        if (seen.size >= MAX_KEYS) prune(now);
        seen.set(key, { at: now, n: 0 });
        return { log: true, suppressed: 0 };
      }
      if (now - prev.at < windowMs) {
        prev.n += 1;
        return { log: false, suppressed: prev.n };
      }
      // الفترة خلصت: نسجّل، ونرفق عدد اللي اتخنق فيها.
      const suppressed = prev.n;
      seen.set(key, { at: now, n: 0 });
      return { log: true, suppressed };
    },
    size() {
      return seen.size;
    },
  };
}

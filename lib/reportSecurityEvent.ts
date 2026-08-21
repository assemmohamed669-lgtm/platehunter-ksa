/**
 * تبليغ عن حدث أمني من العميل (فشل دخول مشبوه).
 *
 * **عمره ما يرمي، وعمره ما يعطّل الدخول.** فيه مهلة قصيرة عشان شبكة واقفة
 * ماتأخّرش رسالة الخطأ اللي المندوب مستنيها.
 */
const TIMEOUT_MS = 1500;

export async function reportSecurityEvent(type: string): Promise<void> {
  try {
    const { authHeader } = await import("./authHeader");
    const h = await authHeader();
    // مفيش توكن = مفيش حاجة نبلّغ بيها (ومفيش هوية نربط الحدث بيها).
    if (!("Authorization" in h)) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      await fetch("/api/security-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({ type }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch { /* التسجيل مايعطّلش المندوب */ }
}

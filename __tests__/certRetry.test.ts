import { describe, it, expect } from "vitest";
import { certRetryDelayMs, CERT_RETRY_DELAYS_MS } from "@/lib/certificateBatch";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⏳ الشهايد: استنى وأعد بدل ما ترمي الطلب
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٧ أكتوبر ٢٠٢٦): سجل الأمان فيه «تعدّى حد الاستهلاك» على خدمة
 *  الشهايد الجماعية. الحد ٢٠ طلب/دقيقة لكل مندوب، والعميل كان بيرمي الدفعات
 *  **كلها مرة واحدة**، فاللي بيترفض كان بيتحوّل لـ«تعذّر» والمندوب يشوف عمود
 *  شهايد ناقص من غير ما يعرف ليه.
 *
 *  دلوقتي الرفض (429) بيستنى ويعيد. والسيرفر بيبعت `Retry-After` بالثواني،
 *  فبنحترمه لو أطول من انتظارنا.
 */
describe("انتظار إعادة المحاولة", () => {
  it("بيتدرّج: كل محاولة تستنى أطول من اللي قبلها", () => {
    const d0 = certRetryDelayMs(0, null);
    const d1 = certRetryDelayMs(1, null);
    const d2 = certRetryDelayMs(2, null);
    expect(d0).not.toBeNull();
    expect(d1!).toBeGreaterThan(d0!);
    expect(d2!).toBeGreaterThan(d1!);
  });

  it("خلصت المحاولات ⇒ null (نوقف ونعلّم «تعذّر»)", () => {
    expect(certRetryDelayMs(CERT_RETRY_DELAYS_MS.length, null)).toBeNull();
    expect(certRetryDelayMs(99, null)).toBeNull();
  });

  it("السيرفر قال استنى ٤٥ ثانية ⇒ نحترمه لو أطول من انتظارنا", () => {
    expect(certRetryDelayMs(0, "45")).toBe(45_000);
  });

  it("السيرفر قال ثانية واحدة ⇒ ناخد الأطول (انتظارنا) مش الأقصر", () => {
    expect(certRetryDelayMs(0, "1")).toBe(CERT_RETRY_DELAYS_MS[0]);
  });

  it("ترويسة بايظة أو مش موجودة ⇒ انتظارنا العادي", () => {
    expect(certRetryDelayMs(0, null)).toBe(CERT_RETRY_DELAYS_MS[0]);
    expect(certRetryDelayMs(0, "")).toBe(CERT_RETRY_DELAYS_MS[0]);
    expect(certRetryDelayMs(0, "بكرة")).toBe(CERT_RETRY_DELAYS_MS[0]);
    expect(certRetryDelayMs(0, "-5")).toBe(CERT_RETRY_DELAYS_MS[0]);
  });

  it("🔒 مانستناش أكتر من ٣ دقايق مهما قال السيرفر — المندوب مستني النتيجة", () => {
    expect(certRetryDelayMs(0, "99999")).toBe(180_000);
  });
});

import { describe, it, expect } from "vitest";
import {
  canOpenTrialPage, planTrialRun, resolveTrialEndpoint,
  TRIAL_MODEL_BASE, TRIAL_MODEL_TOKEN,
} from "../lib/trialModelGate";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  صفحة «التسجيل الجديد (تجربة)» — مين يفتحها، وإمتى تشتغل
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٢ سبتمبر ٢٠٢٦): «شيل اللي فيه وحط الجديد بتاعنا مكانه علشان
 *  أجربه، وعايزها تبقى مفتوحة **للأدمنز فقط**».
 *
 *  ── ليه الاتنين في ملف واحد نقي ───────────────────────────────────────
 *  الصفحة مكوّن React ومالهاش اختبار، فالقرارين الحسّاسين اتشالوا برّه:
 *    ① **مين يفتح** — حدّ صلاحية. مافيش عمود `is_admin` في `profiles`؛
 *       الأدمن = `role === "admin"` (٢٠ استخدام في الريبو) والسوبر أدمن
 *       علم منفصل `is_super`.
 *    ② **إمتى تشتغل** — الصفحة بتشتغل على محركين: المحرك العام بيلاقي
 *       **مواقع** اللوحات، وموديلنا **بيقرا كل لوحة**. لو موديلنا مش
 *       متاح، `runBatchTranscription` بيرجّع `usedModel:false` والنتيجة
 *       بتطلع من النص العام **من غير ما حد ياخد باله**.
 *
 *  🔴 وده بالظبط اللي بيبطّل التجربة: المالك بيجرّب «موديلنا الجديد» وهو
 *     شايف نتيجة المحرك العام. التجربة لازم **ترفض تشتغل** بلا موديلنا.
 */

describe("canOpenTrialPage — للأدمنز", () => {
  it("الأدمن يفتح", () => {
    expect(canOpenTrialPage({ role: "admin", is_super: false })).toBe(true);
  });

  it("السوبر أدمن يفتح كمان (مالكش معنى تقفلها عليه)", () => {
    expect(canOpenTrialPage({ role: "agent", is_super: true })).toBe(true);
  });

  it("🔴 المندوب العادي **مايفتحش**", () => {
    expect(canOpenTrialPage({ role: "agent", is_super: false })).toBe(false);
    expect(canOpenTrialPage({ role: "leader", is_super: false })).toBe(false);
    expect(canOpenTrialPage({ role: "member", is_super: false })).toBe(false);
    expect(canOpenTrialPage({ role: "off", is_super: false })).toBe(false);
  });

  it("🔴 بروفايل ناقص/بايظ = **مقفول** — الفشل بيقفل مش بيفتح", () => {
    expect(canOpenTrialPage(null)).toBe(false);
    expect(canOpenTrialPage(undefined)).toBe(false);
    expect(canOpenTrialPage({})).toBe(false);
    expect(canOpenTrialPage({ role: null, is_super: null })).toBe(false);
    expect(canOpenTrialPage({ role: "Admin", is_super: false })).toBe(false);   // حسّاس لحالة الحروف
  });
});

describe("planTrialRun — ماتشتغلش بلا موديلنا", () => {
  it("عنوان + توكن = تشتغل", () => {
    expect(planTrialRun({ base: "https://x.example", token: "t" })).toEqual({ ok: true });
  });

  it("🔴 بلا عنوان = **رفض** برسالة تقول السبب", () => {
    const r = planTrialRun({ base: null, token: "t" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("no_base");
    expect(r.ok === false && r.message.length).toBeGreaterThan(10);
  });

  it("🔴 بلا توكن = **رفض**", () => {
    const r = planTrialRun({ base: "https://x.example", token: "" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("no_token");
  });

  it("فراغات لوحدها = مافيش", () => {
    expect(planTrialRun({ base: "   ", token: "t" }).ok).toBe(false);
    expect(planTrialRun({ base: "https://x.example", token: "   " }).ok).toBe(false);
  });

  it("🔴 عنوان مش https = رفض (التطبيق https والمتصفّح هيمنعه)", () => {
    const r = planTrialRun({ base: "http://x.example", token: "t" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("not_https");
  });
});

describe("resolveTrialEndpoint — سيرفر التجربة مثبّت في البرنامج", () => {
  /**
   * المالك (٢٢ سبتمبر): «ثبّت الجديد اللي على سيرفر ماليزيا في البرنامج في
   * صفحة التسجيل الجديد تجربة». يعني يفتح الصفحة ويلاقيها موصّلة — من غير ما
   * ينسخ عنوان ويلزقه كل مرة.
   *
   * بس **الإعداد اليدوي لازم يفضل يغلب**: النفق السريع بيتغيّر مع كل إعادة
   * تشغيل (توثيق Vast: «ephemeral … lost on restart — don't depend on them»)،
   * فلو العنوان المثبّت بايظ لازم يقدر يحطّ الجديد من غير ما ننشر نسخة.
   */
  it("مافيش محفوظ ⇒ سيرفر ماليزيا المثبّت", () => {
    expect(resolveTrialEndpoint(null)).toEqual({ base: TRIAL_MODEL_BASE, token: TRIAL_MODEL_TOKEN });
    expect(resolveTrialEndpoint({})).toEqual({ base: TRIAL_MODEL_BASE, token: TRIAL_MODEL_TOKEN });
  });

  it("🔴 المحفوظ يدوياً **يغلب** المثبّت", () => {
    expect(resolveTrialEndpoint({ base: "https://other.example", token: "tk" }))
      .toEqual({ base: "https://other.example", token: "tk" });
  });

  it("محفوظ ناقص ⇒ الناقص بس يتاخد من المثبّت", () => {
    expect(resolveTrialEndpoint({ base: "https://other.example", token: "" }))
      .toEqual({ base: "https://other.example", token: TRIAL_MODEL_TOKEN });
    expect(resolveTrialEndpoint({ base: "  ", token: "tk" }))
      .toEqual({ base: TRIAL_MODEL_BASE, token: "tk" });
  });

  it("المثبّت نفسه لازم يعدّي حارس التشغيل (https + توكن)", () => {
    expect(planTrialRun(resolveTrialEndpoint(null))).toEqual({ ok: true });
  });
});

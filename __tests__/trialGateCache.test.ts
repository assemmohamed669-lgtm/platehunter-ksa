import { describe, it, expect, beforeEach } from "vitest";
import { rememberTrialGate, cachedTrialGate, forgetTrialGate } from "@/lib/trialGateCache";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «الجديد» تقيلة لما بروح عليها — الصلاحية بتتفتكر طول ما التطبيق مفتوح
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «صفحة الجديد لما بروح عليها بتبقى تقيلة شوي،
 *  خليها أسرع». كل فتحة كانت بتستنى **٣ نداءات شبكة ورا بعض** (المستخدم ←
 *  البروفايل ← التوكن) قبل ما ترسم أي حاجة — «جارٍ التحقق…».
 *
 *  الحل: أول فتحة بتسأل، والرجوع بيرسم **على طول** من اللي اتفتكر، وبيتأكد
 *  في الخلفية. الذاكرة بس (مش تخزين الجهاز) — التطبيق يتقفل تتنسي.
 */
describe("trialGateCache", () => {
  beforeEach(() => forgetTrialGate());

  it("مافيش حاجة محفوظة في الأول", () => {
    expect(cachedTrialGate("u1")).toBeNull();
  });

  it("بيرجّع اللي اتحفظ لنفس المستخدم", () => {
    rememberTrialGate("u1", { isSuper: true, token: "t" });
    expect(cachedTrialGate("u1")).toEqual({ isSuper: true, token: "t" });
  });

  it("🔴 مستخدم تاني على نفس الجهاز مايورثش صلاحية اللي قبله", () => {
    rememberTrialGate("u1", { isSuper: true, token: "t" });
    expect(cachedTrialGate("u2")).toBeNull();
  });

  it("مافيش معرّف ⇒ مافيش كاش", () => {
    rememberTrialGate("u1", { isSuper: false, token: "t" });
    expect(cachedTrialGate(null)).toBeNull();
    expect(cachedTrialGate("")).toBeNull();
    rememberTrialGate("", { isSuper: true, token: "t" });
    expect(cachedTrialGate("")).toBeNull();
  });

  it("النسيان بيمسح (الصلاحية اتقفلت)", () => {
    rememberTrialGate("u1", { isSuper: false, token: "t" });
    forgetTrialGate();
    expect(cachedTrialGate("u1")).toBeNull();
  });

  it("نسخة واحدة بس — الحفظ الجديد بيستبدل", () => {
    rememberTrialGate("u1", { isSuper: false, token: "a" });
    rememberTrialGate("u2", { isSuper: true, token: "b" });
    expect(cachedTrialGate("u1")).toBeNull();
    expect(cachedTrialGate("u2")).toEqual({ isSuper: true, token: "b" });
  });

  it("المرجَّع نسخة — تعديله مايغيّرش المحفوظ", () => {
    rememberTrialGate("u1", { isSuper: false, token: "a" });
    const got = cachedTrialGate("u1")!;
    got.isSuper = true;
    expect(cachedTrialGate("u1")!.isSuper).toBe(false);
  });
});

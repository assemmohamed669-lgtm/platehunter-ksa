/**
 * سيناريو المالك بالحرف: مندوب مشترك في **الصوت لتاريخ ١** و**باقي البرنامج
 * لتاريخ ٥**. لما يعدّي تاريخ ١ لازم الصوت **بس** يتقفل والباقي يفضل شغّال،
 * والعكس — والحساب مايتقفلش كله غير لما الاتنين يعدّوا.
 *
 * الاختبار ده بيجمع التلات قرارات اللي بتتاخد في أماكن مختلفة في البرنامج:
 *   • تبويب الصوت      → voiceTabVisible (lib/voiceAccess)
 *   • باقي الصفحات     → rest_pages_enabled && serviceActive(rest_until)
 *   • قفل الحساب كله   → isCutOff(subscription_end)
 * عشان أي تعديل في واحدة فيهم مايكسرش الاتنين التانيين في صمت.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { serviceActive, isCutOff, maxDate } from "@/lib/subscription";
import { voiceTabVisible } from "@/lib/voiceAccess";

const VOICE_END = "2026-09-01";   // «تاريخ ١»
const REST_END = "2026-09-05";    // «تاريخ ٥»

/** حالة المندوب زي ما البرنامج بيقراها من profiles. */
function agent(voiceUntil: string | null, restUntil: string | null) {
  const profile = {
    voicex_enabled: true,
    is_super: false,
    voicex_until: voiceUntil,
    rest_pages_enabled: true,
    rest_until: restUntil,
    // تاريخ الحساب العام = الأبعد فيهم — ده اللي بيكتبه extendVoice/extendRest
    subscription_end: maxDate(voiceUntil, restUntil),
    is_active: true,
  };
  return {
    voice: voiceTabVisible(profile, null),
    rest: profile.rest_pages_enabled !== false && serviceActive(profile.rest_until),
    accountCutOff: isCutOff(profile.subscription_end, profile.is_active, 0),
  };
}

function today(d: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${d}T09:00:00`));
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("الصوت لتاريخ ١ وباقي البرنامج لتاريخ ٥", () => {
  it("قبل الاتنين — كله شغّال", () => {
    today("2026-08-25");
    expect(agent(VOICE_END, REST_END)).toEqual({ voice: true, rest: true, accountCutOff: false });
  });

  it("يوم ١ نفسه لسه شغّال (آخر يوم محسوب للمشترك)", () => {
    today(VOICE_END);
    expect(agent(VOICE_END, REST_END).voice).toBe(true);
  });

  it("بعد يوم ١ — الصوت اتقفل، باقي البرنامج شغّال، الحساب مفتوح", () => {
    today("2026-09-02");
    expect(agent(VOICE_END, REST_END)).toEqual({ voice: false, rest: true, accountCutOff: false });
  });

  it("بعد يوم ٥ — الاتنين خلصوا، الحساب يتقفل", () => {
    today("2026-09-06");
    expect(agent(VOICE_END, REST_END)).toEqual({ voice: false, rest: false, accountCutOff: true });
  });
});

describe("العكس — باقي البرنامج بيخلص الأول", () => {
  it("بعد يوم باقي البرنامج — الصفحات تتقفل والصوت يفضل شغّال", () => {
    today("2026-09-02");
    expect(agent(REST_END, VOICE_END)).toEqual({ voice: true, rest: false, accountCutOff: false });
  });

  it("والحساب مايتقفلش طول ما الصوت سارٍ", () => {
    today("2026-09-04");
    expect(agent(REST_END, VOICE_END).accountCutOff).toBe(false);
  });
});

describe("حالات على الحافة", () => {
  it("تاريخ فاضي = بلا حد (حسابات قديمة قبل الفصل)", () => {
    today("2030-01-01");
    expect(serviceActive(null)).toBe(true);
    expect(agent(null, null).voice).toBe(true);
  });

  it("subscription_end لازم يبقى الأبعد — وإلا الحساب هيتقفل والخدمة لسه سارية", () => {
    // ده الشرط اللي المنطق كله قايم عليه؛ extendVoice/extendRest بيكتبوه كده.
    expect(maxDate(VOICE_END, REST_END)).toBe(REST_END);
    expect(maxDate(REST_END, VOICE_END)).toBe(REST_END);
    expect(maxDate(VOICE_END, null)).toBe(VOICE_END);
    expect(maxDate(null, REST_END)).toBe(REST_END);
  });

  it("القفل اليدوي بيغلب التاريخ السارٍ", () => {
    today("2026-08-25");
    expect(voiceTabVisible({ voicex_enabled: false, is_super: false, voicex_until: REST_END }, null)).toBe(false);
  });

  it("السوبر أدمن مش متأثّر بأي تاريخ", () => {
    today("2030-01-01");
    expect(voiceTabVisible({ voicex_enabled: false, is_super: true, voicex_until: VOICE_END }, null)).toBe(true);
  });
});

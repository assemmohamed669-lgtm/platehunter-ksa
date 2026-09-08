import { describe, it, expect } from "vitest";
import { voiceTabVisible } from "@/lib/voiceAccess";

/**
 * تبويب «صوتي» في صفحة التشييك بقى يظهر **بس** للمندوب اللي الصوت مفعّل عنده
 * (`voicex_enabled`). اللي مقفول عنده مايشوفش التبويب خالص.
 *
 * الحتة الحسّاسة هي **قبل** ما رد السيرفر يوصل، أو لما المندوب يبقى أوفلاين:
 *  • لو أظهرناه افتراضياً → المقفول عنده يلمحه ويدوس عليه.
 *  • لو خبّيناه افتراضياً → المسموح له بيفقد الصوت كل ما يفتح البرنامج أوفلاين،
 *    وهو أهم شغل عنده.
 * الحل: آخر قيمة معروفة متخزّنة على الجهاز هي المرجع لما السيرفر مايردّش.
 */
describe("voiceTabVisible — مين يشوف تبويب صوتي", () => {
  it("الصوت مفعّل → يظهر", () => {
    expect(voiceTabVisible({ voicex_enabled: true }, null)).toBe(true);
  });

  it("الصوت مقفول → يختفي", () => {
    expect(voiceTabVisible({ voicex_enabled: false }, null)).toBe(false);
  });

  it("السوبر أدمن (المالك) دايماً يشوفه", () => {
    expect(voiceTabVisible({ voicex_enabled: false, is_super: true }, null)).toBe(true);
  });

  it("العلم مش موجود في الصف (حساب قديم) = مقفول", () => {
    expect(voiceTabVisible({}, null)).toBe(false);
  });

  it("🔌 أوفلاين/فشل القراءة → آخر قيمة معروفة على الجهاز", () => {
    expect(voiceTabVisible(null, true)).toBe(true);    // كان مفتوح له → يفضل شغّال
    expect(voiceTabVisible(null, false)).toBe(false);  // كان مقفول → يفضل مخفي
  });

  it("أوفلاين ومافيش قيمة محفوظة (أول تشغيل) → مخفي", () => {
    expect(voiceTabVisible(null, null)).toBe(false);
  });

  it("رد السيرفر بيكسب على المحفوظ — القفل بيوصل فوراً", () => {
    expect(voiceTabVisible({ voicex_enabled: false }, true)).toBe(false);
    expect(voiceTabVisible({ voicex_enabled: true }, false)).toBe(true);
  });
});

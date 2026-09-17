import { describe, it, expect } from "vitest";
import { incomingExcelOptions, VOICE_REFERRAL_SLOT } from "@/lib/incomingExcel";

/**
 * لما المندوب يفتح ملف إكسيل من واتساب، التطبيق بيسأله ينزل فين.
 *
 * المشترك **صوت-فقط** كان بيتعرضله نفس خيارات صفحة الفرز — وهي مقفولة عنده.
 * فكان بيختار «إحالة» فالملف يتحفظ في سلوت صفحة الفرز، والتبويب بتاعه بيقرا من
 * سلوت تاني خالص ⇒ **الخانة تفضل فاضية** وهو مش فاهم ليه.
 *
 * المطلوب: المشترك صوت-فقط يشوف **خيارين بس** — تشييك وإحالة — والإحالة تروح
 * للسلوت الصح. وباقي المشتركين زي ما هم بالظبط.
 */
describe("incomingExcelOptions", () => {
  it("مشترك صوت-فقط: خيارين بس", () => {
    const opts = incomingExcelOptions({ voiceOnly: true, nextReferralNum: null });
    expect(opts.map((o) => o.slot)).toEqual(["check", VOICE_REFERRAL_SLOT]);
  });

  it("مشترك صوت-فقط: الإحالة بتروح للسلوت اللي تبويبه بيقرا منه", () => {
    const opts = incomingExcelOptions({ voiceOnly: true, nextReferralNum: null });
    const ref = opts.find((o) => o.slot === VOICE_REFERRAL_SLOT)!;
    expect(ref.slot).toBe("voice-referral");
    expect(ref.goTab).toBe("sort");
  });

  it("مشترك صوت-فقط: مافيش خيار «داتا» ولا إحالة إضافية", () => {
    const opts = incomingExcelOptions({ voiceOnly: true, nextReferralNum: 2 });
    expect(opts.map((o) => o.slot)).toEqual(["check", VOICE_REFERRAL_SLOT]);
  });

  it("باقي المشتركين: الخيارات زي ما هي (داتا · إحالة · تشييك)", () => {
    const opts = incomingExcelOptions({ voiceOnly: false, nextReferralNum: null });
    expect(opts.map((o) => o.slot)).toEqual(["data", "referral", "check"]);
  });

  it("باقي المشتركين: خيار الإحالة الإضافية بيظهر لو فيه إحالة أساسية", () => {
    const opts = incomingExcelOptions({ voiceOnly: false, nextReferralNum: 3 });
    expect(opts.map((o) => o.slot)).toEqual(["data", "referral", "referral-3", "check"]);
  });

  it("كل خيار ليه اسم وشرح — مافيش زرار بلا كلام", () => {
    for (const voiceOnly of [true, false]) {
      for (const o of incomingExcelOptions({ voiceOnly, nextReferralNum: 2 })) {
        expect(o.label.length).toBeGreaterThan(0);
        expect(o.hint.length).toBeGreaterThan(0);
      }
    }
  });
});

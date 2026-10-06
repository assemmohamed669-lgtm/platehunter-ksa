import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { incomingExcelOptions, incomingOptionTone, VOICE_REFERRAL_SLOT } from "@/lib/incomingExcel";

/**
 * 🎨 «افتح الملف في» (ملف إكسيل جاي من واتساب) — المالك (٦ أكتوبر ٢٠٢٦): «ملف داتا وملف داتا اضافي لون
 * المربعين دول بالاخضر علشان يبان عند المندوب ان الاخضر ل ملفات الداتا · ومربعين ملف الاحاله وملف
 * الاحاله الاضافيه لونهم بلون احمر فاتح · وملف التشييك لونه بلون تركوازي».
 */
describe("🔴 لون كل مربع", () => {
  it("🔴 الداتا والداتا الإضافي أخضر · الإحالة والإحالة الإضافية أحمر فاتح · التشييك تركوازي", () => {
    const opts = incomingExcelOptions({ voiceOnly: false, nextReferralNum: 2, nextDataNum: 2 });
    expect(opts.map((o) => [o.slot, incomingOptionTone(o.slot)])).toEqual([
      ["data", "data"], ["data-2", "data"], ["referral", "referral"], ["referral-2", "referral"], ["check", "check"],
    ]);
  });
  it("🔴 مشتركين الصوت فقط: خانة التشييك تركوازي وخانة الإحالة أحمر فاتح", () => {
    const opts = incomingExcelOptions({ voiceOnly: true, nextReferralNum: null });
    expect(opts.map((o) => incomingOptionTone(o.slot))).toEqual(["check", "referral"]);
    expect(incomingOptionTone(VOICE_REFERRAL_SLOT)).toBe("referral");
  });
  it("🔴 المربعات بتاخد ألوانها في الشاشة", () => {
    const c = readFileSync("components/IncomingExcelHandler.tsx", "utf8");
    expect(c).toMatch(/incomingOptionTone\(o\.slot\)/);
    expect(c).toMatch(/data: \{[^}]*green/);
    expect(c).toMatch(/referral: \{[^}]*red-/);
    expect(c).toMatch(/check: \{[^}]*teal-/);
  });
});

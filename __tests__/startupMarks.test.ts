import { describe, it, expect } from "vitest";
import { startupBreakdown, type Mark } from "../lib/startupMarks";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  قياس «بدء التسجيل بيأخر»
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (٢٣ سبتمبر ٢٠٢٦): «لما بدوس ابدأ التسجيل بيأخر على ما
 *  بيبدأ التسجيل».
 *
 *  🔴 **التخمين هنا غالي**: فيه تلات مشتبهين (تحليل شيت التشييك · تحميل
 *  شنك المحرّك · فتح المايك) وكل واحد علاجه مختلف. فبدل ما نصلّح واحد
 *  ونستنى رد، بنقيس التلاتة ونعرض الأرقام — نفس أسلوب باقي الصفحة.
 */
describe("startupBreakdown", () => {
  const marks: Mark[] = [
    { label: "المحرّك", at: 100 },
    { label: "المايك", at: 900 },
    { label: "جاهز", at: 1000 },
  ];

  it("بيحسب مدة كل مرحلة من اللي قبلها", () => {
    const out = startupBreakdown(marks, 0);
    expect(out.phases[0]).toEqual({ label: "المحرّك", ms: 100 });
    expect(out.phases[1]).toEqual({ label: "المايك", ms: 800 });
    expect(out.phases[2]).toEqual({ label: "جاهز", ms: 100 });
  });

  it("الإجمالي من الضغطة لآخر علامة", () => {
    expect(startupBreakdown(marks, 0).totalMs).toBe(1000);
  });

  it("🔴 بيقول **مين أبطأ واحد** — ده اللي بيحدّد نصلّح إيه", () => {
    expect(startupBreakdown(marks, 0).slowest?.label).toBe("المايك");
  });

  it("مافيش علامات ⇒ صفر بلا انهيار", () => {
    const out = startupBreakdown([], 0);
    expect(out.totalMs).toBe(0);
    expect(out.phases).toEqual([]);
    expect(out.slowest).toBeNull();
  });

  it("⚠️ علامة سابقة للضغطة مابتطلّعش مدة سالبة", () => {
    const out = startupBreakdown([{ label: "غريبة", at: 50 }], 100);
    expect(out.phases[0].ms).toBe(0);
  });

  it("النص جاهز للتقرير", () => {
    expect(startupBreakdown(marks, 0).text).toContain("المايك 800");
  });
});

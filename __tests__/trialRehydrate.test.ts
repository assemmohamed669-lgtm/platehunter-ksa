import { describe, it, expect } from "vitest";
import { rehydrateMatch, stripForDraft } from "@/lib/trialRecords";

/**
 * 🔴 **صفوف صفحة التجربة كانت في الذاكرة بس.**
 *
 * صفحة التشييك بتحفظ مسودّاتها في IndexedDB مع كل تغيير، فلو التطبيق قفل
 * أو الموبايل عمل ريستارت اللوحات بتفضل. صفحة التجربة مكانتش بتحفظ **ولا
 * حاجة** — جلسة ٢٣٥ لوحة تضيع بالكامل لو التطبيق اتقفل.
 *
 * وبنحفظ الصف **بلا صف شيت التشييك** (`match`): ده أكبر حاجة في الصف
 * (كل أعمدة الشيت)، ومندوب بـ٢٠٠ لوحة كان هيكتب ميجابايتات — والحصّة في
 * المتصفّح لكل أصل، فامتلاؤها بيفشّل **كل** الكتابات (ده حصل في التشييك
 * قبل كده). بنرجّعه من الفهرس وقت التحميل — وكده بيبقى **أحدث** كمان لو
 * المالك غيّر شيت التشييك.
 */
describe("مسودّة صفحة التجربة", () => {
  const row = {
    id: "a", plate: "دطس2177", match: { "رقم اللوحة": "دطس2177", "البنك": "الراجحي" },
    type: "و", note: null, lat: 1, lng: 2, gpsAccuracy: 5,
    shownAt: 1, atMs: 1, tier: "green" as const, conf: 1, mult: 2,
    provisional: false, latencyMs: 100,
  };

  it("الحفظ بيشيل صف الشيت — الباقي زي ما هو", () => {
    const out = stripForDraft([row]);
    expect(out[0].match).toBeNull();
    expect(out[0].plate).toBe("دطس2177");
    expect(out[0].type).toBe("و");
    expect(out[0].lat).toBe(1);
  });

  it("🔴 التحميل بيرجّع «مطلوبة» من الفهرس", () => {
    const idx = new Map([["دطس2177", { "رقم اللوحة": "دطس2177", "البنك": "الراجحي" }]]);
    const back = rehydrateMatch(stripForDraft([row]), idx);
    expect(back[0].match).toEqual({ "رقم اللوحة": "دطس2177", "البنك": "الراجحي" });
  });

  it("اللوحة اللي مش في الشيت بتفضل بلا مطابقة", () => {
    const back = rehydrateMatch(stripForDraft([row]), new Map());
    expect(back[0].match).toBeNull();
  });

  it("فهرس فاضي أو مالوش لازمة مايكسرش حاجة", () => {
    expect(rehydrateMatch([], new Map())).toEqual([]);
  });
});

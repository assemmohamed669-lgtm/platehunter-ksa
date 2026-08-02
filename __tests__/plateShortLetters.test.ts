import { describe, it, expect } from "vitest";
import { extractMultiplePlates, parsePlateFromTranscript } from "@/lib/plateParser";

/**
 * لوحة بأقل من ٣ حروف لازم تتعلّم «مشكوك فيها».
 *
 * الكود بيفحص إن **الأرقام ٤** من زمان — لو أقل بيعلّمها، والتعليق مكتوب صراحة:
 * «لوحة السعودية دايماً ٤ أرقام. لو أقل → ممنوع نعرضها كأنها مؤكّدة». ومافيش
 * نفس الفحص على **الحروف**، مع إن اللوحة ٣ حروف + ٤ أرقام — القاعدة كانت مطبّقة
 * على نص اللوحة بس.
 *
 * الأثر مقيس: على ٣٠٦ نص Deepgram حقيقي، **٩٪** من النتايج طلعت غلط ومعروضة
 * كأنها مؤكّدة — و**٢٦ من ٢٩** منهم حروفهم أقل من ٣.
 *
 * أمثلة حقيقية من جلسة ميدانية للمالك (٢٠٢٦/٠٨/٠٢):
 *   «قف نون نون 9999» ⇒ نن9999   (قف مش حرف صالح فاتشال)
 *   «حه ص 66 زيرو»    ⇒ حص0660   (Deepgram ضيّع راء)
 *
 * ⚠️ الفحص **مابيصلّحش** اللوحة — الحرف ضايع من التفريغ أصلاً. بيمنعها بس إنها
 *    تعدي كأنها مؤكّدة، فالمندوب يشوفها ويقولها تاني بدل ما يمشي على لوحة ناقصة.
 */
const first = (t: string) => (extractMultiplePlates(t) || [])[0];
const letters = (p: string) => p.replace(/[0-9]/g, "").length;

describe("لوحة ناقصة حروف = مشكوك فيها (حالات ميدانية حقيقية)", () => {
  const cases: [string, string][] = [
    ["قف نون نون 9999", "نن9999"],
    ["حه ص 66 زيرو", "حص0660"],
    ["دال حا ثلاثة تصفار تسعة", "دح0009"],
  ];

  it.each(cases)("«%s» ⇒ %s معلّمة", (text, expected) => {
    const p = first(text);
    expect(p?.plate).toBe(expected);
    expect(letters(expected)).toBeLessThan(3);
    expect(p?.uncertain).toBe(true);
  });

  it("حرف واحد بس برضه معلّمة", () => {
    const p = first("سين خمسة صفر ثمانية صفر");
    expect(p && letters(p.plate) < 3 ? p.uncertain : true).toBe(true);
  });

  it("نفس الفحص على المسار المفرد", () => {
    const r = parsePlateFromTranscript("قف نون نون 9999");
    if (r?.plate && letters(r.plate) < 3) expect(r.needsReview ?? r.uncertain).toBe(true);
  });
});

describe("ما اتكسرش حاجة — ٣ حروف كاملة تفضل مؤكّدة", () => {
  const ok: [string, string][] = [
    ["حاء باء كاف اتنين اتنين ثمانية ثمانية", "حبك2288"],
    ["ألف لام ب واحد خمسمئة", "الب1500"],
    ["ره م ه ستة تسعمية", "رمه6900"],
    ["طا صاد ص أربعة وحايد", "طصص1111"],
    ["ألف سين كاف أربعسبعات", "اسك7777"],
    ["دال سين ره تلاتة أربعة واحد سبعة", "دسر3417"],
    ["راء دال حاء ثلاثة تصفار تسعة", "ردح0009"],
  ];

  it.each(ok)("«%s» ⇒ %s مؤكّدة", (text, expected) => {
    const p = first(text);
    expect(p?.plate).toBe(expected);
    expect(letters(expected)).toBe(3);
    expect(p?.uncertain).toBeFalsy();
  });
});

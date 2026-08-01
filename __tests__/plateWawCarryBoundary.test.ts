import { describe, it, expect } from "vitest";
import { normalizePlate } from "@/lib/plateParser";
import { newSessionState, parseSessionChunk } from "@/lib/sessionParser";

/**
 * مركّب الواو عبر **حدود الرسائل** — ده مسار الإنتاج الحقيقي.
 *
 * الشاشة بتنادي parseSessionChunk على كل نتيجة نهائية من Deepgram بـ
 * `final:false`، وبتقفل بنص فاضي `final:true`. اللوحة المقطوعة بين رسالتين
 * بتترحّل في `carryText`.
 *
 * المشكلة اللي الاختبارات دي بتقفلها: مركّب الواو («واحد وعشرين» = ٢١) بيتخزّن
 * في الذرّة كناتج **جمع** + الأصل (`cFrom`/`cTens`). خطوة ٢.٦ في plateParser
 * بتستعمل الأصل ده عشان تتراجع عن الجمع لو سابت اللوحة ناقصة. لما الذرّات
 * بتتسلسل لنص عشان تترحّل، الأصل كان بيضيع، فخطوة ٢.٦ تبقى عمياء في الرسالة
 * الجاية والنتيجة لوحة **مكتملة الشكل وغلط**.
 *
 * كل النصوص دي من التسجيلات الميدانية الحقيقية (١١ تسجيل، تفريغ Deepgram)،
 * وكل لوحة منها في قايمة المطلوبين فعلاً. القياس: ٤٨ لوحة حقيقية كانت بتضيع.
 */

// بث زي الإنتاج بالظبط (processWhisperText): الحالة بترجع من النداء وتتخزّن.
function streamPlates(chunks: string[]): string[] {
  let st = newSessionState();
  const out: string[] = [];
  for (const c of chunks) {
    const r = parseSessionChunk(c, st, { final: false });
    st = r.state;
    out.push(...r.records.map((x) => normalizePlate(x.plate)));
  }
  const f = parseSessionChunk("", st, { final: true });
  out.push(...f.records.map((x) => normalizePlate(x.plate)));
  return out;
}

function batchPlates(text: string): string[] {
  const r = parseSessionChunk(text, newSessionState(), { final: true });
  return r.records.map((x) => normalizePlate(x.plate));
}

describe("مركّب الواو مقطوع على حدود رسالة — لوحات حقيقية من الميدان", () => {
  // [الكلام، مكان القصّ = بعد كلمة العشرات، اللوحة الصح من قايمة المطلوبين]
  const cases: [string, string, string][] = [
    ["حا طا ص واحد وسبعين", "اربعة", "حطص1704"],
    ["ب ق الف اربعة وسبعين", "سبعة", "بقا4707"],
    ["باء طا لام واحد وسبعين", "تسعة", "بطل1709"],
    ["را صاد يه واحد واربعين", "اربعة", "رصي1404"],
    ["سين حا صاد اربعة وستين", "تلاتة", "سحص4603"],
    ["راء و ق اتنين وسبعين", "تلاتة", "روق2703"],
    ["ب ره ره سبعة وعشرين", "ستة", "برر7206"],
  ];

  for (const [head, tail, expected] of cases) {
    it(`«${head}» + «${tail}» ⇒ ${expected}`, () => {
      expect(streamPlates([head, tail])).toEqual([normalizePlate(expected)]);
    });
  }

  it("نفس الكلام في رسالة واحدة بيدّي نفس اللوحة (البث = الدفعة)", () => {
    for (const [head, tail, expected] of cases) {
      expect(batchPlates(`${head} ${tail}`)).toEqual([normalizePlate(expected)]);
    }
  });
});

describe("المركّب الحقيقي لسه بيتجمع لما القصّ يقع جنبه", () => {
  // مثال المالك: «اتنين وعشرين تمانية وثمانين» = ٢٢٨٨ (جمع مرتين)
  const owner = "دال سين كاف اتنين وعشرين تمانية وثمانين";

  it("في رسالة واحدة ⇒ دسك2288", () => {
    expect(batchPlates(owner)).toEqual([normalizePlate("دسك2288")]);
  });

  const splits: [string, string[]][] = [
    ["القصّ بعد الحروف", ["دال سين كاف", "اتنين وعشرين تمانية وثمانين"]],
    ["القصّ قبل المركّب الأول", ["دال سين كاف اتنين", "وعشرين تمانية وثمانين"]],
    ["القصّ بعد المركّب الأول", ["دال سين كاف اتنين وعشرين", "تمانية وثمانين"]],
    ["كلمة العشرات لوحدها في رسالة", ["دال سين كاف اتنين", "وعشرين", "تمانية وثمانين"]],
  ];
  for (const [label, chunks] of splits) {
    it(`${label} ⇒ دسك2288`, () => {
      expect(streamPlates(chunks)).toEqual([normalizePlate("دسك2288")]);
    });
  }
});

describe("مافيش تراجع: اللي كان شغّال قبل مركّب الواو لازم يفضل شغّال", () => {
  it("«تلاتة وستين» + «اتنين» = إملاء خانتين ⇒ دسك3602 (مش دسك0632)", () => {
    expect(streamPlates(["دال سين كاف تلاتة وستين", "اتنين"]))
      .toEqual([normalizePlate("دسك3602")]);
  });

  it("«واحد وعشرين» + «تلاتة» ⇒ دسك1203 (مش دسك0213)", () => {
    expect(streamPlates(["دال سين كاف واحد وعشرين", "تلاتة"]))
      .toEqual([normalizePlate("دسك1203")]);
  });

  it("واو العطف المفردة على الحدّ لسه بتشتغل صح", () => {
    expect(streamPlates(["حاء باء كاف واحد اتنين تلاتة و", "اربعة"]))
      .toEqual([normalizePlate("حبك1234")]);
    expect(streamPlates(["حاء باء كاف واحد اتنين تلاتة", "و اربعة"]))
      .toEqual([normalizePlate("حبك1234")]);
  });

  it("مصيدة «وواحد»: ٩٩٩ + واحد = ٩٩٩١ مش ١٠٠٠ — عبر الحدود كمان", () => {
    expect(streamPlates(["حاء باء كاف تسعة تسعة تسعة", "وواحد"]))
      .toEqual([normalizePlate("حبك9991")]);
  });
});

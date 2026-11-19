import { describe, it, expect } from "vitest";
import { runsFromOps, runsToText, type PdfOp } from "@/lib/pdfRuns";
import { parseCertText } from "@/lib/certParse";
import { SIJIL_GLYPHS } from "@/lib/sijilGlyphs.map";
import { SIJIL_RUNS_MARK } from "@/lib/sijilGlyphs";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📄 قراية «السجل» من أوامر الرسم نفسها — كل قيمة كاملة في مكانها
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (١٩ نوفمبر ٢٠٢٦): «صلح كل حاجه عايز كل البيانات صح 100%».
 *
 *  الشهادة بتكتب كل قيمة **مرة واحدة كاملة** في مكانها («اسود» = <0361 0375 0320 0359> عند y=373) —
 *  بس قارئ الكلام العادي (extractText) كان بيقطّع: «د» بتروح للسطر اللي فوق («اسو» + «دنوع المركبة»)،
 *  و«اع» بتروح للسطر اللي قبل («الهز» + «اعالمنفذ ضده»). القارئ الجديد بياخد كل أمر رسم (Tj) بمكانه ويرصّ
 *  السطور بالمكان — فمفيش تقطيع ولا لزق تخميني.
 */

const g = (unicode: string, width = 500) => ({ unicode, width });
const show = (s: string) => ({ fn: "showText", args: [[...s].map((c) => g(c))] });
const at = (x: number, y: number, s: string, size = 8): PdfOp[] => [
  { fn: "beginText", args: null }, { fn: "setFont", args: ["f", size] }, { fn: "moveText", args: [x, y] }, show(s), { fn: "nextLine", args: null }, { fn: "endText", args: null },
];

describe("📐 من أوامر الرسم لسطور", () => {
  it("🔴 كل أمر رسم = قطعة واحدة بمكانها — والسطور بالمكان (فوق ⇒ تحت، شمال ⇒ يمين)", () => {
    const ops: PdfOp[] = [
      ...at(500, 391, "B2"), ...at(190, 391, "B1"),       // نفس السطر بترتيب معكوس في الملف
      ...at(195, 373, "C1"),                                // السطر اللي تحته
      ...at(300, 736, "A1"),                                // أول الصفحة بييجي في الآخر في الملف
    ];
    expect(runsToText(runsFromOps(ops))).toBe("A1\nB1 B2\nC1");
  });

  it("فرق صغير في الارتفاع (٢٨٢٫٧ و٢٨٤٫٢) = نفس السطر", () => {
    expect(runsToText(runsFromOps([...at(100, 282.7, "a"), ...at(200, 284.2, "b"), ...at(50, 273.7, "c")]))).toBe("a b\nc");
  });

  it("الـCTM (save/transform/restore) بيتحسب", () => {
    const ops: PdfOp[] = [
      { fn: "save", args: null }, { fn: "transform", args: [1, 0, 0, 1, 0, 100] }, ...at(10, 0, "up"), { fn: "restore", args: null },
      ...at(10, 0, "down"),
    ];
    expect(runsToText(runsFromOps(ops))).toBe("up\ndown");
  });

  it("أكتر من أمر رسم في نفس BT بيكمّلوا بعرض الحروف", () => {
    const ops: PdfOp[] = [{ fn: "beginText", args: null }, { fn: "setFont", args: ["f", 10] }, { fn: "moveText", args: [0, 50] },
      show("ab"), show("cd"), { fn: "endText", args: null }, ...at(30, 50, "x"), ...at(12, 50, "y")];
    // «ab» من 0 لـ10 (٢ × ٥٠٠/١٠٠٠ × ١٠)، «cd» من 10 لـ20، «y» عند 12 (جوّه «cd») ⇒ بعدها، «x» بعيد ⇒ بمسافة
    const runs = runsFromOps(ops);
    expect(runs.map((r) => [r.text, r.x])).toEqual([["ab", 0], ["cd", 10], ["x", 30], ["y", 12]]);
    expect(runsToText(runs)).toBe("abcdy x");
  });

  it("🔴 قطعتين لازقين (مفيش فراغ بينهم) ⇒ من غير مسافة: «CRN-» + «301-01081765» = رقم واحد", () => {
    // «CRN-» ٤ حروف × ٥٠٠/١٠٠٠ × ٨ = ١٦ ⇒ من ٤٠٤ لـ٤٢٠، والأرقام من ٤٢٠
    expect(runsToText(runsFromOps([...at(420, 779, "301-01081765"), ...at(404, 779, "CRN-")]))).toBe("CRN-301-01081765");
    // فراغ أكبر من نص حرف ⇒ مسافة
    expect(runsToText(runsFromOps([...at(404, 779, "CRN-"), ...at(424, 779, "301")]))).toBe("CRN- 301");
  });
});

// ── شهادة «السجل» متكوّنة من أوامر رسم بالرموز الحقيقية (الرمز = شكل الحرف في الخط) ──
const ISO: Record<string, string> = {};
for (let cp = 0x353; cp <= 0x377; cp++) { const ch = String.fromCodePoint(cp); const l = SIJIL_GLYPHS[ch]; if (l && l.length === 1 && !(l in ISO)) ISO[l] = ch; }
/** كلام عربي ⇒ رموز «السجل» بالترتيب المرئي (شمال ⇒ يمين) زي ما الشهادة بترسمه. */
const enc = (logical: string) => [...logical].map((c) => (c === " " ? " " : ISO[c] ?? c)).reverse().join("");
const line = (y: number, parts: [number, string][]) => parts.flatMap(([x, s]) => at(x, y, s));
const OPS: PdfOp[] = [
  ...line(719, [[405, enc("مصرف الإنماء")], [501, enc("اسم المؤجر:")]]),
  ...line(627, [[386, enc("علي بن سعد")], [495, enc("اسم المستأجر:")]]),
  ...line(417, [[167, "4925"], [185, "  " + enc("ا") + "  " + enc("ع") + "  " + enc("ر")], [230, enc("رقم اللوحة باللغة العربية:")], [414, enc("هافل")], [513, enc("المصنع:")]]),
  ...line(391, [[189, "None"], [221, enc("رقم اللوحة باللغة الإنجليزية:")], [409, enc("لاند كروزر")], [502, enc("نوع المركبة:")]]),
  ...line(373, [[195, enc("اسود")], [263, enc("لون المركبة:")], [341, "LGWEE4A50RK605167"], [505, enc("رقم الهيكل:")]]),
  ...line(282, [[63, enc("تعد هذه الشهادة سندا تنفيذيا")]]),
  ...line(37, [[70, "Riyadh 12361, Saudi Arabia, 920002942, www.sijil.sa"]]),
  // رقم العقد مرسوم قطعتين لازقين زي الشهادة الحقيقية
  ...line(779, [[404, "CRN-"], [420, "301-01081765"], [500, enc("رقم تسجيل العقد:")]]),
];
const runsCert = () => parseCertText(SIJIL_RUNS_MARK + "\n" + runsToText(runsFromOps(OPS)), "REPO-301-00000001.pdf");

describe("🔴 «السجل» من أوامر الرسم ⇒ كل البيانات زي الشهادة بالظبط", () => {
  it("🔴 اللوحة", () => {
    const f = runsCert();
    expect([f.issuer, f.plate, f.plateText, f.vin]).toEqual(["sijil", "رعا4925", "ر ع ا 4925", "LGWEE4A50RK605167"]);
  });
  it("🔴 اللون كامل («اسود» مش «اسو»)", () => expect(runsCert().color).toBe("اسود"));
  it("🔴 الاسم زي ما هو — «بن» مابتتلزقش في اللي قبلها", () => expect(runsCert().tenant).toBe("علي بن سعد"));
  it("🔴 الطراز بمسافته («لاند كروزر» مش «لاندكروزر»)", () => expect(runsCert().model).toBe("لاند كروزر"));
  it("🔴 المؤجر زي المكتوب في الشهادة (مايتبدّلش باسم من قايمة)", () => expect(runsCert().bank).toBe("مصرف الإنماء"));
  it("المصنع", () => expect(runsCert().make).toBe("هافل"));
  it("🔴 رقم العقد (CRN) كامل", () => expect(runsCert().certNo).toBe("CRN-301-01081765"));
});

/**
 * 🔴 `REPO-116-00290822.pdf` (بنك الجزيرة): خانة العربي **فاضية في الشهادة نفسها** والإنجليزي بس «8979 UER».
 * المالك (١٩ نوفمبر ٢٠٢٦) اختار: «معكوس زي اللوحة الحقيقية: «ر ع و 8979». ده اللي البرنامج كان بيعمله قبل النهارده».
 * والقيمة الفاضية كانت بتبلع الخانة اللي بعدها («نوع المركبة: 6») — دلوقتي بتفضل فاضية.
 */
describe("🔴 بنك الجزيرة — العربي فاضي والإنجليزي بس", () => {
  const cert = (en: string) => parseCertText(SIJIL_RUNS_MARK + "\n" + runsToText(runsFromOps([
    ...line(417, [[230, enc("رقم اللوحة باللغة العربية:")], [414, enc("مازدا")], [513, enc("المصنع:")]]),
    ...line(391, [...(en ? [[189, en] as [number, string]] : []), [221, enc("رقم اللوحة باللغة الإنجليزية:")], [409, "6"], [502, enc("نوع المركبة:")]]),
    ...line(373, [[195, enc("فضي")], [263, enc("لون المركبة:")], [341, "JM7GL4S31S1519789"], [505, enc("رقم الهيكل:")]]),
    ...line(282, [[63, enc("تعد هذه الشهادة سندا تنفيذيا")]]),
    ...line(37, [[70, "Riyadh 12361, Saudi Arabia, 920002942, www.sijil.sa"]]),
  ])), "REPO-116-00290822.pdf");

  it("🔴 «8979 UER» ⇒ «ر ع و 8979» (المعكوس — قرار المالك)", () => {
    const f = cert("8979 UER");
    expect([f.plate, f.plateText, f.make, f.model, f.color]).toEqual(["رعو8979", "ر ع و 8979", "مازدا", "6", "فضي"]);
  });

  it("العربي فاضي والإنجليزي فاضي ⇒ مفيش لوحة", () => {
    expect(cert("").plate).toBe("");
  });
});

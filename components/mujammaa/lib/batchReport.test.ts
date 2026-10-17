import { describe, expect, it } from "vitest";
import {
  buildBatchReport,
  chunksAr,
  diagText,
  extrasMaybeSaid,
  findPlate,
  mmss,
  parseReadingSheet,
  reportText,
  type BatchReport,
  type ReportInput,
} from "./batchReport";
import FIX from "./__tests__/fixtures/batch-20261003.json";

/**
 * تقرير التفريغ الشامل — المالك (٣٠ سبتمبر ٢٠٢٦): «قلت كام وطلع كام، النوع والملاحظة،
 * المدة، الهلوسة، اللي ماطلعش وسببه … تقرير شامل ميسيبش حاجة».
 */
describe("ورقة القراية", () => {
  it("لوحة بحروف مفصولة وأرقام عربي + نوع + ملاحظة", () => {
    const [r] = parseReadingSheet("ح ب ك ١٢٣٤ فان مركونه");
    expect(r.plate).toBe("حبك1234");
    expect(r.type).toBe("فان");
    expect(r.note).toBe("مركونه");
  });

  it("الأرقام قبل الحروف · نوع من كلمتين · ملاحظة حرّة", () => {
    const [r] = parseReadingSheet("1234 حبك هاي اس قدام البقالة");
    expect(r.plate).toBe("حبك1234");
    expect(r.type).toBe("هاي اس");
    expect(r.note).toBe("قدام البقاله");
  });

  it("سطر من غير لوحة بيتجاهل، ولوحة لوحدها من غير نوع", () => {
    const rows = parseReadingSheet("بسم الله\nدرن1452\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ plate: "درن1452", type: undefined, note: undefined });
  });

  it("أ/إ بتتوحّد", () => expect(findPlate("أبح 1234")).toBe("ابح1234"));

  /**
   * 🔴 «اتش١» فيه رقم — الفلتر كان بيشيل أي توكن فيه رقم فالنوع بيضيع
   * والتقرير يقول «اتش١ ماطلعش» وهو طالع. جلسة المالك (٣ أكتوبر): «اول3016 اتش1».
   */
  it("«اتش1» / «اتش 1» / «اتش١» ⇒ النوع «اتش١» — قبل اللوحة أو بعدها، واللوحة سليمة", () => {
    for (const line of ["اتش1 اول3016", "اول3016 اتش1", "اول3016 اتش 1", "اول3016 اتش١", "اتش 1 3016 اول"]) {
      const [r] = parseReadingSheet(line);
      expect(r, line).toMatchObject({ plate: "اول3016", type: "اتش١", note: undefined });
    }
  });

  it("«ديانا» و«ديانة» في الورقة ⇒ «دينه» (قرار المالك ٣ أكتوبر ٢٠٢٦)", () => {
    for (const line of ["درس7305 ديانا", "درس7305 ديانة", "درس7305 دينه"]) {
      const [r] = parseReadingSheet(line);
      expect(r, line).toMatchObject({ plate: "درس7305", type: "دينه", note: undefined });
    }
  });
});

const SHEET = parseReadingSheet([
  "حبك1234 فان",
  "درن1452 ونيت مركونه",
  "سصع5555",
  "يطك5488",   // هتطلع مقلوبة (مركّب)
  "رحن3488",   // هتتشال بقاعدة الشهود
  "ابس2985",   // الشاهد سمع أرقامها بس
  "دهس7777",   // محدّش سمعها
].join("\n"));

const base = {
  sheet: SHEET,
  rows: [
    { plate: "حبك1234", support: 5, type: "فان" },
    { plate: "درن1452", support: 4, type: "شاص", condition: "مركونه" },
    { plate: "سصع5555", support: 5, place: "جراج" },
    { plate: "يطك4588", support: 3 },
    { plate: "زور9999", support: 2 },        // اختراع
    { plate: "بمر8800", support: 2 },        // الشاهد سمع أرقامها
  ],
  dropped: [{ plate: "رحن3488", support: 1 }],
  seqs: [["حبك1234", "درن1452"], ["سصع5555", "يطك4588"]],
  cohereDigits: ["1234", "1452", "5555", "2985", "8800"],
  audioSec: 125, elapsedMs: 9400, realtimeX: 13.3, calls: 20, model: "SHIP-MUJAMMAA-v6", now: 1759200000000,
};

describe("buildBatchReport — بورقة", () => {
  const r = buildBatchReport(base);

  it("العدّ: قلت · طلع · صح · ضايع · زيادة · اختراع", () => {
    expect(r.said).toBe(7);
    expect(r.got).toBe(6);
    expect(r.correct).toBe(3);
    expect(r.missed).toHaveLength(4);
    expect(r.extras.map((x) => x.plate).sort()).toEqual(["بمر8800", "زور9999"]);
    expect(r.inventions).toBe(1);
  });

  it("سبب كل لوحة ضايعة", () => {
    const why = Object.fromEntries(r.missed.map((m) => [m.plate, m.reason]));
    expect(why["يطك5488"]).toContain("اتبدّلوا");
    expect(why["رحن3488"]).toContain("قاعدة الشهود");
    expect(why["ابس2985"]).toContain("الشاهد سمع أرقامها");
    expect(why["دهس7777"]).toContain("ولا الموديل ولا الشاهد");
    // الغلطة نفسها — والدليل (لو موجود) بيتشاف تحت في اختبارات التشخيص
    expect(r.misread.map(({ said, got }) => ({ said, got }))).toEqual([{ said: "يطك5488", got: "يطك4588" }]);
  });

  it("الاختراع مفصول عن «ممكن اتقالت»", () => {
    const why = Object.fromEntries(r.extras.map((x) => [x.plate, x.reason]));
    expect(why["زور9999"]).toContain("اختراع");
    expect(why["بمر8800"]).toContain("ممكن اتقالت");
    expect(extrasMaybeSaid(r)).toBe(1);
  });

  it("النوع والملاحظة: صح · غلط · ماطلعش · زيادة", () => {
    expect(r.types).toMatchObject({ said: 2, correct: 1 });
    expect(r.types.wrong).toEqual([{ plate: "درن1452", said: "ونيت", got: "شاص" }]);
    expect(r.notes.said).toBe(1);
    expect(r.notes.correct).toBe(1);
    expect(r.notes.extra).toEqual([{ plate: "سصع5555", got: "جراج" }]);
  });

  it("النص فيه المدة والعدّ والأسباب", () => {
    const t = reportText(r);
    expect(t).toContain("مدة التسجيل 2:05");
    expect(t).toContain("التفريغ خد 9.4ث");
    expect(t).toContain("قلت 7 · طلع 6 · صح 3");
    expect(t).toContain("زور9999");
    expect(t).toContain("اتبدّلوا");
  });

  it("م:ث بيقرّب الثواني الأول — 119.6ث ⇐ 2:00 مش 1:60", () => {
    expect(mmss(119.6)).toBe("2:00");
    expect(mmss(59.5)).toBe("1:00");
    expect(mmss(125)).toBe("2:05");
    expect(reportText(buildBatchReport({ ...base, audioSec: 119.6 }))).toContain("مدة التسجيل 2:00");
  });

  it("متشال من غير وقت (السيرفر القديم) بيتطابق على اللوحة نفسها بس — مش قراية قريبة", () => {
    const r2 = buildBatchReport({ ...base, dropped: [{ plate: "رحن3488", support: 1 }, { plate: "دهس7778", support: 1 }] });
    const why = Object.fromEntries(r2.missed.map((m) => [m.plate, m]));
    expect(why["رحن3488"].reason).toContain("قاعدة الشهود");
    expect(why["دهس7777"].reason).toContain("ولا الموديل ولا الشاهد");
    expect(why["دهس7777"].heardAs).toBeUndefined();
    expect(why["دهس7777"].evidence?.dropped).toBeUndefined();
  });

  it("قاعدة الشهود (why:edge) = مقطع واحد سمعها مع إن مقاطع كتير غطّت وقتها — مش «طرف المقطع»", () => {
    const r2 = buildBatchReport({
      ...base,
      dropped: [{ plate: "رحن3488", support: 1, why: "edge", t_s: 40, coverage: 4 }],
    });
    const d = diagText(r2);
    expect(d).toContain("اتسمعت في مقطع واحد بس مع إن 4 مقاطع غطّت وقتها");
    expect(d).not.toContain("طرف المقطع");
  });
});

describe("عدّ المقاطع بالعربي", () => {
  it("مقطع واحد · مقطعين · ٣-١٠ مقاطع · ١١+ مقطع", () => {
    expect(chunksAr(1)).toBe("مقطع واحد");
    expect(chunksAr(2)).toBe("مقطعين");
    expect(chunksAr(3)).toBe("3 مقاطع");
    expect(chunksAr(10)).toBe("10 مقاطع");
    expect(chunksAr(11)).toBe("11 مقطع");
  });
});

describe("buildBatchReport — من غير ورقة", () => {
  it("بيطلّع اللي طلع + تقدير الاختراع من الشاهد، ومكتوب إنه تقدير", () => {
    const r = buildBatchReport({ ...base, sheet: [] });
    expect(r.hasSheet).toBe(false);
    expect(r.got).toBe(6);
    expect(r.inventions).toBe(2); // يطك4588 و زور9999 أرقامهم مش عند الشاهد
    expect(reportText(r)).toContain("مافيش ورقة قراية");
  });
});

/* ======================================================================
 * 🔍 التشخيص — ليه اللوحة طلعت غلط أو ماطلعتش (٣ أكتوبر ٢٠٢٦)
 *
 * المالك: «ضيف نص كوهير الخام». الداتا من **تسجيل المالك الحقيقي**
 * (batch-runs/20261003-003055-395) — شريحة صغيرة: المقاطع ٣-٢٧ + كل اللوحات.
 * ====================================================================== */

const REAL_PLATES = (
  "امن2651 دقو1197 حهق4233 اطط5406 دبو8965 دهس6368 اسم6259 اكط1587 اعه6074 دمد9617 " +
  "مصس0597 بطع4658 الط6345 حسس1772 حعس3197 اطق5734 انا7675 دقد2034 حهر8929 رنل6865 " +
  "رصد1205 حصق1559 حمب7101 رال5820 دطا8911 حنب1787 دقص0597 اصط1249 بعب8519 اهد2159 " +
  "بصع3965 امم1060 حوص4168 اول3031 دبد6514 حعس9223 بحص2763 اعص7955 درس7305 دمي5630 " +
  "دوط6501 بوه9615 اول3016 اوح2835 دنح5305 دبح7906 ااح4773 اصص8208 حبك5130 سده2560 " +
  "بوح2196 سول0941 اوط3905 حعد6579 اعب8412 رلي3807 سحط4201 حكر7718 انل1809 دطل9569"
).split(" ");
// أول ٤٣ لوحة اتقال بعدها نوع/ملاحظة بالترتيب ده، والـ١٧ الباقيين من غير
const REAL_KINDS = [
  "ونيت", "فان", "دباب", "شاص", "مركونه", "مصدومه", "لوحه صفرا", "نقل", "ملاكي", "برحه يمين",
  "برحه يسار", "غمارة", "غمارتين", "موتوسيكل", "مسجد", "داخل بيت", "جراج", "تحت تندة", "فندق", "امام فندق",
  "برحه يمين", "برحه يسار", "بدون لوحه اماميه", "مبنشرة", "متغطيه", "حادث", "متحرك", "مركونه", "متربه", "جران ماكس",
  "تريلا", "سطحه", "دوكر", "حافله", "اتوبيس", "كوستر", "ميكروباص", "نقليات", "دينه", "شاحنه",
  "شاص", "هاي اس", "اتش1",
];
const REAL_SHEET = parseReadingSheet(
  REAL_PLATES.map((p, i) => (REAL_KINDS[i] ? `${p} ${REAL_KINDS[i]}` : p)).join("\n")
);

const realInput = (over: Partial<ReportInput> = {}): ReportInput => ({
  sheet: REAL_SHEET,
  rows: FIX.plates,
  dropped: FIX.dropped,
  seqs: FIX.seqs,
  chunks: FIX.chunks,
  cuts: FIX.cuts,
  cohereTexts: FIX.cohere_texts,
  cohereDigits: FIX.cohere_digits,
  run: FIX.run,
  audioSec: FIX.dur_s,
  elapsedMs: 65000,
  calls: FIX.calls,
  model: FIX.model,
  fieldsFrom: FIX.fields_from,
  now: 1759449055000,
  ...over,
});

describe("التشخيص — على تسجيل المالك الحقيقي", () => {
  const r = buildBatchReport(realInput());
  const missedOf = (p: string) => r.missed.find((m) => m.plate === p);

  it("العدّ: ٦٠ قلت · ٥٧ صح · ٣ ماطلعوش، والتشغيلة متسجّلة", () => {
    expect(r.said).toBe(60);
    expect(r.correct).toBe(57);
    expect(r.missed.map((m) => m.plate).sort()).toEqual(["انا7675", "حوص4168", "رصد1205"].sort());
    expect(r.run).toBe("20261003-003055-395");
  });

  it("انا7675 (الموديل ماطلّعهاش صح أبداً): المقاطع اللي غطّت وقتها — منها ساكتة ومنها «اصا7675»", () => {
    const ev = missedOf("انا7675")?.evidence;
    expect(ev).toBeDefined();
    expect(ev!.reads.length).toBeGreaterThanOrEqual(3);
    expect(ev!.reads.some((x) => x.read === null)).toBe(true); // ساكت
    expect(ev!.reads.some((x) => x.read === "اصا7675")).toBe(true);
    // كلها حوالين ٥٠-٦٠ث (بين جيرانها في الورقة)
    for (const x of ev!.reads) {
      expect(x.s!).toBeLessThanOrEqual(58);
      expect(x.e!).toBeGreaterThanOrEqual(56);
    }
  });

  // اللي السيرفر الحقيقي شاله بقاعدة «لوحدها» في الجلسة دي (بعد إعادة التشغيل)
  const REAL_LONE = [
    { plate: "اصا7675", support: 1, why: "lone", nbr: [4, 4], chunks: [9], t_s: 57.96 },
    { plate: "رصد1205", support: 1, why: "lone", nbr: [5, 4], chunks: [9], t_s: 76.15 },
  ];

  it("انا7675 + عنصر متشال بقاعدة «لوحدها» ⇒ السبب بيقول كده والدليل فيه المتشال", () => {
    const r2 = buildBatchReport(realInput({ dropped: REAL_LONE }));
    const m = r2.missed.find((x) => x.plate === "انا7675")!;
    expect(m.reason).toContain("اتسمعت في مقطع واحد بس واتشالت لأن اللي حواليها اتسمعوا كتير");
    expect(m.heardAs).toBe("اصا7675");
    expect(m.evidence?.dropped).toEqual([REAL_LONE[0]]);
  });

  it("رصد1205 قراية غلط + قرايتها الصح الوحيدة اتشالت بقاعدة «لوحدها» ⇒ السبب بيقول الاتنين", () => {
    const r2 = buildBatchReport(realInput({ dropped: REAL_LONE }));
    const m = r2.missed.find((x) => x.plate === "رصد1205")!;
    expect(m.heardAs).toBe("رصد2105");
    expect(m.reason).toContain("طلعت غلط «رصد2105»");
    expect(m.reason).toContain("والقراية الصح «رصد1205» اتسمعت في مقطع واحد بس واتشالت");
    expect(m.evidence?.dropped).toEqual([REAL_LONE[1]]);
    expect(r2.misread.find((x) => x.said === "رصد1205")?.evidence?.dropped).toEqual([REAL_LONE[1]]);
    // من غير المتشال: السبب زي ما هو
    expect(missedOf("رصد1205")?.reason).not.toContain("اتشالت");
  });

  it("«اتش١» اتقال واتطلع صح — مش «ماطلعش»", () => {
    expect(REAL_SHEET.find((s) => s.plate === "اول3016")?.type).toBe("اتش١");
    expect(r.types.missing.find((w) => w.plate === "اول3016")).toBeUndefined();
    expect(r.types.wrong.find((w) => w.plate === "اول3016")).toBeUndefined();
  });

  it("«زيادة ممكن اتقالت» مابتعدّش «القراية التانية الغلط» ولا الاختراع", () => {
    expect(r.extras.map((x) => x.plate)).toEqual(["حوص6146"]);
    expect(extrasMaybeSaid(r)).toBe(0);
  });

  it("عدد المقاطع اللي غطّت اللوحة مكتوب صح («N مقاطع غطّت وقتها»)", () => {
    const n = missedOf("انا7675")!.evidence!.reads.length;
    const t = reportText(r);
    expect(t).toContain(`${chunksAr(n)} غطّت وقتها`);
    expect(t).not.toContain("مقطع غطّوا");
  });

  it("رصد1205 قراية غلط، والدليل فيه مقطع سمعها صح «رصد1205»", () => {
    const mr = r.misread.find((x) => x.said === "رصد1205");
    expect(mr?.got).toBe("رصد2105");
    const reads = mr!.evidence!.reads.map((x) => x.read);
    expect(reads.filter((x) => x === "رصد1205")).toHaveLength(1);
    expect(reads).toContain("رصد2105");
    expect(missedOf("رصد1205")?.evidence?.reads.map((x) => x.read)).toContain("رصد1205");
  });

  it("حوص4168 ⇒ حوص6168 قراية غلط، وحوص6146 «قراية تانية غلط لنفس اللوحة» مش اختراع", () => {
    expect(r.misread.find((x) => x.said === "حوص4168")?.got).toBe("حوص6168");
    const x = r.extras.find((e) => e.plate === "حوص6146")!;
    expect(x.reason).toContain("قراية تانية غلط لنفس اللوحة");
    expect(x.secondOf).toBe("حوص4168");
    expect(r.inventions).toBe(0);
    expect(r.out.find((o) => o.plate === "حوص6146")?.status).toBe("≈");
  });

  it("النوع اللي ماطلعش معاه نص كوهير: بطع4658 «قمارة» · اهد2159 «جرام ماكس»", () => {
    const g = r.types.missing.find((w) => w.plate === "بطع4658");
    expect(g?.said).toBe("غمارة");
    expect(g?.cohere).toContain("قمارة");
    const j = r.types.missing.find((w) => w.plate === "اهد2159");
    expect(j?.said).toBe("جران ماكس");
    expect(j?.cohere).toContain("جرام ماكس");
  });

  it("قسم المقاطع: بداية/نهاية + نص الموديل الخام + نص كوهير الخام", () => {
    expect(r.diag).toHaveLength(FIX.chunks.length);
    expect(r.diag![0]).toMatchObject({ s: 13.02, e: 41.26 });
    expect(r.diag![0].m).toBe(FIX.chunks[0].text);
    expect(r.diag![0].c).toBe(FIX.cohere_texts[0]);
    expect(r.diagCut ?? 0).toBe(0);
  });

  it("reportText مختصر (سطر سبب قصير لكل مشكلة) — نص كوهير الخام في diagText بس", () => {
    const t = reportText(r);
    expect(t).toContain("قراية تانية غلط لنفس اللوحة");
    expect(t).not.toContain("بطاعين"); // نص كوهير مابيدخلش رسالة الواتساب
    expect(t).not.toContain("جرام ماكس");
    const d = diagText(r);
    expect(d).toContain("20261003-003055-395");
    expect(d).toContain("قمارة");
    expect(d).toContain("جرام ماكس");
    expect(d).toContain("اصا7675");
    expect(d).toContain(FIX.cohere_texts[5].trim().split(/\s+/).slice(0, 6).join(" "));
    expect(d.length).toBeGreaterThan(t.length);
  });
});

describe("التشخيص — حدود وتوافق", () => {
  it("قسم المقاطع مقفول على ~١٥٠ كيلو: الأطول بيتقص الأول، والقص مكتوب", () => {
    const big = "س".repeat(120_000); // ٢٤٠ كيلوبايت لوحده
    const r = buildBatchReport({
      ...base,
      chunks: [
        { start: 0, end: 28, text: "حبك1234 درن1452" },
        { start: 5, end: 33, text: big },
      ],
      cohereTexts: ["حا با كاف", big],
    });
    const bytes = r.diag!.reduce((n, d) => n + new TextEncoder().encode(d.m + (d.c ?? "")).length, 0);
    expect(bytes).toBeLessThanOrEqual(150_000);
    expect(r.diag![0]).toMatchObject({ m: "حبك1234 درن1452", c: "حا با كاف" }); // القصير ماتلمسش
    expect(r.diagCut).toBe(2);
    expect(diagText(r)).toContain("اتقص");
  });

  it("تقرير قديم محفوظ (من غير diag ولا دليل ولا run) لسه بيتعرض", () => {
    const old: BatchReport = JSON.parse(JSON.stringify({
      id: "r1", createdAt: 1759200000000, label: "قديم", hasSheet: true,
      audioSec: 60, elapsedMs: 4000, said: 2, got: 2, correct: 1,
      missed: [{ plate: "دهس7777", reason: "ولا الموديل ولا الشاهد سمعوها" }],
      misread: [], extras: [{ plate: "زور9999", reason: "🔴 اختراع" }], inventions: 1,
      types: { said: 0, got: 0, correct: 0, wrong: [], missing: [], extra: [] },
      notes: { said: 0, got: 0, correct: 0, wrong: [], missing: [], extra: [] },
      out: [{ plate: "زور9999", status: "✗" }],
    }));
    const t = reportText(old);
    expect(t).toContain("دهس7777");
    expect(t).toContain("زور9999");
    expect(() => diagText(old)).not.toThrow();
    expect(diagText(old)).toContain("مافيهوش");
  });
});

/**
 * 🔁 مراجعة تالتة (٣ أكتوبر ٢٠٢٦): الورقة لازم تتوحّد بنفس نطقات الماسح
 * (`VARIANTS`) — «متحرك» في الورقة كانت بتتعدّ **غلط** قدّام «متحركة» اللي
 * طلعت، مع إنها نفس الكلمة. وقيمة قديمة من السيرفر («ديانا») تتقارن بـ«دينه».
 */
describe("توحيد الورقة بنطقات الماسح", () => {
  it("«متحرك» ⇒ «متحركة» · «تحت تند» ⇒ «تحت تنده»", () => {
    expect(parseReadingSheet("دقص0597 متحرك")[0].note).toBe("متحركة");
    expect(parseReadingSheet("دقد2034 تحت تند")[0].note).toBe("تحت تنده");
  });

  it("الكلمات اللي جوّه عضو من كلمتين مابتتلمسش («لوحه صفرا» تفضل نوع واحد)", () => {
    const [r] = parseReadingSheet("اسم6259 لوحه صفرا");
    expect(r.type).toBe("لوحه صفرا");
    expect(r.note).toBeUndefined();
    expect(parseReadingSheet("امن2651 ونيت")[0].type).toBe("ونيت");
  });

  it("جلسة المالك: «متحرك» و«دينه» (السيرفر القديم كتب «ديانا») بيتعدّوا صح", () => {
    const r = buildBatchReport(realInput());
    expect(r.notes.wrong.map((w) => w.plate)).not.toContain("دقص0597");
    expect(r.types.wrong.map((w) => w.plate)).not.toContain("درس7305");
  });

  it("سطر المتشال بيقول رقم المقطع «#9» مش «مقاطع 9»", () => {
    const drop = [{ plate: "اصا7675", support: 1, why: "lone", nbr: [4, 4], chunks: [9], t_s: 57.96 }];
    const d = diagText(buildBatchReport(realInput({ dropped: drop })));
    expect(d).toContain("#9");
    expect(d).not.toContain("مقاطع 9");
  });
});

describe("🔢 التصحيح من كوهير (٤ أكتوبر)", () => {
  const fixed = [
    { from: "حدي1153", to: "حدي1853", action: "fix", row: 0, heard: 1, of: 1 },
    { from: "ردي2104", to: "ردي1204", action: "dup", row: 16, heard: 2, of: 2 },
  ];

  it("التقرير بيقول كل لوحة اتصلّحت من إيه لإيه — والمتشالة لأنها نفس النطق", () => {
    const r = buildBatchReport(realInput({ cohereFixed: fixed }));
    expect(r.cohereFixed).toEqual(fixed);
    const t = reportText(r);
    expect(t).toContain("اتصلّحت من كوهير");
    expect(t).toContain("حدي1153 بقت حدي1853");
    expect(t).toContain("سمعها في 1 من 1 مقطع");
    expect(t).toContain("ردي2104 اتشالت");
    expect(t).toContain("نفس نطق ردي1204");
  });

  it("من غير تصحيح (أو تقرير قديم) مافيش القسم خالص", () => {
    const r = buildBatchReport(realInput());
    expect(r.cohereFixed).toBeUndefined();
    expect(reportText(r)).not.toContain("اتصلّحت من كوهير");
    expect(reportText(buildBatchReport(realInput({ cohereFixed: [] })))).not.toContain("اتصلّحت من كوهير");
  });
});

describe("🔢 المتشالة كتكرار من كوهير (cohere_dup)", () => {
  const dup = { plate: "ردي2104", support: 3, why: "cohere_dup", same_as: "ردي1204", chunks: [10, 11, 12], t_s: 59.4 };

  it("التشخيص بيكتب السبب بالعربي مش «cohere_dup»", () => {
    // سطر المتشال بيظهر في دليل لوحة ليها مشكلة — هنا لوحة الورقة اللي اتشالت
    const d = diagText(buildBatchReport(realInput({ sheet: parseReadingSheet("ردي2104"), dropped: [dup] })));
    expect(d).toContain("نفس نطق «ردي1204»");
    expect(d).not.toContain("cohere_dup");
  });

  it("لوحة في الورقة اتشالت كتكرار ⇒ السبب قاعدة كوهير مش «مقطع واحد سمعها»", () => {
    const sheet = parseReadingSheet("ردي2104");
    const r = buildBatchReport(realInput({ sheet, dropped: [{ ...dup, t_s: undefined }] }));
    const m = r.missed.find((x) => x.plate === "ردي2104");
    expect(m?.reason).toContain("كوهير");
    expect(m?.reason).toContain("ردي1204");
    expect(m?.reason).not.toContain("مقطع واحد بس");
  });
});

describe("🛟 لوحات رجعت من كوهير (cohere_rescued · ٤ أكتوبر)", () => {
  const rescued = [{ plate: "ردي1204", row: 15, after: "اعل8947", before: "دحب8646", heard: 4, full: 3, chunks: [5, 6, 7, 8], cells: 4 }];

  it("التقرير بيقول اللوحة رجعت منين وبين أنهي لوحتين", () => {
    const r = buildBatchReport(realInput({ cohereRescued: rescued }));
    expect(r.cohereRescued).toEqual(rescued);
    const t = reportText(r);
    expect(t).toContain("رجعت من كوهير");
    expect(t).toContain("ردي1204 — الموديل سكت عليها");
    expect(t).toContain("بين اعل8947 ودحب8646");
    expect(t).toContain("كوهير سمعها في 4 مقطع");
  });

  it("من غير إنقاذ مافيش القسم", () => {
    const r = buildBatchReport(realInput());
    expect(r.cohereRescued).toBeUndefined();
    expect(reportText(r)).not.toContain("رجعت من كوهير");
  });
});

import { describe, expect, it } from "vitest";
import {
  chunkScanTiming,
  mapChunkFields,
  noteOf,
  type ChunkPlateRow,
} from "./chunksResult";

/**
 * الحالات دي **من مخرج السيرفر الحقيقي** على شريط المالك (١٠ سبتمبر)،
 * مش مخترعة. الربط ده لو غلط، النوع يظهر **على اللوحة الغلط** — وهي
 * الغلطة اللي المالك شافها في الفوري قبل كده، فمستحقّة اختبار.
 */
const REAL: ChunkPlateRow[] = [
  { plate: "دسر5210", support: 1, condition: "مركونه" },
  { plate: "ررس8194", support: 1, condition: "متربه" },
  { plate: "ابس2985", support: 1 },
  { plate: "حبك5270", support: 2, type: "فان" },
  { plate: "بسل8763", support: 2, type: "ونيت" },
  { plate: "درر9200", support: 2, type: "اتش١" },
  { plate: "حهه6816", support: 3, type: "شاص" },
  {
    plate: "حند9003",
    support: 3,
    place: "برحه يمين",
    place_effective: "برحه يمين",
  },
  { plate: "حهد4197", support: 2, place_effective: "برحه يمين" },
  { plate: "ربس6497", support: 2, place_effective: "برحه يمين" },
];

const asPlates = (xs: string[]) => xs.map((plate) => ({ plate }));

describe("mapChunkFields", () => {
  it("يربط مخرج السيرفر الحقيقي على نفس الترتيب", () => {
    const out = mapChunkFields(REAL, asPlates(REAL.map((r) => r.plate)));
    expect(out[0]).toEqual({ vehicleType: undefined, note: "مركونه" });
    expect(out[3]).toEqual({ vehicleType: "فان", note: undefined });
    expect(out[6]).toEqual({ vehicleType: "شاص", note: undefined });
    expect(out[7]).toEqual({ vehicleType: undefined, note: "برحه يمين" });
  });

  /**
   * 🔴 المالك (٢٩ سبتمبر ٢٠٢٦): «لما يتقال مرة يبقى قصاد اللوحة — يعني أنا بقول
   * الأول حبك١٢٣٤ وبعدها أقول فان، تبقى قدام حبك١٢٣٤ فقط».
   * ⇒ المكان مابيتنسخش على اللوحات اللي بعده (`place_effective` مابيدخلش).
   * قبلها «جراج» اتقالت ١٩ مرة في الأشرطة وظهرت على ٩٥ لوحة.
   */
  it("🔴 المكان بيفضل قدام لوحته بس — مابيتنسخش على اللي بعدها", () => {
    const out = mapChunkFields(REAL, asPlates(REAL.map((r) => r.plate)));
    expect(out[7].note).toBe("برحه يمين"); // اتقال هنا
    expect(out[8].note).toBeUndefined(); // ساري بس — ماتقالش
    expect(out[9].note).toBeUndefined();
  });

  it("🔴 بيربط بنص اللوحة مش بالترتيب — المراجعة بتعيد الترتيب", () => {
    const shuffled = asPlates(["حهه6816", "دسر5210", "حبك5270"]);
    const out = mapChunkFields(REAL, shuffled);
    expect(out[0].vehicleType).toBe("شاص");
    expect(out[1].note).toBe("مركونه");
    expect(out[2].vehicleType).toBe("فان");
  });

  it("لوحة المراجعة صحّحتها بتتربط بالمسموع", () => {
    const out = mapChunkFields(
      [{ plate: "حهد4190", type: "ونيت" }],
      [{ plate: "حهد4197", heardPlate: "حهد4190" }]
    );
    expect(out[0].vehicleType).toBe("ونيت");
  });

  /**
   * 🔴 مراجعة ٣ أكتوبر (عيب ٧): المراجعة صحّحت لوحة **لنص صف تاني بالظبط**.
   * قبلها `take(plate)` كان الأول ⇒ اللوحة المصحّحة بتاخد حقول العربية التانية،
   * والعربية التانية بتطلع فاضية. المسموع هو مفتاح السيرفر ⇒ هو الأول.
   */
  it("🔴 تصحيح لنص صف تاني مايسرقش حقوله — المسموع الأول", () => {
    const out = mapChunkFields(
      [
        { plate: "حهد4190", type: "ونيت" },
        { plate: "حهد4197", type: "نقل" },
      ],
      [
        { plate: "حهد4197", heardPlate: "حهد4190" },
        { plate: "حهد4197", heardPlate: "حهد4197" },
      ]
    );
    expect(out[0].vehicleType).toBe("ونيت");
    expect(out[1].vehicleType).toBe("نقل");
  });

  it("🔴 صف المسموع اتاخد خلاص ⇒ فاضية، مش حقول صف بنص التصحيح", () => {
    const out = mapChunkFields(
      [
        { plate: "حهد4190", type: "ونيت" },
        { plate: "حهد4197", type: "نقل" },
      ],
      [
        { plate: "حهد4190", heardPlate: "حهد4190" },
        { plate: "حهد4197", heardPlate: "حهد4190" },
        { plate: "حهد4197", heardPlate: "حهد4197" },
      ]
    );
    expect(out[0].vehicleType).toBe("ونيت");
    expect(out[1]).toEqual({ vehicleType: undefined, note: undefined });
    expect(out[2].vehicleType).toBe("نقل");
  });

  it("مسموع مش من مفاتيح السيرفر (تطبيع مختلف) ⇒ نرجع لنص اللوحة", () => {
    const out = mapChunkFields(
      [{ plate: "حهد4197", type: "ونيت" }],
      [{ plate: "حهد4197", heardPlate: "حهد٤١٩٧" }]
    );
    expect(out[0].vehicleType).toBe("ونيت");
  });

  it("لوحة مش في مخرج السيرفر بترجع فاضية مش بحقول غيرها", () => {
    const out = mapChunkFields(REAL, asPlates(["زور9999"]));
    expect(out[0]).toEqual({ vehicleType: undefined, note: undefined });
  });

  it("🔴 لوحتين بنفس النص كل واحدة بتاخد صفّها مش نفس الصف", () => {
    const rows: ChunkPlateRow[] = [
      { plate: "ابح1234", type: "ونيت" },
      { plate: "ابح1234", type: "نقل" },
    ];
    const out = mapChunkFields(rows, asPlates(["ابح1234", "ابح1234"]));
    expect(out[0].vehicleType).toBe("ونيت");
    expect(out[1].vehicleType).toBe("نقل");
  });

  it("الحالة والمكان بيتلمّوا في الملاحظة بفاصل ·", () => {
    expect(
      noteOf({ plate: "x", condition: "مركونه", place: "برحه يمين" })
    ).toBe("مركونه · برحه يمين");
  });

  it("🔴 المسموع عند اللوحة بس — الساري من لوحة قبلها مابيدخلش (قرار المالك)", () => {
    expect(noteOf({ plate: "x", place: "مظله", place_effective: "جراج" })).toBe(
      "مظله"
    );
    expect(noteOf({ plate: "x", condition: "مركونه", place_effective: "جراج" })).toBe(
      "مركونه"
    );
  });

  it("قيم فاضية أو مسافات مابتعملش ملاحظة وهمية", () => {
    expect(noteOf({ plate: "x", condition: "  ", place: null })).toBeUndefined();
    expect(noteOf(undefined)).toBeUndefined();
  });
});

/**
 * ==========================================================================
 *  توقيت «كامل ⚡» — الغلطة اللي كانت بتبيّض الصفحة
 * ==========================================================================
 *
 *  🔴 `runChunksTranscription` كان بيكتب `{totalMs, calls, windows} as any`
 *  في حالة نوعها `{ms, segments, audioSec}`. الـ`as any` خرّس `tsc`،
 *  والعرض بيقرا `scanTiming.audioSec.toFixed(1)` ⇒ `undefined.toFixed`
 *  ⇒ استثناء وقت الرسم. ومافيش `ErrorBoundary` في المشروع كله (صفر نتيجة)
 *  ⇒ الجذر بيتفكّ و**المندوب يشوف صفحة بيضا** بدل لوحاته.
 *
 *  وماكانش بيتمسك: قِست المسار من `curl` على الـAPI، والـAPI سليم —
 *  الانهيار في الرسم، واللي بيتفرّج على الشبكة مايشوفهوش.
 */
describe("chunkScanTiming", () => {
  const DATA = { calls: 3, ms: 3120, dur_s: 42.3, realtime_x: 13.6 };

  it("🔴 بيطلّع المفاتيح التلاتة اللي العرض بيقراها", () => {
    const t = chunkScanTiming(DATA, 3400);
    expect(t.audioSec).toBeCloseTo(42.3);
    expect(t.segments).toBe(3);
    expect(t.ms).toBeGreaterThan(0);
    // العرض بيعمل .toFixed على الاتنين دول — لازم يكونوا أرقام حقيقية
    expect(Number.isFinite(t.audioSec)).toBe(true);
    expect(Number.isFinite(t.ms)).toBe(true);
  });

  it("🔴 نفس الحسابات اللي في العرض مابترميش ومابتطلّعش NaN", () => {
    const t = chunkScanTiming(DATA, 3400);
    expect(() => t.audioSec.toFixed(1)).not.toThrow();
    expect((t.ms / 1000).toFixed(1)).not.toContain("NaN");
    expect((t.ms / t.segments / 1000).toFixed(2)).not.toContain("NaN");
  });

  it("رد ناقص أو غريب مايكسرش العرض", () => {
    for (const bad of [{}, null, undefined, { calls: 0, dur_s: 0 }, { calls: "x", dur_s: "y", ms: "z" }]) {
      const t = chunkScanTiming(bad as never, 1200);
      expect(Number.isFinite(t.ms)).toBe(true);
      expect(Number.isFinite(t.audioSec)).toBe(true);
      expect(Number.isFinite(t.segments)).toBe(true);
      // 🔴 صفر مقاطع بيعمل قسمة على صفر في العرض ⇒ الأقل مقطع واحد
      expect(t.segments).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(t.ms / t.segments)).toBe(true);
    }
  });

  it("الزمن المقيس عند العميل بيغلب — بيشمل الشبكة اللي المندوب بيستناها", () => {
    const t = chunkScanTiming(DATA, 5000);
    expect(t.ms).toBe(5000);
  });

  it("زمن عميل غير منطقي بيرجع لزمن السيرفر", () => {
    expect(chunkScanTiming(DATA, 0).ms).toBe(3120);
    expect(chunkScanTiming(DATA, -5).ms).toBe(3120);
    expect(chunkScanTiming(DATA, Number.NaN).ms).toBe(3120);
  });
});

/**
 * وقت اللوحة لازم يعدّي مع حقولها — بنفس الربط بالظبط.
 *
 * 🔴 لو الوقت اتربط بالترتيب والحقول بالنص، لوحة بتاخد **وقت لوحة تانية**
 * ⇒ دبوس موقع في مكان تاني وشارع غلط. فمصدر واحد للربط.
 */
describe("mapChunkFields — وقت النطق", () => {
  it("الوقت بيوصل مع الحقول", () => {
    const out = mapChunkFields(
      [{ plate: "ابح1234", type: "ونيت", t_s: 12.72 }],
      [{ plate: "ابح1234" }]
    );
    expect(out[0].timeStart).toBeCloseTo(12.72);
    expect(out[0].vehicleType).toBe("ونيت");
  });

  it("🔴 وقت صفر = أول الشريط، مش «مافيش وقت»", () => {
    const out = mapChunkFields([{ plate: "ابح1234", t_s: 0 }], [{ plate: "ابح1234" }]);
    expect(out[0].timeStart).toBe(0);
  });

  it("سيرفر قديم بلا t_s مايكسرش حاجة", () => {
    const out = mapChunkFields([{ plate: "ابح1234", type: "نقل" }], [{ plate: "ابح1234" }]);
    expect(out[0].timeStart).toBeUndefined();
    expect(out[0].vehicleType).toBe("نقل");
  });

  it("t_s فاضي أو غريب بيتعامل كمافيش وقت", () => {
    for (const bad of [null, undefined, Number.NaN, "x" as never]) {
      const out = mapChunkFields([{ plate: "ابح1234", t_s: bad }], [{ plate: "ابح1234" }]);
      expect(out[0].timeStart).toBeUndefined();
    }
  });

  it("🔴 لوحتين بنفس النص: كل واحدة بوقتها هي", () => {
    const out = mapChunkFields(
      [
        { plate: "ابح1234", t_s: 3.5 },
        { plate: "ابح1234", t_s: 41.2 },
      ],
      [{ plate: "ابح1234" }, { plate: "ابح1234" }]
    );
    expect(out[0].timeStart).toBeCloseTo(3.5);
    expect(out[1].timeStart).toBeCloseTo(41.2);
  });

  it("الترتيب الزمني بيفضل صاعد على مخرج السيرفر الحقيقي", () => {
    const rows: ChunkPlateRow[] = [
      { plate: "دسر5210", t_s: 1.82 },
      { plate: "ررس8194", t_s: 5.45 },
      { plate: "ابس2985", t_s: 9.09 },
      { plate: "حبك5270", t_s: 12.72 },
    ];
    const out = mapChunkFields(rows, rows.map((r) => ({ plate: r.plate })));
    const ts = out.map((o) => o.timeStart!);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });
});

/**
 * 📍 **لوحة من غير `t_s` ⇒ وقت السيرفر التقريبي `t_slot`** (١٦ نوفمبر ٢٠٢٦ — شكوى «تسجيل ٦ دقايق فيه لوحات من غير موقع»).
 * تقارير الموبايل على إيطاليا (٥١٤ تسجيل): نص اللوحات اللي من غير موقع سببها «اللوحة مالهاش لحظة نطق» (٦٣ من ١٢٧)،
 * والسيرفر بيبعت جنبها `t_slot` دايماً وماشي بنفس الترتيب. الصفوف هنا **بالحرف** من `20261115-074009` و`20261114-101456`.
 */
describe("mapChunkFields — `t_slot` لما `t_s` مش موجود", () => {
  const at = (rows: ChunkPlateRow[]) => mapChunkFields(rows, rows.map((r) => ({ plate: r.plate }))).map((o) => o.timeStart);

  it("بين اللي قبلها واللي بعدها ⇒ `t_slot` نفسه", () => {
    expect(at([
      { plate: "ابح1111", t_s: 147.2, t_slot: 145.85 },
      { plate: "ابح2222", t_s: null, t_slot: 149.12 },
      { plate: "ابح3333", t_s: null, t_slot: 152.4 },
      { plate: "ابح4444", t_s: 152.63, t_slot: 152.54 },
    ])).toEqual([147.2, 149.12, 152.4, 152.63]);
  });

  it("برّه اللي قبلها واللي بعدها ⇒ النص بينهم (الترتيب مايتلخبطش)", () => {
    expect(at([
      { plate: "ابح1111", t_s: 55.03, t_slot: 55.39 },
      { plate: "ابح2222", t_s: null, t_slot: 60.66 },
      { plate: "ابح3333", t_s: 58.14, t_slot: 67.6 },
    ])).toEqual([55.03, (55.03 + 58.14) / 2, 58.14]);
  });

  it("أول لوحة أو آخر لوحة (ناحية واحدة بس) ⇒ `t_slot`", () => {
    expect(at([
      { plate: "ابح1111", t_s: null, t_slot: 3.4 },
      { plate: "ابح2222", t_s: 5.1, t_slot: 5.3 },
      { plate: "ابح3333", t_s: null, t_slot: 9.8 },
    ])).toEqual([3.4, 5.1, 9.8]);
  });

  it("`t_s` موجود ⇒ هو بس (حتى لو `t_slot` بعيد) · ولا ده ولا ده ⇒ من غير وقت زي الأول", () => {
    expect(at([
      { plate: "ابح1111", t_s: 58.14, t_slot: 67.6 },
      { plate: "ابح2222" },
      { plate: "ابح3333", t_s: 0, t_slot: 1.2 },
    ])).toEqual([58.14, undefined, 0]);
  });
});

/**
 * 🚚 **«نقليات» ⇒ «نقل»** (١٦ نوفمبر ٢٠٢٦ — المالك: «لما بيقول نقل بتتكتب نقليات … لو محدش بيقول نقليات شيلها»).
 * أرشيف التفريغ على إيطاليا: ولا مندوب نطق «نقليات» (صفر)، والسيرفر طلّعها نوع ٢٦ مرة كلها عند مندوب واحد بيقول «نقل»
 * والتفريغ بيكتبها «نقلة» (١٤٧ مرة) فبتتقرّب على نطق «نقليه». السيرفر مابيتلمسش ⇒ الصفحة بتصلّحها.
 */
describe("mapChunkFields — «نقليات» من السيرفر تتكتب «نقل»", () => {
  it("النوع", () => {
    const out = mapChunkFields(
      [{ plate: "بحل7620", type: "نقليات" }, { plate: "ايع3130", type: "نقل" }, { plate: "ابح1111", type: "ونيت" }],
      [{ plate: "بحل7620" }, { plate: "ايع3130" }, { plate: "ابح1111" }],
    );
    expect(out.map((o) => o.vehicleType)).toEqual(["نقل", "نقل", "ونيت"]);
  });
});

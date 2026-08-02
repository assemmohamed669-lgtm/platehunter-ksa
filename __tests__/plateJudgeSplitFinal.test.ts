import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  lastPlateWordSpan,
  provePlateSpanAcrossFinals,
  type DgWord,
  type DgFinal,
} from "@/lib/deepgramWords";
import {
  planPlateWindow,
  planJudgeSlice,
  JUDGE_WORD_PAD_MS,
  JUDGE_MAX_PLATE_SPAN_MS,
  JUDGE_MAX_INNER_PAUSE_MS,
  JUDGE_MAX_SPLIT_SPAN_MS,
} from "@/lib/plateJudgeClient";
import { JUDGE_OUTCOME_CODES, describeJudgeOutcome, shortJudgeReason } from "@/lib/plateJudgeLog";

// ─────────────────────────────────────────────────────────────────────────────
// عيب ٤ (الأكبر): لوحة واحدة منطوقة على **نتيجتين نهائيتين** = سكوت
// =============================================================================
// المالك بيسكت وسط اللوحة («حروف … سكتة … أرقام»). المقيس على صوته:
//   • ٩ لوحات من ٣٠ فيها وقفة جوّانية، وأطولها **٩٣٠ms**
//   • أضيق سكتة **بين لوحتين**: **٤٦٠ms**
//   ⇒ التوزيعان متقاطعان: مافيش عتبة فجوة تفصلهم (`segmentByGap(0.65)` اتجرّبت
//     وفشلت من الناحيتين — مش هترجع).
// وبما إن `endpointing=100`، Deepgram بينهّي **نص اللوحة**: الحروف في نتيجة
// والأرقام في اللي بعدها. المحلّل بيلمّها بالـcarry-over فالصف بيطلع صح، بس
// نافذة الطيّار مبنية على كلمات **النتيجة الأخيرة بس** ⇒ `lastPlateWordSpan`
// مالاقاش لوحة الصف ⇒ سكوت (`window_unproven` / `carried_over`).
//
// الحل: نفس البناء-من-الآخر-لورا + **نفس التحقّق**، بس على كلمات آخر N نتيجة
// **موصولة**. التحقّق هو الأمان: اللوحة المجمّعة لازم تطبّق لوحة الصف بالظبط،
// وإلا سكوت زي النهاردة.
//
// الأرقام هنا كلها من نفس القياس اللي في `plateJudgeLastPlate.test.ts`
// (خط زمن ميديا واحد + VAD طاقة + سؤال الموديل الحي عن كل منطقة كلام لوحدها).
// ─────────────────────────────────────────────────────────────────────────────

function w(word: string, startMs: number, endMs: number): DgWord {
  return { word, start: startMs / 1000, end: endMs / 1000 };
}

/** لوحة ٣ في جلسة المالك: «ميم حاء كاف» (٦٩٠٠–٧٩٤٠) … وقفة ٣٩٠ … «٣٠٨٠» (٨٣٣٠–٩٦١٠). */
const SPLIT_03 = {
  letters: [w("ميم", 6900, 7180), w("حاء", 7300, 7580), w("كاف", 7700, 7940)],
  digits: [w("3080", 8330, 9610)],
  prevPlateEnd: 6080,        // لوحة ٢ (اوب٢٣٩٩) خلصت هنا
  plate: "محك3080",
};
/** لوحة ١٥ (ببب٤٥٦٧): أطول وقفة جوّانية مقيسة في الجلسة = ٩٣٠ms. */
const SPLIT_15 = {
  letters: [w("باء", 46290, 46580), w("باء", 46600, 46790), w("باء", 46810, 46940)],
  digits: [w("4567", 47870, 49230)],
  prevPlateEnd: 44940,       // لوحة ١٤ (ررص٥٥٥٥)
  nextPlateStart: 49700,     // لوحة ١٦ (كهط٥٢٥١)
  plate: "ببب4567",
};

/** تاريخ نتيجتين: الحروف في الأولى والأرقام في التانية. */
function twoFinals(
  letters: DgWord[], digits: DgWord[], prevEnd: number | null,
): DgFinal[] {
  const lastLetterEnd = Math.round((letters[letters.length - 1].end as number) * 1000);
  return [
    { words: letters, prevWordEndMs: prevEnd },
    { words: digits, prevWordEndMs: lastLetterEnd },
  ];
}

describe("الوقيعة نفسها: النتيجة الأخيرة لوحدها مافيهاش لوحة الصف", () => {
  it("`lastPlateWordSpan` على الأرقام لوحدها = null (وده صح — مش الباج)", () => {
    expect(lastPlateWordSpan(SPLIT_03.digits, SPLIT_03.plate)).toBeNull();
    expect(lastPlateWordSpan(SPLIT_15.digits, SPLIT_15.plate)).toBeNull();
  });

  it("والنتيجة: `planPlateWindow` بيسكت رغم إن الصف صح والصوت كله موجود", () => {
    const p = planPlateWindow({
      words: SPLIT_03.digits, expectPlateNorm: SPLIT_03.plate,
      prevWordEndMs: 7940, wordStartMs: 8330, wordEndMs: 9610,
      arrivalMs: 10610, mediaElapsedMs: 10610, streamFresh: true,
    });
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toBe("window_unproven");
  });
});

describe("provePlateSpanAcrossFinals — نفس البناء والتحقّق على كلمات موصولة", () => {
  it("لوحة ٣: بتلمّ الحروف من النتيجة السابقة والأرقام من الحالية", () => {
    const proof = provePlateSpanAcrossFinals(
      twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd), SPLIT_03.plate);
    expect(proof).not.toBeNull();
    expect(proof!.span.startMs).toBe(6900);
    expect(proof!.span.endMs).toBe(9610);
    expect(proof!.crossed).toBe(true);
    expect(proof!.finalsUsed).toBe(2);
    // حدّ الجار = آخر كلمة قبل النطق. هنا النطق أول كلمة في التاريخ ⇒ الحدّ
    // المحفوظ مع أقدم نتيجة (نهاية كلام لوحة ٢).
    expect(proof!.neighbourEndMs).toBe(SPLIT_03.prevPlateEnd);
    expect(proof!.nextPlateStartMs).toBeNull();
  });

  it("لوحة ١٥ (وقفة ٩٣٠ms — أطول مقيسة): بتلمّها كلها", () => {
    const proof = provePlateSpanAcrossFinals(
      twoFinals(SPLIT_15.letters, SPLIT_15.digits, SPLIT_15.prevPlateEnd), SPLIT_15.plate);
    expect(proof).not.toBeNull();
    expect(proof!.span.startMs).toBe(46290);
    expect(proof!.span.endMs).toBe(49230);
    expect(47870 - 46940).toBe(930);                      // الوقفة المقيسة
  });

  it("**التحقّق محفوظ**: لوحة تانية = null (سكوت، مافيش تخمين)", () => {
    const finals = twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd);
    expect(provePlateSpanAcrossFinals(finals, "محك3081")).toBeNull();
    expect(provePlateSpanAcrossFinals(finals, "بدك1588")).toBeNull();
    expect(provePlateSpanAcrossFinals(finals, "")).toBeNull();
  });

  it("مافيش تاريخ = مافيش إثبات (فشل مغلق)", () => {
    expect(provePlateSpanAcrossFinals([], SPLIT_03.plate)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(provePlateSpanAcrossFinals(null as any, SPLIT_03.plate)).toBeNull();
    expect(provePlateSpanAcrossFinals(
      [{ words: SPLIT_03.digits, prevWordEndMs: 7940 }], SPLIT_03.plate)).toBeNull();
  });

  it("كلمة بلا توقيت جوّه النطق = null", () => {
    const finals: DgFinal[] = [
      { words: [{ word: "ميم" }, ...SPLIT_03.letters.slice(1)], prevWordEndMs: 6080 },
      { words: SPLIT_03.digits, prevWordEndMs: 7940 },
    ];
    expect(provePlateSpanAcrossFinals(finals, SPLIT_03.plate)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// السقف + حماية الجار — الرقمين اللي بيمنعوا النافذة تبلع لوحة الجار
// =============================================================================
// السقف: أطول نطق لوحة مقيس (٣٣٤٠ms) + أطول وقفة جوّانية مقيسة (٩٣٠ms) = ٤٢٧٠ms.
// وفوقه **مابنقصّش من النهاية** زي المسار الأحادي — القصّ من النهاية هنا معناه
// إننا نرمي **حروف اللوحة** (هي أول نص النطق) ونبعت أرقام لوحدها، وده بالظبط
// المدخل اللي الموديل بيغلط فيه. فوق السقف = **سكوت مسمّى** (`split_too_long`).
//
// حماية الجار: حدّ `prevWordEndMs` القديم بقى **بلا قيمة** على المسار ده، لأنه
// نهاية النتيجة **السابقة** — واللي هي في حالة اللوحة المقسومة نهاية **حروف
// اللوحة نفسها**، فـ`min(prevWordEnd, span.start)` بترجّع `span.start` دايماً
// (الحدّ بيلغي نفسه). اللي بيحلّ مكانه: **نهاية آخر كلمة قبل النطق جوّه الكلمات
// الموصولة** (والحدّ المحفوظ مع أقدم نتيجة لو النطق أولها)، وعلى الناحية التانية
// **بداية أول كلمة فيها مادة لوحة بعد النطق** — يعني الجار بيحدّد الطرفين بكلماته
// هو زي ما Deepgram قالها، مش بتقدير.
// ─────────────────────────────────────────────────────────────────────────────
describe("السقف: ٣٣٤٠ + ٩٣٠ = ٤٢٧٠ms، وفوقه سكوت مش قصّ", () => {
  it("الثوابت مبنية على المقيس، مش أرقام مخترعة", () => {
    expect(JUDGE_MAX_PLATE_SPAN_MS).toBe(3340);        // أطول نطق لوحة مقيس
    expect(JUDGE_MAX_INNER_PAUSE_MS).toBe(930);        // أطول وقفة جوّانية مقيسة
    expect(JUDGE_MAX_SPLIT_SPAN_MS).toBe(4270);
  });

  it("نطق مقسوم بالظبط عند السقف بيعدّي", () => {
    const letters = [w("باء", 10000, 10200), w("طاء", 10250, 10450), w("نون", 10500, 10730)];
    const digits = [w("3333", 13770, 14270)];           // ١٤٢٧٠ − ١٠٠٠٠ = ٤٢٧٠
    const p = planPlateWindow({
      words: digits, expectPlateNorm: "بطن3333",
      finals: twoFinals(letters, digits, 9000),
      wordStartMs: 13770, wordEndMs: 14270,
      arrivalMs: 15270, mediaElapsedMs: 15270, streamFresh: true,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.source).toBe("plate_words_split");
    expect(p.endMs - p.startMs).toBe(4270 + 2 * JUDGE_WORD_PAD_MS);
  });

  it("ms واحدة فوق السقف = `split_too_long` — **ومافيش نافذة** (مش قصّ من النهاية)", () => {
    const letters = [w("باء", 10000, 10200), w("طاء", 10250, 10450), w("نون", 10500, 10730)];
    const digits = [w("3333", 13771, 14271)];
    const p = planPlateWindow({
      words: digits, expectPlateNorm: "بطن3333",
      finals: twoFinals(letters, digits, 9000),
      wordStartMs: 13771, wordEndMs: 14271,
      arrivalMs: 15271, mediaElapsedMs: 15271, streamFresh: true,
    });
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toBe("split_too_long");
  });

  it("`split_too_long` في قايمة السجل بجملة ولافتة مميّزة", () => {
    expect(JUDGE_OUTCOME_CODES).toContain("split_too_long");
    expect(describeJudgeOutcome("split_too_long")).not.toBe("split_too_long");
    expect(shortJudgeReason("split_too_long")).not.toBe("split_too_long");
    expect(shortJudgeReason("split_too_long").length).toBeLessThan(24);
    for (const other of ["window_unproven", "carried_over", "no_timing"]) {
      expect(describeJudgeOutcome("split_too_long")).not.toBe(describeJudgeOutcome(other));
      expect(shortJudgeReason("split_too_long")).not.toBe(shortJudgeReason(other));
    }
  });
});

describe("حماية الجار على المسار المقسوم — الكلمات، مش prevWordEndMs", () => {
  it("النافذة الكاملة للوحة ٣: بتشيل النطق كله وماتلمسش لوحة ٢", () => {
    const p = planPlateWindow({
      words: SPLIT_03.digits, expectPlateNorm: SPLIT_03.plate,
      finals: twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd),
      prevWordEndMs: 7940,                       // الحدّ القديم (نهاية حروف اللوحة نفسها)
      wordStartMs: 8330, wordEndMs: 9610,
      arrivalMs: 10610, mediaElapsedMs: 10610, streamFresh: true,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.source).toBe("plate_words_split");
    expect(p.startMs).toBe(6900 - JUDGE_WORD_PAD_MS);   // ٦٦٥٠
    expect(p.endMs).toBe(9610 + JUDGE_WORD_PAD_MS);     // ٩٨٦٠
    expect(p.startMs).toBeGreaterThan(SPLIT_03.prevPlateEnd);  // ولا ms من لوحة ٢
    // الحدّ القديم لوحده كان بيلغي الحشوة كلها (`min(7940, 6900) = 6900`)…
    expect(Math.min(7940, 6900)).toBe(6900);
    // …والحدّ الجديد سايبها لأن فيه مساحة (٦٩٠٠ − ٦٠٨٠ = ٨٢٠ > ٢٥٠).
    expect(6900 - SPLIT_03.prevPlateEnd).toBe(820);
  });

  it("جار **في نفس النتيجة** قبل الحروف: الحدّ بيقف على نهاية كلمته بالظبط", () => {
    // شكل مقيس: لوحة ٢٧ (سبع٥٠٨٠) خلصت ٨٧٢٣٠، وحروف لوحة ٢٨ بدأت بعدها بـ١٠٠ms
    // في **نفس** النتيجة، وأرقامها في اللي بعدها. حشوة ٢٥٠ عمياء كانت هتدخل
    // ١٥٠ms جوّه «٥٠٨٠».
    const finals: DgFinal[] = [
      {
        words: [
          w("سين", 85030, 85630), w("باء", 85700, 86300), w("عين", 86400, 86900),
          w("5080", 87000, 87230),
          w("كاف", 87330, 87600), w("كاف", 87650, 87800), w("باء", 87850, 87980),
        ],
        prevWordEndMs: 84570,
      },
      { words: [w("0093", 88500, 90110)], prevWordEndMs: 87980 },
    ];
    const proof = provePlateSpanAcrossFinals(finals, "ككب0093");
    expect(proof).not.toBeNull();
    expect(proof!.span.startMs).toBe(87330);
    expect(proof!.neighbourEndMs).toBe(87230);          // نهاية «٥٠٨٠»
    const p = planPlateWindow({
      words: finals[1].words, expectPlateNorm: "ككب0093", finals,
      prevWordEndMs: 87980, wordStartMs: 88500, wordEndMs: 90110,
      arrivalMs: 91110, mediaElapsedMs: 91110, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.startMs).toBe(87230);                      // مش ٨٧٠٨٠ (١٥٠ms تسريب)
    expect(87330 - JUDGE_WORD_PAD_MS).toBe(87080);
  });

  it("جار **بعد** النطق: النهاية عمرها ما توصل كلمته (سقف بكلماته هو)", () => {
    // لوحة ١٥ أرقامها في أول النتيجة واللي بعدها لوحة ١٦ في نفس النتيجة.
    const finals: DgFinal[] = [
      { words: SPLIT_15.letters, prevWordEndMs: SPLIT_15.prevPlateEnd },
      {
        words: [
          ...SPLIT_15.digits,
          w("كاف", 49700, 50250), w("هاء", 50300, 50850), w("طاء", 50900, 51400),
          w("5251", 51450, 51930),
        ],
        prevWordEndMs: 46940,
      },
    ];
    const proof = provePlateSpanAcrossFinals(finals, SPLIT_15.plate);
    expect(proof).not.toBeNull();
    expect(proof!.span.endMs).toBe(49230);
    expect(proof!.nextPlateStartMs).toBe(SPLIT_15.nextPlateStart);
    const p = planPlateWindow({
      words: finals[1].words, expectPlateNorm: SPLIT_15.plate, finals,
      prevWordEndMs: 46940, wordStartMs: 47870, wordEndMs: 51930,
      arrivalMs: 52930, mediaElapsedMs: 52930, streamFresh: true,
    });
    if (!p.ok) return;
    // النهاية = min(نطق + ٢٥٠, بداية الجار − ٢٥٠) ⇒ ٤٩٤٥٠، فالحشوة عمرها ما
    // تلمس «كاف» بتاعة لوحة ١٦ (٤٩٧٠٠) ولا نافذتها (بتبدأ ٤٩٤٥٠).
    expect(p.endMs).toBe(49450);
    expect(p.endMs).toBeLessThanOrEqual(SPLIT_15.nextPlateStart - JUDGE_WORD_PAD_MS);
    expect(p.startMs).toBe(46290 - JUDGE_WORD_PAD_MS);
  });
});

describe("المسار الأحادي **مالمسوش** — كل صف بيجاوب النهاردة نافذته بالحرف", () => {
  const plate16 = [
    w("كاف", 49700, 50250), w("هاء", 50300, 50850), w("طاء", 50900, 51400),
    w("5251", 51450, 51930),
  ];

  it("نفس الدخل + تاريخ كامل ⇒ نفس النافذة ونفس المصدر", () => {
    const base = {
      words: plate16, expectPlateNorm: "كهط5251", prevWordEndMs: 49230,
      wordStartMs: 49700, wordEndMs: 51930,
      arrivalMs: 52930, mediaElapsedMs: 52930, streamFresh: true,
    };
    const noHist = planPlateWindow(base);
    const withHist = planPlateWindow({
      ...base,
      finals: [
        { words: SPLIT_15.letters, prevWordEndMs: 44940 },
        { words: SPLIT_15.digits, prevWordEndMs: 46940 },
        { words: plate16, prevWordEndMs: 49230 },
      ],
    });
    expect(withHist).toEqual(noHist);
    if (!withHist.ok) return;
    expect(withHist.source).toBe("plate_words");
    expect(withHist.startMs).toBe(49450);
    expect(withHist.endMs).toBe(52180);
  });

  it("المسار المقسوم بيجرى **بس** لما الأحادي يفشل", () => {
    // لو الأحادي لاقى اللوحة، وجود التاريخ مايقدرش يوسّع النافذة لورا.
    const p = planPlateWindow({
      words: plate16, expectPlateNorm: "كهط5251",
      finals: [
        { words: [...SPLIT_15.letters, ...SPLIT_15.digits], prevWordEndMs: 44940 },
        { words: plate16, prevWordEndMs: 49230 },
      ],
      wordStartMs: 49700, wordEndMs: 51930,
      arrivalMs: 52930, mediaElapsedMs: 52930, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.source).toBe("plate_words");
    expect(p.startMs).toBe(49700 - JUDGE_WORD_PAD_MS);
  });
});

describe("planJudgeSlice — المسار المقسوم جوّه نقطة القرار الوحيدة", () => {
  const common = {
    hasConfig: true, timing: null,
    chunkSizes: Array.from({ length: 400 }, () => 4000), base: 0, pausedMs: 0,
    inflight: 0, maxInflight: 2, maxQueue: 2,
  };

  it("صف اتلمّ من رسالتين (`fromCarry`) بقى **بيجاوب** لو النافذة اتثبتت", () => {
    const p = planJudgeSlice({
      ...common,
      words: SPLIT_03.digits, expectPlateNorm: SPLIT_03.plate,
      finals: twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd),
      prevWordEndMs: 7940, wordStartMs: 8330, wordEndMs: 9610,
      arrivalMs: 10610, mediaElapsedMs: 10610, streamFresh: true,
      emit: { index: 0, count: 1, fromCarry: true },
    });
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.windowSource).toBe("plate_words_split");
    expect(p.startMs).toBe(6650);
    expect(p.endMs).toBe(9860);
  });

  it("ومالقاش إثبات ⇒ لسه ساكت بنفس السبب المسمّى (`carried_over`)", () => {
    const p = planJudgeSlice({
      ...common,
      words: SPLIT_03.digits, expectPlateNorm: "دطح3100",   // لوحة تانية خالص
      finals: twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd),
      prevWordEndMs: 7940, wordStartMs: 8330, wordEndMs: 9610,
      arrivalMs: 10610, mediaElapsedMs: 10610, streamFresh: true,
      emit: { index: 0, count: 1, fromCarry: true },
    });
    expect(p.skip).toBe("carried_over");
  });

  it("**الحزام اللي باقي**: صف carry بلا كلمات عمره ما ياخد نافذة غير مثبَتة", () => {
    // الاحتياطيات (min/max · ساعة الحقيقة · نافذة جاهزة) نوافذ **رسالة**، مش
    // نطق لوحة — فمستحيل تتشارك ولا تتصدّق لصف نصّ صوته في رسالة تانية.
    const p = planJudgeSlice({
      ...common,
      words: [], expectPlateNorm: SPLIT_03.plate,
      wordStartMs: 8330, wordEndMs: 9610,
      arrivalMs: 10610, mediaElapsedMs: 10610, streamFresh: true,
      emit: { index: 0, count: 1, fromCarry: true },
    });
    expect(p.skip).toBe("carried_over");
    // ونفس الحزام لصف من رسالة بأكتر من لوحة.
    const q = planJudgeSlice({
      ...common,
      words: null, expectPlateNorm: SPLIT_03.plate,
      timing: { startMs: 6000, endMs: 9000 },
      arrivalMs: 10610, mediaElapsedMs: 10610, streamFresh: true,
      emit: { index: 1, count: 2, fromCarry: false },
    });
    expect(q.skip).toBe("multi_plate_message");
  });

  it("تيار قديم بيكسب على أي إثبات (فشل مغلق ماينكسرش)", () => {
    const p = planJudgeSlice({
      ...common,
      words: SPLIT_03.digits, expectPlateNorm: SPLIT_03.plate,
      finals: twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd),
      wordStartMs: 8330, wordEndMs: 9610, arrivalMs: 10610, mediaElapsedMs: 10610,
      streamFresh: false, emit: { index: 0, count: 1, fromCarry: true },
    });
    expect(p.skip).toBe("stale_stream");
  });

  it("جزء صوت ضايع بيلغي المسار المثبَت كله (ساعة Deepgram زحفت)", () => {
    const p = planJudgeSlice({
      ...common,
      words: SPLIT_03.digits, expectPlateNorm: SPLIT_03.plate,
      finals: twoFinals(SPLIT_03.letters, SPLIT_03.digits, SPLIT_03.prevPlateEnd),
      wordStartMs: 8330, wordEndMs: 9610, arrivalMs: 10610, mediaElapsedMs: 10610,
      streamFresh: true, audioDrops: 1, emit: { index: 0, count: 1, fromCarry: true },
    });
    expect(p.skip).toBe("carried_over");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الجلسة المعاد بناؤها: كل لوحة مقسومة + كل رسالة بلوحتين — لوحة بلوحة
// =============================================================================
// المصدر: نفس القياس اللي في `plateJudgeLastPlate.test.ts` (٤٠ منطقة كلام على خط
// زمن ميديا واحد، كل واحدة معروف تبع أنهي لوحة وهي حروفها ولا أرقامها) + جدول
// الـ٢٥ نتيجة نهائية اللي وصلت الخدمة في الجلسة الأولى.
//
// ⚠️ اللي **مقيس** هنا: مناطق الكلام وتوقيتها، وأنهي مناطق دخلت أنهي نتيجة.
//    اللي **معاد بناؤه**: النتايج «الحروف لوحدها» اللي مانتجتش أي صف (فمافيش
//    ليها سطر في سجل الخدمة). بناؤها بيتبع الوقيعة اللي المحلّل نفسه بيقولها:
//    السجل المعلَّم `fromCarry` معناه بالضبط إن نصّه الأول جا من رسالة سابقة،
//    وحدّها المحفوظ (`prevWordEndMs`) موجود في جدول النتايج المقيس.
// ─────────────────────────────────────────────────────────────────────────────
type Region = { s: number; e: number; plate: number };
/** الـ٤٠ منطقة كلام في جلسة المالك — أوراكل «كلام الجار» (٠ = كلام مش لوحة). */
const VOICED: Region[] = [
  { s: 810, e: 3100, plate: 1 }, { s: 4090, e: 6080, plate: 2 },
  { s: 6900, e: 7940, plate: 3 }, { s: 8330, e: 9610, plate: 3 },
  { s: 10190, e: 11090, plate: 4 }, { s: 11300, e: 12570, plate: 4 },
  { s: 13320, e: 15580, plate: 5 },
  { s: 16430, e: 17610, plate: 6 }, { s: 17830, e: 19190, plate: 6 },
  { s: 20030, e: 22390, plate: 7 }, { s: 23010, e: 25450, plate: 8 },
  { s: 26300, e: 28760, plate: 9 },
  { s: 29590, e: 30520, plate: 10 }, { s: 30710, e: 32230, plate: 10 },
  { s: 33350, e: 34370, plate: 11 }, { s: 34890, e: 36240, plate: 11 },
  { s: 37490, e: 39120, plate: 12 },
  { s: 39780, e: 40700, plate: 13 }, { s: 40870, e: 42200, plate: 13 },
  { s: 42830, e: 44940, plate: 14 },
  { s: 46290, e: 46940, plate: 15 }, { s: 47870, e: 49230, plate: 15 },
  { s: 49700, e: 51930, plate: 16 }, { s: 52560, e: 54860, plate: 17 },
  { s: 55790, e: 56150, plate: 18 }, { s: 57050, e: 58000, plate: 18 },
  { s: 59270, e: 61450, plate: 19 }, { s: 61920, e: 64280, plate: 20 },
  { s: 65280, e: 67480, plate: 21 }, { s: 68190, e: 71070, plate: 22 },
  { s: 72010, e: 74310, plate: 23 }, { s: 74830, e: 75370, plate: 0 },
  { s: 76180, e: 79110, plate: 24 },
  { s: 79840, e: 80710, plate: 25 }, { s: 80830, e: 81930, plate: 25 },
  { s: 82470, e: 84570, plate: 26 }, { s: 85030, e: 87230, plate: 27 },
  { s: 87980, e: 90110, plate: 28 }, { s: 93500, e: 95780, plate: 29 },
  { s: 96250, e: 98390, plate: 30 },
];
const GOLD: Record<number, string> = {
  3: "محك3080", 11: "قدر1030", 13: "دطح3100", 15: "ببب4567", 16: "كهط5251",
  18: "دصد3366", 25: "كدط5066", 26: "بدك1588", 27: "سبع5080",
};
const LETTER_NAME: Record<string, string> = {
  ا: "الف", ب: "باء", ح: "حاء", د: "دال", ر: "راء", س: "سين", ص: "صاد",
  ط: "طاء", ع: "عين", ق: "قاف", ك: "كاف", ل: "لام", م: "ميم", ن: "نون",
  ه: "هاء", و: "واو", ي: "ياء",
};

/** حروف لوحة موزّعة على منطقة كلام. */
function letterWords(plate: string, r: Region): DgWord[] {
  const step = (r.e - r.s) / 3;
  return [0, 1, 2].map((k) => w(LETTER_NAME[plate[k]],
    Math.round(r.s + k * step), Math.round(k === 2 ? r.e : r.s + (k + 1) * step - 40)));
}
/** نطق لوحة كامل جوّه منطقة واحدة (٣ حروف + مجموعة أرقام). */
function plateWords(plate: string, r: Region): DgWord[] {
  const step = (r.e - r.s) / 4;
  return [
    ...[0, 1, 2].map((k) => w(LETTER_NAME[plate[k]],
      Math.round(r.s + k * step), Math.round(r.s + (k + 1) * step - 40))),
    w(plate.slice(3), Math.round(r.s + 3 * step), r.e),
  ];
}
/** ms من نطق **لوحة تانية** جوّه النافذة — الرقم اللي لازم يبقى صفر. */
function neighbourMs(startMs: number, endMs: number, own: number): number {
  return VOICED.filter((v) => v.plate !== own && v.plate !== 0).reduce(
    (t, v) => t + Math.max(0, Math.min(endMs, v.e) - Math.max(startMs, v.s)), 0);
}

/**
 * كل حالة: `finals` (آخرها = النتيجة اللي طلّعت الصف)، الصف وحالة إصداره،
 * والنافذة المتوقّعة. الحالات دي بالظبط هي اللي كانت **بتسكت** قبل الإصلاح.
 */
const CASES: Array<{
  plate: number; why: string; emit: { index: number; count: number; fromCarry: boolean };
  finals: DgFinal[]; want: { startMs: number; endMs: number; source: string };
}> = [
  {
    plate: 3, why: "حروف في نتيجة وأرقام في اللي بعدها (سجل وحيد)",
    emit: { index: 0, count: 1, fromCarry: true },
    finals: [
      { words: letterWords(GOLD[3], VOICED[2]), prevWordEndMs: 6080 },
      { words: [w("3080", 8330, 9610)], prevWordEndMs: 7940 },
    ],
    want: { startMs: 6650, endMs: 9860, source: "plate_words_split" },
  },
  {
    plate: 11, why: "نفس الشكل (وقفة جوّانية ٥٢٠ms)",
    emit: { index: 0, count: 1, fromCarry: true },
    finals: [
      { words: letterWords(GOLD[11], VOICED[14]), prevWordEndMs: 32230 },
      { words: [w("1030", 34890, 36240)], prevWordEndMs: 34370 },
    ],
    want: { startMs: 33100, endMs: 36490, source: "plate_words_split" },
  },
  {
    plate: 13, why: "نفس الشكل — وكان ضايع كمان في `busy` بسقف الطلب القديم",
    emit: { index: 0, count: 1, fromCarry: true },
    finals: [
      { words: letterWords(GOLD[13], VOICED[17]), prevWordEndMs: 39120 },
      { words: [w("3100", 40870, 42200)], prevWordEndMs: 40700 },
    ],
    want: { startMs: 39530, endMs: 42450, source: "plate_words_split" },
  },
  {
    plate: 18, why: "نفس الشكل (وقفة ٩٠٠ms — تانِ أطول مقيسة)",
    emit: { index: 0, count: 1, fromCarry: true },
    finals: [
      { words: letterWords(GOLD[18], VOICED[24]), prevWordEndMs: 54860 },
      { words: [w("3366", 57050, 58000)], prevWordEndMs: 56150 },
    ],
    want: { startMs: 55540, endMs: 58250, source: "plate_words_split" },
  },
  {
    plate: 15, why: "مقسومة **و** في رسالة مع لوحة تانية بعدها (السجل ٠ من ٢)",
    emit: { index: 0, count: 2, fromCarry: true },
    finals: [
      { words: letterWords(GOLD[15], VOICED[20]), prevWordEndMs: 44940 },
      {
        words: [w("4567", 47870, 49230), ...plateWords(GOLD[16], VOICED[22])],
        prevWordEndMs: 46940,
      },
    ],
    want: { startMs: 46040, endMs: 49450, source: "plate_words_split" },
  },
  {
    plate: 16, why: "السجل ١ من ٢ — كان `multi_plate_message` والموديل جابها **صح**",
    emit: { index: 1, count: 2, fromCarry: false },
    finals: [
      { words: letterWords(GOLD[15], VOICED[20]), prevWordEndMs: 44940 },
      {
        words: [w("4567", 47870, 49230), ...plateWords(GOLD[16], VOICED[22])],
        prevWordEndMs: 46940,
      },
    ],
    want: { startMs: 49450, endMs: 52180, source: "plate_words" },
  },
  {
    plate: 25, why: "مقسومة + رسالة بلوحتين (النتيجة ٢١ المقيسة)",
    emit: { index: 0, count: 2, fromCarry: true },
    finals: [
      { words: letterWords(GOLD[25], VOICED[33]), prevWordEndMs: 79110 },
      {
        words: [w("5066", 80830, 81930), ...plateWords(GOLD[26], VOICED[35])],
        prevWordEndMs: 80710,
      },
    ],
    want: { startMs: 79590, endMs: 82180, source: "plate_words_split" },
  },
  {
    plate: 26, why: "السجل ١ من ٢ — كان `multi_plate_message` والموديل جابها **صح**",
    emit: { index: 1, count: 2, fromCarry: false },
    finals: [
      { words: letterWords(GOLD[25], VOICED[33]), prevWordEndMs: 79110 },
      {
        words: [w("5066", 80830, 81930), ...plateWords(GOLD[26], VOICED[35])],
        prevWordEndMs: 80710,
      },
    ],
    want: { startMs: 82220, endMs: 84820, source: "plate_words" },
  },
  {
    plate: 27, why: "السجل ١ من ٢ (النتيجة ٢٢: Deepgram كرّر لوحة ٢٦ قبلها)",
    emit: { index: 1, count: 2, fromCarry: false },
    finals: [
      {
        words: [...plateWords(GOLD[26], VOICED[35]), ...plateWords(GOLD[27], VOICED[36])],
        prevWordEndMs: 84570,
      },
    ],
    want: { startMs: 84780, endMs: 87480, source: "plate_words" },
  },
];

describe("جلسة المالك المعاد بناؤها — ٩ لوحات كانت ساكتة بقت بتجاوب", () => {
  it.each(CASES)("لوحة $plate ($why)", ({ plate, emit, finals, want }) => {
    const cur = finals[finals.length - 1].words;
    const p = planJudgeSlice({
      hasConfig: true, timing: null,
      words: cur, finals, expectPlateNorm: GOLD[plate], emit,
      prevWordEndMs: finals[finals.length - 1].prevWordEndMs,
      wordStartMs: Math.round((cur[0].start as number) * 1000),
      wordEndMs: Math.round((cur[cur.length - 1].end as number) * 1000),
      arrivalMs: 200000, mediaElapsedMs: 200000, streamFresh: true,
      chunkSizes: Array.from({ length: 500 }, () => 4000), base: 0, pausedMs: 0,
      inflight: 0, maxInflight: 2, maxQueue: 2,
    });
    expect(p.skip, GOLD[plate]).toBe(null);
    if (p.skip !== null) return;
    expect(p.windowSource, GOLD[plate]).toBe(want.source);
    expect(p.startMs, GOLD[plate]).toBe(want.startMs);
    expect(p.endMs, GOLD[plate]).toBe(want.endMs);
    // الثابت اللي مش مسموح ينكسر أبداً: **ولا ms** من نطق لوحة تانية…
    expect(neighbourMs(p.startMs, p.endMs, plate), GOLD[plate]).toBe(0);
    // …ونطق اللوحة نفسها **كله** جوّه النافذة.
    for (const v of VOICED.filter((x) => x.plate === plate)) {
      if (v.e <= want.endMs && v.s >= want.startMs - 1) {
        expect(p.startMs, GOLD[plate]).toBeLessThanOrEqual(v.s);
        expect(p.endMs, GOLD[plate]).toBeGreaterThanOrEqual(v.e);
      }
    }
    expect(p.endMs - p.startMs, GOLD[plate]).toBeLessThanOrEqual(4270 + 2 * JUDGE_WORD_PAD_MS);
  });

  it("وكلها كانت **ساكتة** بالقاعدة القديمة (بلا تاريخ وببوابة الإصدار)", () => {
    for (const c of CASES) {
      const cur = c.finals[c.finals.length - 1].words;
      const old = planPlateWindow({
        words: cur, expectPlateNorm: GOLD[c.plate],
        prevWordEndMs: c.finals[c.finals.length - 1].prevWordEndMs,
        wordStartMs: Math.round((cur[0].start as number) * 1000),
        wordEndMs: Math.round((cur[cur.length - 1].end as number) * 1000),
        arrivalMs: 200000, mediaElapsedMs: 200000, streamFresh: true,
      });
      const silentThen = c.emit.fromCarry || c.emit.count !== 1 || !old.ok;
      expect(silentThen, GOLD[c.plate]).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الصفحة: التاريخ لازم يتجمّع، يتقصّ، ويتصفّر مع التيار
// =============================================================================
// التاريخ ده **زمن ميديا لتيار واحد**. أي إعادة اتصال بترجّع ساعة Deepgram
// للصفر، فكلمات قديمة + كلمات جديدة في مصفوفة واحدة = نافذة على صوت غلط. عشان
// كده بيتصفّر في نفس السطور اللي `judgePrevWordEndRef` بيتصفّر فيها بالظبط.
// ─────────────────────────────────────────────────────────────────────────────
describe("توصيل الصفحة — تاريخ النتائج النهائية", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"), "utf8");

  it("فيه ريف للتاريخ، مقصوص بسقف مسمّى", () => {
    expect(src).toMatch(/judgeFinalsRef/);
    expect(src).toMatch(/JUDGE_FINALS_HISTORY\s*=\s*3/);
  });

  it("بيتصفّر في **كل** مكان `judgePrevWordEndRef` بيتصفّر فيه", () => {
    const resets = src.match(/judgePrevWordEndRef\.current = null/g) ?? [];
    expect(resets.length).toBeGreaterThanOrEqual(2);
    const histResets = src.match(/judgeFinalsRef\.current = \[\]/g) ?? [];
    expect(histResets.length).toBe(resets.length);
  });

  it("بيتمرّر للمخطِّط (`finals`) وبيتحفظ في توقيت الطيّار", () => {
    expect(src).toMatch(/finals:\s*timing\?\.finals/);
  });

  it("مسار التدريب (`curTimingRef`) مالمسوش — لسه نافذته الواسعة زي ما هي", () => {
    expect(src).toContain("nowMs - durMs - 3000");
    expect(src).toContain("endMs: nowMs + 500");
  });
});

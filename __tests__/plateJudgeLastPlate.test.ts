import { describe, it, expect } from "vitest";
import {
  segmentBoundsByGap,
  lastSegmentBounds,
  lastPlateWordSpan,
  type DgWord,
} from "@/lib/deepgramWords";
import {
  planPlateWindow,
  planJudgeSlice,
  JUDGE_WORD_PAD_MS,
  JUDGE_MAX_PLATE_WINDOW_MS,
  JUDGE_MAX_PLATE_SPAN_MS,
  JUDGE_MAX_PROVEN_WINDOW_MS,
} from "@/lib/plateJudgeClient";
import { JUDGE_OUTCOME_CODES, describeJudgeOutcome, shortJudgeReason } from "@/lib/plateJudgeLog";

// ─────────────────────────────────────────────────────────────────────────────
// عيب ١: السقف المربوط على النهاية بيسرّب **اللوحة السابقة**
// =============================================================================
// كل رقم في الملف ده **مقيس** على جلسة المالك (٣٠ لوحة، ٢٥ طلب وصل الخدمة).
// طريقة القياس — قابلة للإعادة بالحرف:
//   ١. كل مقطع من الـ٢٥ بيعرف `cut_start` بتاعه في سجل الطيّار، فرسمناهم كلهم
//      على **خط زمن ميديا واحد** ولحمناهم في ملف جلسة واحد.
//   ٢. VAD طاقة (إطار ١٠ms، عتبة p95−٣٠dB) طلّع ٤٠ منطقة كلام على الخط ده.
//   ٣. **الموديل الحي نفسه** (whisper-plates-v6 على 127.0.0.1:8756) اتسأل عن كل
//      منطقة لوحدها ⇒ عرفنا كل منطقة بتقول إيه بالظبط، ومن ورقة المفتاح عرفنا
//      كل منطقة تبع أنهي لوحة.
//   ٤. نافذة كل نتيجة نهائية اتحلّت بالعكس من نفس السجل: القاعدة القديمة كانت
//      `start = arrival − span − 3000` و`end = arrival + 500` ⇒
//         arrival = (cut_start + cut_window)·1000 − 500      (مضبوط دايماً)
//         span    = cut_window·1000 − 3500                   (مضبوط)
//      تأكيد الانعكاس: أكبر ٥ span طلعوا ٤٢٤٠/٣٣٦٠/٣٢٠٠/٣٢٨٠/٤٠٠٠ms — وهم بالحرف
//      «النتايج الخمس الملزوقة» اللي التحليل الميداني سمّاها.
//
// الأرقام اللي طلعت (وكلها في الاختبارات تحت):
//   • أقصر سكتة **بين لوحتين**: ٤٦٠ms (لوحة ٢٦ تخلص ٨٤٫٥٧ ← لوحة ٢٧ تبدأ ٨٥٫٠٣)
//   • وقفة **جوّه لوحة واحدة** («حروف … وقفة … أرقام») بتوصل ٩٣٠ms
//     ⇒ **التوزيعان متقاطعان**: مافيش أي عتبة فجوة تقدر تفصلهم. ٠٫٦٥ث بتفشل من
//        الناحيتين: مابتفصلش الـ٤ سكتات الضيقة (٤٦٠/٤٧٠/٤٧٠/٥٤٠ms) اللي هي
//        بالظبط حالة اللزق، وبتقطع الوقفتين الجوّانيتين (٩٠٠/٩٣٠ms) اللي هي
//        بالظبط حالة (ب). عشان كده القاعدة الجديدة **مش** على الفجوة: هي على
//        **المحتوى** — ذرّات اللوحة نفسها (`plateAtoms`) بترسم آخر لوحة.
//   • النتيجة المقيسة على الـ٢٥: القاعدة الحالية ٦/٢٥ نوافذ فيها كلام الجار
//     (١٠/٢٠٠/٤٥٠/٤٩٠/٥١٠/٥٤٠ms)، القاعدة الجديدة **٠/٢٥** وبلا أي ms من صوت
//     الصف نفسه ضايع. وعلى الموديل الحي: ١٧/٢٥ → **٢٠/٢٥** مطابقة تامة.
// ─────────────────────────────────────────────────────────────────────────────

/** كلمة Deepgram بزمن ميديا بالملي ثانية (السجل بيجي بالثواني). */
function w(word: string, startMs: number, endMs: number): DgWord {
  return { word, start: startMs / 1000, end: endMs / 1000 };
}

/** نطق لوحة كامل: ٣ أسماء حروف + مجموعة أرقام واحدة (`numerals: true`). */
function plateWords(
  names: [string, string, string], digits: string, startMs: number, endMs: number,
): DgWord[] {
  // ٤ توكنات موزّعة على النطق — الفواصل الجوّانية أصغر من أي عتبة فجوة معقولة.
  const step = (endMs - startMs) / 4;
  return [
    w(names[0], startMs, startMs + step - 40),
    w(names[1], startMs + step, startMs + 2 * step - 40),
    w(names[2], startMs + 2 * step, startMs + 3 * step - 40),
    w(digits, startMs + 3 * step, endMs),
  ];
}

// ── الوقائع المقيسة من جلسة المالك ──────────────────────────────────────────
/** النتيجة ١٣ (135500_0048): «٤٥٦٧» (ذيل لوحة ١٥) + «كهط ٥٢٥١» (لوحة ١٦). */
const GLUED_13 = {
  prevDigits: { s: 47870, e: 49230 },     // ببب4567 — أرقامها بس دخلت النتيجة
  plate: { s: 49700, e: 51930 },          // كهط5251 — الصف طلع من دي
  gap: 470,
};
/** النتيجة ٢١ (135533_0056): «٥٠٦٦» (ذيل لوحة ٢٥) + «بدك ١٥٨٨» (لوحة ٢٦). */
const GLUED_21 = {
  prevDigits: { s: 80830, e: 81930 },
  plate: { s: 82470, e: 84570 },
  gap: 540,
};
/** النتيجة ٢٢ (135537_0057): «بدك ١٥٨٨» (لوحة ٢٦) + «سبع ٥٠٨٠» (لوحة ٢٧). */
const GLUED_22 = {
  prevPlate: { s: 82470, e: 84570 },
  plate: { s: 85030, e: 87230 },
  gap: 460,                                // **أقصر سكتة بين لوحتين في الجلسة**
};
/** لوحة واحدة بوقفة جوّانية ٢١٠ms: «صصح … ٠٠٦٥» (لوحة ٤، النتيجة ٣). */
const PAUSED_04 = {
  letters: { s: 10190, e: 11090 },
  digits: { s: 11300, e: 12570 },
  prevWordEnd: 9610,                       // نهاية النتيجة اللي قبلها (أرقام لوحة ٣)
};

describe("segmentBoundsByGap — نسخة بترجّع الزمن، مش نص بس", () => {
  it("مقطع واحد لما مافيش فجوة ≥ العتبة — وحدوده = حدود كلماته", () => {
    const words = plateWords(["كاف", "هاء", "طاء"], "5251", GLUED_13.plate.s, GLUED_13.plate.e);
    const segs = segmentBoundsByGap(words, 0.65);
    expect(segs).toHaveLength(1);
    expect(segs[0].startMs).toBe(GLUED_13.plate.s);
    expect(segs[0].endMs).toBe(GLUED_13.plate.e);
    expect(segs[0].text).toBe("كاف هاء طاء 5251");
  });

  it("بتفصل عند فجوة كبيرة وبترجّع حدود كل مقطع", () => {
    const words = [
      w("4567", 47870, 49230),
      ...plateWords(["كاف", "هاء", "طاء"], "5251", 49700 + 800, GLUED_13.plate.e),
    ];
    const segs = segmentBoundsByGap(words, 0.65);
    expect(segs).toHaveLength(2);
    expect(segs[0].endMs).toBe(49230);
    expect(segs[1].startMs).toBe(50500);
  });

  it("`lastSegmentBounds` بترجّع آخر مقطع + عدد المقاطع", () => {
    const words = [
      w("4567", 47870, 49230),
      ...plateWords(["كاف", "هاء", "طاء"], "5251", 50500, GLUED_13.plate.e),
    ];
    const last = lastSegmentBounds(words, 0.65);
    expect(last).not.toBeNull();
    expect(last!.segments).toBe(2);
    expect(last!.startMs).toBe(50500);
    expect(last!.endMs).toBe(GLUED_13.plate.e);
  });

  it("توقيتات ناقصة = null (مافيش نافذة مخترعة)", () => {
    expect(lastSegmentBounds([{ word: "كاف" }, { word: "5251" }], 0.65)).toBeNull();
    expect(lastSegmentBounds([], 0.65)).toBeNull();
  });

  // ── ليه ٠٫٦٥ث **مش** كافية: التوزيعان متقاطعان على صوته ─────────────────
  it("٠٫٦٥ث مابتفصلش أضيق سكتة مقيسة بين لوحتين (٤٦٠ms) — حالة اللزق بتفضل", () => {
    const words = [
      ...plateWords(["باء", "دال", "كاف"], "1588", GLUED_22.prevPlate.s, GLUED_22.prevPlate.e),
      ...plateWords(["سين", "باء", "عين"], "5080", GLUED_22.plate.s, GLUED_22.plate.e),
    ];
    expect(GLUED_22.plate.s - GLUED_22.prevPlate.e).toBe(GLUED_22.gap);
    expect(segmentBoundsByGap(words, 0.65)).toHaveLength(1);   // ← الفجوة فشلت
  });

  it("٠٫٦٥ث بتقطع لوحة واحدة عندها وقفة جوّانية ٩٣٠ms — حالة (ب) بتتخلق", () => {
    // لوحة ١٥ (ببب4567) بصوته: «ب ب ب» … وقفة ٩٣٠ms … «٤٥٦٧» (مقيس ٤٦٠٤٠→٤٦٩٤٠
    // للحروف و٤٧٨٧٠→٤٩٢٣٠ للأرقام).
    const words = [
      w("باء", 46040, 46330), w("باء", 46450, 46700), w("باء", 46760, 46940),
      w("4567", 47870, 49230),
    ];
    expect(47870 - 46940).toBe(930);
    expect(segmentBoundsByGap(words, 0.65)).toHaveLength(2);   // ← الفجوة قطعت لوحة واحدة
  });
});

describe("lastPlateWordSpan — القاعدة الجديدة: **محتوى** لا فجوة", () => {
  it("نتيجة ملزوقة: بتاخد لوحة الصف بس وتستبعد أرقام اللوحة السابقة", () => {
    const words = [
      w("4567", GLUED_13.prevDigits.s, GLUED_13.prevDigits.e),
      ...plateWords(["كاف", "هاء", "طاء"], "5251", GLUED_13.plate.s, GLUED_13.plate.e),
    ];
    const span = lastPlateWordSpan(words, "كهط5251");
    expect(span).not.toBeNull();
    expect(span!.startMs).toBe(GLUED_13.plate.s);
    expect(span!.endMs).toBe(GLUED_13.plate.e);
    // والفجوة كانت ٤٧٠ms — تحت أي عتبة ٠٫٦٥، ومع ذلك الفصل حصل.
    expect(GLUED_13.plate.s - GLUED_13.prevDigits.e).toBe(GLUED_13.gap);
  });

  it("لوحتين كاملتين ملزوقتين بسكتة ٤٦٠ms: بتاخد التانية بس", () => {
    const words = [
      ...plateWords(["باء", "دال", "كاف"], "1588", GLUED_22.prevPlate.s, GLUED_22.prevPlate.e),
      ...plateWords(["سين", "باء", "عين"], "5080", GLUED_22.plate.s, GLUED_22.plate.e),
    ];
    const span = lastPlateWordSpan(words, "سبع5080");
    expect(span!.startMs).toBe(GLUED_22.plate.s);
    expect(span!.endMs).toBe(GLUED_22.plate.e);
  });

  it("لوحة واحدة بوقفة جوّانية: **ولا ms** بتتقص من قدّامها", () => {
    const words = [
      w("صاد", PAUSED_04.letters.s, PAUSED_04.letters.s + 300),
      w("صاد", PAUSED_04.letters.s + 360, PAUSED_04.letters.s + 640),
      w("حاء", PAUSED_04.letters.s + 700, PAUSED_04.letters.e),
      w("0065", PAUSED_04.digits.s, PAUSED_04.digits.e),
    ];
    const span = lastPlateWordSpan(words, "صصح0065");
    expect(span!.startMs).toBe(PAUSED_04.letters.s);     // الحروف جوّه النافذة
    expect(span!.endMs).toBe(PAUSED_04.digits.e);
  });

  it("كلمة زايدة في الآخر مالهاش مادة لوحة مابتمدّش النافذة", () => {
    // النتيجة ١٩ في جلسته: بعد «هعد ١٢٣٤» فيه منطقة كلام ٥٤٠ms مش لوحة
    // (٧٤٨٣٠–٧٥٣٧٠). النافذة لازم تخلص عند اللوحة، لا عندها.
    for (const stray of ["والله", "ونيت", "تمام"]) {
      const words = [
        ...plateWords(["هاء", "عين", "دال"], "1234", 72010, 74310),
        w(stray, 74830, 75370),
      ];
      const span = lastPlateWordSpan(words, "هعد1234");
      expect(span, stray).not.toBeNull();
      expect(span!.endMs, stray).toBe(74310);            // مش ٧٥٣٧٠
    }
  });

  it("كلمة زايدة **فيها** مادة لوحة مش من لوحة الصف = null (فشل مغلق)", () => {
    // لو الكلمة الزايدة رقم/حرف فهي كلام لوحة تانية — نسكت، مانخمّنش.
    const words = [
      ...plateWords(["هاء", "عين", "دال"], "1234", 72010, 74310),
      w("سبعة", 74830, 75370),
    ];
    expect(lastPlateWordSpan(words, "هعد1234")).toBeNull();
  });

  it("اللوحة المجمّعة لازم **تطابق** لوحة الصف، وإلا null (فشل مغلق)", () => {
    const words = plateWords(["كاف", "هاء", "طاء"], "5251", 49700, 51930);
    expect(lastPlateWordSpan(words, "كهط5251")).not.toBeNull();
    expect(lastPlateWordSpan(words, "بدك1588")).toBeNull();
  });

  it("نصّ ناقص (أرقام بس — الحروف جات من رسالة سابقة) = null", () => {
    // لوحة ٣ في جلسته: Deepgram نهّى **الأرقام بس** والحروف («محك») جات carry-over
    // من رسالة قبلها ⇒ النافذة مايمكنش تحتوي غير نصّ اللوحة. السكوت هو الصح.
    expect(lastPlateWordSpan([w("3080", 8330, 9610)], "محك3080")).toBeNull();
  });

  it("بتشتغل على **كل** أشكال كلمات Deepgram الحقيقية", () => {
    // Deepgram بيرجّع اللوحة بأشكال مختلفة على حسب اللهجة و`numerals`. كلها لازم
    // تنفع، وإلا الطيّار بيسكت على لوحات سليمة.
    const shapes: Array<[string[], string]> = [
      [["بدك", "1588"], "بدك1588"],                       // حروف ملزوقة + أرقام
      [["ب", "د", "ك", "1588"], "بدك1588"],               // حروف مفكوكة
      [["باء", "دال", "كاف", "1588"], "بدك1588"],         // أسماء الحروف
      [["بدك", "1", "5", "8", "8"], "بدك1588"],           // أرقام مفكوكة
      [["هاء", "عين", "دال", "واحد", "اتنين", "تلاتة", "اربعة"], "هعد1234"],
      [["صاد", "صاد", "حاء", "صفر", "صفر", "ستة", "خمسة"], "صصح0065"],
    ];
    for (const [ws, want] of shapes) {
      const words = ws.map((word, i) => w(word, 10000 + i * 300, 10000 + i * 300 + 250));
      const span = lastPlateWordSpan(words, want);
      expect(span, ws.join("|")).not.toBeNull();
      expect(span!.startMs, ws.join("|")).toBe(10000);
      expect(span!.endMs, ws.join("|")).toBe(10000 + (ws.length - 1) * 300 + 250);
    }
  });

  it("ذيل ملاحظات قصير بيتخطّى، وذيل طويل جداً = سكوت (سقف على الشغل المتزامن)", () => {
    const plate = plateWords(["باء", "دال", "كاف"], "1588", 10000, 12500);
    const notes = (n: number) => Array.from({ length: n }, (_, i) =>
      w("جراج", 13000 + i * 300, 13000 + i * 300 + 250));
    // نوع المركبة في الآخر («ونيت») — الحالة الحقيقية، لازم تتخطّى.
    expect(lastPlateWordSpan([...plate, w("ونيت", 13000, 13300)], "بدك1588")!.endMs).toBe(12500);
    expect(lastPlateWordSpan([...plate, ...notes(8)], "بدك1588")!.endMs).toBe(12500);
    // أطول من السقف = سكوت، مش لفّة مفتوحة على الثريد الرئيسي.
    expect(lastPlateWordSpan([...plate, ...notes(20)], "بدك1588")).toBeNull();
  });

  it("رقم منطوق **مركّب** = null — فجوة مقصودة وموثّقة", () => {
    // «ألف وخمسمية وتمانية وتمانين» = ١٥٨٨. `plateAtoms` مابتجمّعش المركّبات عن
    // قصد، والاحتياطي بمحلّل اللوحة الواحدة **مرفوض** لأنه متسامح مع الملاحظات
    // فبيكسر الإثبات نفسه. والشكل ده مالوش وجود في مسار الطيّار: `numerals: true`
    // بيرجّع أرقام. النتيجة: سكوت `window_unproven` — الاتجاه الصح.
    const ws = ["باء", "دال", "كاف", "الف", "وخمسمية", "وتمانية", "وتمانين"];
    const words = ws.map((word, i) => w(word, 10000 + i * 300, 10000 + i * 300 + 250));
    expect(lastPlateWordSpan(words, "بدك1588")).toBeNull();
  });

  it("كلمة بلا توقيت = null (مافيش نافذة على تخمين)", () => {
    const words: DgWord[] = [
      { word: "كاف" }, { word: "هاء" }, { word: "طاء" }, { word: "5251", start: 51, end: 51.9 },
    ];
    expect(lastPlateWordSpan(words, "كهط5251")).toBeNull();
  });
});

describe("planPlateWindow — النافذة على آخر لوحة، والسقف بقى شبكة أمان", () => {
  const words13 = [
    w("4567", GLUED_13.prevDigits.s, GLUED_13.prevDigits.e),
    ...plateWords(["كاف", "هاء", "طاء"], "5251", GLUED_13.plate.s, GLUED_13.plate.e),
  ];

  it("إثبات العيب: القاعدة القديمة (min/max + سقف على النهاية) بتسرّب ٤٥٠ms", () => {
    const old = planPlateWindow({
      wordStartMs: GLUED_13.prevDigits.s, wordEndMs: GLUED_13.plate.e,
      arrivalMs: 52800, mediaElapsedMs: 52800, streamFresh: true,
    });
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    expect(old.source).toBe("words_capped");
    expect(old.startMs).toBe(GLUED_13.plate.e + JUDGE_WORD_PAD_MS - JUDGE_MAX_PLATE_WINDOW_MS);
    expect(old.startMs).toBe(48780);
    // وده جوّه كلام اللوحة السابقة بـ٤٥٠ms بالظبط.
    expect(GLUED_13.prevDigits.e - old.startMs).toBe(450);
  });

  it("بالكلمات: النافذة بتبدأ بعد اللوحة السابقة — صفر تسريب", () => {
    const p = planPlateWindow({
      words: words13, expectPlateNorm: "كهط5251",
      wordStartMs: GLUED_13.prevDigits.s, wordEndMs: GLUED_13.plate.e,
      arrivalMs: 52800, mediaElapsedMs: 52800, streamFresh: true,
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.source).toBe("plate_words");
    expect(p.startMs).toBe(GLUED_13.plate.s - JUDGE_WORD_PAD_MS);
    expect(p.endMs).toBe(GLUED_13.plate.e + JUDGE_WORD_PAD_MS);
    expect(p.startMs).toBeGreaterThan(GLUED_13.prevDigits.e);   // ← الإصلاح
  });

  it("لوحة واحدة بوقفة جوّانية: القاعدة القديمة كانت بتاكل من القدّام، الجديدة لأ", () => {
    // المقيس: النتيجة ١٩ (هعد1234 + كلمة زايدة) span ٣٢٨٠ms ⇒ السقف ٣٤٠٠ كان
    // بياخد ٤٦٠ms من قدّام النطق، منهم ٢١٠ms كلام اللوحة نفسها.
    const seg = { s: 72010, e: 74310 };
    const oldW = planPlateWindow({
      wordStartMs: seg.s - 340, wordEndMs: 75370,
      arrivalMs: 76490, mediaElapsedMs: 76490, streamFresh: true,
    });
    if (!oldW.ok) return;
    expect(oldW.source).toBe("words_capped");
    expect(oldW.startMs).toBeGreaterThan(seg.s);      // بدأت **جوّه** اللوحة
    const p = planPlateWindow({
      words: [...plateWords(["هاء", "عين", "دال"], "1234", seg.s, seg.e), w("والله", 74830, 75370)],
      expectPlateNorm: "هعد1234",
      wordStartMs: seg.s - 340, wordEndMs: 75370,
      arrivalMs: 76490, mediaElapsedMs: 76490, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.startMs).toBe(seg.s - JUDGE_WORD_PAD_MS);
    expect(p.endMs).toBe(seg.e + JUDGE_WORD_PAD_MS);
  });

  it("سقف النافذة المثبَتة بيسع أطول نطق لوحة **مقيس** (٣٣٤٠ms) بلا قص", () => {
    expect(JUDGE_MAX_PLATE_SPAN_MS).toBe(3340);
    expect(JUDGE_MAX_PROVEN_WINDOW_MS).toBe(JUDGE_MAX_PLATE_SPAN_MS + 2 * JUDGE_WORD_PAD_MS);
    const long = plateWords(["قاف", "طاء", "الف"], "4644", 10000, 10000 + 3340);
    const p = planPlateWindow({
      words: long, expectPlateNorm: "قطا4644",
      wordStartMs: 10000, wordEndMs: 13340,
      arrivalMs: 14340, mediaElapsedMs: 14340, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.source).toBe("plate_words");                 // مش `_capped`
    expect(p.startMs).toBe(10000 - JUDGE_WORD_PAD_MS);
    // والسقف القديم (٣٤٠٠) كان هيقص ٤٤٠ms من قدّامها.
    expect(3340 + 2 * JUDGE_WORD_PAD_MS - JUDGE_MAX_PLATE_WINDOW_MS).toBe(440);
  });

  it("مقطع أطول من أي لوحة معقولة لسه بيتقص من النهاية (شبكة الأمان)", () => {
    const words = plateWords(["باء", "طاء", "نون"], "3333", 20000, 26000);
    const p = planPlateWindow({
      words, expectPlateNorm: "بطن3333",
      wordStartMs: 20000, wordEndMs: 26000,
      arrivalMs: 27000, mediaElapsedMs: 27000, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.source).toBe("plate_words_capped");
    expect(p.endMs - p.startMs).toBe(JUDGE_MAX_PROVEN_WINDOW_MS);
  });

  it("مافيش لوحة مثبَتة في الكلمات = **سكوت مسمّى**، مش نافذة min/max", () => {
    const p = planPlateWindow({
      words: [w("3080", 8330, 9610)], expectPlateNorm: "محك3080",
      wordStartMs: 8330, wordEndMs: 9610,
      arrivalMs: 10555, mediaElapsedMs: 10555, streamFresh: true,
    });
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toBe("window_unproven");
  });

  it("النافذة عمرها ما تبدأ قبل نهاية كلام النتيجة اللي قبلها", () => {
    // المقيس (لوحة ٣٠، النتيجة ٢٤): توقيت Deepgram لأول كلمة ٩٥٨٣٠ بينما نطقها
    // الفعلي بيبدأ ٩٦٢٥٠، ولوحة ٢٩ خلصت ٩٥٧٨٠ والسكتة ٤٧٠ms بس ⇒ حشوة ٢٥٠
    // بتوصل ٢٠٠ms جوّه لوحة ٢٩. حدّ «آخر كلمة سابقة» بيمنعها.
    const words = plateWords(["باء", "طاء", "نون"], "3333", 95830, 98390);
    const p = planPlateWindow({
      words, expectPlateNorm: "بطن3333", prevWordEndMs: 95780,
      wordStartMs: 95830, wordEndMs: 98390,
      arrivalMs: 98687, mediaElapsedMs: 98687, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.startMs).toBe(95780);
    expect(p.endMs).toBe(98390 + JUDGE_WORD_PAD_MS);
  });

  it("الحدّ ده عمره ما يقص كلام اللوحة نفسها (نتيجة نهائية مكرّرة)", () => {
    // Deepgram بيبعت نفس النتيجة مرتين؛ لو أخدنا نهايتها كحدّ كنّا هنمسح النافذة.
    const words = plateWords(["كاف", "هاء", "طاء"], "5251", 49700, 51930);
    const p = planPlateWindow({
      words, expectPlateNorm: "كهط5251", prevWordEndMs: 51930,
      wordStartMs: 49700, wordEndMs: 51930,
      arrivalMs: 52800, mediaElapsedMs: 52800, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.startMs).toBe(49700);        // بدايتها هي، بلا الحشوة بس
    expect(p.endMs).toBe(51930 + JUDGE_WORD_PAD_MS);
  });

  it("بلا `words` السلوك **بالحرف** زي ما هو (توافق للخلف)", () => {
    const a = planPlateWindow({
      wordStartMs: 29588, wordEndMs: 32208, arrivalMs: 33108,
      mediaElapsedMs: 33108, streamFresh: true,
    });
    if (!a.ok) return;
    expect(a.source).toBe("words");
    expect(a.startMs).toBe(29338);
    expect(a.endMs).toBe(32458);
  });

  it("`planJudgeSlice` بيمرّر الكلمات ويسجّل مصدر النافذة الجديد", () => {
    const p = planJudgeSlice({
      hasConfig: true, timing: null,
      words: words13, expectPlateNorm: "كهط5251",
      wordStartMs: GLUED_13.prevDigits.s, wordEndMs: GLUED_13.plate.e,
      arrivalMs: 52800, mediaElapsedMs: 52800, streamFresh: true,
      inflight: 0, chunkSizes: Array.from({ length: 300 }, () => 4000),
      base: 0, pausedMs: 0, maxInflight: 2, maxQueue: 2,
    });
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.windowSource).toBe("plate_words");
    expect(p.startMs).toBe(GLUED_13.plate.s - JUDGE_WORD_PAD_MS);
  });

  it("`window_unproven` في قايمة السجل بجملة ولافتة مميّزة", () => {
    expect(JUDGE_OUTCOME_CODES).toContain("window_unproven");
    expect(describeJudgeOutcome("window_unproven")).not.toBe("window_unproven");
    expect(shortJudgeReason("window_unproven")).not.toBe("window_unproven");
    expect(shortJudgeReason("window_unproven").length).toBeLessThan(24);
    expect(describeJudgeOutcome("window_unproven")).not.toBe(describeJudgeOutcome("no_timing"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الجلسة كاملة: القاعدة الجديدة على الـ٢٥ نتيجة — الهدف صفر تسريب
// =============================================================================
// الجدول ده **مخرَج القياس** حرفياً: لكل نتيجة، مناطق الكلام اللي دخلت النتيجة
// (بزمن الميديا)، ومين منهم لوحة الصف. الاختبار بيعيد بناء النافذة بالقاعدة
// الجديدة ويتأكد إنها مالمستش أي منطقة تبع لوحة تانية.
// ─────────────────────────────────────────────────────────────────────────────
type Voiced = { s: number; e: number; plate: number };
/** ٤٠ منطقة كلام في الجلسة + اللوحة اللي كل واحدة تبعها (٠ = كلام مش لوحة). */
const VOICED: Voiced[] = [
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

/**
 * الـ٢٥ نتيجة نهائية اللي وصلت الخدمة. لكل واحدة:
 *   `own`  = فهارس مناطق الكلام اللي **لوحة الصف** نطقت فيها
 *   `head` = مناطق لوحة سابقة دخلت نفس النتيجة (اللزق) — لازم تفضل بره
 *   `wordStartMs/wordEndMs` = توقيت Deepgram المستخرَج من انعكاس سجل الطيّار
 *   `prevWordEndMs` = نهاية كلام النتيجة اللي قبلها على نفس التيار
 */
const FINALS: Array<{
  own: number[]; head: number[]; plate: number;
  wordStartMs: number; wordEndMs: number; prevWordEndMs: number | null;
}> = [
  { own: [0], head: [], plate: 1, wordStartMs: 810, wordEndMs: 3100, prevWordEndMs: null },
  { own: [1], head: [], plate: 2, wordStartMs: 3920, wordEndMs: 6080, prevWordEndMs: 3100 },
  { own: [3], head: [], plate: 3, wordStartMs: 8330, wordEndMs: 9610, prevWordEndMs: 7940 },
  { own: [4, 5], head: [], plate: 4, wordStartMs: 9850, wordEndMs: 12570, prevWordEndMs: 9610 },
  { own: [6], head: [], plate: 5, wordStartMs: 13180, wordEndMs: 15580, prevWordEndMs: 12570 },
  { own: [7, 8], head: [], plate: 6, wordStartMs: 16390, wordEndMs: 19190, prevWordEndMs: 15580 },
  { own: [9], head: [], plate: 7, wordStartMs: 19910, wordEndMs: 22390, prevWordEndMs: 19190 },
  { own: [10], head: [], plate: 8, wordStartMs: 22890, wordEndMs: 25450, prevWordEndMs: 22390 },
  { own: [11], head: [], plate: 9, wordStartMs: 26120, wordEndMs: 28760, prevWordEndMs: 25450 },
  { own: [12, 13], head: [], plate: 10, wordStartMs: 29430, wordEndMs: 32230, prevWordEndMs: 28760 },
  { own: [15], head: [], plate: 11, wordStartMs: 34640, wordEndMs: 36240, prevWordEndMs: 34370 },
  { own: [16], head: [], plate: 12, wordStartMs: 36720, wordEndMs: 39120, prevWordEndMs: 36240 },
  { own: [19], head: [], plate: 14, wordStartMs: 42460, wordEndMs: 44940, prevWordEndMs: 42200 },
  { own: [22], head: [21], plate: 16, wordStartMs: 47690, wordEndMs: 51930, prevWordEndMs: 46940 },
  { own: [23], head: [], plate: 17, wordStartMs: 52460, wordEndMs: 54860, prevWordEndMs: 51930 },
  { own: [26], head: [], plate: 19, wordStartMs: 59050, wordEndMs: 61450, prevWordEndMs: 58000 },
  { own: [27], head: [], plate: 20, wordStartMs: 61800, wordEndMs: 64280, prevWordEndMs: 61450 },
  { own: [28], head: [], plate: 21, wordStartMs: 65080, wordEndMs: 67480, prevWordEndMs: 64280 },
  { own: [29], head: [], plate: 22, wordStartMs: 68190, wordEndMs: 71070, prevWordEndMs: 67480 },
  { own: [30], head: [], plate: 23, wordStartMs: 72090, wordEndMs: 75370, prevWordEndMs: 71070 },
  { own: [32], head: [], plate: 24, wordStartMs: 75910, wordEndMs: 79110, prevWordEndMs: 75370 },
  { own: [35], head: [34], plate: 26, wordStartMs: 81210, wordEndMs: 84570, prevWordEndMs: 80710 },
  { own: [36], head: [35], plate: 27, wordStartMs: 83230, wordEndMs: 87230, prevWordEndMs: 84570 },
  { own: [37], head: [], plate: 28, wordStartMs: 87870, wordEndMs: 90110, prevWordEndMs: 87230 },
  { own: [39], head: [], plate: 30, wordStartMs: 95830, wordEndMs: 98390, prevWordEndMs: 95780 },
];

/** كلام مناطق **لوحة تانية** جوّه النافذة (ms) — الرقم اللي لازم يبقى صفر. */
function neighbourMs(startMs: number, endMs: number, ownPlate: number): number {
  let t = 0;
  for (const v of VOICED) {
    if (v.plate === ownPlate) continue;
    t += Math.max(0, Math.min(endMs, v.e) - Math.max(startMs, v.s));
  }
  return t;
}

/** مين اللوحات اللي كلامها دخل النافذة — للتشخيص لو الاختبار وقع. */
function whoIn(startMs: number, endMs: number, ownPlate: number): number[] {
  const out = new Set<number>();
  for (const v of VOICED) {
    if (v.plate === ownPlate) continue;
    if (Math.min(endMs, v.e) - Math.max(startMs, v.s) > 5) out.add(v.plate);
  }
  return [...out].sort((a, b) => a - b);
}

/** ورقة المفتاح — ٣٠ لوحة بترتيب النطق (ورقة-التجربة-المفتاح.tsv). */
const GOLD: Record<number, string> = {
  1: "بكح8044", 2: "اوب2399", 3: "محك3080", 4: "صصح0065", 5: "كحي5500",
  6: "صدق9999", 7: "سله5678", 8: "رسك1735", 9: "طهس3033", 10: "نعح4788",
  11: "قدر1030", 12: "رحط0053", 13: "دطح3100", 14: "ررص5555", 15: "ببب4567",
  16: "كهط5251", 17: "صقر4022", 18: "دصد3366", 19: "قكع1020", 20: "سكص0036",
  21: "طكص6400", 22: "صكك8888", 23: "هعد1234", 24: "قطا4644", 25: "كدط5066",
  26: "بدك1588", 27: "سبع5080", 28: "ككب0093", 29: "طدص5100", 30: "بطن3333",
};

/** اسم الحرف المنطوق لكل حرف لوحة معتمد — زي ما Deepgram بيرجّعه. */
const LETTER_NAME: Record<string, string> = {
  ا: "الف", ب: "باء", ح: "حاء", د: "دال", ر: "راء", س: "سين", ص: "صاد",
  ط: "طاء", ع: "عين", ق: "قاف", ك: "كاف", ل: "لام", م: "ميم", ن: "نون",
  ه: "هاء", و: "واو", ي: "ياء",
};

/**
 * يبني كلمات Deepgram لنتيجة نهائية من **الجيومترية المقيسة**:
 *  • الحروف بتتوزّع على منطقة/مناطق الحروف، والأرقام على منطقة الأرقام — فلوحة
 *    عندها وقفة جوّانية بتطلع «حروف … وقفة … أرقام» زي بالظبط اللي مقيس.
 *  • أول كلمة بتبدأ عند `min(بداية النطق, wordStartMs)` — عشان الحالة القاسية
 *    (توقيت Deepgram بيسبق النطق أحياناً بـ٤٢٠ms) تتجرّب هي كمان.
 *  • كلام لوحة سابقة دخل نفس النتيجة (`head`) بيتحوّل لكلماته برضه.
 */
function buildFinalWords(f: typeof FINALS[number]): DgWord[] {
  const out: DgWord[] = [];
  for (const i of f.head) {
    // ذيل اللوحة السابقة اللي Deepgram لزقه: مجموعة أرقامها أو نطقها الكامل.
    const prev = GOLD[VOICED[i].plate];
    const seg = VOICED[i];
    out.push(...(seg.e - seg.s > 1500
      ? plateWords(
        [LETTER_NAME[prev[0]], LETTER_NAME[prev[1]], LETTER_NAME[prev[2]]],
        prev.slice(3), seg.s, seg.e)
      : [w(prev.slice(3), seg.s, seg.e)]));
  }
  const own = f.own.map((i) => VOICED[i]);
  const first = Math.min(f.head.length > 0 ? own[0].s : f.wordStartMs, own[0].s);
  const plate = GOLD[f.plate];
  const names = [LETTER_NAME[plate[0]], LETTER_NAME[plate[1]], LETTER_NAME[plate[2]]];
  if (own.length === 1) {
    out.push(...plateWords(names as [string, string, string], plate.slice(3),
      first, Math.max(own[0].e, f.own.includes(39) ? f.wordEndMs : own[0].e)));
  } else {
    // منطقة الحروف بعدين منطقة الأرقام (الوقفة الجوّانية المقيسة بينهم).
    const L = own[0], D = own[own.length - 1];
    const step = (L.e - first) / 3;
    out.push(w(names[0], first, first + step - 40));
    out.push(w(names[1], first + step, first + 2 * step - 40));
    out.push(w(names[2], first + 2 * step, L.e));
    out.push(w(plate.slice(3), D.s, D.e));
  }
  return out;
}

describe("جلسة المالك كاملة — ٢٥ نتيجة، صفر تسريب", () => {
  it("القاعدة الجديدة **من الكود نفسه**: ٠/٢٥ كلام جار، وولا ms من صوت الصف ضايع", () => {
    const leaks: Array<{ plate: number; ms: number; who: number[] }> = [];
    let lost = 0, capped = 0;
    const dump: string[] = [];
    for (const f of FINALS) {
      const p = planPlateWindow({
        words: buildFinalWords(f), expectPlateNorm: GOLD[f.plate],
        prevWordEndMs: f.prevWordEndMs,
        wordStartMs: f.wordStartMs, wordEndMs: f.wordEndMs,
        arrivalMs: f.wordEndMs + 1000, mediaElapsedMs: f.wordEndMs + 1000, streamFresh: true,
      });
      if (!p.ok) throw new Error(`${GOLD[f.plate]}: ${p.reason}`);
      expect(p.source, GOLD[f.plate]).toMatch(/^plate_words/);
      if (p.source === "plate_words_capped") capped++;
      const nb = neighbourMs(p.startMs, p.endMs, f.plate);
      if (nb > 5) leaks.push({ plate: f.plate, ms: Math.round(nb), who: whoIn(p.startMs, p.endMs, f.plate) });
      for (const i of f.own) {
        lost += Math.max(0, (VOICED[i].e - VOICED[i].s)
          - Math.max(0, Math.min(p.endMs, VOICED[i].e) - Math.max(p.startMs, VOICED[i].s)));
      }
      dump.push(`${String(f.plate).padStart(2)} ${GOLD[f.plate]} [${(p.startMs / 1000).toFixed(2)},${(p.endMs / 1000).toFixed(2)}] len=${((p.endMs - p.startMs) / 1000).toFixed(2)} src=${p.source} nb=${Math.round(nb)}`);
      expect(p.endMs - p.startMs, GOLD[f.plate]).toBeLessThanOrEqual(JUDGE_MAX_PROVEN_WINDOW_MS);
    }
    // النوافذ الفعلية اللي الكود طلّعها (لو الاختبار وقع تبان كلها في الرسالة):
    //   بكح8044 [0.56,3.35] · اوب2399 [3.67,6.33] · محك3080 [8.08,9.86]
    //   صصح0065 [9.61,12.82] · كحي5500 [12.93,15.83] · صدق9999 [16.14,19.44]
    //   سله5678 [19.66,22.64] · رسك1735 [22.64,25.70] · طهس3033 [25.87,29.01]
    //   نعح4788 [29.18,32.48] · قدر1030 [34.39,36.49] · رحط0053 [36.47,39.37]
    //   ررص5555 [42.21,45.19] · كهط5251 [49.45,52.18] · صقر4022 [52.21,55.11]
    //   قكع1020 [58.80,61.70] · سكص0036 [61.55,64.53] · طكص6400 [64.83,67.73]
    //   صكك8888 [67.94,71.32] · هعد1234 [71.76,74.56] · قطا4644 [75.66,79.36]
    //   بدك1588 [82.22,84.82] · سبع5080 [84.78,87.48] · ككب0093 [87.62,90.36]
    //   بطن3333 [95.78,98.64]        الطول ١٫٧٨–٣٫٧٠ث · كلهم `plate_words`
    expect(leaks, dump.join("\n")).toEqual([]);   // ← الهدف: ٠/٢٥
    expect(lost, dump.join("\n")).toBe(0);        // وولا ms من نطق الصف اتقص
    expect(capped).toBe(0);           // والسقف مافاضش على ولا واحدة (شبكة أمان بحق)
  });

  it("وجود **تاريخ** النتائج النهائية مايغيّرش ولا نافذة من الـ٢٥", () => {
    // المسار المقسوم (للوحة اللي اتقالت على نتيجتين) بيجرى **بس** لما المسار
    // الأحادي يفشل. الـ٢٥ دول كلهم بينجحوا على الأحادي ⇒ نوافذهم لازم تفضل
    // بالحرف زي ما هي مهما كان التاريخ. ده الضمان إن الإصلاح **مايدفعش** من دقّة
    // اللوحات اللي بتجاوب النهاردة.
    for (let i = 0; i < FINALS.length; i++) {
      const f = FINALS[i];
      const base = {
        words: buildFinalWords(f), expectPlateNorm: GOLD[f.plate],
        prevWordEndMs: f.prevWordEndMs,
        wordStartMs: f.wordStartMs, wordEndMs: f.wordEndMs,
        arrivalMs: f.wordEndMs + 1000, mediaElapsedMs: f.wordEndMs + 1000, streamFresh: true,
      };
      // نفس اللي الصفحة بتعمله: آخر ٣ نتايج، آخرها الحالية.
      const finals = FINALS.slice(Math.max(0, i - 2), i + 1).map((g) => ({
        words: buildFinalWords(g), prevWordEndMs: g.prevWordEndMs,
      }));
      expect(planPlateWindow({ ...base, finals }), GOLD[f.plate])
        .toEqual(planPlateWindow(base));
    }
  });

  it("نفس الـ٢٥ بالقاعدة القديمة (بلا كلمات): ٦ تسريبات — الفرق بالكود", () => {
    const leaks: number[] = [];
    for (const f of FINALS) {
      const p = planPlateWindow({
        wordStartMs: f.wordStartMs, wordEndMs: f.wordEndMs,
        arrivalMs: f.wordEndMs + 1000, mediaElapsedMs: f.wordEndMs + 1000, streamFresh: true,
      });
      if (!p.ok) throw new Error("المفروض تنفع");
      const nb = neighbourMs(p.startMs, p.endMs, f.plate);
      if (nb > 5) leaks.push(Math.round(nb));
    }
    expect(leaks.sort((a, b) => a - b)).toEqual([10, 200, 450, 490, 510, 540]);
  });

  it("أضيق سكتة مقيسة بين لوحتين ٤٦٠ms > الحشوة ٢٥٠ — الحدّ الجديد بيسدّ الباقي", () => {
    let tightest = Infinity;
    for (let i = 1; i < VOICED.length; i++) {
      if (VOICED[i].plate === VOICED[i - 1].plate || VOICED[i].plate === 0
        || VOICED[i - 1].plate === 0) continue;
      tightest = Math.min(tightest, VOICED[i].s - VOICED[i - 1].e);
    }
    expect(tightest).toBe(460);
    expect(JUDGE_WORD_PAD_MS).toBeLessThan(tightest);
  });

  it("أطول وقفة **جوّه** لوحة واحدة (٩٣٠ms) أكبر من أضيق سكتة بين لوحتين (٤٦٠ms)", () => {
    // ده الإثبات إن أي قاعدة **على الفجوة** لوحدها مستحيل تنفع على صوته.
    let longestInner = 0;
    for (let i = 1; i < VOICED.length; i++) {
      if (VOICED[i].plate !== VOICED[i - 1].plate) continue;
      longestInner = Math.max(longestInner, VOICED[i].s - VOICED[i - 1].e);
    }
    expect(longestInner).toBe(930);
    expect(longestInner).toBeGreaterThan(460);
  });
});

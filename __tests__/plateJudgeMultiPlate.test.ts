import { describe, it, expect } from "vitest";
import { parseSessionChunk, newSessionState } from "@/lib/sessionParser";
import {
  planJudgeEmitGate,
  planJudgeSlice,
  type JudgeEmitInfo,
} from "@/lib/plateJudgeClient";
import { JUDGE_OUTCOME_CODES, describeJudgeOutcome, shortJudgeReason } from "@/lib/plateJudgeLog";

// ─────────────────────────────────────────────────────────────────────────────
// عيب ٢: رسالة واحدة بلوحتين = **نافذة واحدة لصفّين**، وممكن تكتب فوق صف صح
// =============================================================================
// `processWhisperText` بيعمل `res.records.forEach(addOnePttRow)`، و`addOnePttRow`
// بيقرا `judgeTimingRef.current` — **نفس الكائن** لكل سجل في الرسالة. وحارس
// التكرار (٢ث) بيمنع نفس اللوحة بس، فاللوحتين المختلفتين بيعدّوا الاتنين.
// وبعدين `fusePlate` عند الاختلاف بيرجّح موديلنا (`disagree_prefer_ours`)
// فالترقيع بيتطبّق ⇒ الصف A بيعرض لوحة B.
//
// المقيس في جلسة المالك: تلات رسايل نهائية فيها لوحتين (النتايج ١٣ · ٢١ · ٢٢)،
// وست لوحات لوحها اتلمّت من **رسالتين** (Deepgram نهّى نصّ اللوحة بس، والباقي جا
// carry-over) — النافذة في الحالة دي فيها **نص صوت اللوحة** وخلاص.
//
// القرار: كل صف مش السجل **الوحيد** لرسالته، وكل صف نصّه بُني على carry-over،
// **بيسكت** بسبب مسمّى. صف مسكوت = صفر ظاهر في العدّاد؛ طلب على صوت لوحة تانية
// = تلف غير مرئي.
// ─────────────────────────────────────────────────────────────────────────────

describe("محلّل الجلسة — الوقيعة نفسها بمحلّل المشروع", () => {
  it("رسالة واحدة بتطلّع **سجلّين** (المحلّل نفسه بيقولها)", () => {
    const res = parseSessionChunk(
      "حاء باء كاف خمسة تمانية سبعة تمانية دال باء راء واحد اتنين تلاتة اربعة",
      newSessionState(), { final: true },
    );
    expect(res.records.map((r) => r.normalized)).toEqual(["حبك5878", "دبر1234"]);
  });

  it("carry-over بيلمّ لوحة من **رسالتين** — والسجل بيقول إنه اتلمّ", () => {
    // نفس شكل الست لوحات في جلسته: Deepgram نهّى «محك» لوحدها (مافيش لوحة ⇒
    // مافيش صف)، وبعدين «3080» في رسالة تانية ⇒ الصف بيطلع من الاتنين.
    let st = newSessionState();
    const a = parseSessionChunk("ميم حاء كاف", st);
    st = a.state;
    expect(a.records).toHaveLength(0);
    expect(st.carryText).not.toBe("");
    const b = parseSessionChunk("تلاتة صفر تمانية صفر", st, { final: true });
    expect(b.records.map((r) => r.normalized)).toEqual(["محك3080"]);
    expect(b.records[0].fromCarry).toBe(true);
  });

  it("لوحة كاملة في رسالة واحدة **مش** مُعلَّمة carry", () => {
    const r = parseSessionChunk("ميم حاء كاف تلاتة صفر تمانية صفر",
      newSessionState(), { final: true });
    expect(r.records[0].normalized).toBe("محك3080");
    expect(r.records[0].fromCarry).toBe(false);
  });

  it("العلَم على السجل **الأول** بس — اللي بعده صوته كله في الرسالة دي", () => {
    let st = newSessionState();
    st = parseSessionChunk("باء باء باء", st).state;
    const r = parseSessionChunk(
      "اربعة خمسة ستة سبعة كاف هاء طاء خمسة اتنين خمسة واحد", st, { final: true });
    expect(r.records.map((x) => x.normalized)).toEqual(["ببب4567", "كهط5251"]);
    expect(r.records.map((x) => x.fromCarry)).toEqual([true, false]);
  });

  it("العلَم مايكسرش أي سلوك تاني في السجل", () => {
    const r = parseSessionChunk("دال باء راء واحد اتنين تلاتة اربعة",
      newSessionState(), { final: true });
    expect(r.records[0]).toMatchObject({
      plate: expect.any(String), normalized: "دبر1234", notes: "", contextNote: "", seq: 0,
      fromCarry: false,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الحزام الزايد اتشال — التحقّق نفسه بيغني عنه، وهو كان بيسكّت لوحات **صح**
// =============================================================================
// المقيس على جلسة المالك: الحزام سكّت كهط٥٢٥١ وبدك١٥٨٨ — والاتنين الموديل جابهم
// **صح** لما اتبعتوا بنافذتهم المثبَتة. سبب الحزام كان إن كل سجلات الرسالة بتقرا
// **نفس** `judgeTimingRef`؛ بس النافذة بقت من `lastPlateWordSpan` اللي بيرتكز على
// لوحة **الصف نفسه** ويتحقّق منها ⇒ سجلّين في رسالة واحدة بياخدوا نافذتين
// **مختلفتين**، كل واحدة متحقَّق إنها نطق لوحة صفّها.
//
// اللي **باقي** من البوابة (وده الحزام الوحيد المبرّر): الصف اللي مش السجل
// الوحيد لرسالته — أو نصّه اتلمّ من رسالتين — **ممنوع** ياخد نافذة **رسالة**
// (min/max · ساعة الحقيقة · نافذة جاهزة). دي نوافذ رسالة مش نطق لوحة، فمافيش أي
// إثبات إنها تبع الصف ده. يمشي بنافذة مثبَتة أو يسكت بسبب مسمّى.
// ─────────────────────────────────────────────────────────────────────────────
describe("planJudgeEmitGate — بقت فشل-مغلق على الدخل البايظ بس", () => {
  const gate = (o: Partial<JudgeEmitInfo>) =>
    planJudgeEmitGate({ index: 0, count: 1, fromCarry: false, ...o });

  it("السجل الوحيد في رسالته وبلا carry = يعدّي", () => {
    expect(gate({})).toBe(null);
  });

  it("رسالة فيها أكتر من لوحة **مابتسكّتش** — كل صف بيتحقّق من لوحته هو", () => {
    expect(gate({ index: 0, count: 2 })).toBe(null);
    expect(gate({ index: 1, count: 2 })).toBe(null);
    expect(gate({ index: 2, count: 3 })).toBe(null);
  });

  it("نصّ اتلمّ من رسالتين مابيتسكّتش هنا — النافذة المقسومة بتحاول تثبته", () => {
    expect(gate({ fromCarry: true })).toBe(null);
    expect(gate({ index: 0, count: 2, fromCarry: true })).toBe(null);
  });

  it("دخل بايظ = أأمن قرار (سكوت)، مافيش «فاضي = عدّي»", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeEmitGate({ count: NaN } as any)).toBe("multi_plate_message");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeEmitGate({ index: 0, count: 0 } as any)).toBe("multi_plate_message");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeEmitGate({ index: 3, count: 1 } as any)).toBe("multi_plate_message");
    // غايب تماماً = السلوك القديم (سجل وحيد) — المنادي المحلي بيبعت لوحة واحدة.
    expect(planJudgeEmitGate(undefined)).toBe(null);
  });
});

describe("planJudgeSlice — البوابة جوّه **نقطة القرار الوحيدة**", () => {
  const base = {
    hasConfig: true, timing: { startMs: 10000, endMs: 12500 },
    chunkSizes: Array.from({ length: 200 }, () => 4000), base: 0, pausedMs: 0,
    inflight: 0, maxInflight: 2, maxQueue: 2,
  };

  it("بلا `emit` السلوك بالحرف زي ما هو", () => {
    expect(planJudgeSlice(base).skip).toBe(null);
  });

  it("سجل من رسالة بلوحتين **بلا كلمات** بيسكت: نافذة الرسالة ممنوعة عليه", () => {
    expect(planJudgeSlice({ ...base, emit: { index: 1, count: 2, fromCarry: false } }).skip)
      .toBe("multi_plate_message");
  });

  it("carry-over بيتسكّت كمان — والسبب بيسبق أي سبب توقيت", () => {
    // بلا توقيت خالص كان السبب `no_timing`؛ السبب الأصدق هنا إن الصوت نفسه
    // موزّع على رسالتين، فمافيش نافذة صح موجودة أصلاً.
    const p = planJudgeSlice({
      ...base, timing: null, emit: { index: 0, count: 1, fromCarry: true },
    });
    expect(p.skip).toBe("carried_over");
  });

  it("بوابة الإعداد لسه بتكسب على الاتنين (فشل مغلق ماينكسرش)", () => {
    expect(planJudgeSlice({
      ...base, hasConfig: false, emit: { index: 1, count: 2, fromCarry: true },
    }).skip).toBe("not_configured");
  });

  it("السببين في قايمة السجل، كل واحد بجملة ولافتة مميّزة", () => {
    for (const code of ["multi_plate_message", "carried_over"]) {
      expect(JUDGE_OUTCOME_CODES).toContain(code);
      expect(describeJudgeOutcome(code)).not.toBe(code);
      expect(shortJudgeReason(code)).not.toBe(code);
      expect(shortJudgeReason(code).length).toBeLessThan(24);
    }
    expect(describeJudgeOutcome("multi_plate_message"))
      .not.toBe(describeJudgeOutcome("carried_over"));
    expect(shortJudgeReason("multi_plate_message")).not.toBe(shortJudgeReason("carried_over"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الوقيعة اللي البوابة بتقفلها: صف بلوحة **صفر ms** من صوته
// =============================================================================
// المقيس: النتيجة ٢١ في جلسته كانت «٥٠٦٦ بدك ١٥٨٨» — سجلّين: (١) كدط5066
// (أرقامه بس في النبضة، وحروفه carry) و(٢) بدك1588. الاتنين بياخدوا **نفس**
// `judgeTimingRef`. لوحة ٢٥ نطقها ٧٩٨٤٠–٨١٩٣٠ ونافذة النبضة بتنتهي ٨٤٨٢٠، فلو
// السجل الأول عدّى كان بياخد نافذة على صوت لوحة ٢٦ ⇒ الصف بيعرض لوحة غيره.
// ─────────────────────────────────────────────────────────────────────────────
describe("النتيجة ٢١ من جلسة المالك — الحالة اللي كانت بتتلف", () => {
  const WORDS = [
    { word: "5066", start: 80.830, end: 81.930 },
    { word: "باء", start: 82.470, end: 82.960 },
    { word: "دال", start: 83.010, end: 83.500 },
    { word: "كاف", start: 83.550, end: 84.040 },
    { word: "1588", start: 84.090, end: 84.570 },
  ];
  const common = {
    hasConfig: true, timing: null, words: WORDS,
    wordStartMs: 80830, wordEndMs: 84570, arrivalMs: 85371, mediaElapsedMs: 85371,
    streamFresh: true, prevWordEndMs: 80710,
    chunkSizes: Array.from({ length: 400 }, () => 4000), base: 0, pausedMs: 0,
    inflight: 0, maxInflight: 2, maxQueue: 2,
  };

  it("السجل الأول (كدط5066) بيسكت — نافذته كانت هتبقى على صوت لوحة تانية", () => {
    const p = planJudgeSlice({
      ...common, expectPlateNorm: "كدط5066",
      emit: { index: 0, count: 2, fromCarry: true },
    });
    expect(p.skip).toBe("carried_over");
  });

  it("لولا البوابة كانت النافذة مش هتحتوي **ولا ms** من نطق كدط5066", () => {
    const p = planJudgeSlice({ ...common, expectPlateNorm: "كدط5066" });
    // لا النافذة المثبَتة بتطلع (اللوحة مش في الكلمات)…
    expect(p.skip).toBe("window_unproven");
    // …ولا القاعدة القديمة كانت بتلمّها: نطقها ٧٩٨٤٠–٨١٩٣٠ وهي كانت بتبدأ ٨١٤٢٠.
    const old = planJudgeSlice({ ...common, words: null });
    if (old.skip !== null) throw new Error("المفروض تنفع");
    expect(old.startMs).toBe(81420);
    expect(old.startMs).toBeGreaterThan(79840);
  });

  it("السجل التاني (بدك1588) **بيجاوب دلوقتي** — والموديل جابها صح في القياس", () => {
    const p = planJudgeSlice({
      ...common, expectPlateNorm: "بدك1588",
      emit: { index: 1, count: 2, fromCarry: false },
    });
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.windowSource).toBe("plate_words");
    expect(p.startMs).toBe(82220);
    expect(p.endMs).toBe(84820);
  });

  it("ونافذته نفسها بالحرف زي ما لو كان سجل وحيد — البوابة ماكانتش بتضيف حماية", () => {
    const alone = planJudgeSlice({
      ...common, expectPlateNorm: "بدك1588",
      emit: { index: 0, count: 1, fromCarry: false },
    });
    const second = planJudgeSlice({
      ...common, expectPlateNorm: "بدك1588",
      emit: { index: 1, count: 2, fromCarry: false },
    });
    expect(second).toEqual(alone);
    if (alone.skip !== null) return;
    expect(alone.startMs).toBe(82220);          // ٨٢٤٧٠ − ٢٥٠
    expect(alone.endMs).toBe(84820);
    expect(alone.startMs).toBeGreaterThan(81930);   // بعد أرقام لوحة ٢٥
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الإثبات المطلوب: رسالة واحدة بلوحتين ⇒ **نافذتين مختلفتين ماتتراكبوش**
// =============================================================================
// النتيجة ١٣ في جلسة المالك (المقيسة): «٤٥٦٧» (أرقام لوحة ١٥، حروفها في النتيجة
// اللي قبلها) + «كاف هاء طاء ٥٢٥١» (لوحة ١٦ كاملة). سجلّين من رسالة واحدة:
//   • السجل ٠ = ببب٤٥٦٧ (fromCarry) ⇒ نافذته بتلمّ حروفه من النتيجة السابقة.
//   • السجل ١ = كهط٥٢٥١ ⇒ نافذته المثبَتة العادية.
// كل نافذة **متحقَّق** إنها نطق لوحة صفّها (ذرّاتها = لوحة الصف بالظبط)، وحدود
// الجار بتخلّيهم ماتتراكبوش: نهاية الأولى = بداية التانية بالظبط.
// ─────────────────────────────────────────────────────────────────────────────
describe("النتيجة ١٣ — لوحتين في رسالة، نافذتين مختلفتين", () => {
  const W = (word: string, s: number, e: number) => ({ word, start: s / 1000, end: e / 1000 });
  /** كلمات النتيجة ١٣ زي ما هي مقيسة. */
  const FINAL_13 = [
    W("4567", 47870, 49230),
    W("كاف", 49700, 50250), W("هاء", 50300, 50850), W("طاء", 50900, 51400),
    W("5251", 51450, 51930),
  ];
  /** النتيجة اللي قبلها: حروف لوحة ١٥ لوحدها («باء باء باء»). */
  const FINAL_12 = [W("باء", 46290, 46580), W("باء", 46600, 46790), W("باء", 46810, 46940)];
  const HISTORY = [
    { words: FINAL_12, prevWordEndMs: 44940 },   // لوحة ١٤ خلصت هنا
    { words: FINAL_13, prevWordEndMs: 46940 },
  ];
  const common = {
    hasConfig: true, timing: null, words: FINAL_13, finals: HISTORY,
    wordStartMs: 47870, wordEndMs: 51930, arrivalMs: 52930, mediaElapsedMs: 52930,
    streamFresh: true, prevWordEndMs: 46940,
    chunkSizes: Array.from({ length: 400 }, () => 4000), base: 0, pausedMs: 0,
    inflight: 0, maxInflight: 2, maxQueue: 2,
  };
  /** نطق كل لوحة في الجلسة (مقيس) — عشان نعدّ أي ms من صوت لوحة تانية. */
  const VOICED = [
    { plate: 14, s: 42830, e: 44940 },
    { plate: 15, s: 46290, e: 46940 }, { plate: 15, s: 47870, e: 49230 },
    { plate: 16, s: 49700, e: 51930 },
    { plate: 17, s: 52560, e: 54860 },
  ];
  const leak = (startMs: number, endMs: number, own: number) => VOICED
    .filter((v) => v.plate !== own)
    .reduce((t, v) => t + Math.max(0, Math.min(endMs, v.e) - Math.max(startMs, v.s)), 0);

  it("السجل ٠ (ببب4567 — نصّه من رسالتين) بياخد نافذة مقسومة مثبَتة", () => {
    const p = planJudgeSlice({
      ...common, expectPlateNorm: "ببب4567",
      emit: { index: 0, count: 2, fromCarry: true },
    });
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.windowSource).toBe("plate_words_split");
    expect(p.startMs).toBe(46040);            // ٤٦٢٩٠ − ٢٥٠ (وفوق ٤٤٩٤٠)
    expect(p.endMs).toBe(49450);              // محدودة ببداية «كاف» − ٢٥٠
    expect(leak(p.startMs, p.endMs, 15)).toBe(0);
  });

  it("السجل ١ (كهط5251) بياخد نافذته المثبَتة العادية", () => {
    const p = planJudgeSlice({
      ...common, expectPlateNorm: "كهط5251",
      emit: { index: 1, count: 2, fromCarry: false },
    });
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.windowSource).toBe("plate_words");
    expect(p.startMs).toBe(49450);
    expect(p.endMs).toBe(52180);
    expect(leak(p.startMs, p.endMs, 16)).toBe(0);
  });

  it("النافذتين **مختلفتين وماتتراكبوش**، وكل واحدة متحقَّقة ضد لوحة صفّها", () => {
    const a = planJudgeSlice({
      ...common, expectPlateNorm: "ببب4567", emit: { index: 0, count: 2, fromCarry: true },
    });
    const b = planJudgeSlice({
      ...common, expectPlateNorm: "كهط5251", emit: { index: 1, count: 2, fromCarry: false },
    });
    if (a.skip !== null || b.skip !== null) throw new Error("المفروض الاتنين يجاوبوا");
    expect(a.startMs).not.toBe(b.startMs);
    expect(a.endMs).not.toBe(b.endMs);
    expect(a.endMs).toBeLessThanOrEqual(b.startMs);      // ماتتراكبوش
    // ولا واحدة فيها ولا ms من نطق لوحة التانية…
    expect(leak(a.startMs, a.endMs, 15)).toBe(0);
    expect(leak(b.startMs, b.endMs, 16)).toBe(0);
    // …وكل واحدة شايلة نطق لوحتها **بالكامل**.
    expect(a.startMs).toBeLessThanOrEqual(46290);
    expect(a.endMs).toBeGreaterThanOrEqual(49230);
    expect(b.startMs).toBeLessThanOrEqual(49700);
    expect(b.endMs).toBeGreaterThanOrEqual(51930);
  });

  it("لوحة تالتة مالهاش وجود في الكلمات = سكوت (التحقّق هو الحزام)", () => {
    const p = planJudgeSlice({
      ...common, expectPlateNorm: "صقر4022",
      emit: { index: 0, count: 2, fromCarry: false },
    });
    expect(p.skip).toBe("multi_plate_message");
  });
});

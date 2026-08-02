import { describe, it, expect } from "vitest";
import {
  planPlateWindow,
  planJudgeAdmission,
  planJudgeSlice,
  JUDGE_WORD_PAD_MS,
  JUDGE_MAX_PLATE_WINDOW_MS,
  JUDGE_FALLBACK_LAG_MS,
  JUDGE_FALLBACK_SPAN_MS,
  JUDGE_CLOCK_SLACK_MS,
} from "@/lib/plateJudgeClient";
import {
  JUDGE_OUTCOME_CODES,
  describeJudgeOutcome,
  shortJudgeReason,
  newJudgeLogRecord,
} from "@/lib/plateJudgeLog";

// ─────────────────────────────────────────────────────────────────────────────
// نافذة الرأي التاني — **كل رقم في الملف ده مقيس على صوت المالك نفسه**
// =============================================================================
// الجلسة: ٣٠ لوحة بصوت المالك، ٢٥ منها وصلت للخدمة، النتيجة ٩/٣٠ = ٣٠٪ — بينما
// **نفس** الموديل على نفس السيرفر بيجيب ١١٥/١٢٠ = ٩٥٫٨٪ على مقاطع مقطوعة صح.
// يعني العيب في **القصّة** مش في الموديل.
//
// القياس (من ٢٥ مقطع محفوظ في pilot-clips، بإعادة بناء الخط الزمني الصوتي
// المطلق: كل مقطع بيعرف `cut_start` بتاعه، فاتحدنا كل مناطق الكلام في زمن ميديا
// واحد ⇒ ٣٢ مقطع كلام طوله ≥ ١ث):
//   • طول نطق اللوحة:       أدنى ١٫٠٠ث · **وسيط ٢٫١٦ث** · p90 ٢٫٤٠ث · أقصى ٢٫٨٦ث
//   • السكتة بين لوحتين:    **أدنى ٠٫٣٦ث** · p10 ٠٫٥٠ث · وسيط ٠٫٧٧ث
//   • دورة لوحة→لوحة:       وسيط ٢٫٩٨ث
//   • تأخّر وصول is_final:  أدنى ٠٫٣٠ث · **وسيط ٠٫٩٩٩ث** · p90 ١٫٥٢ث · أقصى ٢٫٢٠ث
//   • النافذة اللي كانت بتتبعت فعلاً: **٥٫٩ث وسيط** (٤٫٦–٧٫٧) وفيها **لوحتين**
//     كلام في ٢٣ مقطع من ٢٥.
//
// الحساب القديم (`nowMs − durMs − 3000`, `nowMs + 500`) كان مربوط على **لحظة وصول
// النتيجة** — أي بعد نهاية النطق بـ٠٫٩٩٩ث وسيط — فالنافذة كانت:
//     [ذيل اللوحة السابقة … اللوحة … مقدمة اللوحة اللي بعدها]
// والموديل مدرَّب على **لوحة واحدة في المقطع**، فبيخلط: «اوب٢٣٩٩ → اوب٨٠٤٤»
// (الحروف من اللوحة دي والأرقام من اللي قبلها).
//
// القاعدة الجديدة: نربط النافذة على **توقيت كلمات Deepgram نفسه** (زمن التيار)،
// مش على ساعة الوصول. المبرّر إن توقيت الكلمات = زمن الميديا بالظبط:
// السوكيت والمسجّل بيبدأوا مع بعض في `startDeepgramPtt`، وكل جزء بيتحط في
// `pttAudioChunksRef` **و** بيتبعت للسوكيت بنفس الترتيب (اللي بيتسجّل قبل الفتح
// بيتخزّن ويتفضّى بالترتيب)، وبوابة الكلام مابترميش صوت — فساعة Deepgram بتعدّ
// نفس العيّنات من نفس أول عيّنة.
// ─────────────────────────────────────────────────────────────────────────────

/** المقيس على اللوحة العاشرة (نعح4738) من جلسة المالك — بالملي ثانية. */
const M = {
  prevPlateStart: 26299, prevPlateEnd: 28679,   // اللوحة اللي قبلها (كلام)
  plateStart: 29588, plateEnd: 32208,           // اللوحة دي (كلام) — ٢٫٦٢ث
  arrival: 33108,                               // وصول is_final: بعد النهاية بـ٩٠٠ms
  nextPlateStart: 33364, nextPlateEnd: 34364,   // اللوحة اللي بعدها (كلام)
};

function win(over: Partial<Parameters<typeof planPlateWindow>[0]> = {}) {
  return planPlateWindow({
    wordStartMs: M.plateStart, wordEndMs: M.plateEnd,
    arrivalMs: M.arrival, mediaElapsedMs: M.arrival, streamFresh: true, audioDrops: 0,
    pausedMs: 0, timing: null,
    ...over,
  });
}

describe("planPlateWindow — النافذة من توقيت الكلمات (بصمة الفشل الحقيقية)", () => {
  it("الوصول متأخّر ٩٠٠ms والنافذة **مش** فيها اللوحة اللي قبلها ولا اللي بعدها", () => {
    const p = win();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.source).toBe("words");
    // بعد نهاية اللوحة السابقة، وقبل بداية اللوحة اللي بعدها — الاتنين مقيسين.
    expect(p.startMs).toBeGreaterThan(M.prevPlateEnd);
    expect(p.endMs).toBeLessThan(M.nextPlateStart);
    // وفيها اللوحة دي بالكامل.
    expect(p.startMs).toBeLessThanOrEqual(M.plateStart);
    expect(p.endMs).toBeGreaterThanOrEqual(M.plateEnd);
  });

  it("طول النافذة = النطق + حشوة على كل جنب — بحجم لوحة، مش ٥٫٩ث", () => {
    const p = win();
    if (!p.ok) return;
    expect(p.startMs).toBe(M.plateStart - JUDGE_WORD_PAD_MS);
    expect(p.endMs).toBe(M.plateEnd + JUDGE_WORD_PAD_MS);
    expect(p.endMs - p.startMs).toBe(2620 + 2 * JUDGE_WORD_PAD_MS);   // ٣٫١٢ث
    expect(p.endMs - p.startMs).toBeLessThanOrEqual(JUDGE_MAX_PLATE_WINDOW_MS);
  });

  it("الحساب القديم (مربوط على الوصول) كان بيخد لوحتين — إثبات الباج", () => {
    // نفس أرقام القياس في المعادلة القديمة بالحرف.
    const oldStart = M.arrival - (M.plateEnd - M.plateStart) - 3000;
    const oldEnd = M.arrival + 500;
    expect(oldStart).toBeLessThan(M.prevPlateEnd);      // داخل اللوحة السابقة
    expect(oldEnd).toBeGreaterThan(M.nextPlateStart);   // وداخل اللي بعدها
    expect(oldEnd - oldStart).toBeGreaterThan(5000);    // ٥٫٩ث زي المقيس
  });

  it("حشوة ٢٥٠ms أصغر من أدنى سكتة مقيسة بين لوحتين (٣٦٠ms)", () => {
    expect(JUDGE_WORD_PAD_MS).toBeLessThan(360);
  });

  it("توقيت الكلمات زمن ميديا — الإيقاف المؤقت **مايتخصمش** منه", () => {
    const p = win({ pausedMs: 4000 });
    if (!p.ok) return;
    expect(p.startMs).toBe(M.plateStart - JUDGE_WORD_PAD_MS);
    expect(p.endMs).toBe(M.plateEnd + JUDGE_WORD_PAD_MS);
  });

  it("البداية عمرها ما تبقى سالبة (أول لوحة في الجلسة)", () => {
    const p = win({ wordStartMs: 100, wordEndMs: 2300, arrivalMs: 3300, mediaElapsedMs: 3300 });
    if (!p.ok) return;
    expect(p.startMs).toBe(0);
    expect(p.endMs).toBe(2550);
  });

  it("نتيجة نهائية لزقت لوحتين: النافذة بتتقصّ على حجم لوحة من **الآخر**", () => {
    // أطول نطق لوحة واحدة مقيس = ٢٫٨٦ث، فأي span أطول من كده = Deepgram لزق
    // نبضتين. الصف اللي بنحكم عليه طلع من **آخر** نبضة، والمالك قاس إن التقصير
    // لآخر ٣٫٢ث بيرفع النتيجة (٦→٩ في أول ١٢) ⇒ نربط على النهاية.
    const p = win({ wordStartMs: 20000, wordEndMs: 28000 });   // ٨ث = لزق
    if (!p.ok) return;
    expect(p.source).toBe("words_capped");
    expect(p.endMs).toBe(28000 + JUDGE_WORD_PAD_MS);
    expect(p.endMs - p.startMs).toBe(JUDGE_MAX_PLATE_WINDOW_MS);
  });

  it("أطول نطق لوحة مقيس (٢٫٨٦ث) لسه جوّه السقف — السقف مايقصّش لوحة حقيقية", () => {
    const p = win({ wordStartMs: 10000, wordEndMs: 12860 });
    if (!p.ok) return;
    expect(p.source).toBe("words");
    expect(p.endMs - p.startMs).toBe(2860 + 2 * JUDGE_WORD_PAD_MS);
  });

  it("لوحتين بينهم ٠٫٢٥ث = نافذتين مختلفتين، كل واحدة فيها لوحتها بس", () => {
    // إيقاع المالك الأسرع: ٢٫٢٦ث نطق + ٠٫٢٥ث سكتة.
    const A = { s: 10000, e: 12260 };
    const B = { s: 12510, e: 14770 };
    const wa = planPlateWindow({ wordStartMs: A.s, wordEndMs: A.e, arrivalMs: A.e + 1000, mediaElapsedMs: A.e + 1000, streamFresh: true });
    const wb = planPlateWindow({ wordStartMs: B.s, wordEndMs: B.e, arrivalMs: B.e + 1000, mediaElapsedMs: B.e + 1000, streamFresh: true });
    if (!wa.ok || !wb.ok) throw new Error("المفروض الاتنين ينفعوا");
    expect(wa.startMs).not.toBe(wb.startMs);
    expect(wa.endMs).not.toBe(wb.endMs);
    // نافذة A مافيهاش أي كلام من B، ونافذة B مافيهاش أي كلام من A.
    expect(wa.endMs).toBeLessThanOrEqual(B.s);
    expect(wb.startMs).toBeGreaterThanOrEqual(A.e);
    // وكل واحدة بحجم لوحة.
    expect(wa.endMs - wa.startMs).toBeLessThanOrEqual(JUDGE_MAX_PLATE_WINDOW_MS);
    expect(wb.endMs - wb.startMs).toBeLessThanOrEqual(JUDGE_MAX_PLATE_WINDOW_MS);
  });
});

describe("planPlateWindow — الاحتياطي المحكم (ساعة الحقيقة)", () => {
  it("مافيش توقيت كلمات ⇒ نافذة من الوصول، محكومة، وبتنتهي **قبل** الوصول", () => {
    const p = planPlateWindow({ arrivalMs: M.arrival, streamFresh: true });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.source).toBe("wallclock");
    expect(p.endMs).toBe(M.arrival - JUDGE_FALLBACK_LAG_MS + JUDGE_WORD_PAD_MS);
    expect(p.startMs).toBe(p.endMs - JUDGE_FALLBACK_SPAN_MS - 2 * JUDGE_WORD_PAD_MS);
    expect(p.endMs).toBeLessThan(M.arrival);
  });

  it("الاحتياطي **مستحيل** يشيل لوحتين كاملتين عند إيقاع المالك", () => {
    const p = planPlateWindow({ arrivalMs: 50000, streamFresh: true });
    if (!p.ok) return;
    const len = p.endMs - p.startMs;
    // لوحتين كاملتين عند أسرع إيقاع مقيس = ٢٢٦٠ + ٢٥٠ سكتة + ٢٢٦٠ = ٤٧٧٠ms.
    expect(len).toBeLessThan(2260 + 250 + 2260);
    // وحتى بأطول نطق مقيس (٢٫٨٦ث) السقف ٣٤٠٠ms.
    expect(len).toBeLessThanOrEqual(JUDGE_MAX_PLATE_WINDOW_MS);
    const wide = planPlateWindow({ arrivalMs: 50000, wordStartMs: 0, wordEndMs: 99999, audioDrops: 1, streamFresh: true });
    if (!wide.ok) return;
    expect(wide.endMs - wide.startMs).toBeLessThanOrEqual(JUDGE_MAX_PLATE_WINDOW_MS);
  });

  it("الاحتياطي بياخد مدة النطق الحقيقية لو الكلمات موجودة بس ساعتها مش موثوقة", () => {
    // إعادة الاتصال بتزحّف الساعة، بس **الفرق** بين كلمتين في نفس الرسالة
    // بيفضل صح — فالمدة بتتستخدم والمرساة بتبقى ساعة الحقيقة.
    const p = planPlateWindow({ wordStartMs: 0, wordEndMs: 2000, arrivalMs: 40000, audioDrops: 3, streamFresh: true });
    if (!p.ok) return;
    expect(p.source).toBe("wallclock");
    expect(p.endMs - p.startMs).toBe(2000 + 2 * JUDGE_WORD_PAD_MS);
  });

  it("الاحتياطي بيخصم الإيقاف المؤقت (ساعة حقيقية ≠ زمن ميديا)", () => {
    const a = planPlateWindow({ arrivalMs: 40000, streamFresh: true });
    const b = planPlateWindow({ arrivalMs: 40000, pausedMs: 5000, streamFresh: true });
    if (!a.ok || !b.ok) return;
    expect(a.startMs - b.startMs).toBe(5000);
    expect(a.endMs - b.endMs).toBe(5000);
  });

  it("ساعة كلمات من المستقبل (أكبر من الصوت المتجمّع) = مش موثوقة ⇒ احتياطي", () => {
    const p = planPlateWindow({
      wordStartMs: 60000, wordEndMs: 62000,          // ساعة تيار قديم
      arrivalMs: 3000, mediaElapsedMs: 3000, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.source).toBe("wallclock");
  });

  it("سماحية الساعة: جزء واحد ناقص (٢٥٠ms) مايكفّرش توقيت سليم", () => {
    const p = planPlateWindow({
      wordStartMs: 10000, wordEndMs: 12200,
      arrivalMs: 12400, mediaElapsedMs: 12150, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.source).toBe("words");
    expect(JUDGE_CLOCK_SLACK_MS).toBeGreaterThanOrEqual(250);
  });

  it("مافيش وصول ولا كلمات = سكوت مسمّى، مش نافذة مخترعة", () => {
    const p = planPlateWindow({ streamFresh: true });
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toBe("no_timing");
  });

  it("نافذة جاهزة (المسار المتوافق للخلف) بتتخصم منها فترة الإيقاف", () => {
    const p = planPlateWindow({ timing: { startMs: 10000, endMs: 12000 }, pausedMs: 4000 });
    if (!p.ok) return;
    expect(p.source).toBe("explicit");
    expect(p.startMs).toBe(6000);
    expect(p.endMs).toBe(8000);
  });
});

describe("planPlateWindow — إعادة اتصال Deepgram", () => {
  it("رسالة من تيار قديم = **سكوت مسمّى** (مافيش مرساة سليمة خالص)", () => {
    // إعادة الاتصال بتعمل سوكيت جديد **ومسجّل جديد**: ساعة Deepgram ترجع صفر،
    // و`dgRecStartRef` و`judgeStreamBaseRef` يتصفّروا معاها. يعني نتيجة نهائية
    // متأخّرة من السوكيت القديم صوتها **قبل** بادئة التيار الحالي: لا توقيت
    // الكلمات ولا ساعة الحقيقة بيدلّوا على الصوت الصح. السكوت هو الصح.
    const p = win({ streamFresh: false });
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.reason).toBe("stale_stream");
  });

  it("بعد إعادة اتصال ناجحة، الرسايل الجديدة سليمة فوراً (الساعتين اتصفّروا مع بعض)", () => {
    const p = planPlateWindow({
      wordStartMs: 500, wordEndMs: 2700, arrivalMs: 3600, mediaElapsedMs: 3600, streamFresh: true,
    });
    if (!p.ok) return;
    expect(p.source).toBe("words");
    expect(p.startMs).toBe(250);
    expect(p.endMs).toBe(2950);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// الطابور: المالح بيتكلم أسرع من الطلب — ٥ لوحات من ٣٠ اتسكتت `busy`
// =============================================================================
// المقيس: زمن الخدمة ٤١٠–١٨٦٥ms (وسيط ١١٣٥ms على النوافذ ٦ث القديمة؛ نافذة ٣ث
// بترجّعه لـ٣٠٠–٥٠٠ms)، ودورة لوحة→لوحة وسيط ٢٫٩٨ث، وتأخّر الوصول بيتلخبط
// ٠٫٣–٢٫٢ث فالنتايج النهائية بتتلزق ورا بعض. سقف ١ = اللوحة اللي بتيجي وسط طلب
// **بتتضيّع**. الخدمة نفسها بتسمح ٤ مع بعض (`--max-inflight`).
// ─────────────────────────────────────────────────────────────────────────────
describe("planJudgeAdmission — سقف + طابور قصير بدل الضياع", () => {
  it("تحت السقف = يمشي فوراً", () => {
    expect(planJudgeAdmission({ inflight: 0, queued: 0, maxInflight: 2, maxQueue: 2 })).toBe("run");
    expect(planJudgeAdmission({ inflight: 1, queued: 0, maxInflight: 2, maxQueue: 2 })).toBe("run");
  });

  it("السقف ملآن والطابور فيه مكان = يستنى (مش يتضيّع)", () => {
    expect(planJudgeAdmission({ inflight: 2, queued: 0, maxInflight: 2, maxQueue: 2 })).toBe("queue");
    expect(planJudgeAdmission({ inflight: 2, queued: 1, maxInflight: 2, maxQueue: 2 })).toBe("queue");
  });

  it("الطابور ملآن = سبب مميّز `queue_full` (مش `busy`)", () => {
    expect(planJudgeAdmission({ inflight: 2, queued: 2, maxInflight: 2, maxQueue: 2 })).toBe("queue_full");
  });

  it("بلا طابور (السلوك القديم) = `busy` بالحرف", () => {
    expect(planJudgeAdmission({ inflight: 1, queued: 0, maxInflight: 1, maxQueue: 0 })).toBe("busy");
    expect(planJudgeAdmission({ inflight: 1, queued: 0, maxInflight: 1 })).toBe("busy");
  });

  it("دخل بايظ = أأمن قرار (يمشي طلب واحد بالكتير)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeAdmission({} as any)).toBe("run");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeAdmission({ inflight: NaN, queued: NaN } as any)).toBe("run");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeAdmission({ inflight: 99 } as any)).toBe("busy");
  });

  it("planJudgeSlice بياخد نفس القرار — نقطة سكوت واحدة", () => {
    const base = {
      hasConfig: true, timing: { startMs: 0, endMs: 1500 },
      chunkSizes: Array.from({ length: 40 }, () => 4000), base: 0, pausedMs: 0,
    };
    expect(planJudgeSlice({ ...base, inflight: 2, queued: 2, maxInflight: 2, maxQueue: 2 }).skip)
      .toBe("queue_full");
    expect(planJudgeSlice({ ...base, inflight: 1, maxInflight: 1 }).skip).toBe("busy");
    expect(planJudgeSlice({ ...base, inflight: 1, maxInflight: 2, maxQueue: 2 }).skip).toBe(null);
  });
});

describe("planJudgeSlice — بيمرّر المكوّنات الخام لـplanPlateWindow", () => {
  const sizes = (n: number) => Array.from({ length: n }, () => 4000);

  it("بيقصّ على توقيت الكلمات، والقصّة بتلمّ النافذة كلها", () => {
    const p = planJudgeSlice({
      hasConfig: true, timing: null,
      wordStartMs: 29588, wordEndMs: 32208, arrivalMs: 33108,
      mediaElapsedMs: 33108, streamFresh: true, audioDrops: 0,
      inflight: 0, chunkSizes: sizes(200), base: 0, pausedMs: 0,
      maxInflight: 2, maxQueue: 2,
    });
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.startMs).toBe(29338);
    expect(p.endMs).toBe(32458);
    // القصّة لازم توصل لنهاية النافذة: ceil(32458/250) + 2 = 132
    expect(p.endIdx).toBe(132);
    expect(p.startMs).toBeGreaterThan(28679);   // بعد اللوحة السابقة
  });

  it("السجل بيحفظ **أي قاعدة نافذة** اشتغلت — وإلا مافيش طريقة نقيس الإصلاح", () => {
    expect(newJudgeLogRecord({ id: "a", agentId: "x" }).windowSource).toBe(null);
    expect(newJudgeLogRecord({ id: "a", agentId: "x", windowSource: "words" }).windowSource)
      .toBe("words");
  });

  it("السببين الجديدين في قايمة السجل، وكل واحد بجملة ولافتة مميّزة", () => {
    for (const code of ["queue_full", "stale_stream"]) {
      expect(JUDGE_OUTCOME_CODES).toContain(code);
      expect(describeJudgeOutcome(code)).not.toBe(code);
      expect(shortJudgeReason(code)).not.toBe(code);
      expect(shortJudgeReason(code).length).toBeLessThan(24);
    }
    // ومختلفين عن `busy` — «فاتت لأن الطابور ملآن» ≠ «فاتت لأن فيه طلب شغّال».
    expect(describeJudgeOutcome("queue_full")).not.toBe(describeJudgeOutcome("busy"));
    expect(shortJudgeReason("queue_full")).not.toBe(shortJudgeReason("busy"));
  });

  it("رسالة من تيار قديم = `stale_stream` مش نافذة على صوت غلط", () => {
    const p = planJudgeSlice({
      hasConfig: true, timing: null,
      wordStartMs: 29588, wordEndMs: 32208, arrivalMs: 500,
      mediaElapsedMs: 500, streamFresh: false,
      inflight: 0, chunkSizes: sizes(200), base: 190, pausedMs: 0,
      maxInflight: 2, maxQueue: 2,
    });
    expect(p.skip).toBe("stale_stream");
  });
});

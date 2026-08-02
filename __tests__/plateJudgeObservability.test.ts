// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  planJudgeSlice,
  buildSelfTestClip,
  probeJudgeTranscribe,
  JUDGE_MAX_PREFIX_BYTES,
  SELF_TEST_MIME,
  SELF_TEST_MS,
  SELF_TEST_SR,
} from "@/lib/plateJudgeClient";
import {
  JUDGE_OUTCOME_CODES,
  describeJudgeOutcome,
  shortJudgeReason,
  formatJudgeSessionLine,
  bumpJudgeCounts,
  emptyJudgeCounts,
} from "@/lib/plateJudgeLog";

// ─────────────────────────────────────────────────────────────────────────────
// درس الحادثة الميدانية: **الصفر كان شكله زي النجاح**. الطيّار سكت جلسة كاملة
// (صفر طلبات وصلت للخدمة) والمربّع كان بيقول «متوصّل» طول الوقت، والسبب الحقيقي
// كان مدفون في IndexedDB لحد ما حد يدوس «السجل» بعد أسبوع.
//
// الملف ده بيغطّي التلات حاجات اللي بيخلّوا السكوت **مستحيل يبقى صامت**:
//   ١. `planJudgeSlice` — **نقطة القرار الوحيدة** للسكوت. كل سبب سكوت لازم يكون
//      قابل للوصول، ومسمّى، ومميّز، والنافذة اللي بتطلع منها لازم تكون محدودة
//      (مافيش قصّة غلط ولا قصّة أكبر من السقف، ولا قصّة من غير ترويسة التيار).
//   ٢. `buildSelfTestClip` + `probeJudgeTranscribe` — «جرّب الاتصال»: رحلة كاملة
//      حقيقية للخدمة قبل ما المندوب يتكلّم، بترجّع اللوحة والزمن أو خطأ HTTP
//      بالحرف. «متوصّل» بتوصف التخزين؛ دي بتوصف الواقع.
//   ٣. `formatJudgeSessionLine` — عدّاد الجلسة بيعدّ **المسكوت زي المجاوب** مع
//      أعلى سبب، وجلسة صفر بتبان صفر بالنص.
// ─────────────────────────────────────────────────────────────────────────────

const KB = 4000;                       // ~حجم جزء ٢٥٠ms من webm/opus 24k

/** أحجام أجزاء جلسة بطول n جزء. */
function sizes(n: number, each = KB): number[] {
  return Array.from({ length: n }, () => each);
}

/** دخل سليم بالكامل — كل اختبار بيبوّظ حاجة واحدة بس. */
function goodInput(over: Partial<Parameters<typeof planJudgeSlice>[0]> = {}) {
  return {
    hasConfig: true,
    timing: { startMs: 0, endMs: 1500 },
    inflight: 0,
    chunkSizes: sizes(40),
    base: 0,
    pausedMs: 0,
    ...over,
  };
}

describe("planJudgeSlice — نقطة القرار الوحيدة للسكوت", () => {
  it("الحالة السليمة: بيرجّع نافذة ومافيش سكوت", () => {
    const p = planJudgeSlice(goodInput());
    expect(p.skip).toBe(null);
    if (p.skip !== null) return;
    expect(p.base).toBe(0);
    expect(p.startMs).toBe(0);
    expect(p.endMs).toBe(1500);
    // endIdx = base + ceil(1500/250) + 2 = 8، والأجزاء ٤٠ فمافيش قصّ
    expect(p.endIdx).toBe(8);
    expect(p.bytes).toBe(8 * KB);
  });

  // ── الخمسة أسباب: كل واحد له دخل واقعي يوصله، وكلهم مختلفين ──────────────
  it("not_configured — مافيش عنوان/توكن على الجهاز", () => {
    expect(planJudgeSlice(goodInput({ hasConfig: false })).skip).toBe("not_configured");
  });

  it("no_timing — Deepgram مابعتش كلمات للنبضة دي", () => {
    expect(planJudgeSlice(goodInput({ timing: null })).skip).toBe("no_timing");
  });

  it("no_timing — توقيت غير منتهي (NaN/Infinity) بيتسمّى بسببه الصح مش «بلا صوت»", () => {
    expect(planJudgeSlice(goodInput({ timing: { startMs: NaN, endMs: 1500 } })).skip).toBe("no_timing");
    expect(planJudgeSlice(goodInput({ timing: { startMs: 0, endMs: Infinity } })).skip).toBe("no_timing");
  });

  it("busy — طلب سابق لسه جوّه (السقف ١)", () => {
    expect(planJudgeSlice(goodInput({ inflight: 1 })).skip).toBe("busy");
    expect(planJudgeSlice(goodInput({ inflight: 1, maxInflight: 2 })).skip).toBe(null);
  });

  it("no_audio — مافيش أجزاء متجمّعة بعد ترويسة التيار", () => {
    expect(planJudgeSlice(goodInput({ chunkSizes: [] })).skip).toBe("no_audio");
    // التيار اتعاد اتصاله دلوقتي: base = طول المصفوفة ⇒ مافيش جزء بعده
    expect(planJudgeSlice(goodInput({ chunkSizes: sizes(10), base: 10 })).skip).toBe("no_audio");
  });

  it("prefix_too_large — البادئة عدّت السقف، والحجم بيتسجّل معاها", () => {
    const big = Math.ceil(JUDGE_MAX_PREFIX_BYTES / KB) + 20;
    const p = planJudgeSlice(goodInput({ chunkSizes: sizes(big), timing: { startMs: 0, endMs: big * 250 } }));
    expect(p.skip).toBe("prefix_too_large");
    expect(p.bytes).toBeGreaterThan(JUDGE_MAX_PREFIX_BYTES);
  });

  it("الأسباب الخمسة كلها مميّزة", () => {
    const got = [
      planJudgeSlice(goodInput({ hasConfig: false })).skip,
      planJudgeSlice(goodInput({ timing: null })).skip,
      planJudgeSlice(goodInput({ inflight: 1 })).skip,
      planJudgeSlice(goodInput({ chunkSizes: [] })).skip,
      planJudgeSlice(goodInput({
        chunkSizes: sizes(Math.ceil(JUDGE_MAX_PREFIX_BYTES / KB) + 20),
        timing: { startMs: 0, endMs: 1e6 },
      })).skip,
    ];
    expect(new Set(got).size).toBe(5);
  });

  it("الترتيب محفوظ: مافيش إعداد يكسب على مافيش توقيت يكسب على مزنوق", () => {
    expect(planJudgeSlice(goodInput({ hasConfig: false, timing: null, inflight: 9 })).skip)
      .toBe("not_configured");
    expect(planJudgeSlice(goodInput({ timing: null, inflight: 9 })).skip).toBe("no_timing");
  });

  // ── النافذة: مستحيل تطلع غلط أو أكبر من اللازم ───────────────────────────
  it("الإيقاف المؤقت بيتخصم من زمن الميديا (مافيش زحف)", () => {
    const p = planJudgeSlice(goodInput({ timing: { startMs: 10000, endMs: 12000 }, pausedMs: 4000 }));
    if (p.skip !== null) throw new Error("مفروض ماتسكتش");
    expect(p.startMs).toBe(6000);
    expect(p.endMs).toBe(8000);
  });

  it("البداية عمرها ما تبقى سالبة والنهاية عمرها ما تبقى ≤ البداية", () => {
    const p = planJudgeSlice(goodInput({ timing: { startMs: 100, endMs: 200 }, pausedMs: 99999 }));
    if (p.skip !== null) throw new Error("مفروض ماتسكتش");
    expect(p.startMs).toBe(0);
    expect(p.endMs).toBeGreaterThan(p.startMs);
  });

  it("base سالب/كسري بيتقصّ على صفر — القصّة عمرها ما تبدأ من غير ترويسة التيار", () => {
    const a = planJudgeSlice(goodInput({ base: -5 }));
    const b = planJudgeSlice(goodInput({ base: 3.7 }));
    if (a.skip !== null || b.skip !== null) throw new Error("مفروض ماتسكتش");
    expect(a.base).toBe(0);
    expect(b.base).toBe(3);
  });

  it("endIdx عمره ما يعدّي طول المصفوفة، والقصّة عمرها ما تعدّي السقف", () => {
    const p = planJudgeSlice(goodInput({ chunkSizes: sizes(12), timing: { startMs: 0, endMs: 600000 } }));
    if (p.skip !== null) throw new Error("مفروض ماتسكتش");
    expect(p.endIdx).toBe(12);
    expect(p.bytes).toBeLessThanOrEqual(JUDGE_MAX_PREFIX_BYTES);
  });

  it("دخل بايظ خالص = سكوت مسمّى، مش استثناء", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeSlice({} as any).skip).toBe("not_configured");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(planJudgeSlice({ hasConfig: true } as any).skip).toBe("no_timing");
  });
});

describe("buildSelfTestClip — مقطع صناعي صغير للفحص", () => {
  it("WAV سليم ١٦ك مونو، وفوق كل حدود الخدمة الدنيا", () => {
    const blob = buildSelfTestClip();
    expect(blob.type).toBe(SELF_TEST_MIME);
    const samples = (SELF_TEST_SR * SELF_TEST_MS) / 1000;
    expect(blob.size).toBe(44 + samples * 2);
    // serving/plate_server.py:877 محتاج ≥٦٤ بايت، و:294 محتاج ≥٤٠٠ عيّنة
    expect(blob.size).toBeGreaterThan(64);
    expect(samples).toBeGreaterThan(400);
    // صغير خالص — الفحص مايزنقش نفس الرفع اللي بث Deepgram عايش عليه
    expect(blob.size).toBeLessThan(64 * 1024);
  });

  it("ترويسة RIFF/WAVE بالمعدّل والقنوات الصح", async () => {
    const buf = new Uint8Array(await buildSelfTestClip().arrayBuffer());
    const tag = (i: number) => String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(12)).toBe("fmt ");
    expect(tag(36)).toBe("data");
    const dv = new DataView(buf.buffer);
    expect(dv.getUint16(22, true)).toBe(1);              // مونو
    expect(dv.getUint32(24, true)).toBe(SELF_TEST_SR);   // ١٦ كيلو
    expect(dv.getUint16(34, true)).toBe(16);             // ١٦ بِت
  });

  it("فيه إشارة فعلية — مش سكوت رقمي (عشان مايوقعش في مسار «صوت فاضي»)", async () => {
    const dv = new DataView(await buildSelfTestClip().arrayBuffer());
    let peak = 0;
    for (let i = 44; i + 1 < dv.byteLength; i += 2) peak = Math.max(peak, Math.abs(dv.getInt16(i, true)));
    expect(peak).toBeGreaterThan(100);
  });
});

describe("probeJudgeTranscribe — «جرّب الاتصال»", () => {
  const CFG = { transcribeUrl: "https://judge.example.com/transcribe", token: "kK7xQm2ZpR9tVn4bLc6HdW8sYf3jGa5U" };

  it("رحلة ناجحة: بترجّع اللوحة والزمن والموديل", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      plate: "ابح1234", plate_norm: "ابح1234", accepted: true, ms: 231, model: "whisper-plates-v6",
      confidence: { mean_logprob: -0.11, min_logprob: -0.44, no_speech_prob: 0.002 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const r = await probeJudgeTranscribe({ ...CFG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    expect(r.code).toBe("answered");
    expect(r.plate).toBe("ابح1234");
    expect(r.serverMs).toBe(231);
    expect(r.model).toBe("whisper-plates-v6");
    expect(r.bytes).toBeGreaterThan(64);
    expect(typeof r.clientMs).toBe("number");
    // الفحص بيمشي على **نفس** مسار النبضة: POST بالتوكن في الترويسة
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CFG.transcribeUrl);          // بلا نافذة قصّ — المقطع كله
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Plate-Token"]).toBe(CFG.token);
  });

  it("٤٠١ بتوصل للمالك بالحرف مش «مش عارف»", async () => {
    const r = await probeJudgeTranscribe({
      ...CFG,
      fetchImpl: (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("http_401");
  });

  it("٤٠٤ (العنوان فيه /ping مثلاً) بتتسمّى ٤٠٤", async () => {
    const r = await probeJudgeTranscribe({
      ...CFG,
      fetchImpl: (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch,
    });
    expect(r.code).toBe("http_404");
  });

  it("الطلب مخرجش من الجهاز (CORS/نفق واقع) = network", async () => {
    const r = await probeJudgeTranscribe({
      ...CFG, retryDelayMs: 0,
      fetchImpl: (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch,
    });
    expect(r.code).toBe("network");
    expect(r.ok).toBe(false);
  });

  it("بلا إعداد = not_configured بلا أي طلب", async () => {
    const fetchImpl = vi.fn();
    const r = await probeJudgeTranscribe({
      transcribeUrl: "", token: "", fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.code).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("مافيش fetch خالص ⇒ no_answer (الحزام الأخير — الكود الوحيد اللي مالوش مسار عادي)", async () => {
    // `postAudioForPlate` بترجّع null بلا `onError` بس في حراس البداية (بلا
    // fetch / بلا blob)، فـ`no_answer` هو **الاحتياطي** لو كل الأكواد المسمّاة
    // فشلت تتولد. لازم يفضل موجود ومسمّى، مايبقاش سلسلة فاضية.
    const r = await probeJudgeTranscribe({ ...CFG, fetchImpl: null });
    expect(r.code).toBe("no_answer");
    expect(r.ok).toBe(false);
  });

  it("عمرها ما ترمي — لو fetch رمى حاجة غريبة برضه بترجّع نتيجة", async () => {
    const r = await probeJudgeTranscribe({
      ...CFG,
      fetchImpl: (() => { throw new Error("boom"); }) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(typeof r.code).toBe("string");
    expect(r.code.length).toBeGreaterThan(0);
  });
});

describe("عدّاد الجلسة — المسكوت بيتعدّ زي المجاوب", () => {
  it("جلسة صفر بتبان صفر بالنص (ده اللي الحادثة كشفته)", () => {
    const line = formatJudgeSessionLine(emptyJudgeCounts());
    expect(line).toContain("0 نبضة");
    expect(line).toMatch(/مافيش/);
  });

  it("١٢ نبضة · اتفاق ١٠ · مسكوتة ٢ مع أعلى سبب", () => {
    let c = emptyJudgeCounts();
    for (let i = 0; i < 10; i++) c = bumpJudgeCounts(c, "answered", i < 10);
    c = bumpJudgeCounts(c, "no_timing", false);
    c = bumpJudgeCounts(c, "no_timing", false);
    expect(c.answered).toBe(10);
    expect(c.agree).toBe(10);
    expect(c.skipped).toBe(2);
    expect(formatJudgeSessionLine(c)).toBe("الجلسة: 12 نبضة · اتفاق 10 · مسكوتة 2 (بلا توقيت)");
  });

  it("أعلى سبب هو الأكتر تكراراً، والتعادل بيتحسم ثابت", () => {
    let c = emptyJudgeCounts();
    c = bumpJudgeCounts(c, "busy", false);
    c = bumpJudgeCounts(c, "http_401", false);
    c = bumpJudgeCounts(c, "http_401", false);
    expect(formatJudgeSessionLine(c)).toContain("توكن غلط");
    let d = emptyJudgeCounts();
    d = bumpJudgeCounts(d, "network", false);
    d = bumpJudgeCounts(d, "busy", false);
    expect(formatJudgeSessionLine(d)).toBe(formatJudgeSessionLine(d));   // ثابت
    expect(formatJudgeSessionLine(d)).toContain("مسكوتة 2");
  });

  it("مسكوتة صفر بتتكتب صريحة — الصمت عمره ما يبقى ضمني", () => {
    let c = emptyJudgeCounts();
    c = bumpJudgeCounts(c, "answered", true);
    expect(formatJudgeSessionLine(c)).toBe("الجلسة: 1 نبضة · اتفاق 1 · مسكوتة 0");
  });

  it("bumpJudgeCounts دالة نقية — مابتلمسش الكائن القديم", () => {
    const a = emptyJudgeCounts();
    const b = bumpJudgeCounts(a, "busy", false);
    expect(a.skipped).toBe(0);
    expect(b.skipped).toBe(1);
    expect(b).not.toBe(a);
  });
});

describe("كل كود نتيجة له اسم عربي مميّز — مافيش كود بيختفي", () => {
  it("القايمة الكاملة مغطّاة بجملة طويلة مختلفة لكل كود", () => {
    const long = JUDGE_OUTCOME_CODES.map((c) => describeJudgeOutcome(c));
    for (let i = 0; i < JUDGE_OUTCOME_CODES.length; i++) {
      // لو الوصف = الكود نفسه يبقى الكود وقع في مسار «مش معروف»
      expect(long[i]).not.toBe(JUDGE_OUTCOME_CODES[i]);
      expect(long[i].length).toBeGreaterThan(2);
    }
    expect(new Set(long).size).toBe(JUDGE_OUTCOME_CODES.length);
  });

  it("والقايمة الكاملة مغطّاة بلافتة قصيرة مختلفة لكل كود", () => {
    const short = JUDGE_OUTCOME_CODES.map((c) => shortJudgeReason(c));
    for (let i = 0; i < JUDGE_OUTCOME_CODES.length; i++) {
      expect(short[i]).not.toBe(JUDGE_OUTCOME_CODES[i]);
      expect(short[i].length).toBeGreaterThan(1);
      expect(short[i].length).toBeLessThan(24);          // بتتعرض جوّه سطر واحد
    }
    expect(new Set(short).size).toBe(JUDGE_OUTCOME_CODES.length);
  });

  it("القايمة فيها كل أسباب planJudgeSlice وكل أكواد postAudioForPlate", () => {
    for (const c of ["not_configured", "no_timing", "busy", "no_audio", "prefix_too_large",
      "timeout", "network", "bad_json", "bad_shape", "error", "no_answer", "answered"]) {
      expect(JUDGE_OUTCOME_CODES).toContain(c);
    }
  });

  it("كود جديد مش في القايمة بيظهر خام — أحسن من ما يختفي", () => {
    expect(shortJudgeReason("http_418")).toContain("418");
    expect(describeJudgeOutcome("http_418")).toContain("418");
    expect(shortJudgeReason("something_new")).toBe("something_new");
  });
});

import { describe, it, expect } from "vitest";
import { MicLossDetector, SILENCED_MS, MUTED_MS, CONTEXT_SUSPEND_GRACE_MS, micLostNotice, stopsRecording } from "@/lib/micLoss";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  المكالمة ليها الأولوية — التسجيل بيقف لوحده لما حاجة تانية تاخد الميك
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «مش عايز لو جه مكالمة والمندوب بيسجّل تتعارض
 *  مع المايك — وتقفل المايك للمكالمة، المكالمة يبقى ليها الأولوية. وتلقائي
 *  المسجّل يفصل لو جه مكالمة، سواء مكالمة تليفون أو على أي تطبيق تواصل».
 *
 *  الويب مايعرفش «فيه مكالمة»، بس بيعرف **الميك راح**:
 *   · أندرويد ١٠+ لما مكالمة تاخد الميك بيبعت للتطبيق التاني **أصفار رقمية**
 *     بالظبط (مش سكوت عادي — الشارع عمره ما بيطلع صفر بالظبط)
 *   · التراك بيتقفل (`ended`) أو بيتكتم (`mute`) لفترة
 *   · الآيفون بيعلّق الصوت (`interrupted`)
 */
describe("MicLossDetector — الأصفار الرقمية", () => {
  const rate = 16000;
  const zeros = (ms: number) => new Float32Array(Math.round((rate * ms) / 1000));
  const noise = (ms: number) => {
    const a = new Float32Array(Math.round((rate * ms) / 1000));
    for (let i = 0; i < a.length; i++) a[i] = (((i * 7919) % 13) - 6) / 20000;   // ضوضاء شارع خفيفة جداً
    return a;
  };

  it(`أصفار متصلة ${SILENCED_MS} مللي ⇒ «silenced»`, () => {
    const d = new MicLossDetector(rate);
    let out = null;
    for (let t = 0; t < SILENCED_MS; t += 64) out = d.feed(zeros(64)) ?? out;
    expect(out).toBe("silenced");
  });

  it("أقل من المدة ⇒ ولا حاجة (بداية الميك ممكن تبدأ بأصفار)", () => {
    const d = new MicLossDetector(rate);
    let out = null;
    for (let t = 0; t < SILENCED_MS - 500; t += 64) out = d.feed(zeros(64)) ?? out;
    expect(out).toBeNull();
  });

  it("🔴 سكوت الشارع (ضوضاء صغيرة جداً مش صفر) ⇒ عمره ما يوقف", () => {
    const d = new MicLossDetector(rate);
    let out = null;
    for (let t = 0; t < 60_000; t += 64) out = d.feed(noise(64)) ?? out;
    expect(out).toBeNull();
  });

  it("عيّنة واحدة مش صفر بتصفّر العدّاد", () => {
    const d = new MicLossDetector(rate);
    let out = null;
    for (let t = 0; t < SILENCED_MS - 200; t += 64) out = d.feed(zeros(64)) ?? out;
    const blip = zeros(64); blip[10] = 0.001;
    out = d.feed(blip) ?? out;
    for (let t = 0; t < SILENCED_MS - 200; t += 64) out = d.feed(zeros(64)) ?? out;
    expect(out).toBeNull();
  });

  it("بيبلّغ مرة واحدة بس", () => {
    const d = new MicLossDetector(rate);
    const outs: string[] = [];
    for (let t = 0; t < SILENCED_MS * 3; t += 64) { const r = d.feed(zeros(64)); if (r) outs.push(r); }
    expect(outs).toEqual(["silenced"]);
  });
});

describe("MicLossDetector — التراك وسياق الصوت", () => {
  it("التراك اتقفل ⇒ «ended» على طول", () => {
    expect(new MicLossDetector(16000).trackEnded()).toBe("ended");
  });

  it(`كتم ${MUTED_MS} مللي ⇒ «muted»`, () => {
    const d = new MicLossDetector(16000);
    d.trackMuted(1000);
    expect(d.tick(1000 + MUTED_MS - 1)).toBeNull();
    expect(d.tick(1000 + MUTED_MS)).toBe("muted");
  });

  it("كتم لحظي ورجع ⇒ ولا حاجة", () => {
    const d = new MicLossDetector(16000);
    d.trackMuted(1000);
    d.trackUnmuted();
    expect(d.tick(1000 + MUTED_MS * 5)).toBeNull();
  });

  it("الآيفون علّق الصوت ⇒ «interrupted» على طول؛ والإيقاف العادي (closed) ⇒ ولا حاجة", () => {
    expect(new MicLossDetector(16000).contextState("interrupted", 0)).toBe("interrupted");
    expect(new MicLossDetector(16000).contextState("closed", 0)).toBeNull();
    expect(new MicLossDetector(16000).contextState("running", 0)).toBeNull();
  });

  /**
   * 🔵 بلاغ مندوب (٢٥ أكتوبر ٢٠٢٦، فيديو): «المايك بيقفل تلقائي بعد ٣ ثواني» — «(السبب: الصوت اتعلّق)» من غير مكالمة،
   * وكان شغّال قبلها بساعة (٣٥١ لوحة) والبلوتوث مفتوح عنده. أندرويد بيعلّق سياق الصوت **لحظة** لما المايك بيتنقل
   * (بلوتوث العربية/السماعة) — مش مكالمة. ⇒ `suspended` بيستنى `CONTEXT_SUSPEND_GRACE_MS`: رجع ⇒ ولا حاجة · فضل ⇒ وقف.
   */
  it(`🔵 «suspended» لحظة ورجع ⇒ ولا حاجة · فضل ${CONTEXT_SUSPEND_GRACE_MS} مللي ⇒ «interrupted»`, () => {
    const a = new MicLossDetector(16000);
    expect(a.contextState("suspended", 1000)).toBeNull();
    expect(a.tick(1000 + CONTEXT_SUSPEND_GRACE_MS - 1)).toBeNull();
    expect(a.contextState("running", 1000 + 800)).toBeNull();
    expect(a.tick(1000 + CONTEXT_SUSPEND_GRACE_MS + 5000)).toBeNull();

    const b = new MicLossDetector(16000);
    expect(b.contextState("suspended", 1000)).toBeNull();
    expect(b.tick(1000 + CONTEXT_SUSPEND_GRACE_MS)).toBe("interrupted");
  });

  it("🔵 المهلة مش طويلة (المكالمة الحقيقية بتتمسك برضه)", () => {
    expect(CONTEXT_SUSPEND_GRACE_MS).toBeGreaterThanOrEqual(1500);
    expect(CONTEXT_SUSPEND_GRACE_MS).toBeLessThanOrEqual(4000);
  });

  it("أول سبب بس — بعده كله ساكت", () => {
    const d = new MicLossDetector(16000);
    expect(d.trackEnded()).toBe("ended");
    expect(d.contextState("interrupted", 0)).toBeNull();
    d.trackMuted(0);
    expect(d.tick(MUTED_MS * 2)).toBeNull();
  });
});

describe("micLostNotice — الرسالة للمندوب", () => {
  it("بتقول إن اللوحات محفوظة وإزاي يكمّل", () => {
    for (const r of ["background", "silenced", "ended", "muted", "interrupted"] as const) {
      const m = micLostNotice(r);
      expect(m).toContain("محفوظة");
      expect(m).toContain("ابدأ التسجيل");
    }
  });

  it("الخلفية بتذكر المكالمة أو تبديل التطبيق", () => {
    expect(micLostNotice("background")).toContain("مكالمة");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 السكوت الرقمي **مايوقفش** التسجيل — بلاغ مندوب (٢٥ سبتمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 *  المالك: «بيقول لوحات ورا بعض ٥ أو ٦ وبعدين يسكت شوية، ويرجع يقول لوحات
 *  تاني ماياخدش معاه… وتظهر الرسالة دي. مش بتحصل مع كله، بتحصل مع المندوب
 *  ده بس، ومش بيبقى معاه مكالمة».
 *
 *  موبايلات فيها **كاتم ضوضاء** بيطلّع صفر رقمي بالظبط في السكوت — فسكتة
 *  ٣ ثواني بين اللوحات كانت بتتحسب «مكالمة أخدت الميك» وتقفل التسجيل،
 *  واللوحات اللي بعدها **مابتتسجّلش**. وده أسوأ من اللي الحارس بيحمي منه:
 *  لو مكالمة أخدت الميك فعلاً، الأندرويد بيديها الأولوية أصلاً وإحنا بنسجّل
 *  سكوت مابيتبعتش — والتسجيل بيكمّل لوحده لما المكالمة تخلص. والمكالمة اللي
 *  بتفتح شاشتها بيمسكها حارس الخلفية.
 */
describe("stopsRecording — أنهي سبب يقفل التسجيل", () => {
  it("🔴 السكوت الرقمي ⇒ **لأ** (كاتم ضوضاء الموبايل بيعمل كده في كل سكتة)", () => {
    expect(stopsRecording("silenced")).toBe(false);
  });

  it("الميك اتقفل/اتكتم فعلاً أو الآيفون علّق الصوت ⇒ أيوه", () => {
    expect(stopsRecording("ended")).toBe(true);
    expect(stopsRecording("muted")).toBe(true);
    expect(stopsRecording("interrupted")).toBe(true);
  });
});

describe("micLostNotice — السبب مكتوب عشان صورة الشاشة تشخّص", () => {
  it("كل سبب ليه اسم مختلف في آخر الرسالة", () => {
    const names = (["background", "ended", "muted", "interrupted"] as const).map((r) => micLostNotice(r));
    expect(new Set(names).size).toBe(4);
    for (const m of names) expect(m).toContain("السبب:");
  });
});

describe("🔵 المحرّك: «suspended» ⇒ يحاول يرجّع الصوت قبل ما المهلة توقف", () => {
  it("Voice PRO (اللي بيطلب كاشف الميك) بس — «صوتي» من غيره زي ما هو", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const ENGINE = readFileSync(join(process.cwd(), "lib/voicexEngine.ts"), "utf8").replace(/\r\n/g, "\n");
    const MIC = readFileSync(join(process.cwd(), "lib/micEngine.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(ENGINE).toMatch(/onContextState: \(st: string\) => \{\n\s*if \(!loss\) return;\n\s*if \(st === "suspended"\) mic\.resumeContext\(\);\n\s*reportLoss\(loss\.contextState\(st, Date\.now\(\)\)\);/);
    expect(ENGINE).toMatch(/if \(loss\) reportLoss\(loss\.tick\(Date\.now\(\)\)\);/);
    expect(MIC).toMatch(/resumeContext\(\): void \{\n\s*try \{ void this\.ctx\?\.resume\(\)\.catch/);
  });
});

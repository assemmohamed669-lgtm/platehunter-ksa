import { describe, it, expect } from "vitest";
import { buildVoicexEndpoint, resolvePointerRow, retryVoicexEndpoint, RETRY_DELAYS_MS } from "@/lib/voicexPointer";

// مؤشّر VoiceX: العنوان بييجي من Supabase (مش localStorage زي الطيّار). العقد
// **فشل-مغلق**: أي التباس (نفق واقع/عنوان غلط/توكن قصير) = null ⇒ رجوع لديبجرام.
describe("buildVoicexEndpoint", () => {
  const TOK = "voicex-prod-secret-123"; // ٢٢ محرف ASCII — سليم

  it("عنوان https سليم + توكن سليم + النفق شغّال ⇒ endpoint كامل", () => {
    const ep = buildVoicexEndpoint("https://abc.trycloudflare.com", TOK, true);
    expect(ep).not.toBeNull();
    expect(ep!.base).toBe("https://abc.trycloudflare.com");
    expect(ep!.transcribeUrl).toBe("https://abc.trycloudflare.com/transcribe");
    expect(ep!.token).toBe(TOK);
  });

  it("بيشيل لاحقة /transcribe من العنوان (نفس normalizeJudgeBase)", () => {
    const ep = buildVoicexEndpoint("https://abc.trycloudflare.com/transcribe", TOK, true);
    expect(ep!.base).toBe("https://abc.trycloudflare.com");
    expect(ep!.transcribeUrl).toBe("https://abc.trycloudflare.com/transcribe");
  });

  it("النفق واقع (is_up=false) ⇒ null (رجوع لديبجرام)", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", TOK, false)).toBeNull();
  });

  it("عنوان http غير محلي ⇒ null (mixed-content على WebView)", () => {
    expect(buildVoicexEndpoint("http://abc.trycloudflare.com", TOK, true)).toBeNull();
  });

  it("عنوان فاضي/null ⇒ null", () => {
    expect(buildVoicexEndpoint("", TOK, true)).toBeNull();
    expect(buildVoicexEndpoint(null, TOK, true)).toBeNull();
  });

  it("توكن قصير جداً ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", "short", true)).toBeNull();
  });

  it("توكن null/فاضي ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", null, true)).toBeNull();
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", "", true)).toBeNull();
  });

  it("توكن فيه سطر جديد (حقن ترويسات) ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", "tok\nInjected: 1", true)).toBeNull();
  });

  it("عنوان فيه توكن في الاستعلام (تسريب) ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com?token=x", TOK, true)).toBeNull();
  });
});

// resolvePointerRow: يحسم صف المؤشّر الخام (من select) لـ{url, isUp} — فشل-مغلق.
describe("resolvePointerRow", () => {
  it("صف سليم ⇒ {url, isUp}", () => {
    expect(resolvePointerRow({ url: "https://x.dev", is_up: true }, null))
      .toEqual({ url: "https://x.dev", isUp: true });
  });

  it("is_up مش false ⇒ يعتبر شغّال (الافتراضي true)", () => {
    expect(resolvePointerRow({ url: "https://x.dev" }, null)?.isUp).toBe(true);
  });

  it("is_up=false ⇒ isUp=false", () => {
    expect(resolvePointerRow({ url: "https://x.dev", is_up: false }, null)?.isUp).toBe(false);
  });

  it("خطأ RPC ⇒ null", () => {
    expect(resolvePointerRow({ url: "https://x.dev" }, { message: "boom" })).toBeNull();
  });

  it("صف null/غير كائن ⇒ null", () => {
    expect(resolvePointerRow(null, null)).toBeNull();
    expect(resolvePointerRow("nope", null)).toBeNull();
  });

  it("url مش سترنج ⇒ null", () => {
    expect(resolvePointerRow({ url: 123, is_up: true }, null)).toBeNull();
  });
});

// 🐞 لما Supabase تتعثّر، التطبيق مابيعرفش يقرا عنوان VoiceX فبيرجع **صامت**
// لديبجرام — وبيفضل عليه لحد ما المندوب يقفل البرنامج ويفتحه، حتى بعد ما
// الداتابيز ترجع. يعني دقة الفرز الصوتي بتفضل ضعيفة ساعات بعد ما العطل يخلص.
// (حصلت ٢٠٢٦-٠٩-١٣: انقطاع ٣٤ دقيقة، والمناديب فضلوا على ديبجرام بعده.)
describe("retryVoicexEndpoint — الرجوع للموديل لوحده بعد العطل", () => {
  const EP = { url: "https://x.trycloudflare.com", token: "t" } as never;
  /** جدولة وهمية: بتسجّل المدد وبتنفّذ فوراً — عشان الاختبار ما يستناش. */
  function fakeScheduler() {
    const delays: number[] = [];
    const run = (fn: () => void, ms: number) => { delays.push(ms); fn(); return 0 as unknown as ReturnType<typeof setTimeout>; };
    return { delays, run };
  }

  it("🐞 بيرجع للموديل أول ما الداتابيز ترجع", async () => {
    const s = fakeScheduler();
    let calls = 0;
    const resolve = async () => (++calls >= 2 ? EP : null);   // فشل مرة وبعدين نجح
    const got: unknown[] = [];
    retryVoicexEndpoint(resolve, (ep) => got.push(ep), RETRY_DELAYS_MS, s.run);
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual([EP]);
  });

  it("بيبطّل أول ما ينجح — مايكملش محاولات", async () => {
    const s = fakeScheduler();
    let calls = 0;
    const resolve = async () => { calls++; return EP; };
    retryVoicexEndpoint(resolve, () => {}, RETRY_DELAYS_MS, s.run);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1);
  });

  it("بيقف بعد عدد محدود من المحاولات — مايفضلش يضرب للأبد", async () => {
    const s = fakeScheduler();
    let calls = 0;
    const resolve = async () => { calls++; return null; };
    retryVoicexEndpoint(resolve, () => {}, RETRY_DELAYS_MS, s.run);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(RETRY_DELAYS_MS.length);
  });

  it("المدد بتتباعد — مايغرقش السيرفر وهو تعبان", async () => {
    const s = fakeScheduler();
    retryVoicexEndpoint(async () => null, () => {}, RETRY_DELAYS_MS, s.run);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.delays).toEqual([...RETRY_DELAYS_MS]);
    for (let i = 1; i < RETRY_DELAYS_MS.length; i++) {
      expect(RETRY_DELAYS_MS[i]).toBeGreaterThan(RETRY_DELAYS_MS[i - 1]);
    }
  });

  it("مابينادّيش بعنوان فاضي أبداً", async () => {
    const s = fakeScheduler();
    const got: unknown[] = [];
    retryVoicexEndpoint(async () => null, (ep) => got.push(ep), RETRY_DELAYS_MS, s.run);
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual([]);
  });

  it("الإلغاء بيوقف المحاولات — المندوب قفل الصفحة", async () => {
    const delays: number[] = [];
    const pending: (() => void)[] = [];
    const run = (fn: () => void, ms: number) => { delays.push(ms); pending.push(fn); return 0 as unknown as ReturnType<typeof setTimeout>; };
    let calls = 0;
    const cancel = retryVoicexEndpoint(async () => { calls++; return null; }, () => {}, RETRY_DELAYS_MS, run);
    cancel();
    pending.forEach((f) => f());                 // لو الإلغاء مش شغّال، دي هتزوّد calls
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(0);
  });

  it("المحاولة الأولى بعد ١٠ ثواني على الأكتر — الرجوع يبقى سريع", () => {
    expect(RETRY_DELAYS_MS[0]).toBeLessThanOrEqual(10_000);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  WEAK_NET_TEXT, WEAK_NET_LONG_TEXT, WEAK_NET_LONG_AFTER_MS, weakNetBanner,
  createOutageClock, isRequestFailSkip,
  fatalText, createSessionGate,
  reachabilityCheck, REACH_CHECK_TIMEOUT_MS,
  createThrottle, levelThrottle, LEVEL_GAP_MS, createLevelStore,
  toArabicDigits, exportProgressText,
  formatRowTime,
  createLatestJobs,
  mapInChunks, withinMs,
  CHASSIS_EXPORT_WAIT_MS, CHASSIS_WAIT_TEXT, CHASSIS_MISSING_NOTE,
} from "@/lib/voiceProSmooth";
import { REPLAY_MAX_AGE_SEC } from "@/lib/voicexReplay";

/**
 * 🧈 «سلاسة» Voice PRO — المالك (٣ أكتوبر ٢٠٢٦): «أنا عايز سلاسة في كل حاجة في
 * البرنامج». الدوال الصغيرة اللي الصفحة بتوصّلها للسوبر أدمن الأول.
 */

describe("① 📶 شريط النت الضعيف", () => {
  it("مش ضعيف ⇒ مافيش شريط", () => {
    expect(weakNetBanner(null, 5_000)).toBeNull();
  });
  it("ضعيف ⇒ الجملة الأساسية بس (لسه الصوت الفايت كله في الذاكرة)", () => {
    const b = weakNetBanner(1_000, 1_000 + 59_999);
    expect(b).toEqual({ text: WEAK_NET_TEXT, extra: null });
    expect(WEAK_NET_TEXT).toBe("📶 النت ضعيف — كمّل كلامك، اللوحات هتظهر لما النت يرجع");
  });
  it("🔴 الحد = عمر الصوت الفايت في الذاكرة (REPLAY_MAX_AGE_SEC في lib/voicexReplay.ts = ٧٥ث)", () => {
    expect(WEAK_NET_LONG_AFTER_MS).toBe(75_000);
    expect(WEAK_NET_LONG_AFTER_MS).toBe(REPLAY_MAX_AGE_SEC * 1000);
  });
  it("بين دقيقة و٧٥ث ⇒ لسه من غير السطر التاني (مفيش صوت ضاع لسه)", () => {
    expect(weakNetBanner(1_000, 1_000 + 60_001)?.extra).toBeNull();
    expect(weakNetBanner(1_000, 1_000 + 74_999)?.extra).toBeNull();
  });
  it("بالظبط ٧٥ث ⇒ لسه من غير السطر التاني («أكتر من ٧٥ث»)", () => {
    expect(weakNetBanner(1_000, 1_000 + WEAK_NET_LONG_AFTER_MS)?.extra).toBeNull();
  });
  it("الانقطاع أقدم من ٧٥ث ⇒ يقول إن اللي اتقال من أكتر من دقيقة وربع ممكن مايظهرش", () => {
    const b = weakNetBanner(1_000, 1_000 + WEAK_NET_LONG_AFTER_MS + 1);
    expect(b?.text).toBe(WEAK_NET_TEXT);
    expect(b?.extra).toBe(WEAK_NET_LONG_TEXT);
    expect(WEAK_NET_LONG_TEXT).toBe("اللوحات اللي اتقالت من أكتر من دقيقة وربع ممكن ماتظهرش — عيدها لما النت يرجع");
  });
  it("🔴 النص بيقول ٧٥ث صح («دقيقة وربع») مش ٩٠ث («دقيقة ونص»)", () => {
    expect(WEAK_NET_LONG_TEXT).toContain("دقيقة وربع");
    expect(WEAK_NET_LONG_TEXT).not.toContain("ونص");
    expect(WEAK_NET_LONG_AFTER_MS).toBe(60_000 + 15_000);
  });
  it("ساعة الجهاز رجعت لورا ⇒ مايقعش", () => {
    expect(weakNetBanner(10_000, 5_000)).toEqual({ text: WEAK_NET_TEXT, extra: null });
  });
});

describe("① 📶 بداية الانقطاع الفعلية — مش لحظة «ضعيف»", () => {
  /**
   * المحرّك بيقول «ضعيف» عند الفشل الـ٨ ورا بعض (~٣٠ث بعد ما النت يقع). الصوت
   * الفايت بيعيش ٧٥ث من لحظة ما اتقال — فالسطر التاني لازم يتحسب من **أول طلب
   * فشل بعد آخر رد ناجح**، وإلا كان بيظهر متأخّر ~٣٠ث واللوحات بتضيع والشريط
   * لسه بيقول «هتظهر».
   */
  it("مفيش فشل ⇒ null", () => {
    expect(createOutageClock().since()).toBeNull();
  });
  it("أول فشل بعد آخر رد ناجح هو البداية — الفشل اللي بعده مابيحرّكهاش", () => {
    const c = createOutageClock();
    c.fail(1_000);
    c.fail(5_000);
    c.fail(29_000);
    expect(c.since()).toBe(1_000);
  });
  it("رد ناجح ⇒ الانقطاع خلص، والفشل الجاي بداية جديدة", () => {
    const c = createOutageClock();
    c.fail(1_000);
    c.ok();
    expect(c.since()).toBeNull();
    c.fail(40_000);
    c.fail(41_000);
    expect(c.since()).toBe(40_000);
  });
  it("الطلبات الفاشلة بس (والإعادة الفاشلة) — مش أي تخطّي", () => {
    for (const r of ["request_failed", "request_failed:timeout", "request_failed:http_503", "replay_failed:network", "replay_failed"]) {
      expect(isRequestFailSkip(r)).toBe(true);
    }
    for (const r of ["weak_net", "utterance_expired", "silence_gate", "busy_window", "empty_slice:12", "", "xrequest_failed", "request_failedX"]) {
      expect(isRequestFailSkip(r)).toBe(false);
    }
    expect(isRequestFailSkip(undefined as unknown as string)).toBe(false);
  });
  it("🔴 الشريط من بداية الانقطاع: السطر التاني بيظهر لما الانقطاع نفسه يعدّي ٧٥ث", () => {
    const c = createOutageClock();
    c.fail(1_000);            // النت وقع
    // المحرّك قال «ضعيف» بعد ~٣٠ث — الشريط بيتحسب من بداية الانقطاع
    const since = c.since() ?? 31_000;
    expect(weakNetBanner(since, 1_000 + WEAK_NET_LONG_AFTER_MS)?.extra).toBeNull();
    expect(weakNetBanner(since, 1_000 + WEAK_NET_LONG_AFTER_MS + 1)?.extra).toBe(WEAK_NET_LONG_TEXT);
  });
});

describe("② 🔒 رسالة الوقوع + حارس الجلسة", () => {
  const OLD_SERVER_TEXT = "السيرفر فصل وسط التسجيل. دوس «أعِد الفحص» واتأكد إنه واصل.";
  const OLD_MIC_TEXT = "الميكروفون مرفوض — اسمح للمتصفّح بالتسجيل وجرّب تاني.";
  it("المناديب: نفس النص القديم بالحرف لأي سبب (لحد ما المالك يوافق)", () => {
    expect(fatalText("mic_denied", false)).toBe(OLD_MIC_TEXT);
    // القديم: `reason === "mic_denied" ? … : «السيرفر فصل…»` — أي سبب تاني (حتى الجديد) نفس النص
    for (const r of ["tunnel_down", "auth_rejected", "bad_reply", "http_500", "", "حاجة غريبة"]) {
      expect(fatalText(r, false)).toBe(OLD_SERVER_TEXT);
    }
    expect(fatalText(undefined as unknown as string, false)).toBe(OLD_SERVER_TEXT);
  });
  it("🔴 المناديب: الكود (المعامل التالت) مابيغيّرش ولا حرف — حتى الأسباب الجديدة", () => {
    for (const r of ["net_lost", "server_down", "auth_rejected", "bad_reply", "tunnel_down", "حاجة غريبة"]) {
      for (const code of [undefined, "http_503", "http_401", "bad_json", "", "x".repeat(500)]) {
        expect(fatalText(r, false, code)).toBe(OLD_SERVER_TEXT);
      }
    }
    expect(fatalText("mic_denied", false, "http_503")).toBe(OLD_MIC_TEXT);
  });
  it("الميك المرفوض نفس الرسالة للكل", () => {
    expect(fatalText("mic_denied", true)).toBe(OLD_MIC_TEXT);
    expect(fatalText("mic_denied", true, "whatever")).toBe(OLD_MIC_TEXT);
  });
  it("🔴 السوبر أدمن — النت مقطوع ٣ دقايق (net_lost): الحقيقة + اللوحات محفوظة + الخطوة", () => {
    expect(fatalText("net_lost", true)).toBe(
      "النت مقطوع من ٣ دقايق فوقف التسجيل — اللوحات اللي ظهرت محفوظة. اتأكد إن النت رجع ودوس «ابدأ التسجيل».",
    );
    expect(fatalText("net_lost", true, "timeout")).toBe(fatalText("net_lost", true));
  });
  it("🔴 السوبر أدمن — السيرفر مش بيرد (server_down): بالكود، ومش مشكلة النت", () => {
    expect(fatalText("server_down", true, "http_503")).toBe(
      "السيرفر مش بيرد (http_503) — مش مشكلة النت. استنى دقيقة وجرّب تاني، ولو فضلت كلّم الإدارة.",
    );
    expect(fatalText("server_down", true, "http_429")).toContain("(http_429)");
    // من غير كود ⇒ نفس الرسالة من غير القوسين (مش «(undefined)»)
    const noCode = fatalText("server_down", true);
    expect(noCode).toBe("السيرفر مش بيرد — مش مشكلة النت. استنى دقيقة وجرّب تاني، ولو فضلت كلّم الإدارة.");
    expect(fatalText("server_down", true, "")).toBe(noCode);
    expect(fatalText("server_down", true, "   ")).toBe(noCode);
  });
  it("🔴 السوبر أدمن — server_down بـ5xx/429/52x ⇒ «مش بيرد (الكود)» زي ما هو", () => {
    for (const c of ["http_429", "http_500", "http_502", "http_503", "http_504", "http_520", "http_522", "http_524", "http_525", "http_530"]) {
      expect(fatalText("server_down", true, c)).toBe(
        "السيرفر مش بيرد (" + c + ") — مش مشكلة النت. استنى دقيقة وجرّب تاني، ولو فضلت كلّم الإدارة.",
      );
    }
  });
  it("🔴 السوبر أدمن — server_down بـ4xx ⇒ «السيرفر رفض الطلب (الكود)» — السيرفر **رد**، فـ«مش بيرد» كانت غلط", () => {
    expect(fatalText("server_down", true, "http_404")).toBe(
      "السيرفر رفض الطلب (http_404) — مش مشكلة النت. كلّم الإدارة وقولّهم الكود.",
    );
    for (const c of ["http_400", "http_405", "http_413", "http_422", "http_499"]) {
      expect(fatalText("server_down", true, c)).toBe(
        "السيرفر رفض الطلب (" + c + ") — مش مشكلة النت. كلّم الإدارة وقولّهم الكود.",
      );
    }
    // 429 = «استنى شوية» (زحمة) مش رفض ⇒ مع «مش بيرد»
    expect(fatalText("server_down", true, "http_429")).toContain("مش بيرد");
  });
  it("🔴 السوبر أدمن — server_down بـtunnel_error ⇒ «السيرفر مش واصل (النفق واقع)» من غير الكود الخام", () => {
    expect(fatalText("server_down", true, "tunnel_error")).toBe(
      "السيرفر مش واصل (النفق واقع) — مش مشكلة النت. استنى دقيقة وجرّب تاني، ولو فضلت كلّم الإدارة.",
    );
  });
  it("🔴 المناديب: الأكواد الجديدة (tunnel_error/4xx) نفس النص القديم بالحرف", () => {
    for (const code of ["tunnel_error", "http_404", "http_400", "network", "timeout"]) {
      for (const r of ["server_down", "net_lost", "tunnel_down"]) {
        expect(fatalText(r, false, code)).toBe(OLD_SERVER_TEXT);
      }
    }
  });
  it("🔴 السوبر أدمن — السيرفر رفض الدخول (auth_rejected) / رد مش مفهوم (bad_reply)", () => {
    expect(fatalText("auth_rejected", true)).toBe("السيرفر رفض الدخول — كلّم الإدارة.");
    expect(fatalText("auth_rejected", true, "http_401")).toBe("السيرفر رفض الدخول — كلّم الإدارة.");
    expect(fatalText("bad_reply", true)).toBe("رد السيرفر مش مفهوم — جرّب تاني.");
    expect(fatalText("bad_reply", true, "bad_json")).toBe("رد السيرفر مش مفهوم — جرّب تاني.");
  });
  it("🔴 السوبر أدمن — tunnel_down (كود مش معروف) ⇒ رسالة عامة بالكود، **مش** «النت فصل» غلط", () => {
    const t = fatalText("tunnel_down", true, "http_500");
    expect(t).toBe("التسجيل وقف بسبب عطل (الكود: http_500) — دوس «ابدأ التسجيل» تاني، ولو اتكرر كلّم الإدارة وقولّهم الكود.");
    expect(t).not.toContain("النت");
    // من غير كود ⇒ السبب نفسه مكان الكود
    expect(fatalText("tunnel_down", true)).toContain("(الكود: tunnel_down)");
  });
  it("🔴 السوبر أدمن: سبب مش معروف ⇒ رسالة عامة فيها الكود (أو السبب لو مافيش كود)", () => {
    const t = fatalText("http_418", true);
    expect(t).toContain("http_418");
    expect(t).not.toContain("النت");
    expect(t).not.toBe(OLD_SERVER_TEXT);
    expect(fatalText("سبب_جديد", true, "http_404")).toContain("(الكود: http_404)");
  });
  it("السوبر أدمن: كل سبب ليه رسالته (مافيش اتنين زي بعض)", () => {
    const all = ["net_lost", "server_down", "auth_rejected", "bad_reply", "tunnel_down", "mic_denied"].map((r) => fatalText(r, true, "http_503"));
    expect(new Set(all).size).toBe(all.length);
    // ونوعين server_down الجداد مختلفين عن «مش بيرد» وعن بعض
    const sd = ["http_503", "http_404", "tunnel_error"].map((c) => fatalText("server_down", true, c));
    expect(new Set(sd).size).toBe(3);
  });
  it("السوبر أدمن: ولا رسالة فيها «أعِد الفحص»، والمدخل الغريب مايوقّعش الصفحة", () => {
    const weird = [undefined, null, "", "   ", 42, "x".repeat(500), { a: 1 }] as unknown as string[];
    for (const r of ["net_lost", "server_down", "tunnel_down", "auth_rejected", "bad_reply", "http_418", ...weird]) {
      for (const code of [undefined, "tunnel_error", "http_404", "http_4", "http_4044", ...weird]) {
        const t = fatalText(r, true, code);
        expect(typeof t).toBe("string");
        expect(t.length).toBeGreaterThan(10);
        expect(t.length).toBeLessThan(260);
        expect(t).not.toContain("أعِد الفحص");
        expect(t).not.toContain("undefined");
        expect(t).not.toContain("null");
      }
    }
  });
  it("جلسة قديمة مابتبقاش «الحالية» بعد بداية جديدة أو إيقاف", () => {
    const g = createSessionGate();
    const a = g.begin();
    expect(g.isCurrent(a)).toBe(true);
    const b = g.begin();
    expect(b).not.toBe(a);
    expect(g.isCurrent(a)).toBe(false);
    expect(g.isCurrent(b)).toBe(true);
    g.end();
    expect(g.isCurrent(b)).toBe(false);
    const c = g.begin();
    expect(g.isCurrent(c)).toBe(true);
    expect(g.isCurrent(a)).toBe(false);
  });
});

describe("② 🔌 فحص الوصول للسيرفر (no-cors) — نفق واقع ولا نت الموبايل؟", () => {
  /**
   * نفق ميت بيرجّع ٥٣٠ **من غير CORS** ⇒ طلب الصوت بيبان `network` زي موبايل
   * أوفلاين بالظبط. طلب no-cors لـ`/health` بيفرّق: أي رد (حتى opaque/٥٣٠) = نت
   * الموبايل واصل للسيرفر؛ رمية أو مهلة = نت الموبايل نفسه.
   */
  afterEach(() => { vi.useRealTimers(); });
  const URL_ = "https://voice.test/health";

  it("المهلة ٤ث", () => {
    expect(REACH_CHECK_TIMEOUT_MS).toBe(4000);
  });
  it("أي رد — حتى opaque من صفحة ٥٣٠ — ⇒ true، والطلب no-cors ومن غير كاش", async () => {
    const f = vi.fn(async () => ({ type: "opaque", status: 0, ok: false }) as unknown as Response);
    await expect(reachabilityCheck(URL_, { fetchImpl: f })()).resolves.toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe(URL_);
    expect(init.mode).toBe("no-cors");
    expect(init.cache).toBe("no-store");
    // مافيش ترويسات ولا توكن — طلب بسيط مايحتاجش preflight
    expect(init.headers).toBeUndefined();
    expect(init.method ?? "GET").toBe("GET");
  });
  it("الشبكة رمت (TypeError: Failed to fetch) ⇒ false", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(reachabilityCheck(URL_, { fetchImpl: f })()).resolves.toBe(false);
  });
  it("رمية متزامنة ⇒ false (مابيرميش)", async () => {
    const f = vi.fn(() => { throw new Error("sync"); });
    await expect(reachabilityCheck(URL_, { fetchImpl: f as unknown as typeof fetch })()).resolves.toBe(false);
  });
  it("مارجعش في ٤ث ⇒ false، والطلب بيتلغي", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const f = vi.fn((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => { /* للأبد */ });
    });
    let out: boolean | null = null;
    void reachabilityCheck(URL_, { fetchImpl: f as unknown as typeof fetch })().then((v) => { out = v; });
    await vi.advanceTimersByTimeAsync(REACH_CHECK_TIMEOUT_MS - 1);
    expect(out).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(out).toBe(false);
    expect(signal?.aborted).toBe(true);
  });
  it("رد بعد المهلة مابيغيّرش النتيجة (false بس مرة واحدة)", async () => {
    vi.useFakeTimers();
    let resolve!: (r: Response) => void;
    const f = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const seen: boolean[] = [];
    void reachabilityCheck(URL_, { fetchImpl: f as unknown as typeof fetch, timeoutMs: 1000 })().then((v) => { seen.push(v); });
    await vi.advanceTimersByTimeAsync(1000);
    resolve({} as Response);
    await vi.advanceTimersByTimeAsync(10);
    expect(seen).toEqual([false]);
  });
  it("كل نداء = فحص جديد", async () => {
    const f = vi.fn(async () => ({}) as Response);
    const check = reachabilityCheck(URL_, { fetchImpl: f });
    await check(); await check();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("④ 🎚️ مؤشّر الصوت — ~١٠ مرات في الثانية زي «صوتي»", () => {
  it("نفس فترة «صوتي» (٨٠ مللي)", () => {
    expect(LEVEL_GAP_MS).toBe(80);
  });
  it("٦٠ نداء في الثانية ⇒ ~١٢ تحديث بس", () => {
    let t = 0;
    const got: number[] = [];
    const f = levelThrottle((v) => got.push(v), () => t);
    for (t = 0; t < 1000; t += 16) f(0.5);
    expect(got.length).toBeGreaterThanOrEqual(10);
    expect(got.length).toBeLessThanOrEqual(13);
  });
  it("الصفر بيعدّي دايماً (الإيقاف — وإلا المؤشّر يتجمّد مضوّي)", () => {
    let t = 0;
    const got: number[] = [];
    const f = levelThrottle((v) => got.push(v), () => t);
    f(0.7);
    t = 10; f(0);
    expect(got).toEqual([0.7, 0]);
  });
  it("createThrottle عام — always بيعدّي من غير ما يستنى", () => {
    let t = 0;
    const got: string[] = [];
    const f = createThrottle<string>((v) => got.push(v), { gapMs: 250, always: (v) => v === "end", now: () => t });
    // زي «صوتي»: اللي بيعدّي دايماً بيبدأ العدّ من جديد (الصفر بيحدّث الساعة)
    f("a"); t = 50; f("b"); t = 100; f("end"); t = 300; f("blocked"); t = 360; f("c");
    expect(got).toEqual(["a", "end", "c"]);
  });
  it("مخزن المستوى: بيبلّغ المشترك بس لما القيمة تتغيّر، والإلغاء شغّال", () => {
    const s = createLevelStore();
    expect(s.get()).toBe(0);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set(0.4); s.set(0.4); s.set(0.6);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(s.get()).toBe(0.6);
    off();
    s.set(0.1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(s.get()).toBe(0.1);
  });
});

describe("⑤ 📤 نص تقدّم التصدير — أرقام عربي زي باقي الصفحة", () => {
  it("بصدّر ٣٠٠ من ١٢٠٠…", () => {
    expect(exportProgressText(300, 1200)).toBe("بصدّر ٣٠٠ من ١٢٠٠…");
    expect(exportProgressText(0, 5)).toBe("بصدّر ٠ من ٥…");
  });
  it("الأرقام زي ar-EG من غير فواصل", () => {
    for (const n of [0, 7, 42, 1200, 98765, 1234567890]) {
      expect(toArabicDigits(n)).toBe(n.toLocaleString("ar-EG", { useGrouping: false }));
    }
  });
});

describe("④ ⏰ وقت الصف — نفس النص بالحرف، بمنسّق واحد بدل واحد لكل صف", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("نفس نص toLocaleTimeString(\"ar-EG\") لكل وقت", () => {
    const base = Date.UTC(2026, 9, 3, 0, 0, 0);
    for (let i = 0; i < 400; i++) {
      const ms = base + i * 217_013 + (i % 7) * 13;
      expect(formatRowTime(ms)).toBe(
        new Date(ms).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    }
  });
  it("وقت بايظ ⇒ نفس «Invalid Date» بدل ما الصفحة تقع", () => {
    for (const bad of [NaN, Infinity, undefined as unknown as number]) {
      expect(formatRowTime(bad)).toBe(
        new Date(bad).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    }
  });
  it("المنسّق بيتعمل مرة واحدة بس (مش مع كل صف في كل رسمة)", async () => {
    vi.resetModules();
    const Orig = Intl.DateTimeFormat;
    let made = 0;
    const Patched = function (this: unknown, ...a: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      made++;
      return new Orig(...a);
    } as unknown as typeof Intl.DateTimeFormat;
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Patched;
    try {
      const fresh = await import("@/lib/voiceProSmooth");
      for (let i = 0; i < 500; i++) fresh.formatRowTime(1_700_000_000_000 + i * 1000);
      expect(made).toBe(1);
    } finally {
      (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Orig;
    }
  });
});

describe("③ 🔧 الهيكل — أحدث طلب بس، ومابيبدأش وقت التسجيل", () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

  it("فاضي ⇒ بيشتغل على طول وبيطبّق النتيجة", async () => {
    const d = deferred<string>();
    const run = vi.fn(() => d.promise);
    const apply = vi.fn();
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, apply });
    const t = jobs.begin();
    expect(jobs.request(t, "A")).toBe("ran");
    expect(run).toHaveBeenCalledWith("A");
    d.resolve("mapA");
    await expect(jobs.ensure()).resolves.toBe("mapA");
    expect(apply).toHaveBeenCalledWith("mapA");
  });

  it("وقت التسجيل ⇒ مابيبدأش، وبيستنى الإيقاف (flush)", async () => {
    let busy = true;
    const run = vi.fn(async (j: string) => "map" + j);
    const apply = vi.fn();
    const jobs = createLatestJobs<string, string>({ busy: () => busy, run, apply });
    const t = jobs.begin();
    expect(jobs.request(t, "A")).toBe("deferred");
    expect(jobs.hasPending).toBe(true);
    expect(jobs.idle).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(jobs.flush()).toBe(false);          // لسه بيسجّل
    expect(run).not.toHaveBeenCalled();
    busy = false;
    expect(jobs.flush()).toBe(true);
    expect(jobs.hasPending).toBe(false);
    await expect(jobs.ensure()).resolves.toBe("mapA");
    expect(apply).toHaveBeenCalledWith("mapA");
    expect(jobs.flush()).toBe(false);          // مرة واحدة بس
    expect(run).toHaveBeenCalledTimes(1);
    expect(jobs.idle).toBe(true);
  });

  it("تذكرة قديمة ⇒ الطلب بيترفض (تحميل أحدث بدأ)، وisLatest بيقول مين الأحدث", () => {
    const run = vi.fn(async () => "x");
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, apply: () => {} });
    const t1 = jobs.begin();
    const t2 = jobs.begin();
    expect(jobs.isLatest(t1)).toBe(false);
    expect(jobs.isLatest(t2)).toBe(true);
    expect(jobs.request(t1, "old")).toBe("stale");
    expect(run).not.toHaveBeenCalled();
    expect(jobs.request(t2, "new")).toBe("ran");
  });

  it("🔴 تحميل قديم خلص متأخّر مايكتبش فوق الأحدث", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const run = vi.fn((j: string) => (j === "A" ? a.promise : b.promise));
    const applied: string[] = [];
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, apply: (r) => applied.push(r) });
    const t1 = jobs.begin(); jobs.request(t1, "A");
    const t2 = jobs.begin(); jobs.request(t2, "B");
    b.resolve("mapB");
    await expect(jobs.ensure()).resolves.toBe("mapB");
    a.resolve("mapA");
    await a.promise; await tick();
    expect(applied).toEqual(["mapB"]);
  });

  it("begin جديد بيلغي المستني (ملف اتمسح وقت التسجيل)", () => {
    let busy = true;
    const run = vi.fn(async () => "x");
    const jobs = createLatestJobs<string, string>({ busy: () => busy, run, apply: () => {} });
    const t1 = jobs.begin();
    jobs.request(t1, "A");
    jobs.begin();                              // تحميل أحدث (من غير طلب هيكل)
    busy = false;
    expect(jobs.flush()).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("فشل التحميل (رفض أو رمي) ⇒ مافيش تطبيق ومابيقعش", async () => {
    const apply = vi.fn();
    const jobs = createLatestJobs<string, string>({
      busy: () => false,
      run: (j) => { if (j === "throw") throw new Error("sync"); return Promise.reject(new Error("async")); },
      apply,
    });
    const t1 = jobs.begin();
    expect(() => jobs.request(t1, "throw")).not.toThrow();
    await expect(jobs.ensure()).resolves.toBeNull();
    const t2 = jobs.begin();
    jobs.request(t2, "reject");
    await expect(jobs.ensure()).resolves.toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  /* ── التصدير: لازم يلاقي خريطة الهيكل (ensure) ── */

  it("🔴 التصدير وقت التسجيل ⇒ بيشغّل التحميل المستني (حتى والتسجيل شغّال) وبيستناه", async () => {
    const d = deferred<string>();
    const run = vi.fn(() => d.promise);
    const apply = vi.fn();
    const jobs = createLatestJobs<string, string>({ busy: () => true, run, apply });
    const t = jobs.begin();
    expect(jobs.request(t, "A")).toBe("deferred");
    const p = jobs.ensure();
    expect(run).toHaveBeenCalledTimes(1);      // اتشغّل رغم إن busy
    expect(jobs.hasPending).toBe(false);
    d.resolve("mapA");
    await expect(p).resolves.toBe("mapA");
    expect(apply).toHaveBeenCalledWith("mapA");
    expect(jobs.flush()).toBe(false);          // الإيقاف بعدها مايقراش تاني
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("🔴 التصدير والشيت لسه بيتقري (begin من غير طلب) ⇒ بيستنى الطلب ونتيجته", async () => {
    const run = vi.fn(async (j: string) => "map" + j);
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, apply: () => {} });
    const t = jobs.begin();
    expect(jobs.idle).toBe(false);
    let got: string | null | undefined;
    void jobs.ensure().then((v) => { got = v; });
    await tick();
    expect(got).toBeUndefined();               // لسه مستني
    jobs.request(t, "A");
    await tick(10);
    expect(got).toBe("mapA");
  });

  it("release من غير طلب (الطريق القديم / مافيش ملف) ⇒ مافيش حاجة نستناها (null)", async () => {
    const run = vi.fn(async () => "x");
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, apply: () => {} });
    const t = jobs.begin();
    let got: string | null | undefined;
    void jobs.ensure().then((v) => { got = v; });
    await tick();
    expect(got).toBeUndefined();
    jobs.release(t);
    expect(jobs.idle).toBe(true);
    await tick();
    expect(got).toBeNull();
    expect(run).not.toHaveBeenCalled();
    // release لتذكرة قديمة مايأثرش على الأحدث
    const t2 = jobs.begin();
    jobs.release(t);
    expect(jobs.idle).toBe(false);
    jobs.release(t2);
    expect(jobs.idle).toBe(true);
  });

  it("release بعد طلب ⇒ مايلغيش الطلب (التصدير لسه بيستناه)", async () => {
    const d = deferred<string>();
    const jobs = createLatestJobs<string, string>({ busy: () => false, run: () => d.promise, apply: () => {} });
    const t = jobs.begin();
    jobs.request(t, "A");
    jobs.release(t);
    expect(jobs.idle).toBe(false);
    const p = jobs.ensure();
    d.resolve("mapA");
    await expect(p).resolves.toBe("mapA");
  });

  it("🔴 تحميل أحدث بدأ والتصدير مستني ⇒ بيستنى الأحدث مش القديم", async () => {
    const a = deferred<string>();
    const b = deferred<string>();
    const run = vi.fn((j: string) => (j === "A" ? a.promise : b.promise));
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, apply: () => {} });
    const t1 = jobs.begin(); jobs.request(t1, "A");
    let got: string | null | undefined;
    void jobs.ensure().then((v) => { got = v; });
    const t2 = jobs.begin();
    a.resolve("mapA");
    await tick(10);
    expect(got).toBeUndefined();               // القديم خلص — بس مش هو اللي بنستناه
    jobs.request(t2, "B");
    b.resolve("mapB");
    await tick(10);
    expect(got).toBe("mapB");
  });

  it("الطلب خلص قبل كده ⇒ نتيجته على طول (حتى لو الصفحة لسه مارسمتش الخريطة)", async () => {
    const jobs = createLatestJobs<string, string>({ busy: () => false, run: async () => "m", apply: () => {} });
    const t = jobs.begin(); jobs.request(t, "A");
    await jobs.ensure();
    expect(jobs.idle).toBe(true);
    await expect(jobs.ensure()).resolves.toBe("m");
    jobs.begin();
    expect(jobs.idle).toBe(false);             // تحميل جديد بيتجهّز
  });

  it("مافيش أي تحميل خالص ⇒ idle و null", async () => {
    const jobs = createLatestJobs<string, string>({ busy: () => false, run: async () => "m", apply: () => {} });
    expect(jobs.idle).toBe(true);
    await expect(jobs.ensure()).resolves.toBeNull();
  });

  /* ── وقت التسجيل: الكاش بس (من غير قراية الملف) ── */

  it("🔴 وقت التسجيل: الخريطة في الكاش ⇒ بتظهر على طول، والملف مابيتقريش خالص", async () => {
    let busy = true;
    const run = vi.fn(async () => "full");
    const quick = vi.fn(async () => ({ value: "cached", final: true }));
    const applied: string[] = [];
    const jobs = createLatestJobs<string, string>({ busy: () => busy, run, quick, apply: (r) => applied.push(r) });
    const t = jobs.begin();
    expect(jobs.request(t, "A")).toBe("deferred");
    expect(quick).toHaveBeenCalledWith("A");
    await tick();
    expect(applied).toEqual(["cached"]);
    expect(jobs.hasPending).toBe(false);       // مفيش حاجة تستنى الإيقاف
    expect(jobs.idle).toBe(true);
    await expect(jobs.ensure()).resolves.toBe("cached");
    busy = false;
    expect(jobs.flush()).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("🔴 وقت التسجيل: مش في الكاش ⇒ خريطة الورقات المحمّلة (جزئية) تظهر، وقراية الملف بس تستنى الإيقاف", async () => {
    let busy = true;
    const run = vi.fn(async () => "full");
    const quick = vi.fn(async () => ({ value: "partial", final: false }));
    const applied: string[] = [];
    const jobs = createLatestJobs<string, string>({ busy: () => busy, run, quick, apply: (r) => applied.push(r) });
    const t = jobs.begin();
    jobs.request(t, "A");
    await tick();
    expect(applied).toEqual(["partial"]);
    expect(jobs.hasPending).toBe(true);
    expect(run).not.toHaveBeenCalled();
    busy = false;
    expect(jobs.flush()).toBe(true);
    await expect(jobs.ensure()).resolves.toBe("full");
    expect(applied).toEqual(["partial", "full"]);
  });

  it("🔴 الجزئية اتأخّرت لحد ما الكاملة خلصت ⇒ ماتكتبش فوقها", async () => {
    const q = deferred<{ value: string; final: boolean } | null>();
    const applied: string[] = [];
    const jobs = createLatestJobs<string, string>({
      busy: () => true, run: async () => "full", quick: () => q.promise, apply: (r) => applied.push(r),
    });
    const t = jobs.begin();
    jobs.request(t, "A");
    await expect(jobs.ensure()).resolves.toBe("full");   // التصدير شغّلها
    q.resolve({ value: "partial", final: false });
    await tick();
    expect(applied).toEqual(["full"]);
  });

  it("quick قديم (تحميل أحدث بدأ) ⇒ مايتطبّقش", async () => {
    const q = deferred<{ value: string; final: boolean } | null>();
    const applied: string[] = [];
    const jobs = createLatestJobs<string, string>({
      busy: () => true, run: async () => "full", quick: () => q.promise, apply: (r) => applied.push(r),
    });
    const t = jobs.begin();
    jobs.request(t, "A");
    jobs.begin();
    q.resolve({ value: "cached", final: true });
    await tick();
    expect(applied).toEqual([]);
  });

  it("quick بيرمي أو بيرجّع null ⇒ مابيقعش، والتحميل لسه مستني الإيقاف", async () => {
    const run = vi.fn(async () => "full");
    const quicks = [
      () => { throw new Error("sync"); },
      () => Promise.reject(new Error("async")),
      async () => null,
    ];
    for (const quick of quicks) {
      const jobs = createLatestJobs<string, string>({ busy: () => true, run, quick, apply: () => {} });
      const t = jobs.begin();
      expect(() => jobs.request(t, "A")).not.toThrow();
      await tick();
      expect(jobs.hasPending).toBe(true);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("مش وقت تسجيل ⇒ التحميل الكامل على طول (quick مالوش لازمة)", () => {
    const quick = vi.fn(async () => ({ value: "cached", final: true }));
    const run = vi.fn(async () => "full");
    const jobs = createLatestJobs<string, string>({ busy: () => false, run, quick, apply: () => {} });
    const t = jobs.begin();
    expect(jobs.request(t, "A")).toBe("ran");
    expect(quick).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("⑤ 🔧 الهيكل في التصدير — نص الانتظار والحد", () => {
  it("الحد سخي (٩٠ث) — مش ١٥ث وبعدها تصدير من غير هيكل في صمت", () => {
    expect(CHASSIS_EXPORT_WAIT_MS).toBe(90_000);
  });
  it("نص الانتظار وملاحظة النتيجة", () => {
    expect(CHASSIS_WAIT_TEXT).toBe("بجهّز أرقام الهيكل…");
    expect(CHASSIS_MISSING_NOTE).toContain("الهيكل");
    expect(CHASSIS_MISSING_NOTE.startsWith("\n")).toBe(true);
  });
});

describe("⑤ 🫁 تجهيز صفوف التصدير على دفعات", () => {
  it("نفس نتيجة map بالظبط وبنفس الترتيب", async () => {
    const xs = Array.from({ length: 1234 }, (_, i) => i);
    await expect(mapInChunks(xs, (x) => x * 2, 100)).resolves.toEqual(xs.map((x) => x * 2));
    await expect(mapInChunks([], (x: number) => x)).resolves.toEqual([]);
  });
  it("الصفحة بتاخد دورها بين الدفعات (setTimeout بيلحق يشتغل)", async () => {
    let ticked = false;
    setTimeout(() => { ticked = true; }, 0);
    const seen: boolean[] = [];
    await mapInChunks([1, 2, 3, 4, 5], (x) => { seen.push(ticked); return x; }, 2);
    expect(seen.slice(0, 2)).toEqual([false, false]);
    expect(seen.slice(2)).toEqual([true, true, true]);
  });
  it("withinMs: بيرجع القيمة لو جت، وnull لو اتأخرت أو فشلت", async () => {
    await expect(withinMs(Promise.resolve(5), 50)).resolves.toBe(5);
    await expect(withinMs(new Promise<number>(() => {}), 20)).resolves.toBeNull();
    await expect(withinMs(Promise.reject(new Error("x")), 50)).resolves.toBeNull();
  });
});

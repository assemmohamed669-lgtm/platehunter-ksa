import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createScreenWake, type WakeLockLike, type WakeLockSentinelLike } from "@/lib/screenWake";

/**
 * 🩺 الصندوق الأسود لمندوب الآيفون «العبيدي» (٢٤ أكتوبر ٢٠٢٦). المالك: «اعمل الاول الصندوق الاسود عنده خلينا نشوف
 * ايه اللي بيحصل معاه علشان نعرف هنعمل ايه». شكوتين:
 *  · «التليفون يعمل سليب ويقف الشاشة» وهو بيسجّل ⇒ نسجّل: طلب «الشاشة ماتطفيش» نجح؟ ولو رفض ليه؟ والآيفون سحبه إمتى؟
 *  · «سيارة مطلوبة أوقات بتدي إنذار وأوقات لا» ⇒ نسجّل: المطلوبة اتسمعت مرة بس ولا اتأكدت، الإنذار اتضرب ولا اتمنع،
 *    والصفّارة كانت شغّالة فعلاً (حالة الصوت) — من غير ولا لوحة (الصندوق مابيسجّلش لوحات).
 * **تسجيل بس — مفيش أي تغيير في سلوك البرنامج لأي حد.**
 */
const OBAIDI = "db903add-ebc1-4b1e-96e8-8cacd87dc13b";
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

function fakeSentinel() {
  const listeners: Array<() => void> = [];
  const s = {
    release: vi.fn(async () => { listeners.forEach((f) => f()); }),
    addEventListener: (_t: string, fn: () => void) => { listeners.push(fn); },
    systemRelease: () => listeners.forEach((f) => f()),
  };
  return s as WakeLockSentinelLike & { systemRelease: () => void; release: ReturnType<typeof vi.fn> };
}

describe("🔒 قفل الشاشة — بيقول نجح ولا لأ، والآيفون سحبه إمتى", () => {
  it("مفيش الخاصية خالص في الويب-ڤيو ⇒ «no-api»", async () => {
    const onAcquire = vi.fn();
    await createScreenWake(() => undefined, { onAcquire }).acquire();
    expect(onAcquire).toHaveBeenCalledWith(false, "no-api");
  });

  it("نجح ⇒ ok · رفض ⇒ اسم الرفض", async () => {
    const onAcquire = vi.fn();
    const okApi: WakeLockLike = { request: vi.fn(async () => fakeSentinel()) };
    await createScreenWake(() => okApi, { onAcquire }).acquire();
    expect(onAcquire).toHaveBeenLastCalledWith(true, undefined);

    const noApi: WakeLockLike = { request: vi.fn(async () => { throw new DOMException("low power", "NotAllowedError"); }) };
    await createScreenWake(() => noApi, { onAcquire }).acquire();
    expect(onAcquire).toHaveBeenLastCalledWith(false, "NotAllowedError");
  });

  it("الآيفون سحبه لوحده ⇒ onRelease · إحنا اللي سبناه (إيقاف التسجيل) ⇒ لأ", async () => {
    const sentinels: ReturnType<typeof fakeSentinel>[] = [];
    const api: WakeLockLike = { request: vi.fn(async () => { const s = fakeSentinel(); sentinels.push(s); return s; }) };
    const onRelease = vi.fn();
    const w = createScreenWake(() => api, { onRelease });
    await w.acquire();
    sentinels[0].systemRelease();
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(w.isHeld()).toBe(false);

    await w.acquire();
    await w.release();
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("من غير hooks ⇒ زي الأول بالحرف", async () => {
    const api: WakeLockLike = { request: vi.fn(async () => fakeSentinel()) };
    const w = createScreenWake(() => api);
    await w.acquire();
    expect(w.isHeld()).toBe(true);
  });
});

describe("🔔 حالة الصفّارة للصندوق", () => {
  it("لقطة من غير ما تغيّر حاجة", async () => {
    const { sirenDiagState } = await import("@/lib/alertSiren");
    const s = sirenDiagState();
    expect(s).toMatchObject({ playing: false, kind: null });
    expect(Object.keys(s).sort()).toEqual(["ctx", "kind", "micOn", "playing", "session", "tone"].sort());
  });
});

describe("🩺 الصندوق شغّال على العبيدي بس", () => {
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it("حسابه في القايمة", async () => {
    const { DIAG_AGENT_IDS, diagEnabledFor } = await import("@/lib/deviceDiag");
    expect(DIAG_AGENT_IDS).toContain(OBAIDI);
    expect(diagEnabledFor(OBAIDI)).toBe(true);
  });

  it("الغلط بيتسجّل بأول سطرين من مكانه (stk) — عشان نعرف الغلط اللي مالوش ملف جاي منين", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { startDeviceDiag } = await import("@/lib/deviceDiag");
    const stop = startDeviceDiag(OBAIDI);
    const err = new Error("Can't find variable: EmptyRanges");
    err.stack = "global code@\nevaluateJavaScript@user-script:1705:12\nmore@x:1:1";
    window.dispatchEvent(new ErrorEvent("error", { message: err.message, error: err, lineno: 1705, colno: 12 }));
    const buf = JSON.parse(localStorage.getItem("ph:diag:buf") || "[]") as Array<Record<string, unknown>>;
    const e = buf.find((x) => x.k === "err");
    expect(e).toMatchObject({ msg: "Can't find variable: EmptyRanges", line: 1705, col: 12 });
    expect(String(e?.stk)).toBe("global code@ | evaluateJavaScript@user-script:####:12");
    stop();
  });
});

describe("🔌 التوصيل في Voice PRO وفي مربع المطلوبة", () => {
  const VP = read("app/(app)/registration-v2/page.tsx");
  const OV = read("components/WantedAlertOverlay.tsx");

  it("قفل الشاشة: نجح/رفض + الآيفون سحبه — للصندوق بس", () => {
    expect(VP).toMatch(/const wake = browserScreenWake\(diagActive\(\) \? \{\s*onAcquire: \(ok, why\) => diagNote\("wake", \{ ok, why: why \?\? null, vis: document\.visibilityState \}\),\s*onRelease: \(\) => diagNote\("wake-lost", \{ vis: document\.visibilityState \}\),\s*\} : undefined\);/);
  });

  it("المطلوبة: اتسمعت مرة ولا اتأكدت (الطريقين) + الإنذار اتضرب ولا اتمنع (من غير لوحات)", () => {
    expect(VP).toMatch(/if \(inSheet && diagActive\(\)\) diagNote\("rv2-wanted", \{ via: "plate", ok: !!hit, mult: meta\.mult, reads: wantedReadCount\(wantedSeenRef\.current, key, meta\.tMs\) \}\);/);
    expect(VP).toMatch(/const heard = wantedHits\(r, checkIndexRef\.current, \(x\) => normalizePlate\(bankPlateToArabic\(x\)\)\);\s*const hits = heard\s*\.filter\(\(h\) => confirmWanted\(wantedSeenRef\.current, normalizePlate\(bankPlateToArabic\(h\.plate\)\), r\.tMs\)\);\s*if \(heard\.length && diagActive\(\)\) diagNote\("rv2-wanted", \{ via: "fast", heard: heard\.length, ok: hits\.length \}\);/);
    expect(VP).toMatch(/if \(!shouldAlertNow\(alertedRef\.current, key, now\)\) \{ diagNote\("rv2-alert", \{ skip: "repeat" \}\); return; \}/);
    expect(VP).toMatch(/diagNote\("rv2-alert", \{ fire: true, rec: !!engineRef\.current \}\);/);
  });

  it("التصدير: كام اتحفظ من كام والسبب", () => {
    expect(VP).toMatch(/diagNote\("rv2-export", \{ ok: okIds\.length, total: entries\.length, why: okIds\.length < entries\.length \? firstFailureReason\(settled\) : null \}\);/);
  });

  it("الصفّارة: حالتها لحظة الإنذار وبعد ثانيتين (بعد ما المايك يتقفل) و«تم»", () => {
    expect(OV).toMatch(/startAlertSiren\(\);\s*(?:\/\/[^\n]*\n\s*)?if \(diagActive\(\)\) \{\s*diagNote\("siren", sirenDiagState\(\)\);\s*setTimeout\(\(\) => diagNote\("siren-2s", sirenDiagState\(\)\), 2000\);\s*\}/);
    expect(OV).toMatch(/function dismiss\(\) \{\s*stopAlertSiren\(\);\s*diagNote\("siren-stop", \{ left: queue\.length - 1 \}\);/);
  });
});

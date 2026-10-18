import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * 🔕 «يظهر المربع وميظهرش معاها الرنه … ولما يطلع للواتس اب ويرجع ترن» (آيفون، Voice PRO) — المايك مفتوح بـ«إلغاء الصدى»
 * فالموبايل بيوطّي أي صوت تاني لحد ما المايك يتقفل. المالك (١٨ أكتوبر ٢٠٢٦): «وقت مايحصل سيارة عادي المايك يقف مفيش
 * مشكله المهم الرنه تظهر معاه». ⇒ العربية المطلوبة بتوقّف التسجيل، والصفّارة ترن، و«تم» (آخر تنبيه) بيرجّع التسجيل لوحده.
 */
const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

describe("🔴 «خلصت التنبيهات» بعد آخر «تم»", () => {
  it("الحدث بيوصل للمشتركين وبيتلغي", async () => {
    const w = await import("@/lib/wantedAlert");
    const cb = vi.fn();
    const off = w.onWantedAlertsCleared(cb);
    w.fireWantedAlertsCleared();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    w.fireWantedAlertsCleared();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("المربع: «تم» على تنبيه وفيه تاني ⇒ لسه · «تم» على الأخير ⇒ خلصت", async () => {
    const { default: WantedAlertOverlay } = await import("@/components/WantedAlertOverlay");
    const w = await import("@/lib/wantedAlert");
    const cleared = vi.fn();
    const off = w.onWantedAlertsCleared(cleared);
    render(<WantedAlertOverlay />);
    act(() => {
      w.fireWantedAlert({ plate: "رسك4082", matchType: "exact" });
      w.fireWantedAlert({ plate: "سرم6947", matchType: "exact" });
    });
    fireEvent.click(screen.getByRole("button", { name: /تم/ }));
    expect(cleared).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /تم/ }));
    expect(cleared).toHaveBeenCalledTimes(1);
    off();
  });
});

describe("🔴 الآيفون يرن حتى لو صامت أول ما المايك يتقفل", () => {
  class FakeNode { connect = vi.fn(); disconnect = vi.fn(); }
  class FakeCtx {
    state = "running"; currentTime = 0; destination = {};
    resume = vi.fn(() => Promise.resolve());
    createOscillator() { return { ...new FakeNode(), type: "", frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() }; }
    createGain() { return { ...new FakeNode(), gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }; }
  }
  beforeEach(() => {
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
    Object.defineProperty(navigator, "audioSession", { value: { type: "auto" }, configurable: true, writable: true });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("التنبيه بدأ والمايك مفتوح ⇒ مايلمسش · المايك اتقفل والتنبيه لسه ⇒ «playback»", async () => {
    vi.useFakeTimers();
    const track = { readyState: "live", stop() { this.readyState = "ended"; } };
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [track] })) }, configurable: true, writable: true,
    });
    vi.resetModules();
    const cap = await import("@/lib/micCapture");
    cap.installMicCaptureWatch();
    const s = await import("@/lib/alertSiren");
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const as = (navigator as unknown as { audioSession: { type: string } }).audioSession;
    s.startAlertSiren();
    expect(as.type).toBe("auto");
    track.stop();                       // Voice PRO وقّف المايك عشان العربية المطلوبة
    vi.advanceTimersByTime(600);
    expect(as.type).toBe("playback");
    s.stopAlertSiren();
    expect(as.type).toBe("auto");
  });
});

describe("🔴 Voice PRO", () => {
  const P = read("app/(app)/registration-v2/page.tsx");
  it("العربية المطلوبة بتوقّف التسجيل (لو شغّال) عشان الصفّارة تتسمع", () => {
    expect(P).toMatch(/if \(engineRef\.current\) \{\s*pausedForWantedRef\.current = true;[\s\S]{0,200}stopRef\.current\("wanted"\)/);
  });
  it("آخر «تم» ⇒ التسجيل بيرجع لوحده (لو كان واقف عشان المطلوبة بس)", () => {
    expect(P).toMatch(/onWantedAlertsCleared\(\(\) => \{/);
    expect(P).toMatch(/if \(!pausedForWantedRef\.current \|\| engineRef\.current \|\| startingRef\.current\) return;/);
    expect(P).toMatch(/void startRef\.current\(\);/);
  });
  it("المندوب وقّف بإيده ⇒ مايرجعش لوحده", () => {
    expect(P).toMatch(/if \(why === "manual"\) pausedForWantedRef\.current = false;/);
  });
  it("رسالة واضحة: «هيرجع لوحده أول ما تدوس تم»", () => {
    expect(P).toMatch(/هيرجع لوحده أول ما تدوس «تم»/);
  });
});

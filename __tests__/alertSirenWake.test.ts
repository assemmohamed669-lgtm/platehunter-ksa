import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🔔 «المربع بيطلع إن اللوحة مطلوبة بس صوت النغمة مش بترن» — المالك (١٨ أكتوبر ٢٠٢٦: «اعملهم»):
 *  ① الآيفون بعد مكالمة/سيري/فيديو بيحط الصوت في حالة «interrupted» — كنا بنصحّي «suspended» بس.
 *  ② اهتزاز مع كل تنبيه مطلوب (بيلف لحد «تم») — الأندرويد بيهتز حتى لو الصوت واطي/صامت.
 *  ③ الآيفون: يرن حتى لو صامت (`navigator.audioSession.type = "playback"`) — **إلا والمايك شغّال** (تغيير نوع الصوت
 *     ممكن يوقف التسجيل)، ويرجع زي ما كان بعد «تم».
 */
class FakeNode { connect = vi.fn(); disconnect = vi.fn(); }
class FakeOsc extends FakeNode { type = ""; frequency = { value: 0 }; start = vi.fn(); stop = vi.fn(); }
class FakeGain extends FakeNode { gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
let ctxs: FakeCtx[];
class FakeCtx {
  state = "running"; currentTime = 0; destination = {};
  resume = vi.fn(() => Promise.resolve());
  constructor() { ctxs.push(this); }
  createOscillator() { return new FakeOsc(); }
  createGain() { return new FakeGain(); }
  createBufferSource() { return { ...new FakeNode(), buffer: null, loop: false, start: vi.fn(), stop: vi.fn() }; }
  decodeAudioData() { return Promise.resolve({}); }
}

let vibrate: ReturnType<typeof vi.fn>;
async function load() {
  vi.resetModules();
  const mic = await import("@/lib/micBusy");
  mic.resetMicBusy();
  return { s: await import("@/lib/alertSiren"), mic };
}

beforeEach(() => {
  ctxs = [];
  localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true, writable: true });
  Object.defineProperty(navigator, "audioSession", { value: { type: "auto" }, configurable: true, writable: true });
});
afterEach(() => { vi.useRealTimers(); });

describe("① الصوت بيصحى بعد المكالمة", () => {
  it("«interrupted» (آيفون بعد مكالمة) ⇒ أي لمسة بتصحّيه — مش «suspended» بس", async () => {
    const { s } = await load();
    s.ensureSirenAudioUnlocked();
    ctxs[0].state = "interrupted";
    s.ensureSirenAudioUnlocked();
    expect(ctxs[0].resume).toHaveBeenCalled();
  });
  it("الـcontext اتقفل (closed) ⇒ التنبيه بيعمل واحد جديد ويرن", async () => {
    const { s } = await load();
    s.ensureSirenAudioUnlocked();
    ctxs[0].state = "closed";
    s.startAlertSiren();
    expect(ctxs.length).toBe(2);
    expect(s.isAlertSirenPlaying()).toBe(true);
    s.stopAlertSiren();
  });
});

describe("② اهتزاز مع التنبيه", () => {
  it("بيهتز على طول ويفضل يهتز لحد «تم»", async () => {
    vi.useFakeTimers();
    const { s } = await load();
    s.startAlertSiren();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(Array.isArray(vibrate.mock.calls[0][0])).toBe(true);
    vi.advanceTimersByTime(4100);
    expect(vibrate.mock.calls.length).toBeGreaterThanOrEqual(3);
    s.stopAlertSiren();
    expect(vibrate).toHaveBeenLastCalledWith(0);
    const n = vibrate.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(vibrate.mock.calls.length).toBe(n);
  });
  it("«اسمع» في الإعدادات مابيهتزش", async () => {
    const { s } = await load();
    await s.previewAlertTone("siren");
    expect(vibrate.mock.calls.filter((c) => c[0] !== 0).length).toBe(0);
    s.stopAlertSiren();
  });
  it("موبايل مافيهوش اهتزاز (آيفون) ⇒ الصوت عادي من غير ما يوقع", async () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true, writable: true });
    const { s } = await load();
    expect(() => s.startAlertSiren()).not.toThrow();
    expect(s.isAlertSirenPlaying()).toBe(true);
    s.stopAlertSiren();
  });
});

describe("③ الآيفون يرن حتى لو صامت (السوبر أدمن الأول)", () => {
  it("🛑 مش سوبر أدمن ⇒ مابنلمسش نوع الصوت (لحد التجربة على آيفون حقيقي)", async () => {
    const { s } = await load();
    const as = (navigator as unknown as { audioSession: { type: string } }).audioSession;
    expect(s.SILENT_RING_FOR_ALL).toBe(false);
    s.startAlertSiren();
    expect(as.type).toBe("auto");
    s.stopAlertSiren();
  });
  it("وقت التنبيه «playback» وبعد «تم» يرجع زي ما كان", async () => {
    const { s } = await load();
    s.setSilentRingSuper(true);
    const as = (navigator as unknown as { audioSession: { type: string } }).audioSession;
    s.startAlertSiren();
    expect(as.type).toBe("playback");
    s.stopAlertSiren();
    expect(as.type).toBe("auto");
  });
  it("🎙️ المايك شغّال (التسجيل) ⇒ مابنلمسش نوع الصوت", async () => {
    const { s, mic } = await load();
    s.setSilentRingSuper(true);
    mic.setMicBusy(true);
    const as = (navigator as unknown as { audioSession: { type: string } }).audioSession;
    s.startAlertSiren();
    expect(as.type).toBe("auto");
    s.stopAlertSiren();
    expect(as.type).toBe("auto");
  });
  it("موبايل مافيهوش الأمر ده ⇒ عادي", async () => {
    Object.defineProperty(navigator, "audioSession", { value: undefined, configurable: true, writable: true });
    const { s } = await load();
    expect(() => { s.startAlertSiren(); s.stopAlertSiren(); }).not.toThrow();
  });
});

describe("🎙️ مايك مفتوح في أي صفحة (Voice PRO مابيحطّش micBusy)", () => {
  function fakeMedia() {
    const track = { readyState: "live", stop() { this.readyState = "ended"; } };
    const getUserMedia = vi.fn(async () => ({ getAudioTracks: () => [track] }));
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true, writable: true });
    return { track, getUserMedia };
  }
  it("المايك مفتوح ⇒ مابنلمسش نوع الصوت · اتقفل ⇒ عادي", async () => {
    const { track } = fakeMedia();
    const { s } = await load();
    const cap = await import("@/lib/micCapture");
    cap.installMicCaptureWatch();
    s.setSilentRingSuper(true);
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const as = (navigator as unknown as { audioSession: { type: string } }).audioSession;
    s.startAlertSiren();
    expect(as.type).toBe("auto");
    s.stopAlertSiren();
    track.stop();
    s.startAlertSiren();
    expect(as.type).toBe("playback");
    s.stopAlertSiren();
  });
  it("المايك اتفتح والتنبيه بيرن ⇒ نوع الصوت بيرجع **قبل** ما المايك يشتغل", async () => {
    const { getUserMedia } = fakeMedia();
    const { s } = await load();
    const cap = await import("@/lib/micCapture");
    cap.installMicCaptureWatch();
    s.setSilentRingSuper(true);
    const as = (navigator as unknown as { audioSession: { type: string } }).audioSession;
    s.startAlertSiren();
    expect(as.type).toBe("playback");
    let typeAtCapture = "";
    getUserMedia.mockImplementationOnce(async () => { typeAtCapture = as.type; return { getAudioTracks: () => [] }; });
    await navigator.mediaDevices.getUserMedia({ audio: true });
    expect(typeAtCapture).toBe("auto");
    s.stopAlertSiren();
  });
});

describe("التوصيل", () => {
  it("الشِلّ بيقول للتنبيه مين سوبر أدمن + بيراقب المايك", () => {
    const L = readFileSync(path.resolve(__dirname, "..", "app/(app)/layout.tsx"), "utf8");
    expect(L).toMatch(/setSilentRingSuper\(rp\?\.is_super === true\)/);
    const O = readFileSync(path.resolve(__dirname, "..", "components/WantedAlertOverlay.tsx"), "utf8");
    expect(O).toMatch(/installMicCaptureWatch\(\)/);
  });
  it("البرنامج لما يرجع من الخلفية بيصحّي الصوت", () => {
    const o = readFileSync(path.resolve(__dirname, "..", "components/WantedAlertOverlay.tsx"), "utf8");
    expect(o).toMatch(/visibilitychange/);
  });
});

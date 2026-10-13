import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * 🔔 «نغمة التحصيل» وقت التنبيه — النغمة المختارة بتلف (loop) لحد «تم» زي الصفّارة بالظبط، على نفس الـAudioContext
 * المفكوك من أول لمسة (عشان تشتغل حتى لو التطابق جه من رد الشبكة في الصوت). ولو ملفها لسه ماتحمّلش (نت ضعيف/أوفلاين)
 * ⇒ الصفّارة العادية — **التنبيه عمره ما يسكت**.
 */
class FakeNode {
  connect = vi.fn(); disconnect = vi.fn();
}
class FakeOsc extends FakeNode {
  type = ""; frequency = { value: 0 }; start = vi.fn(); stop = vi.fn();
}
class FakeGain extends FakeNode {
  gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}
class FakeSource extends FakeNode {
  buffer: unknown = null; loop = false; onended: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn();
}
let made: { oscs: FakeOsc[]; sources: FakeSource[] };
let decodeFails = false;
class FakeCtx {
  state = "running"; currentTime = 0; destination = {};
  resume = vi.fn(() => Promise.resolve());
  createOscillator() { const o = new FakeOsc(); made.oscs.push(o); return o; }
  createGain() { return new FakeGain(); }
  createBufferSource() { const s = new FakeSource(); made.sources.push(s); return s; }
  decodeAudioData(ab: ArrayBuffer) {
    return decodeFails ? Promise.reject(new Error("bad")) : Promise.resolve({ decodedFrom: ab.byteLength });
  }
}

let fetchMock: ReturnType<typeof vi.fn>;
async function load() {
  vi.resetModules();
  return import("@/lib/alertSiren");
}

beforeEach(() => {
  made = { oscs: [], sources: [] };
  decodeFails = false;
  localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("🔴 الصفّارة الافتراضية زي ما هي", () => {
  it("مفيش نغمة مختارة ⇒ نفس صفّارة الحرب ومن غير أي تحميل", async () => {
    const s = await load();
    s.startAlertSiren();
    expect(made.oscs.length).toBe(2);           // الطنين + المعدِّل (LFO)
    expect(made.sources.length).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.isAlertSirenPlaying()).toBe(true);
    s.stopAlertSiren();
    expect(s.isAlertSirenPlaying()).toBe(false);
  });
});

describe("🔴 النغمة المختارة", () => {
  it("متحمّلة ⇒ بتلف لحد «تم» بدل الصفّارة", async () => {
    localStorage.setItem("ph:alertTone", "military");
    const s = await load();
    expect(await s.preloadAlertTone()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/tones/military.mp3");
    s.startAlertSiren();
    expect(made.oscs.length).toBe(0);
    expect(made.sources.length).toBe(1);
    expect(made.sources[0].loop).toBe(true);
    expect(made.sources[0].buffer).toEqual({ decodedFrom: 8 });
    expect(made.sources[0].start).toHaveBeenCalled();
    expect(s.isAlertSirenPlaying()).toBe(true);
    s.stopAlertSiren();
    expect(made.sources[0].stop).toHaveBeenCalled();
    expect(s.isAlertSirenPlaying()).toBe(false);
  });
  it("🔴 لسه ماتحمّلتش ⇒ الصفّارة فوراً (عمره ما يسكت) + بيبدأ يحمّلها للمرة الجاية", async () => {
    localStorage.setItem("ph:alertTone", "funny");
    const s = await load();
    s.startAlertSiren();
    expect(made.oscs.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith("/tones/funny.mp3");
    s.stopAlertSiren();
    await s.preloadAlertTone();                  // نفس التحميل — مابيتكرّرش
    expect(fetchMock).toHaveBeenCalledTimes(1);
    s.startAlertSiren();
    expect(made.sources.length).toBe(1);
  });
  it("التحميل فشل (أوفلاين/ملف بايظ) ⇒ false ومن غير ما يوقع، والتنبيه بالصفّارة", async () => {
    localStorage.setItem("ph:alertTone", "robot");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const s = await load();
    expect(await s.preloadAlertTone()).toBe(false);
    s.startAlertSiren();
    expect(made.oscs.length).toBe(2);
    decodeFails = true;
    expect(await s.preloadAlertTone()).toBe(false); // بيحاول تاني بعد الفشل
  });
});

describe("🔴 «اسمع» في صفحة الإعدادات", () => {
  it("بتسمّع النغمة مرة واحدة (مش لفّة) وبتقف لما تدوس تاني", async () => {
    const s = await load();
    expect(await s.previewAlertTone("turkish")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/tones/turkish.mp3");
    expect(made.sources[0].loop).toBe(false);
    expect(s.isAlertSirenPlaying()).toBe(true);
    s.stopAlertSiren();
    expect(made.sources[0].stop).toHaveBeenCalled();
  });
  it("لما النغمة تخلص لوحدها ⇒ مش شغّالة", async () => {
    const s = await load();
    await s.previewAlertTone("samsung");
    made.sources[0].onended?.();
    expect(s.isAlertSirenPlaying()).toBe(false);
  });
  it("🔴 الخروج من صفحة الإعدادات بيوقف المعاينة بس — عمره ما يوقف تنبيه مطلوب حقيقي", async () => {
    const s = await load();
    s.startAlertSiren();                         // تنبيه حقيقي
    s.stopAlertTonePreview();
    expect(s.isAlertSirenPlaying()).toBe(true);
    s.stopAlertSiren();
    await s.previewAlertTone("alarm");           // معاينة
    s.stopAlertTonePreview();
    expect(s.isAlertSirenPlaying()).toBe(false);
  });
  it("🔴 معاينة لسه بتتحمّل والمندوب خرج ⇒ ماتشتغلش بعدين", async () => {
    const s = await load();
    const p = s.previewAlertTone("r33");
    s.stopAlertTonePreview();
    expect(await p).toBe(false);
    expect(made.sources.length).toBe(0);
  });
  it("الافتراضي ⇒ بتسمّع الصفّارة", async () => {
    const s = await load();
    expect(await s.previewAlertTone("siren")).toBe(true);
    expect(made.oscs.length).toBe(2);
    s.stopAlertSiren();
  });
});

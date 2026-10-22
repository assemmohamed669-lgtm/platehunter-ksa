import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchRecorder } from "./batchRecorder";

/**
 * ⏸️ «وقف مؤقت» وكمّل في **نفس التسجيل** (المالك ٢٢ أكتوبر ٢٠٢٦): «زر … يوقف التسجيل دة مؤقت الي حين ما يطلع من
 * مكان مفيهوش لوحات … ويرجع بعدين يدوس استئناف التسجيل يشتغل معاه ويكمل ويقول لوحات علي نفس الملف».
 * `MediaRecorder.pause/resume` ⇒ ملف واحد مافيهوش الوقفة، والمسجّل بيفتكر كل وقفة (مكانها في الصوت ومدتها).
 */

type State = "inactive" | "recording" | "paused";
let lastRec: FakeRec | null = null;
let pauseWorks = true;

class FakeRec {
  static isTypeSupported = () => true;
  state: State = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  private stopFns: Array<() => void> = [];
  constructor() {
    lastRec = this;
  }
  start() {
    this.state = "recording";
  }
  pause() {
    if (pauseWorks) this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"]) });
    this.stopFns.forEach((f) => f());
  }
  addEventListener(name: string, fn: () => void) {
    if (name === "stop") this.stopFns.push(fn);
  }
}

let now = 0;
const track = { stop: vi.fn() };

beforeEach(() => {
  now = 1000;
  pauseWorks = true;
  lastRec = null;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("MediaRecorder", FakeRec);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BatchRecorder — وقف مؤقت وكمّل", () => {
  it("الوقفة مابتتحسبش من مدة الصوت، وبتتفتكر بمكانها في الصوت ومدتها", async () => {
    const r = new BatchRecorder();
    await r.start();
    now += 20_000; // ٢٠ث صوت
    expect(r.pause()).toBe(true);
    expect(r.isPaused).toBe(true);
    expect(lastRec!.state).toBe("paused");
    now += 600_000; // واقف ١٠ دقايق
    expect(r.durationSec).toBeCloseTo(20, 5);
    expect(r.pauses).toEqual([{ atAudioMs: 20_000, durMs: 600_000 }]); // الوقفة المفتوحة بمدتها لحد دلوقتي
    expect(r.resume()).toBe(true);
    expect(r.isPaused).toBe(false);
    expect(lastRec!.state).toBe("recording");
    now += 5_000;
    expect(r.durationSec).toBeCloseTo(25, 5);
    expect(r.pauses).toEqual([{ atAudioMs: 20_000, durMs: 600_000 }]);
  });

  it("وقفتين ⇒ الاتنين بالترتيب", async () => {
    const r = new BatchRecorder();
    await r.start();
    now += 10_000;
    r.pause();
    now += 1_000;
    r.resume();
    now += 10_000;
    r.pause();
    now += 2_000;
    r.resume();
    expect(r.pauses).toEqual([
      { atAudioMs: 10_000, durMs: 1_000 },
      { atAudioMs: 20_000, durMs: 2_000 },
    ]);
    expect(r.durationSec).toBeCloseTo(20, 5);
  });

  it("الجهاز مابيعرفش يوقف مؤقت ⇒ `false` والتسجيل شغّال زي ما هو", async () => {
    pauseWorks = false;
    const r = new BatchRecorder();
    await r.start();
    now += 5_000;
    expect(r.pause()).toBe(false);
    expect(r.isPaused).toBe(false);
    expect(r.pauses).toEqual([]);
    expect(lastRec!.state).toBe("recording");
  });

  it("دوسة «كمّل» من غير وقفة / «وقف» مرتين ⇒ مابتعملش حاجة", async () => {
    const r = new BatchRecorder();
    await r.start();
    expect(r.resume()).toBe(false);
    expect(r.pause()).toBe(true);
    expect(r.pause()).toBe(false);
    expect(r.pauses).toHaveLength(1);
  });

  it("«إيقاف» وهو واقف مؤقت ⇒ الملف بيتقفل عادي والوقفة بتتقفل", async () => {
    const r = new BatchRecorder();
    await r.start();
    now += 8_000;
    r.pause();
    now += 3_000;
    const blob = await r.stop();
    expect(blob.size).toBeGreaterThan(0);
    expect(r.isPaused).toBe(false);
    expect(r.pauses).toEqual([{ atAudioMs: 8_000, durMs: 3_000 }]);
  });

  it("وهو واقف: العدّاد واقف والحد الأقصى مابيتحسبش (مابيقفلش التسجيل لوحده)", async () => {
    const onMaxDuration = vi.fn();
    const ticks: number[] = [];
    const r = new BatchRecorder({ maxSeconds: 30, onMaxDuration, onTick: (s) => ticks.push(s) });
    await r.start();
    now += 20_000;
    r.pause();
    now += 600_000;
    vi.advanceTimersByTime(300);
    expect(onMaxDuration).not.toHaveBeenCalled();
    expect(ticks.at(-1)).toBeCloseTo(20, 5);
    r.resume();
    now += 11_000;
    vi.advanceTimersByTime(300);
    expect(onMaxDuration).toHaveBeenCalled();
  });

  it("تسجيل جديد ⇒ وقفات القديم مابتتنقلش", async () => {
    const r = new BatchRecorder();
    await r.start();
    now += 1000;
    r.pause();
    now += 1000;
    await r.stop();
    await r.start();
    expect(r.pauses).toEqual([]);
    expect(r.isPaused).toBe(false);
  });
});

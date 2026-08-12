import { describe, it, expect, vi } from "vitest";
import { scheduleSortBeep, playSortBeep } from "@/lib/sortBeep";

/**
 * نغمة «بدأ الفرز» — بتطلع أول ما المندوب يضغط زر الفرز عشان يتأكد إن البرنامج
 * بدأ (الفرز على ملف كبير بياخد ثواني والشاشة ساكتة).
 *
 * أهم شرط: **مهما حصل في الصوت، الفرز مايقفش**. المندوب في الميدان ممكن يكون
 * الصوت مقفول أو الجهاز رافض تشغيل صوت — لازم يعدّي بهدوء.
 */

/** AudioContext وهمي بيسجّل اللي اتعمل عليه. */
function fakeCtx() {
  const oscs: Array<{ freq: number; type: string; started: number; stopped: number }> = [];
  const gainCalls: string[] = [];
  const gainNode = {
    connect: () => {},
    gain: {
      value: 0,
      setValueAtTime: () => { gainCalls.push("set"); },
      exponentialRampToValueAtTime: () => { gainCalls.push("ramp"); },
    },
  };
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain: () => gainNode,
    createOscillator: () => {
      const o = { freq: 0, type: "", started: -1, stopped: -1, connect: () => {},
        frequency: { value: 0 },
        start(t: number) { o.started = t; o.freq = o.frequency.value; oscs.push(o as never); },
        stop(t: number) { o.stopped = t; } };
      return o;
    },
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return { ctx: ctx as unknown as AudioContext, oscs, gainCalls };
}

describe("نغمة بدء الفرز", () => {
  it("بتشغّل نغمتين (صاعدة) مش واحدة", () => {
    const { ctx, oscs } = fakeCtx();
    scheduleSortBeep(ctx);
    expect(oscs).toHaveLength(2);
    expect(oscs[1].freq).toBeGreaterThan(oscs[0].freq);
  });

  it("النغمة قصيرة — مابتعطّلش المندوب", () => {
    const { ctx, oscs } = fakeCtx();
    scheduleSortBeep(ctx);
    const total = Math.max(...oscs.map((o) => o.stopped));
    expect(total).toBeLessThan(0.3);          // أقل من ثلث ثانية بالكامل
  });

  it("كل نغمة ليها fade يمنع الطقطقة", () => {
    const { ctx, gainCalls } = fakeCtx();
    scheduleSortBeep(ctx);
    expect(gainCalls.filter((c) => c === "ramp").length).toBeGreaterThanOrEqual(4);
  });

  it("النغمة التانية بعد الأولى مش فوقها", () => {
    const { ctx, oscs } = fakeCtx();
    scheduleSortBeep(ctx);
    expect(oscs[1].started).toBeGreaterThanOrEqual(oscs[0].stopped);
  });

  it("الجهاز اللي مامعاهوش صوت — بتعدّي بهدوء من غير خطأ", () => {
    const orig = window.AudioContext;
    // @ts-expect-error محاكاة متصفّح بلا Web Audio
    delete window.AudioContext;
    expect(() => playSortBeep()).not.toThrow();
    window.AudioContext = orig;
  });

  it("لو الصوت رمى خطأ، الفرز مايقفش", () => {
    const orig = window.AudioContext;
    // @ts-expect-error محاكاة متصفّح بيرفض إنشاء سياق صوت
    window.AudioContext = function () { throw new Error("blocked"); };
    expect(() => playSortBeep()).not.toThrow();
    window.AudioContext = orig;
  });

  it("بيقفل سياق الصوت بعد ما يخلص (مايسيبش موارد مفتوحة)", () => {
    vi.useFakeTimers();
    const close = vi.fn(() => Promise.resolve());
    const { ctx } = fakeCtx();
    const orig = window.AudioContext;
    // @ts-expect-error سياق وهمي
    window.AudioContext = function () { return { ...ctx, close }; };
    playSortBeep();
    vi.advanceTimersByTime(1000);
    expect(close).toHaveBeenCalled();
    window.AudioContext = orig;
    vi.useRealTimers();
  });
});

/**
 * 🍏🔊 النغمة **عالية** على الآيفون والمندوب برّه البرنامج — من غير نسخة جديدة (المالك ٢٣ نوفمبر ٢٠٢٦: «مفيش حل غير بناء نسخه
 * جديدة دة مقرف … نغمه البرنامج طالعه معاه بس المشكله ان صوتها واطي» ⇒ «يلا» + «وانشر للكل»).
 *
 * صندوق شريف (f958b3d0، ٤:٥٢م): المايك مفتوح ⇒ الآيفون بيوطّي أي صوت تاني، والصفّارة (Web Audio) `siren-2s ctx=interrupted`.
 * التجربة: لحظة التنبيه بس (مش طول التسجيل — مانلمسش التسجيل العادي عند حد) ⇒ عنصر صوت عادي بالنغمة المختارة يشتغل،
 * ولو **فعلاً شغّال** ⇒ المايك يقف (مفيش توطية) — ولو لأ ⇒ زي دلوقتي بالظبط (المايك يفضل + النغمة الواطية + الإشعار).
 */
import { describe, expect, it, vi } from "vitest";
import { BG_TONE_FALLBACK_FILE, BgTone, IOS_BG_TONE_FOR_ALL, bgToneFile, iosBgToneFor } from "@/lib/iosBgTone";

type FakeEl = { src: string; loop: boolean; muted: boolean; paused: boolean; currentTime: number; play: () => Promise<void>; pause: () => void };

function fakeEl(opts: { playFails?: boolean; staysPaused?: boolean } = {}): FakeEl {
  const el: FakeEl = {
    src: "", loop: false, muted: false, paused: true, currentTime: 5,
    play: vi.fn(async () => {
      if (opts.playFails) throw new Error("NotAllowedError");
      if (!opts.staysPaused) el.paused = false;
    }),
    pause: vi.fn(() => { el.paused = true; }),
  };
  return el;
}

describe("مين — الآيفون للكل", () => {
  it("الآيفون بس (الأندرويد بيرن عالي أصلاً من الخدمة)", () => {
    expect(IOS_BG_TONE_FOR_ALL).toBe(true);
    expect(iosBgToneFor("ios")).toBe(true);
    expect(iosBgToneFor("android")).toBe(false);
    expect(iosBgToneFor("web-ios")).toBe(false);
  });
});

describe("bgToneFile — النغمة اللي المندوب مختارها", () => {
  it("نغمة بملف ⇒ ملفها", () => {
    expect(bgToneFile("military")).toBe("/tones/military.mp3");
  });
  it("صفّارة البرنامج (من غير ملف) أو مش موجودة ⇒ أقرب ملف ليها", () => {
    expect(bgToneFile("siren")).toBe(BG_TONE_FALLBACK_FILE);
    expect(bgToneFile("مش-موجودة")).toBe(BG_TONE_FALLBACK_FILE);
    expect(BG_TONE_FALLBACK_FILE).toMatch(/^\/tones\/.+\.mp3$/);
  });
});

describe("BgTone", () => {
  it("ring ⇒ لفّة، من الأول، مش مكتومة — و true لو شغّالة فعلاً", async () => {
    const el = fakeEl();
    const t = new BgTone(() => el as unknown as HTMLAudioElement);
    expect(await t.ring("/tones/alarm.mp3")).toBe(true);
    expect(el.src).toBe("/tones/alarm.mp3");
    expect(el.loop).toBe(true);
    expect(el.muted).toBe(false);
    expect(el.currentTime).toBe(0);
    expect(t.ringing).toBe(true);
  });

  it("الآيفون رفض التشغيل ⇒ false (المايك مايقفش — زي دلوقتي)", async () => {
    const t = new BgTone(() => fakeEl({ playFails: true }) as unknown as HTMLAudioElement);
    expect(await t.ring("/tones/alarm.mp3")).toBe(false);
    expect(t.ringing).toBe(false);
  });

  it("play رجعت بس العنصر لسه واقف ⇒ false", async () => {
    const t = new BgTone(() => fakeEl({ staysPaused: true }) as unknown as HTMLAudioElement);
    expect(await t.ring("/tones/alarm.mp3")).toBe(false);
  });

  it("مافيش عنصر صوت (المتصفح/الاختبار) ⇒ false", async () => {
    const t = new BgTone(() => null);
    expect(await t.ring("/tones/alarm.mp3")).toBe(false);
  });

  it("stop ⇒ يقف ويتشال — ومرة تانية مايرميش", async () => {
    const el = fakeEl();
    const t = new BgTone(() => el as unknown as HTMLAudioElement);
    await t.ring("/tones/alarm.mp3");
    t.stop();
    expect(el.pause).toHaveBeenCalled();
    expect(t.ringing).toBe(false);
    expect(() => t.stop()).not.toThrow();
  });

  it("ring تاني وهي شغّالة ⇒ نفس العنصر (مافيش صوتين فوق بعض)", async () => {
    const make = vi.fn(() => fakeEl() as unknown as HTMLAudioElement);
    const t = new BgTone(make);
    await t.ring("/tones/alarm.mp3");
    await t.ring("/tones/alarm.mp3");
    expect(make).toHaveBeenCalledTimes(1);
  });
});

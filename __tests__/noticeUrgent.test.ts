import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveNotice, noticeKey } from "@/lib/appNotice";
import { isMicBusy, setMicBusy, onMicBusyChange, resetMicBusy } from "@/lib/micBusy";
import { playNoticeTone, stopNoticeTone, isNoticeTonePlaying, scheduleNoticeTone } from "@/lib/noticeTone";
import { startAlertSiren, stopAlertSiren, isAlertSirenPlaying } from "@/lib/alertSiren";

/**
 * «رسالة عاجلة» — بتطلع للمندوب بالأحمر ومعاها **نغمة تحذيرية قصيرة** (تلات
 * نبضات وتسكت، مش صفّارة مستمرة عشان ماتضايقوش وهو شغّال). اختيارية لكل رسالة:
 * العادية (عروض/تنبيهات) بتفضل هادية.
 *
 * أخطر حاجة اتغطّت هنا: **النغمة دي مالهاش دعوة بصفّارة السيارة المطلوبة**.
 * صفّارة المطلوب singleton — لو استخدمناها للرسالة كانت هتقطع إنذار السيارة
 * المطلوبة لو وصلت رسالة في نفس اللحظة.
 */

const NOW = Date.now();
const base = { notice_text: "اجتماع طارئ", notice_at: new Date(NOW).toISOString(), notice_until: null };

describe("الرسالة العاجلة — القراءة", () => {
  it("الرسالة المعلّم عليها «عاجلة» بترجع urgent", () => {
    expect(resolveNotice({ ...base, notice_urgent: true }, NOW)?.urgent).toBe(true);
  });

  it("الرسالة العادية مش عاجلة", () => {
    expect(resolveNotice({ ...base, notice_urgent: false }, NOW)?.urgent).toBe(false);
  });

  it("الرسائل القديمة (قبل الميزة) بتتعامل كعادية", () => {
    expect(resolveNotice(base, NOW)?.urgent).toBe(false);
  });

  it("تحويل رسالة لعاجلة بيخليها تظهر وترنّ من جديد", () => {
    const calm = resolveNotice({ ...base, notice_urgent: false }, NOW)!;
    const loud = resolveNotice({ ...base, notice_urgent: true }, NOW)!;
    expect(noticeKey(calm)).not.toBe(noticeKey(loud));
  });
});

describe("علم الميكروفون", () => {
  beforeEach(() => resetMicBusy());
  afterEach(() => resetMicBusy());

  it("الافتراضي: الميك مقفول", () => {
    expect(isMicBusy()).toBe(false);
  });

  it("بيتغيّر لما التسجيل يبدأ ويقف", () => {
    setMicBusy(true);
    expect(isMicBusy()).toBe(true);
    setMicBusy(false);
    expect(isMicBusy()).toBe(false);
  });

  it("المشتركين بيتبلّغوا بالتغيير", () => {
    const seen: boolean[] = [];
    onMicBusyChange((v) => seen.push(v));
    setMicBusy(true);
    setMicBusy(true);      // نفس القيمة → مافيش تبليغ مكرر
    setMicBusy(false);
    expect(seen).toEqual([true, false]);
  });

  it("إلغاء الاشتراك بيشتغل", () => {
    const seen: boolean[] = [];
    const off = onMicBusyChange((v) => seen.push(v));
    off();
    setMicBusy(true);
    expect(seen).toEqual([]);
  });

  it("مستمع بيرمي خطأ مايوقفش الباقيين", () => {
    const seen: boolean[] = [];
    onMicBusyChange(() => { throw new Error("boom"); });
    onMicBusyChange((v) => seen.push(v));
    expect(() => setMicBusy(true)).not.toThrow();
    expect(seen).toEqual([true]);
  });
});

/** AudioContext وهمي — jsdom مافيهوش Web Audio. */
function installFakeAudio() {
  const node = () => ({ connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {},
    frequency: { value: 0 }, gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    type: "" });
  class FakeCtx {
    currentTime = 0;
    destination = {};
    createOscillator() { return node(); }
    createGain() { return node(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const prev = window.AudioContext;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  return () => { window.AudioContext = prev; };
}

describe("نغمة الرسالة — قصيرة ومستقلة عن إنذار السيارة المطلوبة", () => {
  let restore = () => {};
  beforeEach(() => { restore = installFakeAudio(); });
  afterEach(() => { stopNoticeTone(); stopAlertSiren(); restore(); });

  it("نغمة الرسالة **مابتقطعش** إنذار السيارة المطلوبة", () => {
    startAlertSiren();
    expect(isAlertSirenPlaying()).toBe(true);
    playNoticeTone();
    expect(isAlertSirenPlaying()).toBe(true);   // لسه شغّال — ده أهم شرط
    expect(isNoticeTonePlaying()).toBe(true);
  });

  it("وقف نغمة الرسالة مابيوقفش إنذار السيارة", () => {
    startAlertSiren();
    playNoticeTone();
    stopNoticeTone();
    expect(isNoticeTonePlaying()).toBe(false);
    expect(isAlertSirenPlaying()).toBe(true);
  });

  it("تشغيلها وهي شغّالة مابيعملش نغمة فوق نغمة", () => {
    playNoticeTone();
    expect(() => playNoticeTone()).not.toThrow();
    expect(isNoticeTonePlaying()).toBe(true);
    stopNoticeTone();
    expect(isNoticeTonePlaying()).toBe(false);
  });

  it("الوقف وهي مش شغّالة مايرميش خطأ", () => {
    expect(() => stopNoticeTone()).not.toThrow();
    expect(isNoticeTonePlaying()).toBe(false);
  });

  it("قصيرة — تلات نبضات وتخلص في أقل من ثانية", () => {
    const oscs: Array<{ started: number; stopped: number }> = [];
    const node = () => {
      const o = { connect(){}, disconnect(){}, frequency:{value:0}, type:"",
        gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
        started:-1, stopped:-1,
        start(t: number){ o.started = t; oscs.push(o); },
        stop(t: number){ o.stopped = t; } };
      return o;
    };
    const c = { currentTime: 0, destination: {},
      createOscillator: node, createGain: node } as unknown as AudioContext;
    const secs = scheduleNoticeTone(c);
    expect(oscs).toHaveLength(3);                 // تلات نبضات
    expect(secs).toBeLessThan(1);                 // أقل من ثانية بالكامل
    expect(oscs[1].started).toBeGreaterThanOrEqual(oscs[0].stopped);   // ورا بعض
  });

  it("بتسكت لوحدها من غير ما المندوب يعمل حاجة", async () => {
    playNoticeTone();
    expect(isNoticeTonePlaying()).toBe(true);
    await new Promise((r) => setTimeout(r, 1200));
    expect(isNoticeTonePlaying()).toBe(false);
  });
});

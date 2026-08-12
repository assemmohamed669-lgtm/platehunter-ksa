import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveNotice, noticeKey } from "@/lib/appNotice";
import { isMicBusy, setMicBusy, onMicBusyChange, resetMicBusy } from "@/lib/micBusy";
import { startNoticeSiren, stopNoticeSiren, isNoticeSirenPlaying } from "@/lib/noticeSiren";
import { startAlertSiren, stopAlertSiren, isAlertSirenPlaying } from "@/lib/alertSiren";

/**
 * «رسالة عاجلة» — بتطلع للمندوب بالأحمر ومعاها صفّارة بتفضل رنّانة لحد ما
 * يقفلها. اختيارية لكل رسالة: العادية (عروض/تنبيهات) بتفضل هادية.
 *
 * أخطر حاجة اتغطّت هنا: **الصفّارة دي مالهاش دعوة بصفّارة السيارة المطلوبة**.
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

describe("صفّارة الرسالة — مستقلة عن إنذار السيارة المطلوبة", () => {
  let restore = () => {};
  beforeEach(() => { restore = installFakeAudio(); });
  afterEach(() => { stopNoticeSiren(); stopAlertSiren(); restore(); });

  it("صفّارة الرسالة **مابتقطعش** إنذار السيارة المطلوبة", () => {
    startAlertSiren();
    expect(isAlertSirenPlaying()).toBe(true);
    startNoticeSiren();
    expect(isAlertSirenPlaying()).toBe(true);   // لسه شغّال — ده أهم شرط
    expect(isNoticeSirenPlaying()).toBe(true);
  });

  it("وقف صفّارة الرسالة مابيوقفش إنذار السيارة", () => {
    startAlertSiren();
    startNoticeSiren();
    stopNoticeSiren();
    expect(isNoticeSirenPlaying()).toBe(false);
    expect(isAlertSirenPlaying()).toBe(true);
  });

  it("تشغيلها وهي شغّالة مابيعملش صفّارة فوق صفّارة", () => {
    startNoticeSiren();
    expect(() => startNoticeSiren()).not.toThrow();
    expect(isNoticeSirenPlaying()).toBe(true);
    stopNoticeSiren();
    expect(isNoticeSirenPlaying()).toBe(false);
  });

  it("الوقف وهي مش شغّالة مايرميش خطأ", () => {
    expect(() => stopNoticeSiren()).not.toThrow();
    expect(isNoticeSirenPlaying()).toBe(false);
  });
});

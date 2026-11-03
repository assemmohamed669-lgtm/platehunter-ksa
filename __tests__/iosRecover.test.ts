/**
 * 📱 الآيفون: التسجيل يكمّل بعد قطع الصوت القصير، ويرجع لوحده لما المندوب يرجع للبرنامج (المالك ٣ نوفمبر ٢٠٢٦ — احمد حماده حسن
 * وعادل عطية: «لما يرجع تاني … المفروض اللوحات اللي بيقولها تظهرله وبالاخص في الايفون» · «المهم ميأثروش عليهم ولا يخرب حاجه»).
 *
 * الدليل (الصندوق الخفيف): «interrupted» بيقفل التسجيل على طول وهو جوّه البرنامج (احمد ٦ مرات في يومين، عادل ٣ الصبح —
 * مرتين بعد ٨ دقايق بالظبط)، والرجوع من واتساب/المكالمة مابيكمّلش لوحده، وطلب «سيب الشاشة صاحية» بيترفض ٣٥٪ من «ابدأ».
 * و«suspended» على نفس الموبايلات رجع لوحده في عُشر ثانية (#503) ⇒ الآيفون بيسمح بالرجوع من غير لمسة.
 *
 * **للاتنين دول بس وعلى الآيفون بس** (`IOS_RECOVER_IDS`) — أي حد تاني: ولا سطر اتغيّر. وأسوأ حالة = وقف زي النهارده.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MicLossDetector, MUTED_MS } from "@/lib/micLoss";
import {
  AUTO_RESUME_WINDOW_MS, IOS_RECOVER_IDS, IOS_RECOVER_MIC_GRACE_MS, autoResumeMark, iosRecoverFor, shouldAutoResume,
} from "@/lib/iosRecover";
import { DIAG_AGENT_IDS } from "@/lib/deviceDiag";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const ENGINE = read("lib/voicexEngine.ts");
const VP = read("app/(app)/registration-v2/page.tsx");
const IC = read("app/(app)/instant-check/page.tsx");
const AHMED = "a32ad070-d248-4308-b6d2-64dba81b2b96";
const ADEL = "b6c7d5a7-e967-4d80-9265-3b1a42795c9e";

describe("مين", () => {
  it("احمد حماده حسن وعادل عطية بس — وعلى الآيفون بس", () => {
    expect(IOS_RECOVER_IDS).toEqual([AHMED, ADEL]);
    expect(iosRecoverFor(AHMED, "ios")).toBe(true);
    expect(iosRecoverFor(ADEL, "ios")).toBe(true);
    expect(iosRecoverFor(AHMED, "android")).toBe(false);
    expect(iosRecoverFor("11111111-1111-4111-8111-111111111111", "ios")).toBe(false);
    expect(iosRecoverFor(null, "ios")).toBe(false);
  });
  it("الاتنين على الصندوق الكامل + مراقبة Voice PRO (عشان نقيس النتيجة)", () => {
    expect(DIAG_AGENT_IDS).toEqual(expect.arrayContaining([AHMED, ADEL]));
  });
});

describe("قطع الصوت القصير (`interrupted` / كتم المايك) — مهلة بدل الوقف", () => {
  it("من غير المهلة: زي النهارده بالحرف (interrupted على طول، والكتم بعد ١٫٥ث)", () => {
    const d = new MicLossDetector(16000);
    expect(d.contextState("interrupted", 0)).toBe("interrupted");
    const m = new MicLossDetector(16000);
    m.trackMuted(0);
    expect(m.tick(MUTED_MS)).toBe("muted");
  });

  it("بالمهلة: الصوت رجع قبل ما تخلص ⇒ التسجيل مكمّل", () => {
    const d = new MicLossDetector(16000, { interruptGraceMs: 8000, mutedGraceMs: 8000 });
    expect(d.contextState("interrupted", 0)).toBeNull();
    d.trackMuted(0);
    expect(d.paused()).toBe(true);
    expect(d.tick(5000)).toBeNull();
    d.trackUnmuted();
    expect(d.contextState("running", 5000)).toBeNull();
    expect(d.paused()).toBe(false);
    expect(d.tick(20000)).toBeNull();
  });

  it("بالمهلة: الصوت مارجعش (مكالمة) ⇒ يقف بعد المهلة زي النهارده", () => {
    const d = new MicLossDetector(16000, { interruptGraceMs: 8000, mutedGraceMs: 8000 });
    d.contextState("interrupted", 0);
    expect(d.tick(7999)).toBeNull();
    expect(d.tick(8000)).toBe("interrupted");
    const m = new MicLossDetector(16000, { interruptGraceMs: 8000, mutedGraceMs: 8000 });
    m.trackMuted(0);
    expect(m.tick(7999)).toBeNull();
    expect(m.tick(8000)).toBe("muted");
  });

  it("المايك اتقفل خالص (ended) ⇒ يقف على طول زي النهارده", () => {
    const d = new MicLossDetector(16000, { interruptGraceMs: 8000, mutedGraceMs: 8000 });
    expect(d.trackEnded()).toBe("ended");
  });

  it("المهلة ثواني مش دقايق", () => {
    expect(IOS_RECOVER_MIC_GRACE_MS).toBeGreaterThanOrEqual(5000);
    expect(IOS_RECOVER_MIC_GRACE_MS).toBeLessThanOrEqual(10000);
  });
});

describe("يرجع لوحده لما المندوب يرجع للبرنامج", () => {
  it("بس بعد وقف تلقائي (خرج/الصوت اتقطع/المايك اتكتم أو اتقفل) — مش «وقف» بإيده ولا المطلوبة ولا السيرفر", () => {
    for (const why of ["background", "interrupted", "muted", "ended"]) expect(autoResumeMark(why, 1000)).toEqual({ why, at: 1000 });
    for (const why of ["manual", "wanted", "fatal"]) expect(autoResumeMark(why, 1000)).toBeNull();
  });

  it("رجع قدام الشاشة، خلال ١٠ دقايق، ومفيش تسجيل شغّال أو بيبدأ", () => {
    const m = { why: "background", at: 0 };
    expect(shouldAutoResume(m, 60_000, false, true)).toBe(true);
    expect(shouldAutoResume(m, 60_000, false, false)).toBe(false);   // لسه في الخلفية
    expect(shouldAutoResume(m, 60_000, true, true)).toBe(false);     // شغّال أو بيبدأ
    expect(shouldAutoResume(m, AUTO_RESUME_WINDOW_MS + 1, false, true)).toBe(false);   // من زمان
    expect(shouldAutoResume(null, 60_000, false, true)).toBe(false);
    expect(AUTO_RESUME_WINDOW_MS).toBe(10 * 60_000);
  });
});

describe("التوصيل", () => {
  it("المحرّك: المهلة بالعلم بس — ومن غيره نفس الكاشف بالحرف", () => {
    expect(ENGINE).toMatch(/micGraceMs\?: number;/);
    expect(ENGINE).toMatch(/new MicLossDetector\(mic\.sampleRate, MIC_GRACE \? \{ interruptGraceMs: MIC_GRACE, mutedGraceMs: MIC_GRACE \} : undefined\)/);
    expect(ENGINE).toMatch(/if \(st === "suspended" \|\| \(MIC_GRACE && st === "interrupted"\)\) mic\.resumeContext\(\);/);
  });

  it("Voice PRO: المهلة + علامة الرجوع + الرجوع التلقائي + الشاشة صاحية — كلهم ورا `iosRecoverFor`", () => {
    expect(VP).toMatch(/\.\.\.\(iosRecoverFor\(agentRef\.current, getDevicePlatform\(\)\) \? \{ micGraceMs: IOS_RECOVER_MIC_GRACE_MS \} : \{\}\),/);
    expect(VP).toMatch(/autoResumeRef\.current = iosRecoverFor\(agentRef\.current, getDevicePlatform\(\)\) \? autoResumeMark\(why, Date\.now\(\)\) : null;/);
    expect(VP).toMatch(/void startRef\.current\(true\);/);
    expect(VP).toMatch(/const retryWake = iosRecoverFor\(agentRef\.current, getDevicePlatform\(\)\);/);
  });

  it("الرجوع التلقائي لو فشل ⇒ رسالة «دوس ابدأ» مش غلط أحمر", () => {
    expect(VP).toMatch(/if \(auto && reason === "mic_denied"\) return;/);
    expect(VP).toMatch(/if \(auto\) setNotice\(AUTO_RESUME_FAILED_TEXT\); else setError\("مش قادر يفتح الميكروفون — اسمح بالتسجيل وجرّب تاني\."\);/);
  });

  it("«صوتي» (التشييك) مالمسناهاش", () => {
    expect(IC).not.toMatch(/micGraceMs|iosRecover/);
  });
});

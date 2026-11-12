/**
 * 📞 أندرويد: التسجيل يكمّل لوحده بعد المكالمة (١٢ نوفمبر ٢٠٢٦) — حامد محمد 1 + السوبر أدمن الأول.
 *
 * المالك: «البرنامج بيفصل معاه والصوت اوقات كتير مش بيستجيب … وايه الحل» ⇒ «اعمل 1 و 2».
 * الصندوق الخفيف (٢٦ ساعة): وقف لوحده ٤ مرات وكلهم مكالمات (كاشف المكالمة في 1.8)، والتسجيل فضل واقف لحد ما رجع وداس
 * «ابدأ» بعد ٤ د / ٢٢ د / ٣٣ د / ~٣ س. ⇒ أول ما يرجع للبرنامج بعد المكالمة ⇒ عدّ ٣ ثواني بزرار «لأ» (يمكن رجع والمكالمة
 * لسه شغّالة — «المكالمة ليها الأولوية» قرار ٢٣ سبتمبر) وبعدين «ابدأ» لوحده.
 *
 * أي حد تاني (ومنهم الآيفون): ولا سطر اتغيّر — المكالمة بتقفل الميك زي الأول بالحرف.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALL_RESUME_DELAY_MS, CALL_RESUME_IDS, CALL_RESUME_RETRY_GUARD_MS, CALL_RESUME_WHY, CALL_RESUME_WINDOW_MS,
  callResumeFor, callResumeMark,
} from "@/lib/callResume";
import { AUTO_RESUME_WINDOW_MS, shouldAutoResume } from "@/lib/iosRecover";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const VP = read("app/(app)/registration-v2/page.tsx");
const IC = read("app/(app)/instant-check/page.tsx");
const HAMED = "7009368e-6052-4011-a12c-83bd17ad44ee";
const OTHER = "11111111-1111-4111-8111-111111111111";

describe("مين", () => {
  it("حامد محمد 1 بس في القايمة", () => {
    expect(CALL_RESUME_IDS).toEqual([HAMED]);
  });

  it("حامد + السوبر أدمن — على الأندرويد بس", () => {
    expect(callResumeFor(HAMED, false, "android")).toBe(true);
    expect(callResumeFor(OTHER, true, "android")).toBe(true);    // السوبر أدمن
    expect(callResumeFor(null, true, "android")).toBe(true);
    expect(callResumeFor(OTHER, false, "android")).toBe(false);  // باقي المناديب: زي الأول
    expect(callResumeFor(HAMED, false, "ios")).toBe(false);      // الآيفون ليه `iosRecover` لوحده
    expect(callResumeFor(OTHER, true, "ios")).toBe(false);
    expect(callResumeFor(HAMED, false, "web-android")).toBe(false);  // المتصفح: مفيش كاشف مكالمة أصلاً
    expect(callResumeFor(null, false, "android")).toBe(false);
  });
});

describe("العلامة", () => {
  it("مكالمة ⇒ علامة بمهلة ساعة (مكالماته كانت ٤–٣٣ دقيقة)", () => {
    expect(callResumeMark(5000, null)).toEqual({ why: CALL_RESUME_WHY, at: 5000, windowMs: CALL_RESUME_WINDOW_MS });
    expect(CALL_RESUME_WHY).toBe("call");
    expect(CALL_RESUME_WINDOW_MS).toBe(60 * 60_000);
  });

  it("المكالمة قفلت تسجيل لسه راجع لوحده من ثواني ⇒ المكالمة لسه شغّالة ⇒ مفيش محاولة تانية («ابدأ» بإيده)", () => {
    const back = 1_000_000;
    expect(callResumeMark(back + 4000, back)).toBeNull();
    expect(callResumeMark(back + CALL_RESUME_RETRY_GUARD_MS - 1, back)).toBeNull();
    expect(callResumeMark(back + CALL_RESUME_RETRY_GUARD_MS, back)).toEqual({
      why: CALL_RESUME_WHY, at: back + CALL_RESUME_RETRY_GUARD_MS, windowMs: CALL_RESUME_WINDOW_MS,
    });
    expect(CALL_RESUME_RETRY_GUARD_MS).toBeGreaterThan(5000);   // الكاشف بيقفل بعد ~٣–٤ث لو المكالمة لسه شغّالة
  });

  it("العدّ قبل ما يبدأ: ثواني قليلة", () => {
    expect(CALL_RESUME_DELAY_MS).toBeGreaterThanOrEqual(2000);
    expect(CALL_RESUME_DELAY_MS).toBeLessThanOrEqual(5000);
  });
});

describe("`shouldAutoResume` بمهلة العلامة", () => {
  it("علامة المكالمة: لحد ساعة", () => {
    const m = callResumeMark(0, null);
    expect(shouldAutoResume(m, 30 * 60_000, false, true)).toBe(true);
    expect(shouldAutoResume(m, CALL_RESUME_WINDOW_MS, false, true)).toBe(true);
    expect(shouldAutoResume(m, CALL_RESUME_WINDOW_MS + 1, false, true)).toBe(false);
    expect(shouldAutoResume(m, 60_000, false, false)).toBe(false);   // لسه برّه البرنامج (في المكالمة)
    expect(shouldAutoResume(m, 60_000, true, true)).toBe(false);     // شغّال أو بيبدأ
  });

  it("علامة الآيفون (من غير مهلة): ١٠ دقايق زي الأول بالحرف", () => {
    const m = { why: "background", at: 0 };
    expect(shouldAutoResume(m, AUTO_RESUME_WINDOW_MS, false, true)).toBe(true);
    expect(shouldAutoResume(m, AUTO_RESUME_WINDOW_MS + 1, false, true)).toBe(false);
  });
});

describe("التوصيل في Voice PRO", () => {
  it("📞 المكالمة لسه بتقفل الميك للكل (قرار ٢٣ سبتمبر) — والعلامة بعدها ورا `callResumeFor` بس", () => {
    expect(VP).toMatch(/const offCall = onNativeCall\(\(\) => \{\n\s+if \(!engineRef\.current\) return;\n\s+stopRef\.current\("background"\);\n/);
    expect(VP).toMatch(/if \(callResumeFor\(agentRef\.current, isSuperRef\.current, getDevicePlatform\(\)\)\) autoResumeRef\.current = callResumeMark\(Date\.now\(\), lastAutoStartRef\.current\);/);
  });

  it("الرجوع بعد المكالمة ⇒ عدّ تنازلي (مش «ابدأ» على طول) — والآيفون زي ما هو", () => {
    expect(VP).toMatch(/if \(autoResumeRef\.current\?\.why === CALL_RESUME_WHY\) \{ armCallResume\(\); return; \}/);
    expect(VP).toMatch(/setTimeout\(fireCallResume, CALL_RESUME_DELAY_MS\)/);
    // الآيفون: نفس السطور بالحرف
    expect(VP).toMatch(/autoResumeRef\.current = iosRecoverFor\(agentRef\.current, getDevicePlatform\(\)\) \? autoResumeMark\(why, Date\.now\(\)\) : null;/);
    expect(VP).toMatch(/diagNote\("rv2-auto", \{ why \}\);\n\s+void startRef\.current\(true\);/);
  });

  it("لما العدّ يخلص: لسه قدام الشاشة ومفيش تسجيل ⇒ «ابدأ» لوحده ويتسجّل في الصندوق", () => {
    expect(VP).toMatch(/diagNote\("rv2-auto", \{ why: CALL_RESUME_WHY \}\);\n\s+lastAutoStartRef\.current = Date\.now\(\);\n\s+void startRef\.current\(true\);/);
  });

  it("خرج من البرنامج وهو بيعدّ ⇒ العدّ يتلغي والعلامة تفضل (يكمّل لما يرجع)", () => {
    expect(VP).toMatch(/const pauseCallResume = \(\) => \{/);
    expect(VP).toMatch(/if \(document\.visibilityState === "visible"\) later\(\); else pauseCallResume\(\);/);
    expect(VP).toMatch(/const offApp = onAppState\(\(active\) => \{ if \(active\) later\(\); else pauseCallResume\(\); \}\);/);
  });

  it("زرار «لأ» بيلغي الرجوع خالص — ورسالة «وقف لوحده» مستخبية وهو بيعدّ بس", () => {
    expect(VP).toMatch(/\{callResumeArmed && !listening && \(/);
    expect(VP).toMatch(/onClick=\{cancelCallResume\}/);
    expect(VP).toMatch(/\{notice && !listening && !callResumeArmed && \(/);
  });

  it("«صوتي» (التشييك) مالمسناهاش", () => {
    expect(IC).not.toMatch(/callResume/);
  });
});

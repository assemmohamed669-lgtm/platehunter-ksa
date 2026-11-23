/**
 * 🍏🔊 + 🔁 الربط في Voice PRO (المالك ٢٣ نوفمبر ٢٠٢٦: «يلا» + «وانشر للكل»).
 *  · الآيفون برّه + مطلوبة ⇒ النغمة بعنصر صوت عادي **لحظة التنبيه بس**؛ شغّالة فعلاً ⇒ المايك يقف (مفيش توطية) وبلجن الخلفية
 *    يفضل ممسوك لحد «تم»؛ ماشتغلتش ⇒ زي قبل كده بالحرف (المايك يفضل).
 *  · الإشعار بيتكرّر كل ٥ث (اهتزاز) لحد «تم»/الرجوع — الاتنين.
 *  · كله بيقف مع «تم» / الرجوع / أي بداية / قفل الصفحة.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const VP = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("Voice PRO ⇐ lib/iosBgTone.ts + PushRepeater", () => {
  it("🍏 النغمة لحظة التنبيه بس، ولو اشتغلت فعلاً ⇒ المايك يقف والبلجن يتمسك", () => {
    expect(VP).toMatch(/if \(bgPlan\.keepMic && iosBgToneFor\(plat\)\) void ringBgTone\(\);/);
    expect(VP).toMatch(/const ok = await bgToneRef\.current\.ring\(bgToneFile\(loadAlertToneId\(\)\)\);/);
    expect(VP).toMatch(/if \(!ok\) return;\s*if \(!micHeldForWantedRef\.current \|\| !engineRef\.current \|\| !pausedForWantedRef\.current\) \{ bgToneRef\.current\.stop\(\); return; \}\s*micHeldForWantedRef\.current = false;\s*wantedBgRef\.current = \{ \.\.\.bgPlan, holdService: true \};\s*stopRef\.current\("wanted"\);/);
  });

  it("🔁 الإشعار بيتكرّر لحد «تم» أو الرجوع", () => {
    expect(VP).toMatch(/pushRepeatRef\.current\.start\(\(n\) => sendWantedSelfPush\(plate, info, n\), \(\) => pageVisibility\(\) === "hidden" && isAlertSirenPlaying\(\)\);/);
  });

  it("«تم» / الرجوع / أي بداية / قفل الصفحة ⇒ النغمة والتكرار يقفوا", () => {
    // «تم»
    expect(VP).toMatch(/onWantedAlertsCleared\(\(\) => \{\s*bgToneRef\.current\.stop\(\); pushRepeatRef\.current\.stop\(\);/);
    // الرجوع للبرنامج (الصفّارة العادية بتكمّل — المايك واقف)
    expect(VP).toMatch(/const back = \(\) => \{\s*if \(pageVisibility\(\) === "hidden"\) return;\s*bgToneRef\.current\.stop\(\); pushRepeatRef\.current\.stop\(\);/);
    // أي بداية
    expect(VP).toMatch(/bgHoldRef\.current\.release\(\); micHeldForWantedRef\.current = false; bgToneRef\.current\.stop\(\); pushRepeatRef\.current\.stop\(\);/);
    // قفل الصفحة
    expect(VP).toMatch(/offCall\(\);\s*bgHoldRef\.current\.release\(\); bgToneRef\.current\.stop\(\); pushRepeatRef\.current\.stop\(\);/);
  });

  it("🩺 الصندوق: النغمة اشتغلت؟ ولسه شغّالة بعد ما المايك وقف؟", () => {
    expect(VP).toMatch(/diagNote\("rv2-bg-tone", \{ ok/);
    expect(VP).toMatch(/diagNote\("rv2-bg-tone", \{ at: "2s"/);
  });
});

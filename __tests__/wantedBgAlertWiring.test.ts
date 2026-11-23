/**
 * 🚨 الربط في Voice PRO — العربية المطلوبة والمندوب برّه البرنامج (`lib/wantedBgAlert.ts`، المالك ٢٣ نوفمبر ٢٠٢٦).
 * المنطق في `__tests__/wantedBgAlert.test.ts`؛ هنا: القرار بيتاخد من حالة التطبيق نفسه، الإشعار بيتبعت، أندرويد بيمسك
 * الخدمة لحد «تم»، الآيفون بيسيب المايك لحد ما يرجع، وكل حاجة بتتساب مع أي بداية/«تم»/قفل الصفحة.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const VP = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8");

describe("Voice PRO ⇐ lib/wantedBgAlert.ts", () => {
  it("القرار من حالة التطبيق نفسه (أندرويد 1.8 بيقول للصفحة إنها ظاهرة) + خدمة الخلفية + السوبر أدمن", () => {
    expect(VP).toMatch(/wantedBgPlan\(\{ platform: getDevicePlatform\(\), inBackground: pageVisibility\(\) === "hidden", bgActive: bgActiveRef\.current, enabled: wantedBgAlertFor\(isSuperRef\.current\) \}\)/);
  });

  it("🔔 الإشعار لموبايله باللوحة وبيانات العربية", () => {
    expect(VP).toMatch(/if \(bgPlan\.push\) sendWantedSelfPush\(plate, info\);/);
    expect(VP).toMatch(/await postWantedSelfPush\(plate, info, at\)/);
  });

  it("🍏 الآيفون برّه ⇒ المايك مايقفش دلوقتي — وإلا زي الأول بالحرف", () => {
    expect(VP).toMatch(/if \(bgPlan\.keepMic\) micHeldForWantedRef\.current = true;\s*\/\/[^\n]*\n\s*else setTimeout\(\(\) => \{ if \(engineRef\.current && pausedForWantedRef\.current\) stopRef\.current\("wanted"\); \}, 0\);/);
  });

  it("🍏 رجع للبرنامج ⇒ المايك يقف (الصفّارة بصوتها الكامل لحد «تم»)", () => {
    expect(VP).toMatch(/if \(!micHeldForWantedRef\.current \|\| pageVisibility\(\) === "hidden"\) return;\s*micHeldForWantedRef\.current = false;\s*if \(engineRef\.current && pausedForWantedRef\.current\) stopRef\.current\("wanted"\);/);
  });

  it("🤖 أندرويد برّه ⇒ الخدمة ماتتقفلش مع وقف المايك", () => {
    expect(VP).toMatch(/if \(why === "wanted" && bgActiveRef\.current && wantedBgRef\.current\?\.holdService\) \{ bgActiveRef\.current = false; bgHoldRef\.current\.hold\(\); \}\s*\n\s*if \(bgActiveRef\.current\) \{ bgActiveRef\.current = false; stopBackgroundRecording\(\); \}/);
  });

  it("أي بداية جديدة ⇒ الخدمة الممسوكة تتساب والمايك مش متساب", () => {
    expect(VP).toMatch(/pausedForWantedRef\.current = false;\s*\n\s*\/\/[^\n]*\n\s*bgHoldRef\.current\.release\(\); micHeldForWantedRef\.current = false;/);
  });

  it("«تم» من غير رجوع التسجيل + قفل الصفحة ⇒ الخدمة تتساب", () => {
    expect(VP).toMatch(/if \(micHeldForWantedRef\.current\) \{ micHeldForWantedRef\.current = false; pausedForWantedRef\.current = false; \}\s*\n\s*if \(!pausedForWantedRef\.current \|\| engineRef\.current \|\| startingRef\.current\) \{ bgHoldRef\.current\.release\(\); return; \}/);
    expect(VP).toMatch(/offCall\(\);\s*\n\s*bgHoldRef\.current\.release\(\);/);
  });
});

/**
 * 🎙️ التسجيل والتشييك يفضلوا شغّالين والمندوب في واتساب/الخريطة (المالك ٢٤ أكتوبر ٢٠٢٦) — الربط في الصفحتين + أندرويد.
 * المنطق نفسه في `lib/backgroundRecording.test.ts`. هنا: الخدمة بتبدأ مع التسجيل وبتقف معاه، Voice PRO مابيقفلش لما
 * يروح الخلفية **طول ما الخدمة شغّالة** (ومن غيرها زي الأول بالحرف)، والمكالمة لسه بتقفل الميك.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const VP = read("app/(app)/registration-v2/page.tsx");
const MJ = read("components/mujammaa/pages/BatchPage.tsx");
const REG = read("app/(app)/registration/page.tsx");
const SECTION = read("components/mujammaa/MujammaaSection.tsx");
const MANIFEST = read("android/app/src/main/AndroidManifest.xml");
const MAIN = read("android/app/src/main/java/com/platehunter/ksa/MainActivity.java");
const SERVICE = read("android/app/src/main/java/com/platehunter/ksa/BackgroundRecordingService.java");

describe("Voice PRO", () => {
  it("الخدمة بتبدأ مع المحرّك وبتقف مع «إيقاف»", () => {
    expect(VP).toMatch(/engineRef\.current = ctrl; clockRef\.current = ctrl;\s*setListening\(true\); setSeconds\(0\);[\s\S]{0,200}?bgActiveRef\.current = canRecordInBackground\(isSuperRef\.current\) && startBackgroundRecording\(\);/);
    expect(VP).toMatch(/engineRef\.current = null; stopTimer\(\);[^\n]*\n\s*if \(bgActiveRef\.current\) \{ bgActiveRef\.current = false; stopBackgroundRecording\(\); \}/);
  });

  it("الخلفية مابتقفلش والخدمة شغّالة — ومن غيرها زي الأول", () => {
    expect(VP).toMatch(/document\.visibilityState === "hidden" && engineRef\.current && !bgActiveRef\.current\) stopRef\.current\("background"\)/);
    expect(VP).toMatch(/const onHide = \(\) => \{ if \(engineRef\.current && !bgActiveRef\.current\) stopRef\.current\("background"\); \};/);
  });

  it("📞 المكالمة لسه بتقفل الميك (قرار المالك ٢٣ سبتمبر)", () => {
    expect(VP).toMatch(/const offCall = onNativeCall\(\(\) => \{ if \(engineRef\.current\) stopRef\.current\("background"\); \}\);/);
  });
});

describe("التسجيل (المجمّع)", () => {
  it("الخدمة بتبدأ مع التسجيل وبتقف مع «إيقاف» ومع الخروج من الصفحة", () => {
    expect(MJ).toMatch(/bgActiveRef\.current = canRecordInBackground\(bgAllowed\) && startBackgroundRecording\(\);/);
    expect(MJ.match(/if \(bgActiveRef\.current\) \{ bgActiveRef\.current = false; stopBackgroundRecording\(\); \}/g)?.length).toBe(2);
  });

  it("السوبر أدمن الأول", () => {
    expect(REG).toMatch(/bgAllowed=\{superOk\}/);
    expect(SECTION).toMatch(/bgAllowed=\{bgAllowed\}/);
  });
});

describe("أندرويد 1.8 (build 8)", () => {
  it("الخدمة متسجّلة بنوعها (ميك + موقع) والصلاحيات", () => {
    expect(MANIFEST).toMatch(/android:name="\.BackgroundRecordingService"[\s\S]*?android:foregroundServiceType="microphone\|location"/);
    for (const perm of ["FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MICROPHONE", "FOREGROUND_SERVICE_LOCATION", "WAKE_LOCK"]) {
      expect(MANIFEST).toContain(`android.permission.${perm}"`);
    }
  });

  it("الجسر `PlateHunterBg` + الصفحة تفضل شغّالة في الخلفية بس والخدمة شغّالة", () => {
    expect(MAIN).toMatch(/addJavascriptInterface\(new BgBridge\(\), "PlateHunterBg"\)/);
    expect(MAIN).toMatch(/private void keepWebViewRunning\(\) \{\s*if \(!BackgroundRecordingService\.running\) return;/);
    expect(MAIN).toMatch(/wv\.dispatchWindowVisibilityChanged\(View\.VISIBLE\);/);
  });

  it("📞 المكالمة: وضع الصوت (رنّة/مكالمة/اتصال مش بتاعنا) ⇒ حدث للصفحة", () => {
    expect(SERVICE).toMatch(/m == AudioManager\.MODE_RINGTONE\s*\|\| m == AudioManager\.MODE_IN_CALL\s*\|\| \(m == AudioManager\.MODE_IN_COMMUNICATION && baselineMode != AudioManager\.MODE_IN_COMMUNICATION\)/);
    expect(MAIN).toMatch(/new CustomEvent\('phNativeCall'\)/);
  });
});

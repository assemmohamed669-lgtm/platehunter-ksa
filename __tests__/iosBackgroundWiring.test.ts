/**
 * 🍏 نسخة الآيفون 1.4 (build 10): الصوت والموقع يكمّلوا والمندوب برّه البرنامج (المالك ٤ نوفمبر ٢٠٢٦). الكود الأصلي
 * مايتبنيش هنا (ويندوز) — فالاختبار ده بيتأكد إن كل حتة في مكانها قبل ما المالك يبني على الماك.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const PLIST = read("ios/App/App/Info.plist");
const SWIFT = read("ios/App/App/AppDelegate.swift");
const BOARD = read("ios/App/App/Base.lproj/Main.storyboard");
const PBX = read("ios/App/App.xcodeproj/project.pbxproj");
const MJ = read("components/mujammaa/pages/BatchPage.tsx");
const REG = read("app/(app)/registration/page.tsx");
const SECTION = read("components/mujammaa/MujammaaSection.tsx");

describe("Info.plist", () => {
  it("الصوت + الموقع في الخلفية (والإشعارات زي ما هي)", () => {
    const modes = PLIST.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? "";
    for (const m of ["remote-notification", "audio", "location"]) expect(modes).toContain(`<string>${m}</string>`);
  });

  it("رسايل الإذن بتقول إن الصوت والموقع بيكمّلوا لو خرج من البرنامج (أبل بتطلب الغرض واضح)", () => {
    for (const k of ["NSMicrophoneUsageDescription", "NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription"]) {
      const v = PLIST.match(new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`))?.[1] ?? "";
      expect(v).toMatch(/خرجت من التطبيق/);
    }
  });
});

describe("الشاشة الرئيسية + البلجن", () => {
  it("الشاشة الرئيسية بقت `MainViewController` (اللي بيسجّل البلجن) — من موديول التطبيق", () => {
    expect(BOARD).toMatch(/customClass="MainViewController" customModule="App" customModuleProvider="target"/);
    expect(SWIFT).toMatch(/class MainViewController: CAPBridgeViewController \{/);
    expect(SWIFT).toMatch(/override open func capacitorDidLoad\(\) \{\s*bridge\?\.registerPluginInstance\(bgPlugin\)/);
  });

  it("البلجن «PlateHunterBackground»: start/stop", () => {
    expect(SWIFT).toMatch(/public class PlateHunterBgPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate/);
    expect(SWIFT).toContain('public let jsName = "PlateHunterBackground"');
    expect(SWIFT).toContain('CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)');
    expect(SWIFT).toContain('CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)');
  });

  it("📍 الموقع في الخلفية — بس لو الإذن موجود و«location» في Info.plist (من غيرها الآيفون بيقفل البرنامج)", () => {
    expect(SWIFT).toMatch(/guard modes\.contains\("location"\) else \{ return \}[\s\S]*?allowsBackgroundLocationUpdates = true/);
    expect(SWIFT).toMatch(/guard status == \.authorizedWhenInUse \|\| status == \.authorizedAlways else \{ return \}/);
    expect(SWIFT).toContain("m.showsBackgroundLocationIndicator = true");
    expect(SWIFT).toContain("m.pausesLocationUpdatesAutomatically = false");
    expect(SWIFT).toMatch(/notifyListeners\("location", data: \[/);
  });

  it("📞 مكالمة قطعت الصوت ⇒ «call» للصفحة (المكالمة ليها الأولوية)", () => {
    expect(SWIFT).toContain("AVAudioSession.interruptionNotification");
    expect(SWIFT).toMatch(/AVAudioSession\.InterruptionType\(rawValue: raw\) == \.began/);
    expect(SWIFT).toMatch(/notifyListeners\("call", data: \[:\]\)/);
  });

  it("🛟 الموقع مايفضلش شغّال لوحده: الصفحة اتعاد تحميلها ⇒ يقف · وأقصى ٦ ساعات", () => {
    expect(SWIFT).toMatch(/observe\(\\\.isLoading[\s\S]*?bgPlugin\.stopAll\(\)/);
    expect(SWIFT).toMatch(/withTimeInterval: 6 \* 60 \* 60/);
  });
});

describe("نسخة 1.4 (build 10)", () => {
  it("الرقم اتغيّر في الإعدادين (Debug/Release)", () => {
    expect(PBX.match(/MARKETING_VERSION = 1\.4;/g)?.length).toBe(2);
    expect(PBX.match(/CURRENT_PROJECT_VERSION = 10;/g)?.length).toBe(2);
    expect(PBX).not.toMatch(/MARKETING_VERSION = 1\.3;/);
  });
});

describe("التسجيل (المجمّع): حساب مراجعين أبل بيشتغل عنده كمان", () => {
  it("الإيميل بيوصل لحد `canRecordInBackground`", () => {
    expect(MJ).toMatch(/bgActiveRef\.current = canRecordInBackground\(bgAllowed, bgEmail\) && startBackgroundRecording\(\);/);
    expect(SECTION).toMatch(/bgEmail=\{bgEmail\}/);
    expect(REG).toMatch(/bgAllowed=\{superOk\}\s*bgEmail=\{agentEmail\}/);
  });
});

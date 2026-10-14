import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nativeShowsForegroundPush, NATIVE_FOREGROUND_BUILD_IOS } from "@/lib/foregroundPush";

/**
 * 🍏🔔 إشعارات الآيفون — المالك (١٤ أكتوبر ٢٠٢٦): «تعالي نعمل نسخه الماك دلوقتي علشان الاشعارات كمان توصل ل الايفون».
 *
 * نسخة الآيفون لحد 1.2 (build 8) **مافيهاش مكتبة الإشعارات خالص** (`CapApp-SPM/Package.swift` كان من غير
 * `CapacitorPushNotifications`). والسيرفر بيبعت عن طريق Firebase (FCM — `lib/fcm.ts`) للنظامين، والآيفون بيدّي
 * توكن Apple (APNs) مش توكن Firebase ⇒ `AppDelegate` بيحوّله لتوكن Firebase (طريقة Capacitor الرسمية). كده السيرفر
 * مايتغيّرش، وأي إشعار (الشهايد · «لقى سيارة مطلوبة») يوصل للآيفون زي أندرويد بالظبط.
 */
const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const PBX = read("ios/App/App.xcodeproj/project.pbxproj");

describe("🔴 مكتبة الإشعارات + Firebase جوّه نسخة الآيفون", () => {
  it("بلجن الإشعارات بتاع Capacitor متضاف لحزمة الآيفون", () => {
    const pkg = read("ios/App/CapApp-SPM/Package.swift");
    expect(pkg).toMatch(/\.package\(name: "CapacitorPushNotifications", path: "\.\.\/\.\.\/\.\.\/node_modules\/@capacitor\/push-notifications"\)/);
    expect(pkg).toMatch(/\.product\(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"\)/);
  });
  it("Firebase Messaging متضاف للتطبيق نفسه (مش للحزمة اللي `cap sync` بيعيد كتابتها)", () => {
    expect(PBX).toMatch(/repositoryURL = "https:\/\/github\.com\/firebase\/firebase-ios-sdk";/);
    expect(PBX).toMatch(/productName = FirebaseMessaging;/);
    expect(PBX).toMatch(/\/\* FirebaseMessaging in Frameworks \*\//);
    const target = PBX.slice(PBX.indexOf("packageProductDependencies = ("), PBX.indexOf("productName = App;"));
    expect(target).toMatch(/\/\* FirebaseMessaging \*\//);
  });
  it("صلاحية الإشعارات (aps-environment) في النسختين Debug وRelease", () => {
    expect(read("ios/App/App/App.entitlements")).toMatch(/<key>aps-environment<\/key>\s*<string>development<\/string>/);
    expect(PBX.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)?.length).toBe(2);
  });
  it("الإشعار يوصل والتطبيق في الخلفية (remote-notification)", () => {
    expect(read("ios/App/App/Info.plist")).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>remote-notification<\/string>/);
  });
  it("ملف Firebase بتاع الآيفون جوّه التطبيق، ومش على GitHub (زي google-services.json)", () => {
    expect(PBX).toMatch(/\/\* GoogleService-Info\.plist in Resources \*\//);
    expect(read(".gitignore")).toMatch(/^ios\/App\/App\/GoogleService-Info\.plist$/m);
  });
});

describe("🔴 AppDelegate بيحوّل توكن Apple لتوكن Firebase", () => {
  const app = read("ios/App/App/AppDelegate.swift");
  it("Firebase بيشتغل بس لو ملفه موجود (من غيره التطبيق كان هيقع)", () => {
    expect(app).toMatch(/import FirebaseCore/);
    expect(app).toMatch(/import FirebaseMessaging/);
    expect(app).toMatch(/if Bundle\.main\.path\(forResource: "GoogleService-Info", ofType: "plist"\) != nil \{\s*FirebaseApp\.configure\(\)/);
  });
  it("توكن Apple ⇒ Firebase ⇒ توكن Firebase للبلجن (اللي بيحفظه في device_tokens)", () => {
    expect(app).toMatch(/Messaging\.messaging\(\)\.apnsToken = deviceToken/);
    expect(app).toMatch(/Messaging\.messaging\(\)\.token \{/);
    expect(app).toMatch(/NotificationCenter\.default\.post\(name: \.capacitorDidRegisterForRemoteNotifications, object: token\)/);
    expect(app).toMatch(/didFailToRegisterForRemoteNotificationsWithError/);
  });
  it("🔒 من غير Firebase مابيبعتش توكن Apple الخام (كان هيتحفظ ويترفض من السيرفر)", () => {
    expect(app).not.toMatch(/object: deviceToken\)/);
  });
});

describe("🔴 رقم النسخة", () => {
  it("1.3 (build 9) — والإشعار والتطبيق مفتوح بيعرضه الآيفون بنفسه من build 9", () => {
    expect(PBX.match(/CURRENT_PROJECT_VERSION = 9;/g)?.length).toBe(2);
    expect(PBX.match(/MARKETING_VERSION = 1\.3;/g)?.length).toBe(2);
    expect(NATIVE_FOREGROUND_BUILD_IOS).toBe(9);
    expect(nativeShowsForegroundPush("9", "ios")).toBe(true);
    expect(nativeShowsForegroundPush("8", "ios")).toBe(false);
    // أندرويد زي ما هو (1.6 = build 7)
    expect(nativeShowsForegroundPush("7", "android")).toBe(true);
    expect(nativeShowsForegroundPush("7")).toBe(true);
    expect(nativeShowsForegroundPush("6", "android")).toBe(false);
  });
  it("PushRegistrar بيبعت النظام مع رقم النسخة", () => {
    expect(read("components/PushRegistrar.tsx")).toMatch(/nativeShowsForegroundPush\(\(await App\.getInfo\(\)\)\.build, Capacitor\.getPlatform\(\)\)/);
  });
});

describe("🔴 ملف مشروع Xcode سليم (اتعدّل بالإيد من ويندوز)", () => {
  it("كل معرّف مستخدم ليه تعريف", () => {
    const body = PBX.slice(PBX.indexOf("objects = {"));
    const defined = new Set([...body.matchAll(/^\t\t([0-9A-F]{24}) (?:\/\*[^*]*\*\/ )?= \{/gm)].map((m) => m[1]));
    const used = new Set([...body.matchAll(/\b([0-9A-F]{24})\b/g)].map((m) => m[1]));
    const missing = [...used].filter((id) => !defined.has(id));
    expect(missing).toEqual([]);
  });
  it("الأقواس متوازنة", () => {
    const opens = (PBX.match(/[{(]/g) ?? []).length;
    const closes = (PBX.match(/[})]/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe("🔴 سكربت البناء على الماك", () => {
  const sh = read("scripts/ios-release.sh");
  it("بيقف لو ملف Firebase ناقص — مايطلّعش نسخة من غير إشعارات", () => {
    expect(sh).toMatch(/GoogleService-Info\.plist/);
    expect(sh).toMatch(/exit 1/);
  });
  it("بينزّل إعداد الإشعارات وبيتأكد إن البلجن متسجّل قبل الأرشيف", () => {
    expect(sh).toMatch(/npx cap copy ios/);
    expect(sh).toMatch(/"presentationOptions"/);
    expect(sh).toMatch(/"PushNotificationsPlugin"/);
    expect(sh.indexOf("npx cap copy ios")).toBeLessThan(sh.indexOf("xcodebuild"));
  });
});

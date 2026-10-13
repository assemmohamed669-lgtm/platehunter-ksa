import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nativeShowsForegroundPush, NATIVE_FOREGROUND_BUILD } from "@/lib/foregroundPush";

/**
 * 🔔 المالك (١٣ أكتوبر ٢٠٢٦): «انا عايز الأشعار يظهر للمندوب حتي لو فاتح البرنامج علشان ينتبه».
 * أندرويد مابيحطّش إشعار FCM في شريط الإشعارات والتطبيق مفتوح — إلا لو بلجن الإشعارات متظبّط
 * `presentationOptions: ["alert"]`، وده إعداد جوّه ملف التطبيق (APK) ⇒ نسخة جديدة 1.6 (versionCode 7).
 * النسخة دي بتعرض الإشعار الحقيقي بنفسها، فالشريط اللي جوّه التطبيق (#431) بيفضل للنسخ القديمة بس عشان مايتكرّرش.
 */
describe("🔴 مين بيعرض الإشعار والتطبيق مفتوح", () => {
  it("نسخة 1.6 (build 7) وأحدث ⇒ أندرويد بيعرضه بنفسه في شريط الإشعارات", () => {
    expect(NATIVE_FOREGROUND_BUILD).toBe(7);
    expect(nativeShowsForegroundPush("7")).toBe(true);
    expect(nativeShowsForegroundPush("12")).toBe(true);
  });
  it("النسخ القديمة (1.5 وقبلها) أو لو مش عارفين ⇒ لأ (الشريط اللي جوّه التطبيق يفضل)", () => {
    expect(nativeShowsForegroundPush("6")).toBe(false);
    expect(nativeShowsForegroundPush("")).toBe(false);
    expect(nativeShowsForegroundPush(undefined)).toBe(false);
    expect(nativeShowsForegroundPush("abc")).toBe(false);
  });
});

describe("🔴 الإعداد في النسخة الجديدة", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("بلجن الإشعارات بيعرض الإشعار والتطبيق مفتوح (alert)", () => {
    expect(read("capacitor.config.ts")).toMatch(/PushNotifications: \{\s*presentationOptions: \[[^\]]*"alert"[^\]]*\]/);
  });
  it("versionCode 7 = نفس الرقم اللي الكود بيقارن بيه", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toMatch(new RegExp(`versionCode ${NATIVE_FOREGROUND_BUILD}\\b`));
    expect(gradle).toMatch(/versionName "1\.6"/);
  });
  it("PushRegistrar مابيعرضش الشريط لو النسخة بتعرض الإشعار بنفسها", () => {
    const r = read("components/PushRegistrar.tsx");
    expect(r).toMatch(/nativeShowsForegroundPush\(/);
    expect(r).toMatch(/if \(b && !nativeShown\) window\.dispatchEvent/);
  });
});

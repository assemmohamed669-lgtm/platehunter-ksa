/**
 * ربط الجهاز — قاعدتين اتكسروا في الإنتاج:
 *
 * ١) «إعادة ضبط الجهاز» كانت بتصفّر session_token لـNULL. و SessionGuard
 *    بيتجاهل الـNULL صراحةً (`profile.session_token &&`) — يعني الجلسة
 *    المفتوحة على الجهاز القديم **ماكانتش بتتقفل**. عكس الغرض من الزر:
 *    الحساب يفضل مفتوح على الجهاز القديم، وكمان بلا ربط فأول واحد يدخل
 *    بكلمة السر يستولي عليه.
 *
 * ٢) الشاشة كانت بتقرا device_fingerprint بس، فبتقول «لسه مادخلش» عن مندوب
 *    شغّال من ٢٨ يوم — لأن الريسِت مسح ربطه. اللافتة لازم تفرّق بين
 *    «مادخلش أبداً» و«اتعمله ريسِت».
 */
import { describe, it, expect } from "vitest";
import { resetDevicePatch, deviceBindingState } from "@/lib/deviceBinding";

describe("resetDevicePatch", () => {
  it("بيفكّ ربط الجهاز", () => {
    expect(resetDevicePatch("tok-1").device_fingerprint).toBeNull();
  });

  it("**بيحط توكن جلسة جديد مش NULL** — عشان الجهاز القديم يتقفل", () => {
    // دي القاعدة اللي الباج كسرها. NULL معناها الجلسة القديمة تفضل شغّالة.
    const patch = resetDevicePatch("tok-new");
    expect(patch.session_token).toBe("tok-new");
    expect(patch.session_token).not.toBeNull();
  });

  it("بيرفض توكن فاضي — مايسمحش نرجع لنفس الباج", () => {
    expect(() => resetDevicePatch("")).toThrow();
    expect(() => resetDevicePatch("   ")).toThrow();
  });
});

describe("deviceBindingState", () => {
  it("مرتبط: فيه بصمة", () => {
    expect(deviceBindingState("sig-abc", "2026-08-26T10:00:00Z")).toBe("bound");
  });

  it("مادخلش أبداً: مافيش بصمة ومافيش آخر ظهور", () => {
    expect(deviceBindingState(null, null)).toBe("never");
  });

  it("**اتعمله ريسِت**: مافيش بصمة لكن ظهر قبل كده", () => {
    // دي الحالة اللي كانت بتظهر غلط كـ«لسه مادخلش».
    expect(deviceBindingState(null, "2026-08-26T16:56:07Z")).toBe("reset");
  });

  it("بيتعامل مع النص الفاضي زي المفقود", () => {
    expect(deviceBindingState("", "2026-08-26T16:56:07Z")).toBe("reset");
    expect(deviceBindingState("   ", null)).toBe("never");
  });
});

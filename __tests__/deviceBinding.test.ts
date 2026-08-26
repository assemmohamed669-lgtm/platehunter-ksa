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
import { resetDevicePatch, deviceBindingState, canResetDevice } from "@/lib/deviceBinding";

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

describe("canResetDevice", () => {
  it("مسموح للمرتبط بجهاز — الحالة الأصلية", () => {
    expect(canResetDevice("sig-abc", "tok", "2026-08-26T10:00:00Z")).toBe(true);
  });

  it("**مسموح للي اتعمله ريسِت قبل كده** — مافيش بصمة لكنه ظهر", () => {
    // دي الحالة اللي كان الزر مقفول فيها بالغلط: ٦ مناديب بلا ربط وجلساتهم
    // شغّالة، والزر اللي بيحلّ مشكلتهم كان باهت.
    expect(canResetDevice(null, null, "2026-08-26T16:56:07Z")).toBe(true);
  });

  it("مسموح لو فيه توكن جلسة حتى بلا بصمة — فيه جلسة تتقفل", () => {
    expect(canResetDevice(null, "tok-1", null)).toBe(true);
  });

  it("**ممنوع** لحساب جديد مادخلش أبداً — مافيش حاجة تتعمل", () => {
    expect(canResetDevice(null, null, null)).toBe(false);
    expect(canResetDevice("", "", "")).toBe(false);
  });
});

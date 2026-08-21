/**
 * سجل الأمان: الأحداث المشبوهة بتتكتب في جدول عشان السوبر أدمن يشوفها.
 *
 * المشكلة الأساسية اللي المنطق ده بيحلّها: مهاجم بيضرب راوت ألف مرة في الدقيقة
 * = ألف صف في السجل. يبقى إحنا اللي عملنا هجوم على داتابيزنا بنفسنا، والسجل
 * يبقى بلا قيمة لأن الحدث المهم بيغرق في التكرار. فبنخنق التسجيل: نفس المفتاح
 * مايتسجّلش أكتر من مرة كل فترة، مع عدّاد للمحاولات اللي اتخنقت.
 */
import { describe, it, expect } from "vitest";
import { createLogThrottle, isKnownEventType, isClientReportable, SECURITY_EVENT_TYPES } from "@/lib/securityLog";

describe("createLogThrottle", () => {
  it("بيسمح بأول حدث لكل مفتاح", () => {
    const t = createLogThrottle(60_000);
    expect(t.allow("unauthorized:1.2.3.4", 1000)).toEqual({ log: true, suppressed: 0 });
  });

  it("بيخنق التكرار جوّه نفس الفترة", () => {
    const t = createLogThrottle(60_000);
    t.allow("k", 1000);
    expect(t.allow("k", 2000)).toEqual({ log: false, suppressed: 1 });
    expect(t.allow("k", 3000)).toEqual({ log: false, suppressed: 2 });
  });

  it("بيسمح تاني بعد ما الفترة تخلص، ومعاه عدد اللي اتخنق", () => {
    const t = createLogThrottle(60_000);
    t.allow("k", 1000);
    t.allow("k", 2000);
    t.allow("k", 3000);
    // بعد دقيقة: يتسجّل، ويقول إن ٢ اتخنقوا في الفترة اللي فاتت
    expect(t.allow("k", 62_000)).toEqual({ log: true, suppressed: 2 });
    // والعدّاد بيتصفّر بعد ما اتسجّل
    expect(t.allow("k", 63_000)).toEqual({ log: false, suppressed: 1 });
  });

  it("المفاتيح المختلفة مستقلة تماماً", () => {
    const t = createLogThrottle(60_000);
    expect(t.allow("a", 1000).log).toBe(true);
    expect(t.allow("b", 1000).log).toBe(true);
    expect(t.allow("a", 1500).log).toBe(false);
  });

  it("مايكبرش بلا حد — بينظّف المفاتيح القديمة", () => {
    const t = createLogThrottle(1000);
    for (let i = 0; i < 5000; i++) t.allow(`ip-${i}`, i);
    // مهاجم بيغيّر الـIP كل طلب مايقدرش يملّي ذاكرة السيرفر
    expect(t.size()).toBeLessThan(5000);
  });
});

describe("isKnownEventType", () => {
  it("بيقبل الأنواع المعروفة بس", () => {
    for (const t of SECURITY_EVENT_TYPES) expect(isKnownEventType(t)).toBe(true);
  });

  it("بيرفض أي نوع من برّه القايمة", () => {
    // العميل مايقدرش يكتب نوع من دماغه — عشان السجل يفضل قابل للفلترة.
    expect(isKnownEventType("anything_else")).toBe(false);
    expect(isKnownEventType("")).toBe(false);
    expect(isKnownEventType(null)).toBe(false);
    expect(isKnownEventType(123)).toBe(false);
  });

  it("فيه الأحداث اللي بتهمّنا فعلاً", () => {
    expect(SECURITY_EVENT_TYPES).toContain("api_unauthorized");
    expect(SECURITY_EVENT_TYPES).toContain("api_rate_limited");
    expect(SECURITY_EVENT_TYPES).toContain("login_device_mismatch");
    expect(SECURITY_EVENT_TYPES).toContain("login_account_disabled");
    expect(SECURITY_EVENT_TYPES).toContain("admin_action");
  });
});

describe("isClientReportable", () => {
  it("بيسمح بأحداث الدخول بس", () => {
    expect(isClientReportable("login_device_mismatch")).toBe(true);
    expect(isClientReportable("login_account_disabled")).toBe(true);
    expect(isClientReportable("login_cut_off")).toBe(true);
  });

  it("**بيرفض** أحداث السيرفر — عشان مندوب مايزوّرش سجل التدقيق", () => {
    // لو العميل قدر يبعت admin_action، أي مندوب يقدر يحشو السجل بصفوف
    // كاذبة تلبّس أدمن أو تغرق الأحداث الحقيقية.
    expect(isClientReportable("admin_action")).toBe(false);
    expect(isClientReportable("api_unauthorized")).toBe(false);
    expect(isClientReportable("api_rate_limited")).toBe(false);
  });

  it("بيرفض أي حاجة مش في القايمة", () => {
    expect(isClientReportable("whatever")).toBe(false);
    expect(isClientReportable(null)).toBe(false);
  });
});

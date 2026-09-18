import { describe, it, expect } from "vitest";
import { syncFailureMessage } from "@/lib/syncStatus";

/**
 * مندوب كان عنده **٥٨٨ سجل على تليفونه** و**١ بس** على السيرفر — وفضل شغّال
 * شهر وهو فاكر إن سجلاته واصلة للمسئول.
 *
 * السبب إن المزامنة التلقائية بتبلع أي فشل:
 *     pushPendingFieldChecks(uid).catch(() => {})
 * فلا المندوب ولا المسئول عندهم أي طريقة يعرفوا. الرسالة دي بتخلّي الفشل يبان.
 *
 * ⚠️ والشرط المهم: **مانخوّفش المندوب من غير سبب**. أوفلاين مؤقت أو نجاح
 * كامل مايطلّعوش أي تحذير — ده شغله اليومي وبيقطع نت كتير.
 */
describe("syncFailureMessage", () => {
  it("نجاح كامل = مافيش رسالة", () => {
    expect(syncFailureMessage({ synced: 10, pending: 10 })).toBeNull();
    expect(syncFailureMessage({ synced: 0, pending: 0 })).toBeNull();
  });

  it("🔴 فيه سجلات مترفعتش = تحذير بالعدد", () => {
    const m = syncFailureMessage({ synced: 0, pending: 588, error: "permission denied" });
    expect(m).toContain("588");
    expect(m).toContain("permission denied");
  });

  it("رفع جزئي = بيقول اللي فضل", () => {
    const m = syncFailureMessage({ synced: 100, pending: 588, error: "network" });
    expect(m).toContain("488");
  });

  it("أوفلاين مايطلّعش تحذير — ده وضع طبيعي في الشغل", () => {
    expect(syncFailureMessage({ synced: 0, pending: 5, error: "الجهاز أوفلاين" })).toBeNull();
  });

  it("مفيش جلسة مايطلّعش تحذير — الحارس بتاع الدخول بيتكفّل", () => {
    expect(syncFailureMessage({ synced: 0, pending: 5, error: "مفيش جلسة صالحة" })).toBeNull();
  });

  it("فشل من غير سبب واضح لسه بيتقال", () => {
    const m = syncFailureMessage({ synced: 0, pending: 3 });
    expect(m).toContain("3");
  });
});

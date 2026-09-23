import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyCheckSheetChanged, onCheckSheetChanged, CHECK_SYNC_KEY } from "../lib/checkSheetSync";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  مزامنة شيت التشييك بين «التشييك» و«الجديد»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «ممكن يترفع من صفحة التشييك عادي وممكن من
 *  صفحة الجديد، واللي يترفع سواء هنا أو هنا تظهر في التانية — يعني لو
 *  المندوب حدّث التشييك يتحدّث تلقائي ويشتغل تلقائي في الصفحتين».
 *
 *  🔴 **الصفحتين مسارين منفصلين** فواحدة بس بتكون متركّبة في أي لحظة.
 *  «تلقائي» هنا معناها: لما المندوب يرجع للصفحة التانية تلاقي الجديد —
 *  من غير ما يقفل التطبيق ويفتحه. وده بيحصل بإشارة + إعادة قراءة.
 *
 *  والإشارة على مستويين عشان تشتغل في كل الحالات:
 *    ① `BroadcastChannel` — تبويبين مفتوحين في نفس اللحظة
 *    ② `localStorage` — بيوصل لتبويبات تانية (حدث `storage`) **وبيفضل
 *       مكتوب** فالصفحة اللي تتركّب بعدين تعرف إن فيه تغيير حصل
 */
describe("مزامنة شيت التشييك", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  afterEach(() => { vi.restoreAllMocks(); });

  it("الإشارة بتوصل للمشترك", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb);
    notifyCheckSheetChanged();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("بعد إلغاء الاشتراك مابيوصلش حاجة", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb);
    off();
    notifyCheckSheetChanged();
    expect(cb).not.toHaveBeenCalled();
  });

  it("أكتر من مشترك كلهم بيوصلهم", () => {
    const a = vi.fn(), b = vi.fn();
    const offA = onCheckSheetChanged(a);
    const offB = onCheckSheetChanged(b);
    notifyCheckSheetChanged();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA(); offB();
  });

  it("🔴 بتسيب أثر في التخزين — الصفحة اللي تفتح بعدين تعرف", () => {
    notifyCheckSheetChanged();
    expect(localStorage.getItem(CHECK_SYNC_KEY)).toBeTruthy();
  });

  it("⚠️ التخزين مقفول ⇒ مابتوقعش، والمشترك لسه بيتنده", () => {
    const cb = vi.fn();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const off = onCheckSheetChanged(cb);
    expect(() => notifyCheckSheetChanged()).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("⚠️ مشترك بيرمي استثناء مايمنعش الباقيين", () => {
    const bad = vi.fn(() => { throw new Error("boom"); });
    const good = vi.fn();
    const offA = onCheckSheetChanged(bad);
    const offB = onCheckSheetChanged(good);
    expect(() => notifyCheckSheetChanged()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offA(); offB();
  });
});

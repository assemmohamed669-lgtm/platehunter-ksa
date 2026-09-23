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

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 الشيت اللي جاي من واتساب مكانش بيوصل لـ«الجديد»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «لما يترفع من صفحة التشييك يظهر في صفحة الجديد
 *  والعكس».
 *
 *  استقبال الإكسيل من واتساب (`IncomingExcelHandler`) بيبعت حدث تاني خالص
 *  — `idbFileUpdated` — والتشييك بس اللي بتسمعله. فلو الشيت جه من واتساب
 *  والمندوب على «الجديد»، **مكانش بيتحدّث** لحد ما يخرج ويرجع.
 *
 *  ⇒ `idbEvent: true` بيخلّي المشترك يسمع الحدث ده كمان. **اختياري** لأن
 *    التشييك عندها مستمع خاص بيه من زمان — لو سمعته مرتين كانت هتعيد القراية
 *    مرتين (٤٩ ألف لوحة) على كل رسالة واتساب.
 */
describe("idbFileUpdated — الشيت الجاي من واتساب", () => {
  const fire = (slot?: string) =>
    window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: slot === undefined ? {} : { slot } }));

  it("🔴 `idbEvent: true` + سلوت التشييك ⇒ بيوصل", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb, { idbEvent: true });
    fire("check");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("ملف تشييك إضافي (`check-2`) ⇒ بيوصل", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb, { idbEvent: true });
    fire("check-2");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("سلوت الداتا ⇒ **مابيوصلش** (مش شيت تشييك)", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb, { idbEvent: true });
    fire("data");
    fire("referral");
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it("من غير `idbEvent` ⇒ مابيسمعوش (التشييك عندها مستمعها الخاص)", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb);
    fire("check");
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it("بعد إلغاء الاشتراك ⇒ مابيوصلش", () => {
    const cb = vi.fn();
    const off = onCheckSheetChanged(cb, { idbEvent: true });
    off();
    fire("check");
    expect(cb).not.toHaveBeenCalled();
  });
});

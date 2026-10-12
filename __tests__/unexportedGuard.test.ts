import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setUnexportedCount, getUnexportedCount, onUnexportedChange, resetUnexportedGuard,
  leaveWarning,
} from "@/lib/unexportedGuard";

/**
 * 🔴 الحادثة (١٢ أكتوبر ٢٠٢٦): مندوب سجّل لوحات في Voice PRO، قفل التسجيل من
 * **غير تصدير**، راح لصفحة الفرز عشان إحالة جات من البنك، ورجع — ملقاش اللوحات.
 *
 * اتأكدنا بعدها إن اللوحات **مش موجودة في أي مكان**: لا في سجلاته على الجهاز،
 * ولا على السيرفر (لأنها مااتصدّرتش)، ولا حتى في الصوت الخام (السيرفر الجديد
 * مش بيحفظ المقاطع). شغل ساعة ضاع بالكامل.
 *
 * الحارس ده بيمنع التكرار: طول ما فيه لوحات **مش متصدّرة**، الخروج من الصفحة
 * بيسأل الأول. العدّاد عالمي (زي `micBusy`) عشان الشريط التحتي يقراه من غير
 * ربط مباشر بالصفحة.
 */
describe("حارس اللوحات غير المصدَّرة", () => {
  beforeEach(() => resetUnexportedGuard());

  it("يبدأ بصفر", () => {
    expect(getUnexportedCount()).toBe(0);
  });

  it("بيتحدّث ويبلّغ المشتركين", () => {
    const seen: number[] = [];
    onUnexportedChange((n) => seen.push(n));
    setUnexportedCount(5);
    setUnexportedCount(0);
    expect(seen).toEqual([5, 0]);
    expect(getUnexportedCount()).toBe(0);
  });

  it("مابيبلّغش لو القيمة ما اتغيّرتش — مايرسمش الشريط بلا داعي", () => {
    const fn = vi.fn();
    onUnexportedChange(fn);
    setUnexportedCount(3);
    setUnexportedCount(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("إلغاء الاشتراك بيشتغل", () => {
    const fn = vi.fn();
    const off = onUnexportedChange(fn);
    off();
    setUnexportedCount(7);
    expect(fn).not.toHaveBeenCalled();
  });

  it("مستمع بيرمي استثناء مايوقّفش الباقي", () => {
    const good = vi.fn();
    onUnexportedChange(() => { throw new Error("listener broke"); });
    onUnexportedChange(good);
    setUnexportedCount(2);
    expect(good).toHaveBeenCalledWith(2);
  });
});

describe("leaveWarning — رسالة الخروج", () => {
  it("مافيش لوحات مش متصدّرة → مافيش سؤال (الخروج يعدّي على طول)", () => {
    expect(leaveWarning(0)).toBeNull();
    expect(leaveWarning(-3)).toBeNull();
  });

  it("فيه لوحات → رسالة بالعدد وبتحذّر إنها تضيع", () => {
    const msg = leaveWarning(15)!;
    expect(msg).toContain("15");
    expect(msg).toContain("تضيع");
  });

  it("لوحة واحدة برضه بتحذّر", () => {
    expect(leaveWarning(1)).not.toBeNull();
  });
});

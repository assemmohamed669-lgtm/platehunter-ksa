import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { subStatus, isCutOff, GRACE_DAYS, subscriptionNotice } from "@/lib/subscription";

// اليوم ثابت في كل الاختبارات: 2026-08-10
const TODAY = new Date("2026-08-10T13:00:00");
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TODAY); });
afterEach(() => { vi.useRealTimers(); });

/** تاريخ بعد/قبل اليوم بعدد أيام، بصيغة YYYY-MM-DD (بالتوقيت المحلي — toISOString
 *  بيحوّل لـUTC فبيزحزح اليوم في التوقيتات المتقدّمة زي +04:00). */
function day(offset: number): string {
  const d = new Date("2026-08-10T00:00:00");
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("GRACE_DAYS", () => {
  it("فترة السماح يوم واحد", () => {
    expect(GRACE_DAYS).toBe(1);
  });
});

describe("subStatus", () => {
  it("نشط لما يكون باقي ٤ أيام أو أكتر", () => {
    expect(subStatus(day(30)).status).toBe("active");
    expect(subStatus(day(4)).status).toBe("active");
  });

  it("قرب ينتهي في آخر ٣ أيام ويوم الانتهاء نفسه", () => {
    expect(subStatus(day(3)).status).toBe("expiring");
    expect(subStatus(day(1)).status).toBe("expiring");
    expect(subStatus(day(0)).status).toBe("expiring"); // يوم الانتهاء لسه شغّال
  });

  it("يوم السماح الوحيد: اليوم اللي بعد الانتهاء", () => {
    const s = subStatus(day(-1));
    expect(s.status).toBe("grace");
    expect(s.daysLeft).toBe(-1);
  });

  it("مقطوع من اليوم التاني بعد الانتهاء", () => {
    expect(subStatus(day(-2)).status).toBe("expired");
    expect(subStatus(day(-30)).status).toBe("expired");
  });

  it("بدون اشتراك = none", () => {
    expect(subStatus(null).status).toBe("none");
    expect(subStatus(undefined).status).toBe("none");
    expect(subStatus("").status).toBe("none");
  });

  it("التجربة (سماح صفر): مقطوع فوراً بعد الانتهاء", () => {
    expect(subStatus(day(-1), 0).status).toBe("expired");
    expect(subStatus(day(0), 0).status).toBe("expiring"); // يوم الانتهاء لسه شغّال
  });
});

describe("isCutOff — القطع الفعلي للخدمة", () => {
  it("نشط أو قرب ينتهي → مايتقطعش", () => {
    expect(isCutOff(day(30), true)).toBe(false);
    expect(isCutOff(day(0), true)).toBe(false);
  });

  it("يوم السماح → مايتقطعش (الخدمة شغّالة)", () => {
    expect(isCutOff(day(-1), true)).toBe(false);
  });

  it("بعد يوم السماح → يتقطع", () => {
    expect(isCutOff(day(-2), true)).toBe(true);
  });

  it("is_active = false → يتقطع فوراً مهما كان التاريخ", () => {
    expect(isCutOff(day(30), false)).toBe(true);
    expect(isCutOff(null, false)).toBe(true);
  });

  it("بدون تاريخ اشتراك (حسابات الأدمن) → مايتقطعش", () => {
    expect(isCutOff(null, true)).toBe(false);
  });

  it("التجربة (سماح صفر) بتتقطع اليوم اللي بعد الانتهاء", () => {
    expect(isCutOff(day(-1), true, 0)).toBe(true);
    expect(isCutOff(day(0), true, 0)).toBe(false);
  });
});

describe("subscriptionNotice — رسالة التنبيه للمشترك", () => {
  it("آخر يوم في الاشتراك (٠ يوم) → تحذير «غداً سيتم فصل الخدمة»", () => {
    const n = subscriptionNotice(subStatus(day(0)), false)!;
    expect(n.urgent).toBe(true);
    expect(n.text).toContain("غداً سيتم فصل الخدمة");
    expect(n.text).toContain("برجاء دفع الاشتراك");
  });

  it("التحذير بيطمّن إن السجلات محفوظة", () => {
    const n = subscriptionNotice(subStatus(day(0)), false)!;
    expect(n.note).toContain("محفوظة");
    expect(n.note).toContain("لن يتم مسحها");
  });

  it("حساب التجربة بيقول «التجربة المجانية» مش «الاشتراك»", () => {
    expect(subscriptionNotice(subStatus(day(0), 0), true)!.text).toContain("التجربة المجانية");
    expect(subscriptionNotice(subStatus(day(0)), false)!.text).toContain("مدة الاشتراك");
  });

  it("يوم السماح (بعد الانتهاء) → نفس التحذير العاجل", () => {
    const n = subscriptionNotice(subStatus(day(-1)), false)!;
    expect(n.urgent).toBe(true);
    expect(n.text).toContain("غداً سيتم فصل الخدمة");
  });

  it("باقي أيام (١-٣) → تنبيه عادي مش عاجل", () => {
    const n = subscriptionNotice(subStatus(day(2)), false)!;
    expect(n.urgent).toBe(false);
    expect(n.text).toContain("برجاء السداد");
    expect(n.note).toBe("");
  });

  it("اشتراك نشط أو مقطوع أو بدون → مفيش تنبيه", () => {
    expect(subscriptionNotice(subStatus(day(30)), false)).toBeNull();
    expect(subscriptionNotice(subStatus(day(-30)), false)).toBeNull();
    expect(subscriptionNotice(subStatus(null), false)).toBeNull();
  });
});

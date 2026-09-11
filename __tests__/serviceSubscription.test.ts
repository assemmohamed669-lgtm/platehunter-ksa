import { describe, it, expect } from "vitest";
import { serviceActive, maxDate } from "@/lib/subscription";

// تاريخ **محلي** YYYY-MM-DD (زي input[type=date])، مش UTC — عشان يطابق
// serviceActive اللي بيقارن بمنتصف الليل المحلي.
function iso(daysFromToday: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("serviceActive — قفل الخدمة لما أيامها تخلص", () => {
  it("null/فاضي = بلا حد → سارية", () => {
    expect(serviceActive(null)).toBe(true);
    expect(serviceActive(undefined)).toBe(true);
    expect(serviceActive("")).toBe(true);
  });
  it("تاريخ في المستقبل → سارية", () => {
    expect(serviceActive(iso(5))).toBe(true);
  });
  it("النهاردة → سارية (اليوم الأخير)", () => {
    expect(serviceActive(iso(0))).toBe(true);
  });
  it("تاريخ فات → متقفلة", () => {
    expect(serviceActive(iso(-1))).toBe(false);
  });
});

describe("maxDate — تاريخ الحساب العام = الأبعد", () => {
  it("بيرجّع الأبعد", () => {
    expect(maxDate("2026-09-10", "2026-12-01")).toBe("2026-12-01");
    expect(maxDate("2027-01-01", "2026-12-01")).toBe("2027-01-01");
  });
  it("بيتعامل مع null", () => {
    expect(maxDate(null, "2026-12-01")).toBe("2026-12-01");
    expect(maxDate("2026-12-01", null)).toBe("2026-12-01");
    expect(maxDate(null, null)).toBeNull();
  });
});

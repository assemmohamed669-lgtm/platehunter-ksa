/**
 * الرجوع من صفحة المندوب لازم يرجّع الأدمن **لنفس المكان**: نفس التبويب
 * (نشط / قرب ينتهي / مقطوع…) ونفس نص البحث ونفس الصف — مش لـ«الكل» من أول.
 */
import { describe, it, expect } from "vitest";
import { packAdminReturn, unpackAdminReturn, type AdminReturn } from "@/lib/adminListRestore";

describe("packAdminReturn / unpackAdminReturn", () => {
  it("بيرجّع التبويب والبحث والصف والموضع زي ما اتحفظوا", () => {
    const s = packAdminReturn({ id: "a1", y: 420, filter: "active", search: "محمد" });
    expect(unpackAdminReturn(s)).toEqual({ id: "a1", y: 420, filter: "active", search: "محمد" });
  });

  it("تبويب «الكل» وبحث فاضي = السلوك الافتراضي", () => {
    const s = packAdminReturn({ id: "a1", y: 0, filter: "all", search: "" });
    expect(unpackAdminReturn(s)).toEqual({ id: "a1", y: 0, filter: "all", search: "" });
  });

  it("نص بايظ مابيرميش — بيرجع null", () => {
    expect(unpackAdminReturn("{ليس جيسون")).toBeNull();
    expect(unpackAdminReturn("")).toBeNull();
    expect(unpackAdminReturn(null)).toBeNull();
  });

  it("نسخة قديمة محفوظة (id + y بس) لسه شغّالة — التبويب بيرجع «الكل»", () => {
    // مندوب فاتح البرنامج وقت النشر هيلاقي المفتاح القديم في التخزين.
    expect(unpackAdminReturn(JSON.stringify({ id: "a1", y: 100 }))).toEqual({
      id: "a1", y: 100, filter: "all", search: "",
    });
  });

  it("قيم غلط في الجيسون بتتصلّح مش بتكسر", () => {
    const r = unpackAdminReturn(JSON.stringify({ id: 5, y: "كتير", filter: 7, search: null })) as AdminReturn;
    expect(r.id).toBe("");
    expect(r.y).toBe(0);
    expect(r.filter).toBe("all");
    expect(r.search).toBe("");
  });
});

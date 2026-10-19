import { describe, it, expect } from "vitest";
import { pickAccounts, accountRoleLabel, type PickAccount } from "@/lib/accountPicker";

/**
 * 📍 «املأ الحي والشارع» — اختيار الحساب بالاسم. المالك (١٩ أكتوبر ٢٠٢٦): «خلي الخيار اني اختار اسم المشترك
 * او الادمن اللي هعمل معاه كدة». بدل ما يلصق الـID: مربع بحث (اسم/إيميل/رقم/ID) وقايمة يدوس على واحد منها.
 */
const A = (id: string, username: string, extra: Partial<PickAccount> = {}): PickAccount =>
  ({ id, username, email: null, phone: null, role: "agent", is_super: false, is_active: true, ...extra });

const list: PickAccount[] = [
  A("56627d4f-1e8c-4f74-bf1e-8e75077d5143", "أحمد الآيفون", { phone: "0551234567" }),
  A("11111111-1111-4111-8111-111111111111", "المالك", { role: "admin", is_super: true, email: "owner@x.com" }),
  A("22222222-2222-4222-8222-222222222222", "محمد علي", { email: "Mohamed.Ali@Mail.com" }),
  A("33333333-3333-4333-8333-333333333333", "أدمن المجموعة", { role: "admin" }),
  A("44444444-4444-4444-8444-444444444444", "مقفول", { is_active: false }),
];

describe("🔎 البحث", () => {
  it("بالاسم — من غير ما الهمزة تفرق (احمد = أحمد)", () => {
    expect(pickAccounts(list, "احمد").map((a) => a.username)).toEqual(["أحمد الآيفون"]);
  });
  it("بجزء من الاسم", () => {
    expect(pickAccounts(list, "علي").map((a) => a.username)).toEqual(["محمد علي"]);
  });
  it("بالإيميل (من غير ما الحروف الكبيرة تفرق)", () => {
    expect(pickAccounts(list, "mohamed.ali").map((a) => a.username)).toEqual(["محمد علي"]);
  });
  it("برقم التليفون — بالأرقام العربي كمان", () => {
    expect(pickAccounts(list, "1234567").map((a) => a.username)).toEqual(["أحمد الآيفون"]);
    expect(pickAccounts(list, "٠٥٥١٢٣").map((a) => a.username)).toEqual(["أحمد الآيفون"]);
  });
  it("بالـID (لصق كامل أو أوله)", () => {
    expect(pickAccounts(list, "56627d4f-1e8c-4f74-bf1e-8e75077d5143").map((a) => a.username)).toEqual(["أحمد الآيفون"]);
    expect(pickAccounts(list, "56627d4f").map((a) => a.username)).toEqual(["أحمد الآيفون"]);
  });
  it("المشتركين والأدمنز الاتنين — والمقفول برضه (ممكن سجلاته محتاجة)", () => {
    expect(pickAccounts(list, "").length).toBe(5);
  });
  it("الفاضي ⇒ الكل بالترتيب الأبجدي", () => {
    const names = pickAccounts(list, "").map((a) => a.username);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y, "ar")));
  });
  it("حد أقصى للقايمة", () => {
    const many = Array.from({ length: 300 }, (_, i) => A(`${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, "مندوب " + i));
    expect(pickAccounts(many, "", 50).length).toBe(50);
  });
  it("مش موجود ⇒ فاضي", () => {
    expect(pickAccounts(list, "زززز")).toEqual([]);
  });
});

describe("🏷️ نوع الحساب", () => {
  it("مشترك / أدمن / سوبر أدمن / مقفول", () => {
    expect(accountRoleLabel(list[0])).toBe("مشترك");
    expect(accountRoleLabel(list[1])).toBe("سوبر أدمن");
    expect(accountRoleLabel(list[3])).toBe("أدمن");
    expect(accountRoleLabel(list[4])).toBe("مشترك · مقفول");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { usernameToEmail } from "@/lib/loginEmail";

/**
 * 📧 الدخول بالإيميل — المالك (١٤ أكتوبر ٢٠٢٦، صورة): مندوب كاتب «a33366338h@gmail.com» سليم وأندرويد رفض بـ«الجزء المتبوع
 * بالعلامة "@" يجب ألا يشتمل على الرمز "."». خانة الدخول كانت `type="email"` ⇒ فحص أندرويد نفسه، والكيبورد (عربي/إنجليزي)
 * بيزوّد علامة اتجاه مخفية جنب النقطة. ونفس العلامة كانت هتكسر الدخول حتى لو الفحص عدّى (التنضيف #428 كان للإضافة بس).
 */
describe("🔴 الإيميل بيتنضّف قبل الدخول", () => {
  it("علامات الاتجاه المخفية حوالين النقطة/الـ@ بتتشال", () => {
    expect(usernameToEmail("a33366338h@gmail\u200E.com")).toBe("a33366338h@gmail.com");
    expect(usernameToEmail("\u200Fa33366338h\u200E@gmail.com\u200F")).toBe("a33366338h@gmail.com");
  });
  it("أرقام عربية/مسافات/حروف كبيرة", () => {
    expect(usernameToEmail(" A٣٣٣٦٦٣٣٨h@Gmail.com ")).toBe("a33366338h@gmail.com");
  });
  it("الإيميل السليم زي ما هو بالظبط (الدخول الشغّال مابيتغيّرش)", () => {
    expect(usernameToEmail("asemafify40@gmail.com")).toBe("asemafify40@gmail.com");
    expect(usernameToEmail("Agent01")).toBe("agent01@platehunter.local");
  });
});

describe("🔴 خانة الإيميل في صفحة الدخول من غير فحص أندرويد", () => {
  const p = readFileSync(path.resolve(__dirname, "..", "app/login/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("نص بكيبورد الإيميل (inputMode) مش type=email، والفورم noValidate", () => {
    expect(p).not.toMatch(/type="email"/);
    expect(p).toMatch(/inputMode="email"/);
    expect(p).toMatch(/<form\s+noValidate/);
  });
});

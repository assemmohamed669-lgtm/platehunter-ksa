import { describe, it, expect } from "vitest";
import { looksLikePlateQuery, entryMatchesQuery } from "@/lib/fieldCheck";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * بحث السجلات: لما المندوب يكتب **لوحة**، عايز اللوحة دي **بس** — مش صفوف
 * تانية صادف إن فيها نفس الأرقام في عمود الحي أو الملاحظة.
 *
 * والبحث بكلام عادي (حي/طريقة تشييك/ملاحظة) لازم يفضل شغّال زي ما هو — عشان
 * كده لازم نفرّق: الكتابة دي لوحة ولا كلام؟
 */
const e = (plate: string, over: Partial<FieldCheckEntry> = {}): FieldCheckEntry =>
  ({ id: "1", plate, row: {}, method: "متشيكة بالصوت", checkedAt: "2026-09-10T08:00:00Z", ...over });

describe("looksLikePlateQuery", () => {
  it("اللوحة الكاملة وأجزاؤها = لوحة", () => {
    for (const q of ["رري3706", "ر ر ي 3706", "3706", "رري", "أسر2244"]) {
      expect(looksLikePlateQuery(q)).toBe(true);
    }
  });

  it("الكلام العادي مش لوحة — البحث بيه لازم يفضل شغّال", () => {
    for (const q of ["النسيم", "متشيكة بالكاميرا", "الربوة الغربي", "ملاحظة"]) {
      expect(looksLikePlateQuery(q)).toBe(false);
    }
  });

  it("الفاضي مش لوحة", () => {
    expect(looksLikePlateQuery("")).toBe(false);
    expect(looksLikePlateQuery("   ")).toBe(false);
  });
});

describe("entryMatchesQuery — البحث بلوحة", () => {
  it("بيطابق اللوحة المكتوبة", () => {
    expect(entryMatchesQuery(e("رري3706"), "رري3706")).toBe(true);
    expect(entryMatchesQuery(e("رري3706"), "ر ر ي 3706")).toBe(true);
  });

  it("مايطابقش لوحة تانية", () => {
    expect(entryMatchesQuery(e("اسر2244"), "رري3706")).toBe(false);
  });

  it("🔴 مايجيبش صف أرقامه في عمود تاني — دي المشكلة", () => {
    const row = e("اسر2244", { row: { "الحي": "شارع 3706" } });
    expect(entryMatchesQuery(row, "3706")).toBe(false);
  });

  it("الكتابة الجزئية شغّالة وهو بيكتب", () => {
    expect(entryMatchesQuery(e("رري3706"), "رري")).toBe(true);
    expect(entryMatchesQuery(e("رري3706"), "3706")).toBe(true);
  });

  it("البحث بالحي أو طريقة التشييك لسه شغّال", () => {
    const row = e("رري3706", { row: { "الحي": "النسيم" } });
    expect(entryMatchesQuery(row, "النسيم")).toBe(true);
    expect(entryMatchesQuery(row, "متشيكة بالصوت")).toBe(true);
  });
});

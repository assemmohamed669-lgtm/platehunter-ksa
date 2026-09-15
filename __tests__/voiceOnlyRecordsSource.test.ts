import { describe, it, expect } from "vitest";
import { recordsToRows, REC_PLATE_COL } from "@/lib/voiceOnlyRecords";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * حارس: الفرز واللصق في صفحة المشترك «صوت فقط» لازم يتمّا على **سجلات المندوب
 * نفسه** — مش على ملف التشييك ولا الإحالة. الدالة دي هي الجسر (سجلات → صفوف
 * جدول) اللي محرّك المطابقة بيشتغل عليه، فلو اتكسرت الفرز بيفرز على حاجة تانية
 * من غير ما حد ياخد باله.
 */
const entry = (over: Partial<FieldCheckEntry> = {}): FieldCheckEntry => ({
  id: "1", plate: "رري3706", row: {}, method: "صوت",
  checkedAt: "2026-09-10T08:15:00.000Z", ...over,
});

describe("recordsToRows — مصدر الفرز = سجلات المندوب", () => {
  it("بيحط لوحة السجل في عمود اللوحة اللي المطابقة بتقرا منه", () => {
    const rows = recordsToRows([entry({ plate: "اسر2244" })]);
    expect(rows[0][REC_PLATE_COL]).toBe("اسر2244");
  });

  it("بيحافظ على أعمدة السجل المرجعية (النوع/الحي) مع الصف", () => {
    const rows = recordsToRows([entry({ row: { "نوع السيارة": "ونيت", "الحي": "الربوة" } })]);
    expect(rows[0]["نوع السيارة"]).toBe("ونيت");
    expect(rows[0]["الحي"]).toBe("الربوة");
  });

  it("بيضيف الطريقة والموقع عشان يطلعوا في النتيجة", () => {
    const rows = recordsToRows([entry({ method: "متشيكة بالكاميرا", mapsLink: "https://maps.example/x" })]);
    expect(rows[0]["الطريقة"]).toBe("متشيكة بالكاميرا");
    expect(rows[0]["الموقع"]).toBe("https://maps.example/x");
  });

  it("عمود اللوحة بتاع السجل بيكسب أي عمود لوحة قديم جوه row", () => {
    const rows = recordsToRows([entry({ plate: "رري3706", row: { [REC_PLATE_COL]: "لوحة قديمة" } })]);
    expect(rows[0][REC_PLATE_COL]).toBe("رري3706");
  });

  it("بيرجّع صف لكل سجل — مافيش سجل بيضيع", () => {
    const rows = recordsToRows([entry({ id: "1" }), entry({ id: "2", plate: "دوا8403" })]);
    expect(rows).toHaveLength(2);
  });
});

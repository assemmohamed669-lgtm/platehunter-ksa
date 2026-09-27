import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { looksLikeDate } from "@/lib/headerlessColumns";
import {
  resolveResultColumns, resolveMergedResultColumns,
  recordDateOf, RECORD_DATE_LABEL,
} from "@/lib/resultColumns";
import { buildExportRows } from "@/lib/exportColumns";

/**
 * 🔴 **تاريخ التسجيل لازم يظهر في نتيجة السجلات — على الشاشة وفي المشاركة.**
 *
 * بلاغ المالك (٢٧ سبتمبر ٢٠٢٦): «نتيجة الفرز للداتا فيها التاريخ، لكن نتيجة
 * الفرز بتاع السجلات مش بيبقى فيها تاريخ التسجيل».
 *
 * شيت السجلات بيتبني من سجلات المندوب وفيه عمود «التاريخ» = وقت التشييك
 * (`fmtCheckDate` → `27-09-2026 14:30`). التاريخ بيضيع في تلات نقط:
 *   ١) `looksLikeDate` مابتعرفش الشكل ده (تاريخ + وقت) ⇒ كشف المحتوى بيفشل.
 *   ٢) أي عمود تاني في الشيت اسمه فيه «تاريخ» (زي «تاريخ الإحالة» الفاضي)
 *      بياخد خانة الهدف **قبله** لأن المطابقة بالاحتواء، فالعمود بيطلع فاضي.
 *   ٣) لو العمود ما اتحلّش خالص، صف المشاركة بيطلع بلا تاريخ نهائي.
 */
describe("تاريخ التسجيل في نتيجة السجلات", () => {
  it("🔴 looksLikeDate بتقبل شكل التطبيق نفسه (يوم-شهر-سنة ساعة:دقيقة)", () => {
    expect(looksLikeDate("27-09-2026 14:30")).toBe(true);
    expect(looksLikeDate("27/09/2026 14:30:05")).toBe(true);
    expect(looksLikeDate("2026-09-27 14:30")).toBe(true);
  });

  it("الأشكال القديمة لسه مقبولة، واللي مش تاريخ لسه مرفوض", () => {
    expect(looksLikeDate("27-09-2026")).toBe(true);
    expect(looksLikeDate("2026-09-27")).toBe(true);
    expect(looksLikeDate("أبج1234")).toBe(false);
    expect(looksLikeDate("24.5")).toBe(false);
    expect(looksLikeDate("")).toBe(false);
  });

  it("🔴 عمود «التاريخ» بالاسم الصريح بيكسب على «تاريخ الإحالة» الفاضي", () => {
    const headers = ["النوع", "تاريخ الإحالة", "الحي", "التاريخ"];
    const rows = [
      { "النوع": "ونيت", "تاريخ الإحالة": "", "الحي": "غربي", "التاريخ": "27-09-2026 14:30" },
      { "النوع": "فان", "تاريخ الإحالة": "", "الحي": "شرقي", "التاريخ": "26-09-2026 09:15" },
      { "النوع": "سيدان", "تاريخ الإحالة": "", "الحي": "الملز", "التاريخ": "25-09-2026 08:00" },
    ];
    const date = resolveResultColumns(headers, rows).find((c) => c.key === "date");
    expect(date?.sourceCol).toBe("التاريخ");
  });

  it("المطابقة بالاحتواء لسه شغّالة لما مفيش اسم صريح", () => {
    const headers = ["النوع", "تاريخ الإحالة"];
    const rows = [{ "النوع": "ونيت", "تاريخ الإحالة": "01-01-2026" }];
    const date = resolveResultColumns(headers, rows).find((c) => c.key === "date");
    expect(date?.sourceCol).toBe("تاريخ الإحالة");
  });

  it("🔴 recordDateOf بترجّع تاريخ السجل مهما كان اسم العمود", () => {
    expect(recordDateOf({ "التاريخ": "27-09-2026 14:30" })).toBe("27-09-2026 14:30");
    expect(recordDateOf({ "تاريخ التسجيل": "01-01-2026" })).toBe("01-01-2026");
    // «تاريخ التسجيل» له الأولوية على أي عمود تاريخ تاني
    expect(recordDateOf({ "تاريخ الإحالة": "01-01-2020", "التاريخ": "27-09-2026" })).toBe("27-09-2026");
    // مفيش عمود معروف → أي عمود فيه «تاريخ» وفيه قيمة
    expect(recordDateOf({ "تاريخ الرصد": "05-05-2026" })).toBe("05-05-2026");
    expect(recordDateOf({ "النوع": "ونيت" })).toBe("");
    expect(recordDateOf(undefined)).toBe("");
    expect(RECORD_DATE_LABEL).toBe("تاريخ التسجيل");
  });

  it("🔴 الداتا والسجلات بيتلموا تحت عمود «تاريخ التسجيل» واحد في المشاركة", () => {
    const dataRow = { "رقم اللوحة": "زحط9999", "نوع السيارة": "كامري", "تاريخ التسجيل": "01-09-2026" };
    const recRow = { "رقم اللوحة": "أبج1234", "نوع السيارة": "ونيت", "تاريخ التسجيل": "27-09-2026 14:30" };
    const { columns, rows } = buildExportRows([dataRow, recRow]);
    expect(columns.filter((c) => /تاريخ/.test(c))).toEqual(["تاريخ التسجيل"]);
    expect(rows[0]["تاريخ التسجيل"]).toBe("01-09-2026");
    expect(rows[1]["تاريخ التسجيل"]).toBe("27-09-2026 14:30");
  });

  it("شيت السجلات الحقيقي بيطلّع عمود تاريخ التسجيل بقيمته", () => {
    const headers = ["رقم اللوحة", "النوع", "الحي", "GPS", "التاريخ", "المندوب"];
    const rows = [
      { "رقم اللوحة": "أبج1234", "النوع": "ونيت", "الحي": "غربي", "GPS": "", "التاريخ": "27-09-2026 14:30", "المندوب": "عاصم" },
    ];
    const cols = resolveMergedResultColumns([{ kind: "data", headers, rows, plateCol: "رقم اللوحة" }]);
    const d = cols.find((c) => c.key === "date");
    expect(d?.label).toBe(RECORD_DATE_LABEL);
    expect(rows[0][d!.sourceCol as keyof typeof rows[0]]).toBe("27-09-2026 14:30");
  });
});

/**
 * 🔴 **حارس التوصيل** — الدوال لوحدها مابتضمنش إن المندوب يشوف التاريخ.
 * صفحة الفرز لازم: (أ) تضمن عمود تاريخ في أعمدة نتيجة السجلات، و(ب) تحطّ
 * التاريخ في صف المشاركة حتى لو العمود المحلول طلع فاضي.
 */
describe("توصيل تاريخ التسجيل في صفحة الفرز", () => {
  const code = readFileSync(join(process.cwd(), "app", "(app)", "sorting", "page.tsx"), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("🔴 خلية صف السجلات لها احتياطي تاريخ (tashCellValue)", () => {
    expect(code).toMatch(/function tashCellValue\(r: TashyeekResultRow/);
    expect(code).toMatch(/c\.key === "date" \? recordDateOf\(r\.tashyeekRow\)/);
  });

  it("🔴 والعرض والمشاركة الاتنين بيقروا من نفس الخلية", () => {
    // الشكل القديم (قراءة مباشرة بـcellValue في المكانين) لازم يكون اختفى —
    // وإلا واحد فيهم يفضل بلا احتياطي التاريخ.
    const uses = code.match(/tashCellValue\(r, c\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });

  it("🔴 صف المشاركة بيختم تاريخ التسجيل حتى لو العمود مخفي", () => {
    expect(code).toMatch(/obj\[RECORD_DATE_LABEL\] = d/);
  });

  it("🔴 أعمدة نتيجة السجلات فيها ضمان لعمود التاريخ", () => {
    expect(code).toMatch(/if \(!hasDateColumn\(cols\)\)/);
    expect(code).toMatch(/key: "date", label: RECORD_DATE_LABEL/);
  });
});

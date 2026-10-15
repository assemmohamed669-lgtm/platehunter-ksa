import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 👥 العضو اللي معاهوش ملف داتا بتاعه وكل اللي عنده «داتا المجموعة» (المسئول فاتح المشاركة): زرار الفرز كان بيبان
 * مفتوح، والضغط بيمسح النتيجة القديمة ومابيطلّعش جديدة — الفرز كان بيدوّر على ملف في مربع العضو نفسه بس.
 * المالك (١٥ أكتوبر ٢٠٢٦): «صلحها». لو المسئول قافل المشاركة المربع مابيظهرش أصلاً فمافيش حاجة بتتغيّر.
 */
const S = readFileSync(path.resolve(__dirname, "..", "app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("🔴 داتا المجموعة لوحدها بتكفّي للفرز", () => {
  it("الكلي", () => {
    expect(S).toMatch(/if \(!\(hasUploadedData \|\| hasRecordsData \|\| memberDataReady \|\| teamDataReady\) \|\| !referralTable/);
  });
  it("الجديد", () => {
    expect(S).toMatch(/if \(\(!dataTable && !memberDataReady && !teamDataReady\) \|\| !referralTable \|\| !checkTable \|\| \(!effectiveDataPlateCol && !memberDataReady && !teamDataReady\) \|\|/);
  });
  it("أعمدة النتيجة (الحي/الموقع…) من ملف المجموعة لو مافيش ملف داتا للعضو", () => {
    // الحالة مش teamDataReady عشان دي متعرّفة تحت (useMemo بيتنفّذ قبلها ⇒ ReferenceError)
    expect(S).toMatch(/\} else if \(teamData\.role === "member" && teamTable\) \{/);
  });
});

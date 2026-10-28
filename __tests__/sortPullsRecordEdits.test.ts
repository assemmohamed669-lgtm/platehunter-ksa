/**
 * 📥 الفرز بينزّل تعديلات السجلات (الحي/الشارع اللي الأدمن ملاه) بنفسه — المالك ٢٤ أكتوبر ٢٠٢٦. المنطق في
 * `lib/recordEditsPull.test.ts`؛ هنا الربط: بيبدأ مع فتح الصفحة ومع الرجوع ليها، و«فرز» بيستناه قبل ما يقرا السجلات.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SORT = readFileSync(path.join(process.cwd(), "app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("صفحة الفرز", () => {
  it("بتنزّل التعديلات بنفس دالة «التشييك» (pullEditedFieldChecks) — import متأخّر عشان فتحة الصفحة ماتتقلش", () => {
    expect(SORT).toMatch(/import \{ ensureRecordEdits, waitRecordEdits \} from "@\/lib\/recordEditsPull";/);
    expect(SORT).toMatch(/\(await import\("@\/lib\/syncFieldCheck"\)\)\.pullEditedFieldChecks\(u\)/);
  });

  it("مع فتح الصفحة ومع الرجوع ليها", () => {
    expect(SORT).toMatch(/editsReadyRef\.current = startRecordEdits\(\);/);
    expect(SORT).toMatch(/document\.visibilityState === "visible"\) editsReadyRef\.current = startRecordEdits\(\);/);
  });

  it("«فرز» بيستنى التعديلات (لحد حد) **قبل** ما يقرا السجلات", () => {
    expect(SORT).toMatch(/async function recordsForSort\(\)[^\n]*\{\n\s*if \(!recordsLoadedRef\.current\) setWaitingRecords\(true\);\n\s*await waitRecordEdits\(editsReadyRef\.current\);\n\s*const \{ value: loaded, late \} = await awaitRecords/);
  });
});

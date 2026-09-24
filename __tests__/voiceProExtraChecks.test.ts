import { describe, it, expect } from "vitest";
import { buildCombinedCheckIndex } from "@/lib/checkSheets";
import { normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { wantedHits } from "@/lib/wantedFastPath";
import { resolveCheckColumns, rowCheckCols } from "@/lib/wantedColumns";
import { carDetails } from "@/lib/trialRecords";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📥 Voice PRO + «+ إضافة ملف تشييك» — زي «صوتي» بالظبط
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٤ سبتمبر): «لو المندوب رفع كذا ملف تشييك، فويس برو يقارن اللوحات عليهم كلهم…
 *  ولو طلعت حاجة متطابقة تظهر للمندوب كلوحة مطلوبة ويفرز على اللي المندوب رافعه، وعايزك
 *  تتأكد إنها شغّالة لما أرفع ملف تشييك إضافي».
 *
 *  نفس الدوال اللي الصفحة بتشغّلها: الفهرس المدموج (`buildCombinedCheckIndex` — هو هو
 *  بتاع «صوتي») · مفتاح اللوحة (`normalizePlate(bankPlateToArabic(…))`) · الصفّارة من أول
 *  قراية (`wantedHits`) · بيانات العربية (`carDetails`).
 */
const MAIN = {
  headers: ["رقماللوحة", "صانع المركبة", "طراز المركبة", "البنك"],
  rows: [
    { "رقماللوحة": "ا ب ح 1234", "صانع المركبة": "تويوتا", "طراز المركبة": "هايلكس", "البنك": "الأهلي" },
  ],
};
// ملف إضافي بصيغة البنك الإنجليزي — أعمدة تانية خالص
const EXTRA = {
  headers: ["Plate Number", "Vehicle Name", "Chassis Number", "Bank"],
  rows: [
    { "Plate Number": "NKD 5678", "Vehicle Name": "NISSAN PATROL", "Chassis Number": "JN1TANY62U0000001", "Bank": "Rajhi" },
  ],
};
const key = (p: string) => normalizePlate(bankPlateToArabic(p));
const read = (plate: string) => ({ plate, accepted: true, blocked: false, conf: 0.99, tMs: 1000 });

describe("📥 Voice PRO — الملف الإضافي", () => {
  const index = buildCombinedCheckIndex([MAIN, EXTRA]);
  const cols = resolveCheckColumns([MAIN, EXTRA].flatMap((t) => t.headers));

  it("🔴 لوحة في الملف الإضافي بس (بنكي إنجليزي NKD 5678 = نكد5678) ⇒ مطلوبة", () => {
    const hits = wantedHits(read("نكد5678"), index, key);
    expect(hits).toHaveLength(1);
    expect(hits[0].row["Plate Number"]).toBe("NKD 5678");
  });
  it("لوحة في الملف الأساسي ⇒ مطلوبة زي ما هي", () => {
    expect(wantedHits(read("ابح1234"), index, key)).toHaveLength(1);
  });
  it("لوحة مش في أي ملف ⇒ مش مطلوبة", () => {
    expect(wantedHits(read("سار8888"), index, key)).toHaveLength(0);
  });

  it("🔴 بيانات العربية من **أعمدة الملف الإضافي نفسه** (مش أسامي الملف الأساسي)", () => {
    const row = index.get(key("نكد5678"))!;
    const d = carDetails(row, rowCheckCols(row, cols));
    expect(d.car).toBe("NISSAN PATROL");
    expect(d.company).toBe("Rajhi");
    expect(d.chassis).toBe("JN1TANY62U0000001");
  });
  it("🔴 (الباج) بأسامي الملف الأساسي بس ⇒ النوع والشركة كانوا بيطلعوا فاضيين", () => {
    const row = index.get(key("نكد5678"))!;
    expect(carDetails(row, cols).company).toBeNull();
  });
  it("صف الملف الأساسي ⇒ نفس البيانات بالظبط زي ما كانت", () => {
    const row = index.get(key("ابح1234"))!;
    expect(carDetails(row, rowCheckCols(row, cols))).toEqual(carDetails(row, cols));
    expect(carDetails(row, rowCheckCols(row, cols)).company).toBe("الأهلي");
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";

describe("📥 صفحة Voice PRO — الحارس", () => {
  const src = readFileSync(path.resolve(__dirname, "../app/(app)/registration-v2/page.tsx"), "utf8");
  it("🔴 التصدير والعرض بياخدوا أعمدة ملف الصف نفسه (السوبر أدمن الأول)", () => {
    expect(src).toMatch(/carDetails\(r\.match, isSuper \? rowCheckCols\(r\.match, checkCols\) : checkCols, vin\)/);
    expect(src).toMatch(/<MatchDetails row=\{r\} cols=\{isSuper \? rowCheckCols\(r\.match, checkCols\) : checkCols\}/);
  });
  it("🔴 الإضافية بتتقري حتى لو الأساسي اتمسح (زي «صوتي»)", () => {
    expect(src).toMatch(/const extrasOnly: ExcelTable\[\] = \[\];/);
    expect(src).toMatch(/setCheckSources\(extrasOnly\)/);
  });
  it("الإضافية بتتقري مع الأساسي (check-2 · check-3 …) والفهرس مدموج", () => {
    expect(src).toMatch(/getUploadedFile\("local", `check-\$\{n\}`\)/);
    expect(src).toMatch(/cachedCombinedCheckIndex\(checkSources\)/);
  });
});

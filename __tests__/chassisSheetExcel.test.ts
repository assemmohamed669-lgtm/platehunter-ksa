/**
 * 📊 «شيت رقم الشاص» ⇐ مشاركة **إكسيل** (المالك ٣ نوفمبر ٢٠٢٦): «رقم الشاص يبقي اول عمود … وبعده نوع السيارة وبعده
 * الحي او الشارع وبعده ملاحظات وبعده جي بي اس وبعده الوقت والتاريخ بالترتيب دة … او لو فيه اي بيانات زياده».
 * رقم الشاص بياخد مكان «رقم اللوحة» في شيت اللوحات (أول عمود).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chassisSheetRows, CHASSIS_EXCEL_FOR_ALL, type ChassisRecord } from "@/lib/chassisRecords";

const fmt = (iso: string) => `D(${iso})`;
const rec = (p: Partial<ChassisRecord>): ChassisRecord => ({
  id: "ch1", chassis: "LSJW74U60RZ044079", found: false, checkedAt: "2026-11-03T10:15:00.000Z", ...p,
});

describe("📊 صفوف إكسيل شيت الشاص", () => {
  it("الأعمدة بالترتيب: الشاص ⇐ النوع ⇐ الحي-الشارع ⇐ ملاحظات ⇐ GPS ⇐ التاريخ (والحالة بعدهم)", () => {
    const { headers } = chassisSheetRows([rec({})], fmt);
    expect(headers.slice(0, 6)).toEqual(["رقم الشاص", "نوع السيارة", "الحي-الشارع", "ملاحظات", "GPS", "التاريخ"]);
    expect(headers[6]).toBe("الحالة");
  });

  it("القيم من السجل — النوع بالحرف المختصر زي شيت اللوحات، والموقع لينك، والتاريخ بالوقت", () => {
    const { rows } = chassisSheetRows([rec({
      vehicleType: "و", region: "النسيم - شارع الأمير", notes: "قدام البقالة", mapsLink: "https://maps.google.com/?q=24.7,46.6", found: true,
    })], fmt);
    expect(rows[0]).toMatchObject({
      "رقم الشاص": "LSJW74U60RZ044079",
      "نوع السيارة": "و",
      "الحي-الشارع": "النسيم - شارع الأمير",
      "ملاحظات": "قدام البقالة",
      "GPS": "https://maps.google.com/?q=24.7,46.6",
      "التاريخ": "D(2026-11-03T10:15:00.000Z)",
      "الحالة": "مطلوب",
    });
  });

  it("خانات فاضية ⇒ فاضي (مش undefined) · مفيش لينك بس فيه إحداثيات ⇒ لينك منها", () => {
    const { rows } = chassisSheetRows([rec({ lat: 24.7136, lng: 46.6753 })], fmt);
    expect(rows[0]["نوع السيارة"]).toBe("");
    expect(rows[0]["ملاحظات"]).toBe("");
    expect(rows[0]["الحي-الشارع"]).toBe("");
    expect(rows[0]["GPS"]).toMatch(/24\.7136.*46\.6753/);
    expect(rows[0]["الحالة"]).toBe("غير مطلوب");
  });

  it("البيانات الزيادة (صف ملف التشييك المطابق) بتيجي بعد الأعمدة الأساسية — ورقم الهيكل المكرر مابيتكررش", () => {
    const { headers, rows } = chassisSheetRows([
      rec({ found: true, row: { "رقم اللوحة": "ر ل ه 2478", "الماركة": "تويوتا", "رقم الهيكل": "lsjw74u60rz044079" } }),
      rec({ id: "ch2", chassis: "KMHLN41G2RU641296", row: { "البنك": "الراجحي" } }),
    ], fmt);
    expect(headers).toEqual(["رقم الشاص", "نوع السيارة", "الحي-الشارع", "ملاحظات", "GPS", "التاريخ", "الحالة", "رقم اللوحة", "الماركة", "البنك"]);
    expect(rows[0]["الماركة"]).toBe("تويوتا");
    expect(rows[0]["البنك"]).toBe("");
    expect(rows[1]["البنك"]).toBe("الراجحي");
  });

  it("الترتيب زي الشيت في الصفحة (الأحدث فوق) — مابيتغيّرش", () => {
    const { rows } = chassisSheetRows([rec({ id: "a", chassis: "AAA11111111" }), rec({ id: "b", chassis: "BBB22222222" })], fmt);
    expect(rows.map((r) => r["رقم الشاص"])).toEqual(["AAA11111111", "BBB22222222"]);
  });
});

describe("🔌 الزرار في صفحة السجلات — السوبر أدمن الأول", () => {
  const P = readFileSync(path.join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"), "utf8");
  it("مقفول للمناديب لحد ما المالك يجرّب", () => {
    expect(CHASSIS_EXCEL_FOR_ALL).toBe(false);
  });
  it("«مشاركة إكسيل» جنب «مشاركة واتساب» — للسوبر أدمن (أو للكل بالمفتاح) ونفس قفل التنزيل", () => {
    expect(P).toContain("{!memberLocks.download && (CHASSIS_EXCEL_FOR_ALL || isSuper) && <button onClick={shareChassisExcel}");
    expect(P).toContain("const { rows, headers } = chassisSheetRows(recs, formatDate);");
    expect(P).toContain('buildExcelBlob(rows, "شيت رقم الشاص", undefined, headers)');
  });
});

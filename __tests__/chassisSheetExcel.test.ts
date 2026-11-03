/**
 * 📊 «شيت رقم الشاص» ⇐ مشاركة **إكسيل** (المالك ٣ نوفمبر ٢٠٢٦): «رقم الشاص يبقي اول عمود … وبعده نوع السيارة وبعده
 * الحي او الشارع وبعده ملاحظات وبعده جي بي اس وبعده الوقت والتاريخ بالترتيب دة … او لو فيه اي بيانات زياده».
 * رقم الشاص بياخد مكان «رقم اللوحة» في شيت اللوحات (أول عمود).
 *
 * الجولة التانية (نفس اليوم، بعد ما جرّب «file (5).xlsx»): «فيه اعمده فاضيه مش عايزهها تظهر» · الاسم «ملف الشاص» بتاريخ
 * ووقت المشاركة · الخط أكبر وبولد · «كل متشابه بلون … واضح مش باهت».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chassisSheetRows, chassisShareName, CHASSIS_DUP_COLORS, CHASSIS_EXCEL_FOR_ALL, type ChassisRecord } from "@/lib/chassisRecords";

const fmt = (iso: string) => `D(${iso})`;
const rec = (p: Partial<ChassisRecord>): ChassisRecord => ({
  id: "ch1", chassis: "LSJW74U60RZ044079", found: false, checkedAt: "2026-11-03T10:15:00.000Z", ...p,
});
const full = (p: Partial<ChassisRecord> = {}) => rec({
  vehicleType: "و", region: "النسيم - شارع الأمير", notes: "قدام البقالة", mapsLink: "https://maps.google.com/?q=24.7,46.6", ...p,
});

describe("📊 صفوف إكسيل شيت الشاص", () => {
  it("الأعمدة بالترتيب: الشاص ⇐ النوع ⇐ الحي-الشارع ⇐ ملاحظات ⇐ GPS ⇐ التاريخ (والحالة بعدهم)", () => {
    const { headers } = chassisSheetRows([full()], fmt);
    expect(headers).toEqual(["رقم الشاص", "نوع السيارة", "الحي-الشارع", "ملاحظات", "GPS", "التاريخ", "الحالة"]);
  });

  it("القيم من السجل — النوع بالحرف المختصر زي شيت اللوحات، والموقع لينك، والتاريخ بالوقت", () => {
    const { rows } = chassisSheetRows([full({ found: true })], fmt);
    expect(rows[0]).toEqual({
      "رقم الشاص": "LSJW74U60RZ044079",
      "نوع السيارة": "و",
      "الحي-الشارع": "النسيم - شارع الأمير",
      "ملاحظات": "قدام البقالة",
      "GPS": "https://maps.google.com/?q=24.7,46.6",
      "التاريخ": "D(2026-11-03T10:15:00.000Z)",
      "الحالة": "مطلوب",
    });
  });

  it("مفيش لينك بس فيه إحداثيات ⇒ لينك منها · مش مطلوب ⇒ «غير مطلوب»", () => {
    const { rows } = chassisSheetRows([full({ mapsLink: undefined, lat: 24.7136, lng: 46.6753 })], fmt);
    expect(rows[0]["GPS"]).toMatch(/24\.7136.*46\.6753/);
    expect(rows[0]["الحالة"]).toBe("غير مطلوب");
  });

  it("🧹 الأعمدة الفاضية في كل الصفوف مابتظهرش — الأساسية والزيادة («__EMPTY») — والمليانة في صف واحد بتفضل", () => {
    // نفس شكل «file (5).xlsx» اللي المالك جرّبه: النوع والملاحظات فاضيين، وصف التشييك فيه __EMPTY فاضية
    const { headers, rows } = chassisSheetRows([
      rec({ region: "حدبة الزعفرانة", mapsLink: "https://www.google.com/maps?q=24.44,54.41", row: { "__EMPTY": "", "__EMPTY_1": "", "البنك": "" } }),
      rec({ id: "ch2", chassis: "MHFBA8FS5N1061458", found: true, region: "حدبة الزعفرانة",
        row: { "__EMPTY": "", "__EMPTY_1": " ", "البنك": "عبداللطيف جميل", " النوع ": "FORTUNER", "اللوحه": "ربم8187" } }),
    ], fmt);
    expect(headers).toEqual(["رقم الشاص", "الحي-الشارع", "GPS", "التاريخ", "الحالة", "البنك", " النوع ", "اللوحه"]);
    expect(Object.keys(rows[0])).toEqual(headers);   // الصف بنفس ترتيب العناوين (المكتبة بتاخد ترتيب أول صف)
    expect(rows[0]["البنك"]).toBe("");
    expect(rows[1]["اللوحه"]).toBe("ربم8187");
  });

  it("رقم الهيكل اللي في صف التشييك (نفس الشاص) مابيتكررش", () => {
    const { headers } = chassisSheetRows([full({ row: { "الماركة": "تويوتا", "رقم الهيكل": "lsjw74u60rz044079" } })], fmt);
    expect(headers).toContain("الماركة");
    expect(headers).not.toContain("رقم الهيكل");
  });

  it("الترتيب زي الشيت في الصفحة (الأحدث فوق) — مابيتغيّرش", () => {
    const { rows } = chassisSheetRows([rec({ id: "a", chassis: "AAA11111111" }), rec({ id: "b", chassis: "BBB22222222" })], fmt);
    expect(rows.map((r) => r["رقم الشاص"])).toEqual(["AAA11111111", "BBB22222222"]);
  });
});

describe("🎨 كل شاص متكرر بلون خاص بيه — واضح", () => {
  const A = "3KPA241A5JE017513", B = "WVGZZZ5NZJM131395", C = "MHFBA8FS5N1061458";
  it("نفس الشاص ⇒ نفس اللون · شاص متكرر تاني ⇒ لون تاني · اللي مرة واحدة ⇒ من غير لون", () => {
    const { rowColors } = chassisSheetRows([
      rec({ id: "1", chassis: A }), rec({ id: "2", chassis: B }), rec({ id: "3", chassis: A }),
      rec({ id: "4", chassis: C }), rec({ id: "5", chassis: B }), rec({ id: "6", chassis: A }),
    ], fmt);
    expect(rowColors[0]).toBeTruthy();
    expect(rowColors[2]).toBe(rowColors[0]);
    expect(rowColors[5]).toBe(rowColors[0]);
    expect(rowColors[1]).toBeTruthy();
    expect(rowColors[4]).toBe(rowColors[1]);
    expect(rowColors[1]).not.toBe(rowColors[0]);
    expect(rowColors[3]).toBeNull();
  });
  it("المقارنة بعد التطبيع (حروف صغيرة/مسافات) — نفس الشاص", () => {
    const { rowColors } = chassisSheetRows([rec({ id: "1", chassis: A }), rec({ id: "2", chassis: ` ${A.toLowerCase()} ` })], fmt);
    expect(rowColors[0]).toBeTruthy();
    expect(rowColors[1]).toBe(rowColors[0]);
  });
  it("الألوان الغامقة الواضحة (مش الباهتة ‎-100 بتاعة الشاشة) — ومختلفة عن بعض", () => {
    const pale = ["#FEF9C3", "#DBEAFE", "#DCFCE7", "#F3E8FF", "#FFEDD5", "#FCE7F3", "#CCFBF1", "#FEE2E2"];
    expect(CHASSIS_DUP_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(CHASSIS_DUP_COLORS).size).toBe(CHASSIS_DUP_COLORS.length);
    for (const c of CHASSIS_DUP_COLORS) expect(pale).not.toContain(c.toUpperCase());
  });
});

describe("📁 اسم الملف: «ملف الشاص» + تاريخ ووقت المشاركة", () => {
  it("تاريخ ووقت المشاركة بالساعة المحلية — من غير «:» (ممنوعة في أسماء الملفات)", () => {
    expect(chassisShareName(new Date(2026, 10, 3, 9, 5), "xlsx")).toBe("ملف الشاص 03-11-2026 09.05.xlsx");
    expect(chassisShareName(new Date(2026, 0, 28, 17, 40), "csv")).toBe("ملف الشاص 28-01-2026 17.40.csv");
  });
});

describe("🔌 الزرار في صفحة السجلات — السوبر أدمن الأول", () => {
  const P = readFileSync(path.join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"), "utf8");
  it("مقفول للمناديب لحد ما المالك يجرّب", () => {
    expect(CHASSIS_EXCEL_FOR_ALL).toBe(false);
  });
  it("«مشاركة إكسيل» جنب «مشاركة واتساب» — للسوبر أدمن (أو للكل بالمفتاح) ونفس قفل التنزيل", () => {
    expect(P).toContain("{!memberLocks.download && (CHASSIS_EXCEL_FOR_ALL || isSuper) && <button onClick={shareChassisExcel}");
  });
  it("الإكسيل الملوّن بالخط البولد الكبير (نفس نتيجة الفرز) + الاسم بوقت المشاركة", () => {
    expect(P).toContain("const { rows, rowColors } = chassisSheetRows(recs, formatDate);");
    expect(P).toContain('const { blob, ext } = await buildSortBlobBestEffort(rows, "شيت رقم الشاص", rowColors);');
    expect(P).toContain('await shareExcelBlob(blob, chassisShareName(new Date(), ext), "ملف الشاص", { keepName: true });');
  });
});

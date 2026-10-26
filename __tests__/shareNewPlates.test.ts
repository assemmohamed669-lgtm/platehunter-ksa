/**
 * 📤 «مشاركة اللوحات الجديدة» في «فرز جديد» (٢٦ أكتوبر ٢٠٢٦) — `lib/newPlatesShare.ts`.
 *
 * المالك: «لما المندوب يختار فرز جديد يظهر تحت شيت الاحاله علامه مشاركه صغيرة ولما المندوب يدوس عليها يجيلو رساله
 * مفادها ان البرنامج هيشارك لوحات السيارات الجديدة في شيت اكسيل ولما يختارها يشارك الملف اكسيل وفيه لوحات السيارات
 * الجديدة في الشيت بكل بياناتها اللي نازله في المحفظه المهم الزر يكون صغير علشان ميعملش زحمه في البرنامج» ·
 * «خليه جوة المربع زر مشاركه علي اليمين ولما يتشارك يتشارك بنفس اسم الملف المرفوع».
 *  · «الجديد» = **نفس حساب «فرز جديد» بالحرف**: كل شيتات الإحالة مدموجة (أول ظهور يكسب) ناقص اللي في ملفات التشييك.
 *  · الصف بكل أعمدة المحفظة زي ما هو · الملف بنفس اسم ملف الإحالة المرفوع.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import {
  newPlatesFromReferral, newPlatesConfirmText, newPlatesFileBase, newPlatesShareName, orderNewPlatesColumns, newPlatesSheet,
} from "@/lib/newPlatesShare";
import { normalizePlate } from "@/lib/plateParser";
import { buildSpreadsheetBlob } from "@/lib/excel";

const AR = {
  isArabic: true, plateCol: "رقم اللوحة",
  rows: [
    { "رقم اللوحة": "أ ب ح 1234", "الطراز": "كامري", "البنك": "الراجحي" },   // في التشييك
    { "رقم اللوحة": "د ه ل 5231", "الطراز": "اكورد", "البنك": "الراجحي" },   // جديدة
    { "رقم اللوحة": "د ه ل 5231", "الطراز": "مكرر", "البنك": "الراجحي" },     // مكررة ⇒ أول ظهور
  ],
};
const EN = {
  isArabic: false, plateCol: "Plate Number",
  rows: [
    { "Plate Number": "NKD 5678", "Vehicle Name": "Yukon", "Chassis Number": "VIN1" },   // جديدة
    { "Plate Number": "7709 ABS", "Vehicle Name": "Tahoe", "Chassis Number": "VIN2" },   // = سبا7709 في التشييك
  ],
};
const CHECK = new Set([normalizePlate("ابح1234"), normalizePlate("سبا7709")]);

describe("📤 اللوحات الجديدة", () => {
  it("كل الشيتات مدموجة ناقص التشييك — والصف بكل أعمدة المحفظة زي ما هو", () => {
    const rows = newPlatesFromReferral([AR, EN], CHECK);
    expect(rows).toEqual([
      { "رقم اللوحة": "د ه ل 5231", "الطراز": "اكورد", "البنك": "الراجحي" },
      { "Plate Number": "NKD 5678", "Vehicle Name": "Yukon", "Chassis Number": "VIN1" },
    ]);
  });
  it("الصفوف نسخة (الإكسيل مابيلمسش بيانات الصفحة)", () => {
    const rows = newPlatesFromReferral([AR], CHECK);
    rows[0]["الطراز"] = "اتغيّر";
    expect(AR.rows[1]["الطراز"]).toBe("اكورد");
  });
  it("مفيش تشييك ⇒ كل لوحات الإحالة جديدة · كله في التشييك ⇒ ولا لوحة", () => {
    expect(newPlatesFromReferral([AR], new Set()).length).toBe(2);
    expect(newPlatesFromReferral([EN], new Set([normalizePlate("نكد5678"), normalizePlate("سبا7709")]))).toEqual([]);
  });
  it("الرسالة بتقول هيشارك كام لوحة جديدة في إكسيل بكل بياناتها", () => {
    const t = newPlatesConfirmText(1234);
    expect(t).toContain("لوحات السيارات الجديدة");
    expect(t).toContain("إكسيل");
    expect(t).toContain((1234).toLocaleString("ar-EG"));
    expect(newPlatesFileBase(new Date(2026, 9, 26, 15, 0))).toBe("لوحات-جديدة-2026-10-26");
  });
  it("📁 بيتشارك **بنفس اسم ملف الإحالة المرفوع** (المالك: «يتشارك بنفس اسم الملف المرفوع») — والامتداد بتاع الملف الجديد", () => {
    const d = new Date(2026, 9, 26);
    expect(newPlatesShareName("Copy of Vehicles Details For Repo-83.xlsx", "xlsx", d)).toBe("Copy of Vehicles Details For Repo-83.xlsx");
    expect(newPlatesShareName("محفظة الراجحي.xlsb", "xlsx", d)).toBe("محفظة الراجحي.xlsx");
    expect(newPlatesShareName("كلي.v2.xlsx", "csv", d)).toBe("كلي.v2.csv");
    expect(newPlatesShareName(null, "xlsx", d)).toBe("لوحات-جديدة-2026-10-26.xlsx");
    expect(newPlatesShareName("   ", "xlsx", d)).toBe("لوحات-جديدة-2026-10-26.xlsx");
  });
});

/**
 * ↔️ ترتيب الأعمدة (المالك ٢٦ أكتوبر ٢٠٢٦): «عمود رقم اللوحه والنوع او طراز المركبه وصانع المركبه وسنه الصنع ولون
 * المركبه والشاص دول بالترتيب كدة ييجو ان وجدو يبقي ترتيبهم من اليمين لليسار وييجي بعدهم باقي البيانات ان وجدت».
 * الورقة بتتفتح من اليمين (RTL) ⇒ أول عمود = أقصى اليمين.
 */
describe("↔️ ترتيب الأعمدة: اللوحة ⇐ النوع/الطراز ⇐ الصانع ⇐ السنة ⇐ اللون ⇐ الشاص ⇐ الباقي", () => {
  it("المحفظة العربي (مجمع البنك الأهلي) — والباقي بترتيبه الأصلي", () => {
    const h = ["رقم الهيكل", "الحي", "لون المركبة الأساسي", "سنة الصنع", "صانع المركبة", "البنك", "طراز المركبة", "رقماللوحة"];
    expect(orderNewPlatesColumns(h, ["رقماللوحة"], [])).toEqual(
      ["رقماللوحة", "طراز المركبة", "صانع المركبة", "سنة الصنع", "لون المركبة الأساسي", "رقم الهيكل", "الحي", "البنك"]);
  });
  it("المحفظة الإنجليزي (شيت احاله بنك) — Year Model سنة مش طراز", () => {
    const h = ["Agency", "Chassis Number", "Year Model", "Vehicle Name", "Plate Number", "F-Account number"];
    expect(orderNewPlatesColumns(h, ["Plate Number"], [])).toEqual(
      ["Plate Number", "Vehicle Name", "Year Model", "Chassis Number", "Agency", "F-Account number"]);
  });
  it("«النوع» في خانة الطراز — بس «نوع التمويل»/«نوع اللوحة» مش هما (يفضلوا في الباقي)", () => {
    const h = ["نوع التمويل", "النوع", "رقم اللوحة", "نوع اللوحة", "اللون", "الشاص"];
    expect(orderNewPlatesColumns(h, ["رقم اللوحة"], [])).toEqual(
      ["رقم اللوحة", "النوع", "اللون", "الشاص", "نوع التمويل", "نوع اللوحة"]);
  });
  it("«الموديل» الملتبس: قيمه سنين ⇒ سنة الصنع · أسامي عربيات ⇒ الطراز", () => {
    const h = ["الموديل", "الماركة", "رقم اللوحة"];
    const years = [{ "الموديل": "2019" }, { "الموديل": "2021" }, { "الموديل": "" }];
    const names = [{ "الموديل": "كامري" }, { "الموديل": "النترا" }];
    expect(orderNewPlatesColumns(h, ["رقم اللوحة"], years)).toEqual(["رقم اللوحة", "الماركة", "الموديل"]);
    expect(orderNewPlatesColumns(h, ["رقم اللوحة"], names)).toEqual(["رقم اللوحة", "الموديل", "الماركة"]);
  });
  it("VIN شاص · و«Province» مش VIN · ومفيش ولا واحد منهم ⇒ الترتيب زي ما هو واللوحة الأول", () => {
    expect(orderNewPlatesColumns(["Province", "VIN", "Plate"], ["Plate"], [])).toEqual(["Plate", "VIN", "Province"]);
    expect(orderNewPlatesColumns(["الحي", "GPS", "اللوحة"], ["اللوحة"], [])).toEqual(["اللوحة", "الحي", "GPS"]);
  });
  it("«CHASISNUM» بـs واحدة شاص (محفظة البنك العربي الحقيقية)", () => {
    expect(orderNewPlatesColumns(["#", "CHASISNUM", "PLATE_NUM", "Vehicle color"], ["PLATE_NUM"], [])).toEqual(
      ["PLATE_NUM", "Vehicle color", "CHASISNUM", "#"]);
  });
  it("«Structure No» = رقم الهيكل (Vehicles Details For Repo الحقيقي) · العنوان المتكرر «نوع المركبة (2)» جنب أخوه (التيسير)", () => {
    expect(orderNewPlatesColumns(["Structure No", "The plate number in Arabic", "Plate Number"], ["The plate number in Arabic"], []))
      .toEqual(["The plate number in Arabic", "Structure No", "Plate Number"]);
    expect(orderNewPlatesColumns(["رقم اللوحة", "نوع المركبة", "الموديل", "نوع التسجيل", "نوع المركبة (2)"], ["رقم اللوحة"], []))
      .toEqual(["رقم اللوحة", "نوع المركبة", "نوع المركبة (2)", "الموديل", "نوع التسجيل"]);
  });
  it("ملف من غير عناوين (إحالة عبد اللطيف جميل الحقيقية): أول صف داتا ⇒ العمود بيتعرف من قيمه", () => {
    const h = ["2021", "__EMPTY", "Active", "ACCENT", "MALC741B7MM254445", "BVD 8234", "د ي ب 8234", "WHITE 2 TONE", "15094.09"];
    const row = (y: string, car: string, vin: string, color: string) =>
      ({ "2021": y, "__EMPTY": "", "Active": "Active", "ACCENT": car, "MALC741B7MM254445": vin, "BVD 8234": "ZJR 3017",
        "د ي ب 8234": "ر ح م 3017", "WHITE 2 TONE": color, "15094.09": "2000.5" });
    const rows = [row("2022", "CAMRY", "JTNB19HK2N3174136", "SILVER"), row("2021", "YARIS", "JTNB14HK6M3150701", "BLACK"),
      row("2025", "ELANTRA", "JTNAG4CK9S3005974", "Platinum White Pearl MC")];
    expect(orderNewPlatesColumns(h, ["د ي ب 8234"], rows)).toEqual(
      ["د ي ب 8234", "ACCENT", "2021", "WHITE 2 TONE", "MALC741B7MM254445", "__EMPTY", "Active", "BVD 8234", "15094.09"]);
  });
  it("ملف بعناوين: عمود اسمه مش منهم مايتنقلش حتى لو قيمه شبههم (ملاحظات فيها «كامري»، رقم ملف شبه السنة)", () => {
    const rows = [{ "ملاحظات": "كامري", "رقم الملف": "2019" }, { "ملاحظات": "يارس", "رقم الملف": "2020" }];
    expect(orderNewPlatesColumns(["ملاحظات", "رقم الملف", "رقم اللوحة"], ["رقم اللوحة"], rows)).toEqual(
      ["رقم اللوحة", "ملاحظات", "رقم الملف"]);
  });
  it("كذا شيت: الأعمدة من كلهم — كل عمود لوحة على اليمين جنب بعض، وبعدين كل طراز… وهكذا", () => {
    const { rows, headers } = newPlatesSheet([AR, EN], CHECK);
    expect(rows.length).toBe(2);
    expect(headers).toEqual(["رقم اللوحة", "Plate Number", "الطراز", "Vehicle Name", "Chassis Number", "البنك"]);
  });
  it("الإكسيل بيتكتب بالترتيب ده بالظبط (حتى لو أول صف ناقصه أعمدة)", () => {
    const { rows, headers } = newPlatesSheet([AR, EN], CHECK);
    const { blob, ext } = buildSpreadsheetBlob(rows, "لوحات جديدة", headers);
    expect(ext).toBe("xlsx");
    return blob.arrayBuffer().then((buf) => {
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      expect(aoa[0]).toEqual(headers);
      expect(aoa[2][1]).toBe("NKD 5678");   // صف المحفظة الإنجليزي: لوحته في عمود «Plate Number» التاني من اليمين
    });
  });
});

describe("🔌 الزرار في صفحة الفرز", () => {
  const P = readFileSync(join(__dirname, "..", "app", "(app)", "sorting", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("جوّه مربع الإحالة على اليمين (المالك: «خليه جوة المربع زر مشاركه علي اليمين») — في «فرز جديد» بس", () => {
    expect(P).toContain('onShare={sortMode === "new" ? () => void shareNewPlates() : undefined}');
    expect(P).toContain('shareLabel="مشاركة اللوحات الجديدة"');
    expect(P).toContain("sharing={sharingNew}");
    expect(P).not.toContain("<Share2 size={12} /> {sharingNew");   // الزرار اللي كان برّه المربع اتشال
  });
  it("نفس حساب «فرز جديد»: كل ملفات التشييك + كل شيتات الإحالة ⇒ رسالة ⇒ إكسيل ⇒ مشاركة بنفس اسم الملف", () => {
    const i = P.indexOf("async function shareNewPlates()");
    const fn = P.slice(i, i + 2600);
    expect(fn).toContain("const checkSet = combinedCheckPlates(await loadAllCheckSources());");
    expect(fn).toContain("const { rows, headers } = newPlatesSheet(collectRefSources(), checkSet);");
    expect(fn).toContain("if (!confirm(newPlatesConfirmText(rows.length))) return;");
    expect(fn).toContain('buildSpreadsheetBlob(rows, "لوحات جديدة", headers)');
    expect(fn).toContain('await shareExcelBlob(blob, newPlatesShareName(referralFile?.name, ext, new Date()), "لوحات السيارات الجديدة", { keepName: true });');
    expect(fn).toContain('onSortShared("excel", rows.length, "لوحات جديدة");');
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  CERT_DEFAULT_COLS, CERT_EXTRA_COLS, DEFAULT_CERT_COL_PREFS, certDisplayCols, toggleCertCol, isCertColOn,
  loadCertColPrefs, saveCertColPrefs, certCellValue, certExportRow, certShareText, certCombinedExportRows,
} from "@/lib/certColumns";
import type { WantedRow } from "@/components/WantedResultsTable";

/**
 * 📄 أعمدة «شهايد النهارده» — المالك (٥ أكتوبر ٢٠٢٦): «رقم اللوحه وبعديها النوع ... وبعدين نوع
 * المركبه من الشهادة ... العنوان ... gps ... تاريخ التسجيل ... موقعها في الداتا ... الشهادة ...
 * الحاله ... اسم المؤجر»، والباقي «خليها خيار المندوب يقدر يظهرهم لو حب ... بس خلي ثابت اللي انا
 * قولتلك عليه ولو هو حب يخفي حاجه او يظهر يقدر يعملها يدوي».
 */
const row: WantedRow = {
  id: "d1", plate: "ر ق ح 8377", norm: "رقح8377", type: "ونيت", brand: "تويوتا", bank: "مصرف الراجحي",
  address: "شارع الملك فهد", district: "النسيم", color: "ابيض", year: "2021", date: "04-10-2026 21:00",
  mapsLink: "https://maps.google.com/?q=24.7,46.6", vehicleModel: "هايلكس", vin: "MR0FA3CD100123456", certNo: "CRN-119-00133431",
  certLink: "https://platehunter-ksa.vercel.app/c/TOKEN1",
  contract: "متعثر", certDate: "05/10/2026", certFile: { id: "F1", name: "8377.pdf" }, wantedStatus: "مطلوبة",
};

describe("🔴 ترتيب المالك ثابت", () => {
  it("🔴 الافتراضي بالظبط زي ما المالك قال", () => {
    expect([...CERT_DEFAULT_COLS]).toEqual(["النوع", "نوع المركبة", "العنوان", "GPS", "تاريخ التسجيل", "موقعها في الداتا", "الشهادة", "الحالة", "المؤجر"]);
    expect(certDisplayCols(DEFAULT_CERT_COL_PREFS)).toEqual([...CERT_DEFAULT_COLS]);
  });
  it("🔴 الباقي مستخبي في الأول", () => {
    expect([...CERT_EXTRA_COLS]).toEqual(["رقم الشاص", "الماركة", "سنة الصنع", "اللون", "حالة العقد", "تاريخ الشهادة", "الحي"]);
    for (const c of CERT_EXTRA_COLS) expect(isCertColOn(DEFAULT_CERT_COL_PREFS, c)).toBe(false);
  });
});

describe("🔴 المندوب يخفي ويظهر بإيده", () => {
  it("🔴 عمود من الأساسي بيستخبى، ولما يرجع بيرجع مكانه الثابت", () => {
    let p = toggleCertCol(DEFAULT_CERT_COL_PREFS, "العنوان");
    expect(certDisplayCols(p)).not.toContain("العنوان");
    p = toggleCertCol(p, "المؤجر");
    p = toggleCertCol(p, "العنوان");
    expect(certDisplayCols(p)).toEqual(["النوع", "نوع المركبة", "العنوان", "GPS", "تاريخ التسجيل", "موقعها في الداتا", "الشهادة", "الحالة"]);
  });
  it("🔴 الإضافي بيظهر في الآخر بالترتيب اللي دوس بيه", () => {
    let p = toggleCertCol(DEFAULT_CERT_COL_PREFS, "اللون");
    p = toggleCertCol(p, "رقم الشاص");
    expect(certDisplayCols(p).slice(-2)).toEqual(["اللون", "رقم الشاص"]);
    p = toggleCertCol(p, "اللون");
    expect(certDisplayCols(p).slice(-1)).toEqual(["رقم الشاص"]);
    expect(isCertColOn(p, "اللون")).toBe(false);
  });
  it("عمود مش معروف مابيتضافش", () => {
    expect(toggleCertCol(DEFAULT_CERT_COL_PREFS, "اسم المستأجر")).toEqual(DEFAULT_CERT_COL_PREFS);
    expect(certDisplayCols({ hidden: [], extras: ["اسم المستأجر", "اللون", "اللون"] }).slice(-1)).toEqual(["اللون"]);
  });
});

describe("الحفظ على الجهاز", () => {
  beforeEach(() => localStorage.clear());
  it("بيتحفظ ويرجع", () => {
    const p = toggleCertCol(toggleCertCol(DEFAULT_CERT_COL_PREFS, "الحي"), "GPS");
    saveCertColPrefs(p);
    expect(loadCertColPrefs()).toEqual(p);
  });
  it("مفيش/بايظ ⇒ الافتراضي", () => {
    expect(loadCertColPrefs()).toEqual(DEFAULT_CERT_COL_PREFS);
    localStorage.setItem("ph:certs:cols", "{بايظ");
    expect(loadCertColPrefs()).toEqual(DEFAULT_CERT_COL_PREFS);
    localStorage.setItem("ph:certs:cols", JSON.stringify({ hidden: "x", extras: [1, "اللون"] }));
    expect(loadCertColPrefs()).toEqual({ hidden: [], extras: ["اللون"] });
  });
});

describe("🔴 القيم والتصدير بنفس أعمدة الجدول", () => {
  it("🔴 النوع من الداتا · نوع المركبة من الشهادة · المؤجر = البنك", () => {
    expect(certCellValue(row, "النوع")).toBe("ونيت");
    expect(certCellValue(row, "نوع المركبة")).toBe("هايلكس");
    expect(certCellValue(row, "المؤجر")).toBe("مصرف الراجحي");
    expect(certCellValue(row, "الحالة")).toBe("مطلوبة");
    expect(certCellValue(row, "رقم الشاص")).toBe("MR0FA3CD100123456");
  });
  it("🔴 الإكسيل: نفس الترتيب ومن غير الأزرار", () => {
    const cols = certDisplayCols(toggleCertCol(DEFAULT_CERT_COL_PREFS, "اللون"));
    expect(Object.keys(certExportRow(row, cols))).toEqual(["رقم اللوحة", "النوع", "نوع المركبة", "العنوان", "GPS", "تاريخ التسجيل", "الشهادة", "الحالة", "المؤجر", "اللون"]);
    // «الشهادة» = رقم العقد المسجل
    expect(certExportRow(row, cols)["الشهادة"]).toBe("CRN-119-00133431");
    expect(certExportRow(row, cols)["GPS"]).toBe(row.mapsLink);
  });
  it("نص واتساب: الحالة في أول سطر والخريطة في الآخر — واللي المندوب خبّاه مابيطلعش", () => {
    const t = certShareText(row, certDisplayCols(DEFAULT_CERT_COL_PREFS));
    expect(t.split("\n")[0]).toBe("🚗 ر ق ح 8377 — مطلوبة");
    expect(t).toContain("نوع المركبة: هايلكس");
    expect(t).toContain("المؤجر: مصرف الراجحي");
    expect(t.split("\n").pop()).toBe(`📍 ${row.mapsLink}`);
    expect(t).not.toContain("رقم الشاص");
    const hidden = certShareText(row, certDisplayCols(toggleCertCol(DEFAULT_CERT_COL_PREFS, "المؤجر")));
    expect(hidden).not.toContain("المؤجر");
  });
});

/** المالك (٦ أكتوبر ٢٠٢٦): «المشاركه تبقي مجمعه ... يشارك اللي طالع من الداتا واللي طالع من السجلات في مشاركه واحدة». */
describe("🔴 مشاركة واحدة للداتا والسجلات", () => {
  it("🔴 «المصدر» جنب اللوحة (داتا / سجلات) — الداتا الأول وبعدها السجلات بنفس الأعمدة", () => {
    const rec: WantedRow = { ...row, id: "r:1", plate: "س ص ط 5678", type: "سيدان" };
    const cols = certDisplayCols(DEFAULT_CERT_COL_PREFS);
    const out = certCombinedExportRows([row], [rec], cols);
    expect(out.map((o) => [o["رقم اللوحة"], o["المصدر"]])).toEqual([["ر ق ح 8377", "داتا"], ["س ص ط 5678", "سجلات"]]);
    expect(Object.keys(out[0])).toEqual(["رقم اللوحة", "المصدر", ...Object.keys(certExportRow(row, cols)).slice(1)]);
    expect(out[1]["النوع"]).toBe("سيدان");
  });
});

describe("🔴 لينك الشهادة في نص واتساب", () => {
  it("🔴 «📄 الشهادة <الرقم>: <اللينك>» — الدوس عليه بيفتحها", () => {
    const t = certShareText(row, certDisplayCols(DEFAULT_CERT_COL_PREFS));
    expect(t).toContain("📄 الشهادة CRN-119-00133431: https://platehunter-ksa.vercel.app/c/TOKEN1");
    expect(t).not.toContain("الشهادة: CRN-119-00133431");
    const noNo = certShareText({ ...row, certNo: "" }, certDisplayCols(DEFAULT_CERT_COL_PREFS));
    expect(noNo).toContain("📄 الشهادة: https://platehunter-ksa.vercel.app/c/TOKEN1");
  });
});

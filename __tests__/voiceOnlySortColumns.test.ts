import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { voiceSortTable, voiceSortGroups, recordRowForSort, loadVoiceSortOrder, saveVoiceSortOrder, loadVoiceSortMode, saveVoiceSortMode } from "@/lib/voiceSortColumns";
import { loadOrderMode, saveOrderMode, loadColumnOrder, saveColumnOrder } from "@/lib/columnOrder";

/**
 * 🎛️ ترتيب أعمدة فرز «صوت فقط» زي صفحة الفرز — المالك (٩ أكتوبر ٢٠٢٦): «مشترك الصوت ... لما بيفرز بيظهرلو كلمه
 * الاعمده ف لما بيحدد اللي عايز يظهرو في نتيجه الفرز ويخرج من البرنامج بترجع تاني انا عايزك تشيلها دي من عندهم
 * وتحط نفس اللي في صفحه الفرز اللي هو خيار الترتيب الاساسي للاعمده (زي البرنامج) وخيار تخصيص ... ولما يختار
 * ويحدد التحديدة اللي هو عايزها تتحفظ حتي لو خرج من البرنامج او اتنقل للصفحات متتغيرش غير لو هو غيرها ب ايدو».
 */
// صف نتيجة «صوت فقط» = سجل المندوب (recordsToRows) + صف الإحالة — بيانات وهمية
const rec = { "رقم اللوحة": "ابح1234", "النوع": "ملاكي", "الحي-الشارع": "النسيم", "الطريقة": "صوتي", "التاريخ": "08/10/2026", "الموقع": "https://maps.google.com/?q=24.7,46.6" };
const ref = { "PLATE#": "ABH 1234", "Brand": "تويوتا", "اللون": "أبيض", "سنة الصنع": "2021", "البنك": "بنك تجريبي", "الحالة": "مطلوبة" };
const src = [{ ...rec, ...ref }];

describe("🔴 «الترتيب الأساسي للأعمدة (زي البرنامج)» — نفس ترتيب صفحة الفرز", () => {
  it("🔴 الأعمدة بالترتيب المتّفق عليه (EXPORT_COLUMNS) وكل معنى في عمود واحد", () => {
    const t = voiceSortTable(src, "basic", []);
    expect(t.columns.slice(0, 7)).toEqual(["رقم اللوحة", "نوع السيارة", "الحي-الشارع", "GPS", "الماركة", "اللون", "سنة الصنع"]);
    expect(t.rows[0]["نوع السيارة"]).toBe("ملاكي");
    expect(t.rows[0]["GPS"]).toBe(rec["الموقع"]);
    expect(t.rows[0]["تاريخ التسجيل"]).toBe("08/10/2026");
    expect(t.rows[0]["الماركة"]).toBe("تويوتا");
  });
  it("«الحالة» مابتظهرش (زي صفحة الفرز) والأعمدة اللي مالهاش مكان بتتلحق في الآخر", () => {
    const t = voiceSortTable(src, "basic", []);
    expect(t.columns).not.toContain("الحالة");
    expect(t.columns).toContain("البنك");
    expect(t.columns.indexOf("البنك")).toBeGreaterThan(t.columns.indexOf("تاريخ التسجيل"));
  });
});

describe("🔴 «تخصيص» — اللي المندوب اختاره بترتيبه بالظبط", () => {
  it("🔴 رقم اللوحة أول، وبعده الاختيار بالترتيب", () => {
    const t = voiceSortTable(src, "custom", ["البنك", "التاريخ", "النوع"]);
    expect(t.columns).toEqual(["رقم اللوحة", "البنك", "التاريخ", "النوع"]);
    expect(t.rows[0]).toEqual({ "رقم اللوحة": "ابح1234", "البنك": "بنك تجريبي", "التاريخ": "08/10/2026", "النوع": "ملاكي" });
  });
  it("عمود اتختار ومش موجود في النتيجة دي ⇒ بيتجاهَل (مش عمود فاضي)", () => {
    expect(voiceSortTable(src, "custom", ["مش موجود", "اللون"]).columns).toEqual(["رقم اللوحة", "اللون"]);
  });
  it("الاختيار بيتقسم: أعمدة السجلات وأعمدة الإحالة — ناقص رقم اللوحة والفاضي", () => {
    const g = voiceSortGroups([{ dataRow: { ...rec, "فاضي": "" }, referralRow: ref }]);
    expect(g.records).toEqual(["النوع", "الحي-الشارع", "الطريقة", "التاريخ", "الموقع"]);
    expect(g.referral).toEqual(["PLATE#", "Brand", "اللون", "سنة الصنع", "البنك"]);
  });
});

describe("🔴 الاختيار بيتحفظ على الجهاز — نفس مفاتيح صفحة الفرز", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });
  it("🔴 الوضع والترتيب بيرجعوا بعد قفل البرنامج", () => {
    expect(loadOrderMode()).toBe("basic");
    saveOrderMode("custom");
    saveColumnOrder(["البنك", "التاريخ"]);
    expect(loadOrderMode()).toBe("custom");
    expect(loadColumnOrder()).toEqual(["البنك", "التاريخ"]);
  });
});

describe("🔴 التوصيل في فرز «صوت فقط»", () => {
  const s = readFileSync(path.resolve(__dirname, "../components/VoiceOnlySort.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 «الأعمدة» القديمة (إخفاء/فوق-تحت في الذاكرة) اتشالت", () => {
    expect(s).not.toMatch(/الأعمدة \(\{cols\.length\}\/\{allCols\.length\}\)/);
    expect(s).not.toMatch(/hiddenCols/);
    expect(s).not.toMatch(/function moveCol/);
  });
  it("🔴 الخيارين زي صفحة الفرز + الحفظ على الجهاز", () => {
    expect(s).toMatch(/الترتيب الأساسي للأعمدة \(زي البرنامج\)/);
    expect(s).toMatch(/تخصيص \(رتّب الأعمدة بنفسك\)/);
    expect(s).toMatch(/setColOrder\(loadVoiceSortOrder\(\)\); setOrderModeState\(loadVoiceSortMode\(\)\);/);
    expect(s).toMatch(/function setOrderMode\(m: OrderMode\) \{ setOrderModeState\(m\); saveVoiceSortMode\(m\); \}/);
    expect(s).toMatch(/saveVoiceSortOrder\(next\)/);
    // السجل في الفرز هو dataRow وفي اللصق هو referralRow — الاتنين بيتطبّعوا
    expect(s).toMatch(/dataRow: m\.dataRow \? recordRowForSort\(m\.dataRow\) : undefined,/);
    expect(s).toMatch(/referralRow: recordRowForSort\(m\.referralRow\),/);
  });
  it("🔴 الجدول والمشاركة بنفس الأعمدة (voiceSortTable)", () => {
    expect(s).toMatch(/const table = voiceSortTable\(/);
    expect(s).toMatch(/void shareExcel\(pickedTable\)/);
    expect(s).toMatch(/void shareImage\(pickedTable\)/);
    expect(s).toMatch(/void shareAsText\(pickedTable\)/);
  });
});

/**
 * 🔁 مراجعة ٩ أكتوبر (مراجعين + تأكيد عكسي): (١) السجل بيتحفظ ومعاه أعمدة ملف التشييك قبل «التاريخ»/«الموقع»
 * بتوعه ⇒ عمود «تاريخ الإحالة» أو «GPS» من الملف كان بياخد خانة «تاريخ التسجيل»/«GPS» مكان تاريخ وموقع المندوب.
 * (٢) الحفظ كان بنفس مفاتيح صفحة الفرز والأسماء مختلفة ⇒ مشترك اتحوّل من باقة لباقة كان ممكن يلاقي رقم اللوحة بس.
 */
describe("🔴 تاريخ المندوب وموقعه بيكسبوا أعمدة ملف التشييك", () => {
  const record = { "رقم اللوحة": "ابح1234", "طراز": "كامري", "تاريخ الإحالة": "01/09/2026", "GPS": "https://maps.google.com/?q=21.5,39.2",
    "الطريقة": "صوتي", "التاريخ": "08/10/2026", "الموقع": "https://maps.google.com/?q=24.7,46.6" };
  it("🔴 «تاريخ التسجيل» = تاريخ المندوب، و«GPS» = موقعه — من غير تكرار عمود «التاريخ»/«الموقع»", () => {
    const r = recordRowForSort(record);
    expect(r["تاريخ التسجيل"]).toBe("08/10/2026");
    expect(r["GPS"]).toBe("https://maps.google.com/?q=24.7,46.6");
    expect("التاريخ" in r).toBe(false);
    expect("الموقع" in r).toBe(false);
    const t = voiceSortTable([{ ...r }], "basic", []);
    expect(t.rows[0]["تاريخ التسجيل"]).toBe("08/10/2026");
    expect(t.rows[0]["GPS"]).toBe("https://maps.google.com/?q=24.7,46.6");
  });
  it("صف إحالة (مش سجل) بيفضل زي ما هو", () => {
    expect(recordRowForSort(ref)).toBe(ref);
  });
});

describe("🔴 «صوت فقط» ليه حفظه لوحده (مش مفاتيح صفحة الفرز)", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });
  it("🔴 اختيار «صوت فقط» بيرجع بعد قفل البرنامج — ومابيلمسش اختيار صفحة الفرز", () => {
    saveColumnOrder(["نوع السيارة", "GPS"]); saveOrderMode("custom");     // صفحة الفرز
    expect(loadVoiceSortMode()).toBe("basic");
    expect(loadVoiceSortOrder()).toEqual([]);
    saveVoiceSortMode("custom"); saveVoiceSortOrder(["البنك", "تاريخ التسجيل"]);
    expect(loadVoiceSortMode()).toBe("custom");
    expect(loadVoiceSortOrder()).toEqual(["البنك", "تاريخ التسجيل"]);
    expect(loadColumnOrder()).toEqual(["نوع السيارة", "GPS"]);
    expect(loadOrderMode()).toBe("custom");
  });
});

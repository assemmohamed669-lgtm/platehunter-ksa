import { describe, it, expect } from "vitest";
import {
  normalizePlate, bankPlateToArabic, buildReferralIndex, matchChunkAgainstIndex, collectReferralEntries,
  matchTokensAgainstRows, parsePlateFromTranscript, isValidManualPlate, buildWantedIndex, anchorPlateToWanted,
  detectPlateColumn, detectArabicPlateColumnByContent,
} from "@/lib/plateParser";
import { combinedCheckPlates, buildCombinedCheckIndex } from "@/lib/checkSheets";
import { looksLikePlate } from "@/lib/headerlessColumns";

/**
 * 0️⃣ لوحة **بحرفين** من غير أصفار — المالك (٧ أكتوبر ٢٠٢٦): «لو اللوحه كدة في الاحاله ه ل 76 هتبقي في ملف
 * الداتا والسجلات بتاع المندوب بالشكل دة هل0076 هيا هيا اللوحه ف بردو تطلع في نتيجه الفرز ولو المندوب وهو
 * بيسجل قال هل0076 وهيا في شت التشييك هل76 او ه ل 76 المفروض دي لوحه متطابقه ف تطلع معاه انها مطلوبه».
 */
const key = (p: string) => normalizePlate(bankPlateToArabic(p));
const rows = (list: string[], col = "رقم اللوحة") => list.map((p) => ({ [col]: p }));
const bank = ["ه ل 76", "هل76", "ب ر 5", "ط ع 812"];
const delegate = ["هل0076", "هل0076", "بر0005", "طع0812"];

describe("🔴 حرفين + أرقام من غير أصفار = نفس اللوحة بالأصفار", () => {
  it("🔴 المفتاح واحد", () => {
    bank.forEach((b, i) => expect(key(b)).toBe(key(delegate[i])));
    expect(key("ه ل 76")).toBe("هل0076");
  });
  it("🔴 الفرز الكلي/الجديد/السجلات (الإحالة «ه ل 76» ⇐ الداتا/السجلات «هل0076») — والعكس", () => {
    const idx = buildReferralIndex(rows(bank), "رقم اللوحة");
    expect(matchChunkAgainstIndex(rows(["هل0076", "بر0005", "طع0812"]), "رقم اللوحة", idx, 88, false)).toHaveLength(3);
    const back = buildReferralIndex(rows(["هل0076"]), "رقم اللوحة");
    expect(matchChunkAgainstIndex(rows(["ه ل 76", "هل76"]), "رقم اللوحة", back, 88, false)).toHaveLength(2);
    const merged = collectReferralEntries([{ rows: rows(bank), plateCol: "رقم اللوحة", isArabic: true }]);
    expect(merged.map((e) => e.norm)).toEqual(["هل0076", "بر0005", "طع0812"]);
  });
  it("🔴 لصق نصي", () => {
    expect(matchTokensAgainstRows(["هل0076"], rows(["ه ل 76", "هل76"]), "رقم اللوحة", 88, false)).toHaveLength(2);
  });
  it("🔴 التشييك: الشيت فيه «هل76» أو «ه ل 76» والمندوب يكتب/يقول «هل0076»", () => {
    for (const sheet of [["هل76"], ["ه ل 76"]]) {
      const src = [{ headers: ["رقم اللوحة"], rows: rows(sheet) }];
      expect(combinedCheckPlates(src).has(key("هل0076"))).toBe(true);
      expect(buildCombinedCheckIndex(src).get(key("ه ل 0076"))).toBeTruthy();
    }
    expect(isValidManualPlate("هل0076")).toBe(true);
  });
  it("🔴 الصوت: «ه ل صفر صفر سبعة ستة» ⇐ «هل0076»", () => {
    const plateOf = (r: unknown) => String((r as { plate?: string; plates?: string[] }).plate ?? (r as { plates?: string[] }).plates?.[0] ?? "");
    expect(key(plateOf(parsePlateFromTranscript("ه ل صفر صفر سبعة ستة")))).toBe("هل0076");
    expect(key(plateOf(parsePlateFromTranscript("هاء لام صفر صفر سبعة ستة")))).toBe("هل0076");
  });
  it("🔴 فهرس المطلوب في التسجيل بالصوت (تثبيت اللوحة على المطلوبين)", () => {
    const idx = buildWantedIndex(["ه ل 76"]);
    expect(anchorPlateToWanted("هل0076", idx).matched).toBe(true);
  });
});

describe("🔴 عمود اللوحة بيتعرف بالمحتوى لو اللوحات «ه ل 76» (حرفين مفصولين + رقمين)", () => {
  const list = ["ه ل 76", "ب ر 5", "ط ع 81", "ن ك 12", "س ص 9", "د ه 44"];
  const data = list.map((p, i) => ({ "م": String(i + 1), "مدة التأخير": `${30 + i} يوم`, "البيان": p, "العميل": "عميل تجريبي" }));
  it("🔴 detectPlateColumn / detectArabicPlateColumnByContent", () => {
    expect(detectPlateColumn(Object.keys(data[0]), data)).toBe("البيان");
    expect(detectArabicPlateColumnByContent(Object.keys(data[0]), data)).toBe("البيان");
  });
  it("🔴 looksLikePlate (ملف من غير صف عناوين)", () => {
    expect(looksLikePlate("ه ل 76")).toBe(true);
    expect(looksLikePlate("76 ه ل")).toBe(true);
  });
  it("لسه مش لوحة: حرف واحد + رقم، كلمة من حرفين + رقم («حي 12»)، لاتيني", () => {
    for (const w of ["ه 7", "حي 12", "حي12", "R 8", "A B 12", "30 يوم"]) expect(looksLikePlate(w)).toBe(false);
  });
  it("ملف تشييك عنوانه «رقم اللوحة» ولوحاته ملزوقة «هل76» ⇒ العمود بالاسم", () => {
    const sheet = ["هل76", "بر5", "طع81"].map((p, i) => ({ "م": String(i + 1), "رقم اللوحة": p }));
    expect(detectPlateColumn(["م", "رقم اللوحة"], sheet)).toBe("رقم اللوحة");
  });
});

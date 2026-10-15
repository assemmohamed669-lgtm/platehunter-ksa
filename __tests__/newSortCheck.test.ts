import { describe, it, expect } from "vitest";
import { collectReferralEntries } from "@/lib/plateParser";
import { combinedCheckPlates } from "@/lib/checkSheets";
import {
  splitReferralByCheck, checkSourcesSignature, isNewCacheFresh, resultBelongsOnScreen,
} from "@/lib/newSortCheck";

/**
 * 🆕 «فرز جديد» نهائي — المالك (١٥ أكتوبر ٢٠٢٦): «يقارن المحفظه بتاع الاحاله اللي المندوب بيرفعها بينها وبين التشييك
 * … يطلع اللي مش في التشييك من المحفظه دي ويفرزهم علي الداتا … يظهر في الفرز الجديد السيارات الجديده بس ولما يفرز فرز
 * كلي يطلعلو نتيجه الفرز الكلي». المناديب: «الجديد والكلي زي بعض … لازم يفرز مرتين او تلاته».
 */
const ref = (rows: Record<string, string>[], plateCol = "Plate Number", isArabic = false) => ({ rows, plateCol, isArabic });
const chk = (plates: string[], col = "رقم اللوحة") => ({ headers: [col, "البنك"], rows: plates.map((p) => ({ [col]: p, "البنك": "x" })) });

describe("🔴 الجديد = المحفظة ناقص التشييك", () => {
  it("اللي في التشييك بيتشال — حتى لو الإحالة إنجليزي والتشييك عربي", () => {
    const entries = collectReferralEntries([ref([
      { "Plate Number": "7709 ABS" },   // لاتيني (أرقام ثم حروف) = س ب ا 7709 — في التشييك
      { "Plate Number": "NKD 5678" },   // = ن ك د 5678 — جديدة
      { "Plate Number": "HGR 9312" },   // = هـ ق ر 9312 — في التشييك
    ])]);
    const checkSet = combinedCheckPlates([chk(["س ب ا 7709", "ه ق ر 9312", "ا ب ح 1111"])]);
    const s = splitReferralByCheck(entries, checkSet);
    expect(s.fresh.map((e) => e.norm)).toEqual(["نكد5678"]);
    expect(s.inCheck).toBe(2);
    expect(s.total).toBe(3);
  });
  it("مفيش ولا لوحة في التشييك ⇒ inCheck = 0 (بيبان للمندوب إن ملف التشييك مش بتاع المحفظة دي)", () => {
    const entries = collectReferralEntries([ref([{ "Plate Number": "NKD 5678" }])]);
    const s = splitReferralByCheck(entries, combinedCheckPlates([chk(["ا ب ح 1111"])]));
    expect(s).toMatchObject({ inCheck: 0, total: 1 });
  });
  it("«يهل76» في الإحالة = «يهل0076» في التشييك", () => {
    const entries = collectReferralEntries([ref([{ "رقم اللوحة": "ي ه ل 76" }], "رقم اللوحة", true)]);
    const s = splitReferralByCheck(entries, combinedCheckPlates([chk(["يهل0076"])]));
    expect(s.fresh).toEqual([]);
    expect(s.inCheck).toBe(1);
  });
});

describe("🔴 نتيجة «الجديد» المحفوظة لازم تكون من ملف التشييك الحالي", () => {
  const a = [chk(["ا ب ح 1111", "س ب ا 7709"])];
  it("نفس الملفات ⇒ نفس البصمة", () => {
    expect(checkSourcesSignature(a)).toBe(checkSourcesSignature([chk(["ا ب ح 1111", "س ب ا 7709"])]));
  });
  it("ملف تاني / صفوف أكتر / ملف تشييك إضافي ⇒ بصمة تانية", () => {
    const base = checkSourcesSignature(a);
    expect(checkSourcesSignature([chk(["ن ك د 5678", "س ب ا 7709"])])).not.toBe(base);
    expect(checkSourcesSignature([chk(["ا ب ح 1111", "س ب ا 7709", "ه ق ر 9312"])])).not.toBe(base);
    expect(checkSourcesSignature([...a, chk(["ه ق ر 9312"])])).not.toBe(base);
    expect(checkSourcesSignature([])).not.toBe(base);
  });
  it("نتيجة قديمة من غير بصمة (قبل التصليح) أو ببصمة مختلفة ⇒ ماتتعرضش", () => {
    const sig = checkSourcesSignature(a);
    expect(isNewCacheFresh(undefined, sig)).toBe(false);
    expect(isNewCacheFresh("x", sig)).toBe(false);
    expect(isNewCacheFresh(sig, sig)).toBe(true);
  });
});

describe("🔴 نتيجة كل فرز في التاب بتاعه بس", () => {
  it("الكلي خلص والمندوب على «الجديد» ⇒ ماتنزلش على الشاشة", () => {
    expect(resultBelongsOnScreen("full", "new")).toBe(false);
    expect(resultBelongsOnScreen("new", "full")).toBe(false);
    expect(resultBelongsOnScreen("full", "full")).toBe(true);
    expect(resultBelongsOnScreen("new", "new")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bikeWantedHits, hasNearbyRow } from "@/lib/bikePlates";
import { buildCombinedCheckIndex } from "@/lib/checkSheets";
import { normalizePlate, bankPlateToArabic } from "@/lib/plateParser";

/**
 * 🏍️ لوحة الموتوسيكل في «Voice PRO» — المالك (٧ أكتوبر ٢٠٢٦): «فيه لوحات بحرفين ... اللي بحرفين دة بيبقي
 * موتوسيكل وممكن ارقامه كمان تيجي رقمين او رقم او تلاته» و«لو هيا لوحه موتوسيكل بيقول مثلا طع0123 بس هيا
 * مكتوبه مثلا في التشييك طع123».
 *
 * سيرفر الموديل بيرمي أي لوحة مش ٣ حروف + ٤ أرقام قبل الرد، فلوحة الموتوسيكل بتتاخد من **كلام الموديل
 * الخام** — **لو مطلوبة في شيت التشييك بس** (السوبر أدمن الأول). سجلات الصوت: ١٠ من ١٦ لوحة بحرفين كتبها
 * الموديل كانت عربية عادية فاتها حرف ⇒ من غير شرط «مطلوبة» كانت هتطلع لوحات غلط.
 */
const key = (p: string) => normalizePlate(bankPlateToArabic(p));
const sheet = (list: string[]) =>
  buildCombinedCheckIndex([{ headers: ["رقم اللوحة", "البنك"], rows: list.map((p) => ({ "رقم اللوحة": p, "البنك": "بنك تجريبي" })) }]);
const read = (rawText: string, over: Record<string, unknown> = {}) =>
  ({ rawText, plate: "", accepted: false, blocked: false, conf: 0.97, ...over });

describe("🔴 bikeWantedHits — الموتوسيكل المطلوب من كلام الموديل", () => {
  const idx = sheet(["طع123", "ب ر 5", "ه ل 76"]);
  it("🔴 المندوب قال «طع0123» والشيت «طع123» ⇒ مطلوبة", () => {
    const out = bikeWantedHits(read("طع0123"), idx, key);
    expect(out.map((h) => h.plate)).toEqual(["طع0123"]);
    expect(out[0].row["البنك"]).toBe("بنك تجريبي");
  });
  it("🔴 رقم/رقمين/٣ أرقام في الشيت — والمندوب بالأصفار أو من غيرها", () => {
    expect(bikeWantedHits(read("بر0005"), idx, key)).toHaveLength(1);
    expect(bikeWantedHits(read("هل0076"), idx, key)).toHaveLength(1);
    expect(bikeWantedHits(read("هل76"), idx, key)).toHaveLength(1);
    expect(bikeWantedHits(read("طع٠١٢٣"), idx, key)).toHaveLength(1);   // أرقام هندية
  });
  it("🔴 وسط كلام تاني («موتوسيكل طع0123 احمر»)", () => {
    expect(bikeWantedHits(read("موتوسيكل طع0123 احمر"), idx, key).map((h) => h.plate)).toEqual(["طع0123"]);
    expect(bikeWantedHits(read("موتوسيكل طع0123، احمر."), idx, key).map((h) => h.plate)).toEqual(["طع0123"]);   // ترقيم لازق
  });
  it("🔴 مش مطلوبة ⇒ لأ (من غير شرط الشيت كانت هتطلع لوحات غلط)", () => {
    expect(bikeWantedHits(read("طع0124"), idx, key)).toEqual([]);
    expect(bikeWantedHits(read("سص0123"), idx, key)).toEqual([]);
  });
  it("🔴 عربية ٣ حروف فيها نفس الحرفين («اطع0123») مش موتوسيكل", () => {
    expect(bikeWantedHits(read("اطع0123"), idx, key)).toEqual([]);
  });
  it("حروف مش من حروف اللوحة / حرف واحد / أرقام بس ⇒ لأ", () => {
    const idx2 = sheet(["فش123", "ط 123", "0123"]);
    for (const t of ["فش0123", "ط0123", "0123"]) expect(bikeWantedHits(read(t), idx2, key)).toEqual([]);
  });
  it("🔴 حاجز الاختراع زي العربية: المحجوبة بثقة واطية ⇒ لأ، وبثقة عالية (≥٨٦٪) ⇒ آه", () => {
    expect(bikeWantedHits(read("طع0123", { blocked: true, conf: 0.5 }), idx, key)).toEqual([]);
    expect(bikeWantedHits(read("طع0123", { blocked: true, conf: 0.91 }), idx, key)).toHaveLength(1);
  });
  it("نص فاضي/مش موجود ⇒ لأ", () => {
    expect(bikeWantedHits(read(""), idx, key)).toEqual([]);
    expect(bikeWantedHits({ plate: "", accepted: false, blocked: false, conf: 0.9 } as never, idx, key)).toEqual([]);
  });
});

describe("🔴 hasNearbyRow — صف الموتوسيكل مايتكررش مع كل قراية", () => {
  const rows = [{ plate: "طع0123", atMs: 10_000 }, { plate: "ابح1234", atMs: 11_000 }];
  it("نفس اللوحة في نفس الثواني ⇒ موجود", () => {
    expect(hasNearbyRow(rows, "طع0123", 14_000)).toBe(true);
  });
  it("بعد كده بكتير (عدّى عليه تاني) ⇒ صف جديد", () => {
    expect(hasNearbyRow(rows, "طع0123", 40_000)).toBe(false);
  });
  it("لوحة تانية ⇒ مش موجود", () => {
    expect(hasNearbyRow(rows, "طع0124", 10_500)).toBe(false);
  });
});

describe("🔴 التوصيل في «Voice PRO» — السوبر أدمن الأول، و«صوتي» والمحرّك زي ما هم", () => {
  const src = readFileSync(path.resolve(__dirname, "../app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  const onRead = src.slice(src.indexOf("onRead: (r) => {"), src.indexOf("onAudioWindow:"));
  it("🔴 بيتفحص في كل قراية — ورا `sup` — وبعد التأكيد (نافذتين) زي العربية", () => {
    expect(onRead).toMatch(/const bikeHits = sup\s*\n?\s*\? bikeWantedHits\(r, checkIndexRef\.current,/);
    expect(onRead).toMatch(/bikeWantedHits\([^)]*\)[\s\S]{0,200}\.filter\(\(h\) => confirmWanted\(wantedSeenRef\.current,/);
    expect(onRead).toMatch(/for \(const h of bikeHits\) alertWanted\(h\.plate, h\.row\);/);
  });
  it("🔴 الصف بيطلع مرة واحدة (hasNearbyRow) بـ«مطلوبة»", () => {
    expect(onRead).toMatch(/hasNearbyRow\(/);
  });
  it("«صوتي» (instant-check) ومحرّك الصوت المشترك مالهمش دعوة", () => {
    const instant = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8");
    const engine = readFileSync(path.resolve(__dirname, "../lib/voicexEngine.ts"), "utf8");
    expect(instant).not.toMatch(/bikePlates|bikeWantedHits/);
    expect(engine).not.toMatch(/bikePlates|bikeWantedHits/);
  });
});

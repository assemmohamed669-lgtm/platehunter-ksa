import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { matchPastedOnRecords, pasteDupColors, VS_DUP_COLORS } from "@/lib/voicePaste";

/**
 * 🎨 «لصق نصي» في فرز «صوت فقط» — المالك (١١ أكتوبر ٢٠٢٦): «لما المندوب بيعمل لصق نصي وعندو سيارات مكررة في
 * السجلات او في الداتا مش بيطلعلو غير سيارة واحده ... لو حبك1234 مكررة 3 مرات تطلع ال 3 مرات ويتلونو بنفس اللون».
 * السبب: الفهرس (`buildReferralIndex`) بيحتفظ بصف واحد لكل لوحة. بيانات وهمية.
 */
const rec = (plate: string, date: string, extra: Record<string, string> = {}) =>
  ({ "رقم اللوحة": plate, "الطريقة": "صوتي", "التاريخ": date, "الموقع": "", ...extra });

describe("🔴 كل مرة اتسجلت فيها اللوحة بتطلع", () => {
  const a1 = rec("حبك1234", "01/10/2026", { "الحي-الشارع": "النسيم" });
  const b1 = rec("ادر5555", "02/10/2026");
  const a2 = rec("ح ب ك 1234", "05/10/2026", { "الحي-الشارع": "الروضة" });
  const a3 = rec("حبك1234", "09/10/2026", { "الحي-الشارع": "العليا" });
  const rows = [a1, b1, a2, a3];

  it("🔴 حبك1234 مكررة ٣ مرات ⇒ ٣ نتايج (مش واحدة)", () => {
    const r = matchPastedOnRecords(["حبك1234"], rows);
    expect(r.map((m) => m.referralRow)).toEqual([a1, a2, a3]);
    expect(r.every((m) => m.status === "exact")).toBe(true);
  });
  it("نفس اللوحة تحت بعض وبترتيب اللصق", () => {
    const r = matchPastedOnRecords(["ادر5555", "حبك1234"], rows);
    expect(r.map((m) => m.referralRow)).toEqual([b1, a1, a2, a3]);
  });
  it("اللوحة المعروضة = اللي المندوب لصقها (زي الأول)", () => {
    const r = matchPastedOnRecords(["ح ب ك 1234"], rows);
    expect(r.map((m) => m.dataRow?.["رقم اللوحة"])).toEqual(["ح ب ك 1234", "ح ب ك 1234", "ح ب ك 1234"]);
  });
  it("لصق نفس اللوحة مرتين مابيضاعفش النتيجة", () => {
    expect(matchPastedOnRecords(["حبك1234", "حبك 1234"], rows)).toHaveLength(3);
  });
  it("تام بس — لوحة قريبة مابتطلعش", () => {
    expect(matchPastedOnRecords(["حبك1235"], rows)).toEqual([]);
  });
  it("«يهل76» = «يهل0076» (زي باقي البرنامج)", () => {
    expect(matchPastedOnRecords(["يهل76"], [rec("يهل0076", "01/10/2026")])).toHaveLength(1);
  });
});

describe("🔴 المكرر بلون واحد — وكل لوحة مكررة لون مختلف", () => {
  it("🔴 الـ٣ مرات نفس اللون، واللوحة اللي مرة واحدة من غير لون", () => {
    const c = pasteDupColors(["حبك1234", "ادر5555", "ح ب ك 1234", "حبك1234"]);
    expect(c[0]).not.toBeUndefined();
    expect(c[2]).toBe(c[0]);
    expect(c[3]).toBe(c[0]);
    expect(c[1]).toBeUndefined();
  });
  it("لوحتين مكررتين ⇒ لونين مختلفين", () => {
    const c = pasteDupColors(["حبك1234", "حبك1234", "ادر5555", "ادر5555"]);
    expect(c[0]).not.toBe(c[2]);
    expect(VS_DUP_COLORS[c[0]!]).toBeTruthy();
    expect(VS_DUP_COLORS[c[2]!]).toBeTruthy();
  });
});

describe("🔴 التوصيل في «صوت فقط»", () => {
  const s = readFileSync(path.resolve(__dirname, "../components/VoiceOnlySort.tsx"), "utf8").replace(/\r\n/g, "\n");
  const paste = s.slice(s.indexOf("const runPaste = useCallback"), s.indexOf("// ── المشاركة"));
  it("🔴 اللصق مابقاش بالفهرس اللي بيحتفظ بصف واحد لكل لوحة", () => {
    expect(paste).not.toMatch(/buildReferralIndex/);
    expect(paste).toMatch(/matchPastedOnRecords\(tokens, \[\.\.\.mine, \.\.\.teamDataRows\]\)/);
    expect(paste).toMatch(/matchPastedOnRecords\(tokens, \[\.\.\.mine, \.\.\.groupRows, \.\.\.teamDataRows\]\)/);
  });
  it("🔴 جدول اللصق بيلوّن المكرر", () => {
    expect(s).toMatch(/rows=\{pasteResults\}\n\s+colorDups/);
    expect(s).toMatch(/VS_DUP_COLORS\[/);
  });
});

describe("⚡ سريع على سجلات كتير", () => {
  it("٥٠ لوحة ملصوقة على ١٣٠ ألف صف: أقل من ثانية", () => {
    const L = "ابحدرسصطعقكلمنهوى";
    const plate = (i: number) => `${L[i % 17]}${L[Math.floor(i / 17) % 17]}${L[Math.floor(i / 289) % 17]}${String(1000 + (i * 7919) % 9000)}`;
    const rows = Array.from({ length: 130000 }, (_, i) => rec(plate(i), "01/10/2026"));
    const tokens = Array.from({ length: 50 }, (_, i) => plate(i * 97));
    const t0 = performance.now();
    const r = matchPastedOnRecords(tokens, rows);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.length).toBeGreaterThanOrEqual(50);
  }, 60000);
});

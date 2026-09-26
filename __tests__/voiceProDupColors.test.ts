import { describe, it, expect } from "vitest";
import { assignDupColors, VOICE_PRO_DUP_PALETTE } from "@/lib/voiceProDupColors";
import { plateKey } from "@/lib/fieldCheck";

/**
 * 🎨 تلوين المكرر في Voice PRO — طلب المالك (٢٦ سبتمبر ٢٠٢٦):
 * «لو اللوحة اتكررت مرتين أو أكتر… يتلوّن اللاين بتاع اللوحتين أو التلاتة اللي
 * شبه بعض بلون علشان المندوب يعرف إنها مكررة، ولو فيه لوحة درن1452 وليها
 * متشابه يتلوّن بلون تاني وهكذا».
 */
const EMPTY = new Map<string, number>();
const keys = (...plates: string[]) => plates.map(plateKey);

describe("assignDupColors — مين يتلوّن", () => {
  it("لوحات كلها مرة واحدة ⇒ مفيش لون", () => {
    expect(assignDupColors(keys("حبك1234", "درن1452"), EMPTY, 8).size).toBe(0);
  });

  it("لوحة اتقالت مرتين ⇒ الاتنين لون واحد وعددها ٢", () => {
    const m = assignDupColors(keys("حبك1234", "درن1452", "حبك1234"), EMPTY, 8);
    expect(m.get(plateKey("حبك1234"))).toEqual({ color: 0, count: 2 });
    expect(m.has(plateKey("درن1452"))).toBe(false);
  });

  it("تلات مرات ⇒ عددها ٣", () => {
    const m = assignDupColors(keys("حبك1234", "حبك1234", "حبك1234"), EMPTY, 8);
    expect(m.get(plateKey("حبك1234"))?.count).toBe(3);
  });

  it("مجموعتين مكررتين ⇒ كل واحدة بلون مختلف (بترتيب أول ظهور)", () => {
    const m = assignDupColors(keys("حبك1234", "درن1452", "حبك1234", "درن1452"), EMPTY, 8);
    expect(m.get(plateKey("حبك1234"))?.color).toBe(0);
    expect(m.get(plateKey("درن1452"))?.color).toBe(1);
  });

  it("المسافات وأ/ا مابتفرّقش — نفس اللوحة", () => {
    const m = assignDupColors(keys("ا ب ح 1234", "أبح1234"), EMPTY, 8);
    expect(m.get(plateKey("ابح1234"))?.count).toBe(2);
  });

  it("🚗 لوحات الأسطول (نفس الحروف وأرقام متتالية) مش مكررة — عربيات مختلفة", () => {
    expect(assignDupColors(keys("حبل1211", "حبل1212", "حبل1213"), EMPTY, 8).size).toBe(0);
  });

  it("نفس الأرقام وحرف مختلف مش مكرر — التلوين للتكرار بالحرف بس", () => {
    expect(assignDupColors(keys("حبك1234", "حبل1234"), EMPTY, 8).size).toBe(0);
  });

  it("المفاتيح الفاضية بتتجاهل", () => {
    expect(assignDupColors(["", "", "  "], EMPTY, 8).size).toBe(0);
  });

  it("من غير ألوان ⇒ مفيش تلوين", () => {
    expect(assignDupColors(keys("حبك1234", "حبك1234"), EMPTY, 0).size).toBe(0);
  });
});

describe("assignDupColors — اللون ثابت مايتنططش", () => {
  it("مجموعة جديدة ظهرت ⇒ القديمة محتفظة بلونها", () => {
    const first = assignDupColors(keys("درن1452", "درن1452"), EMPTY, 8);
    const prev = new Map([...first].map(([k, v]) => [k, v.color]));
    // الجديدة بتيجي **قبل** القديمة في الترتيب — ومع كده القديمة ماتتغيّرش
    const m = assignDupColors(keys("حبك1234", "حبك1234", "درن1452", "درن1452"), prev, 8);
    expect(m.get(plateKey("درن1452"))?.color).toBe(0);
    expect(m.get(plateKey("حبك1234"))?.color).toBe(1);
  });

  it("مجموعة اتمسح تكرارها ⇒ اللي بعدها محتفظة بلونها، واللون الفاضي يروح للجديدة", () => {
    const prev = new Map([[plateKey("حبك1234"), 0], [plateKey("درن1452"), 1]]);
    // المندوب مسح نسخة من حبك1234 فبقت مرة واحدة، وظهرت مجموعة جديدة
    const m = assignDupColors(keys("حبك1234", "درن1452", "درن1452", "سصع5555", "سصع5555"), prev, 8);
    expect(m.has(plateKey("حبك1234"))).toBe(false);
    expect(m.get(plateKey("درن1452"))?.color).toBe(1);
    expect(m.get(plateKey("سصع5555"))?.color).toBe(0);
  });

  it("الألوان خلصت ⇒ المجموعة الزيادة برضه بتاخد لون (بيلفّ)", () => {
    const plates: string[] = [];
    for (let i = 0; i < 9; i++) { const p = "حبك" + (1000 + i); plates.push(p, p); }
    const m = assignDupColors(keys(...plates), EMPTY, 8);
    expect(m.size).toBe(9);
    const colors = [...m.values()].map((v) => v.color);
    expect(new Set(colors.slice(0, 8)).size).toBe(8);
    for (const c of colors) expect(c >= 0 && c < 8).toBe(true);
  });

  it("لون قديم برّه النطاق بيتجاهل", () => {
    const prev = new Map([[plateKey("حبك1234"), 42]]);
    const m = assignDupColors(keys("حبك1234", "حبك1234"), prev, 8);
    expect(m.get(plateKey("حبك1234"))?.color).toBe(0);
  });
});

describe("VOICE_PRO_DUP_PALETTE", () => {
  it("٨ ألوان مختلفة، ومفيش أحمر (المطلوبة) ولا أصفر (المبدئية)", () => {
    expect(VOICE_PRO_DUP_PALETTE.length).toBe(8);
    expect(new Set(VOICE_PRO_DUP_PALETTE.map((p) => p.row)).size).toBe(8);
    for (const p of VOICE_PRO_DUP_PALETTE) {
      expect(p.row).not.toMatch(/rose|red|amber|yellow/);
      expect(p.chip).not.toMatch(/rose|red|amber|yellow/);
    }
  });
});

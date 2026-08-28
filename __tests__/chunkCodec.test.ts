/**
 * تخزين دفعات الداتا بشكل مضغوط.
 *
 * الحالة اللي فجّرت ده: مندوب آيفون بملف داتا فيه **٧٧٩,٥٦١ صف** — الصفحة
 * بتموت («حدثت مشكلة بشكل متكرر»). القراءة نفسها آمنة (قِست: +١١٤ ميجا)،
 * والقاتل هو تخزين الصفوف: كل صف كان بيتخزّن **كائن بأسماء أعمدته**، يعني
 * ٧٧٩ ألف × ٦ = **٤.٧ مليون نسخة من أسماء الأعمدة** على الجهاز.
 *
 * الشكل الجديد: أسماء الأعمدة **مرة واحدة لكل دفعة**، والصفوف مصفوفات قيم.
 *
 * ⚠️ التوافق مع القديم إلزامي: في أجهزة مناديب فيها داتا متخزّنة بالشكل القديم
 * دلوقتي. القراءة لازم تفهم الاتنين وإلا داتاهم تضيع.
 */
import { describe, it, expect } from "vitest";
import { encodeChunk, decodeChunk } from "@/lib/chunkCodec";

const R = (o: Record<string, string>) => o;

describe("encodeChunk / decodeChunk", () => {
  it("ذهاب وعودة: نفس الصفوف بالظبط", () => {
    const rows = [
      R({ "رقم اللوحة": "ابح1234", "الحي": "النسيم" }),
      R({ "رقم اللوحة": "دمم5012", "الحي": "الروضة" }),
    ];
    expect(decodeChunk(encodeChunk(rows, "داتا")).rows).toEqual(rows);
  });

  it("**بيخزّن أسماء الأعمدة مرة واحدة** — ده كل الغرض", () => {
    const rows = Array.from({ length: 500 }, (_, i) =>
      R({ "رقم اللوحة": `ابح${i}`, "الحي": "النسيم", "اللون": "أبيض" }));
    const enc = encodeChunk(rows, "داتا");
    expect(enc.cols).toEqual(["رقم اللوحة", "الحي", "اللون"]);
    expect(enc.cols.length).toBe(3);          // مش 1500
    expect(enc.vals.length).toBe(500);
    expect(enc.vals[0]).toEqual(["ابح0", "النسيم", "أبيض"]);
  });

  it("صفوف بأعمدة مختلفة: بياخد اتحاد الأعمدة والناقص يبقى فاضي", () => {
    const rows = [R({ a: "1", b: "2" }), R({ a: "3", c: "4" })];
    const back = decodeChunk(encodeChunk(rows)).rows;
    expect(back[0]).toEqual({ a: "1", b: "2", c: "" });
    expect(back[1]).toEqual({ a: "3", b: "", c: "4" });
  });

  it("بيحافظ على اسم الورقة", () => {
    expect(decodeChunk(encodeChunk([R({ a: "1" })], "ورقة٢")).sheet).toBe("ورقة٢");
  });

  it("دفعة فاضية", () => {
    expect(decodeChunk(encodeChunk([])).rows).toEqual([]);
  });

  it("🔴 **بيقرا الشكل القديم** — داتا المناديب المتخزّنة دلوقتي", () => {
    // من غير ده، أول تحديث بيمسح داتا كل مندوب عنده ملف مرفوع.
    const legacy = { rows: [R({ "رقم اللوحة": "ابح1234" })], sheet: "داتا" };
    const out = decodeChunk(legacy);
    expect(out.rows).toEqual([{ "رقم اللوحة": "ابح1234" }]);
    expect(out.sheet).toBe("داتا");
  });

  it("بيتحمّل سجل تالف من غير ما يرمي", () => {
    expect(decodeChunk(null).rows).toEqual([]);
    expect(decodeChunk({}).rows).toEqual([]);
    expect(decodeChunk({ cols: ["a"] }).rows).toEqual([]);
  });
});

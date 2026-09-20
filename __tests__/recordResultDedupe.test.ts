/**
 * نتيجة فرز **السجلات**: اللوحة الواحدة صف واحد بس.
 *
 * المندوب بيشتكي إن اللوحة بتطلعله كذا مرة. السبب: كل تشييك للوحة = صف —
 * سواء هو شيّكها أكتر من مرة في أيام مختلفة، أو أكتر من مندوب في المجموعة
 * شافوها. اللي يهمّه هو **آخر مرة اتشافت وفين**، فبنسيب الأحدث ونشيل الباقي.
 */
import { describe, it, expect } from "vitest";
import { checkDateValue, dedupeRecordsByPlate } from "@/lib/recordResultDedupe";

type R = { plate: string; date: string; who: string };
const dedupe = (rows: R[]) => dedupeRecordsByPlate(rows, (r) => r.plate, (r) => r.date);

describe("checkDateValue", () => {
  it("بيقرا صيغة التشييك dd-MM-yyyy HH:mm", () => {
    expect(checkDateValue("05-09-2026 14:30")).toBeGreaterThan(checkDateValue("05-09-2026 09:10"));
    expect(checkDateValue("06-09-2026 00:01")).toBeGreaterThan(checkDateValue("05-09-2026 23:59"));
  });

  it("اليوم والشهر مش بيتقلبوا (١٢-٠١ مش يناير ١٢)", () => {
    // 12-01-2026 = ١٢ يناير، و 01-12-2026 = ١ ديسمبر → التاني أحدث.
    expect(checkDateValue("01-12-2026 00:00")).toBeGreaterThan(checkDateValue("12-01-2026 00:00"));
  });

  it("بيقرا ISO كمان", () => {
    expect(checkDateValue("2026-09-05T14:30:00Z")).toBeGreaterThan(0);
  });

  it("فاضي أو نص غريب = صفر (مايتصدّرش على تاريخ حقيقي)", () => {
    expect(checkDateValue("")).toBe(0);
    expect(checkDateValue("مش تاريخ")).toBe(0);
    expect(checkDateValue("05-09-2026 14:30")).toBeGreaterThan(checkDateValue(""));
  });
});

describe("dedupeRecordsByPlate", () => {
  it("نفس اللوحة مرتين → صف واحد، الأحدث", () => {
    const out = dedupe([
      { plate: "حبك1234", date: "01-09-2026 10:00", who: "قديم" },
      { plate: "حبك1234", date: "05-09-2026 10:00", who: "جديد" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].who).toBe("جديد");
  });

  it("مناديب مختلفين شافوا نفس اللوحة → الأحدث بس", () => {
    const out = dedupe([
      { plate: "حبك1234", date: "02-09-2026 08:00", who: "علي" },
      { plate: "حبك1234", date: "04-09-2026 19:00", who: "محمد" },
      { plate: "حبك1234", date: "03-09-2026 12:00", who: "أحمد" },
    ]);
    expect(out.map((r) => r.who)).toEqual(["محمد"]);
  });

  it("فروق المسافات والكتابة مابتعملش صفين", () => {
    const out = dedupe([
      { plate: "ا ب ح 1234", date: "01-09-2026 10:00", who: "أ" },
      { plate: "أبح1234", date: "02-09-2026 10:00", who: "ب" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].who).toBe("ب");
  });

  it("لوحات مختلفة كلها بتفضل", () => {
    const out = dedupe([
      { plate: "حبك1234", date: "01-09-2026 10:00", who: "أ" },
      { plate: "دهو5678", date: "01-09-2026 10:00", who: "ب" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("الترتيب بيفضل زي ما هو (أول ظهور لكل لوحة)", () => {
    const out = dedupe([
      { plate: "دهو5678", date: "01-09-2026 10:00", who: "ب" },
      { plate: "حبك1234", date: "01-09-2026 10:00", who: "أ" },
      { plate: "دهو5678", date: "09-09-2026 10:00", who: "ب-أحدث" },
    ]);
    expect(out.map((r) => r.plate)).toEqual(["دهو5678", "حبك1234"]);
    expect(out[0].who).toBe("ب-أحدث");
  });

  it("تعادل التاريخ → الأول يكسب (سجلاتي بتيجي قبل سجلات المجموعة)", () => {
    const out = dedupe([
      { plate: "حبك1234", date: "01-09-2026 10:00", who: "أنا" },
      { plate: "حبك1234", date: "01-09-2026 10:00", who: "المجموعة" },
    ]);
    expect(out[0].who).toBe("أنا");
  });

  it("صف بلا تاريخ مابيغلبش صف بتاريخ", () => {
    const out = dedupe([
      { plate: "حبك1234", date: "", who: "بلا تاريخ" },
      { plate: "حبك1234", date: "01-09-2026 10:00", who: "بتاريخ" },
    ]);
    expect(out[0].who).toBe("بتاريخ");
  });

  it("صف بلا لوحة بيفضل زي ما هو (مش بيتلم مع بعضه)", () => {
    const out = dedupe([
      { plate: "", date: "01-09-2026 10:00", who: "أ" },
      { plate: "  ", date: "02-09-2026 10:00", who: "ب" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("قايمة فاضية", () => {
    expect(dedupe([])).toEqual([]);
  });
});

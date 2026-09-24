import { describe, it, expect } from "vitest";
import { placeLiveRow, type PlaceableRow } from "@/lib/placeLiveRow";
import { FleetMemory } from "@/lib/fleetPairs";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  وضع الصف الجديد في جدول «الجديد» — صف جديد ولا يتلمّ في توأمه؟
 * ══════════════════════════════════════════════════════════════════════
 *  نفس الخطوات اللي كانت مكتوبة مرتين جوّه الصفحة (المؤكّد والمبدئي) — اتنقلت
 *  هنا بالحرف عشان تتختبر وتتقاس على تسجيلات حقيقية.
 */
type R = PlaceableRow & { tag?: string };
let n = 0;
const row = (plate: string, atMs: number, o: Partial<R> = {}): R => ({
  id: "r" + (++n), plate, atMs, provisional: false, mult: 2, conf: 0.99,
  match: null, type: null, note: null, shownAt: atMs, latencyMs: 0, ...o,
});

describe("placeLiveRow — السلوك القديم زي ما هو", () => {
  it("لوحة جديدة ⇒ صف جديد فوق", () => {
    const a = row("سار8888", 1000);
    const b = row("حيو3456", 3000);
    const out = placeLiveRow([a], b);
    expect(out.map((r) => r.plate)).toEqual(["حيو3456", "سار8888"]);
  });

  it("🔴 توأم مسخّم (نفس الحروف + خانتين) ⇒ يتلمّ في نفس الصف بنفس الـid", () => {
    const a = row("دطس2112", 60500, { mult: 1, provisional: true });
    const b = row("دطس2177", 69500, { mult: 2 });
    const out = placeLiveRow([a], b);
    expect(out.length).toBe(1);
    expect(out[0].plate).toBe("دطس2177");
    expect(out[0].id).toBe(a.id);
  });

  it("المبدئي مايغلبش المؤكّد ⇒ الجدول زي ما هو", () => {
    const a = row("دطس2177", 1000, { mult: 3 });
    const b = row("دطس2112", 2000, { provisional: true, mult: 1 });
    const prev = [a];
    expect(placeLiveRow(prev, b)).toBe(prev);
  });

  it("نفس اللوحة بالحرف قريبة ⇒ تتلمّ", () => {
    const a = row("رره6232", 1000, { mult: 1 });
    const b = row("رره6232", 4000, { mult: 3 });
    expect(placeLiveRow([a], b).length).toBe(1);
  });

  it("إعادة مقصودة (بينها ٤ لوحات وثواني كتير) ⇒ صف جديد", () => {
    const prev = [
      row("ببب1111", 9000), row("تتت2222", 8000), row("ثثث3333", 7000), row("ججج4444", 6000),
      row("دمس5284", 1000),
    ];
    expect(placeLiveRow(prev, row("دمس5284", 11000)).length).toBe(6);
  });

  it("توأم الحروف (نفس الأرقام + حرفين) ⇒ الأقدم يكسب", () => {
    const a = row("بنط9093", 1000);
    const b = row("حرط9093", 2000, { mult: 5 });
    const out = placeLiveRow([a], b);
    expect(out.length).toBe(1);
    expect(out[0].plate).toBe("بنط9093");
  });
});

describe("🚚 placeLiveRow — الأسطول المتسلسل", () => {
  it("🔴 من غير دليل: حبل1235 بتعدّل على حبل1234 (الباج اللي المالك شافه)", () => {
    const a = row("حبل1234", 1000);
    const b = row("حبل1235", 3000);
    const out = placeLiveRow([a], b);
    expect(out.length).toBe(1);
  });

  it("🔴 اتسمعوا في نافذة واحدة ⇒ صفين", () => {
    const fleet = new FleetMemory();
    fleet.note(["حبل1234", "حبل1235"]);
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    const a = row("حبل1234", 1000);
    const out = placeLiveRow([a], row("حبل1235", 3000), distinct);
    expect(out.map((r) => r.plate)).toEqual(["حبل1235", "حبل1234"]);
  });

  it("🔴 التسلسل كله (١٢٣٤ ⇐ ١٢٣٨) ⇒ كل واحدة صف", () => {
    const fleet = new FleetMemory();
    const plates = ["حبل1234", "حبل1235", "حبل1236", "حبل1237", "حبل1238"];
    for (let i = 0; i + 1 < plates.length; i++) fleet.note([plates[i], plates[i + 1]]);
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    let rows: R[] = [];
    plates.forEach((p, i) => { rows = placeLiveRow(rows, row(p, 1000 + i * 1500), distinct); });
    expect(rows.map((r) => r.plate).sort()).toEqual(plates);
  });

  it("وغلط السمع لسه بيتلمّ عادي مع الدليل", () => {
    const fleet = new FleetMemory();
    fleet.note(["حبل1234", "حبل1235"]);
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    // حبل1284 = غلط سمع لـحبل1234 (مااتسمعوش مع بعض)
    const out = placeLiveRow([row("حبل1234", 1000, { mult: 3 })], row("حبل1284", 2500, { provisional: true, mult: 1 }), distinct);
    expect(out.length).toBe(1);
    expect(out[0].plate).toBe("حبل1234");
  });
});

import { describe, it, expect } from "vitest";
import { placeLiveRow, restoreFleetRows, type PlaceableRow } from "@/lib/placeLiveRow";
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
    expect(placeLiveRow([a], b).length).toBe(1);
  });

  it("🔴 تجربة المالك: دبر2102 ثم دبر2103 ثم دبر2104 بسكتة ⇒ ٣ صفوف", () => {
    const fleet = new FleetMemory();
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    let rows: R[] = [];
    ["دبر2102", "دبر2103", "دبر2104"].forEach((p, i) => {
      const t = 1500 + i * 6000;
      fleet.note([p], t); fleet.note([p], t + 1500);
      rows = placeLiveRow(rows, row(p, t + 750), distinct);
    });
    expect(rows.map((r) => r.plate).sort()).toEqual(["دبر2102", "دبر2103", "دبر2104"]);
  });

  it("🔴 الدليل وصل **بعد** الدمج ⇒ العربية اللي اتبلعت بترجع صف لوحدها ببياناتها", () => {
    // تأخير الشبكة عند المالك ~٣.٥ث: ٢١٠٣ اتأكّدت قبل ما تتثبت فعدّلت على ٢١٠٢
    const fleet = new FleetMemory();
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    fleet.note(["دبر2102"], 1500); fleet.note(["دبر2102"], 3000); fleet.note(["دبر2103"], 7500);
    const a = row("دبر2102", 2250, { match: { "اللوحة": "دبر2102" } as Record<string, string>, lat: 24.7 } as Partial<R>);
    let rows = placeLiveRow([a], row("دبر2103", 7500, { mult: 3 }), distinct);
    expect(rows.map((r) => r.plate)).toEqual(["دبر2103"]);          // اتبلعت (لسه مفيش دليل)
    fleet.note(["دبر2103"], 9000);                                   // الدليل وصل
    rows = restoreFleetRows(rows, distinct);
    expect(rows.map((r) => r.plate).sort()).toEqual(["دبر2102", "دبر2103"]);
    const back = rows.find((r) => r.plate === "دبر2102")!;
    expect(back.match).toEqual({ "اللوحة": "دبر2102" });
    expect(back.atMs).toBe(2250);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("🔴 والعربية اللي خسرت (اتشالت من غير ما تظهر) بترجع كمان لما الدليل يوصل", () => {
    const fleet = new FleetMemory();
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    fleet.note(["دبر2102"], 1500); fleet.note(["دبر2102"], 3000); fleet.note(["دبر2103"], 7500);
    let rows = placeLiveRow([row("دبر2102", 2250, { mult: 4 })], row("دبر2103", 7500, { mult: 2 }), distinct);
    expect(rows.map((r) => r.plate)).toEqual(["دبر2102"]);
    fleet.note(["دبر2103"], 9000);
    rows = placeLiveRow(rows, row("سار8888", 12000), distinct);      // أي وضع تاني بيعمل الاسترجاع
    expect(rows.map((r) => r.plate).sort()).toEqual(["دبر2102", "دبر2103", "سار8888"]);
  });

  it("غلط سمع عادي (مش أسطول) عمره مايرجع — ومفيش صف مكرر لو العربية موجودة أصلاً", () => {
    const fleet = new FleetMemory();
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    let rows = placeLiveRow([row("دطس2112", 60500, { provisional: true, mult: 1 })], row("دطس2177", 69500), distinct);
    rows = restoreFleetRows(rows, distinct);
    expect(rows.map((r) => r.plate)).toEqual(["دطس2177"]);
    expect(rows[0].mergedFrom).toBeUndefined();                     // مفيش نسخ لغلط سمع عادي
    // الدليل وصل بس الصف بتاعها رجع لوحده قبل كده ⇒ مفيش تكرار
    fleet.note(["دبر2102"], 1500); fleet.note(["دبر2102"], 3000);
    let r2 = placeLiveRow([row("دبر2102", 2250)], row("دبر2103", 7500, { mult: 3 }), distinct);
    r2 = [row("دبر2102", 2300), ...r2];
    fleet.note(["دبر2103"], 7500); fleet.note(["دبر2103"], 9000);
    r2 = restoreFleetRows(r2, distinct);
    expect(r2.map((r) => r.plate).sort()).toEqual(["دبر2102", "دبر2103"]);
  });

  it("من غير أسطول خالص ⇒ restoreFleetRows مابيغيّرش حاجة (نفس المصفوفة)", () => {
    const rows = [row("سار8888", 1000), row("حيو3456", 3000)];
    expect(restoreFleetRows(rows, () => false)).toBe(rows);
    expect(restoreFleetRows(rows, undefined)).toBe(rows);
  });

  it("وغلط السمع لسه بيتلمّ عادي مع الدليل", () => {
    const fleet = new FleetMemory();
    fleet.note(["حبل1234"], 0); fleet.note(["حبل1234", "حبل1235"], 1500); fleet.note(["حبل1235"], 3000);
    // حبل1284 = غلط سمع لـحبل1234 (اتقرت مرة)
    fleet.note(["حبل1284"], 1000);
    const distinct = (x: string, y: string) => fleet.distinct(x, y);
    const out = placeLiveRow([row("حبل1234", 1000, { mult: 3 })], row("حبل1284", 2500, { provisional: true, mult: 1 }), distinct);
    expect(out.length).toBe(1);
    expect(out[0].plate).toBe("حبل1234");
  });
});

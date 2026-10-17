/**
 * جدول اللوحات — الأعمدة من الشيت، وبيانات السيارة للمطلوب بس.
 */
import { describe, it, expect } from "vitest";
import {
  plateDetailHeaders,
  plateStatusKind,
  plateRowCells,
  buildPlateRow,
} from "../plateTable";
import type { BankSheet } from "../bankSheet";
import type { PlateEntry } from "../plateEntry";

const sheet = {
  fileName: "s.xlsx",
  sheetName: "بيانات",
  headers: ["اللوحه", "النوع", "البنك", "الشاص"],
  plateColumn: "اللوحه",
  rows: [],
  index: new Map(),
  plates: [],
  skipped: 0,
} as unknown as BankSheet;

const entry = (over: Partial<PlateEntry> = {}): PlateEntry =>
  ({
    id: "e1",
    review: { letters: ["ر", "ه", "د"], digits: "4724", plate: "رهد4724" },
    match: { kind: "none", similarity: 0 },
    pin: null,
    capturedAt: 1000,
    source: "live",
    ...over,
  }) as unknown as PlateEntry;

describe("plateDetailHeaders", () => {
  it("بترجّع الترويسات بلا عمود اللوحة", () => {
    expect(plateDetailHeaders(sheet)).toEqual(["النوع", "البنك", "الشاص"]);
  });
  it("مافيش شيت ⇒ قايمة فاضية، بلا انفجار", () => {
    expect(plateDetailHeaders(null)).toEqual([]);
    expect(plateDetailHeaders(undefined)).toEqual([]);
  });
});

describe("plateStatusKind", () => {
  it("exact ⇒ مطلوبة · none ⇒ عادية (مافيش تقريبي هنا)", () => {
    expect(plateStatusKind(entry({ match: { kind: "exact", similarity: 100 } as never }))).toBe("wanted");
    expect(plateStatusKind(entry())).toBe("normal");
  });
});

describe("plateRowCells", () => {
  const headers = ["النوع", "البنك", "الشاص"];
  it("🔴 لوحة مطلوبة ⇒ الخلايا من صف الشيت", () => {
    const e = entry({
      match: { kind: "exact", similarity: 100, row: { النوع: "تويوتا", البنك: "الأهلي", الشاص: "JT123" } } as never,
    });
    expect(plateRowCells(e, headers)).toEqual(["تويوتا", "الأهلي", "JT123"]);
  });
  it("🔵 لوحة عادية (مش في الشيت) ⇒ خلايا فاضية", () => {
    expect(plateRowCells(entry(), headers)).toEqual(["", "", ""]);
  });
  it("خانة ناقصة في الصف ⇒ فاضية مش undefined", () => {
    const e = entry({ match: { kind: "exact", similarity: 100, row: { النوع: "كيا" } } as never });
    expect(plateRowCells(e, headers)).toEqual(["كيا", "", ""]);
  });
});

describe("buildPlateRow", () => {
  const headers = ["النوع", "البنك"];
  it("مطلوبة ⇒ hasCarData=true", () => {
    const e = entry({ match: { kind: "exact", similarity: 100, row: { النوع: "نيسان", البنك: "الراجحي" } } as never });
    const r = buildPlateRow(e, headers);
    expect(r.status).toBe("wanted");
    expect(r.hasCarData).toBe(true);
    expect(r.cells).toEqual(["نيسان", "الراجحي"]);
    expect(r.plate).toBe("رهد4724");
  });
  it("عادية ⇒ hasCarData=false والخلايا فاضية", () => {
    const r = buildPlateRow(entry(), headers);
    expect(r.status).toBe("normal");
    expect(r.hasCarData).toBe(false);
    expect(r.cells).toEqual(["", ""]);
  });
  it("مافيش أعمدة (مافيش شيت) ⇒ صف بلا خلايا، بلا انفجار", () => {
    const r = buildPlateRow(entry(), []);
    expect(r.cells).toEqual([]);
    expect(r.letters).toEqual(["ر", "ه", "د"]);
  });
});

describe("confidenceTier + tierCounts — ملخّص الدرجات", () => {
  it("agreed/edited ⇒ مؤكّدة · conflict/padded ⇒ نظرة · shaky/unreviewed ⇒ ناقص", async () => {
    const { confidenceTier } = await import("../plateTable");
    expect(confidenceTier("agreed")).toBe("high");
    expect(confidenceTier("edited")).toBe("high");
    expect(confidenceTier("conflict")).toBe("check");
    expect(confidenceTier("padded")).toBe("check");
    expect(confidenceTier("shaky")).toBe("weak");
    expect(confidenceTier("unreviewed")).toBe("weak");
    expect(confidenceTier(undefined)).toBe("high"); // بطاقة مجمّع
  });
  it("tierCounts بتعدّ صح", async () => {
    const { tierCounts } = await import("../plateTable");
    const es = [
      entry({ stage: "agreed" } as never),
      entry({ stage: "conflict" } as never),
      entry({ stage: "conflict" } as never),
      entry({ stage: "shaky" } as never),
    ];
    expect(tierCounts(es)).toEqual({ high: 1, check: 2, weak: 1 });
  });
});

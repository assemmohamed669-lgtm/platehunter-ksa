import { describe, it, expect } from "vitest";
import { groupResultsBySource } from "@/lib/resultWindows";
import type { MatchResult } from "@/lib/plateParser";

const mk = (srcIdx: number, srcLabel?: string): MatchResult =>
  ({ referralRow: {}, status: "exact", dataIdx: 0, srcIdx, srcLabel } as MatchResult);

describe("عنوان نافذة النتيجة", () => {
  it("سجلات المجموعة ليها عنوانها مش «داتا ٩٠٠١»", () => {
    const w = groupResultsBySource([mk(0), mk(9000, "نتيجة فرز سجلات المجموعة")]);
    expect(w).toHaveLength(2);
    expect(w[1].title).toBe("نتيجة فرز سجلات المجموعة");
  });

  it("ملفات الداتا العادية زي ما هي", () => {
    const w = groupResultsBySource([mk(0), mk(1)]);
    expect(w.map((x) => x.title)).toEqual(["نتيجة فرز داتا 1", "نتيجة فرز داتا 2"]);
  });

  it("ملف واحد = نافذة بلا عنوان (السلوك القديم)", () => {
    expect(groupResultsBySource([mk(0), mk(0)])[0].title).toBeNull();
  });

  it("المجموعة لوحدها بتاخد عنوانها برضه", () => {
    expect(groupResultsBySource([mk(9000, "نتيجة فرز سجلات المجموعة")])[0].title)
      .toBe("نتيجة فرز سجلات المجموعة");
  });
});

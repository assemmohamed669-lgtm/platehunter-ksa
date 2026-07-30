import { describe, it, expect } from "vitest";
import { foldersToPrune } from "../scripts/lib/retention.mjs";

/**
 * كل نسخة ~٣٠ ميجا. نسخة يومية بلا تنظيف = ~٩٠٠ ميجا في الشهر على OneDrive،
 * وفي الآخر المساحة تخلص والنسخة تفشل بالصمت. الدالة دي بتحدّد اللي يتمسح.
 */
describe("foldersToPrune", () => {
  const names = [
    "2026-07-28_23-00",
    "2026-07-29_23-00",
    "2026-07-30_23-00",
    "2026-07-31_23-00",
  ];

  it("keeps the newest N and prunes the rest", () => {
    expect(foldersToPrune(names, 2)).toEqual([
      "2026-07-28_23-00",
      "2026-07-29_23-00",
    ]);
  });

  it("prunes nothing when the count is at or under the limit", () => {
    expect(foldersToPrune(names, 4)).toEqual([]);
    expect(foldersToPrune(names, 10)).toEqual([]);
  });

  it("sorts by name, not by input order", () => {
    const shuffled = [names[2], names[0], names[3], names[1]];
    expect(foldersToPrune(shuffled, 1)).toEqual([
      "2026-07-28_23-00",
      "2026-07-29_23-00",
      "2026-07-30_23-00",
    ]);
  });

  it("ignores names that are not backup stamps", () => {
    // A stray folder or file must never be deleted by the cleanup.
    const withJunk = [...names, "_tool", "ملاحظات", "README.txt"];
    const pruned = foldersToPrune(withJunk, 1);

    expect(pruned).not.toContain("_tool");
    expect(pruned).not.toContain("ملاحظات");
    expect(pruned).not.toContain("README.txt");
    expect(pruned).toEqual([
      "2026-07-28_23-00",
      "2026-07-29_23-00",
      "2026-07-30_23-00",
    ]);
  });

  it("never prunes when keep is zero or negative (guards against wiping all)", () => {
    expect(foldersToPrune(names, 0)).toEqual([]);
    expect(foldersToPrune(names, -3)).toEqual([]);
  });

  it("handles an empty directory", () => {
    expect(foldersToPrune([], 5)).toEqual([]);
  });
});

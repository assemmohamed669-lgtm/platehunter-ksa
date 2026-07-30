import { describe, it, expect } from "vitest";
import { fetchAllRows } from "../scripts/lib/paginate.mjs";

/**
 * Supabase caps a plain select at 1000 rows. A backup that ignores that cap
 * silently produces a truncated file that LOOKS complete — the exact failure
 * mode that made records appear "lost" before. These tests exist to make sure
 * the backup pages through everything.
 */
describe("fetchAllRows", () => {
  /** Builds a fetchPage that serves `total` rows in `pageSize` slices. */
  function makeSource(total, calls) {
    return async (from, to) => {
      calls.push([from, to]);
      const rows = [];
      for (let i = from; i <= to && i < total; i++) rows.push({ i });
      return rows;
    };
  }

  it("returns every row when the table is larger than one page", async () => {
    const calls = [];
    const rows = await fetchAllRows(makeSource(2500, calls), 1000);

    expect(rows).toHaveLength(2500);
    expect(rows[0]).toEqual({ i: 0 });
    expect(rows[2499]).toEqual({ i: 2499 });
  });

  it("requests contiguous, non-overlapping ranges", async () => {
    const calls = [];
    await fetchAllRows(makeSource(2500, calls), 1000);

    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after one call when the table fits in a single page", async () => {
    const calls = [];
    const rows = await fetchAllRows(makeSource(42, calls), 1000);

    expect(rows).toHaveLength(42);
    expect(calls).toHaveLength(1);
  });

  it("terminates when the row count is an exact multiple of the page size", async () => {
    const calls = [];
    const rows = await fetchAllRows(makeSource(2000, calls), 1000);

    expect(rows).toHaveLength(2000);
    // Two full pages, then one empty page proves the end.
    expect(calls).toHaveLength(3);
  });

  it("returns an empty array for an empty table", async () => {
    const calls = [];
    const rows = await fetchAllRows(makeSource(0, calls), 1000);

    expect(rows).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("throws instead of looping forever if a page never shrinks", async () => {
    // A broken source that always returns a full page would otherwise spin
    // until the process runs out of memory.
    const runaway = async () => Array.from({ length: 10 }, (_, i) => ({ i }));

    await expect(fetchAllRows(runaway, 10, { maxPages: 5 })).rejects.toThrow(
      /maxPages/
    );
  });
});

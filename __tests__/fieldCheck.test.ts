import { describe, it, expect } from "vitest";
import { plateKey, findDuplicateEntry, entryMatchesQuery, filterFieldEntries } from "@/lib/fieldCheck";
import type { FieldCheckEntry } from "@/lib/idb";

function entry(over: Partial<FieldCheckEntry>): FieldCheckEntry {
  return {
    id: "1",
    plate: "أبح1234",
    row: {},
    method: "متشيكة بالكاميرا",
    checkedAt: "2026-07-07T10:00:00.000Z",
    ...over,
  };
}

describe("plateKey", () => {
  it("strips spaces and normalizes alef", () => {
    expect(plateKey("أ ب ح 1234")).toBe("ابح1234");
  });
  it("returns empty for blank", () => {
    expect(plateKey("   ")).toBe("");
  });
});

describe("findDuplicateEntry", () => {
  const entries = [entry({ id: "a", plate: "أبح1234" }), entry({ id: "b", plate: "قنص5678" })];

  it("finds an existing plate ignoring spaces/alef", () => {
    expect(findDuplicateEntry(entries, "ا ب ح 1234")?.id).toBe("a");
  });
  it("matches an English bank plate against its Arabic entry", () => {
    // bankPlateToArabic should convert; the stored one is Arabic
    expect(findDuplicateEntry([entry({ id: "x", plate: "نكد5678" })], "NKD 5678")?.id).toBe("x");
  });
  it("returns undefined when not present", () => {
    expect(findDuplicateEntry(entries, "دحر9999")).toBeUndefined();
  });
  it("returns undefined for a blank plate", () => {
    expect(findDuplicateEntry(entries, "  ")).toBeUndefined();
  });
});

describe("entryMatchesQuery", () => {
  const e = entry({ plate: "أبح1234", method: "متشيكة بالكاميرا", row: { "الطراز": "كامري", "الحي": "النرجس" } });

  it("returns true for an empty query", () => {
    expect(entryMatchesQuery(e, "")).toBe(true);
  });
  it("matches a plate fragment ignoring spaces", () => {
    expect(entryMatchesQuery(e, "1234")).toBe(true);
    expect(entryMatchesQuery(e, "ا ب ح")).toBe(true);
  });
  it("matches a row value", () => {
    expect(entryMatchesQuery(e, "كامري")).toBe(true);
    expect(entryMatchesQuery(e, "النرجس")).toBe(true);
  });
  it("matches the method label", () => {
    expect(entryMatchesQuery(e, "كاميرا")).toBe(true);
  });
  it("returns false when nothing matches", () => {
    expect(entryMatchesQuery(e, "زاباطا")).toBe(false);
  });
});

describe("filterFieldEntries", () => {
  const entries = [
    entry({ id: "a", plate: "أبح1234", row: { "الحي": "النرجس" } }),
    entry({ id: "b", plate: "قنص5678", row: { "الحي": "الياسمين" } }),
  ];
  it("returns all when query is blank", () => {
    expect(filterFieldEntries(entries, "  ")).toHaveLength(2);
  });
  it("narrows to matching entries", () => {
    const r = filterFieldEntries(entries, "الياسمين");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("b");
  });
});

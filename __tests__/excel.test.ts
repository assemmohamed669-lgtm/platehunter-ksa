import { describe, it, expect } from "vitest";
import { toSafeCacheFilename } from "@/lib/excel";

describe("toSafeCacheFilename", () => {
  it("strips Arabic from the default export name but keeps the ASCII date + extension", () => {
    expect(toSafeCacheFilename("اكسيل-05-07-2026.xlsx")).toBe("05-07-2026.xlsx");
  });

  it("keeps digits from an all-Arabic-letters plate audio name", () => {
    expect(toSafeCacheFilename("أبح1234.m4a")).toBe("1234.m4a");
  });

  it("leaves an already-ASCII filename essentially intact", () => {
    expect(toSafeCacheFilename("report-2026.xlsx")).toBe("report-2026.xlsx");
  });

  it("never yields an empty base or extension", () => {
    expect(toSafeCacheFilename("لوحة.xlsx")).toBe("file.xlsx"); // all-Arabic base → fallback
    expect(toSafeCacheFilename("اسم")).toBe("file.dat");        // no extension at all
  });

  it("collapses spaces and punctuation runs into single dashes, no leading/trailing dash", () => {
    expect(toSafeCacheFilename("my  file (final).xlsx")).toBe("my-file-final.xlsx");
  });

  it("handles a leading-dot name safely (contrived — real inputs are always name.ext)", () => {
    // lastIndexOf('.') at 0 → treated as no real extension; the leading dot is
    // stripped and the remainder becomes the base. Result is still ASCII-safe,
    // which is all that matters for the cache write.
    expect(toSafeCacheFilename(".xlsx")).toBe("xlsx.dat");
  });
});

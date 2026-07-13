import { describe, it, expect } from "vitest";
import { toSafeCacheFilename, buildCsvBlob, buildSpreadsheetBlob, bytesToBase64 } from "@/lib/excel";

describe("bytesToBase64", () => {
  it("encodes an empty array as an empty string", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
  });

  it("matches the reference byte-by-byte encoding for small input", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111, 33]); // "Hello!"
    const reference = btoa(String.fromCharCode(...bytes));
    expect(bytesToBase64(bytes)).toBe(reference);
  });

  it("round-trips large input spanning multiple chunks (>32KB)", () => {
    const size = 100_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const encoded = bytesToBase64(bytes);
    const decoded = atob(encoded);
    expect(decoded.length).toBe(size);
    for (let i = 0; i < size; i++) expect(decoded.charCodeAt(i)).toBe(bytes[i]);
  });
});

describe("buildCsvBlob", () => {
  // Blob.text() strips a leading BOM on decode, so read raw bytes to assert
  // the BOM is really written, and use text() for the (BOM-free) content.
  async function bytes(blob: Blob) { return new Uint8Array(await blob.arrayBuffer()); }
  async function text(blob: Blob) { return await blob.text(); }

  it("starts with the UTF-8 BOM bytes so Excel reads Arabic correctly", async () => {
    const b = await bytes(buildCsvBlob([{ a: "حبل6121" }]));
    expect([b[0], b[1], b[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("writes a header row + data rows", async () => {
    const csv = await text(buildCsvBlob([
      { "رقم اللوحة": "حبل6121", "نوع السيارة": "ملاكي" },
    ]));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("رقم اللوحة,نوع السيارة");
    expect(lines[1]).toBe("حبل6121,ملاكي");
  });

  it("quotes values containing commas, quotes, or newlines", async () => {
    const csv = await text(buildCsvBlob([{ a: 'x,y', b: 'he said "hi"', c: "l1\nl2" }]));
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe('"x,y","he said ""hi""","l1\nl2"');
  });

  it("renders null/undefined as empty cells", async () => {
    const csv = await text(buildCsvBlob([{ a: null, b: undefined, c: "ok" } as any]));
    expect(csv.split("\r\n")[1]).toBe(",,ok");
  });

  it("handles an empty row list", async () => {
    expect(await text(buildCsvBlob([]))).toBe("");
  });
});

describe("buildSpreadsheetBlob", () => {
  it("returns an xlsx blob for normal data", () => {
    const { blob, ext } = buildSpreadsheetBlob([{ "رقم اللوحة": "حبل6121" }], "اللوحات");
    expect(ext).toBe("xlsx");
    expect(blob.size).toBeGreaterThan(0);
  });
});

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

import { describe, it, expect } from "vitest";
import { chunkRanges, NATIVE_CHUNK_BYTES, writeBlobInChunks, type CacheFs } from "@/lib/nativeFile";

/** Blob مزيّف — بايتس متسلسلة عشان نتأكد إن الترتيب والحدود صح. */
function fakeBlob(size: number) {
  return {
    size,
    slice(a: number, b: number) { return fakeBlob(Math.max(0, b - a)); },
  } as unknown as Blob;
}

/** فايل سيستم مزيّف بيسجّل كل نداء. */
function fakeFs() {
  const calls: { op: string; path: string; len: number }[] = [];
  const fs: CacheFs = {
    writeFile: async ({ path, data }) => { calls.push({ op: "write", path, len: data.length }); return { uri: `file://${path}` }; },
    appendFile: async ({ path, data }) => { calls.push({ op: "append", path, len: data.length }); },
    deleteFile: async ({ path }) => { calls.push({ op: "delete", path, len: 0 }); },
    getUri: async ({ path }) => ({ uri: `file://${path}` }),
  };
  return { fs, calls };
}

describe("chunkRanges", () => {
  it("قطعة واحدة للملف الصغير", () => {
    expect(chunkRanges(100, 300)).toEqual([[0, 100]]);
  });

  it("بيقسّم بالتساوي ويغطّي الملف كله بلا فجوة ولا تداخل", () => {
    const r = chunkRanges(1000, 300);
    expect(r).toEqual([[0, 300], [300, 600], [600, 900], [900, 1000]]);
    expect(r[0][0]).toBe(0);
    expect(r[r.length - 1][1]).toBe(1000);
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBe(r[i - 1][1]);
  });

  it("ملف فاضي → مفيش قطع", () => {
    expect(chunkRanges(0, 300)).toEqual([]);
  });

  it("حجم القطعة الافتراضي مضاعف لـ٣ — يعني base64 بلا حشو (=) في النص", () => {
    // كل قطعة إلا الأخيرة لازم تبقى مضاعف ٣، وإلا الـbase64 بتاعها بيتحشى
    // بـ«=» وتركيب القطع ببعض بيطلع ملف بايظ.
    expect(NATIVE_CHUNK_BYTES % 3).toBe(0);
  });
});

describe("writeBlobInChunks", () => {
  const b64 = async (b: Blob) => "x".repeat(Math.ceil(b.size / 3) * 4);

  it("الملف الصغير بيتكتب بنداء واحد (من غير حذف ولا append)", async () => {
    const { fs, calls } = fakeFs();
    const uri = await writeBlobInChunks(fs, "CACHE", "a.xlsx", fakeBlob(1000), b64, 3000);
    expect(uri).toBe("file://a.xlsx");
    expect(calls.map((c) => c.op)).toEqual(["write"]);
  });

  it("الملف الكبير بيتكتب على دفعات: حذف + write + append…", async () => {
    const { fs, calls } = fakeFs();
    const uri = await writeBlobInChunks(fs, "CACHE", "big.xlsx", fakeBlob(1000), b64, 300);
    expect(uri).toBe("file://big.xlsx");
    expect(calls.map((c) => c.op)).toEqual(["delete", "write", "append", "append", "append"]);
  });

  it("مافيش نداء واحد بيشيل الملف كله في الذاكرة", async () => {
    // ده جوهر الإصلاح: الكراش كان لإن base64 الملف كله (٧٩ ميجا) بيتبعت مرة واحدة.
    const { fs, calls } = fakeFs();
    const size = 80 * 1024 * 1024;
    await writeBlobInChunks(fs, "CACHE", "huge.xlsx", fakeBlob(size), b64, NATIVE_CHUNK_BYTES);
    const biggest = Math.max(...calls.map((c) => c.len));
    expect(biggest).toBeLessThanOrEqual(Math.ceil(NATIVE_CHUNK_BYTES / 3) * 4);
    expect(biggest).toBeLessThan(size / 10);
  });

  it("فشل الحذف (الملف مش موجود أصلاً) مابيوقفش الكتابة", async () => {
    const { fs, calls } = fakeFs();
    fs.deleteFile = async () => { throw new Error("File does not exist"); };
    const uri = await writeBlobInChunks(fs, "CACHE", "b.xlsx", fakeBlob(1000), b64, 300);
    expect(uri).toBe("file://b.xlsx");
    expect(calls.filter((c) => c.op === "append").length).toBe(3);
  });

  it("لو writeFile مارجّعتش uri بنجيبه بـgetUri", async () => {
    const { fs } = fakeFs();
    fs.writeFile = async () => ({ uri: "" });
    const uri = await writeBlobInChunks(fs, "CACHE", "c.xlsx", fakeBlob(1000), b64, 300);
    expect(uri).toBe("file://c.xlsx");
  });
});

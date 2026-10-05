// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { base64ToBlob, readCacheFileBlob, type CacheReadDeps } from "@/lib/incomingFileRead";

/**
 * المالك (٥ أكتوبر ٢٠٢٦): «لما برفع عن طريق الواتس اب واضيف داتا عاديه وداتا اضافيه بيأخر وياخد
 * وقت علي مايحمل الملف … ممكن تخليه اسرع بس طبعا ميأثرش علي قرايه البيانات اللي في الملف».
 *
 * الملف الجاي من واتساب كان بيتقرا من الكاش **كنص base64 كله في نداء واحد** عبر جسر Capacitor
 * (ملف ٢٠ ميجا = ٢٧ ميجا نص بيعدّي الجسر) وبعدين بيتفكّ حرف حرف. دلوقتي بيتقرا **بايتات على طول**
 * (`convertFileSrc` + `fetch`) — ولو أي حاجة اختلفت (الحجم مش مظبوط / فشل) بيرجع للطريقة القديمة.
 */
const bytes = (b: Blob) => b.arrayBuffer().then((a) => Array.from(new Uint8Array(a)));
const SAMPLE = [0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x10, 0x80, 0x7f, 0x41];
const SAMPLE_B64 = Buffer.from(SAMPLE).toString("base64");

describe("فكّ الـbase64 (الطريقة القديمة/الآيفون) — بالبايت", () => {
  it("🔴 نفس البايتات بالظبط", async () => {
    expect(await bytes(await base64ToBlob(SAMPLE_B64, "application/octet-stream"))).toEqual(SAMPLE);
  });
  it("لو الطريقة السريعة فشلت ⇒ الفكّ اليدوي، ونفس البايتات", async () => {
    const orig = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no data urls"); }));
    try {
      expect(await bytes(await base64ToBlob(SAMPLE_B64, "application/octet-stream"))).toEqual(SAMPLE);
    } finally { vi.stubGlobal("fetch", orig); }
  });
});

function deps(over: Partial<CacheReadDeps> = {}) {
  const d: CacheReadDeps = {
    getUri: vi.fn(async () => "file:///data/user/0/com.platehunter.ksa/cache/incoming_1.xlsx"),
    stat: vi.fn(async () => SAMPLE.length),
    convertFileSrc: vi.fn((u: string) => u.replace("file://", "https://platehunter-ksa.vercel.app/_capacitor_file_")),
    fetchBlob: vi.fn(async () => new Blob([new Uint8Array(SAMPLE)])),
    readBase64: vi.fn(async () => SAMPLE_B64),
    ...over,
  };
  return d;
}

describe("🔴 قراية ملف الكاش (أندرويد)", () => {
  it("🔴 بايتات على طول من غير ما الملف يعدّي الجسر كنص", async () => {
    const d = deps();
    const b = await readCacheFileBlob("incoming_1.xlsx", d);
    expect(await bytes(b)).toEqual(SAMPLE);
    expect(d.fetchBlob).toHaveBeenCalledWith("https://platehunter-ksa.vercel.app/_capacitor_file_/data/user/0/com.platehunter.ksa/cache/incoming_1.xlsx");
    expect(d.readBase64).not.toHaveBeenCalled();
  });

  it("🔴 الحجم مش مظبوط ⇒ الطريقة القديمة (مافيش ملف ناقص يتقرا)", async () => {
    const d = deps({ fetchBlob: vi.fn(async () => new Blob([new Uint8Array(SAMPLE.slice(0, 4))])) });
    expect(await bytes(await readCacheFileBlob("incoming_1.xlsx", d))).toEqual(SAMPLE);
    expect(d.readBase64).toHaveBeenCalledWith("incoming_1.xlsx");
  });

  it("الطريقة السريعة فشلت ⇒ الطريقة القديمة", async () => {
    const d = deps({ fetchBlob: vi.fn(async () => { throw new Error("404"); }) });
    expect(await bytes(await readCacheFileBlob("incoming_1.xlsx", d))).toEqual(SAMPLE);
  });

  it("مش عارفين الحجم ⇒ بنقبل اللي جه لو مش فاضي", async () => {
    const d = deps({ stat: vi.fn(async () => { throw new Error("no stat"); }) });
    expect(await bytes(await readCacheFileBlob("incoming_1.xlsx", d))).toEqual(SAMPLE);
    expect(d.readBase64).not.toHaveBeenCalled();
  });
});

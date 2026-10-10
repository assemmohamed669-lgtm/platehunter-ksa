import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🖼️ صور الفرز كلها **مرة واحدة** — المالك (١١ أكتوبر ٢٠٢٦): «في صفحه الفرز سواء فرز جديد او كلي او لصق نصي ...
 * لما يشارك وطالع ... كذا ورقه صورة يتشاركو كلهم مرة واحده لان دلوقتي بيتشاركو صورة بصورة».
 */
const native = { on: false };
const writeFile = vi.fn(async ({ path: p }: { path: string }) => ({ uri: `file:///cache/${p}` }));
const nativeShare = vi.fn(async (_o: unknown) => ({}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock("@capacitor/filesystem", () => ({ Filesystem: { writeFile }, Directory: { Cache: "CACHE" } }));
vi.mock("@capacitor/share", () => ({ Share: { share: nativeShare } }));

import { shareImagesWithText } from "@/lib/share";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("🔴 shareImagesWithText — كل الصور في مشاركة واحدة", () => {
  beforeEach(() => { native.on = false; writeFile.mockClear(); nativeShare.mockClear(); });

  it("🔴 الموبايل (أندرويد/آيفون): ملف لكل صورة بأسماء مختلفة ونداء مشاركة **واحد** فيه كلهم", async () => {
    native.on = true;
    const r = await shareImagesWithText([PNG, PNG, PNG], "فرز كلي — ٣ صور", ["a-1.png", "a-2.png", "a-3.png"], "فرز كلي");
    expect(r).toBe("shared");
    expect(writeFile.mock.calls.map((c) => c[0].path)).toEqual(["plate-share-1.png", "plate-share-2.png", "plate-share-3.png"]);
    expect(nativeShare).toHaveBeenCalledTimes(1);
    expect(nativeShare.mock.calls[0][0]).toMatchObject({
      files: ["file:///cache/plate-share-1.png", "file:///cache/plate-share-2.png", "file:///cache/plate-share-3.png"],
      text: "فرز كلي — ٣ صور",
    });
  });

  it("المندوب لغى ⇒ «cancelled» من غير ما نكمّل لطريقة تانية", async () => {
    native.on = true;
    nativeShare.mockRejectedValueOnce(Object.assign(new Error("Share canceled"), {}));
    expect(await shareImagesWithText([PNG, PNG], "x", ["1.png", "2.png"], "t")).toBe("cancelled");
  });

  it("🔴 المتصفّح: navigator.share مرة واحدة بكل الملفات", async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { canShare: () => true, share });
    const r = await shareImagesWithText([PNG, PNG], "نص", ["x-1.png", "x-2.png"], "عنوان");
    expect(r).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files.map((f) => f.name)).toEqual(["x-1.png", "x-2.png"]);
  });

  it("جهاز مابيدعمش كذا ملف ⇒ «unsupported» (والأزرار اللي تحت كل صورة لسه شغّالة)", async () => {
    Object.assign(navigator, { canShare: () => false, share: vi.fn() });
    expect(await shareImagesWithText([PNG, PNG], "نص", ["1.png", "2.png"], "t")).toBe("unsupported");
  });
});

describe("🔴 زرار «مشاركة كل الصور» في معاينة صور الفرز", () => {
  const btn = readFileSync(path.resolve(__dirname, "../components/ShareSortButton.tsx"), "utf8").replace(/\r\n/g, "\n");
  const page = readFileSync(path.resolve(__dirname, "../app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 بيظهر لما الصور أكتر من واحدة وبيبعتهم كلهم في نداء واحد", () => {
    expect(btn).toMatch(/shareAllAtOnce && images\.length > 1/);
    expect(btn).toMatch(/onClick=\{\(\) => void shareAll\(images\)\}/);
    expect(btn).toMatch(/shareImagesWithText\(imgs, /);
    expect(btn).toMatch(/مشاركة كل الصور مرة واحدة/);
  });
  it("🔴 كل أزرار المشاركة في صفحة الفرز (جديد/كلي/لصق نصي) — للكل (المالك «انشر للكل» ١١ أكتوبر)", () => {
    expect((page.match(/\n\s+shareAllAtOnce\n/g) ?? []).length).toBe(6);   // ٣ للفرز + ٣ للصق
    expect(page).not.toMatch(/isSuper/);
  });
});

import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";

/**
 * النص التاني من الوقفة: `indexedDB.open` نفسه اللي مابيردّش.
 *
 * على الآيفون ممكن الفتح يفضل معلّق (اتصال قديم لسه ماسك، أو خدمة التخزين
 * ماتت) — وساعتها **كل** عملية بعده بتستنى وعد عمره ما هيرجع، وصفحة السجلات
 * تفضل على «جاري التحميل...» للأبد من غير ولا رسالة.
 *
 * المطلوب: بعد مهلة معقولة يرفض — فالصفحة تقول «فيه مشكلة» بدل ما تتجمّد.
 */
describe("🍏 فتح التخزين اللي مابيردّش", () => {
  it("🔴 الفتح معلّق ⇒ القراءة بترفض بمهلة بدل ما تعلّق للأبد", async () => {
    vi.resetModules();
    const spy = vi.spyOn(indexedDB, "open").mockImplementation(() => ({}) as IDBOpenDBRequest);
    vi.useFakeTimers();
    try {
      const { getAllFieldCheckEntries } = await import("@/lib/idb");
      const p = getAllFieldCheckEntries();
      const settled = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(120_000);
      await settled;
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
      vi.resetModules();
    }
  });
});

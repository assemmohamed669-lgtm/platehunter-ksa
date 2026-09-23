import { describe, it, expect } from "vitest";
import { nearestWindow, pruneWindows, TYPE_BUF_KEEP_MS } from "@/lib/typeForPlate";

/**
 * 🔴 **كنا بنسأل كوهير عن كل نافذة — والمفروض عن كل لوحة.**
 *
 * المندوب بيبعت نافذة كل ١.٥ث، واللوحة الواحدة بتتغطّى بـ٣-٤ نوافذ.
 * يعني كنا بنحمّل سيرفر النوع **٣-٤ أضعاف** اللازم، وأغلب الطلبات على
 * نوافذ مالهاش لوحة أصلاً.
 *
 * وسيرفر النوع طاقته ~٤ متوازي (قياس ٢٣ سبتمبر: عند ١٠ مناديب بيرفض
 * ٦٠٪ من الطلبات). فالتقليل ده هو اللي بيخلّيه يلحق.
 *
 * ⇒ بنخزّن آخر نوافذ، وأول ما الإجماع يأكّد لوحة بنبعت **نافذة واحدة** —
 *   أقربها لزمن اللوحة.
 */
describe("اختيار نافذة النوع", () => {
  const W = [
    { tMs: 1000, wav: "a" }, { tMs: 2500, wav: "b" },
    { tMs: 4000, wav: "c" }, { tMs: 5500, wav: "d" },
  ];

  it("بياخد أقرب نافذة لزمن اللوحة", () => {
    expect(nearestWindow(W, 4200)?.wav).toBe("c");
    expect(nearestWindow(W, 1100)?.wav).toBe("a");
  });

  it("اللوحة بين نافذتين ⇒ الأقرب", () => {
    // المنتصف بين ٢٥٠٠ و٤٠٠٠ هو ٣٢٥٠
    expect(nearestWindow(W, 3200)?.wav).toBe("b");
    expect(nearestWindow(W, 3300)?.wav).toBe("c");
  });

  it("مافيش نوافذ ⇒ null", () => {
    expect(nearestWindow([], 1000)).toBeNull();
  });

  it("🔴 نافذة بعيدة جداً مابتتاخدش — أحسن من نوع غلط", () => {
    expect(nearestWindow(W, 60_000)).toBeNull();
  });

  it("التنضيف بيسيب اللي جوّه المدة", () => {
    const out = pruneWindows(W, 5500);
    expect(out.every((w) => 5500 - w.tMs <= TYPE_BUF_KEEP_MS)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it("والقديم بيتشال", () => {
    expect(pruneWindows(W, 1000 + TYPE_BUF_KEEP_MS + 1).map((w) => w.wav)).not.toContain("a");
  });
});

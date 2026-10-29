import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROUP_RECORDS_WAIT_MS, pagesUpTo, waitUpTo } from "./groupRecordsWait";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const never = <T,>() => new Promise<T>(() => {});

describe("waitUpTo — استنا ليه حد", () => {
  it("خلص بدري ⇒ true", async () => {
    await expect(waitUpTo(Promise.resolve(1), 1000)).resolves.toBe(true);
  });
  it("وقع ⇒ true (الفرز المحلي يكمّل زي الأول)", async () => {
    await expect(waitUpTo(Promise.reject(new Error("x")), 1000)).resolves.toBe(true);
  });
  it("مفيش حاجة نستناها ⇒ true", async () => {
    await expect(waitUpTo(null, 1000)).resolves.toBe(true);
  });
  it("النت معلّق ⇒ false بعد الحد بالظبط، مش بعد دقايق", async () => {
    const p = waitUpTo(never(), 1000);
    await vi.advanceTimersByTimeAsync(999);
    let done = false; void p.then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe(false);
  });
});

describe("pagesUpTo — صفحات السيرفر لحد ما تخلص أو الوقت يخلص", () => {
  it("بيلم الصفحات لحد صفحة ناقصة", async () => {
    const page = vi.fn(async (from: number) => ({ data: from === 0 ? [1, 2] : [3], error: null }));
    await expect(pagesUpTo(page, 2, 1000)).resolves.toEqual({ rows: [1, 2, 3], late: false });
    expect(page.mock.calls.map((c) => c[0])).toEqual([0, 2]);
  });

  it("النت معلّق ⇒ بيرجع اللي وصل + late، والطلب الطاير بيتلغي", async () => {
    let signal: AbortSignal | null = null;
    const page = (from: number, s: AbortSignal) => {
      signal = s;
      return from === 0 ? Promise.resolve({ data: [1, 2], error: null }) : never<{ data: number[]; error: null }>();
    };
    const p = pagesUpTo(page, 2, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ rows: [1, 2], late: true });
    expect(signal!.aborted).toBe(true);
  });

  it("غلط من السيرفر نفسه (فيه code) ⇒ يقف باللي وصل من غير رسالة — زي الأول", async () => {
    const page = async () => ({ data: null, error: { code: "42883", message: "function does not exist" } });
    await expect(pagesUpTo(page, 2, 1000)).resolves.toEqual({ rows: [], late: false });
  });

  it("النت وقع (غلط من غير code) ⇒ late — النتيجة ناقصة والمندوب لازم يعرف", async () => {
    const page = async () => ({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expect(pagesUpTo(page, 2, 1000)).resolves.toEqual({ rows: [], late: true });
  });

  it("رمى ⇒ late", async () => {
    const page = async (): Promise<{ data: number[]; error: null }> => { throw new TypeError("Failed to fetch"); };
    await expect(pagesUpTo(page, 2, 1000)).resolves.toEqual({ rows: [], late: true });
  });
});

describe("الحد", () => {
  it("ثواني مش دقايق — وأطول من رحلة النت العادية", () => {
    expect(GROUP_RECORDS_WAIT_MS).toBeGreaterThanOrEqual(10_000);
    expect(GROUP_RECORDS_WAIT_MS).toBeLessThanOrEqual(30_000);
  });
});

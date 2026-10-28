import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITS_PULL_GAP_MS, __resetRecordEdits, ensureRecordEdits, waitRecordEdits } from "./recordEditsPull";

/**
 * 📥 المالك (٢٤ أكتوبر ٢٠٢٦): «مليتو (الحي والشارع) بس عايزك تتأكد ان المندوب لما بيفرز بعد ما يتملي بيطلع معاه كل
 * بيانات اللوحات … وتبقي موجودة في السجلات … ولو صدّر». التعديلات كانت بتنزل الموبايل لما يفتح «التشييك» بس، والبرنامج
 * بيفتح على «الفرز» (أو آخر صفحة) ⇒ الفرز كان بيطلع من غير الحي اللي اتملى. دلوقتي الفرز بينزّلها بنفسه.
 */
afterEach(() => { __resetRecordEdits(); vi.useRealTimers(); });

const ok = () => vi.fn(async () => ({ updated: 3 }));

describe("ensureRecordEdits", () => {
  it("أول مرة بينزّل، وطول ما التنزيل شغّال نفس الوعد (مرة واحدة)", async () => {
    const pull = ok();
    const a = ensureRecordEdits("u1", pull, 1000);
    const b = ensureRecordEdits("u1", pull, 1100);
    expect(b).toBe(a);
    await a;
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("نزل من شوية (أقل من الفاصل) ⇒ مابيعيدش · بعد الفاصل ⇒ بينزّل تاني", async () => {
    const pull = ok();
    await ensureRecordEdits("u1", pull, 1000);
    await ensureRecordEdits("u1", pull, 1000 + EDITS_PULL_GAP_MS - 1);
    expect(pull).toHaveBeenCalledTimes(1);
    await ensureRecordEdits("u1", pull, 1000 + EDITS_PULL_GAP_MS);
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("فشل (نت/سيرفر) ⇒ المرة الجاية بتحاول على طول ومابيرميش", async () => {
    const pull = vi.fn()
      .mockResolvedValueOnce({ updated: 0, error: "offline" })
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({ updated: 1 });
    await expect(ensureRecordEdits("u1", pull, 1000)).resolves.toBeUndefined();
    await expect(ensureRecordEdits("u1", pull, 1001)).resolves.toBeUndefined();
    await ensureRecordEdits("u1", pull, 1002);
    expect(pull).toHaveBeenCalledTimes(3);
  });

  it("حساب تاني ⇒ بينزّل له", async () => {
    const pull = ok();
    await ensureRecordEdits("u1", pull, 1000);
    await ensureRecordEdits("u2", pull, 1001);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(pull).toHaveBeenLastCalledWith("u2");
  });

  it("من غير حساب ⇒ ولا حاجة", async () => {
    const pull = ok();
    await ensureRecordEdits("", pull, 1000);
    expect(pull).not.toHaveBeenCalled();
  });
});

describe("waitRecordEdits — الفرز بيستنى بس لحد حد", () => {
  it("خلص ⇒ true · مفيش ⇒ true", async () => {
    expect(await waitRecordEdits(Promise.resolve())).toBe(true);
    expect(await waitRecordEdits(null)).toBe(true);
  });

  it("اتأخّر (نت ضعيف) ⇒ false بعد الحد والفرز يكمّل", async () => {
    vi.useFakeTimers();
    const never = new Promise<void>(() => {});
    const w = waitRecordEdits(never, 500);
    await vi.advanceTimersByTimeAsync(600);
    expect(await w).toBe(false);
  });
});

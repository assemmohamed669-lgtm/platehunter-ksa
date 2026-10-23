import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TYPE_ASK_BACKOFF_MS, TYPE_ASK_MAX_PENDING, TypeAskQueue, type TypeAskResult } from "./typeAskQueue";

/**
 * 🛡️ أسئلة كوهير على موبايل المندوب (٢٣ أكتوبر ٢٠٢٦ — فتح النوع والملاحظة في Voice PRO للكل).
 * كل سؤال بيرفع ~١٦٠ك، و~٢.٥ سؤال للوحة. من غير الطابور ده النت الضعيف كان هيتزحم برفع كوهير **قدام** رفع نوافذ
 * اللوحات نفسها ⇒ اللوحة تتأخر. القاعدة: **سؤال واحد في المرة** · الإضافيين بيتسابوا وقت الزحمة/النت الوحش.
 */
type Job = { id: string; primary: boolean };

describe("TypeAskQueue", () => {
  let runs: string[];
  let finish: Array<(r: TypeAskResult) => void>;
  let now = 0;
  const run = (j: Job) => new Promise<TypeAskResult>((res) => { runs.push(j.id); finish.push(res); });
  const mk = () => new TypeAskQueue<Job>(run, () => now);

  beforeEach(() => { runs = []; finish = []; now = 1000; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("سؤال واحد في المرة — التاني بيستنى الأول يخلص", async () => {
    const q = mk();
    q.push({ id: "a", primary: true });
    q.push({ id: "b", primary: false });
    expect(runs).toEqual(["a"]);
    finish[0]("ok");
    await vi.runAllTimersAsync();
    expect(runs).toEqual(["a", "b"]);
  });

  it("الطابور مايكبرش — الأقدم من الإضافيين بيتشال", () => {
    const q = mk();
    q.push({ id: "p", primary: true });
    for (let i = 0; i < TYPE_ASK_MAX_PENDING + 3; i++) q.push({ id: `f${i}`, primary: false });
    expect(q.pendingCount).toBe(TYPE_ASK_MAX_PENDING);
  });

  it("كوهير مزحوم (503) ⇒ الإضافيين بيتسابوا فترة، والأساسي بيستنى ويتسأل بعدها", async () => {
    const q = mk();
    q.push({ id: "a", primary: true });
    finish[0]("busy");
    await vi.runAllTimersAsync();
    q.push({ id: "follow", primary: false });
    q.push({ id: "next-plate", primary: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toEqual(["a"]);                 // مافيش حاجة في فترة التهدية
    now += TYPE_ASK_BACKOFF_MS + 1;
    await vi.advanceTimersByTimeAsync(TYPE_ASK_BACKOFF_MS + 1);
    expect(runs).toEqual(["a", "next-plate"]);   // الأساسي اتسأل — الإضافي اتساب
  });

  it("النت فصل (fail) ⇒ نفس التهدية", async () => {
    const q = mk();
    q.push({ id: "a", primary: true });
    finish[0]("fail");
    await vi.runAllTimersAsync();
    q.push({ id: "f", primary: false });
    await vi.advanceTimersByTimeAsync(10);
    expect(runs).toEqual(["a"]);
  });

  it("سؤال معلّق مايقفلش الطابور للأبد (مهلة ⇒ زي النت الوحش: تهدية وبعدها الأساسي)", async () => {
    const q = mk();
    q.push({ id: "stuck", primary: true });
    q.push({ id: "b", primary: true });
    now += 9000;
    await vi.advanceTimersByTimeAsync(9000);
    expect(runs).toEqual(["stuck"]);
    now += TYPE_ASK_BACKOFF_MS + 1;
    await vi.advanceTimersByTimeAsync(TYPE_ASK_BACKOFF_MS + 1);
    expect(runs).toEqual(["stuck", "b"]);
  });

  it("clear ⇒ الطابور بيفضى (تسجيل جديد)", () => {
    const q = mk();
    q.push({ id: "a", primary: true });
    q.push({ id: "b", primary: false });
    q.clear();
    expect(q.pendingCount).toBe(0);
  });
});

import { describe, it, expect, vi } from "vitest";
import { createTelemetryQueue } from "@/lib/voiceTelemetry";
import type { TelBatch } from "@/lib/voiceTelemetry";

/** طابور الرفع: لو النت وقع الدفعة ماتضيعش، ولو الجهاز رفض التخزين يكمّل في الذاكرة. */
const batch = (id: string, endedAt = new Date().toISOString()): TelBatch => ({
  agent_id: "a1", session_id: id, session_started_at: endedAt, started_at: endedAt, ended_at: endedAt,
  platform: "", build: "", server: "",
  counts: { reads: 1, accepted: 1, rejected: 0, empty: 0, replays: 0, shown: 0, fails: {}, skips: {}, events_dropped: 0 },
  latency: { p50: 1, p95: 1, max: 1, model_p50: 1, n: 1 },
  events: [],
});

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("createTelemetryQueue", () => {
  it("بيرفع اللي في الطابور ويفضّيه لو نجح", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const q = createTelemetryQueue({ key: "k", storage: memStorage(), send });
    q.enqueue(batch("s1"));
    await q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].map((b: TelBatch) => b.session_id)).toEqual(["s1"]);
    expect(q.size()).toBe(0);
  });

  it("لو الرفع فشل (رجع false أو رمى) الدفعة بتفضل، والمرة الجاية بتترفع مع الجديدة", async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const q = createTelemetryQueue({ key: "k", storage: memStorage(), send });
    q.enqueue(batch("s1"));
    await q.flush();
    await q.flush();
    expect(q.size()).toBe(1);
    q.enqueue(batch("s2"));
    await q.flush();
    expect(send.mock.calls[2][0].map((b: TelBatch) => b.session_id)).toEqual(["s1", "s2"]);
    expect(q.size()).toBe(0);
  });

  it("سقف الطابور: بيحتفظ بالأحدث بس", () => {
    const q = createTelemetryQueue({ key: "k", storage: memStorage(), send: async () => true, maxQueued: 3 });
    for (let i = 1; i <= 5; i++) q.enqueue(batch("s" + i));
    expect(q.size()).toBe(3);
  });

  it("بيفتكر الطابور بعد قفل التطبيق (نفس التخزين)", async () => {
    const st = memStorage();
    const q1 = createTelemetryQueue({ key: "k", storage: st, send: async () => false });
    q1.enqueue(batch("old"));
    const send = vi.fn().mockResolvedValue(true);
    const q2 = createTelemetryQueue({ key: "k", storage: st, send });
    await q2.flush();
    expect(send.mock.calls[0][0][0].session_id).toBe("old");
  });

  it("الدفعات الأقدم من ٣ أيام بتترمى بدل ما تترفع", async () => {
    const st = memStorage();
    const old = new Date(Date.now() - 4 * 86_400_000).toISOString();
    st.setItem("k", JSON.stringify([batch("stale", old), batch("fresh")]));
    const send = vi.fn().mockResolvedValue(true);
    await createTelemetryQueue({ key: "k", storage: st, send }).flush();
    expect(send.mock.calls[0][0].map((b: TelBatch) => b.session_id)).toEqual(["fresh"]);
  });

  it("رفعتين في نفس الوقت ⇐ طلب واحد بس", async () => {
    let release!: (v: boolean) => void;
    const send = vi.fn().mockImplementation(() => new Promise<boolean>((r) => { release = r; }));
    const q = createTelemetryQueue({ key: "k", storage: memStorage(), send });
    q.enqueue(batch("s1"));
    const a = q.flush();
    const b = q.flush();
    release(true);
    await Promise.all([a, b]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("تخزين بايظ (بيرمي) مايوقفش حاجة — بيكمّل في الذاكرة", async () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    const send = vi.fn().mockResolvedValue(true);
    const q = createTelemetryQueue({ key: "k", storage: bad, send });
    expect(() => q.enqueue(batch("s1"))).not.toThrow();
    await q.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("رفعة على طابور فاضي ماتقفلش الرفعات اللي بعدها", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const q = createTelemetryQueue({ key: "k", storage: memStorage(), send });
    await q.flush();
    q.enqueue(batch("s1"));
    await q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.size()).toBe(0);
  });

  it("دفعة اتضافت وقت الرفع ماتضيعش لما الرفع ينجح", async () => {
    let release!: (v: boolean) => void;
    const send = vi.fn().mockImplementation(() => new Promise<boolean>((r) => { release = r; }));
    const q = createTelemetryQueue({ key: "k", storage: memStorage(), send });
    q.enqueue(batch("s1"));
    const p = q.flush();
    q.enqueue(batch("s2"));
    release(true);
    await p;
    expect(q.size()).toBe(1);
  });
});

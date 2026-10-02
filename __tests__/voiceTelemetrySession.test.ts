import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startTelemetrySession } from "@/lib/voiceTelemetry";
import type { TelBatch } from "@/lib/voiceTelemetry";

/** دورة جلسة المراقبة في Voice PRO: تبدأ مع التسجيل، ترفع كل دقيقتين، وتقفل مع الإيقاف. */
const fakeWin = () => {
  const ls = new Map<string, Set<() => void>>();
  return {
    addEventListener: (k: string, f: () => void) => { if (!ls.has(k)) ls.set(k, new Set()); ls.get(k)!.add(f); },
    removeEventListener: (k: string, f: () => void) => { ls.get(k)?.delete(f); },
    fire: (k: string) => ls.get(k)?.forEach((f) => f()),
    count: () => [...ls.values()].reduce((n, s) => n + s.size, 0),
  };
};

const base = (over: Partial<Parameters<typeof startTelemetrySession>[0]> = {}) => ({
  enabled: true, agentId: "a1", server: "voice.qannas-ksa.com", platform: "android", build: "b1",
  storage: null, send: vi.fn().mockResolvedValue(true), ...over,
});

describe("startTelemetrySession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("مقفولة (مش سوبر أدمن) أو من غير مندوب ⇐ null ومافيش أي حاجة بتشتغل", () => {
    expect(startTelemetrySession(base({ enabled: false }))).toBeNull();
    expect(startTelemetrySession(base({ agentId: null }))).toBeNull();
  });

  it("بتسجّل البداية بحالة النت، وبترفع كل دقيقتين", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const s = startTelemetrySession(base({ send, online: () => true, connection: () => "4g" }))!;
    s.tel.read({ tMs: 1, plate: "حبك1234", accepted: true, conf: 0.9, msWall: 500 });
    await vi.advanceTimersByTimeAsync(119_000);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(1);
    const b: TelBatch = send.mock.calls[0][0][0];
    const start = b.events.find((e) => e[0] === "e" && e[2] === "start")!;
    expect(String(start[3])).toContain("4g");
    expect(b.counts.reads).toBe(1);
    s.end("manual");
  });

  it("النت وقع ورجع وسط التسجيل ⇐ حدثين", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const win = fakeWin();
    const s = startTelemetrySession(base({ send, win }))!;
    win.fire("offline");
    win.fire("online");
    s.end("manual");
    await vi.runAllTimersAsync();
    const evs = send.mock.calls.flatMap((c) => c[0] as TelBatch[]).flatMap((b) => b.events);
    expect(evs.some((e) => e[2] === "offline")).toBe(true);
    expect(evs.some((e) => e[2] === "online")).toBe(true);
  });

  it("الإيقاف بيرفع آخر دفعة بسبب الوقف، وبيشيل المؤقّت والمستمعين", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const win = fakeWin();
    const s = startTelemetrySession(base({ send, win }))!;
    expect(win.count()).toBeGreaterThan(0);
    s.end("call");
    await vi.runAllTimersAsync();
    expect(win.count()).toBe(0);
    const b: TelBatch = send.mock.calls[0][0][0];
    const stop = b.events.find((e) => e[0] === "e" && e[2] === "stop")!;
    expect(String(stop[3])).toContain("call");
    send.mockClear();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("end مرتين مابيرفعش مرتين", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const s = startTelemetrySession(base({ send }))!;
    s.end("manual");
    s.end("manual");
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("الرفع بيرمي ⇐ مافيش استثناء بيطلع للصوت", async () => {
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const s = startTelemetrySession(base({ send }))!;
    await expect(vi.advanceTimersByTimeAsync(120_000)).resolves.not.toThrow();
    expect(() => s.end("manual")).not.toThrow();
  });
});

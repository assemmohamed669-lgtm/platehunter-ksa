import { describe, it, expect, vi } from "vitest";
import { probeVoiceHealth, isCleanupMinute, cronAuthorized } from "@/lib/voiceHealth";

/** المراقب من بره: /health بس، بمهلة — مابيلمسش الموديل ولا بيبعت صوت. */
describe("probeVoiceHealth", () => {
  it("سيرفر صاحي ⇐ ok + الزمن + الطلبات الشغّالة", async () => {
    let t = 1000;
    const fetchFn = vi.fn().mockImplementation(async () => {
      t += 250;
      return new Response(JSON.stringify({ ok: true, model: "ckpt-7500", inflight: 3, vram: { free_mb: 9000 } }), { status: 200 });
    });
    const row = await probeVoiceHealth({ url: "https://voice.example/health", fetchFn, now: () => t });
    expect(fetchFn.mock.calls[0][0]).toBe("https://voice.example/health");
    expect(row).toMatchObject({ target: "https://voice.example/health", ok: true, status: 200, ms: 250, inflight: 3, error: null });
    expect(row.detail).toMatchObject({ model: "ckpt-7500" });
  });

  it("رد 502/503 من النفق ⇐ مش ok والكود متسجّل", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    const row = await probeVoiceHealth({ url: "u", fetchFn });
    expect(row).toMatchObject({ ok: false, status: 502 });
    expect(row.error).toBe("http_502");
  });

  it("200 بس الجسم مش JSON أو ok=false ⇐ مش ok", async () => {
    const a = await probeVoiceHealth({ url: "u", fetchFn: vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })) });
    expect(a).toMatchObject({ ok: false, error: "bad_body" });
    const b = await probeVoiceHealth({ url: "u", fetchFn: vi.fn().mockResolvedValue(new Response('{"ok":false}', { status: 200 })) });
    expect(b.ok).toBe(false);
  });

  it("السيرفر مابيردّش ⇐ timeout ومابيرميش", async () => {
    const fetchFn = vi.fn().mockImplementation((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const row = await probeVoiceHealth({ url: "u", fetchFn, timeoutMs: 20 });
    expect(row).toMatchObject({ ok: false, status: null, error: "timeout" });
  });

  it("فشل شبكة ⇐ network ومابيرميش", async () => {
    const row = await probeVoiceHealth({ url: "u", fetchFn: vi.fn().mockRejectedValue(new TypeError("fetch failed")) });
    expect(row).toMatchObject({ ok: false, error: "network" });
  });
});

describe("isCleanupMinute", () => {
  it("التنضيف مرة في الساعة بس", () => {
    expect(isCleanupMinute(new Date("2026-10-03T10:07:30Z"))).toBe(true);
    expect(isCleanupMinute(new Date("2026-10-03T10:08:00Z"))).toBe(false);
  });
});

describe("cronAuthorized", () => {
  it("لو فيه CRON_SECRET لازم الهيدر يطابق", () => {
    expect(cronAuthorized("Bearer abc", "abc")).toBe(true);
    expect(cronAuthorized("Bearer xyz", "abc")).toBe(false);
    expect(cronAuthorized(null, "abc")).toBe(false);
  });
  it("من غير CRON_SECRET مسموح (وحارس الدقيقة هو اللي بيحمي)", () => {
    expect(cronAuthorized(null, undefined)).toBe(true);
    expect(cronAuthorized(null, "")).toBe(true);
  });
});

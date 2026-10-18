import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OUTBOX_KEY,
  OUTBOX_MAX,
  PLATES_MAX,
  buildRunReport,
  deviceInfo,
  loadOutbox,
  sendRunReport,
} from "./runTelemetry";

/**
 * 📋 تقرير كل تسجيل للسيرفر (١٨ أكتوبر ٢٠٢٦) — المالك: «أهم حاجه عايزين نعرف كل التقارير عن التسجيل».
 * الموبايل بيبعت اللي السيرفر مايعرفهوش: موقع كل لوحة، المطلوبة، الجهاز، الأغلاط اللي ماوصلتش، التصدير.
 */

const T0 = 1_760_000_000_000;
const entry = (plate: string, sec: number, extra: Record<string, unknown> = {}) =>
  ({
    id: `e-${plate}`,
    review: { plate },
    pin: { lat: 24.7, lng: 46.7, accuracy: 7.6, at: T0 + sec * 1000, ageMs: 300, stale: false },
    match: { kind: "none" },
    capturedAt: T0 + sec * 1000,
    source: "batch",
    vehicleType: "فان",
    ...extra,
  }) as never;

describe("buildRunReport", () => {
  it("بيلخّص اللوحات: الموقع والمطلوبة والنوع بثانية النطق", () => {
    const r = buildRunReport({
      kind: "run",
      agent: "عاصم",
      uid: "u-1",
      run: "20261018-151915-746",
      ok: true,
      clip: { id: "c1", label: "مقطع ٢", source: "record", sec: 104.04, bytes: 1_590_184, mime: "audio/webm", startedAtMs: T0 },
      entries: [
        entry("ابح1234", 3.2),
        entry("سبا7709", 9, { pin: null, match: { kind: "exact" } }),
      ],
      now: T0 + 200_000,
      dev: { platform: "ios", ua: "iPhone OS 18_7" },
    });
    expect(r).toMatchObject({ v: 1, kind: "run", uid: "u-1", agent: "عاصم", run: "20261018-151915-746", ok: true });
    expect(r.n_plates).toBe(2);
    expect(r.pinned).toBe(1);
    expect(r.wanted).toBe(1);
    expect(r.plates[0]).toEqual({ p: "ابح1234", t: 3.2, ty: "فان", acc: 8 });
    expect(r.plates[1]).toEqual({ p: "سبا7709", t: 9, ty: "فان", w: 1, acc: null });
    expect(r.clip).toMatchObject({ sec: 104.04, bytes: 1_590_184 });
    expect(new Date(r.at).getTime()).toBe(T0 + 200_000);
  });

  it("حدود: لوحات كتير وأغلاط طويلة مابتكبّرش التقرير", () => {
    const many = Array.from({ length: PLATES_MAX + 50 }, (_, i) => entry(`ابح${String(i).padStart(4, "0")}`, i));
    const r = buildRunReport({
      kind: "run",
      agent: "x",
      uid: null,
      entries: many,
      errors: Array.from({ length: 30 }, () => "غلط ".repeat(200)),
      clip: { startedAtMs: T0 },
    });
    expect(r.plates).toHaveLength(PLATES_MAX);
    expect(r.n_plates).toBe(PLATES_MAX + 50);
    expect(r.errors).toHaveLength(10);
    expect(r.errors!.every((e) => e.length <= 200)).toBe(true);
  });

  it("الفشل من غير لوحات بيتبعت بسببه", () => {
    const r = buildRunReport({ kind: "fail", agent: "x", uid: "u", ok: false, error: "السيرفر مش بيرد" });
    expect(r.kind).toBe("fail");
    expect(r.error).toBe("السيرفر مش بيرد");
    expect(r.plates).toEqual([]);
  });
});

describe("sendRunReport", () => {
  beforeEach(() => localStorage.clear());

  const rep = (n: number) => buildRunReport({ kind: "run", agent: "a", uid: "u", run: `r${n}` });

  it("بيبعت للسيرفر بالتوكن ويفضّي الصندوق", async () => {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([rep(0)]));
    const f = vi.fn(async () => new Response('{"ok":true,"saved":2}', { status: 200 }));
    const ok = await sendRunReport("https://batch.example", "tok-123", rep(1), f as never);
    expect(ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://batch.example/report");
    expect((init.headers as Record<string, string>)["X-Plate-Token"]).toBe("tok-123");
    const body = JSON.parse(String(init.body));
    expect(body.map((x: { run: string }) => x.run)).toEqual(["r0", "r1"]);
    expect(loadOutbox()).toEqual([]);
  });

  it("النت وقع ⇒ التقرير يستنى في الصندوق ويتبعت مع اللي بعده — ومابيرميش", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await sendRunReport("https://b", "t", rep(1), down as never)).toBe(false);
    const bad = vi.fn(async () => new Response("no", { status: 502 }));
    expect(await sendRunReport("https://b", "t", rep(2), bad as never)).toBe(false);
    expect(loadOutbox().map((x) => x.run)).toEqual(["r1", "r2"]);
    const up = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendRunReport("https://b", "t", rep(3), up as never)).toBe(true);
    expect(JSON.parse(String((up.mock.calls[0] as unknown as [string, RequestInit])[1].body)).length).toBe(3);
    expect(loadOutbox()).toEqual([]);
  });

  it("مافيش توكن ⇒ الصندوق بس", async () => {
    const f = vi.fn();
    expect(await sendRunReport("https://b", null, rep(1), f as never)).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(loadOutbox()).toHaveLength(1);
  });

  it("الصندوق ليه حد — الأقدم بيتشال", async () => {
    const down = vi.fn(async () => {
      throw new Error("x");
    });
    for (let i = 0; i < OUTBOX_MAX + 5; i++) await sendRunReport("https://b", "t", rep(i), down as never);
    const box = loadOutbox();
    expect(box).toHaveLength(OUTBOX_MAX);
    expect(box[box.length - 1].run).toBe(`r${OUTBOX_MAX + 4}`);
    expect(box[0].run).toBe("r5");
  });

  it("تخزين مقفول مابيوقّعش حاجة", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const down = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(sendRunReport("https://b", "t", rep(1), down as never)).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("deviceInfo", () => {
  it("المنصّة والمتصفّح والنت", () => {
    const d = deviceInfo();
    expect(d.platform).toBe("web");
    expect(typeof d.ua).toBe("string");
    expect(d.ua!.length).toBeLessThanOrEqual(240);
    expect(typeof d.online).toBe("boolean");
  });
});

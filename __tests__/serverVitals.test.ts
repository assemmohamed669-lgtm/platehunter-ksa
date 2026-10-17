/**
 * 🗃️ «الصندوق الأسود» برّه الجهاز (١٧ أكتوبر ٢٠٢٦).
 *
 * المالك: «هنعرف نجيب تقرير كامل عن السيرفر بحيث لو حصل حاجه نعرف السبب ونعدله؟».
 * سجلات إيطاليا بتموت معاها لو الجهاز وقع — فالفحص اللي Vercel بيعمله كل دقيقة بياخد
 * آخر سطر حالة (`/vitals` على وسيط المجمّع) ويحفظه في نفس صف `voice_health`.
 * 🔴 لازم مايبوّظش الفحص الأصلي أبداً: مهلة قصيرة، مابيرميش، وبياخد حقول معروفة بس
 *    (سيرفر بيرجّع حاجة غريبة مايملاش الجدول).
 */
import { describe, expect, it } from "vitest";
import { compactVitals, fetchServerVitals, VITALS_URL } from "@/lib/serverVitals";

const RAW = {
  t: 1792254148, age_s: 12,
  host: { load1: 0.37, ram_gb: 36.2, ram_limit_gb: 259.5, disk_free_gb: 53.7, junk: "x".repeat(5000) },
  gpu: { temp: 63, util: 8, mem_used: 6716, mem_total: 24467, power: 52.2, pstate: "P1", throttle: "0x0", sm_mhz: 2167 },
  plates: { ok: true, ms: 20, inflight: 0, device: "cuda", pid: 1655, age_s: 91978, rss_mb: 15077 },
  tunnel: { pid: 1650596, procs: 1, age_s: 22947, req: 52718, err: 213, ha: 4, bad: 0, good: 162, mode: "normal",
    edge_ms: [8, 17], req_1m: 150, err_1m: 1 },
  batch: { gateway: true, seg: true, inflight: 0, archive_free_gb: 53.7, cohere: true, cohere_rss_mb: 2531, tunnel: true },
  evil: { a: 1 },
};

describe("compactVitals — حقول معروفة بس", () => {
  it("بياخد اللي التقرير محتاجه ويشيل الباقي (الغريب والكبير)", () => {
    const v = compactVitals(RAW) as Record<string, Record<string, unknown>>;
    expect(Object.keys(v).sort()).toEqual(["age_s", "batch", "gpu", "host", "plates", "t", "tunnel"]);
    expect(v.gpu).toEqual(RAW.gpu);
    // pid والعدّادات الخام بيتحفظوا: التقرير بيعرف إعادة التشغيل (pid اتغيّر) ويحسب الطلبات من فرق العدّاد
    expect(v.plates).toEqual({ ok: true, ms: 20, inflight: 0, device: "cuda", pid: 1655, age_s: 91978, rss_mb: 15077 });
    expect(v.tunnel).toEqual({ pid: 1650596, procs: 1, age_s: 22947, req: 52718, err: 213, ha: 4, bad: 0, mode: "normal",
      edge_ms: [8, 17], req_1m: 150, err_1m: 1 });
    expect(v.host).not.toHaveProperty("junk");
    expect(JSON.stringify(v).length).toBeLessThan(1200);
  });

  it("قيم غلط النوع بتتشال، والنصوص بتتقصّ", () => {
    const v = compactVitals({ t: "x", gpu: { temp: "hot", pstate: "P".repeat(100) }, tunnel: { edge_ms: [1, "a", null, 3, 4, 5] } }) as Record<string, Record<string, unknown>>;
    expect(v.t).toBeUndefined();
    expect(v.gpu.temp).toBeUndefined();
    expect(String(v.gpu.pstate).length).toBeLessThanOrEqual(16);
    expect(v.tunnel.edge_ms).toEqual([1, null, null, 3]);
  });

  it("مش object ⇒ فاضي", () => {
    expect(compactVitals(null)).toEqual({});
    expect(compactVitals("hi")).toEqual({});
  });
});

describe("fetchServerVitals — مابيرميش ومابيعطّلش الفحص", () => {
  const ok = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("بالتوكن في الترويسة، والرد بيتصغّر", async () => {
    let seen: RequestInit | undefined;
    let seenUrl = "";
    const f = (async (u: string, init?: RequestInit) => { seenUrl = u; seen = init; return new Response(JSON.stringify(RAW)); }) as unknown as typeof fetch;
    const v = await fetchServerVitals({ token: "tok-1234567890", fetchFn: f });
    expect(seenUrl).toBe(VITALS_URL);
    expect((seen?.headers as Record<string, string>)["X-Plate-Token"]).toBe("tok-1234567890");
    expect((v as Record<string, unknown>).gpu).toEqual(RAW.gpu);
    expect(JSON.stringify(v)).not.toContain("tok-1234567890");
  });

  it("من غير توكن ⇒ مابينادي", async () => {
    let called = false;
    const f = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
    expect(await fetchServerVitals({ token: "", fetchFn: f })).toEqual({ error: "no_token" });
    expect(called).toBe(false);
  });

  it("كود غلط / جسم مش JSON / نت ⇒ {error} بس", async () => {
    expect(await fetchServerVitals({ token: "t", fetchFn: ok({ error: "no_vitals" }, 503) })).toEqual({ error: "http_503" });
    const bad = (async () => new Response("<html>")) as unknown as typeof fetch;
    expect(await fetchServerVitals({ token: "t", fetchFn: bad })).toEqual({ error: "bad_body" });
    const net = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await fetchServerVitals({ token: "t", fetchFn: net })).toEqual({ error: "network" });
  });

  it("السيرفر مابيردّش ⇒ بيقطع بعد المهلة (timeout) ومابيستناش", async () => {
    const hang = ((_u: string, init?: RequestInit) => new Promise((_, rej) => {
      init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await fetchServerVitals({ token: "t", fetchFn: hang, timeoutMs: 50 })).toEqual({ error: "timeout" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

/**
 * 🧮 سيرفر المجمّع من قناص — العنوان والترويسات والأخطاء (١٦ أكتوبر ٢٠٢٦).
 *
 * في المعمل المتصفّح كان بيكلّم Express (`/api/seg-chunks`) وهو اللي بيحط التوكن
 * ويلفّ الأخطاء. في قناص المتصفّح بيكلّم وسيط المجمّع على إيطاليا مباشرةً
 * (`batch.qannas-ksa.com` ⇐ batch_gateway.py) — فالحاجات دي بقت هنا.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  BATCH_BASE,
  BATCH_URL_KEY,
  chunksHeaders,
  chunksUrl,
  clearBatchBaseOverride,
  httpFailure,
  normalizeBatchBase,
  probeBatchServer,
  readBatchBase,
  saveBatchBaseOverride,
} from "../batchServer";

afterEach(() => {
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe("العنوان", () => {
  it("الافتراضي = النفق الثابت بتاع المجمّع (https)", () => {
    expect(BATCH_BASE).toBe("https://batch.qannas-ksa.com");
    expect(readBatchBase()).toBe(BATCH_BASE);
  });

  it("normalizeBatchBase: https بس (أو localhost للتجربة) — من غير / ولا مسار المسار", () => {
    expect(normalizeBatchBase("https://batch.qannas-ksa.com/")).toBe("https://batch.qannas-ksa.com");
    expect(normalizeBatchBase(" https://x.trycloudflare.com/chunks ")).toBe("https://x.trycloudflare.com");
    expect(normalizeBatchBase("https://x.example/health")).toBe("https://x.example");
    expect(normalizeBatchBase("http://localhost:8780")).toBe("http://localhost:8780");
    expect(normalizeBatchBase("http://127.0.0.1:8780/")).toBe("http://127.0.0.1:8780");
    // http لسيرفر بعيد = المتصفّح هيقفله (mixed content) ⇒ مرفوض
    expect(normalizeBatchBase("http://95.253.220.115:8780")).toBeNull();
    // توكن أو استعلام في اللينك = تسريب ⇒ مرفوض
    expect(normalizeBatchBase("https://u:p@x.example")).toBeNull();
    expect(normalizeBatchBase("https://x.example/?token=abc")).toBeNull();
    expect(normalizeBatchBase("")).toBeNull();
    expect(normalizeBatchBase("not a url")).toBeNull();
  });

  it("عنوان بديل (للسوبر أدمن) بيتحفظ ويتمسح — والغلط مابيتحفظش", () => {
    expect(saveBatchBaseOverride("http://localhost:8780/")).toBe(true);
    expect(localStorage.getItem(BATCH_URL_KEY)).toBe("http://localhost:8780");
    expect(readBatchBase()).toBe("http://localhost:8780");
    expect(saveBatchBaseOverride("http://evil.example")).toBe(false);
    expect(readBatchBase()).toBe("http://localhost:8780");
    clearBatchBaseOverride();
    expect(readBatchBase()).toBe(BATCH_BASE);
  });

  it("بديل متخزّن تالف ⇒ الافتراضي", () => {
    localStorage.setItem(BATCH_URL_KEY, "javascript:alert(1)");
    expect(readBatchBase()).toBe(BATCH_BASE);
  });

  it("chunksUrl = /chunks?stream=1 (الوصفة على السيرفر — مافيش باراميترات تانية)", () => {
    expect(chunksUrl("https://batch.qannas-ksa.com")).toBe("https://batch.qannas-ksa.com/chunks?stream=1");
  });
});

describe("الترويسات", () => {
  it("التلاتة اللي CORS بتاع السيرفر بيقبلهم بس — والتوكن في ترويسة مش في اللينك", () => {
    const h = chunksHeaders({ token: "tok-1234567890", mime: "audio/webm;codecs=opus", agent: "عاصم" });
    expect(Object.keys(h).sort()).toEqual(["Content-Type", "X-Agent-Id", "X-Plate-Token"]);
    expect(h["X-Plate-Token"]).toBe("tok-1234567890");
    expect(h["Content-Type"]).toBe("audio/webm;codecs=opus");
    // 🔴 اسم عربي في ترويسة ⇒ fetch بيرمي (ISO-8859-1) — لازم يتشفّر
    expect(h["X-Agent-Id"]).toBe(encodeURIComponent("عاصم"));
    expect(/^[\x20-\x7e]*$/.test(h["X-Agent-Id"])).toBe(true);
  });

  it("من غير نوع ⇒ audio/webm · من غير اسم ⇒ unknown · الاسم بيتقصّ", () => {
    const h = chunksHeaders({ token: "tok-1234567890", mime: "", agent: "" });
    expect(h["Content-Type"]).toBe("audio/webm");
    expect(h["X-Agent-Id"]).toBe("unknown");
    const long = chunksHeaders({ token: "t", mime: "audio/mp4", agent: "x".repeat(500) });
    expect(decodeURIComponent(long["X-Agent-Id"]).length).toBeLessThanOrEqual(120);
  });
});

describe("httpFailure — ردود السيرفر اللي مش 200", () => {
  const msg = (s: number, body = "") => (httpFailure(s, body).error as { message: string }).message;

  it("دايماً ok:false بالكود (عشان «✅ خلص · ٠ لوحة» مايحصلش)", () => {
    const f = httpFailure(401, '{"error":"bad token"}');
    expect(f.ok).toBe(false);
    expect((f.error as { status: number }).status).toBe(401);
  });

  it("كل كود بسببه", () => {
    expect(msg(401)).toContain("التوكن");
    expect(msg(400)).toContain("صوت");
    expect(msg(413)).toContain("أكبر");
    expect(msg(503)).toContain("مشغول");
    for (const s of [502, 520, 521, 522, 523, 524, 530]) expect(msg(s)).toContain("مش بيرد");
    expect(msg(418)).toContain("418");
  });
});

describe("probeBatchServer — فحص قبل التفريغ", () => {
  const fake = (routes: Record<string, { status: number; body: unknown } | Error>) =>
    (async (url: string, init?: RequestInit) => {
      const key = `${init?.method || "GET"} ${new URL(url).pathname}`;
      const r = routes[key];
      if (!r) throw new Error("no route " + key);
      if (r instanceof Error) throw r;
      return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof fetch;

  it("شغّال والتوكن مقبول (جسم فاضي ⇒ 400 = التوكن عدّى)", async () => {
    const p = await probeBatchServer("https://b.example", "tok", fake({
      "GET /health": { status: 200, body: { ok: true, model: "SHIP-MUJAMMAA-v6", gateway: { ok: true, archive_on: true } } },
      "POST /chunks": { status: 400, body: { error: "no audio" } },
    }));
    expect(p).toMatchObject({ reachable: true, tokenOk: true, model: "SHIP-MUJAMMAA-v6", archiveOn: true });
  });

  it("التوكن مرفوض ⇒ tokenOk:false بسببه", async () => {
    const p = await probeBatchServer("https://b.example", "bad", fake({
      "GET /health": { status: 200, body: { ok: true, model: "SHIP-MUJAMMAA-v6", gateway: { ok: true } } },
      "POST /chunks": { status: 401, body: { error: "bad token" } },
    }));
    expect(p.reachable).toBe(true);
    expect(p.tokenOk).toBe(false);
    expect(p.message).toContain("التوكن");
  });

  it("السيرفر مابيردّش ⇒ reachable:false", async () => {
    const p = await probeBatchServer("https://b.example", "tok", fake({ "GET /health": new TypeError("Failed to fetch") }));
    expect(p.reachable).toBe(false);
    expect(p.tokenOk).toBe(false);
    expect(p.message).toContain("مش بيرد");
  });

  it("الوسيط شغّال بس المجمّع نفسه واقع ⇒ reachable بس مش جاهز", async () => {
    const p = await probeBatchServer("https://b.example", "tok", fake({
      "GET /health": { status: 200, body: { ok: false, error: "سيرفر المجمّع مش بيرد", gateway: { ok: true } } },
      "POST /chunks": { status: 400, body: {} },
    }));
    expect(p.reachable).toBe(true);
    expect(p.ready).toBe(false);
  });

  it("من غير توكن ⇒ مابينادي /chunks خالص", async () => {
    let calls = 0;
    const f = (async (url: string) => {
      calls++;
      return new Response(JSON.stringify({ ok: true, model: "m" }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = await probeBatchServer("https://b.example", null, f);
    expect(calls).toBe(1);
    expect(p.tokenOk).toBe(false);
  });
});

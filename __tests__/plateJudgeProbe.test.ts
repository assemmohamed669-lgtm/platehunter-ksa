/**
 * فحص الذهاب والعودة — «جرّب الاتصال».
 * =============================================================================
 * ليه ده موجود؟ الحادثة الميدانية: المربّع كان بيقول **«متوصّل»** والطيّار ميّت.
 * السبب إن «متوصّل» بتوصف **التخزين** بس (`judgeCfgOk` من `readJudgeEndpoint`)
 * ومابتلمسش الشبكة خالص — فأصل مش في قايمة CORS، أو نفق واقع، أو توكن غلط، كلهم
 * بيبانوا «متوصّل».
 *
 * الفحص بيروح على `GET /health` بترويسة التوكن **بقصد**، لأنه بيختبر أربع حاجات
 * في طلب واحد بلا ما يشغّل الموديل:
 *   ١. الـpreflight (التوكن ترويسة مش من القايمة الآمنة ⇒ OPTIONS إجباري) = CORS
 *   ٢. وصول النفق
 *   ٣. التوكن (٤٠١)
 *   ٤. المسار (٤٠٤ — مثلاً أساس فيه `/ping`)
 */
import { describe, it, expect, vi } from "vitest";
import { probeJudgeEndpoint } from "@/lib/plateJudgeClient";

const OK_BODY = { ok: true, model: "whisper-plates-v5plus" };

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("probeJudgeEndpoint — فحص الذهاب والعودة", () => {
  it("٢٠٠ + ok ⇒ الطيّار فعلاً واصل", async () => {
    const f = vi.fn(async () => res(200, OK_BODY));
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: true, code: "ok" });
  });

  it("بيضرب على /health بترويسة التوكن — عشان يجبر preflight ويختبر CORS", async () => {
    const f = vi.fn(async () => res(200, OK_BODY));
    await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://t.trycloudflare.com/health");
    expect((init.headers as Record<string, string>)["X-Plate-Token"]).toBe("tok-123456789012");
  });

  it("TypeError (CORS مقفول أو نفق واقع) ⇒ blocked — الطلب مخرجش من الجهاز", async () => {
    const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: false, code: "blocked" });
  });

  it("٤٠١ ⇒ bad_token (وصل فعلاً — يبقى CORS سليم)", async () => {
    const f = vi.fn(async () => res(401, { error: "unauthorized" }));
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: false, code: "bad_token" });
  });

  it("٤٠٤ ⇒ bad_path (أساس فيه /ping مثلاً)", async () => {
    const f = vi.fn(async () => res(404, { error: "not_found" }));
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com/ping", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: false, code: "bad_path" });
  });

  it("حالة تانية ⇒ http_NNN خام", async () => {
    const f = vi.fn(async () => res(502, {}));
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: false, code: "http_502" });
  });

  it("٢٠٠ بجسم غريب (صفحة تسجيل دخول للنفق مثلاً) ⇒ bad_body مش ok", async () => {
    const f = vi.fn(async () => res(200, { hello: "world" }));
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: false, code: "bad_body" });
  });

  it("جسم مش JSON ⇒ bad_body", async () => {
    const f = vi.fn(async () => ({
      ok: true, status: 200, json: async () => { throw new Error("not json"); },
    } as unknown as Response));
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r).toEqual({ ok: false, code: "bad_body" });
  });

  it("إعداد ناقص ⇒ not_configured بلا أي طلب", async () => {
    const f = vi.fn(async () => res(200, OK_BODY));
    expect(await probeJudgeEndpoint("", "tok-123456789012", { fetchImpl: f }))
      .toEqual({ ok: false, code: "not_configured" });
    expect(await probeJudgeEndpoint("https://t.trycloudflare.com", "", { fetchImpl: f }))
      .toEqual({ ok: false, code: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("مهلة ⇒ timeout، ومابيرميش", async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      // بنحاكي المتصفّح: الإلغاء بيرمي AbortError
      const e = new Error("aborted"); e.name = "AbortError";
      void init; throw e;
    });
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012",
      { fetchImpl: f as unknown as typeof fetch, timeoutMs: 5 });
    expect(r).toEqual({ ok: false, code: "timeout" });
  });

  it("عمره ما يرمي — أي استثناء غريب بيرجع رمز", async () => {
    const f = vi.fn(async () => { throw new Error("boom"); });
    const r = await probeJudgeEndpoint("https://t.trycloudflare.com", "tok-123456789012", { fetchImpl: f });
    expect(r.ok).toBe(false);
    expect(typeof r.code).toBe("string");
  });
});

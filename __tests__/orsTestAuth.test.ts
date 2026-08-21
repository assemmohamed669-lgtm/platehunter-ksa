// @vitest-environment node
/**
 * /api/ors-test كان **مفتوح للعامة** — بلا مصادقة ولا حد استهلاك، بخلاف
 * أخواته (groq-test و elevenlabs-test). أي حد على الإنترنت كان يقدر يخلّي
 * السيرفر يعمل نداء خارجي في كل طلب (استهلاك على حسابنا)، ويستخدمه كآلة
 * فحص لأي مفاتيح OpenRouteService مسروقة.
 *
 * العميل (components/OrsKeyEditor.tsx) بيبعت التوكن بالفعل — السيرفر بس
 * ماكانش بيفحصه. فالاختبارات دي بتثبت إن البوابة اتقفلت من غير ما نلمس العميل.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifySession = vi.fn();
const rateLimit = vi.fn();
vi.mock("@/lib/apiAuth", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
  rateLimit: (...a: unknown[]) => rateLimit(...a),
}));

function post(body: unknown, auth?: string) {
  return new Request("http://localhost/api/ors-test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  }) as never;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  verifySession.mockResolvedValue("agent-1");
  rateLimit.mockReturnValue(true);
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("/api/ors-test — بوابة الجلسة", () => {
  it("بيرفض الطلب بلا توكن بـ401 و**مايندهش** الخدمة الخارجية", async () => {
    verifySession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ors-test/route");

    const res = await POST(post({ apiKey: "any-key" }));

    expect(res.status).toBe(401);
    // الأهم: مافيش استهلاك للسيرفر ولا نداء خارجي لطلب مش مصادق.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("بيرفض الطلب بتوكن باطل كمان", async () => {
    verifySession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ors-test/route");

    const res = await POST(post({ apiKey: "any-key" }, "Bearer bad-token"));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("بيرد 429 لما المندوب يتعدّى حد الاستهلاك، بلا نداء خارجي", async () => {
    rateLimit.mockReturnValue(false);
    const { POST } = await import("@/app/api/ors-test/route");

    const res = await POST(post({ apiKey: "any-key" }, "Bearer good"));

    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("حد الاستهلاك مربوط بالمندوب نفسه (مش عام)", async () => {
    const { POST } = await import("@/app/api/ors-test/route");

    await POST(post({ apiKey: "any-key" }, "Bearer good"));

    // المعامل الرابع = الطلب نفسه، بيوصل للسجل الأمني (IP + المسار).
    expect(rateLimit).toHaveBeenCalledWith(
      expect.stringContaining("agent-1"),
      expect.any(Number),
      expect.any(Number),
      expect.anything()
    );
  });

  it("بيكمّل عادي للمندوب المسجّل تحت الحد", async () => {
    const { POST } = await import("@/app/api/ors-test/route");

    const res = await POST(post({ apiKey: "real-key" }, "Bearer good"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // المفتاح بيتبعت للخدمة مُرمّزاً في الرابط
    expect(String(fetchMock.mock.calls[0][0])).toContain("api_key=real-key");
  });

  it("لسه بيرفض المفتاح الفاضي بـ400 بعد المصادقة", async () => {
    const { POST } = await import("@/app/api/ors-test/route");

    const res = await POST(post({ apiKey: "   " }, "Bearer good"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

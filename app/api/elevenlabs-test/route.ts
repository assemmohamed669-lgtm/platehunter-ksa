import { NextRequest, NextResponse } from "next/server";
import { verifySession, rateLimit } from "@/lib/apiAuth";

/**
 * التحقق من مفتاح ElevenLabs — **على السيرفر** (مش المتصفح) عشان:
 *  - مفيش قيود CORS تخفي الخطأ الحقيقي.
 *  - نوصل للـ status + الـ body الكامل من ElevenLabs.
 * بيرجّع تشخيص كامل (status / endpoint / method / code / message / reason / body)
 * وبيسجّل كله في كونسول السيرفر. **مابيخفيش الخطأ الأصلي أبداً** ومابيرجّعش
 * «Invalid API Key» عامة — بيفرّق بين كل الأنواع.
 */

const ENDPOINT = "https://api.elevenlabs.io/v1/user";
const METHOD = "GET";
const TIMEOUT_MS = 10_000;
const MAX_BODY = 4000;

type Category =
  | "ok"
  | "invalid_api_key"
  | "expired_api_key"
  | "unauthorized"
  | "forbidden"
  | "wrong_endpoint"
  | "rate_limit"
  | "invalid_request"
  | "server_error"
  | "network_error"
  | "timeout"
  | "http_error";

interface Classified { category: Category; reason: string; errorCode: string; message: string }

// تصنيف الخطأ من status + الـ body الحقيقي (مش تخمين — بنقرا الـ body لو JSON).
function classify(status: number, bodyText: string): Classified {
  let errorCode = "";
  let message = "";
  try {
    const j = JSON.parse(bodyText);
    const d = j?.detail ?? j?.error ?? j;
    if (typeof d === "string") message = d;
    else if (d && typeof d === "object") {
      errorCode = String(d.status ?? d.code ?? d.error ?? "");
      message = String(d.message ?? d.msg ?? d.detail ?? "");
    }
  } catch { /* الـ body مش JSON — نسيبه نص خام */ }

  const codeL = errorCode.toLowerCase();
  const msgL = message.toLowerCase();

  if (status === 401) {
    if (codeL.includes("expired") || msgL.includes("expired"))
      return { category: "expired_api_key", reason: "Expired API Key — المفتاح انتهت صلاحيته", errorCode, message };
    if (codeL.includes("invalid") || codeL.includes("api_key") || msgL.includes("invalid api key"))
      return { category: "invalid_api_key", reason: "Invalid API Key — المفتاح غلط", errorCode, message };
    return { category: "unauthorized", reason: "Unauthorized (401) — مفتاح غلط/منتهي أو ناقص", errorCode, message };
  }
  if (status === 403)
    return { category: "forbidden", reason: "Forbidden (403) — المفتاح صحيح بس مالوش صلاحية (scope) على الـ endpoint ده. مفتاح مقيّد على Speech-to-Text ممكن يرفض /v1/user رغم إنه بيفرّغ تمام.", errorCode, message };
  if (status === 404)
    return { category: "wrong_endpoint", reason: "Wrong Endpoint (404) — العنوان غلط", errorCode, message };
  if (status === 429)
    return { category: "rate_limit", reason: "Rate Limit (429) — تعديت الحد المسموح، استنى وجرّب تاني", errorCode, message };
  if (status === 400 || status === 422)
    return { category: "invalid_request", reason: `Invalid Request (${status}) — الطلب نفسه فيه مشكلة`, errorCode, message };
  if (status >= 500)
    return { category: "server_error", reason: `ElevenLabs Server Error (${status}) — مشكلة عند ElevenLabs مش عندك`, errorCode, message };
  return { category: "http_error", reason: `HTTP ${status}`, errorCode, message };
}

export async function POST(req: NextRequest) {
  const userId = await verifySession(req.headers.get("authorization"));
  if (!userId) return NextResponse.json({ ok: false, category: "unauthorized", reason: "unauthorized" }, { status: 401 });
  if (!rateLimit(`el-test:${userId}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, category: "rate_limit", reason: "rate_limited" }, { status: 429 });
  }

  let apiKey = "";
  try {
    const body = await req.json();
    apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  } catch { /* ignore */ }
  if (!apiKey) {
    return NextResponse.json({ ok: false, category: "invalid_request", reason: "مفيش مفتاح", endpoint: ENDPOINT, method: METHOD });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: METHOD, headers: { "xi-api-key": apiKey }, signal: controller.signal });
    const bodyText = (await res.text().catch(() => "")).slice(0, MAX_BODY);

    if (res.ok) {
      const result = { ok: true, status: res.status, statusText: res.statusText, endpoint: ENDPOINT, method: METHOD, category: "ok" as Category, reason: "المفتاح شغّال ✓", errorCode: "", message: "", body: bodyText };
      console.log("[elevenlabs-test] OK", JSON.stringify({ userId, status: res.status }));
      return NextResponse.json(result);
    }

    const c = classify(res.status, bodyText);
    const result = { ok: false, status: res.status, statusText: res.statusText, endpoint: ENDPOINT, method: METHOD, ...c, body: bodyText };
    // سجّل التشخيص الكامل في كونسول السيرفر (مش بيتحجب أبداً).
    console.error("[elevenlabs-test] FAIL", JSON.stringify({ userId, status: res.status, statusText: res.statusText, category: c.category, errorCode: c.errorCode, message: c.message, endpoint: ENDPOINT, method: METHOD, body: bodyText }));
    return NextResponse.json(result);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const category: Category = isAbort ? "timeout" : "network_error";
    const reason = isAbort
      ? `Timeout — ElevenLabs ما ردّش خلال ${TIMEOUT_MS / 1000} ثانية`
      : "Network Error — السيرفر ما قدرش يوصل لـ ElevenLabs (إنترنت/DNS/حجب)";
    const message = err instanceof Error ? err.message : String(err);
    console.error("[elevenlabs-test] EXCEPTION", JSON.stringify({ userId, category, message, endpoint: ENDPOINT, method: METHOD }));
    return NextResponse.json({ ok: false, status: null, statusText: "", endpoint: ENDPOINT, method: METHOD, category, reason, errorCode: "", message, body: "" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ==========================================================================
 *  🧮 سيرفر المجمّع من قناص (١٦ أكتوبر ٢٠٢٦)
 * ==========================================================================
 *
 *  في المعمل الصفحة كانت بتنده `/api/seg-chunks` على Express بتاع المعمل، وهو
 *  اللي بيحط التوكن ويلفّ الأخطاء ويأرشف الصوت. قناص مالوش Express، فالمتصفّح
 *  بيكلّم **وسيط المجمّع** على إيطاليا مباشرةً:
 *
 *      قناص ⇐ https://batch.qannas-ksa.com  (نفق Cloudflare لإيطاليا بس)
 *           ⇐ batch_gateway.py :8780   (البث · الأرشيف · الأخطاء · الإلغاء)
 *           ⇐ seg_server.py   :8770   (SHIP-MUJAMMAA-v6 + كوهير 8772)
 *
 *  التوكن = نفس توكن «الجديد» (`get_trial_token`، PLATE_JUDGE_TOKEN على السيرفر) —
 *  مافيش سر جديد. بيتبعت في `X-Plate-Token` بس، عمره ما يتحط في اللينك.
 *  الوصفة (stitch/edge/batch) على السيرفر — الصفحة مابتبعتش غير `stream=1`.
 */

export const BATCH_BASE = "https://batch.qannas-ksa.com";
/** عنوان بديل للتجربة (سوبر أدمن) — مثلاً http://localhost:8780 بنفق SSH */
export const BATCH_URL_KEY = "mj:batch:url";

/**
 * https بس — أو localhost/127.0.0.1 للتجربة. بيشيل `/` و`/chunks` و`/health` من الآخر.
 * http لسيرفر بعيد = المتصفّح هيقفله (mixed content)؛ واسم/باسورد/استعلام في اللينك = تسريب.
 */
export function normalizeBatchBase(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  const path = u.pathname.replace(/\/+$/, "").replace(/\/(chunks|health)$/, "");
  return `${u.protocol}//${u.host}${path}`;
}

export function readBatchBase(): string {
  try {
    const saved = localStorage.getItem(BATCH_URL_KEY);
    const ok = saved ? normalizeBatchBase(saved) : null;
    if (ok) return ok;
  } catch {
    // تخزين مقفول — الافتراضي
  }
  return BATCH_BASE;
}

export function saveBatchBaseOverride(raw: string): boolean {
  const ok = normalizeBatchBase(raw);
  if (!ok) return false;
  try {
    localStorage.setItem(BATCH_URL_KEY, ok);
    return true;
  } catch {
    return false;
  }
}

export function clearBatchBaseOverride(): void {
  try {
    localStorage.removeItem(BATCH_URL_KEY);
  } catch {
    // مش مشكلة
  }
}

export function chunksUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/chunks?stream=1`;
}

/**
 * التلات ترويسات اللي CORS بتاع السيرفر بيقبلهم (`X-Plate-Token, Content-Type, X-Agent-Id`)
 * — أي ترويسة تانية بتوقّع الـpreflight. الاسم بيتشفّر: عربي في ترويسة ⇒ fetch بيرمي.
 */
export function chunksHeaders(o: { token: string; mime: string; agent: string }): Record<string, string> {
  const agent = String(o.agent || "").trim().slice(0, 120);
  return {
    "Content-Type": o.mime || "audio/webm",
    "X-Plate-Token": o.token,
    "X-Agent-Id": agent ? encodeURIComponent(agent) : "unknown",
  };
}

/**
 * رد مش 200 (قبل ما البث يبدأ) ⇒ نفس شكل الفشل بتاع الصفحة `{ok:false, error}`.
 * 🔴 من غيره: سيرفر بيرجّع `{"error":"bad token"}` من غير `ok` والصفحة كانت هتفهمه
 * «نجح بـ٠ لوحة» (`readChunksResponse` بتقرا JSON واحد للسيرفر القديم).
 */
export function httpFailure(status: number, body: string): { ok: false; error: Record<string, unknown> } {
  let detail: unknown = body;
  try {
    detail = body ? JSON.parse(body) : null;
  } catch {
    detail = String(body || "").slice(0, 600);
  }
  const message =
    status === 401 ? "التوكن مرفوض — السيرفر مش قابل مفتاح التطبيق (كلّم المسئول)."
    : status === 400 ? "السيرفر قال إن الطلب وصله من غير صوت — سجّل تاني."
    : status === 413 ? "التسجيل أكبر من اللي السيرفر بيستقبله."
    : status === 503 ? "سيرفر المجمّع مشغول — استنى لحظة وفرّغ تاني."
    : status === 502 || status === 530 || (status >= 520 && status <= 524)
      ? `سيرفر المجمّع مش بيرد دلوقتي (${status}) — المقطع محفوظ، فرّغه تاني كمان شوية.`
    : `السيرفر رفض الطلب (${status}).`;
  return { ok: false, error: { where: "سيرفر المجمّع", status, message, detail } };
}

export interface BatchProbe {
  /** الوسيط ردّ على /health */
  reachable: boolean;
  /** المجمّع نفسه (seg_server) شغّال ورا الوسيط */
  ready: boolean;
  /** التوكن عدّى (جسم فاضي ⇒ 400) */
  tokenOk: boolean;
  model: string;
  archiveOn: boolean;
  message: string;
}

/**
 * فحص سريع قبل التفريغ: `GET /health` (من غير توكن) + `POST /chunks` بجسم فاضي —
 * الوسيط بيشيك التوكن **قبل** الجسم: 400 = التوكن عدّى · 401 = مرفوض.
 */
export async function probeBatchServer(
  base: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<BatchProbe> {
  const out: BatchProbe = { reachable: false, ready: false, tokenOk: false, model: "", archiveOn: false, message: "" };
  const ms = (n: number) => (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(n) : undefined);
  try {
    const r = await fetchImpl(`${base}/health`, { method: "GET", signal: ms(8000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    out.reachable = r.ok;
    out.ready = r.ok && j.ok === true;
    out.model = typeof j.model === "string" ? j.model : "";
    const gw = (j.gateway ?? {}) as Record<string, unknown>;
    out.archiveOn = gw.archive_on === true;
    if (!out.reachable) out.message = `سيرفر المجمّع ردّ بكود ${r.status}`;
    else if (!out.ready) out.message = String(j.error || "سيرفر المجمّع مش جاهز — الوسيط شغّال والموديل لأ");
  } catch {
    out.message = "سيرفر المجمّع مش بيرد — النت أو النفق.";
    return out;
  }
  if (!token) {
    out.message ||= "مافيش توكن — افتح الصفحة تاني.";
    return out;
  }
  try {
    const r = await fetchImpl(`${base}/chunks`, {
      method: "POST",
      headers: { "X-Plate-Token": token, "Content-Type": "audio/webm" },
      body: new Blob([]),
      signal: ms(8000),
    });
    out.tokenOk = r.status === 400;
    if (r.status === 401) out.message = "التوكن مرفوض — السيرفر مش قابل مفتاح التطبيق.";
    else if (!out.tokenOk && !out.message) out.message = `فحص التوكن ردّ بكود ${r.status}`;
  } catch {
    out.message ||= "فحص التوكن ماوصلش.";
  }
  return out;
}

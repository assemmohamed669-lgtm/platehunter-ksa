/**
 * 🩺 مراقبة الصوت — المراقب من بره (٣ أكتوبر ٢٠٢٦)
 *
 * Vercel cron كل دقيقة بيسأل سيرفر ماليزيا `/health` بس: صاحي؟ بيرد في كام؟
 * كام طلب شغّال؟ `/health` بيرجّع حالة الموديل وذاكرة الكارت من غير ما يلمس
 * الموديل، فطلب كل دقيقة مالوش أي أثر على المناديب ولا على السيرفر.
 *
 * الهدف: لما مندوب يشتكي الساعة ١١:٣٣ نعرف السيرفر كان صاحي ساعتها ولا لأ.
 */

export type HealthRow = {
  target: string;
  ok: boolean;
  status: number | null;
  ms: number | null;
  inflight: number | null;
  error: string | null;
  detail: Record<string, unknown> | null;
};

export async function probeVoiceHealth(opts: {
  url: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): Promise<HealthRow> {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const row: HealthRow = { target: opts.url, ok: false, status: null, ms: null, inflight: null, error: null, detail: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  const t0 = now();
  try {
    const res = await fetchFn(opts.url, { signal: ctrl.signal, cache: "no-store" });
    row.ms = Math.round(now() - t0);
    row.status = res.status;
    if (!res.ok) { row.error = `http_${res.status}`; return row; }
    let body: unknown;
    try { body = await res.json(); } catch { row.error = "bad_body"; return row; }
    if (!body || typeof body !== "object") { row.error = "bad_body"; return row; }
    const b = body as Record<string, unknown>;
    row.ok = b.ok === true;
    if (!row.ok) row.error = "not_ok";
    if (typeof b.inflight === "number") row.inflight = b.inflight;
    // ملخّص صغير بس — مش الجسم كله
    row.detail = { model: b.model ?? null, dtype: b.dtype ?? null, vram: b.vram ?? null };
    return row;
  } catch (e) {
    row.error = (e as { name?: string })?.name === "AbortError" ? "timeout" : "network";
    return row;
  } finally {
    clearTimeout(timer);
  }
}

/** تنضيف الأقدم من ٣٠ يوم مرة في الساعة (الدقيقة ٧) — مش مع كل نبضة. */
export function isCleanupMinute(d: Date): boolean {
  return d.getUTCMinutes() === 7;
}

/** Vercel بيبعت `Authorization: Bearer <CRON_SECRET>` لو المتغيّر متضبط. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return header === `Bearer ${secret}`;
}

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
    // ملخّص صغير بس — مش الجسم كله. `device` = cuda/cpu (٤ أكتوبر: السيرفر رجع على المعالج من غير ما حد يعرف)
    row.detail = { model: b.model ?? null, dtype: b.dtype ?? null, vram: b.vram ?? null, device: b.device ?? null };
    return row;
  } catch (e) {
    row.error = (e as { name?: string })?.name === "AbortError" ? "timeout" : "network";
    return row;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 🎙️ **الفحص الحقيقي** (٤ أكتوبر ٢٠٢٦): كارت ماليزيا باظ و`/health` فضل يقول ok — كل تفريغ
 * كان بيفشل والمراقبة خضرا، ومحدش عرف غير لما المناديب وقفوا. ده بيبعت مقطع صوت صغير فيه
 * لوحة معروفة (`voiceProbeClip`) على `/transcribe` **بنفس توكن المناديب ونفس الصيغة** (WAV)،
 * ويتأكد إن اللوحة رجعت صح وبسرعة.
 *
 * المالك: «اهم حاجه ميأثرش علي السيرفر ولا المناديب … ولا يبقي سبب في قطع الصوت». ⇒ **طلب
 * واحد** كل دقيقة (~٠.٢٥ث كارت)، بمهلة، **من غير إعادة**، والسيرفر بيستحمل ٩٦ طلب مع بعض.
 * عمرها ما ترمي.
 */
export type DeepProbe = {
  ok: boolean;
  /** null · no_token · bad_token · http_xxx · timeout · network · bad_body · no_plate · wrong_plate · slow */
  error: string | null;
  status: number | null;
  ms: number | null;
  plate: string | null;
};

/** أبطأ من كده = المناديب حاسّين (على الكارت ~٠.٣ث + الطريق؛ على المعالج كان ٣.٥–٧ث). */
export const DEEP_SLOW_MS = 3000;

export async function probeVoiceTranscribe(opts: {
  url: string;
  token: string;
  clip: Uint8Array;
  expectPlate: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  slowMs?: number;
  now?: () => number;
}): Promise<DeepProbe> {
  const out: DeepProbe = { ok: false, error: null, status: null, ms: null, plate: null };
  if (!opts.token) { out.error = "no_token"; return out; }
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  const t0 = now();
  try {
    const res = await fetchFn(opts.url, {
      method: "POST",
      headers: { "X-Plate-Token": opts.token, "Content-Type": "audio/wav" },
      body: opts.clip as unknown as BodyInit,
      signal: ctrl.signal,
      cache: "no-store",
    });
    out.ms = Math.round(now() - t0);
    out.status = res.status;
    if (res.status === 401 || res.status === 403) { out.error = "bad_token"; return out; }
    if (!res.ok) { out.error = `http_${res.status}`; return out; }
    let body: unknown;
    try { body = await res.json(); } catch { out.error = "bad_body"; return out; }
    const plate = typeof (body as { plate?: unknown })?.plate === "string" ? (body as { plate: string }).plate.trim() : "";
    out.plate = plate || null;
    if (!plate) { out.error = "no_plate"; return out; }
    if (!plate.split(/\s+/).includes(opts.expectPlate)) { out.error = "wrong_plate"; return out; }
    if (out.ms > (opts.slowMs ?? DEEP_SLOW_MS)) { out.error = "slow"; return out; }
    out.ok = true;
    return out;
  } catch (e) {
    out.error = (e as { name?: string })?.name === "AbortError" ? "timeout" : "network";
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * نبضة الدقيقة = `/health` + التفريغ الحقيقي في صف واحد (نفس جدول `voice_health` — مافيش SQL جديد).
 * الأولوية في السبب: `/health` واقع ⇒ سببه · السيرفر على المعالج ⇒ `cpu` · التفريغ فشل ⇒ سببه.
 */
export function mergeHealth(health: HealthRow, deep: DeepProbe | null, expectPlate: string): HealthRow {
  const device = (health.detail?.device as string | null | undefined) ?? null;
  let ok = health.ok;
  let error = health.error;
  if (ok && device && device !== "cuda") { ok = false; error = "cpu"; }
  if (ok && deep && !deep.ok) { ok = false; error = deep.error ?? "deep_failed"; }
  return {
    ...health,
    ok,
    error,
    detail: {
      ...(health.detail ?? {}),
      deep_ok: deep ? deep.ok : null,
      deep_error: deep?.error ?? null,
      deep_status: deep?.status ?? null,
      deep_ms: deep?.ms ?? null,
      plate: deep?.plate ?? null,
      expect: expectPlate,
    },
  };
}

/**
 * مدة الاحتفاظ — المالك (٣ أكتوبر ٢٠٢٦): «خليها كل ٧ أيام». الشكوى بتيجي في
 * نفس اليوم أو اللي بعده؛ اللي محدش اشتكى منه بيتمسح لوحده فالجدول مابيكبرش.
 */
export const RETENTION_DAYS = 7;

/** أي صف قبل الوقت ده بيتمسح. */
export function retentionCutoff(now: Date): string {
  return new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
}

/** التنضيف مرة في الساعة (الدقيقة ٧) — مش مع كل نبضة. */
export function isCleanupMinute(d: Date): boolean {
  return d.getUTCMinutes() === 7;
}

/** Vercel بيبعت `Authorization: Bearer <CRON_SECRET>` لو المتغيّر متضبط. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return header === `Bearer ${secret}`;
}

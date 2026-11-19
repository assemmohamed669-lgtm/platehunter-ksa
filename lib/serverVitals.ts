/**
 * 🗃️ «الصندوق الأسود» برّه الجهاز (١٧ أكتوبر ٢٠٢٦).
 *
 * المالك: «هنعرف نجيب تقرير كامل عن السيرفر بحيث لو حصل حاجه نعرف السبب ونعدله؟».
 * على إيطاليا `vitals.py` بيكتب كل دقيقة سطر حالة (الكارت · سيرفر اللوحات · النفق · الطريق ·
 * الجهاز · المجمّع). لو الجهاز نفسه مات سجلاته بتموت معاه — فنبضة Vercel كل دقيقة
 * (`/api/cron/voice-health`) بتاخد آخر سطر من وسيط المجمّع (`/vitals`، بالتوكن) وتحفظه في
 * `voice_health.detail.vitals`. كده آخر حاجة قبل أي وقعة بتفضل محفوظة ٧ أيام.
 *
 * 🔴 مايبوّظش النبضة: مهلة ٣ث، مابيرميش أبداً، وبياخد **حقول معروفة بس** بأحجام صغيرة —
 *    سيرفر بيرجّع حاجة غريبة مايملاش الجدول. التوكن في الترويسة بس، عمره ما يتحفظ.
 */

export const VITALS_URL = "https://batch.qannas-ksa.com/vitals";

type Shape = Record<string, "n" | "s" | "b" | "na">;
const SHAPE: Record<string, Shape> = {
  host: { load1: "n", ram_gb: "n", ram_limit_gb: "n", disk_free_gb: "n" },
  gpu: { temp: "n", util: "n", mem_used: "n", mem_total: "n", power: "n", pstate: "s", throttle: "s", sm_mhz: "n", error: "s" },
  plates: { ok: "b", ms: "n", inflight: "n", device: "s", pid: "n", age_s: "n", rss_mb: "n", error: "s" },
  tunnel: { pid: "n", procs: "n", age_s: "n", req: "n", err: "n", ha: "n", bad: "n", mode: "s", edge_ms: "na", req_1m: "n", err_1m: "n", restarted: "b", error: "s" },
  batch: { gateway: "b", seg: "b", cohere: "b", inflight: "n", cohere_rss_mb: "n", tunnel: "b", error: "s" },
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function compactVitals(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (num(r.t) !== undefined) out.t = r.t;
  if (num(r.age_s) !== undefined) out.age_s = r.age_s;
  for (const [group, shape] of Object.entries(SHAPE)) {
    const g = r[group];
    if (!g || typeof g !== "object" || Array.isArray(g)) continue;
    const src = g as Record<string, unknown>;
    const o: Record<string, unknown> = {};
    for (const [k, kind] of Object.entries(shape)) {
      const v = src[k];
      if (kind === "n" && num(v) !== undefined) o[k] = v;
      else if (kind === "s" && typeof v === "string") o[k] = v.slice(0, 16);
      else if (kind === "b" && typeof v === "boolean") o[k] = v;
      else if (kind === "na" && Array.isArray(v)) o[k] = v.slice(0, 4).map((x) => (num(x) !== undefined ? x : null));
    }
    out[group] = o;
  }
  return out;
}

export async function fetchServerVitals(opts: {
  token: string;
  url?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<Record<string, unknown>> {
  if (!opts.token) return { error: "no_token" };
  const fetchFn = opts.fetchFn ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetchFn(opts.url ?? VITALS_URL, {
      headers: { "X-Plate-Token": opts.token },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return { error: `http_${res.status}` };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { error: "bad_body" };
    }
    return compactVitals(body);
  } catch (e) {
    return { error: (e as { name?: string })?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

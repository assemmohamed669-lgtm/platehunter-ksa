/**
 * 🏘️ **«اسم الحي» تلقائي من موقع اللوحة** — المجمّع (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «اسم المنطقه دة خليه اسم الحي ويظهر في عمود لوحده لو هو حاطهه لو مش حاطه اسم الحي اللي هو بيسجل
 * فيه يتاخد تلقائي من الجي بي اس».
 *
 * نفس فكرة «الحي تلقائي» في «Voice PRO» (`lib/autoArea.ts`) بس **للحي بس** ومعمولة للمجمّع: اللوحات بتيجي
 * ٢٦٠ مرة واحدة، وخدمة العناوين (Nominatim) طلب واحد في الثانية — فبدل طلب لكل ١٥م، **طلب لكل خانة
 * ~٢٢٠م** (الحي مابيتغيّرش كل شارع) ⇒ تسجيل ربع ساعة ≈ ٣٠ طلب ≈ نص دقيقة في الخلفية.
 *  · اللي المندوب كتبه في «اسم الحي» **دايماً الأول** — التلقائي بيملى الفاضي بس (`neighborhoodAuto`).
 *  · لوحة من غير موقع ⇒ حي العربية اللي قبلها (ولو أول واحدة ⇒ اللي بعدها) — «مايسيبش خانات فاضية».
 *  · مافيش موقع خالص ⇒ فاضي (مابنخترعش).
 */
import type { PlateEntry } from "./plateEntry";

export interface DistrictAddress {
  street?: string;
  district: string;
}

/** حجم الخانة (درجة) — ٠.٠٠٢ ≈ ٢٢٠م عند خط عرض الرياض */
export const DISTRICT_CELL_DEG = 0.002;
/** سياسة Nominatim: طلب في الثانية */
export const DISTRICT_MIN_GAP_MS = 1100;

const UNKNOWN = new Set(["", "غير معروف", "غير متاح"]);

export class DistrictResolver {
  private cache = new Map<string, string>();
  private chain: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;
  private readonly minGapMs: number;
  private readonly cellDeg: number;

  constructor(
    private readonly reverse: (lat: number, lng: number) => Promise<DistrictAddress>,
    opts: { minGapMs?: number; cellDeg?: number } = {},
  ) {
    this.minGapMs = opts.minGapMs ?? DISTRICT_MIN_GAP_MS;
    this.cellDeg = opts.cellDeg ?? DISTRICT_CELL_DEG;
  }

  private key(lat: number, lng: number): string {
    return `${Math.round(lat / this.cellDeg)}:${Math.round(lng / this.cellDeg)}`;
  }

  /** الحي في الكاش من غير طلب — للي بيسأل «فيه ولا لأ» */
  cached(lat: number, lng: number): string | undefined {
    return this.cache.get(this.key(lat, lng));
  }

  /** طلب واحد في المرة، والخانة اللي اتعرفت بترجع من غير طلب. الفشل ⇒ "" (ومابيتخزّنش) */
  resolve(lat: number, lng: number): Promise<string> {
    const job = this.chain.then(() => this.run(lat, lng));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async run(lat: number, lng: number): Promise<string> {
    const k = this.key(lat, lng);
    const hit = this.cache.get(k);
    if (hit !== undefined) return hit;
    const wait = this.lastCallAt + this.minGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
    let d = "";
    try {
      d = String((await this.reverse(lat, lng))?.district ?? "").trim();
    } catch {
      d = "";
    }
    if (UNKNOWN.has(d)) return "";
    this.cache.set(k, d);
    return d;
  }
}

/**
 * بيملى «اسم الحي» للوحات اللي المندوب ماكتبلهاش — من موقعها هي، وبعدين من اللي جنبها. بيرجّع نسخة جديدة
 * (المرجع نفسه لو مافيش تغيير). `timeoutMs`: اللي ماخلصش في الوقت ده بيفضل فاضي (التفريغ/التصدير مايستنوش للأبد).
 */
export async function fillDistricts(
  entries: PlateEntry[],
  resolver: DistrictResolver,
  opts: { timeoutMs?: number } = {},
): Promise<PlateEntry[]> {
  const need = entries.filter((e) => !String(e.neighborhood ?? "").trim());
  if (need.length === 0) return entries;
  const got = new Map<string, string>();
  const work = (async () => {
    for (const e of need) {
      if (!e.pin) continue;
      const d = await resolver.resolve(e.pin.lat, e.pin.lng);
      if (d) got.set(e.id, d);
    }
  })();
  const timeoutMs = opts.timeoutMs ?? 60_000;
  await Promise.race([work, new Promise((r) => setTimeout(r, timeoutMs))]);
  // من موقعها هي، وإلا أقرب عربية قبلها (بوقت النطق) ليها حي، وإلا أقرب واحدة بعدها
  const areaOf = (e: PlateEntry) => String(e.neighborhood ?? "").trim() || got.get(e.id) || "";
  const timeline = entries.slice().sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
  const fallback = (e: PlateEntry): string => {
    const i = timeline.indexOf(e);
    for (let j = i - 1; j >= 0; j--) if (got.get(timeline[j].id) || (timeline[j].neighborhood ?? "").trim()) return areaOf(timeline[j]);
    for (let j = i + 1; j < timeline.length; j++) if (got.get(timeline[j].id) || (timeline[j].neighborhood ?? "").trim()) return areaOf(timeline[j]);
    return "";
  };
  if (got.size === 0) return entries;
  let changed = false;
  const out = entries.map((e) => {
    if (String(e.neighborhood ?? "").trim()) return e;
    const d = got.get(e.id) || fallback(e);
    if (!d) return e;
    changed = true;
    return { ...e, neighborhood: d, neighborhoodAuto: true };
  });
  return changed ? out : entries;
}

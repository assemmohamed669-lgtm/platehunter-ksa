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

/**
 * 🛣️ **«اسم الشارع» من الـGPS** (١٦ نوفمبر ٢٠٢٦) — المالك: «لما يشيل ميتكتبش وياخد اسم الحي واسم الشارع من الجي بي اس
 * نفسه». نفس قواعد Voice PRO (`lib/autoArea.ts`): الشارع بيتاخد بس لو دقة موقع اللوحة **≤٣٥م** (أضعف ⇒ بيطلع غلط)،
 * والشارع بيتغيّر أسرع من الحي ⇒ مش خانة ٢٢٠م: نفس الشارع بيتعاد لو اللوحة **أقل من ٢٥م** من آخر واحدة اتسألت.
 */
export const AUTO_STREET_MAX_ACCURACY_M = 35;
export const STREET_REUSE_M = 25;

function metersApart(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export class DistrictResolver {
  private cache = new Map<string, string>();
  private chain: Promise<unknown> = Promise.resolve();
  /** 🛣️ طابور الشوارع لوحده — الحي مايستناش وراه — بس **نفس الدور** على الخدمة (`slot`) */
  private streetChain: Promise<unknown> = Promise.resolve();
  private lastStreet: { lat: number; lng: number; street: string } | null = null;
  /** أول وقت مسموح فيه بالطلب الجاي (حي أو شارع) — طلب واحد في الثانية للخدمة كلها */
  private nextAt = 0;
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

  /** دور على الخدمة: الحي والشارع بيتبادلوا، والاتنين مع بعض طلب واحد في الثانية */
  private async slot(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.minGapMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }

  /** 🛣️ شارع النقطة دي — نفس الشارع لو أقل من `STREET_REUSE_M` من آخر واحدة. الفشل/«غير معروف» ⇒ "" (ومابيتخزّنش) */
  resolveStreet(lat: number, lng: number): Promise<string> {
    const job = this.streetChain.then(() => this.runStreet(lat, lng));
    this.streetChain = job.catch(() => undefined);
    return job;
  }

  private async runStreet(lat: number, lng: number): Promise<string> {
    const l = this.lastStreet;
    if (l && metersApart(l.lat, l.lng, lat, lng) < STREET_REUSE_M) return l.street;
    await this.slot();
    let a: DistrictAddress | null = null;
    try {
      a = await this.reverse(lat, lng);
    } catch {
      a = null;
    }
    const s = String(a?.street ?? "").trim();
    const d = String(a?.district ?? "").trim();
    // نفس الرد فيه الحي ⇒ الخانة دي مش محتاجة طلب حي
    const k = this.key(lat, lng);
    if (!UNKNOWN.has(d) && !this.cache.has(k)) this.cache.set(k, d);
    if (UNKNOWN.has(s)) return "";
    this.lastStreet = { lat, lng, street: s };
    return s;
  }

  private async run(lat: number, lng: number): Promise<string> {
    const k = this.key(lat, lng);
    const hit = this.cache.get(k);
    if (hit !== undefined) return hit;
    await this.slot();
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
  /**
   * من موقعها هي، وإلا أقرب عربية قبلها (بوقت النطق) حيّها **من الـGPS**، وإلا أقرب واحدة بعدها.
   * 🧹 (١٦ نوفمبر ٢٠٢٦) **مش** من حي المندوب كتبه: كتب ⇒ مسح ⇒ لوحة من غير موقع كانت بتاخد المكتوب اللي اتمسح —
   * والمالك: «لما يشيل ميتكتبش وياخد اسم الحي … من الجي بي اس نفسه».
   */
  const autoOf = (x: PlateEntry) => got.get(x.id) || (x.neighborhoodAuto ? String(x.neighborhood ?? "").trim() : "");
  const timeline = entries.slice().sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
  const fallback = (e: PlateEntry): string => nearestAuto(timeline, e, autoOf);
  if (got.size === 0 && !entries.some((x) => autoOf(x))) return entries;
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

/** أقرب لوحة قبلها (بوقت النطق) ليها قيمة **من الـGPS**، وإلا أقرب واحدة بعدها — وإلا "" */
function nearestAuto(timeline: PlateEntry[], e: PlateEntry, autoOf: (x: PlateEntry) => string): string {
  const i = timeline.indexOf(e);
  for (let j = i - 1; j >= 0; j--) {
    const a = autoOf(timeline[j]);
    if (a) return a;
  }
  for (let j = i + 1; j < timeline.length; j++) {
    const a = autoOf(timeline[j]);
    if (a) return a;
  }
  return "";
}

/**
 * 🛣️ بيملى «اسم الشارع» للوحات اللي المربع كان **فاضي** لحظة نطقها (١٦ نوفمبر ٢٠٢٦) — من موقعها هي لو دقته ≤٣٥م،
 * واللي من غير موقع/دقة أضعف ⇒ شارع أقرب لوحة **من الـGPS** (مش اللي المندوب كتبه ومسحه). بيرجّع نسخة جديدة (المرجع
 * نفسه لو مافيش تغيير). `timeoutMs`: اللي ماخلصش بيفضل فاضي — **مابياخدش** شارع لوحة تانية (ممكن تبقى بعيدة)،
 * ومابيبعتش طلبات تانية بعد الوقت.
 */
export async function fillStreets(
  entries: PlateEntry[],
  resolver: DistrictResolver,
  opts: { timeoutMs?: number } = {},
): Promise<PlateEntry[]> {
  const need = entries.filter((e) => !String(e.streetName ?? "").trim());
  if (need.length === 0) return entries;
  const ownFix = (e: PlateEntry) => !!e.pin && Number(e.pin.accuracy) <= AUTO_STREET_MAX_ACCURACY_M;
  const timeline = entries.slice().sort((a, b) => (a.capturedAt ?? 0) - (b.capturedAt ?? 0));
  const got = new Map<string, string>();
  let stop = false;
  const work = (async () => {
    // بترتيب النطق ⇒ اللوحات اللي جنب بعض بتاخد نفس الطلب
    for (const e of timeline) {
      if (stop) return;
      if (String(e.streetName ?? "").trim() || !ownFix(e)) continue;
      const s = await resolver.resolveStreet(e.pin!.lat, e.pin!.lng);
      if (s) got.set(e.id, s);
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise((r) => { timer = setTimeout(r, opts.timeoutMs ?? 180_000); })]);
  clearTimeout(timer);
  stop = true;
  const autoOf = (x: PlateEntry) => got.get(x.id) || (x.streetNameAuto ? String(x.streetName ?? "").trim() : "");
  let changed = false;
  const out = entries.map((e) => {
    if (String(e.streetName ?? "").trim()) return e;
    const s = got.get(e.id) || (ownFix(e) ? "" : nearestAuto(timeline, e, autoOf));
    if (!s) return e;
    changed = true;
    return { ...e, streetName: s, streetNameAuto: true };
  });
  return changed ? out : entries;
}

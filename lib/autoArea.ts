/**
 * ══════════════════════════════════════════════════════════════════════
 *  🏘️ «الحي تلقائي» — صفحة «الجديد»
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٥ سبتمبر ٢٠٢٦): «عايز يبقى فيه زر لما يفتحه المندوب ياخد اسم الحي
 * واسم الشارع تلقائي ويحطهم أمام السيارات اللي بتتشيك، زي اللي في صفحة
 * التشييك. بس لو المندوب كتب في المربع والزر مفتوح يتطبق اللي المندوب كاتبه،
 * ولو المربع فاضي ياخد اسم الحي من الجي بي اس ويكون دقيق… واسم المسجّل لو
 * محطوط ميمنعش التلقائي».
 *
 * نفس طريقة صفحة التشييك (`regionTextFor`): عكس جغرافي بـNominatim على
 * **إحداثيات اللوحة نفسها** (لحظة النطق) بصيغة «الشارع - الحي». وعشان «يكون
 * دقيق»:
 *   · **دقة GPS ≤ ٣٥م بس** (حدّ «متوسطة» في `gpsAccuracyLevel`) — أضعف من كده
 *     الشارع بيطلع غلط، فبياخد **حي العربية اللي قبلها** (`fallbackArea`) —
 *     المالك: «ميسيبش خانات فاضية».
 *   · «غير معروف»/«غير متاح» **مابيتكتبوش**.
 * وعشان Nominatim بيحظر أكتر من طلب في الثانية: آخر عنوان بيتعاد لو المكان
 * هو هو (<١٥م — نفس خنق صفحة التشييك)، والطلبات **واحد ورا التاني**.
 */
import { haversineKm } from "@/lib/gps";

export interface GeoAddressLike {
  street: string;
  district: string;
}

/** أضعف دقة GPS (متر) نقبل بيها اسم الشارع — حدّ «متوسطة» في مربع الـGPS. */
export const AUTO_AREA_MAX_ACCURACY_M = 35;
/** لو المندوب ماتحركش أكتر من كده، نفس العنوان (بلا نداء جديد). */
export const AUTO_AREA_REUSE_M = 15;
/** أقل مسافة زمنية بين طلبين لخدمة العناوين (سياسة Nominatim: طلب/ثانية). */
export const AUTO_AREA_MIN_GAP_MS = 1100;

const UNKNOWN = new Set(["غير معروف", "غير متاح", ""]);

/** مين يكسب في خانة «الحي والشارع» — **اللي المندوب كتبه دايماً الأول**. */
export function areaSource(typed: string | null | undefined, autoOn: boolean): "typed" | "auto" | "none" {
  if (String(typed ?? "").trim()) return "typed";
  return autoOn ? "auto" : "none";
}

/** «الشارع - الحي» بلا «غير معروف»، ومن غير تكرار لو الاتنين نفس الاسم. */
export function regionLabel(a: GeoAddressLike | null | undefined): string {
  if (!a) return "";
  const parts = [String(a.street ?? "").trim(), String(a.district ?? "").trim()]
    .filter((s) => !UNKNOWN.has(s));
  return [...new Set(parts)].join(" - ");
}

/** الصف ده ينفع ياخد حي تلقائي؟ — موقع موجود **ودقيق**. */
export function autoAreaEligible(r: { lat: number | null; lng: number | null; gpsAccuracy: number | null }): boolean {
  if (r.lat == null || r.lng == null || r.gpsAccuracy == null) return false;
  if (!isFinite(r.gpsAccuracy) || r.gpsAccuracy <= 0) return false;
  return r.gpsAccuracy <= AUTO_AREA_MAX_ACCURACY_M;
}

/**
 * بيحوّل الإحداثيات لـ«الشارع - الحي» — طلب واحد في المرة، وآخر عنوان بيتعاد
 * لو المكان ماتغيّرش. الفشل ⇒ نص فاضي (والصفحة بتاخد حي أقرب عربية).
 */
export class AreaResolver {
  private last: { lat: number; lng: number; label: string } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;
  private readonly minGapMs: number;

  constructor(
    private readonly reverse: (lat: number, lng: number) => Promise<GeoAddressLike>,
    opts: { minGapMs?: number } = {},
  ) {
    this.minGapMs = opts.minGapMs ?? AUTO_AREA_MIN_GAP_MS;
  }

  resolve(lat: number, lng: number): Promise<string> {
    const job = this.chain.then(() => this.run(lat, lng));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async run(lat: number, lng: number): Promise<string> {
    const l = this.last;
    if (l && haversineKm(l.lat, l.lng, lat, lng) * 1000 < AUTO_AREA_REUSE_M) return l.label;
    const wait = this.lastCallAt + this.minGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
    let label = "";
    try {
      label = regionLabel(await this.reverse(lat, lng));
    } catch {
      label = "";
    }
    // الفشل مابيتخزّنش — المكان الجاي يستاهل محاولة جديدة
    if (label) this.last = { lat, lng, label };
    return label;
  }
}

/**
 * 🔴 **«مايسيبش خانات فاضية»** — المالك (٢٥ سبتمبر ٢٠٢٦): «لو سيئة ياخد نفس
 * اسم الحي والشارع تبع السيارة اللي قبلها». الـGPS ضعيف أو خدمة العناوين فشلت
 * ⇒ حي **أقرب عربية قبلها** ليها حي؛ ولو مفيش (أول الجلسة) ⇒ أقرب واحدة **بعدها**؛
 * ولو مفيش خالص ⇒ `null` والصف بيستنى لحد ما عربية تاخد حي.
 */
export function fallbackArea(
  rows: ReadonlyArray<{ id: string; shownAt: number; area?: string | null }>,
  id: string,
): string | null {
  const me = rows.find((r) => r.id === id);
  if (!me) return null;
  let before: { t: number; a: string } | null = null;
  let after: { t: number; a: string } | null = null;
  for (const r of rows) {
    if (r.id === id) continue;
    const a = String(r.area ?? "").trim();
    if (!a) continue;
    if (r.shownAt <= me.shownAt) {
      if (!before || r.shownAt > before.t) before = { t: r.shownAt, a };
    } else if (!after || r.shownAt < after.t) {
      after = { t: r.shownAt, a };
    }
  }
  return before?.a ?? after?.a ?? null;
}

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «كل لوحة تاخد موقع» — ختم بأثر رجعي للصفوف اللي سبقت قفل الـGPS
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «وتتأكد مليون في الميّة إن كل لوحة بتاخد موقع
 * دقيق».
 *
 * 🔴 **العلّة**: الموقع بيتختم على الصف **لحظة ما يتعمل**. وأول ثواني بعد
 * فتح الصفحة الـGPS لسه بيقفل، فأول لوحات المندوب بتتسجّل **بلا موقع
 * خالص** — و`exportableTrialRows` بترميها من التصدير. شغل ضايع في صمت.
 *
 * ⚠️ **وليه مهلة ضيّقة**: لو ختمنا أي صف قديم بأول موقع ييجي، اللوحة اللي
 * اتسجّلت في حي تاني هتاخد موقع الحي ده — **وده أسوأ من مافيش موقع**،
 * لأنه غلط بيتكتب في داتا المالك في صمت. فالختم للصفوف الجديدة بس.
 */

/**
 * أقصى عمر للصف اللي ينفع يتختم بأثر رجعي.
 *
 * دقيقتين: أطول من أي وقت قفل GPS طبيعي (٥-٢٠ث، وأكتر جوّه مبنى)، وأقصر
 * بكتير من إن المندوب يكون لفّ لعربية في مكان تاني.
 */
export const GPS_BACKFILL_MAX_AGE_MS = 120_000;

export interface GpsStampable {
  shownAt: number;
  lat: number | null;
  lng: number | null;
}

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * يختم الصفوف اللي **مالهاش موقع** و**لسه جديدة** بالموقع الجديد.
 *
 * بيرجّع **نفس المصفوفة** لو مافيش صف محتاج — عشان `setRows` مايعملش
 * إعادة رسم بلا داعي كل ما موقع جديد ييجي (والمتتبّع بيبعت كل شوية).
 */
export function backfillMissingGps<T extends GpsStampable>(
  rows: readonly T[],
  fix: Fix | null | undefined,
  nowMs: number,
  maxAgeMs: number = GPS_BACKFILL_MAX_AGE_MS,
): T[] | readonly T[] {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return rows;
  const needs = (r: T) => r.lat == null && nowMs - r.shownAt <= maxAgeMs;
  if (!rows.some(needs)) return rows;
  return rows.map((r) => (needs(r) ? { ...r, lat: fix.lat, lng: fix.lng } : r));
}

/**
 * يختم **صف واحد بعينه** (بالـid) بموقعه — عشان كل لوحة تاخد مكانها وقت ما
 * اتاخدت، مش فيكس واحد مشترك مجمّد.
 *
 * ليه بالـid مش بالموقع الفاضي: هنا بنستبدل الفيكس المبدئي (المشترك من المتتبّع)
 * بقراءة موقع **طازة خاصة باللوحة دي**، حتى لو الصف كان ماخد موقع بالفعل. بيرجّع
 * **نفس المصفوفة** لو الـid مش موجود (اتلمّ/اتبدّل) أو الفيكس غير صالح — فمفيش
 * إعادة رسم بلا داعي.
 */
export interface GpsRowById {
  id: string;
  lat: number | null;
  lng: number | null;
  gpsAccuracy?: number | null;
}

export function stampRowGps<T extends GpsRowById>(
  rows: readonly T[],
  id: string,
  fix: Fix | null | undefined,
): T[] | readonly T[] {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return rows;
  if (!rows.some((r) => r.id === id)) return rows;
  return rows.map((r) =>
    r.id === id ? { ...r, lat: fix.lat, lng: fix.lng, gpsAccuracy: fix.accuracy ?? r.gpsAccuracy ?? null } : r,
  );
}

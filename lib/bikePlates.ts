/**
 * ══════════════════════════════════════════════════════════════════════
 *  🏍️ لوحة الموتوسيكل في «Voice PRO» — حرفين + أرقام
 * ══════════════════════════════════════════════════════════════════════
 * المالك (٧ أكتوبر ٢٠٢٦): «فيه لوحات بحرفين ... اللي بحرفين دة بيبقي موتوسيكل وممكن ارقامه كمان تيجي
 * رقمين او رقم او تلاته» و«لو هيا لوحه موتوسيكل بيقول مثلا طع0123 بس هيا مكتوبه مثلا في التشييك طع123».
 *
 * 🔴 **ليه من كلام الموديل الخام**: سيرفر الموديل (`plates_of` في seg_server) بيرمي أي لوحة مش ٣ حروف +
 * ٤ أرقام قبل الرد، فلوحة الموتوسيكل عمرها ما بتوصل في `plate` — بس بتوصل في `rawText`.
 *
 * 🔴 **ليه «لو مطلوبة بس»**: سجلات الصوت (~٤١ ألف قراية) — الموديل كتب لوحة بحرفين ١٦ مرة بس، و**١٠
 * منهم** كانت عربية عادية فاتها حرف أو اتسمع فيها حرف غلط. من غير شرط الشيت كانت هتطلع لوحات غلط؛ بيه
 * لازم تطابق لوحة موتوسيكل مطلوبة **بالحرف** (بعد تكميل الأصفار: «طع0123» = «طع123»).
 */
import { ALL_FLAGGED_MIN_CONF } from "./liveConsensus";
import { TWIN_ROW_WINDOW_MS } from "./placeLiveRow";
import type { WantedHit } from "./wantedFastPath";

/** حروف اللوحة السعودية (بعد توحيد أ/إ/آ ⇐ ا و ى ⇐ ي). */
const PLATE_LETTERS = "ابحدرسصطعقكلمنهوي";
/** كلمة كاملة = حرفين + رقم لـ٤ أرقام («طع0123» / «هل76») — مش جزء من عربية ٣ حروف («اطع0123»). */
const BIKE_TOKEN = /^([ء-ي]{2})(\d{1,4})$/;

export interface BikeRead {
  /** نص الموديل الخام (`raw_text`) */
  rawText?: string | null;
  /** اتحجبت بحاجز الاختراع؟ (أوطى توكن < ‎-0.5) */
  blocked: boolean;
  /** ٠–١ */
  conf: number;
}

/**
 * لوحات الموتوسيكل **المطلوبة** في القراية دي — تطابق تام على فهرس التشييك.
 * `keyOf` لازم يكون **نفس تطبيع الفهرس** (`normalizePlate(bankPlateToArabic(x))`)، واللوحة الراجعة
 * بالأصفار («هل76» ⇐ «هل0076») عشان القرايات المختلفة لنفس الموتوسيكل تبقى لوحة واحدة.
 */
export function bikeWantedHits(
  r: BikeRead,
  index: ReadonlyMap<string, Record<string, string>>,
  keyOf: (plate: string) => string,
): WantedHit[] {
  if (!r || !r.rawText) return [];
  // حاجز الاختراع زي العربية (`wantedFastPath.eligible`): المحجوبة بثقة واطية = اختراع من ضجيج
  if (r.blocked && !(Number.isFinite(r.conf) && r.conf >= ALL_FLAGGED_MIN_CONF)) return [];
  const text = String(r.rawText)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "");
  const out: WantedHit[] = [];
  const seen = new Set<string>();
  for (const word of text.split(/\s+/)) {
    const tok = word.replace(/[^ء-ي0-9]/g, "");   // علامة ترقيم لازقة في الكلمة
    const m = BIKE_TOKEN.exec(tok);
    if (!m || ![...m[1]].every((c) => PLATE_LETTERS.includes(c))) continue;
    const k = keyOf(tok);
    const row = index.get(k);
    if (row && !seen.has(k)) { seen.add(k); out.push({ plate: k, row }); }
  }
  return out;
}

/**
 * فيه صف بنفس اللوحة في نفس الثواني؟ — صف الموتوسيكل بيطلع **مرة واحدة**. دمج التوائم (`placeLiveRow`)
 * مبني على ٣ حروف + ٤ أرقام، فمن غير ده كل قراية بعد التأكيد كانت هتعمل صف جديد.
 */
export function hasNearbyRow(
  rows: readonly { plate: string; atMs?: number | null }[],
  plate: string,
  tMs: number,
  windowMs: number = TWIN_ROW_WINDOW_MS,
): boolean {
  return rows.some((x) => x.plate === plate && Math.abs((x.atMs ?? 0) - tMs) <= windowMs);
}

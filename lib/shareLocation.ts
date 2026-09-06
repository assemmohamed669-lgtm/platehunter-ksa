/**
 * shareLocation — لينك موقع السيارة مع كل لوحة بتتنسخ أو تتشارك من نتيجة الفرز.
 *
 * المندوب بيدوس «نسخ» أو «واتساب» على لوحة (أو يحدّد كذا لوحة ويشارك)، ولازم
 * يوصل معاها **لينك موقعها** عشان يدوس عليه في واتساب وتفتح الخريطة على طول.
 *
 * ليه محتاجين الحتة دي مش بس عمود GPS العادي:
 *   • خلية الـ GPS في الداتا ساعات بتكون «lat,lng» مش رابط — كانت بتتبعت نص خام
 *     مش قابل للدوس.
 *   • لو المندوب أخفى عمود GPS من «أعمدة النتيجة»، اللينك كان بيختفي خالص.
 *   • مشاركة أكتر من لوحة كانت بتطبع القيم الخام من غير تنضيف.
 *
 * فبنحلّ اللينك من **خلية الـ GPS الخام** (مستقل عن الأعمدة الظاهرة) ونحطّه آخر
 * سطر — آخر سطر عشان واتساب بيعمل معاينة لآخر رابط في الرسالة.
 */

import { gpsCellCoords, gpsCellToLink } from "./gps";

/**
 * أعمدة ممكن تحمل موقع: GPS / رابط / موقع / خريطة / إحداثيات / نقطة / دبوس.
 * الصيغتين ة و ه (خريطة/خريطه) لأن ملفات المناديب بتتكتب بالاتنين.
 * توسيع الاسم آمن هنا لأن القيمة نفسها بتتفحص بعده — الاسم بيرتّب الأولوية بس.
 */
const GPS_HEADER_RE =
  /GPS|رابط|موقع|خريطة|خريطه|احداثي|إحداثي|نقطة|نقطه|دبوس|lat|lng|location|link|map|pin|coord/i;

/**
 * رابط خرائط تحديداً — مش أي رابط. بيتستخدم لما بندوّر في أعمدة **مالهاش**
 * اسم موقع، فلازم نتأكد من المحتوى بدل ما نمسك رابط بنك أو إعلان.
 */
const MAPS_URL_RE =
  /(^|\/\/)(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|地図|openstreetmap\.org|waze\.com)|[?&](q|ll|daddr|destination)=-?\d+\.\d+,-?\d+\.\d+/i;

/**
 * أول لينك خرائط **يتقرا فعلاً** من صف — بنلفّ على الأعمدة اللي اسمها يشبه
 * الموقع ونرجّع أول قيمة تتحوّل لرابط صالح.
 *
 * ليه مش أول عمود اسمه فيه «موقع»: ملفات الداتا فيها عمود **«اسم الموقع»**
 * (اسم الحي زي «٨ واحه ليلي») وده مش إحداثيات. لو أخدنا أول عمود مطابق بالاسم
 * هنرجّع اسم حي والمندوب مايوصلوش لينك. فبنفلتر بالقيمة مش بالاسم.
 */
export function pickMapsLink(
  row: Record<string, unknown> | null | undefined,
  headers: string[] | null | undefined,
): string {
  if (!row) return "";
  const cols = headers?.length ? headers : Object.keys(row);
  for (const h of cols) {
    if (!GPS_HEADER_RE.test(h)) continue;
    const link = gpsCellToLink(String(row[h] ?? ""));
    if (link) return link;
  }

  // مالقيناش في الأعمدة المسمّاة → ندوّر في **أي عمود**.
  //
  // ليه: المندوب بيلصق شغله اليومي بإيده، وشيت التفريغ بيحط رابط الخريطة في
  // عمود بلا عنوان — فالرابط بيقع في عمود تاني (أو يتساب بلا اسم) والسيارة
  // تطلع في الفرز بلا خريطة رغم إن الرابط قدام عينك في الصف.
  //
  // وهنا بنشترط إنه **رابط خرائط** تحديداً: لو دوّرنا على أي رابط ممكن نمسك
  // رابط بنك أو موقع شركة ونعرضه على إنه موقع السيارة.
  for (const h of cols) {
    const raw = String(row[h] ?? "").trim();
    // رابط خرائط، أو إحداثيات مكتوبة زي «24.7136,46.6753» (دي مالهاش لبس).
    if (!raw) continue;
    if (!MAPS_URL_RE.test(raw) && !gpsCellCoords(raw)) continue;
    const link = gpsCellToLink(raw);
    if (link) return link;
  }
  return "";
}

/**
 * إحداثيات صف — بأي اسم عمود. بندوّر بالاسم الأول (أولوية لعمود اسمه موقع)
 * وبعدين في **أي عمود** قيمته إحداثيات صالحة.
 *
 * ليه: زر «الأقرب» في نتيجة الفرز كان مربوط بكشف **بالاسم بس**، فمندوب ملفه
 * حاطط الإحداثيات في عمود باسم تاني (أو بلا عنوان — بيحصل كتير في شيتات
 * التفريغ) كان الزر مايظهرش عنده خالص، مع إن المشاركة كانت بتلاقي اللينك
 * (لأن `pickMapsLink` بتدوّر في أي عمود). ده وحّد السلوكين.
 *
 * المدى بيتفحص (‎lat ≤ 90، lng ≤ 180) عشان رقم فيه فاصلة زي «12,345» (سعر أو
 * عدّاد) مايتحسبش إحداثيات — `parseLatLngCell` مابتفحصش المدى.
 */
export function pickRowCoords(
  row: Record<string, unknown> | null | undefined,
  headers: string[] | null | undefined,
): { lat: number; lng: number } | null {
  if (!row) return null;
  const cols = headers?.length ? headers : Object.keys(row);

  const read = (h: string) => {
    const c = gpsCellCoords(String(row[h] ?? ""));
    if (!c) return null;
    if (!isFinite(c.lat) || !isFinite(c.lng)) return null;
    if (Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) return null;
    return c;
  };

  for (const h of cols) if (GPS_HEADER_RE.test(h)) { const c = read(h); if (c) return c; }
  for (const h of cols) { const c = read(h); if (c) return c; }
  return null;
}

/** بيرجّع النص ومعاه سطر «📍 لينك» لو الخلية فيها موقع يتقرا. */
export function withLocationLink(text: string, rawGps: string | null | undefined): string {
  const link = gpsCellToLink(String(rawGps ?? ""));
  if (!link) return text;
  if (text.includes(link)) return text;   // اللينك ظاهر أصلاً (عمود GPS مش مخفي)
  return `${text}\n📍 ${link}`;
}

export interface ShareRow {
  /** صف النتيجة زي ما بيتعرض/بيتصدّر (لوحة + الأعمدة الظاهرة). */
  obj: Record<string, unknown>;
  /** خلية الـ GPS الخام من الداتا (رابط أو lat,lng أو فاضية). */
  gps: string | null | undefined;
}

/**
 * نص مشاركة لأكتر من لوحة — كل لوحة بملخّصها ولينك موقعها.
 * `summarize` بتيجي من `buildRowSummaryText` (نفس الملخّص بتاع اللوحة الواحدة).
 */
export function buildSelectedShareText(
  rows: ShareRow[],
  summarize: (obj: Record<string, unknown>) => string,
): string {
  if (rows.length === 0) return "";
  const blocks = rows.map((r, i) => {
    const plate = String(r.obj["رقم اللوحة"] ?? "").trim();
    const rest = summarize(
      Object.fromEntries(Object.entries(r.obj).filter(([k]) => k !== "رقم اللوحة")),
    );
    const head = `${i + 1}. 🚗 ${plate}`;
    return withLocationLink(rest ? `${head}\n${rest}` : head, r.gps);
  });
  return `*السيارات المطلوبة للسحب (${rows.length})*\n\n` + blocks.join("\n\n──────────\n\n");
}

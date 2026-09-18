/**
 * تحويل نتيجة المزامنة لرسالة يشوفها المندوب — أو `null` لو مافيش داعي.
 *
 * ليه موجودة: مندوب كان عنده **٥٨٨ سجل على تليفونه و١ بس على السيرفر**، وفضل
 * شغّال شهر وهو فاكر إن سجلاته واصلة لمسئول مجموعته. السبب إن المزامنة
 * التلقائية كانت بتبلع أي فشل (`.catch(() => {})`) — فلا هو ولا المسئول
 * عندهم أي طريقة يعرفوا.
 *
 * ⚠️ وبنحرص إننا **مانخوّفوش من غير سبب**: أوفلاين مؤقت أو مفيش جلسة مايطلّعوش
 * تحذير — دول أوضاع طبيعية في شغله اليومي (النت بيقطع كتير)، والتحذير عليهم
 * بيخلّي المندوب يتجاهل التحذيرات كلها بعد كده.
 */

export interface SyncResult {
  synced: number;
  pending: number;
  error?: string;
}

/** أسباب مش مستاهلة تحذير — وضع طبيعي مش عطل. */
const QUIET = ["الجهاز أوفلاين", "مفيش جلسة صالحة"];

export function syncFailureMessage(res: SyncResult): string | null {
  if (res.error && QUIET.includes(res.error)) return null;
  const left = res.pending - res.synced;
  if (left <= 0) return null;
  const why = res.error ? ` — ${res.error}` : "";
  return `⚠️ فيه ${left} سجل لسه ماوصلش السيرفر${why}. دوس «مزامنة».`;
}

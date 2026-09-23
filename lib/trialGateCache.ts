/**
 * ══════════════════════════════════════════════════════════════════════
 *  صلاحية «الجديد» — بتتفتكر طول ما التطبيق مفتوح
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «صفحة الجديد لما بروح عليها بتبقى تقيلة شوي،
 * خليها أسرع».
 *
 * 🔴 كل فتحة كانت بتستنى **٣ نداءات شبكة ورا بعض** قبل ما ترسم أي حاجة
 * («جارٍ التحقق…»): المستخدم (`getUser`) ← البروفايل ← التوكن. على نت
 * الموبايل كل واحد مئات المللي، ومع كل رجوع للصفحة.
 *
 * دلوقتي الرجوع بيرسم **على طول** من اللي اتفتكر هنا، والتأكيد من السيرفر
 * بيحصل في الخلفية — ولو الصلاحية اتقفلت الصفحة بتتقفل.
 *
 * ⚠️ **الذاكرة بس** — مش تخزين الجهاز. التطبيق يتقفل تتنسي، والتوكن
 *    مابيتكتبش على الموبايل. ونسخة واحدة لمستخدم واحد: حد تاني يدخل على
 *    نفس الجهاز مايورثش صلاحية اللي قبله.
 */

export interface TrialGateEntry {
  isSuper: boolean;
  token: string | null;
}

let slot: { userId: string; entry: TrialGateEntry } | null = null;

/** يفتكر إن المستخدم ده مسموحله — **بيستبدل** أي حاجة قبلها. */
export function rememberTrialGate(userId: string | null | undefined, entry: TrialGateEntry): void {
  if (!userId) return;
  slot = { userId, entry: { ...entry } };
}

/** اللي اتفتكر لنفس المستخدم، وإلا `null` (لازم نسأل السيرفر). */
export function cachedTrialGate(userId: string | null | undefined): TrialGateEntry | null {
  if (!userId || !slot || slot.userId !== userId) return null;
  return { ...slot.entry };
}

/** الصلاحية اتقفلت — المرة الجاية لازم نسأل. */
export function forgetTrialGate(): void {
  slot = null;
}

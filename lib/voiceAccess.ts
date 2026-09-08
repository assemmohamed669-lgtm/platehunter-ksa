/**
 * مين يشوف تبويب «صوتي» في صفحة التشييك.
 *
 * القاعدة: الصوت مفعّل للمشترك (`voicex_enabled`) — أو هو السوبر أدمن. اللي
 * مقفول عنده مايشوفش التبويب **خالص** (مش مجرد إن المحرك بيتغيّر).
 *
 * الحتة الحسّاسة هي لما القراءة من السيرفر تفشل (أوفلاين أو خطأ):
 *  • لو أظهرناه افتراضياً → المقفول عنده يلمحه ويدوس عليه.
 *  • لو خبّيناه افتراضياً → المسموح له بيفقد الصوت كل ما يفتح البرنامج أوفلاين،
 *    وهو أهم شغل عنده (بيسجّل في الشارع من غير شبكة أحياناً).
 * فبنرجع لآخر قيمة معروفة متخزّنة على الجهاز، ولو مافيش نخبّي.
 */
export interface VoiceAccessProfile {
  voicex_enabled?: boolean | null;
  is_super?: boolean | null;
}

/**
 * @param profile صف المشترك من السيرفر، أو `null` لو القراءة فشلت.
 * @param cached  آخر قيمة معروفة على الجهاز، أو `null` لو مافيش.
 */
export function voiceTabVisible(
  profile: VoiceAccessProfile | null,
  cached: boolean | null,
): boolean {
  if (profile) return profile.voicex_enabled === true || profile.is_super === true;
  return cached ?? false;
}

const KEY = "ph:voiceAllowed";

export function loadCachedVoiceAccess(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch { return null; }
}

export function saveCachedVoiceAccess(allowed: boolean): void {
  try { localStorage.setItem(KEY, allowed ? "1" : "0"); } catch { /* storage unavailable */ }
}

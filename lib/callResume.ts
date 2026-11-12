/**
 * ══════════════════════════════════════════════════════════════════════
 *  📞 أندرويد: التسجيل يكمّل لوحده بعد المكالمة (١٢ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: حامد محمد 1 «بيقولي ان البرنامج بيفصل معاه والصوت اوقات كتير مش بيستجيب … وايه الحل» ⇒ «اعمل 1 و 2».
 *
 * الصندوق الخفيف (٢٦ ساعة، أندرويد 1.8): التسجيل وقف لوحده ٤ مرات وكلهم مكالمات — كاشف المكالمة
 * (`BackgroundRecordingService.checkCall` ⇒ `phNativeCall`) بيقفل الميك عشان «المكالمة ليها الأولوية» (المالك ٢٣ سبتمبر)،
 * وبعدها التسجيل بيفضل واقف لحد ما يرجع ويدوس «ابدأ» (٤ د / ٢٢ د / ٣٣ د / ~٣ س).
 *
 * ⇒ لحامد وللسوبر أدمن بس وعلى الأندرويد بس:
 *  · المكالمة لسه بتقفل الميك على طول زي الأول بالحرف.
 *  · لما يرجع للبرنامج خلال ساعة ⇒ شريط «هنكمّل لوحدنا» بزرار «لأ» ٣ ثواني، وبعدين «ابدأ» لوحده.
 *    الصفحة ماتقدرش تعرف المكالمة خلصت ولا لأ (الجسر مابيقولش)، فالعدّ ده عشان لو رجع والمكالمة **لسه شغّالة**.
 *  · رجع لوحده والمكالمة قفلته تاني في ثواني ⇒ المكالمة لسه شغّالة ⇒ مفيش محاولة تانية (يدوس «ابدأ» بإيده).
 * أي حد تاني (ومنهم الآيفون — ليه `lib/iosRecover.ts`): ولا حاجة اتغيّرت. الرجوع: فضّي `CALL_RESUME_IDS` + شيل `isSuper`.
 */
import type { AutoResumeMark } from "./iosRecover";

export const CALL_RESUME_IDS: string[] = [
  "7009368e-6052-4011-a12c-83bd17ad44ee",   // حامد محمد 1
];

/** سبب الرجوع في العلامة وفي سطر الصندوق (`rv2-auto`) */
export const CALL_RESUME_WHY = "call";
/** رجع للبرنامج بعد المكالمة بأكتر من كده ⇒ مايبدأش لوحده (يمكن خلّص شغله). مكالماته كانت ٤–٣٣ دقيقة. */
export const CALL_RESUME_WINDOW_MS = 60 * 60_000;
/** العدّ قبل «ابدأ» لوحده — وقت يدوس فيه «لأ» لو لسه في المكالمة */
export const CALL_RESUME_DELAY_MS = 3000;
/** المكالمة قفلت تسجيل رجع لوحده من أقل من كده ⇒ المكالمة لسه شغّالة (الكاشف بيقفل بعد ~٣–٤ث) */
export const CALL_RESUME_RETRY_GUARD_MS = 20_000;

export const CALL_RESUME_COUNTDOWN_TEXT =
  "📞 المكالمة خلصت؟ هنكمّل التسجيل لوحدنا بعد ٣ ثواني — لوحاتك كلها محفوظة. لو لسه في مكالمة دوس «لأ».";

export function callResumeFor(uid: string | null | undefined, isSuper: boolean, platform: string | null | undefined): boolean {
  if (platform !== "android") return false;
  return isSuper === true || (!!uid && CALL_RESUME_IDS.includes(uid));
}

/** المكالمة قفلت التسجيل ⇒ علامة إنه يرجع لما المندوب يرجع للبرنامج (إلا لو ده تسجيل لسه راجع لوحده من ثواني). */
export function callResumeMark(nowMs: number, lastAutoStartAt: number | null): AutoResumeMark | null {
  if (lastAutoStartAt != null && nowMs - lastAutoStartAt < CALL_RESUME_RETRY_GUARD_MS) return null;
  return { why: CALL_RESUME_WHY, at: nowMs, windowMs: CALL_RESUME_WINDOW_MS };
}

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📱 الآيفون: التسجيل يكمّل بعد قطع الصوت القصير، ويرجع لوحده لما المندوب يرجع (٣ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «لما يخلص اتصاله او لما يخرج يشوف رساله … ويرجع تاني … المفروض اللوحات اللي بيقولها تظهرله وبالاخص في
 * الايفون» · «المهم ميأثروش عليهم ولا يخرب حاجه».
 *
 * الصندوق الخفيف (احمد حماده حسن · عادل عطية): الآيفون بيقطع الصوت لحظة (إشعار/الخرائط/سيري) ⇒ `interrupted` كان
 * بيقفل التسجيل **على طول** وهو جوّه البرنامج، والرجوع من واتساب/المكالمة مابيكمّلش لوحده (لازم «ابدأ» وكتير مابياخدوش
 * بالهم). و`suspended` على نفس الموبايلات رجع لوحده في عُشر ثانية (#503) ⇒ الآيفون بيسمح يرجّع الصوت من غير لمسة.
 *
 * ⇒ للاتنين دول بس وعلى الآيفون بس:
 *  · قطع الصوت/كتم المايك ⇒ مهلة `IOS_RECOVER_MIC_GRACE_MS` والمحرّك بيحاول يرجّعه — مارجعش (مكالمة) ⇒ نفس الوقف.
 *  · وقف تلقائي (خرج/قطع) ورجع للبرنامج خلال `AUTO_RESUME_WINDOW_MS` ⇒ «ابدأ» لوحده؛ فشل ⇒ رسالة «دوس ابدأ».
 *  · طلب «سيب الشاشة صاحية» بيتعاد مع أول لمسة لو الآيفون رفضه.
 * أسوأ حالة = وقف زي النهارده. الرجوع: فضّي `IOS_RECOVER_IDS`.
 */

export const IOS_RECOVER_IDS: string[] = [
  "a32ad070-d248-4308-b6d2-64dba81b2b96",   // احمد حماده حسن
  "b6c7d5a7-e967-4d80-9265-3b1a42795c9e",   // عادل عطية
];

/** مهلة قطع الصوت/كتم المايك — الإشعار والخرائط وسيري ثواني؛ المكالمة أطول ⇒ بتقف بعدها زي النهارده. */
export const IOS_RECOVER_MIC_GRACE_MS = 8000;
/** رجع للبرنامج بعد الوقف بأكتر من كده ⇒ مايبدأش لوحده (يمكن خلّص شغله). */
export const AUTO_RESUME_WINDOW_MS = 10 * 60_000;

export function iosRecoverFor(uid: string | null | undefined, platform: string | null | undefined): boolean {
  return platform === "ios" && !!uid && IOS_RECOVER_IDS.includes(uid);
}

const AUTO_REASONS = new Set(["background", "interrupted", "muted", "ended"]);

export interface AutoResumeMark { why: string; at: number }

/** وقف تلقائي (مش «وقف» بإيده ولا المطلوبة ولا السيرفر) ⇒ علامة إنه يرجع لوحده. */
export function autoResumeMark(why: string, nowMs: number): AutoResumeMark | null {
  return AUTO_REASONS.has(why) ? { why, at: nowMs } : null;
}

/** رجع قدام الشاشة، خلال المهلة، ومفيش تسجيل شغّال أو بيبدأ. */
export function shouldAutoResume(mark: AutoResumeMark | null, nowMs: number, busy: boolean, visible: boolean): boolean {
  return !!mark && visible && !busy && nowMs - mark.at <= AUTO_RESUME_WINDOW_MS;
}

export const AUTO_RESUMED_TEXT = "🎙️ رجعنا نسجّل لوحدنا بعد ما رجعت للبرنامج — لوحاتك كلها محفوظة.";
export const AUTO_RESUME_FAILED_TEXT = "⏸️ التسجيل وقف وإنت برّه البرنامج ومقدرناش نكمّله لوحده — دوس «ابدأ التسجيل». لوحاتك كلها محفوظة.";

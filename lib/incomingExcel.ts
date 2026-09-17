/**
 * وجهات ملف الإكسيل اللي المندوب بيفتحه من واتساب/الملفات.
 *
 * المشترك **صوت-فقط** كان بيتعرضله نفس خيارات صفحة الفرز — وهي مقفولة عنده.
 * فيختار «إحالة» فالملف يتحفظ في سلوت صفحة الفرز، وتبويب «فرز» بتاعه بيقرا من
 * سلوت تاني خالص ⇒ **الخانة تفضل فاضية** وهو مش فاهم ليه. ويختار «تشييك»
 * فيتوديه للصفحة من غير ما حاجة تتغيّر.
 *
 * دلوقتي: صوت-فقط = **خيارين بس** (تشييك · إحالة)، والإحالة بتروح للسلوت الصح.
 * وباقي المشتركين زي ما هم بالظبط.
 */
import type { CheckTab } from "./checkTab";

/** سلوت إحالة المشترك صوت-فقط — نفس اللي تبويب «فرز» بتاعه بيقرا منه. */
export const VOICE_REFERRAL_SLOT = "voice-referral";

export interface IncomingOption {
  slot: string;
  label: string;
  hint: string;
  /** لأي تبويب يروح بعد الحفظ (المشترك صوت-فقط بيفضل جوّه صفحة التشييك). */
  goTab?: CheckTab;
}

// ترتيب مؤنث للعرض («ثانية/ثالثة/...») — رقم اللي أكبر من ١٠ يظهر رقمياً.
const ORDINAL_FEM = ["", "الأولى", "ثانية", "ثالثة", "رابعة", "خامسة", "سادسة", "سابعة", "ثامنة", "تاسعة", "عاشرة"];
const ordinalFem = (n: number): string => ORDINAL_FEM[n] ?? `رقم ${n}`;

export function incomingExcelOptions(
  opts: { voiceOnly: boolean; nextReferralNum: number | null },
): IncomingOption[] {
  if (opts.voiceOnly) {
    // صفحة الفرز مقفولة عنده ⇒ مافيش «داتا» ولا إحالات إضافية، والوجهتين
    // الاتنين جوّه صفحة التشييك.
    return [
      { slot: "check", label: "أضف لخانة التشييك", hint: "القائمة المرجعية للبحث", goTab: "sheet" },
      { slot: VOICE_REFERRAL_SLOT, label: "أضف لخانة الإحالة", hint: "تتفرز على سجلاتك", goTab: "sort" },
    ];
  }
  return [
    { slot: "data", label: "ملف الداتا", hint: "بيانات التفريغ الميداني" },
    { slot: "referral", label: "ملف الإحالة", hint: "قائمة البنك/الشركة" },
    ...(opts.nextReferralNum !== null
      ? [{
          slot: `referral-${opts.nextReferralNum}`,
          label: `إحالة ${ordinalFem(opts.nextReferralNum)}`,
          hint: "تتدمج مع الإحالة الأساسية في نفس الفرز",
        }]
      : []),
    { slot: "check", label: "ملف التشييك", hint: "القائمة المرجعية للبحث" },
  ];
}

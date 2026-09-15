/**
 * فحص اتصال جوجل درايف — الجزء النقي (بيتترجم من رد السيرفر لرسالة عربية).
 *
 * ⚠️ الدرس اللي جه من حادثة ٢٠٢٦-٠٩-١٥: التوكن مات وفضل التطبيق أسبوعين
 * بيقول «مفيش شهادة» للمناديب، والمالك عرف من شكوى مش من التطبيق. فالفحص ده
 * لازم يفرّق بين **تلات حالات** كانت كلها بتبان زي بعض:
 *   • الصلاحية ماتت           ⇒ لازم refresh token جديد
 *   • شغّال بس صفر ملفات      ⇒ الفولدرات مش مشاركة مع الحساب (مشكلة تانية خالص)
 *   • شغّال وبيرجّع ملفات      ⇒ تمام
 */

export interface DriveHealth {
  ok: boolean;
  /** عدد ملفات الـPDF اللي درايف رجّعها في فحص خفيف (أول صفحة بس). */
  files?: number;
  /** سبب الفشل زي ما رجع من السيرفر. */
  error?: string;
}

export type HealthLevel = "ok" | "warn" | "fail";

export interface HealthMessage {
  level: HealthLevel;
  text: string;
}

export function driveHealthMessage(h: DriveHealth): HealthMessage {
  if (!h.ok) {
    switch (h.error) {
      case "drive_unavailable":
        return {
          level: "fail",
          text: "الاتصال بجوجل درايف مش شغّال — الصلاحية محتاجة تجديد (refresh token جديد).",
        };
      case "unauthorized":
        return { level: "fail", text: "الجلسة انتهت — سجّل خروج ودخول تاني." };
      case "forbidden":
        return { level: "fail", text: "الجلسة انتهت أو مش صلاحية أدمن — سجّل خروج ودخول تاني." };
      case "network":
        return { level: "fail", text: "مافيش اتصال بالإنترنت — الفحص نفسه ماوصلش للسيرفر." };
      default:
        return { level: "fail", text: "الفحص فشل لسبب غير معروف — جرّب تاني." };
    }
  }

  const files = Number(h.files ?? 0);
  if (files > 0) {
    return { level: "ok", text: `الاتصال شغّال ✅ — درايف رجّع ${files} ملف شهادة.` };
  }
  return {
    level: "warn",
    text: "الاتصال شغّال بس الحساب مش شايف ولا شهادة — اتأكد إن فولدرات الشركات لسه مشاركة معاه.",
  };
}

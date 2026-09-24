/**
 * 🏷️ اسم صفحة «الجديد» (`/registration-v2`) — المالك (٢٤ سبتمبر ٢٠٢٦): «عايزك تغيّرلي
 * اسم الصفحة من الجديد إلى Voice PRO».
 *
 * 🔒 **السوبر أدمن الأول** (قاعدة المالك: «متنشرش التعديل غير للسوبر أدمن»). الفتح
 * للكل = الدالة ترجّع `PRO` على طول (سطر واحد) — كل الأماكن بتاخد من هنا.
 */
const PRO = { tab: "Voice PRO", title: "Voice PRO", menu: "Voice PRO", share: "لوحات Voice PRO" } as const;
const OLD = { tab: "الجديد", title: "التسجيل الجديد", menu: "التسجيل الجديد (تجربة)", share: "لوحات التسجيل الجديد" } as const;

export type VoiceProNames = { tab: string; title: string; menu: string; share: string };

export function voiceProNames(isSuper: boolean): VoiceProNames {
  return isSuper ? PRO : OLD;
}

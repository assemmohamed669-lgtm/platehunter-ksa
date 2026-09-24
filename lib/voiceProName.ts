/**
 * 🏷️ اسم صفحة «الجديد» (`/registration-v2`) — المالك (٢٤ سبتمبر ٢٠٢٦): «عايزك تغيّرلي
 * اسم الصفحة من الجديد إلى Voice PRO».
 *
 * 🔒 **السوبر أدمن الأول** (قاعدة المالك: «متنشرش التعديل غير للسوبر أدمن»). الفتح
 * للكل = الدالة ترجّع `PRO` على طول (سطر واحد) — كل الأماكن بتاخد من هنا.
 */
const PRO = { tab: "Voice PRO", title: "Voice PRO", menu: "Voice PRO", share: "لوحات Voice PRO" } as const;

export type VoiceProNames = { tab: string; title: string; menu: string; share: string };

export function voiceProNames(_isSuper?: boolean): VoiceProNames {
  // 🏷️ للكل — المالك جرّبه كسوبر أدمن وقال «يلا ارفع» (٢٤ سبتمبر ٢٠٢٦).
  void _isSuper;
  return PRO;
}

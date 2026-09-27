/**
 * 🗑️ شكل جدول Voice PRO — المالك (٢٧ سبتمبر ٢٠٢٦): «إلغاء الترقيم في صفحة
 * voice pro، وبدّل لوجو المسح اللي قدام (x) لشكل لوجو سلة حذف صغيرة».
 *
 * 🔓 للكل — اتجرّب كسوبر أدمن الأول (#337) والمالك قال «انشره للكل».
 *
 * 🔢 **عدد اللوحات فوق** — المالك: «الترقيم اللي جنب اللوحة تمام اتشال، بس أنا
 * عايز عدد اللوحات اللي بتتشيّك يظهر فوق في المربّع». العدّاد كان رقم رمادي صغير
 * من غير كلمة وجاي بعد زرّ «الشكل» فمش باين. 🔓 للكل على طول (المالك: «ارفعه للكل على طول»).
 */
export interface VoiceProTable {
  /** عمود «#» (رقم الصف) */
  rowNumbers: boolean;
  /** علامة مسح اللوحة الواحدة */
  deleteIcon: "trash" | "x";
  /** عدّاد اللوحات جنب العنوان: «عدد اللوحات: N» واضح */
  plateCount: "labeled";
}

export function voiceProTable(_isSuper?: boolean): VoiceProTable {
  void _isSuper;
  return { rowNumbers: false, deleteIcon: "trash", plateCount: "labeled" };
}

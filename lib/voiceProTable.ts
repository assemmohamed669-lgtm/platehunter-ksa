/**
 * 🗑️ شكل جدول Voice PRO — المالك (٢٧ سبتمبر ٢٠٢٦): «إلغاء الترقيم في صفحة
 * voice pro، وبدّل لوجو المسح اللي قدام (x) لشكل لوجو سلة حذف صغيرة».
 *
 * 🔓 للكل — اتجرّب كسوبر أدمن الأول (#337) والمالك قال «انشره للكل».
 */
export interface VoiceProTable {
  /** عمود «#» (رقم الصف) */
  rowNumbers: boolean;
  /** علامة مسح اللوحة الواحدة */
  deleteIcon: "trash" | "x";
}

export function voiceProTable(_isSuper?: boolean): VoiceProTable {
  void _isSuper;
  return { rowNumbers: false, deleteIcon: "trash" };
}

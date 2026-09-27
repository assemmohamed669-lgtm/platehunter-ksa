/**
 * 🗑️ شكل جدول Voice PRO — المالك (٢٧ سبتمبر ٢٠٢٦): «إلغاء الترقيم في صفحة
 * voice pro، وبدّل لوجو المسح اللي قدام (x) لشكل لوجو سلة حذف صغيرة».
 *
 * 🔒 السوبر أدمن الأول: الباقي بيشوف الجدول زي ما هو بالحرف لحد ما المالك
 * يجرّب ويقول «ارفعه للكل» — وساعتها الدالة ترجّع نفس القيمة للكل.
 */
export interface VoiceProTable {
  /** عمود «#» (رقم الصف) */
  rowNumbers: boolean;
  /** علامة مسح اللوحة الواحدة */
  deleteIcon: "trash" | "x";
}

export function voiceProTable(isSuper: boolean): VoiceProTable {
  return isSuper
    ? { rowNumbers: false, deleteIcon: "trash" }
    : { rowNumbers: true, deleteIcon: "x" };
}

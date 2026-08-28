/**
 * فحص سلامة الاستيراد — الحماية من **الداتا الناقصة الصامتة**.
 *
 * لما القراءة تبقى في Worker والكتابة في الصفحة، بيبقى فيه طرفين وممكن تضيع
 * دفعة في النص من غير ما حد يلاحظ. المندوب ساعتها بيفرز على داتا ناقصة
 * ومايعرفش — وسيارة مطلوبة في ملفه مابتظهرش.
 *
 * ده أسوأ من أي كراش: الكراش بيبان، والنقص صامت وممكن يعدّي أسابيع.
 *
 * فالقاعدة صارمة: **مافيش تسامح ولا بصف واحد**، لا نقص ولا زيادة.
 */
export function verifyImportCounts(readRows: number, writtenRows: number): void {
  if (!Number.isFinite(readRows) || !Number.isFinite(writtenRows) ||
      readRows < 0 || writtenRows < 0) {
    throw new Error(
      `فحص الاستيراد: عدد صفوف غير صالح (قُرئ ${readRows}، كُتب ${writtenRows}).`
    );
  }
  if (readRows !== writtenRows) {
    throw new Error(
      `الاستيراد غير مكتمل — قُرئ ${readRows} صف واتكتب ${writtenRows}. ` +
      `مارفعناش الملف عشان مايتفرزش على داتا ناقصة. جرّب تاني.`
    );
  }
}

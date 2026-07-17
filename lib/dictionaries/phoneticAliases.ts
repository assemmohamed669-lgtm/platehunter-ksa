/**
 * الجيرة الصوتية — مشتقّة من البذرة
 * ==================================
 * مصدر الحقيقة الوحيد: `PHONETIC_NEIGHBOR_GROUPS` في `saudiPlateLetters.ts`.
 * الملف ده بيعيد تصديرها زي ما هي + بيشتق منها دالة استعلام سريعة.
 *
 * الاستخدام (المرحلة ٢): لما حرف برا الـ 17 يوصل، أو المطابقة الضبابية
 * تحتار، البحث يبدأ جوا نفس المجموعة الأول قبل ما يوسّع.
 */
import { PHONETIC_NEIGHBOR_GROUPS } from "./saudiPlateLetters";

export { PHONETIC_NEIGHBOR_GROUPS };

/**
 * بيرجّع جيران الحرف الصوتيين (من غير الحرف نفسه).
 * لو الحرف مش في أي مجموعة → مصفوفة فاضية.
 */
export function phoneticNeighborsOf(letter: string): string[] {
  const neighbors: string[] = [];
  for (const group of PHONETIC_NEIGHBOR_GROUPS) {
    if (group.includes(letter)) {
      for (const other of group) {
        if (other !== letter && !neighbors.includes(other)) {
          neighbors.push(other);
        }
      }
    }
  }
  return neighbors;
}

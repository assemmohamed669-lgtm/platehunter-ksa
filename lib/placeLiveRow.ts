import { sameCarTwin, isExactRepeatNearby, sameUtterance } from "@/lib/trialTwin";
import { mergeTwinRow, type MergeRow } from "@/lib/trialRowMerge";
import { isLetterTwin, resolveLetterTwin, type LetterTwinRow } from "@/lib/letterTwin";
import { confirmedWins, type RowRank } from "@/lib/provisionalRow";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  وضع الصف الجديد في جدول «الجديد» — صف جديد ولا يتلمّ في توأمه؟
 * ══════════════════════════════════════════════════════════════════════
 *
 * كانت مكتوبة **مرتين بالحرف** جوّه الصفحة (المؤكّد من الإجماع والمبدئي من
 * أول قراية) — اتنقلت هنا من غير تغيير عشان تتختبر وتتقاس على تسجيلات
 * المناديب. القواعد نفسها وأسبابها في ملفاتها:
 *   ١. توأم الحروف (نفس الأرقام + حرفين) ⇒ الأقدم يكسب — `letterTwin.ts`
 *   ٢. نفس اللوحة بالحرف ⇒ تتلمّ لو قريبة في الصفوف أو نفس النطقة — `trialTwin.ts`
 *   ٣. توأم مسخّم (نفس الحروف + ≤ خانتين في ١٢ث) ⇒ يتلمّ — `sameCarTwin`
 *   ٤. المؤكّد بيغلب المبدئي — `provisionalRow.ts`
 *   ٥. الصف بيحافظ على هويته وشغل المندوب بيغلب — `trialRowMerge.ts`
 *
 * 🚚 **`distinct`** (جديد): لوحتين اتسمعوا **في نافذة واحدة** بأرقام متسلسلة
 * (`حبل1234`/`حبل1235`) = عربيتين — مايتلمّوش في ٣. شوف `fleetPairs.ts`.
 */
export const TWIN_ROW_WINDOW_MS = 12000;

export type PlaceableRow = MergeRow & LetterTwinRow & RowRank;

export function placeLiveRow<T extends PlaceableRow>(
  prev: T[],
  fresh: T,
  distinct?: (a: string, b: string) => boolean,
): T[] {
  const lt = prev.find((r) => isLetterTwin(r, fresh));
  if (lt) return prev.map((r) => (r.id === lt.id ? resolveLetterTwin(lt, fresh) : r));

  const nearby = isExactRepeatNearby(fresh.plate, prev.map((r) => r.plate));
  const twin = prev.find((r) => (r.plate === fresh.plate
    ? (nearby || sameUtterance(r, fresh)) && sameCarTwin(r, fresh, TWIN_ROW_WINDOW_MS)
    : sameCarTwin(r, fresh, TWIN_ROW_WINDOW_MS) && !distinct?.(r.plate, fresh.plate)));
  if (!twin) return [fresh, ...prev];
  if (!confirmedWins(fresh, twin)) return prev;
  const merged = mergeTwinRow(fresh, twin);
  return [merged, ...prev.filter((r) => r.id !== twin.id)];
}

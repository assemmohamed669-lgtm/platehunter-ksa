import { sameCarTwin, isExactRepeatNearby, sameUtterance } from "@/lib/trialTwin";
import { mergeTwinRow, type MergeRow } from "@/lib/trialRowMerge";
import { isLetterTwin, resolveLetterTwin, type LetterTwinRow } from "@/lib/letterTwin";
import { confirmedWins, type RowRank } from "@/lib/provisionalRow";
import { isFleetPair } from "@/lib/fleetPairs";

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
 * 🚚 **`distinct`**: عربيتين في أسطول متسلسل اتثبتوا (`FleetMemory`) —
 * مايتلمّوش في ٣. شوف `fleetPairs.ts`.
 *
 * 🔁 **والدمج بين لوحتين متسلسلتين بيترجع لو الدليل وصل متأخّر.** تأخير الشبكة
 * عند المالك ~٣.٥ث، فساعات ٢١٠٣ بتتأكّد **قبل** ما تتثبت وبتعدّل على صف ٢١٠٢
 * («بيعدّل على آخر لوحة»). فالصف بيشيل نسخة من اللي اتبلع (`mergedFrom`) —
 * واللي خسر كمان — و`restoreFleetRows` بيرجّعه صف لوحده ببياناته أول ما يتثبت.
 * غلط السمع العادي عمره مابيتثبت، فمابيرجعش.
 */
export const TWIN_ROW_WINDOW_MS = 12000;

export type PlaceableRow = MergeRow & LetterTwinRow & RowRank & {
  /** 🔁 نسخ لوحات متسلسلة اتلمّت في الصف ده — ترجع لو اتثبت إنها عربيات تانية. */
  mergedFrom?: PlaceableRow[];
};

/** نسخة من الصف من غير نسخه هو (مابنخزّنش سلاسل). */
function snapshot<T extends PlaceableRow>(r: T): T {
  const { mergedFrom: _drop, ...rest } = r;
  void _drop;
  return rest as T;
}

/** يضيف نسخة لوحة للصف — نسخة واحدة لكل لوحة، والأقوى تفضل. */
function withShadow<T extends PlaceableRow>(shadows: PlaceableRow[] | undefined, s: T): PlaceableRow[] {
  const list = [...(shadows ?? [])];
  const i = list.findIndex((x) => x.plate === s.plate);
  if (i < 0) list.push(snapshot(s));
  else if (confirmedWins(s, list[i])) list[i] = snapshot(s);
  return list;
}

export function placeLiveRow<T extends PlaceableRow>(
  prev: T[],
  fresh: T,
  distinct?: (a: string, b: string) => boolean,
): T[] {
  return restoreFleetRows(place(prev, fresh, distinct), distinct);
}

function place<T extends PlaceableRow>(
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
  // 🔁 لوحتين متسلسلتين لسه ماتثبتوش ⇒ اللي هيتبلع (أو هيخسر) يتحفظ
  const fleetCandidate = !!distinct && isFleetPair(twin.plate, fresh.plate);
  if (!confirmedWins(fresh, twin)) {
    if (!fleetCandidate) return prev;
    return prev.map((r) => (r.id === twin.id ? { ...r, mergedFrom: withShadow(r.mergedFrom, fresh) } : r));
  }
  const merged: T = { ...mergeTwinRow(fresh, twin) };
  const shadows = fleetCandidate ? withShadow(twin.mergedFrom, twin) : twin.mergedFrom;
  if (shadows?.length) merged.mergedFrom = shadows;
  else delete merged.mergedFrom;
  return [merged, ...prev.filter((r) => r.id !== twin.id)];
}

/**
 * 🔁 يرجّع العربيات اللي اتلمّت في صف لوحة متسلسلة أول ما يتثبت إنها عربية
 * تانية. من غير أسطول (`distinct` مش موجود أو مفيش نسخ) ⇒ **نفس المصفوفة**.
 * لو العربية ظهرت خلاص في صف لوحدها ⇒ النسخة تتشال من غير تكرار.
 */
export function restoreFleetRows<T extends PlaceableRow>(
  rows: T[],
  distinct?: (a: string, b: string) => boolean,
): T[] {
  if (!distinct || !rows.some((r) => r.mergedFrom?.length)) return rows;
  let out = rows;
  for (const r of rows) {
    const shadows = r.mergedFrom ?? [];
    if (!shadows.length) continue;
    const back: T[] = [];
    const keep: PlaceableRow[] = [];
    for (const s of shadows) {
      if (s.plate === r.plate) continue;                              // الصف رجع لنفس اللوحة
      if (!distinct(s.plate, r.plate)) { keep.push(s); continue; }    // لسه مااتثبتش
      if (out.some((x) => x.plate === s.plate)) continue;             // ظهرت خلاص لوحدها
      back.push({ ...(s as T), id: s.id + "~" + r.id });
    }
    if (keep.length === shadows.length) continue;
    const updated = { ...r } as T;
    if (keep.length) updated.mergedFrom = keep;
    else delete updated.mergedFrom;
    out = out.flatMap((x) => {
      if (x.id !== r.id) return [x];
      // الأحدث فوق زي باقي الجدول
      const newer = back.filter((b) => b.atMs > r.atMs);
      const older = back.filter((b) => b.atMs <= r.atMs);
      return [...newer, updated, ...older];
    });
  }
  return out;
}

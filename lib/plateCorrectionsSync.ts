/**
 * مزامنة تعلّم تصحيح اللوحات على السيرفر — عشان كل المناديب يستفيدوا من
 * تصحيحات بعض (التعلّم مشترك؛ المفتاح الصوتي بيفضل خاص بكل مندوب).
 *
 * السيرفر: جدول `plate_corrections (kind, heard, corrected, count)` + دالة
 * `bump_plate_correction` (زيادة ذرّية آمنة). القراءة مفتوحة للمسجّلين، والكتابة
 * عبر الدالة بس. لو الجدول/الدالة لسه مش متعمولين (SQL) الكود بيرجّع بهدوء من
 * غير ما يكسر أي حاجة — التعلّم المحلي على الجهاز يفضل شغّال.
 */
import { supabase } from "./supabaseClient";
import type { LetterConfusionMap, WordBlendMap } from "./plateParser";

const LS_PENDING = "ph:registration:correctionsPending";
const MAX_PENDING = 500;

export type CorrectionKind = "letter" | "blend";
export interface SharedCorrections { letters: LetterConfusionMap; blends: WordBlendMap; }
interface PendingItem { kind: CorrectionKind; heard: string; corrected: string; }

/** يقرا التعلّم المشترك من السيرفر ويبنيه لخريطتين. null لو فشل/أوفلاين/الجدول ناقص. */
export async function fetchSharedCorrections(): Promise<SharedCorrections | null> {
  try {
    const { data, error } = await supabase
      .from("plate_corrections")
      .select("kind, heard, corrected, count");
    if (error || !data) return null;
    const letters: LetterConfusionMap = new Map();
    const blends: WordBlendMap = new Map();
    for (const row of data as Array<{ kind: string; heard: string; corrected: string; count: number }>) {
      if (!row.heard || !row.corrected) continue;
      const t = row.kind === "blend" ? blends : letters;
      if (!t.has(row.heard)) t.set(row.heard, new Map());
      t.get(row.heard)!.set(row.corrected, Number(row.count) || 0);
    }
    return { letters, blends };
  } catch { return null; }
}

/** زيادة عدّاد تصحيح على السيرفر (+1). true لو نجح. */
async function bump(kind: CorrectionKind, heard: string, corrected: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("bump_plate_correction", {
      p_kind: kind, p_heard: heard, p_corrected: corrected,
    });
    return !error;
  } catch { return false; }
}

function readQueue(): PendingItem[] {
  try {
    const q = JSON.parse(localStorage.getItem(LS_PENDING) || "[]");
    return Array.isArray(q) ? q : [];
  } catch { return []; }
}
function writeQueue(q: PendingItem[]): void {
  try { localStorage.setItem(LS_PENDING, JSON.stringify(q.slice(-MAX_PENDING))); } catch { /* full */ }
}

/** يبعت تصحيح للسيرفر؛ لو فشل (أوفلاين) بيضيفه لطابور يتبعت بعدين. */
export async function pushCorrection(kind: CorrectionKind, heard: string, corrected: string): Promise<void> {
  if (!heard || !corrected) return;
  const ok = await bump(kind, heard, corrected);
  if (!ok) {
    const q = readQueue();
    q.push({ kind, heard, corrected });
    writeQueue(q);
  }
}

/** يحاول يبعت أي تصحيحات متعلّقة (اتعملت أوفلاين). */
export async function flushPendingCorrections(): Promise<void> {
  const q = readQueue();
  if (q.length === 0) return;
  const remaining: PendingItem[] = [];
  for (const item of q) {
    const ok = await bump(item.kind, item.heard, item.corrected);
    if (!ok) remaining.push(item);
  }
  writeQueue(remaining);
}

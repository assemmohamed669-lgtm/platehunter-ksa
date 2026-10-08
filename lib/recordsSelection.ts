/**
 * ══════════════════════════════════════════════════════════════════════
 *  🗑️ مسح السجلات: لوحة لوحة · كذا لوحة مع بعض · باليوم
 * ══════════════════════════════════════════════════════════════════════
 * المالك (٨ أكتوبر ٢٠٢٦): «في صفحه السجلات لما المندوب يحب يعمل تعديل فيها او يمسح يبقي فيه ميزة انه يمسح
 * سيارة ب سيارة او يحدد كذا سيارة ويمسحهم مرة واحده مع بعض او يمسح بالتاريخ يعني يحدد اليوم ... تتحدد كلها
 * لما يختار اليوم ويقدر يشيل من التحديد بتاع اليوم دة سيارات مش عايز يمسحها ويسيب اللي متحدد هو اللي يتمسح».
 *
 * دوال نقية بتشتغل على **مسوّدة** نافذة «إظهار وتعديل اللوحات» — المسح الفعلي (المحلي + السيرفر) بيحصل
 * لما المندوب يدوس «احفظ التعديلات» ويوافق على التأكيد، زي المسح لوحة لوحة بالظبط.
 */

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const pad = (n: number) => String(n).padStart(2, "0");

/** مفتاح اليوم «YYYY-MM-DD» **بتوقيت الجهاز** (نفس اللي جدول السجلات بيعرضه) — "" لو مش تاريخ. */
export function dayKeyOf(iso: string): string {
  const d = new Date(String(iso ?? ""));
  if (!iso || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** أيام السجلات — الأحدث الأول — وعدد لوحات كل يوم. */
export function recordDays(entries: readonly { checkedAt: string }[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = dayKeyOf(e.checkedAt);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/** «الأربعاء 07-10-2026» (نفس شكل تاريخ الجدول) — و«النهارده ·» / «امبارح ·» قدامه لو `todayKey` اتبعت. */
export function dayLabel(key: string, todayKey?: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const base = `${WEEKDAYS[date.getDay()]} ${pad(d)}-${pad(m)}-${y}`;
  if (!todayKey) return base;
  if (key === todayKey) return "النهارده · " + base;
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const yesterday = new Date(ty, tm - 1, td - 1);
  return dayKeyOf(yesterday.toISOString()) === key ? "امبارح · " + base : base;
}

/** لوحات يوم معيّن بس. */
export function entriesOfDay<T extends { checkedAt: string }>(entries: readonly T[], key: string): T[] {
  return entries.filter((e) => dayKeyOf(e.checkedAt) === key);
}

/** تحديد/شيل تحديد لوحة واحدة. */
export function toggleSel(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** «حدد الكل»: لو كل `ids` متحددين ⇒ يشيلهم، غير كده يحددهم كلهم. تحديد اللي برّه `ids` بيفضل زي ما هو. */
export function toggleAll(sel: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(sel);
  const all = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) { if (all) next.delete(id); else next.add(id); }
  return next;
}

/** المسوّدة من غير اللوحات المتحددة — نفس المصفوفة لو مفيش تحديد. */
export function withoutSelected<T extends { id: string }>(entries: T[], sel: ReadonlySet<string>): T[] {
  if (sel.size === 0) return entries;
  return entries.filter((e) => !sel.has(e.id));
}

/**
 * 🛡️ اللوحات اللي «احفظ التعديلات» هيمسحها — **اللي اتشال من المسوّدة بس** (مراجعة ٨ أكتوبر ٢٠٢٦).
 *
 * `base` = لقطة المعرّفات وقت فتح المحرّر. من غيرها، أي لوحة وصلت **والنافذة مفتوحة** (التصدير التلقائي كل ٥
 * دقايق، الاسترجاع على دفعات) مش في المسوّدة ⇒ كانت بتتحسب «اتمسحت» وتتمسح من الجهاز والسيرفر.
 * `null` = الحساب القديم بالحرف (المناديب لحد «انشر للكل»).
 *
 * والصفحة مابتوسّعش لإخوات المكرر عند السوبر أدمن: المحرّر بيعرض **كل** نسخة لوحدها، فالنسخة اللي فضلت في
 * المسوّدة المندوب سابها عن قصد («اللي متحدد هو اللي يتمسح»).
 */
export function editorDeleteIds(
  live: readonly { id: string }[],
  draft: readonly { id: string }[],
  base: ReadonlySet<string> | null,
): string[] {
  const keep = new Set(draft.map((e) => e.id));
  return live.filter((e) => (!base || base.has(e.id)) && !keep.has(e.id)).map((e) => e.id);
}

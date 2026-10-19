/**
 * 🩺 الصندوق الأسود — «الحي اتكتب على السيرفر ومانزلش على الموبايل».
 *
 * المالك (١٩ أكتوبر ٢٠٢٦، مندوب 7b4bc404…): بعد «املأ الحي والشارع» (`lib/areaBackfill.ts`) السيرفر عليه الحي
 * لـ١٨٬٢٨٠ من ١٨٬٣٥٧ لوحة و٢٬٤٠٧ اتعدّلت، والمندوب خرج ودخل ولسه مش ظاهرين. الكود بيقول المفروض ينزلوا
 * (`restoreMissingFieldChecks` ⇒ `pullEditedFieldChecks`) ⇒ بدل التخمين، صفحة التشييك بتكتب (للحساب ده بس):
 *  · أرقام الموبايل قبل وبعد (`localRecordStats`)، ونتيجة التنزيل، وآخر وقت تنزيل محفوظ.
 *  · كام لوحة ناقصة حي على الموبايل مقارنة بنسختها على السيرفر (`areaProbeRow`): معلّقة؟ على السيرفر؟ عليها حي؟
 *    أحدث من آخر تنزيل؟ — **من غير لوحات ولا أماكن**، علامات بس.
 */
import { needsAreaFill } from "./areaBackfill";

interface LocalLike { id: string; lat?: number | null; lng?: number | null; row?: Record<string, unknown> | null; synced?: boolean }

const missingArea = (e: LocalLike) =>
  needsAreaFill({ local_id: e.id, lat: e.lat ?? null, lng: e.lng ?? null, extra: e.row ?? null });

export function localRecordStats(entries: readonly LocalLike[]): {
  total: number; pending: number; missingArea: number; missingAreaPending: number;
} {
  let pending = 0, miss = 0, missPending = 0;
  for (const e of entries ?? []) {
    const p = !e.synced;
    if (p) pending++;
    if (missingArea(e)) { miss++; if (p) missPending++; }
  }
  return { total: (entries ?? []).length, pending, missingArea: miss, missingAreaPending: missPending };
}

/** لوحات ناقصة حي هنقارنها بالسيرفر — المعلّقة الأول (هي المشتبه)، وبعدين الباقي بالترتيب. */
export function pickAreaProbeIds(entries: readonly LocalLike[], n = 5): string[] {
  const miss = (entries ?? []).filter(missingArea);
  const pend = miss.filter((e) => !e.synced);
  const rest = miss.filter((e) => e.synced);
  return [...pend, ...rest].slice(0, Math.max(0, n)).map((e) => e.id);
}

/** لوحة واحدة: الموبايل vs السيرفر (علامات بس). */
export function areaProbeRow(
  local: { id: string; synced?: boolean },
  server: { local_id: string; updated_at: string | null; extra: unknown } | undefined,
  since: string | null,
): { src: string; pending: boolean; onServer: boolean; serverHasArea: boolean; serverNewerThanSince: boolean | null } {
  const src = String(local.id ?? "").slice(0, 9);
  if (!server) return { src, pending: !local.synced, onServer: false, serverHasArea: false, serverNewerThanSince: null };
  const extra = server.extra && typeof server.extra === "object" ? (server.extra as Record<string, unknown>) : null;
  const serverHasArea = !needsAreaFill({ local_id: server.local_id, lat: 1, lng: 1, extra });
  let newer: boolean | null = null;
  if (since && server.updated_at) {
    const a = Date.parse(server.updated_at), b = Date.parse(since);
    newer = Number.isFinite(a) && Number.isFinite(b) ? a > b : null;
  }
  return { src, pending: !local.synced, onServer: true, serverHasArea, serverNewerThanSince: newer };
}

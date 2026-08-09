/**
 * resultWindows — تقسيم نتيجة الفرز على **نافذة لكل ملف داتا**.
 *
 * لما المندوب يرفع أكتر من ملف داتا، كل الملفات بتتدمج في فرز واحد لكن هو عايز
 * يشوف نتيجة كل ملف لوحدها («نتيجة فرز داتا ١ / ٢ …») عشان يعرف اللوحة جاية من
 * أنهي ملف. كل صف نتيجة بيحمل `srcIdx` (رقم ملف الداتا) اتحطّ وقت الفرز.
 *
 * قاعدتين مهمّتين للتوافق مع القديم:
 *   • ملف واحد (كل الصفوف بنفس الرقم صفر) → مجموعة واحدة **بلا عنوان**، يعني
 *     الصفحة بترسم نفس النافذة القديمة بالظبط.
 *   • نتايج محفوظة قبل الميزة دي مالهاش `srcIdx` خالص → بتتعامل كملف صفر.
 *
 * كل عنصر بيحمل `gi` = فهرسه **العام** في قائمة العرض، عشان دوال التحديد
 * والحذف والمشاركة تفضل شغّالة بفهارس عامّة زي ما هي.
 */

import type { MatchResult } from "@/lib/plateParser";

export interface ResultWindowItem {
  r: MatchResult;
  /** الفهرس العام في قائمة العرض (displayResults). */
  gi: number;
}

export interface ResultWindow {
  /** رقم ملف الداتا (٠ = الملف الأول). */
  key: number;
  /** عنوان النافذة، أو null لو ملف واحد بس (يبقى نفس شكل النافذة القديم). */
  title: string | null;
  items: ResultWindowItem[];
}

export function groupResultsBySource(results: MatchResult[]): ResultWindow[] {
  const items: ResultWindowItem[] = results.map((r, gi) => ({ r, gi }));

  const byIdx = new Map<number, ResultWindowItem[]>();
  for (const it of items) {
    const k = it.r.srcIdx ?? 0;
    const arr = byIdx.get(k);
    if (arr) arr.push(it); else byIdx.set(k, [it]);
  }

  // ملف واحد (أو قائمة فاضية) → نافذة واحدة بلا عنوان.
  if (byIdx.size <= 1) {
    const [key = 0] = [...byIdx.keys()];
    return [{ key, title: byIdx.size === 1 && key > 0 ? `نتيجة فرز داتا ${key + 1}` : null, items }];
  }

  return [...byIdx.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, list]) => ({ key, title: `نتيجة فرز داتا ${key + 1}`, items: list }));
}

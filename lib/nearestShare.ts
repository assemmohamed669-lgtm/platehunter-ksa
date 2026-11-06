"use client";

/**
 * 📍 المشاركة بنفس ترتيب «الأقرب» — المالك (٦ نوفمبر ٢٠٢٦): «لما يدوس علي زر الاقرب … نتيجه الفرز اللي بتبقي طالعاله
 * لما ييجي يشاركها مش بتيجي بنفس الترتيب … لو مدسش الاقرب يروح بنفس الترتيب اللي طلعلو بس لو داس يتشاركو بنفس الترتيب
 * اللي في نتيجه الفرز بعد مايدوس الاقرب».
 *
 * الأماكن: «المطلوب» و«شهايد النهارده» (`WantedResultsTable` بيبلّغ الصفحة بترتيبه) · «فرز» بتاع «صوت فقط» · «واتساب/نسخ»
 * للسجلات المحددة في صفحة الفرز. أزرار المشاركة الكبيرة في صفحة الفرز كانت ماشية بترتيب الأقرب أصلاً.
 */

import { useEffect, useState } from "react";
import { fetchIsSuper } from "./certificateBatch";

/** للكل؟ — false = السوبر أدمن بس (لحد ما المالك يجرّب). */
export const NEAREST_SHARE_FOR_ALL = false;

export function useNearestShareOn(): boolean {
  const [on, setOn] = useState<boolean>(NEAREST_SHARE_FOR_ALL);
  useEffect(() => {
    if (NEAREST_SHARE_FOR_ALL) return;
    let alive = true;
    void fetchIsSuper().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}

/**
 * الصفوف بترتيب الأقرب (`ids` = ترتيب الشاشة) — اللي مش في الترتيب (اتضاف بعدين) بيفضل في الآخر بترتيبه.
 * `null` = «الأقرب» مش مفعّل ⇒ نفس الترتيب اللي طلع.
 */
export function orderByIds<T extends { id: string }>(rows: T[], ids: readonly string[] | null | undefined): T[] {
  if (!ids) return rows;
  const pos = new Map<string, number>();
  ids.forEach((id, i) => { if (!pos.has(id)) pos.set(id, i); });
  const placed = rows.filter((r) => pos.has(r.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  return [...placed, ...rows.filter((r) => !pos.has(r.id))];
}

/**
 * أرقام صفوف المشاركة: بترتيب الأقرب لو مفعّل (`nearOrder` = ترتيب الشاشة)، وإلا بالترتيب اللي طلع —
 * والمحدد بس لو المندوب حدد حاجة.
 */
export function pickShareIndexes(total: number, nearOrder: readonly number[] | null, sel: ReadonlySet<number>): number[] {
  const order = nearOrder ?? Array.from({ length: total }, (_, i) => i);
  return sel.size > 0 ? order.filter((i) => sel.has(i)) : [...order];
}

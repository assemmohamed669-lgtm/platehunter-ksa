/**
 * adminListRestore — الرجوع من صفحة المندوب لنفس المكان في قايمة الأدمن.
 *
 * المشكلة: الأدمن بيفلتر على «نشط» (أو يكتب في البحث)، يفتح مندوب، يرجع —
 * فيلاقي نفسه في «الكل» من أول القايمة، لأن الصفحة بتتعاد من الصفر والـstate
 * بيرجع لقيمته الابتدائية. كنا بنحفظ الصف والموضع بس، والتبويب والبحث لأ.
 *
 * بنحفظ الأربعة مع بعض في sessionStorage، وبنقراهم بتسامح: أي نص بايظ أو
 * نسخة قديمة (id + y بس) مابتكسرش — بترجع للافتراضي.
 */

export const ADMIN_RETURN_KEY = "ph:admin:lastOpened";

export interface AdminReturn {
  /** معرّف المندوب اللي اتفتح — عشان نزحلق لصفه بالظبط. */
  id: string;
  /** موضع التمرير — احتياطي لو الصف مابقاش موجود. */
  y: number;
  /** التبويب اللي كان واقف عليه (all / active / expiring / grace / expired / any-device). */
  filter: string;
  /** نص البحث اللي كان مكتوب. */
  search: string;
}

export function packAdminReturn(r: AdminReturn): string {
  return JSON.stringify(r);
}

export function unpackAdminReturn(raw: string | null | undefined): AdminReturn | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof AdminReturn, unknown>>;
    if (!o || typeof o !== "object") return null;
    return {
      id: typeof o.id === "string" ? o.id : "",
      y: typeof o.y === "number" && Number.isFinite(o.y) ? o.y : 0,
      filter: typeof o.filter === "string" && o.filter ? o.filter : "all",
      search: typeof o.search === "string" ? o.search : "",
    };
  } catch { return null; }
}

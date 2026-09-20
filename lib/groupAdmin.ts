/**
 * groupAdmin — مين يقدر يمسح من سجلات المجموعة.
 *
 * القاعدة (بطلب المالك): **الأدمن اللي في مجموعة** له صلاحية مسح أي حاجة من
 * داتا المجموعة، مش سجلاته بس. المندوب العادي زي ما هو — سجلاته هو بس.
 *
 * ده حارس **واجهة** (بيخفّي الزرار). الحارس الفعلي سياسة RLS على السيرفر في
 * `docs/sql/group-admin-delete.sql` — الاتنين لازم يتمشّوا مع بعض.
 */

export interface GroupViewer {
  id: string;
  role: string | null;          // "admin" = أدمن البرنامج
  team: string | null;          // المجموعة اللي هو فيها
}

export function canDeleteGroupRecord(
  viewer: GroupViewer,
  rowAgentId: string,
  memberIds: Iterable<string>,
): boolean {
  if (!viewer.id || !rowAgentId) return false;
  if (viewer.id === rowAgentId) return true;                 // سجلاتي أنا
  if (viewer.role !== "admin" || !viewer.team) return false;  // مش أدمن، أو مش في مجموعة
  for (const id of memberIds) if (id === rowAgentId) return true;
  return false;
}

/**
 * مين ينفع يتحط في مجموعة، وإزاي يتعرض في القوايم.
 *
 * صفحة المجموعات كانت بتجيب `role = 'agent'` بس — فالأدمنز مايظهروش ومكانش ينفع
 * يتحطوا في مجموعة. والباك إند بيدعمهم من الأصل: `setTeam` في الـAPI بيحدّث أي
 * صف بلا فلتر دور، و`my_team_members()` بترجّع أي حد `team` بتاعه مطابق بغض النظر
 * عن الدور، وسياسات مشاركة السجلات بتستخدم نفس الدالة. يعني المانع كان في
 * الواجهة بس.
 */

/** الأدوار اللي ينفع تبقى في مجموعة. */
export const GROUP_ELIGIBLE_ROLES = ["agent", "admin"] as const;

export function canJoinGroup(role: string | null | undefined): boolean {
  return !!role && (GROUP_ELIGIBLE_ROLES as readonly string[]).includes(role);
}

/**
 * علامة جنب الاسم لما يكون أدمن. من غيرها السوبر أدمن ممكن يضيف واحد وهو فاكره
 * حد تاني — الاسم لوحده مش كفاية للتفرقة بين مندوب وأدمن.
 */
export function memberBadge(role: string | null | undefined): string | null {
  return role === "admin" ? "أدمن" : null;
}

/** أرقام عربية-هندية — عشان العدّاد يبان بلغة الصفحة. */
function ar(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/**
 * نص عدّاد المجموعة. كان مكتوب «كذا مندوب» دايماً — وده بقى غلط لما المجموعة
 * تبقى فيها أدمن، فبنوضّح التقسيم بس لما يكون فيه أدمن فعلاً.
 */
export function membersLabel(members: { role?: string | null }[]): string {
  const total = members.length;
  const admins = members.filter((m) => m.role === "admin").length;
  if (admins > 0) return `${ar(total)} أعضاء · فيهم ${ar(admins)} أدمن`;
  return total === 1 ? `${ar(total)} مندوب` : `${ar(total)} مناديب`;
}

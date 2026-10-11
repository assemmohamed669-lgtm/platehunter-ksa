/**
 * 👥 «سجلات المجموعة» = سجلات المجموعة اللي المندوب شغّال لها بس — المالك (١١ أكتوبر ٢٠٢٦): «كل مجموعه خاصه بيها
 * شغلها ومش عايز لخبطه». سجل مختوم بالمجموعة (حتى لو صاحبه مشي — بيفضل لها)، أو سجل قديم من غير ختم لعضو
 * فيها دلوقتي. سجلاتي اللي اتعملت لمجموعة تانية مابتظهرش هنا. (السيرفر بيطبّق نفس الكلام بالـRLS — ده فلتر العرض.)
 */

/** قيمة جوّه فلتر PostgREST — بين علامتين عشان الأسامي العربي والمسافات والفواصل. */
function quoted(v: string): string {
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/** فلتر `.or(...)` لسجلات المجموعة الحالية. */
export function teamScopeFilter(team: string, memberIds: readonly string[]): string {
  const own = `team.eq.${quoted(team)}`;
  if (memberIds.length === 0) return own;
  return `${own},and(team.is.null,agent_id.in.(${memberIds.join(",")}))`;
}

/** اسم المندوب في فلتر «سجلات فلان» — اللي مشي مكتوب جنبه. */
export function authorLabel(a: { username: string | null; is_member: boolean }): string {
  const n = (a.username ?? "").trim() || "—";
  return a.is_member ? n : `${n} (خرج من المجموعة)`;
}

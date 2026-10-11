/**
 * 👥 أسامي أعضاء **كل** مجموعاتي — نتيجة الفرز بتقول مين سجّل العربية حتى لو من المجموعة التانية (المالك ١١ أكتوبر
 * ٢٠٢٦: «الفرز يتطبق معاه للمجموعتين»). الدالة لسه ماتشغّلتش على السيرفر ⇒ أعضاء مجموعتي الحالية زي الأول.
 */
type Rpc = (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;

export async function fetchMyGroupsNames(supabase: { rpc: Rpc }): Promise<Record<string, string>> {
  const all = await supabase.rpc("my_groups_members");
  const rows = (!all.error && Array.isArray(all.data) ? all.data : ((await supabase.rpc("my_team_members")).data ?? [])) as
    { id: string; username: string | null }[];
  return Object.fromEntries(rows.map((m) => [m.id, m.username ?? ""]));
}

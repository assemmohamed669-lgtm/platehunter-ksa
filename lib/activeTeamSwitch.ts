/**
 * 👥 «شغّال لـ» — المندوب اللي في أكتر من مجموعة بيقلب المجموعة اللي شغّال لها (المالك ١١ أكتوبر ٢٠٢٦: «كل مجموعه
 * خاصه بيها شغلها ومش عايز لخبطه»).
 *
 * السيرفر (`set_my_active_team`) بيقبل بس مجموعة هو عضو فيها، وبعدها سجلات/فرز/تقرير/صلاحيات المجموعة بتبقى
 * بتاعتها. على الجهاز:
 *  • ملف التشييك: نسخة لكل مجموعة (`check@<المجموعة>`) — اللي في الشاشة بيتحفظ باسم القديمة، ونسخة الجديدة
 *    (لو موجودة) بترجع. (لو الجديدة بتشارك تشييك، المزامنة العادية بتجيب نسختها.) مفيش ملف بيضيع.
 *  • داتا المجموعة: بتتشال من الجهاز وبتتجاب للمجموعة الجديدة (لو بتشارك داتا).
 */
import { saveActiveTeam } from "./activeTeam";
import { TEAM_DATA_SLOT } from "./teamData";
import { MEMBER_DATA_SLOT } from "./memberData";

/** خانة نسخة ملف التشييك بتاعة مجموعة على الجهاز. */
export function checkSlotFor(team: string): string {
  return `check@${team}`;
}

export async function switchActiveTeam(oldTeam: string | null, newTeam: string): Promise<{ ok: boolean; error?: string }> {
  if (!newTeam || newTeam === oldTeam) return { ok: false, error: "دي نفس المجموعة" };
  const { supabase } = await import("./supabaseClient");
  const { data, error } = await supabase.rpc("set_my_active_team", { p_team: newTeam });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: "إنت مش عضو في المجموعة دي" };

  const idb = await import("./idb");
  try {
    const cur = await idb.getUploadedFile("local", "check").catch(() => null);
    if (cur && oldTeam) {
      const slot = checkSlotFor(oldTeam);
      await idb.saveUploadedFile({ ...cur, key: `local:${slot}`, slot });
    }
    const saved = await idb.getUploadedFile("local", checkSlotFor(newTeam)).catch(() => null);
    if (saved) await idb.saveUploadedFile({ ...saved, key: "local:check", slot: "check" });
  } catch { /* الملف بيفضل زي ما هو — المزامنة العادية بتكمّل */ }
  try {
    await idb.deleteUploadedFile("local", TEAM_DATA_SLOT).catch(() => {});
    const { clearData } = await import("./dataStore");
    await clearData(TEAM_DATA_SLOT).catch(() => {});
    // 🗂️ الداتا المخصوصة من مسئول المجموعة القديمة — ماتتفرزش في المجموعة الجديدة.
    await idb.deleteUploadedFile("local", MEMBER_DATA_SLOT).catch(() => {});
    await clearData(MEMBER_DATA_SLOT).catch(() => {});
  } catch { /* بتتجاب من جديد في أول فرز */ }
  saveActiveTeam(newTeam);
  return { ok: true };
}

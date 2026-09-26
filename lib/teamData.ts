/**
 * داتا المجموعة — مسئول المجموعة يرفع ملف داتا، والأعضاء **يفرزوا عليه بس**.
 *
 * الأعضاء مايقدروش: يفتحوه · يحمّلوه · يغيّروه · يمسحوه · يشاركوه.
 * يقدروا: **يفرزوا عليه**، ويشاركوا **نتيجة الفرز** عادي.
 *
 * ⚠️ الميزة **مقفولة افتراضياً** لكل المجموعات. بتتفتح بإيد المالك لكل مجموعة
 * بعد ما يحدّد مسئولها. وأي شك هنا بيروح ناحية **القفل** — من غير إعدادات، من
 * غير مسئول، أو المفتاح مقفول ⇒ مافيش أي مربع بيظهر لأي حد.
 */

/** سلوت التخزين المحلي للنسخة المنزّلة — منفصل عن سلوتات المندوب. */
export const TEAM_DATA_SLOT = "team-data";

export interface TeamDataSettings {
  leaderId: string | null;
  enabled: boolean;
}

/** دور المستخدم الحالي في داتا المجموعة. */
export type TeamDataRole = "off" | "leader" | "member";

export function teamDataRole(settings: TeamDataSettings | null, myId: string | null): TeamDataRole {
  if (!settings || !settings.enabled || !settings.leaderId || !myId) return "off";
  return settings.leaderId === myId ? "leader" : "member";
}

/**
 * ننزّل نسخة جديدة؟ بنقارن تاريخ التحديث بدل ما نحمّل الملف كل مرة — الملف
 * ممكن يكون عشرات الميجات والمندوب على بيانات الموبايل.
 */
export function needsTeamDataRefresh(localUpdatedAt: string | null, remoteUpdatedAt: string | null): boolean {
  if (!remoteUpdatedAt) return false;            // المسئول مسح الملف — مافيش حاجة تتنزّل
  if (!localUpdatedAt) return true;              // مافيش نسخة محلية
  const local = new Date(localUpdatedAt).getTime();
  const remote = new Date(remoteUpdatedAt).getTime();
  if (!Number.isFinite(local)) return true;      // تاريخ محلي باظ ⇒ ننزّل (أأمن)
  if (!Number.isFinite(remote)) return false;
  return remote > local;
}

/** مسار الملف في التخزين — أول جزء هو المجموعة، وكل السياسات مبنية عليه. */
export function teamDataPath(team: string): string {
  return `${team}/data.xlsx`;
}

/**
 * داتا المجموعة كبيرة ولا صغيرة؟ الكبيرة بتتقري بالـstreaming على الجهاز (زي ملف
 * الداتا الكبير العادي) عشان مايحصلش كراش ذاكرة على الآيفون؛ الصغيرة بتتفتح عادي.
 * القرار بالحجم زي مربع الرفع بالظبط (نفس LARGE_DATA_THRESHOLD_BYTES).
 */
export function teamIngestMode(sizeBytes: number, thresholdBytes: number): "small" | "large" {
  return sizeBytes > thresholdBytes ? "large" : "small";
}

// ─────────────────────────────────────────────────────────────────────────────
// الجزء اللي بيكلّم السيرفر والتخزين المحلي
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = "team-data";

export interface TeamDataFile {
  path: string;
  fileName: string;
  rowCount: number | null;
  plateCount: number | null;
  updatedAt: string;
}

export interface TeamDataState {
  role: TeamDataRole;
  team: string | null;
  file: TeamDataFile | null;
}

/**
 * حالة داتا المجموعة للمستخدم الحالي.
 *
 * أي فشل (مافيش نت، السكريبت ماتشغّلش، مافيش مجموعة) بيرجّع «off» — يعني
 * الصفحات تشتغل زي ما هي بالظبط ومافيش مربع بيظهر. الميزة **مابتكسرش** حاجة
 * لو حاجة ناقصة.
 */
export async function fetchTeamDataState(): Promise<TeamDataState> {
  const off: TeamDataState = { role: "off", team: null, file: null };
  try {
    const { supabase } = await import("./supabaseClient");
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth.user?.id ?? null;
    if (!myId) return off;

    const { data: prof } = await supabase.from("profiles").select("team").eq("id", myId).single();
    const team = (prof as { team?: string | null } | null)?.team ?? null;
    if (!team) return off;

    const { data: gs } = await supabase
      .from("group_settings").select("leader_id, shared_data_enabled").eq("team", team).maybeSingle();
    const g = gs as { leader_id?: string | null; shared_data_enabled?: boolean } | null;
    const role = teamDataRole(
      g ? { leaderId: g.leader_id ?? null, enabled: !!g.shared_data_enabled } : null,
      myId,
    );
    if (role === "off") return off;

    const { data: fr } = await supabase
      .from("team_data_files").select("path, file_name, row_count, plate_count, updated_at")
      .eq("team", team).maybeSingle();
    const f = fr as {
      path: string; file_name: string; row_count: number | null;
      plate_count: number | null; updated_at: string;
    } | null;

    return {
      role, team,
      file: f ? {
        path: f.path, fileName: f.file_name, rowCount: f.row_count,
        plateCount: f.plate_count, updatedAt: f.updated_at,
      } : null,
    };
  } catch {
    return off;   // مافيش نت أو السكريبت ماتشغّلش — الصفحة تشتغل زي ما هي
  }
}

/** رفع/استبدال ملف داتا المجموعة — **المسئول بس** (السيرفر بيتحقق كمان). */
export async function uploadTeamData(
  team: string, file: File, rowCount: number, plateCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const path = teamDataPath(team);
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (up.error) return { ok: false, error: up.error.message };
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("team_data_files").upsert({
      team, path, file_name: file.name, row_count: rowCount, plate_count: plateCount,
      updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null,
    }, { onConflict: "team" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "تعذّر الرفع" };
  }
}

/** مسح ملف داتا المجموعة — **المسئول بس**. بيتشال من عند الأعضاء كمان. */
export async function deleteTeamData(team: string): Promise<boolean> {
  try {
    const { supabase } = await import("./supabaseClient");
    await supabase.storage.from(BUCKET).remove([teamDataPath(team)]);
    const { error } = await supabase.from("team_data_files").delete().eq("team", team);
    return !error;
  } catch { return false; }
}

/** بينزّل الملف من التخزين (للأعضاء والمسئول). */
export async function downloadTeamData(path: string): Promise<Blob | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    return error ? null : (data ?? null);
  } catch { return null; }
}

/**
 * تشييك المجموعة — مسئول المجموعة يرفع شيت التشييك (المحفظة)، و**يستبدل** شيت
 * تشييك باقي الأعضاء (المفتوح لهم الخدمة).
 *
 * 🔴 **سلامة داتا (مطلب المالك):** الاستبدال بيمس **الشيت المرجعي بس** (local:check).
 * سجلات/نتائج/مسودّات المندوب اللي شيّكها في مخازن IndexedDB **منفصلة** (سجلات
 * ميدانية · شاص · مسودّات) — الدالة دي عمرها ما بتلمسهم. فأي لوحة شيّكها المندوب
 * متروحش أبداً حتى لو الشيت اتغيّر أو اتمسح.
 *
 * ⚠️ الميزة **مقفولة افتراضياً** لكل المجموعات. بتتفتح بإيد السوبر أدمن لكل
 * مجموعة بعد ما يحدّد مسئولها. أي شك هنا بيروح ناحية **القفل** (off).
 */
import { teamDataRole, teamStorageKey, type TeamDataRole } from "./teamData";

const BUCKET = "team-check";

/** ننزّل نسخة جديدة؟ نقارن تاريخ التحديث بدل ما نحمّل الملف كل مرة. */
export function needsTeamCheckRefresh(localUpdatedAt: string | null, remoteUpdatedAt: string | null): boolean {
  if (!remoteUpdatedAt) return false;            // المسئول مسح الملف
  if (!localUpdatedAt) return true;              // مافيش نسخة محلية
  const local = new Date(localUpdatedAt).getTime();
  const remote = new Date(remoteUpdatedAt).getTime();
  if (!Number.isFinite(local)) return true;
  if (!Number.isFinite(remote)) return false;
  return remote > local;
}

/** مسار الملف في التخزين — أول جزء هو كود المجموعة (مش اسمها العربي — شوف teamStorageKey). */
export function teamCheckPath(team: string): string {
  return `${teamStorageKey(team)}/check.xlsx`;
}

export interface TeamCheckFile {
  path: string;
  fileName: string;
  rowCount: number | null;
  plateCount: number | null;
  updatedAt: string;
}

export interface TeamCheckState {
  role: TeamDataRole;
  team: string | null;
  file: TeamCheckFile | null;
}

/**
 * حالة تشييك المجموعة للمستخدم الحالي. أي فشل (مافيش نت/السكريبت ماتشغّلش/مافيش
 * مجموعة) بيرجّع «off» — الصفحات تشتغل زي ما هي والميزة مابتكسرش حاجة.
 */
export async function fetchTeamCheckState(): Promise<TeamCheckState> {
  const off: TeamCheckState = { role: "off", team: null, file: null };
  try {
    const { supabase } = await import("./supabaseClient");
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth.user?.id ?? null;
    if (!myId) return off;

    const { data: prof } = await supabase.from("profiles").select("team").eq("id", myId).single();
    const team = (prof as { team?: string | null } | null)?.team ?? null;
    if (!team) return off;

    const { data: gs } = await supabase
      .from("group_settings").select("leader_id, shared_check_enabled").eq("team", team).maybeSingle();
    const g = gs as { leader_id?: string | null; shared_check_enabled?: boolean } | null;
    const role = teamDataRole(
      g ? { leaderId: g.leader_id ?? null, enabled: !!g.shared_check_enabled } : null,
      myId,
    );
    if (role === "off") return off;

    const { data: fr } = await supabase
      .from("team_check_files").select("path, file_name, row_count, plate_count, updated_at")
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
    return off;
  }
}

/** رفع/استبدال شيت تشييك المجموعة — **المسئول بس** (السيرفر بيتحقق كمان). */
export async function uploadTeamCheck(
  team: string, file: File, rowCount: number, plateCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const path = teamCheckPath(team);
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (up.error) return { ok: false, error: up.error.message };
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("team_check_files").upsert({
      team, path, file_name: file.name, row_count: rowCount, plate_count: plateCount,
      updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null,
    }, { onConflict: "team" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "تعذّر الرفع" };
  }
}

/** مسح شيت تشييك المجموعة — **المسئول بس**. */
export async function deleteTeamCheck(team: string): Promise<boolean> {
  try {
    const { supabase } = await import("./supabaseClient");
    await supabase.storage.from(BUCKET).remove([teamCheckPath(team)]);
    const { error } = await supabase.from("team_check_files").delete().eq("team", team);
    return !error;
  } catch { return false; }
}

/** بينزّل الملف من التخزين. */
export async function downloadTeamCheck(path: string): Promise<Blob | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    return error ? null : (data ?? null);
  } catch { return null; }
}

/**
 * مزامنة العضو: بيستبدل شيت التشييك المحلي (`local:check`) بشيت المجموعة لو فيه
 * نسخة أحدث. **مابيمسّش سجلات/نتائج/مسودّات المندوب** (مخازن منفصلة) — الاستبدال
 * للشيت المرجعي بس. بيبعت `idbFileUpdated` عشان الصفحات المفتوحة تعيد قراءة الشيت.
 *
 * بيرجّع true لو استبدل فعلاً (نسخة جديدة نزلت)، وإلا false.
 */
export async function syncTeamCheckToLocal(): Promise<boolean> {
  try {
    const state = await fetchTeamCheckState();
    // المسئول عنده الشيت في مربعه أصلاً؛ off = الميزة مقفولة ⇒ مانلمسش شيت المندوب.
    if (state.role !== "member" || !state.file) return false;

    const { getUploadedFile, saveUploadedFile } = await import("./idb");
    const local = await getUploadedFile("local", "check").catch(() => null);
    // عندنا نفس نسخة المجموعة بالفعل؟ مانعملش حاجة.
    if (local && !needsTeamCheckRefresh(local.uploadedAt ?? null, state.file.updatedAt)) return false;

    const blob = await downloadTeamCheck(state.file.path);
    if (!blob) return false;
    const file = new File([blob], state.file.fileName, { type: blob.type });
    const { parseExcelFile } = await import("./excel");
    const table = await parseExcelFile(file);
    if (!table.rows.length) return false;   // شيت فاضي → مانستبدلش (أمان)

    await saveUploadedFile({
      key: "local:check", agentId: "local", slot: "check",
      fileName: state.file.fileName, headers: table.headers, rows: table.rows,
      uploadedAt: state.file.updatedAt,   // تاريخ **نسخة المجموعة** — لمقارنة المزامنة
      fileBlob: file,
    });
    try { window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot: "check" } })); } catch { /* SSR/غير متاح */ }
    return true;
  } catch {
    return false;   // أوفلاين/مش متاح — شيت المندوب الحالي بيفضل زي ما هو
  }
}

export type TeamShareResult = null | { ok: true } | { ok: false; error: string };

/**
 * 👥 المسئول رفع شيت تشييك ⇒ يوصل لباقي المجموعة.
 *
 * بيسأل السيرفر عن الدور **وقت الرفع** — مش من حالة اتحفظت أول ما الصفحة فتحت.
 * قبل كده لو المسئول رفع في أول ثواني (قبل ما الحالة توصل) الشيت مايتبعتش خالص،
 * ومن غير أي رسالة. `countPlates` بيتنده للمسئول بس (عدّ اللوحات لفّة على الصفوف).
 *
 * `null` = مش مسئول أو الميزة مقفولة ⇒ مفيش حاجة تتقال.
 */
export async function shareCheckToTeamIfLeader(
  file: File, rowCount: number, countPlates: () => number,
): Promise<TeamShareResult> {
  const s = await fetchTeamCheckState();
  if (s.role !== "leader" || !s.team) return null;
  return uploadTeamCheck(s.team, file, rowCount, countPlates());
}

/** نص الرسالة للمسئول — بلاغ ٢٩ سبتمبر: الرفع كان بيفشل في صمت. */
export function teamCheckShareMessage(r: TeamShareResult): string | null {
  if (!r) return null;
  return r.ok
    ? "✅ شيت التشييك اترفع للمجموعة — هيوصل لكل الأعضاء"
    : `❌ تعذّر رفع شيت التشييك للمجموعة: ${r.error}`;
}

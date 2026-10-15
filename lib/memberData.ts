/**
 * 🗂️ داتا لكل عضو — المالك (١٥ أكتوبر ٢٠٢٦): «مسئول المجموعه يقدر يحدد او يختار لكل شخص في المجموعه ويرفعلو داتا معينه …
 * محمد داتا ل منطقه مكه ومحمود داتا ل منطقه الطايف … الداتا دي تظهر للشخص دة بعينو … الشخص التاني ميقدرش يفتح الداتا دي
 * ولا يحملها علي جهازة هو يفرز فقط عليها … مسئول المجموعه ميظهرلوش … غير اعضاء المجموعه دي فقط».
 * قراراته: ملف واحد لكل عضو (الجديد بيستبدل) · العضو اللي ليه مخصوصة بيفرز عليها هي بس (مش داتا المجموعة).
 *
 * الأمان كله على السيرفر: الملف في مخزن خاص (`member-data`) **مالوش أي وصول مباشر** — الرفع بلينك مؤقت بعد ما السيرفر
 * يتأكد إن اللي بيرفع مسئول المجموعة دي والعضو منها (`/api/group/member-data`)، والتنزيل بلينك مؤقت لصاحب الملف بس
 * (`/api/member-data`). الجدول والمخزن: `docs/sql/member-data.sql`.
 */
import { teamStorageKey } from "./teamData";

/** سلوت الملف على موبايل العضو (لوحده — مش سلوت داتا المجموعة). */
export const MEMBER_DATA_SLOT = "member-data";
export const MEMBER_DATA_BUCKET = "member-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTS = new Set(["xlsx", "xls", "xlsb", "xlsm", "csv", "ods"]);

/** مسار الملف: فولدر المجموعة (كود إنجليزي) / رقم العضو.امتداده. */
export function memberDataPath(team: string, agentId: string, fileName: string): string {
  if (!UUID.test(agentId)) throw new Error("رقم العضو مش سليم.");
  const ext = (/\.([a-z0-9]+)$/i.exec(String(fileName ?? ""))?.[1] ?? "").toLowerCase();
  return `${teamStorageKey(team)}/${agentId}.${EXTS.has(ext) ? ext : "xlsx"}`;
}

/** مسئول المجموعة دي (وصفحته مفتوحة) أو السوبر أدمن. */
export function leaderAccess(group: { leader_id?: string | null; leader_page_enabled?: boolean | null } | null, uid: string, isSuper: boolean): boolean {
  if (!group) return false;
  if (isSuper) return true;
  return group.leader_id === uid && group.leader_page_enabled === true;
}

export type MemberAction =
  | { ok: true; action: "upload-url"; agentId: string; path: string }
  | { ok: true; action: "commit"; agentId: string; path: string; fileName: string; rowCount: number | null; plateCount: number | null }
  | { ok: true; action: "clear"; agentId: string }
  | { ok: false; error: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** يتأكد من الطلب (العضو من المجموعة · المسار محسوب على السيرفر) قبل أي حاجة. */
export function planMemberAction(b: Record<string, unknown>, memberIds: string[]): MemberAction {
  const team = String(b.team ?? "").trim();
  const agentId = String(b.agentId ?? "").trim();
  if (!team || !UUID.test(agentId)) return { ok: false, error: "المجموعة والعضو مطلوبين." };
  if (!memberIds.includes(agentId)) return { ok: false, error: "العضو ده مش في المجموعة." };
  const action = String(b.action ?? "");
  if (action === "clear") return { ok: true, action, agentId };
  const fileName = String(b.fileName ?? "").trim().slice(0, 200);
  if (!fileName) return { ok: false, error: "اسم الملف مطلوب." };
  const path = memberDataPath(team, agentId, fileName);
  if (action === "upload-url") return { ok: true, action, agentId, path };
  if (action === "commit") {
    if (String(b.path ?? "") !== path) return { ok: false, error: "مسار الملف مش مطابق." };
    return { ok: true, action, agentId, path, fileName, rowCount: num(b.rowCount), plateCount: num(b.plateCount) };
  }
  return { ok: false, error: "عملية مش معروفة." };
}

// ── الموبايل ────────────────────────────────────────────────────────────────────

export interface MemberDataFile { fileName: string; updatedAt: string; rowCount: number | null; plateCount: number | null }

async function authHeaders(): Promise<Record<string, string>> {
  const at = await import("./supabaseClient")
    .then(({ supabase }) => supabase.auth.getSession())
    .then(({ data }) => data.session?.access_token)
    .catch(() => undefined);
  return at ? { Authorization: `Bearer ${at}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

/**
 * العضو: فيه داتا مخصوصة ليا في مجموعتي؟ (`missing` = الـSQL لسه ماتشغّلش)
 * `offline` = مافيش نت / السيرفر ماردّش ⇒ مانعرفش، فالنسخة اللي على الموبايل **ماتتمسحش**.
 */
export async function fetchMyMemberData(): Promise<{ file: MemberDataFile | null; missing?: boolean; offline?: boolean }> {
  try {
    const res = await fetch("/api/member-data", { headers: await authHeaders(), cache: "no-store" });
    if (!res.ok) return { file: null, offline: true };
    const j = await res.json().catch(() => ({}));
    return { file: (j.file ?? null) as MemberDataFile | null, missing: !!j.missing };
  } catch { return { file: null, offline: true }; }
}

/** العضو: ينزّل ملفه (لينك مؤقت من السيرفر). */
export async function downloadMyMemberData(): Promise<Blob | null> {
  try {
    const res = await fetch("/api/member-data?download=1", { headers: await authHeaders(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!j.url) return null;
    const f = await fetch(String(j.url));
    return f.ok ? await f.blob() : null;
  } catch { return null; }
}

export interface MemberDataRow { agentId: string; username: string | null; file: MemberDataFile | null }

/** المسئول: أعضاء المجموعة دي وملف كل واحد. */
export async function listMemberData(team: string): Promise<{ rows: MemberDataRow[]; missing?: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/group/member-data?team=${encodeURIComponent(team)}`, { headers: await authHeaders(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { rows: [], error: j.error ?? "تعذّر التحميل." };
    return { rows: (j.rows ?? []) as MemberDataRow[], missing: !!j.missing };
  } catch { return { rows: [], error: "مافيش نت." }; }
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/group/member-data", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(j.error ?? "تعذّر."));
  return j;
}

/** المسئول: يرفع ملف لعضو (لينك رفع مؤقت ⇒ الملف ⇒ تثبيت). */
export async function uploadMemberData(team: string, agentId: string, file: File, counts: { rowCount: number | null; plateCount: number | null }): Promise<void> {
  const u = await post({ action: "upload-url", team, agentId, fileName: file.name });
  const { supabase } = await import("./supabaseClient");
  const { error } = await supabase.storage.from(MEMBER_DATA_BUCKET).uploadToSignedUrl(String(u.path), String(u.token), file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(error.message);
  await post({ action: "commit", team, agentId, fileName: file.name, path: u.path, ...counts });
}

/** المسئول: يشيل ملف عضو. */
export async function clearMemberData(team: string, agentId: string): Promise<void> {
  await post({ action: "clear", team, agentId });
}

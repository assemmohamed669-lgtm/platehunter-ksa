/**
 * 📂 ملفات داتا من مسئول المجموعة — المالك (٦ نوفمبر ٢٠٢٦): «اوقات مسئول المجموعه بيبقي عنده اكتر من ملف داتا بيبقي
 * عايز يرفعهم علشان يظهرو ل المجموعه او ل حد معين في المجموعه … يرفع اكتر من ملف داتا من صفحه ادارة مجموعتي ويختار
 * الداتا دي تظهر ل مين في مجموعته بالظبط».
 *
 * قراراته (نفس اليوم):
 *  · العضو بيفرز على **كل** الملفات اللي ليه مع بعض (المخصوصة له + اللي للمجموعة كلها) في فرز واحد.
 *  · نفس أماكن «داتا المجموعة»: الفرز + «شهايد النهارده» + «صوت فقط». ومن غير فتح ولا تنزيل (فرز بس).
 *  · «داتا المجموعة» و«داتا الأعضاء» القدام زي ما هم — دي قسم زيادة في «إدارة مجموعتي».
 *  · لكل المجموعات على طول.
 *
 * الأمان كله على السيرفر (زي «داتا الأعضاء»): الجدول `group_data_files` والمخزن الخاص `member-data` مالهمش أي وصول
 * مباشر. المسئول بيرفع بلينك مؤقت بعد ما السيرفر يتأكد (`/api/group/data-files`)، والعضو بياخد الملفات اللي ليه بس بلينك
 * تنزيل مؤقت (`/api/my-data-files`). الجدول: `docs/sql/group-data-files.sql`.
 *
 * على موبايل العضو كل ملف في سلوت لوحده (`gdf-<رقمه>`) بنفس طريقة «داتا الأعضاء» (`lib/remoteDataSlot.ts`): الصغير
 * صفوفه في سجله، والكبير دفعات على الجهاز. وبيتنزّل تاني بس لو المسئول غيّره.
 */
import { teamStorageKey } from "./teamData";
import { MEMBER_DATA_BUCKET } from "./memberData";
import type { RemoteDataState } from "./remoteDataSlot";

/** أقصى عدد ملفات للمجموعة (الموبايل بيفرز عليهم كلهم). */
export const GROUP_FILES_MAX = 20;
/** نفس المخزن الخاص بتاع «داتا الأعضاء» (من غير سياسات) — فولدر `files/`. */
export const GROUP_FILES_BUCKET = MEMBER_DATA_BUCKET;
/** أكبر من كده ⇒ دفعات على الجهاز (نفس عتبة الداتا الكبيرة في صفحة الفرز — `LARGE_DATA_THRESHOLD_BYTES`). */
export const GROUP_FILE_LARGE_BYTES = 3 * 1024 * 1024;

export type GroupFileAudience = "all" | "members";

export interface GroupFileMeta {
  id: string;
  fileName: string;
  updatedAt: string;
  rowCount: number | null;
  plateCount: number | null;
  audience: GroupFileAudience;
  memberIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTS = new Set(["xlsx", "xls", "xlsb", "xlsm", "csv", "ods"]);

/** سلوت الملف على موبايل العضو. */
export function groupFileSlot(id: string): string {
  return `gdf-${id}`;
}

/** مسار الملف: فولدر المجموعة (كود إنجليزي) / files / رقم الملف.امتداده — الاسم مايدخلش في المسار. */
export function groupFilePath(team: string, id: string, fileName: string): string {
  if (!UUID.test(id)) throw new Error("رقم الملف مش سليم.");
  const ext = (/\.([a-z0-9]+)$/i.exec(String(fileName ?? ""))?.[1] ?? "").toLowerCase();
  return `${teamStorageKey(team)}/files/${id}.${EXTS.has(ext) ? ext : "xlsx"}`;
}

/**
 * العضو ده ياخد الملف ده؟ «المجموعة كلها» = كل الأعضاء من غير المسئول (هو اللي رافعه — زي «داتا المجموعة»، عشان
 * مايتفرزش عنده مرتين لو حاطه في مربع الداتا بتاعه). «أعضاء معيّنين» = اللي اتعلّم عليهم بس (ولو المسئول علّم على
 * نفسه بياخده).
 */
export function canSeeGroupFile(f: { audience: string; memberIds: readonly string[] }, uid: string, leaderId: string | null | undefined): boolean {
  if (f.audience === "members") return f.memberIds.includes(uid);
  return f.audience === "all" && uid !== leaderId;
}

// ── طلبات المسئول — بتتراجع على السيرفر قبل أي حاجة ─────────────────────────────

export type GroupFileAction =
  | { ok: true; action: "upload-url"; id: string; path: string; isNew: boolean }
  | {
    ok: true; action: "commit"; id: string; path: string; fileName: string; rowCount: number | null; plateCount: number | null;
    audience: GroupFileAudience; memberIds: string[]; isNew: boolean;
  }
  | { ok: true; action: "audience"; id: string; audience: GroupFileAudience; memberIds: string[] }
  | { ok: true; action: "delete"; id: string }
  | { ok: false; error: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

function parseAudience(b: Record<string, unknown>, memberIds: readonly string[]):
  { ok: true; audience: GroupFileAudience; memberIds: string[] } | { ok: false; error: string } {
  const a = String(b.audience ?? "");
  if (a === "all") return { ok: true, audience: "all", memberIds: [] };
  if (a !== "members") return { ok: false, error: "اختار الملف يظهر لمين." };
  const ids = [...new Set((Array.isArray(b.memberIds) ? b.memberIds : []).map((x) => String(x).trim()))];
  if (ids.length === 0) return { ok: false, error: "اختار عضو واحد على الأقل." };
  if (ids.some((x) => !memberIds.includes(x))) return { ok: false, error: "فيه عضو مش في المجموعة دي." };
  return { ok: true, audience: "members", memberIds: ids };
}

/**
 * يتأكد من الطلب قبل أي حاجة: الملف من المجموعة دي · الأعضاء منها · المسار محسوب هنا · الحد الأقصى.
 * `newId` = رقم جديد السيرفر بيولّده (الموبايل مابيختارش رقم ملف جديد).
 */
export function planGroupFileAction(
  b: Record<string, unknown>,
  ctx: { team: string; memberIds: readonly string[]; existingIds: readonly string[]; newId: string },
): GroupFileAction {
  const action = String(b.action ?? "");
  const idIn = String(b.id ?? "").trim();
  const exists = !!idIn && ctx.existingIds.includes(idIn);
  const full = `الحد ${GROUP_FILES_MAX} ملف للمجموعة — شيل ملف الأول.`;

  if (action === "delete") return exists ? { ok: true, action, id: idIn } : { ok: false, error: "الملف ده مش موجود." };
  if (action === "audience") {
    if (!exists) return { ok: false, error: "الملف ده مش موجود." };
    const a = parseAudience(b, ctx.memberIds);
    if (!a.ok) return a;
    return { ok: true, action, id: idIn, audience: a.audience, memberIds: a.memberIds };
  }

  const fileName = String(b.fileName ?? "").trim().slice(0, 200);
  if (!fileName) return { ok: false, error: "اسم الملف مطلوب." };

  if (action === "upload-url") {
    if (idIn && !exists) return { ok: false, error: "الملف ده مش موجود." };
    const isNew = !idIn;
    if (isNew && ctx.existingIds.length >= GROUP_FILES_MAX) return { ok: false, error: full };
    const id = isNew ? ctx.newId : idIn;
    return { ok: true, action, id, path: groupFilePath(ctx.team, id, fileName), isNew };
  }
  if (action === "commit") {
    if (!UUID.test(idIn)) return { ok: false, error: "رقم الملف مش سليم." };
    const isNew = !exists;
    if (isNew && ctx.existingIds.length >= GROUP_FILES_MAX) return { ok: false, error: full };
    const path = groupFilePath(ctx.team, idIn, fileName);
    if (String(b.path ?? "") !== path) return { ok: false, error: "مسار الملف مش مطابق." };
    const a = parseAudience(b, ctx.memberIds);
    if (!a.ok) return a;
    return {
      ok: true, action, id: idIn, path, fileName, rowCount: num(b.rowCount), plateCount: num(b.plateCount),
      audience: a.audience, memberIds: a.memberIds, isNew,
    };
  }
  return { ok: false, error: "عملية مش معروفة." };
}

// ── موبايل العضو: المزامنة ───────────────────────────────────────────────────────

export interface GroupFileIndexEntry { id: string; slot: string; fileName: string; updatedAt: string }
export interface LocalGroupFile extends GroupFileIndexEntry { state: RemoteDataState }

export interface GroupFilesSyncDeps {
  list(): Promise<{ files: GroupFileMeta[]; offline?: boolean; missing?: boolean }>;
  download(id: string): Promise<Blob | null>;
  ingest(slot: string, file: File, updatedAt: string): Promise<RemoteDataState>;
  loadLocal(slot: string): Promise<RemoteDataState | null>;
  clear(slot: string): Promise<void>;
  readIndex(): GroupFileIndexEntry[];
  writeIndex(entries: GroupFileIndexEntry[]): void;
}

async function localFrom(index: GroupFileIndexEntry[], d: GroupFilesSyncDeps): Promise<LocalGroupFile[]> {
  const out: LocalGroupFile[] = [];
  for (const e of index) {
    const st = await d.loadLocal(e.slot).catch(() => null);
    if (st) out.push({ ...e, state: st });
  }
  return out;
}

/**
 * الملفات اللي ليا ⇒ سلوتات على الموبايل: الجديد/المتغيّر بيتنزّل، اللي ماتغيّرش بيفضل (من غير تنزيل)، واللي المسئول
 * شاله (أو شالني منه) بيتمسح. من غير نت ⇒ اللي على الموبايل زي ما هو. التنزيل فشل ⇒ النسخة القديمة + اسمه في `failed`.
 */
export async function syncGroupFilesWith(d: GroupFilesSyncDeps): Promise<{ files: LocalGroupFile[]; failed: string[] }> {
  const index = d.readIndex();
  const r = await d.list().catch(() => ({ files: [] as GroupFileMeta[], offline: true }));
  if (r.offline) return { files: await localFrom(index, d), failed: [] };

  const files: LocalGroupFile[] = [];
  const failed: string[] = [];
  for (const f of r.files) {
    const slot = groupFileSlot(f.id);
    const prev = index.find((e) => e.id === f.id);
    const local = await d.loadLocal(slot).catch(() => null);
    if (local && local.uploadedAt === f.updatedAt) {
      files.push({ id: f.id, slot, fileName: f.fileName, updatedAt: f.updatedAt, state: local });
      continue;
    }
    const blob = await d.download(f.id).catch(() => null);
    const st = blob
      ? await d.ingest(slot, new File([blob], f.fileName, { type: blob.type }), f.updatedAt).catch(() => null)
      : null;
    if (st) { files.push({ id: f.id, slot, fileName: f.fileName, updatedAt: f.updatedAt, state: st }); continue; }
    failed.push(f.fileName);
    // القديمة أحسن من مفيش — بتاريخها هي عشان المرة الجاية يحاول تاني
    if (local) files.push({ id: f.id, slot, fileName: prev?.fileName ?? local.fileName, updatedAt: local.uploadedAt, state: local });
  }
  const keep = new Set(r.files.map((f) => f.id));
  for (const e of index) if (!keep.has(e.id)) await d.clear(e.slot).catch(() => {});
  d.writeIndex(files.map(({ id, slot, fileName, updatedAt }) => ({ id, slot, fileName, updatedAt })));
  return { files, failed };
}

// ── الموبايل: الطلبات ────────────────────────────────────────────────────────────

const INDEX_KEY = "ph:gdf:v1";

function readIndexLS(): GroupFileIndexEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.slot === "string") : [];
  } catch { return []; }
}
function writeIndexLS(entries: GroupFileIndexEntry[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(entries)); } catch { /* التخزين مقفول — المرة الجاية بيتنزّل تاني */ }
}

async function authHeaders(): Promise<Record<string, string>> {
  const at = await import("./supabaseClient")
    .then(({ supabase }) => supabase.auth.getSession())
    .then(({ data }) => data.session?.access_token)
    .catch(() => undefined);
  return at ? { Authorization: `Bearer ${at}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

/** العضو: الملفات اللي المسئول خصّصهالي (أو للمجموعة كلها). `offline` ⇒ مانعرفش، فاللي على الموبايل مايتمسحش. */
export async function fetchMyGroupFiles(): Promise<{ files: GroupFileMeta[]; offline?: boolean; missing?: boolean }> {
  try {
    const res = await fetch("/api/my-data-files", { headers: await authHeaders(), cache: "no-store" });
    if (!res.ok) return { files: [], offline: true };
    const j = await res.json().catch(() => null);
    if (!j || !Array.isArray(j.files)) return { files: [], offline: true };
    return { files: j.files as GroupFileMeta[], missing: !!j.missing };
  } catch { return { files: [], offline: true }; }
}

/** العضو: ينزّل ملف من بتوعه (لينك مؤقت من السيرفر). */
export async function downloadMyGroupFile(id: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/my-data-files?download=${encodeURIComponent(id)}`, { headers: await authHeaders(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!j.url) return null;
    const f = await fetch(String(j.url));
    return f.ok ? await f.blob() : null;
  } catch { return null; }
}

let inflight: Promise<{ files: LocalGroupFile[]; failed: string[] }> | null = null;

/** مزامنة واحدة في نفس الوقت — الفرز و«الشهايد» و«صوت فقط» ممكن يطلبوها مع بعض. */
export function syncMyGroupFiles(): Promise<{ files: LocalGroupFile[]; failed: string[] }> {
  if (inflight) return inflight;
  inflight = (async () => {
    const rds = await import("./remoteDataSlot");
    return syncGroupFilesWith({
      list: fetchMyGroupFiles,
      download: downloadMyGroupFile,
      ingest: (slot, file, at) => rds.ingestRemoteData(slot, file, at, GROUP_FILE_LARGE_BYTES),
      loadLocal: (slot) => rds.loadLocalRemoteData(slot),
      clear: (slot) => rds.clearRemoteData(slot),
      readIndex: readIndexLS,
      writeIndex: writeIndexLS,
    });
  })().finally(() => { inflight = null; });
  return inflight;
}

/** اللي على الموبايل دلوقتي (من غير نت) — عشان الفرز يبدأ على طول. */
export async function loadLocalGroupFiles(): Promise<LocalGroupFile[]> {
  const rds = await import("./remoteDataSlot");
  const out: LocalGroupFile[] = [];
  for (const e of readIndexLS()) {
    const st = await rds.loadLocalRemoteData(e.slot).catch(() => null);
    if (st) out.push({ ...e, state: st });
  }
  return out;
}

/** العضو اتنقل مجموعة ⇒ ملفات المجموعة القديمة ماتتفرزش في الجديدة. */
export async function clearAllGroupFiles(): Promise<void> {
  const rds = await import("./remoteDataSlot");
  for (const e of readIndexLS()) await rds.clearRemoteData(e.slot).catch(() => {});
  writeIndexLS([]);
}

// ── المسئول ──────────────────────────────────────────────────────────────────────

export interface GroupFilesList {
  files: GroupFileMeta[];
  members: { id: string; username: string | null }[];
  leaderId: string | null;
  missing?: boolean;
  error?: string;
}

/** المسئول: ملفات المجموعة دي + أعضاؤها (عشان يختار مين يشوف إيه). */
export async function listGroupFiles(team: string): Promise<GroupFilesList> {
  try {
    const res = await fetch(`/api/group/data-files?team=${encodeURIComponent(team)}`, { headers: await authHeaders(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { files: [], members: [], leaderId: null, error: j.error ?? "تعذّر التحميل." };
    return { files: (j.files ?? []) as GroupFileMeta[], members: j.members ?? [], leaderId: j.leaderId ?? null, missing: !!j.missing };
  } catch { return { files: [], members: [], leaderId: null, error: "مافيش نت." }; }
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/group/data-files", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(j.error ?? "تعذّر."));
  return j;
}

/** المسئول: يرفع ملف جديد (أو يغيّر ملف موجود — `replaceId`) لينك رفع مؤقت ⇒ الملف ⇒ تثبيت بمين يشوفه. */
export async function uploadGroupFile(
  team: string, file: File, counts: { rowCount: number | null; plateCount: number | null },
  audience: GroupFileAudience, memberIds: string[], replaceId?: string,
): Promise<void> {
  const u = await post({ action: "upload-url", team, fileName: file.name, ...(replaceId ? { id: replaceId } : {}) });
  const { supabase } = await import("./supabaseClient");
  const { error } = await supabase.storage.from(GROUP_FILES_BUCKET).uploadToSignedUrl(String(u.path), String(u.token), file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error(error.message);
  await post({ action: "commit", team, id: u.id, fileName: file.name, path: u.path, ...counts, audience, memberIds });
}

/** المسئول: يغيّر الملف يظهر لمين (من غير رفع تاني). */
export async function setGroupFileAudience(team: string, id: string, audience: GroupFileAudience, memberIds: string[]): Promise<void> {
  await post({ action: "audience", team, id, audience, memberIds });
}

/** المسئول: يشيل ملف. */
export async function deleteGroupFile(team: string, id: string): Promise<void> {
  await post({ action: "delete", team, id });
}

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📢 «تشييك البرنامج» — ملفات تشييك الأدمن بتنزل عند كل المناديب (٢٥ أكتوبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «لما ادمن عندي يرفعه يظهر عند كل الناس اكن المناديب هيا اللي رفعاه ولو رفعت تحت اي محفظه او تشييك او
 * اكتر زياده بردة ينزل عند كل الناس والناس تقدر تفرز عليهم وتشيك عليهم» · «لو رفع تشييك هو من عندو يشتغل ب تشييكه
 * هو ولو مسح التشييك بتاعه هو يقرأ تلقائي التشييك اللي الادمن رافعو» · «يظهر عند الادمن تحت صفحه التشييك كم واحد
 * قاري عندو التشييك وكم واحد مش شغال بيه». قراراته: لكل المناديب · بيستبدل · **آخر رفع يكسب**.
 *
 *  · الملفات بتتحط في **نفس خانات المندوب** (`check` + `check-2`…) ومتعلّم عليها `source: "app"` ⇒ التشييك وVoice
 *    PRO والفرز والمطلوب بيشتغلوا عليها زي ما هي من غير ولا سطر زيادة.
 *  · ملف من غير العلامة = المندوب رفعه بنفسه. نسخة الأدمن أحدث من آخر ملف رفعه ⇒ بتستبدله؛ رفع بعدها ⇒ بتوعه بس؛
 *    مسح بتوعه ⇒ ترجع نسخة الأدمن.
 *  · السيرفر (`docs/sql/app-check.sql`): `app_check_set` صف واحد (النسخة + الملفات) + مخزن `app-check` +
 *    `app_check_status` (حالة كل مندوب للأدمن) + إشعار فوري (realtime) أول ما الأدمن ينشر.
 *  · المزامنة نفسها **مابتنشرش** — النشر بس من `onUserCheckChanged` (المستخدم رفع/مسح بإيده).
 *  · ينشر السوبر أدمن + `APP_CHECK_PUBLISHER_IDS` بس. 🔒 `APP_CHECK_FOR_ALL = false`: الاستقبال للسوبر أدمن + حسابات التجربة بس لحد الفتح للكل.
 */
import type { UploadedFileRecord } from "./idb";
import { bankPlateToArabic, detectPlateColumn, normalizePlate } from "./plateParser";

/** 🔒 الاستقبال للكل بعد تجربة المالك — قبلها السوبر أدمن + `APP_CHECK_TEST_EMAILS` بس. */
export const APP_CHECK_FOR_ALL = false;
/** حسابات المالك للتجربة (بيدخل بيها كمندوب ويشوف الملف نزل) — حروف صغيرة. */
export const APP_CHECK_TEST_EMAILS: readonly string[] = ["google.review@qannas-ksa.com", "asemafify40@gmail.com"];
export const APP_SOURCE = "app";
const BUCKET = "app-check";
const MAX_SLOTS = 100;
const REPORT_EVERY_MS = 6 * 3_600_000;
const VIS_RESYNC_MS = 30_000;

export interface AppCheckFile { slot: string; path: string; fileName: string; rows?: number; plates?: number }
export interface AppCheckSet { version: string; updatedAt: string; files: AppCheckFile[] }
export interface LocalCheckMeta { slot: string; source?: string; appVersion?: string; uploadedAt?: string }
export type AppCheckMode = "app" | "own" | "none";
export type AppCheckAction = "none" | "apply" | "clear";
export type AppCheckPublishResult = null | { ok: true; files: number } | { ok: false; error: string };

// ── القواعد (نقية) ──────────────────────────────────────────────────────────

/** خانات متتابعة: `check` ثم `check-2`… (القراية بتقف عند أول خانة فاضية). */
export function slotForIndex(i: number): string {
  return i === 0 ? "check" : `check-${i + 1}`;
}

/**
 * اللي ينشروا تشييك البرنامج: **السوبر أدمن + الأدمن ده بس** (المالك ٢٥ أكتوبر: «مش السوبر ادمن هو اللي هيرفع الملف دة
 * يوميا دة ادمن معايا» · «انا عايزها ل ادمن واحد معين» · «وانا» ⇒ محمد عفيفي). أي أدمن تاني يرفع ⇒ عنده هو بس.
 */
export const APP_CHECK_PUBLISHER_IDS: readonly string[] = ["5659243d-8298-4e6d-88ef-42571491d162"];

export function canPublishAppCheck(p: { isSuper?: boolean; uid?: string | null }): boolean {
  return p.isSuper === true || (!!p.uid && APP_CHECK_PUBLISHER_IDS.includes(p.uid));
}

export function canReceiveAppCheck(p: { isSuper?: boolean; email?: string | null }): boolean {
  if (APP_CHECK_FOR_ALL || p.isSuper === true) return true;
  const e = String(p.email ?? "").trim().toLowerCase();
  return !!e && APP_CHECK_TEST_EMAILS.includes(e);
}

/** أي ملف رفعه بنفسه ⇒ «بتاعه» · كله من البرنامج ⇒ «البرنامج» · مفيش ⇒ none. */
export function appCheckMode(local: LocalCheckMeta[]): AppCheckMode {
  if (local.some((f) => f.source !== APP_SOURCE)) return "own";
  return local.length ? "app" : "none";
}

const ts = (s?: string | null): number => {
  const t = Date.parse(String(s ?? ""));
  return Number.isFinite(t) ? t : 0;
};

/**
 * المزامنة تعمل إيه؟
 *  · عنده ملف بتاعه: أحدث من نسخة الأدمن ⇒ ولا حاجة · أقدم ⇒ نسخة الأدمن تستبدل (**آخر رفع يكسب**).
 *  · كله من البرنامج (أو مفيش): نفس النسخة كاملة ⇒ ولا حاجة · غير كده ⇒ ينزّل · الأدمن مسح كله ⇒ تتشال.
 */
export function planAppCheckSync(local: LocalCheckMeta[], set: AppCheckSet | null): AppCheckAction {
  const own = local.filter((f) => f.source !== APP_SOURCE);
  const hasSet = !!set && set.files.length > 0;
  if (own.length) {
    if (!hasSet) return "none";
    const latestOwn = Math.max(...own.map((f) => ts(f.uploadedAt)));
    return latestOwn >= ts(set!.updatedAt) ? "none" : "apply";
  }
  if (!hasSet) return local.length ? "clear" : "none";
  const upToDate = local.length === set!.files.length && local.every((f) => f.appVersion === set!.version);
  return upToDate ? "none" : "apply";
}

function countPlates(headers: string[], rows: Record<string, string>[]): number {
  const col = detectPlateColumn(headers, rows);
  if (!col) return 0;
  const s = new Set<string>();
  for (const r of rows) {
    const k = normalizePlate(bankPlateToArabic(String(r[col] ?? "")));
    if (k) s.add(k);
  }
  return s.size;
}

function newVersion(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const metaOf = (r: UploadedFileRecord): LocalCheckMeta => ({
  slot: r.slot, source: r.source, appVersion: r.appVersion, uploadedAt: r.uploadedAt,
});

// ── الحالة للشاشة ───────────────────────────────────────────────────────────

export interface AppCheckUiState {
  /** الميزة شغّالة على الحساب ده (ينشر أو يستقبل) */
  enabled: boolean;
  publisher: boolean;
  mode: AppCheckMode;
  files: number;
  syncing: boolean;
  lastPublish: AppCheckPublishResult;
}
let ui: AppCheckUiState = { enabled: false, publisher: false, mode: "none", files: 0, syncing: false, lastPublish: null };
const subs = new Set<() => void>();
function setUi(patch: Partial<AppCheckUiState>): void {
  ui = { ...ui, ...patch };
  for (const cb of Array.from(subs)) { try { cb(); } catch { /* مشترك واقع */ } }
}
export function getAppCheckState(): AppCheckUiState { return ui; }
export function subscribeAppCheck(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

// ── الحساب ──────────────────────────────────────────────────────────────────

interface Me { uid: string; isSuper: boolean; role: string | null; email: string | null }
let meCache: { at: number; me: Me | null } | null = null;

async function myAccess(): Promise<Me | null> {
  if (meCache && Date.now() - meCache.at < 5 * 60_000) return meCache.me;
  try {
    const { currentSession } = await import("./authSession");
    const { userId } = await currentSession();
    if (!userId) return null;
    const { supabase } = await import("./supabaseClient");
    const { data } = await supabase.from("profiles").select("role, is_super, email").eq("id", userId).single();
    const p = (data ?? null) as { role?: string | null; is_super?: boolean | null; email?: string | null } | null;
    if (!p) return null;
    const me: Me = { uid: userId, isSuper: p.is_super === true, role: p.role ?? null, email: p.email ?? null };
    meCache = { at: Date.now(), me };
    return me;
  } catch {
    return null;
  }
}

/** الحساب ده بيستقبل تشييك البرنامج؟ (ملف المجموعة القديم بيسكت عنده — `lib/teamCheck.ts`) */
export async function appCheckReceivingNow(): Promise<boolean> {
  const me = await myAccess();
  return !!me && canReceiveAppCheck(me);
}

// ── الجهاز ──────────────────────────────────────────────────────────────────

async function listLocalCheckFiles(): Promise<UploadedFileRecord[]> {
  const { getUploadedFile } = await import("./idb");
  const out: UploadedFileRecord[] = [];
  const main = await getUploadedFile("local", "check").catch(() => null);
  if (main) out.push(main);
  for (let n = 2; n < MAX_SLOTS; n++) {
    const r = await getUploadedFile("local", `check-${n}`).catch(() => null);
    if (!r) break;
    out.push(r);
  }
  return out;
}

/** بيكتب الملفات في خانات متتابعة ويشيل أي خانة قديمة زيادة. */
async function writeCheckSlots(recs: UploadedFileRecord[], old: UploadedFileRecord[]): Promise<void> {
  const { saveUploadedFile, deleteUploadedFile } = await import("./idb");
  for (let i = 0; i < recs.length; i++) {
    const slot = slotForIndex(i);
    await saveUploadedFile({ ...recs[i], key: `local:${slot}`, agentId: "local", slot });
  }
  const keep = new Set(recs.map((_, i) => slotForIndex(i)));
  for (const o of old) if (!keep.has(o.slot)) await deleteUploadedFile("local", o.slot).catch(() => {});
}

/** كل الصفحات المفتوحة تعيد قراية التشييك (الأساسي **والإضافي**). */
async function announce(): Promise<void> {
  try {
    const { notifyCheckSheetChanged } = await import("./checkSheetSync");
    notifyCheckSheetChanged();
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("idbFileUpdated", { detail: { slot: "check", all: true } })); } catch { /* SSR */ }
}

let lastReport: { sig: string; at: number } | null = null;
async function reportStatus(me: Me, local: UploadedFileRecord[]): Promise<void> {
  const mode = appCheckMode(local.map(metaOf));
  const version = mode === "app" ? (local[0]?.appVersion ?? null) : null;
  const sig = `${me.uid}|${mode}|${version}|${local.length}`;
  if (lastReport && lastReport.sig === sig && Date.now() - lastReport.at < REPORT_EVERY_MS) return;
  try {
    const { supabase } = await import("./supabaseClient");
    const { error } = await supabase.from("app_check_status").upsert(
      { agent_id: me.uid, mode, version, files: local.length, updated_at: new Date().toISOString() },
      { onConflict: "agent_id" },
    );
    if (!error) lastReport = { sig, at: Date.now() };
  } catch { /* المرة الجاية */ }
}

async function refreshUi(local?: UploadedFileRecord[]): Promise<void> {
  const l = local ?? (await listLocalCheckFiles().catch(() => [] as UploadedFileRecord[]));
  setUi({ mode: appCheckMode(l.map(metaOf)), files: l.length });
}

/** للشاشة: يعيد حساب «شغّال على تشييك البرنامج ولا بتاعه» من الملفات اللي على الجهاز. */
export function refreshAppCheckUi(): Promise<void> {
  return refreshUi().catch(() => {});
}

export interface AppCheckReportRow { agent_id: string; username: string | null; mode: string | null; version: string | null; files: number | null; updated_at: string | null; last_seen: string | null }
export interface AppCheckReport {
  set: AppCheckSet | null;
  reading: AppCheckReportRow[];
  own: AppCheckReportRow[];
  notReading: AppCheckReportRow[];
}

/** 🧮 الأدمن: مين قاري آخر نسخة · مين شغّال على بتاعه · مين مش شغّال بيه (لسه مافتحش / نسخة قديمة / مفيش). */
export function classifyAppCheckReport(rows: AppCheckReportRow[], set: AppCheckSet | null): Omit<AppCheckReport, "set"> {
  const reading: AppCheckReportRow[] = [];
  const own: AppCheckReportRow[] = [];
  const notReading: AppCheckReportRow[] = [];
  for (const r of rows) {
    if (r.mode === "own") own.push(r);
    else if (r.mode === "app" && set && set.files.length && r.version === set.version) reading.push(r);
    else notReading.push(r);
  }
  return { reading, own, notReading };
}

export async function fetchAppCheckReport(): Promise<AppCheckReport | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const [{ data, error }, cur] = await Promise.all([supabase.rpc("app_check_report"), fetchAppCheckSet()]);
    if (error) return null;
    const rows = (Array.isArray(data) ? data : []) as AppCheckReportRow[];
    return { set: cur.set, ...classifyAppCheckReport(rows, cur.set) };
  } catch {
    return null;
  }
}

// ── السيرفر ─────────────────────────────────────────────────────────────────

async function fetchAppCheckSet(): Promise<{ ok: boolean; set: AppCheckSet | null }> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.from("app_check_set").select("version, files, updated_at").eq("id", 1).maybeSingle();
    if (error) return { ok: false, set: null };
    if (!data) return { ok: true, set: null };
    const d = data as { version: unknown; files: unknown; updated_at: unknown };
    const files = Array.isArray(d.files)
      ? (d.files as AppCheckFile[]).filter((f) => f && typeof f.path === "string" && typeof f.slot === "string")
      : [];
    return { ok: true, set: { version: String(d.version), updatedAt: String(d.updated_at), files } };
  } catch {
    return { ok: false, set: null };
  }
}

/**
 * بينزّل كل الملفات **مع بعض** (أسرع) ويقراهم **واحد ورا واحد** (الآيفون بيقفل البرنامج لو ملفات كبيرة اتقرت في نفس
 * اللحظة). أي ملف واقع ⇒ null (مانستبدلش حاجة بنص نسخة).
 */
async function downloadSet(set: AppCheckSet): Promise<UploadedFileRecord[] | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { parseExcelFile } = await import("./excel");
    const blobs = await Promise.all(set.files.map(async (f) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(f.path);
      if (error || !data) throw new Error("download");
      return data;
    }));
    const out: UploadedFileRecord[] = [];
    for (let i = 0; i < set.files.length; i++) {
      const f = set.files[i];
      const data = blobs[i];
      const file = new File([data], f.fileName, { type: data.type || "application/octet-stream" });
      const table = await parseExcelFile(file);
      if (!table.rows.length) throw new Error("empty");
      const slot = slotForIndex(i);
      out.push({
        key: `local:${slot}`, agentId: "local", slot, fileName: f.fileName,
        headers: table.headers, rows: table.rows, uploadedAt: set.updatedAt, fileBlob: file,
        source: APP_SOURCE, appVersion: set.version,
      } as UploadedFileRecord);
    }
    return out;
  } catch {
    return null;
  }
}

// ── النشر (الأدمن) ──────────────────────────────────────────────────────────

/** الأدمن رفع/غيّر/مسح ⇒ كل ملفات التشييك اللي عنده تبقى «تشييك البرنامج» عند كل المناديب. */
export async function publishAppCheck(): Promise<AppCheckPublishResult> {
  const me = await myAccess();
  if (!me || !canPublishAppCheck(me)) return null;
  try {
    const { supabase } = await import("./supabaseClient");
    const all = await listLocalCheckFiles();
    const local = all.filter((r) => r.fileBlob);
    const prev = await fetchAppCheckSet();
    const version = newVersion();
    const files: AppCheckFile[] = [];
    for (let i = 0; i < local.length; i++) {
      const r = local[i];
      const slot = slotForIndex(i);
      const path = `${version}/${slot}`;
      const blob = r.fileBlob as Blob;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || "application/octet-stream" });
      if (error) return { ok: false, error: error.message };
      files.push({ slot, path, fileName: r.fileName, rows: r.rows.length, plates: countPlates(r.headers, r.rows) });
    }
    const { data, error } = await supabase.rpc("publish_app_check", { p_version: version, p_files: files });
    if (error) {
      try { await supabase.storage.from(BUCKET).remove(files.map((f) => f.path)); } catch { /* ignore */ }
      return { ok: false, error: error.message };
    }
    const updatedAt = typeof data === "string" && data ? data : new Date().toISOString();
    // ملفات الأدمن نفسه بقت «تشييك البرنامج» (نفس النسخة) ⇒ مابتنزلش عنده تاني
    const marked = local.map((r) => ({ ...r, source: APP_SOURCE, appVersion: version, uploadedAt: updatedAt }));
    await writeCheckSlots(marked, all);
    const old = prev.ok && prev.set ? prev.set.files.map((f) => f.path).filter((p) => !p.startsWith(`${version}/`)) : [];
    if (old.length) { try { await supabase.storage.from(BUCKET).remove(old); } catch { /* ignore */ } }
    await reportStatus(me, marked);
    await refreshUi(marked);
    return { ok: true, files: files.length };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 120) };
  }
}

// ── الاستقبال (المندوب) ─────────────────────────────────────────────────────

let inflight: Promise<boolean> | null = null;
let lastRun = 0;

/** بيجيب نسخة الأدمن لو محتاج. true = غيّر ملفات على الجهاز. */
export function syncAppCheck(): Promise<boolean> {
  if (!inflight) inflight = doSync().finally(() => { inflight = null; });
  return inflight;
}

async function doSync(): Promise<boolean> {
  lastRun = Date.now();
  const me = await myAccess();
  if (!me || !canReceiveAppCheck(me)) return false;
  const { ok, set } = await fetchAppCheckSet();
  if (!ok) return false;   // 🛡️ السيرفر مش بيرد ⇒ ولا حاجة بتتمسح
  const local = await listLocalCheckFiles();
  const action = planAppCheckSync(local.map(metaOf), set);
  let changed = false;
  if (action === "apply" && set) {
    setUi({ syncing: true });
    try {
      const recs = await downloadSet(set);
      if (recs) { await writeCheckSlots(recs, local); changed = true; }
    } finally {
      setUi({ syncing: false });
    }
  } else if (action === "clear") {
    await writeCheckSlots([], local);
    changed = true;
  }
  const now = changed ? await listLocalCheckFiles() : local;
  if (changed) await announce();
  await reportStatus(me, now);
  await refreshUi(now);
  return changed;
}

/**
 * المستخدم رفع/غيّر/مسح ملف تشييك **بإيده** (مش المزامنة):
 *  · الأدمن ⇒ ينشر لكل المناديب.
 *  · المندوب رفع بتاعه ⇒ بيشتغل على بتوعه **بس** (ملفات البرنامج بتتشال) · مسح بتوعه كلهم ⇒ يرجع تشييك البرنامج.
 */
export async function onUserCheckChanged(): Promise<AppCheckPublishResult> {
  const me = await myAccess();
  if (!me) return null;
  if (canPublishAppCheck(me)) {
    const r = await publishAppCheck();
    setUi({ lastPublish: r });
    return r;
  }
  if (!canReceiveAppCheck(me)) return null;
  const local = await listLocalCheckFiles();
  const own = local.filter((r) => r.source !== APP_SOURCE);
  if (own.length && own.length < local.length) {
    await writeCheckSlots(own, local);
    await announce();
  }
  await syncAppCheck();
  return null;
}

/** بيبدأ مرة واحدة من اللياوت: مزامنة فورية + أول ما الأدمن ينشر (realtime) + كل رجوع للبرنامج. */
let started = false;
export function startAppCheckSync(_uid: string): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  let channel: { unsubscribe?: () => unknown } | null = null;
  let alive = true;
  void (async () => {
    const me = await myAccess();
    if (!alive || !me) return;
    const receive = canReceiveAppCheck(me);
    const publisher = canPublishAppCheck(me);
    setUi({ enabled: receive || publisher, publisher });
    await refreshUi();
    if (!receive) return;
    void syncAppCheck();
    try {
      const { supabase } = await import("./supabaseClient");
      channel = supabase
        .channel("app-check-set")
        .on("postgres_changes", { event: "*", schema: "public", table: "app_check_set" }, () => { void syncAppCheck(); })
        .subscribe() as unknown as { unsubscribe?: () => unknown };
    } catch { /* من غير realtime ⇒ الفتح/الرجوع بيكفّوا */ }
  })();
  const onVis = () => {
    if (document.visibilityState === "visible" && Date.now() - lastRun > VIS_RESYNC_MS) void syncAppCheck();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    alive = false;
    document.removeEventListener("visibilitychange", onVis);
    try { channel?.unsubscribe?.(); } catch { /* ignore */ }
    started = false;
  };
}

/** 🧪 الاختبارات بس */
export function __resetAppCheckForTest(): void {
  meCache = null; lastReport = null; inflight = null; lastRun = 0; started = false;
  ui = { enabled: false, publisher: false, mode: "none", files: 0, syncing: false, lastPublish: null };
}

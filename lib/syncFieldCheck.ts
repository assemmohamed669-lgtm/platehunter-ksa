/**
 * Cloud sync for the field-check sheet (شيت التسجيلات) — the plates confirmed
 * in the التشييك page (camera / manual / voice). Pushes local FieldCheckEntry
 * rows to Supabase and restores them back on a fresh device. Text only — the
 * dynamic reference columns ride along in a JSONB `extra` column; no images,
 * no audio.
 */
import { supabase } from "./supabaseClient";
import { clearFieldCheckDeletes, getAllFieldCheckEntries, getFieldCheckDeletes, getPendingFieldChecks, markFieldChecksSynced, saveFieldCheckEntries, type FieldCheckEntry } from "./idb";

async function upsertFieldCheck(uid: string, e: FieldCheckEntry): Promise<string | null> {
  const { error } = await supabase.from("field_checks").upsert(
    {
      local_id: e.id,
      agent_id: uid,
      plate: e.plate,
      method: e.method,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      maps_link: e.mapsLink ?? null,
      extra: e.row ?? {},
      checked_at: e.checkedAt,
    },
    { onConflict: "local_id" }
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return error ? [error.message, (error as any).code].filter(Boolean).join(" · ") : null;
}

async function requireSession(agentId: string): Promise<string | null> {
  // **مهم:** getSession() بيقرا الجلسة **محلياً** بلا نداء شبكة. getUser() بيعمل
  // نداء بيفشل «Failed to fetch» على شبكة الموبايل — وساعتها كان الاسترجاع
  // بيرجع بلا أي صف والمندوب يفتح البرنامج يلاقي سجلاته فاضية. (نفس الدرس
  // الموثّق في lib/trainingSync.ts).
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid || uid !== agentId) return null;
  return uid;
}

/** Push every local field-check entry to the server (upsert by local_id). */
export async function pushFieldChecks(
  agentId: string
): Promise<{ synced: number; total: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, total: 0, error: "الجهاز أوفلاين" };
  }
  const uid = await requireSession(agentId);
  if (!uid) return { synced: 0, total: 0, error: "مفيش جلسة صالحة" };

  // Only this agent's own rows — never upload another agent's local sheet
  // under this uid (would corrupt attribution on a shared device).
  const all = await getAllFieldCheckEntries(uid);
  let synced = 0;
  let firstError: string | undefined;
  for (const e of all) {
    const err = await upsertFieldCheck(uid, e);
    if (err) { if (!firstError) firstError = err; }
    else synced++;
  }
  return { synced, total: all.length, error: firstError };
}

/**
 * مزامنة تدريجية سريعة: بترفع بس السجلات اللي لسه مترفعتش (synced=false) وتعلّمها
 * synced بعد الرفع. أول ضغطة بترفع الكل (كله لسه pending)، وبعدين كل ضغطة بترفع
 * الجديد فقط — فبتبقى سريعة. تُستخدم في زر المزامنة بصفحة التشييك.
 */
export async function pushPendingFieldChecks(
  agentId: string
): Promise<{ synced: number; pending: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, pending: 0, error: "الجهاز أوفلاين" };
  }
  const uid = await requireSession(agentId);
  if (!uid) return { synced: 0, pending: 0, error: "مفيش جلسة صالحة" };

  const pending = await getPendingFieldChecks(uid);
  let synced = 0;
  let firstError: string | undefined;
  const doneIds: string[] = [];
  for (const e of pending) {
    const err = await upsertFieldCheck(uid, e);
    if (err) { if (!firstError) firstError = err; }
    else { synced++; doneIds.push(e.id); }
  }
  await markFieldChecksSynced(doneIds);
  return { synced, pending: pending.length, error: firstError };
}

/**
 * تنفيذ المسح المحلي على السيرفر — بياخد شواهد المسح (tombstones) اللي في IDB
 * ويمسح صفوفها من `field_checks`، وبعد النجاح بس بيشيل الشاهدة.
 *
 * من غير الخطوة دي المسح بيفضل على الجهاز بس، و`restoreFieldChecks` بيرجّع
 * الصف من السيرفر أول ما المندوب يفتح الصفحة تاني — ده كان سبب شكوى «بمسح
 * السجلات وبترجع». سياسة `field_checks_agent_delete` بتسمح للمندوب يمسح صفوفه
 * هو بس، وإحنا كمان بنقيّد بـ`agent_id` صراحةً.
 */
export async function pushFieldCheckDeletes(
  agentId: string
): Promise<{ deleted: number; pending: number; error?: string }> {
  const tombs = await getFieldCheckDeletes(agentId);
  if (tombs.length === 0) return { deleted: 0, pending: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { deleted: 0, pending: tombs.length, error: "الجهاز أوفلاين" };
  }
  const uid = await requireSession(agentId);
  if (!uid) return { deleted: 0, pending: tombs.length, error: "مفيش جلسة صالحة" };

  // على دفعات — `in(...)` بقائمة ضخمة بتعمل URL أطول من اللازم على الموبايل.
  const CHUNK = 200;
  const ids = tombs.map((t) => t.id);
  let deleted = 0;
  let firstError: string | undefined;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("field_checks")
      .delete()
      .eq("agent_id", uid)
      .in("local_id", chunk);
    if (error) { if (!firstError) firstError = error.message; continue; }
    // الشاهدة تتشال بعد نجاح المسح بس — لو الشبكة قطعت تفضل وتتنفّذ المرة الجاية.
    await clearFieldCheckDeletes(chunk);
    deleted += chunk.length;
  }
  return { deleted, pending: ids.length - deleted, error: firstError };
}

/**
 * Restore this agent's field-check sheet FROM the server INTO IndexedDB.
 *
 * يجيب كل الصفوف **على دفعات** (‎1000/دفعة) — Supabase بيحدّد أي استعلام بـ‎1000
 * صف كحد أقصى، فاستعلام واحد كان بيرجّع أول ‎1000 بس (ده اللي خلّى مندوب عنده
 * ‎4590 سجل يشوف ‎~1019). بنلف بالـ range لحد ما نجيب الكل.
 */
export async function restoreFieldChecks(
  agentId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ restored: number; error?: string }> {
  const PAGE = 1000;
  const CONCURRENCY = 4;

  // صفوف اتمسحت على الجهاز ولسه المسح ماوصلش السيرفر (أوفلاين/خطأ شبكة) —
  // الاسترجاع ماينفعش يرجّعها قدام المندوب تاني.
  const tombstoned = new Set((await getFieldCheckDeletes(agentId)).map((d) => d.id));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toEntry = (r: any): FieldCheckEntry => ({
    id: r.local_id,
    agentId,
    plate: r.plate,
    row: (r.extra as Record<string, string>) ?? {},
    method: r.method ?? "",
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    mapsLink: r.maps_link ?? undefined,
    checkedAt: r.checked_at,
  });

  const fetchPage = (from: number) =>
    supabase
      .from("field_checks")
      .select("*")
      .eq("agent_id", agentId)
      .order("checked_at", { ascending: true }) // ترتيب ثابت عشان الصفحات ماتتداخلش
      .range(from, from + PAGE - 1);

  // العدد الكلي الأول — يخلّينا نجيب كل الصفحات **مع بعض** بدل واحدة ورا التانية،
  // ويخلّينا نعرض تقدّم حقيقي للمندوب («٢٠٠٠ من ٦١١٠») بدل انتظار أعمى.
  const { count, error: cErr } = await supabase
    .from("field_checks")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);

  let restored = 0;

  // فشل العدّ (أوفلاين/صلاحيات) → نرجع للطريقة المتتابعة، بس بكتابة بالجملة برضه.
  if (cErr || count == null) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await fetchPage(from);
      if (error) return { restored, error: error.message };
      const rows = data ?? [];
      const keep = rows.filter((r) => !tombstoned.has(r.local_id));
      await saveFieldCheckEntries(keep.map(toEntry));
      restored += keep.length;
      onProgress?.(restored, restored);
      if (rows.length < PAGE) break; // نهاية الصفحات = طول الصفحة الخام مش المفلترة
    }
    return { restored };
  }

  const total = count;
  onProgress?.(0, total);
  if (total === 0) return { restored: 0 };

  const offsets: number[] = [];
  for (let from = 0; from < total; from += PAGE) offsets.push(from);

  let firstError: string | undefined;
  // مجموعات متوازية — أسرع بكتير من صفحة ورا صفحة على شبكة الموبايل، ومحدودة
  // بـ٤ في المرة عشان ما نغرقش الشبكة ولا الذاكرة.
  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = offsets.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(batch.map((from) => fetchPage(from)));
    const entries: FieldCheckEntry[] = [];
    for (const p of pages) {
      if (p.error) { if (!firstError) firstError = p.error.message; continue; }
      for (const r of p.data ?? []) if (!tombstoned.has(r.local_id)) entries.push(toEntry(r));
    }
    // معاملة واحدة للمجموعة كلها. لو فشلت (مساحة الجهاز مثلاً) بنكمّل باقي
    // المجموعات بدل ما الاسترجاع كله يقف — ومافيش سجل محلي بيتمسح في الحالتين.
    try {
      await saveFieldCheckEntries(entries);
      restored += entries.length;
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
    onProgress?.(restored, total);
  }

  return firstError ? { restored, error: firstError } : { restored };
}

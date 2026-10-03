/**
 * Cloud sync for the field-check sheet (شيت التسجيلات) — the plates confirmed
 * in the التشييك page (camera / manual / voice). Pushes local FieldCheckEntry
 * rows to Supabase and restores them back on a fresh device. Text only — the
 * dynamic reference columns ride along in a JSONB `extra` column; no images,
 * no audio.
 */
import { supabase } from "./supabaseClient";
import { clearFieldCheckDeletes, getAllFieldCheckEntries, getFieldCheckDeletes, getPendingFieldChecks, markFieldChecksSynced, markFieldChecksSyncedByIds, saveFieldCheckEntries, type FieldCheckEntry } from "./idb";

/** شكل الصف على السيرفر — مكان واحد للرفع صف صف وللرفع على دفعات، فمايختلفوش. */
function serverRowOf(uid: string, e: FieldCheckEntry) {
  return {
    local_id: e.id,
    agent_id: uid,
    plate: e.plate,
    method: e.method,
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    maps_link: e.mapsLink ?? null,
    extra: e.row ?? {},
    checked_at: e.checkedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const errorText = (error: any) => [error.message, error.code].filter(Boolean).join(" · ");

/** رفع صف واحد — ومعاه `status` عشان الرفع على دفعات يعرف «النت وقع» من «اترفض». */
async function upsertOneWithStatus(uid: string, e: FieldCheckEntry): Promise<{ err: string | null; status: number }> {
  const { error, status } = await supabase.from("field_checks").upsert(
    serverRowOf(uid, e),
    { onConflict: "local_id" }
  );
  return { err: error ? errorText(error) : null, status };
}

async function upsertFieldCheck(uid: string, e: FieldCheckEntry): Promise<string | null> {
  return (await upsertOneWithStatus(uid, e)).err;
}

/** `status 0` = الطلب ماوصلش السيرفر أصلاً (النت). */
const netDown = (status: number) => status === 0;
/** 401/403 = الجلسة/الصلاحية مرفوضة ⇒ أي طلب بعده هيترفض برضه. */
const authRejected = (status: number) => status === 401 || status === 403;

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
 * ══════════════════════════════════════════════════════════════════════
 *  ☁️ نفس `pushPendingFieldChecks` — بس **على دفعات** (اختيارية)
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٣ أكتوبر ٢٠٢٦) عايز تصدير ١٠٠٠+ لوحة يبقى سلس. القديمة بترفع كل سجل
 * في **طلب لوحده واحد ورا التاني** ⇒ ١٠٠٠ لوحة = ١٠٠٠ طلب نت في الخلفية
 * (دقايق على شبكة الموبايل) بيزاحموا صوت «الجديد» اللي رايح للسيرفر — والنت
 * الضعيف بالذات هو اللي المالك قلقان منه. وعلامة «اترفع» مابتتكتبش غير في
 * **الآخر**: لو التطبيق اتقفل في النص، كله بيترفع تاني من الأول.
 *
 * هنا:
 *   · طلب واحد لكل `batchSize` سجل (١٠٠ افتراضي — صغيرة كفاية للنت الضعيف)،
 *     **بنفس شكل الصف بالحرف** (`serverRowOf`) ونفس `onConflict`.
 *   · العلامة بتتكتب بعد كل دفعة (`markFieldChecksSyncedByIds` — بالمعرّف، مش
 *     قراية الشيت كله كل مرة).
 *   · السيرفر رفض الدفعة ⇒ تتجرّب صف صف زي القديمة، فصف بايظ مايوقّفش الباقي.
 *   · **النت وقع** (`status 0` = الطلب ماوصلش أصلاً) ⇒ الدفعة **تتنصّف**
 *     (١٠٠ ⇐ ٥٠ ⇐ ٢٥ ⇐ … ⇐ ١) وتتجرّب تاني: النت الضعيف بيوقّع الطلب الكبير
 *     والصغير بيعدّي، فالرفع بيمشي بدل ما يقف خالص.
 *     ولو **حتى صف واحد** ماعدّاش ⇒ النت واقع بجد: نقف ونسيب الباقي للمرة
 *     الجاية (بالكتير ٧ طلبات فاشلة ورا بعض، مش مئات).
 *   · دفعة صغيرة **عدّت** ⇒ الدفعة **تكبر تاني** (ضعف — لحد `batchSize`).
 *     مراجعة ٣ أكتوبر: من غير كده وقعة قصيرة (٦ طلبات) كانت بتنزّل الدفعة لصف
 *     واحد **لآخر الرفع** ⇒ ١٠٠٠ لوحة = ٩٠٧ طلب بدل ~٢٠.
 *     ⚠️ ومحاولة كبر **فشلت** (النت مابيشيلش الحجم ده) ⇒ اللي بعدها محتاجة
 *        **ضعف** النجاحات (١ ⇐ ٢ ⇐ ٤ …) — من غير كده نت بيشيل ٦ بس كان هيجرّب
 *        ١٢ بعد كل دفعة ويفشل (طلب فاشل لكل طلب ناجح).
 *   · `error` = سبب اللي **فضل** مترفعش بس (صف اترفض، أو الوقفة: النت/الجلسة).
 *     وقعة نت اتعالجت بالتنصيف والكل اترفع في الآخر ⇒ **مفيش خطأ** — المندوب
 *     مايتقالوش «فيه مشكلة» واللوحات كلها على السيرفر.
 *   · **الجلسة مرفوضة** (401/403 — توكن منتهي) ⇒ نقف فوراً: كل طلب بعده
 *     هيترفض برضه، فمافيش لازمة لـ١٠٠٠ طلب مرفوض. نفس الكلام لو حصل وإحنا
 *     بنجرّب صف صف.
 *
 * نفس شكل الرد ونفس ردود الأوفلاين/الجلسة بالحرف (حتى `error: undefined` في
 * النجاح). القديمة زي ما هي للكل.
 */
export async function pushPendingFieldChecksBatched(
  agentId: string,
  opts: { batchSize?: number } = {},
): Promise<{ synced: number; pending: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, pending: 0, error: "الجهاز أوفلاين" };
  }
  const uid = await requireSession(agentId);
  if (!uid) return { synced: 0, pending: 0, error: "مفيش جلسة صالحة" };

  const size = Number.isFinite(opts.batchSize) && (opts.batchSize as number) >= 1
    ? Math.floor(opts.batchSize as number) : 100;
  const pending = await getPendingFieldChecks(uid);
  let synced = 0;
  /** سبب اللي **فضل** مترفعش (أول واحد) — مش أي وقعة اتعالجت في السكة. */
  let leftError: string | undefined;
  /** حجم الدفعة دلوقتي — بيتنصّف مع وقعة النت وبيكبر تاني مع النجاح. */
  let cur = size;
  /** نجاحات ورا بعض على الحجم الحالي. */
  let okStreak = 0;
  /** كام نجاح لازم قبل ما الدفعة تكبر — بيتضاعف مع كل محاولة كبر فشلت. */
  let regrowAfter = 1;
  /** الحجم الحالي جه من «كبرنا» ولسه ماعدّاش؟ (فشله = النت مابيشيلهوش) */
  let growing = false;

  for (let i = 0; i < pending.length; ) {
    const chunk = pending.slice(i, i + cur);
    const { error, status } = await supabase.from("field_checks").upsert(
      chunk.map((e) => serverRowOf(uid, e)),
      { onConflict: "local_id" }
    );
    if (!error) {
      const ids = chunk.map((e) => e.id);
      synced += ids.length;
      await markFieldChecksSyncedByIds(ids);
      i += chunk.length;
      growing = false;
      // 📶 عدّت ⇒ نكبر تاني (ضعف لحد `size`) بعد `regrowAfter` نجاح
      if (cur < size && ++okStreak >= regrowAfter) {
        cur = Math.min(size, cur * 2);
        okStreak = 0;
        growing = true;
      }
      continue;
    }
    okStreak = 0;
    if (authRejected(status)) {                         // الجلسة مرفوضة — الباقي هيترفض برضه
      leftError ??= errorText(error);
      break;
    }
    if (netDown(status)) {
      if (chunk.length <= 1) {                          // ولا صف واحد عدّى ⇒ النت واقع: الباقي للمرة الجاية
        leftError ??= errorText(error);
        break;
      }
      // الحجم ده جه من «كبرنا» ووقع ⇒ المحاولة الجاية تستنى نجاحات أكتر
      if (growing) regrowAfter *= 2;
      growing = false;
      cur = Math.max(1, Math.floor(chunk.length / 2));  // نت ضعيف ⇒ دفعة أصغر ونجرّب تاني نفس المكان
      continue;
    }
    growing = false;
    // السيرفر رفض الدفعة ⇒ صف صف (صف بايظ مايوقّفش الباقي)
    const doneIds: string[] = [];
    let halt = false;
    for (const e of chunk) {
      const r = await upsertOneWithStatus(uid, e);
      if (!r.err) { doneIds.push(e.id); continue; }
      leftError ??= r.err;                              // الصف ده فضل مترفعش
      if (netDown(r.status) || authRejected(r.status)) { halt = true; break; }
    }
    synced += doneIds.length;
    await markFieldChecksSyncedByIds(doneIds);
    if (halt) break;
    i += chunk.length;
  }
  // اترفع كله ⇒ مفيش خطأ، حتى لو النت وقع في السكة واتعالج
  return { synced, pending: pending.length, error: synced >= pending.length ? undefined : leftError };
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
 * بيحوّل صف جايّ من السيرفر لسجل محلي — **معلّم إنه مرفوع بالفعل**.
 *
 * 🐞 السطر ده (`synced: true`) هو إصلاح حلقة كانت بتاكل الداتابيز: الاسترجاع
 * بيحفظ الصفوف بـ`store.put` اللي بيستبدل الصف بالكامل، فعلامة الرفع القديمة
 * كانت بتتمسح. وبعد الاسترجاع على طول بننده على المزامنة التدريجية، فبتلاقي كل
 * السجلات «لسه مترفعتش» وترفعهم تاني — وهي أصلاً جاية من السيرفر لحظتها.
 *
 * القياس يوم ٢٠٢٦-٠٩-٠٦: ٦٠٬٨١١ تعديل/ساعة على `field_checks` مقابل ١٬١٢٩ صف
 * جديد حقيقي — يعني ٥٤ كتابة زيادة مقابل كل كتابة ليها لازمة، و٤٢٪ من الجدول
 * كله (٣٥٦ ألف صف) بيتعاد كتابته كل ساعتين ونص.
 *
 * الصف الجايّ من السيرفر **موجود على السيرفر بحكم التعريف** — فتعليمه مرفوع
 * مش تفاؤل، ده الوصف الصحيح لحالته.
 */
export function serverRowToEntry(row: unknown, agentId: string): FieldCheckEntry {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    id: String(r.local_id ?? ""),
    agentId,
    plate: String(r.plate ?? ""),
    row: (r.extra as Record<string, string>) ?? {},
    method: (r.method as string) ?? "",
    lat: (r.lat as number) ?? undefined,
    lng: (r.lng as number) ?? undefined,
    mapsLink: (r.maps_link as string) ?? undefined,
    checkedAt: String(r.checked_at ?? ""),
    synced: true,
  };
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

  // صفوف **معدّلة محلياً ولسه مترفعتش** (synced=false). الاسترجاع بيكتب بـ`put`
  // فكان بيحطّ نسخة السيرفر القديمة فوق تعديل المندوب ويمسحه في صمت — ولأن
  // الصف بيتكتب بـ`synced:true` المزامنة التدريجية بعده مالاقيتش حاجة معلّقة،
  // فالتعديل بيضيع خالص («بعدّل وبيرجع زي ما كان»). الصف المعلّق أحدث من
  // السيرفر بحكم التعريف → نتخطّاه لحد ما يترفع.
  const pendingLocal = new Set((await getPendingFieldChecks(agentId)).map((e) => e.id));
  const isPending = (localId: unknown) => pendingLocal.has(localId as string);

  const toEntry = (r: unknown) => serverRowToEntry(r, agentId);

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
      // المحذوف يتشال خالص؛ المعلّق بيتعدّ (موجود عند المندوب) بس مايتكتبش فوقه.
      const keep = rows.filter((r) => !tombstoned.has(r.local_id));
      await saveFieldCheckEntries(keep.filter((r) => !isPending(r.local_id)).map(toEntry));
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
    let keptInBatch = 0;   // اللي المندوب المفروض يشوفه (بما فيه المعلّق محلياً)
    for (const p of pages) {
      if (p.error) { if (!firstError) firstError = p.error.message; continue; }
      for (const r of p.data ?? []) {
        if (tombstoned.has(r.local_id)) continue;   // اتمسح محلياً — مايرجعش
        keptInBatch++;
        if (isPending(r.local_id)) continue;         // تعديل محلي أحدث — مايتكتبش فوقه
        entries.push(toEntry(r));
      }
    }
    // معاملة واحدة للمجموعة كلها. لو فشلت (مساحة الجهاز مثلاً) بنكمّل باقي
    // المجموعات بدل ما الاسترجاع كله يقف — ومافيش سجل محلي بيتمسح في الحالتين.
    try {
      await saveFieldCheckEntries(entries);
      restored += keptInBatch;
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
    onProgress?.(restored, total);
  }

  return firstError ? { restored, error: firstError } : { restored };
}

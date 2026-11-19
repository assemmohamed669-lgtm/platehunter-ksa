/**
 * 📄 «شهايد النهارده» — جدول `cert_daily` على Supabase (السيرفر بس — مفتاح الخدمة).
 * صف لكل شهادة اترفعت (بيتمسح بعد أسبوع). مفيش أي بيانات شخصية — العربية والبنك والعقد بس.
 * الجدول في `docs/sql/cert-daily.sql`.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import type { CertDailyRow, PendingCert } from "./certDailyJob";
import type { CertFields } from "./certParse";
import type { DailyCertEntry } from "./certDaily";

/** الجدول القديم — الافتراضي في كل دالة. الشهايد الخاصة (🔒 `lib/certPrivate.ts`) بتبعت `cert_daily_private`. */
const MAIN = "cert_daily";

export async function insertNewCerts(rows: CertDailyRow[], table: string = MAIN): Promise<void> {
  const { error } = await supabaseAdmin.from(table).upsert(rows, { onConflict: "file_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/**
 * اللي لسه ماتقراش من `fromDay` لحد النهارده — الأحدث يوم الأول، فالنهارده دايماً قبل أي حاجة. وجوّه اليوم
 * **الأحدث `updated_at` الأول**: اللي لسه نازل (اتضاف دلوقتي) قبل اللي راجعة تتقري تاني (`updated_at` بتاعها
 * من قرايتها القديمة) — فإعادة القراية مابتأخرش شهايد النهارده الجديدة.
 */
export async function pendingCerts(fromDay: string, limit: number, table: string = MAIN): Promise<PendingCert[]> {
  const { data, error } = await supabaseAdmin
    .from(table).select("file_id, name, tries")
    .gte("day", fromDay).eq("parsed", false).lt("tries", 3)
    .order("day", { ascending: false }).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingCert[];
}

/**
 * أعمدة اتضافت بعدين ويمكن تكون لسه ماتشغّلتش على الداتابيز:
 *  · `cert_no` — `docs/sql/cert-daily-certno.sql`
 *  · `tenant`  — `docs/sql/cert-daily-tenant.sql` (اسم المستأجر، المالك ١٤ أكتوبر ٢٠٢٦)
 * لو ناقص، بنكمّل من غيره بدل ما نقف — فترتيب النشر مايكسرش دورة الشهايد.
 */
const NO_CERT_NO = /cert_no/;
const LATE_COLUMNS = ["cert_no", "tenant"] as const;

export async function saveParsedCert(fileId: string, f: CertFields | null, tries: number, done: boolean, table: string = MAIN): Promise<void> {
  const patch: Record<string, unknown> = { tries, parsed: done, updated_at: new Date().toISOString() };
  if (f) {
    Object.assign(patch, {
      plate: f.plate, plate_text: f.plateText, vin: f.vin, bank: f.bank, tenant: f.tenant, make: f.make,
      model: f.model, year: f.year, color: f.color, status: f.status, cert_date: f.certDate, cert_no: f.certNo,
    });
  }
  let { error } = await supabaseAdmin.from(table).update(patch).eq("file_id", fileId);
  // العمود الناقص اسمه بيبان في رسالة الغلط ⇒ نشيله ونعيد (مرة لكل عمود).
  for (const col of LATE_COLUMNS) {
    if (!error || !(col in patch) || !new RegExp(col).test(error.message)) continue;
    delete patch[col];
    ({ error } = await supabaseAdmin.from(table).update(patch).eq("file_id", fileId));
  }
  if (error) throw new Error(error.message);
}

/**
 * اللي اتقرت قبل ما يبقى فيه عمود «اسم المستأجر» (قيمته لسه null) ⇒ ترجع تتقري مرة واحدة عشان
 * الاسم يتملى. بعد القراية بيبقى "" أو الاسم ⇒ مابتتعادش.
 */
/**
 * 🔴 الشهايد اللي اتقرت **قبل** ما نصلّح قراية العربي (المالك ١٤ أكتوبر ٢٠٢٦):
 * خاناتها العربي اتكتبت فاضية وخلاص، و`tenant` بقى `''` مش `null` — فحارس
 * «المستأجر الناقص» مش بيشوفها. دي بترجّعها للقراية **مرة واحدة** (الشرط
 * `updated_at < beforeIso` بيمنع اللفّة الأبدية على شهادة مافيهاش بيانات فعلاً).
 */
export async function requeueStaleFieldsCerts(fromDay: string, beforeIso: string, table: string = MAIN): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table).update({ parsed: false, tries: 0 })
    .gte("day", fromDay).eq("parsed", true).lt("updated_at", beforeIso)
    .or("make.eq.,make.is.null");
  if (error) throw new Error(error.message);
}

export async function requeueMissingTenantCerts(fromDay: string, table: string = MAIN): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table).update({ parsed: false, tries: 0 })
    .gte("day", fromDay).eq("parsed", true).is("tenant", null);
  if (error) throw new Error(error.message);
}

/**
 * اللي اتقرت قبل ما يبقى فيه عمود «رقم العقد» (قيمته لسه null) ⇒ ترجع تتقري مرة واحدة عشان الرقم
 * يتملى. بعد القراية بيبقى "" أو الرقم ⇒ مابتتعادش. العمود لسه ماتضافش ⇒ بترمي ودورة السيرفر بتكمّل.
 */
export async function requeueMissingCertNoCerts(fromDay: string, table: string = MAIN): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table).update({ parsed: false, tries: 0 })
    .gte("day", fromDay).eq("parsed", true).is("cert_no", null);
  if (error) throw new Error(error.message);
}

/**
 * 📄 **كل** الشهايد («السجل» و«توثيق») اللي اتقرت قبل آخر تصليح للقارئ ⇒ ترجع تتقري مرة واحدة (المالك ١٩ نوفمبر
 * ٢٠٢٦: «كل البيانات صح 100%» — «السجل» من أوامر الرسم، و«توثيق» الرباطات والخانات وتاريخ الشهادة).
 * اللوحة القديمة بتفضل ظاهرة لحد ما القراية الجديدة تخلص (العرض مابيبصّش على `parsed`)، والجديد اللي لسه
 * نازل بيتقري قبلها (`pendingCerts` — الأحدث `updated_at` الأول).
 */
export async function requeueSijilGlyphCerts(fromDay: string, beforeIso: string, table: string = MAIN): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table).update({ parsed: false, tries: 0 })
    .gte("day", fromDay).eq("parsed", true).lt("updated_at", beforeIso);
  if (error) throw new Error(error.message);
}

/** اللي اتقرت قبل `beforeIso` ومالقيناش فيها لوحة ⇒ ترجع تتقري بالقارئ الجديد (مرة واحدة). */
export async function requeueNoPlateCerts(fromDay: string, beforeIso: string, table: string = MAIN): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table).update({ parsed: false, tries: 0 })
    .gte("day", fromDay).eq("parsed", true).eq("plate", "").lt("updated_at", beforeIso);
  if (error) throw new Error(error.message);
}

/** عيّنة من شهايد يوم اتقرت — اللي مالقيناش فيها لوحة بس، أو أي شهادة (`any`) — لمقياس الشكل. */
export async function sampleNoPlateCerts(day: string, limit: number, any = false): Promise<string[]> {
  let q = supabaseAdmin.from("cert_daily").select("file_id").eq("day", day).eq("parsed", true);
  if (!any) q = q.eq("plate", "");
  const { data, error } = await q.order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { file_id: string }[]).map((r) => r.file_id);
}

export async function cleanupCerts(beforeDay: string, table: string = MAIN): Promise<void> {
  await supabaseAdmin.from(table).delete().lt("day", beforeDay);
}

interface Row {
  file_id: string; name: string; created_at: string; parsed: boolean;
  plate: string; plate_text: string; vin: string; bank: string; make: string; model: string;
  year: string; color: string; status: string; cert_date: string; cert_no?: string | null;
  tenant?: string | null;
}

/** كل شهايد اليوم (صفحات ١٠٠٠ — حد الـAPI). */
export async function readDayCerts(day: string, table: string = MAIN): Promise<{ total: number; parsed: number; entries: DailyCertEntry[] }> {
  const rows: Row[] = [];
  const COLS = "file_id, name, created_at, parsed, plate, plate_text, vin, bank, make, model, year, color, status, cert_date";
  // الأعمدة المتأخرة بتتشال واحد واحد لو الداتابيز لسه ماخدتهاش — مانقفش عشان عمود.
  let cols = `${COLS}, cert_no, tenant`;
  for (let from = 0; from < 50_000; from += 1000) {
    const page = () => supabaseAdmin.from(table).select(cols)
      .eq("day", day).order("created_at", { ascending: true }).range(from, from + 999);
    let { data, error } = await page();
    if (error && cols.includes("tenant") && /tenant/.test(error.message)) {
      cols = `${COLS}, cert_no`; ({ data, error } = await page());
    }
    if (error && cols !== COLS && NO_CERT_NO.test(error.message)) { cols = COLS; ({ data, error } = await page()); }
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return {
    total: rows.length,
    parsed: rows.filter((r) => r.parsed).length,
    entries: rows.filter((r) => r.plate || r.vin).map((r) => ({
      fileId: r.file_id, name: r.name, createdAt: r.created_at, plate: r.plate, plateText: r.plate_text, vin: r.vin,
      bank: r.bank, tenant: r.tenant ?? "", make: r.make, model: r.model, year: r.year, color: r.color,
      status: r.status, certDate: r.cert_date, certNo: r.cert_no ?? "",
    })),
  };
}

/**
 * 🔎 الشهايد اللي **اتقرت من جوّه الملف** باللوحة/الشاص — للبحث بالرقم (المالك ١٩ نوفمبر ٢٠٢٦: «رعب4925 ببحث عليها
 * … مش موجوده»). أغلب الملفات اسمها رقم عقد («REPO-301-…») فالبحث بالاسم في درايف مايلاقيهاش.
 * `plate` = المفتاح المطبّع بالظبط · `digits` = آخر اللوحة بالأرقام دي · `vin` = الشاص. أي غلط ⇒ فاضي.
 */
export async function findParsedCerts(
  query: { plate?: string; digits?: string; vin?: string },
  table: string = MAIN,
): Promise<{ id: string; name: string }[]> {
  try {
    let q = supabaseAdmin.from(table).select("file_id, name, created_at");
    if (query.plate) q = q.eq("plate", query.plate);
    else if (query.digits) q = q.like("plate", `%${query.digits}`);
    else if (query.vin) q = q.eq("vin", query.vin);
    else return [];
    const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) return [];
    return ((data ?? []) as { file_id: string; name: string }[]).map((r) => ({ id: r.file_id, name: r.name }));
  } catch {
    return [];
  }
}

/**
 * 📄 نفس اللي فوق بس **لكتير لوحات مرة واحدة** — لعمود «شهايد» في نتايج الفرز. `keys` = مفاتيح مطبّعة.
 * بيرجّع المفتاح ⇐ شهاداته (اللي ملهاش مش في الخريطة). أي غلط ⇒ خريطة فاضية (والعمود بيكمّل بدرايف زي الأول).
 */
export async function findParsedByPlates(keys: readonly string[], table: string = MAIN): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  const uniq = [...new Set(keys.filter(Boolean))];
  try {
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await supabaseAdmin.from(table).select("file_id, name, plate, created_at")
        .in("plate", uniq.slice(i, i + 200)).order("created_at", { ascending: false }).limit(2000);
      if (error) return out;
      for (const r of (data ?? []) as { file_id: string; name: string; plate: string }[]) {
        const list = out.get(r.plate) ?? [];
        if (!list.some((x) => x.id === r.file_id)) list.push({ id: r.file_id, name: r.name });
        out.set(r.plate, list);
      }
    }
  } catch { /* فاضية */ }
  return out;
}

/** العدد بس (للجملة الخضرا — من غير ما نجيب الشهايد كلها). */
export async function countDayCerts(day: string, table: string = MAIN): Promise<{ total: number; parsed: number }> {
  const all = await supabaseAdmin.from(table).select("file_id", { count: "exact", head: true }).eq("day", day);
  if (all.error) throw Object.assign(new Error(all.error.message), { code: all.error.code });
  const done = await supabaseAdmin.from(table).select("file_id", { count: "exact", head: true }).eq("day", day).eq("parsed", true);
  if (done.error) throw Object.assign(new Error(done.error.message), { code: done.error.code });
  return { total: all.count ?? 0, parsed: done.count ?? 0 };
}

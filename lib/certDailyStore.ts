/**
 * 📄 «شهايد النهارده» — جدول `cert_daily` على Supabase (السيرفر بس — مفتاح الخدمة).
 * صف لكل شهادة اترفعت (بيتمسح بعد أسبوع). مفيش أي بيانات شخصية — العربية والبنك والعقد بس.
 * الجدول في `docs/sql/cert-daily.sql`.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import type { CertDailyRow, PendingCert } from "./certDailyJob";
import type { CertFields } from "./certParse";
import type { DailyCertEntry } from "./certDaily";

export async function insertNewCerts(rows: CertDailyRow[]): Promise<void> {
  const { error } = await supabaseAdmin.from("cert_daily").upsert(rows, { onConflict: "file_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** اللي لسه ماتقراش من `fromDay` لحد النهارده — الأحدث يوم الأول، فالنهارده دايماً قبل أي حاجة. */
export async function pendingCerts(fromDay: string, limit: number): Promise<PendingCert[]> {
  const { data, error } = await supabaseAdmin
    .from("cert_daily").select("file_id, name, tries")
    .gte("day", fromDay).eq("parsed", false).lt("tries", 3)
    .order("day", { ascending: false }).order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingCert[];
}

export async function saveParsedCert(fileId: string, f: CertFields | null, tries: number, done: boolean): Promise<void> {
  const patch: Record<string, unknown> = { tries, parsed: done, updated_at: new Date().toISOString() };
  if (f) {
    Object.assign(patch, {
      plate: f.plate, plate_text: f.plateText, vin: f.vin, bank: f.bank, make: f.make, model: f.model,
      year: f.year, color: f.color, status: f.status, cert_date: f.certDate,
    });
  }
  const { error } = await supabaseAdmin.from("cert_daily").update(patch).eq("file_id", fileId);
  if (error) throw new Error(error.message);
}

/** عيّنة من شهايد يوم اتقرت ومالقيناش فيها لوحة (لمقياس الشكل). */
export async function sampleNoPlateCerts(day: string, limit: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("cert_daily").select("file_id")
    .eq("day", day).eq("parsed", true).eq("plate", "").order("created_at", { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { file_id: string }[]).map((r) => r.file_id);
}

export async function cleanupCerts(beforeDay: string): Promise<void> {
  await supabaseAdmin.from("cert_daily").delete().lt("day", beforeDay);
}

interface Row {
  file_id: string; name: string; created_at: string; parsed: boolean;
  plate: string; plate_text: string; vin: string; bank: string; make: string; model: string;
  year: string; color: string; status: string; cert_date: string;
}

/** كل شهايد اليوم (صفحات ١٠٠٠ — حد الـAPI). */
export async function readDayCerts(day: string): Promise<{ total: number; parsed: number; entries: DailyCertEntry[] }> {
  const rows: Row[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("cert_daily")
      .select("file_id, name, created_at, parsed, plate, plate_text, vin, bank, make, model, year, color, status, cert_date")
      .eq("day", day).order("created_at", { ascending: true }).range(from, from + 999);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return {
    total: rows.length,
    parsed: rows.filter((r) => r.parsed).length,
    entries: rows.filter((r) => r.plate || r.vin).map((r) => ({
      fileId: r.file_id, name: r.name, createdAt: r.created_at, plate: r.plate, plateText: r.plate_text, vin: r.vin,
      bank: r.bank, make: r.make, model: r.model, year: r.year, color: r.color, status: r.status, certDate: r.cert_date,
    })),
  };
}

/** العدد بس (للجملة الخضرا — من غير ما نجيب الشهايد كلها). */
export async function countDayCerts(day: string): Promise<{ total: number; parsed: number }> {
  const all = await supabaseAdmin.from("cert_daily").select("file_id", { count: "exact", head: true }).eq("day", day);
  if (all.error) throw Object.assign(new Error(all.error.message), { code: all.error.code });
  const done = await supabaseAdmin.from("cert_daily").select("file_id", { count: "exact", head: true }).eq("day", day).eq("parsed", true);
  if (done.error) throw Object.assign(new Error(done.error.message), { code: done.error.code });
  return { total: all.count ?? 0, parsed: done.count ?? 0 };
}

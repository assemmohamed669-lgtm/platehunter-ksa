/**
 * مزامنة ذاكرة الرفع مع Supabase — عشان الأدمنز والأجهزة كلهم يشوفوا نفس
 * الشيتات اللي اترفعت. زميلك رفع الشيت من تليفونه؟ هتعرف من تليفونك.
 *
 * منفصل عن `uploadHistory` بقصد: المنطق النقي (البصمة، المطابقة، الدمج)
 * لازم يفضل بلا اعتماد على السيرفر عشان يتغطّى باختبارات من غير mocks،
 * والصفحة تفضل شغالة من غير نت.
 */

import { supabase } from "@/lib/supabaseClient";
import {
  getUploadHistory, recordUpload, mergeHistories, type UploadRecord,
} from "@/lib/uploadHistory";

/** أقصى عدد لوحات بنخزّنها للسجل الواحد — شيت التفريغ عادةً مئات. */
const MAX_STORED_PLATES = 20_000;

const TABLE = "data_uploads";

function toRow(rec: UploadRecord, userId: string, name: string) {
  return {
    fingerprint: rec.fingerprint,
    plates: rec.plates.slice(0, MAX_STORED_PLATES),
    file_name: rec.fileName,
    row_count: rec.rowCount,
    uploaded_at: rec.uploadedAt,
    data_file_name: rec.dataFileName,
    inserted_after: rec.insertedAfter,
    uploaded_by: userId,
    uploaded_by_name: name,
  };
}

function fromRow(r: Record<string, unknown>): UploadRecord {
  return {
    fingerprint: String(r.fingerprint ?? ""),
    plates: Array.isArray(r.plates) ? (r.plates as string[]) : [],
    fileName: String(r.file_name ?? ""),
    rowCount: Number(r.row_count ?? 0),
    uploadedAt: String(r.uploaded_at ?? ""),
    dataFileName: String(r.data_file_name ?? ""),
    insertedAfter: String(r.inserted_after ?? ""),
    uploadedByName: r.uploaded_by_name ? String(r.uploaded_by_name) : undefined,
  };
}

/**
 * بيرفع السجل للسحابة عشان باقي الأدمنز والأجهزة يشوفوه.
 * بيفشل بهدوء لو النت قاطع أو الجدول لسه مااتعملش — الذاكرة المحلية
 * بتفضل شغالة، وأول ما النت يرجع المزامنة بتلحق الباقي.
 */
export async function pushUpload(rec: UploadRecord): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: prof } = await supabase.from("profiles")
      .select("username, email").eq("id", data.user.id).single();
    const name = String(prof?.username ?? prof?.email ?? "").trim();
    // «تجاهل المكرر»: لو الشيت مسجّل قبل كده — حتى لو من زميل تاني —
    // مابنحاولش نعدّل سجله (RLS هترفض)، وأول تاريخ رفع هو اللي يفضل.
    await supabase.from(TABLE)
      .upsert(toRow(rec, data.user.id, name), { onConflict: "fingerprint", ignoreDuplicates: true });
  } catch { /* السحابة مش متاحة — المحلي كفاية دلوقتي */ }
}

/**
 * بيجيب ذاكرة الرفع المشتركة ويدمجها مع اللي على الجهاز، وبيحفظ الناتج
 * محلياً عشان يشتغل من غير نت المرة الجاية.
 */
export async function syncUploadHistory(limit = 500): Promise<UploadRecord[]> {
  const local = await getUploadHistory().catch(() => [] as UploadRecord[]);
  let remote: UploadRecord[] = [];
  try {
    const { data, error } = await supabase.from(TABLE)
      .select("*").order("uploaded_at", { ascending: false }).limit(limit);
    if (!error && data) remote = (data as Record<string, unknown>[]).map(fromRow);
  } catch { /* أوفلاين — بنكمّل باللي على الجهاز */ }

  const merged = mergeHistories(local, remote);
  // نخزّن اللي جه من السحابة محلياً عشان يشتغل أوفلاين المرة الجاية
  for (const rec of merged) {
    if (!local.some((l) => l.fingerprint === rec.fingerprint && l.uploadedAt === rec.uploadedAt)) {
      await recordUpload(rec).catch(() => {});
    }
  }
  return merged;
}

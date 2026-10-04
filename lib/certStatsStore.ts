/**
 * 📊 إحصائيات الشهايد — التخزين على Supabase (السيرفر بس — مفتاح الخدمة).
 *
 *  · `cert_stats_state` — صف واحد (id=1): حالة العدّ + آخر نتيجة + قفل (`lock_until`) عشان
 *    دورتين مايشتغلوش مع بعض. القفل بيتاخد بتحديث مشروط واحد (يا ياخده يا لأ).
 *  · `cert_stats_plates` — كل لوحة مرة واحدة · `cert_stats_plate_uploaders` — كل لوحة مع كل
 *    حساب رفعها. الاتنين متعلّمين برقم العدّة (`pass`) — عدد الصفوف = عدد اللوحات المختلفة.
 * الجداول في `docs/sql/cert-stats.sql`.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import type { JobState, PlatesDb } from "./certStatsJob";

/** أطول من أطول دورة (السيرفر بيقفل الدورة بعد دقيقتين) — لو دورة ماتت القفل بيفك لوحده. */
const LOCK_MS = 150_000;

export async function lockState(): Promise<JobState | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("cert_stats_state")
    .update({ lock_until: new Date(Date.now() + LOCK_MS).toISOString() })
    .eq("id", 1)
    .or(`lock_until.is.null,lock_until.lt."${nowIso}"`)
    .select("state");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return ((data[0] as { state?: JobState | null }).state ?? {}) as JobState;
}

export async function saveState(st: JobState): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cert_stats_state")
    .update({ state: st, lock_until: null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function releaseState(): Promise<void> {
  await supabaseAdmin.from("cert_stats_state").update({ lock_until: null }).eq("id", 1);
}

export const platesDb: PlatesDb = {
  async upsert(pass, pairs) {
    if (!pairs.length) return;
    const plates = Array.from(new Set(pairs.map(([k]) => k)), (k) => ({ k, pass }));
    const a = await supabaseAdmin.from("cert_stats_plates").upsert(plates, { onConflict: "k" });
    if (a.error) throw new Error(a.error.message);
    const b = await supabaseAdmin
      .from("cert_stats_plate_uploaders")
      .upsert(pairs.map(([k, u]) => ({ k, u, pass })), { onConflict: "k,u" });
    if (b.error) throw new Error(b.error.message);
  },
  async count(pass) {
    const { count, error } = await supabaseAdmin
      .from("cert_stats_plates").select("k", { count: "exact", head: true }).eq("pass", pass);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async countBy(pass, u) {
    const { count, error } = await supabaseAdmin
      .from("cert_stats_plate_uploaders").select("k", { count: "exact", head: true }).eq("pass", pass).eq("u", u);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async cleanup(pass) {
    await supabaseAdmin.from("cert_stats_plates").delete().lt("pass", pass);
    await supabaseAdmin.from("cert_stats_plate_uploaders").delete().lt("pass", pass);
  },
};

/**
 * مزامنة سحابية لسجلات الشاصي (شيت رقم الشاص) — نفس فكرة syncFieldCheck بالظبط.
 * بترفع ChassisRecord المحلية لجدول Supabase `chassis_records` (مربوط بـagent_id)
 * وبتسترجعها على أي جهاز. الاسترجاع **بترقيم صفحات** (Supabase بيحدّ الاستعلام
 * بـ1000 صف) عشان مانكررش باج اللوحات. نص فقط — من غير صور/صوت.
 */
import { supabase } from "./supabaseClient";
import { getChassisRecords, mergeChassisRecords, type ChassisRecord } from "./chassisRecords";

async function upsertChassis(uid: string, r: ChassisRecord): Promise<string | null> {
  const { error } = await supabase.from("chassis_records").upsert(
    {
      local_id: r.id,
      agent_id: uid,
      chassis: r.chassis,
      vehicle_type: r.vehicleType ?? null,
      notes: r.notes ?? null,
      region: r.region ?? null,
      found: !!r.found,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      maps_link: r.mapsLink ?? null,
      extra: r.row ?? {},
      checked_at: r.checkedAt,
    },
    { onConflict: "local_id" }
  );
  return error ? error.message : null;
}

async function requireSession(agentId: string): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid || uid !== agentId) return null;
  return uid;
}

/** يرفع سجل شاص واحد فوراً (للجديد على طول) — fire-and-forget، أي فشل يتزامن لاحقاً. */
export async function pushOneChassis(agentId: string | null, r: ChassisRecord): Promise<void> {
  try {
    if (!agentId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const uid = await requireSession(agentId);
    if (!uid) return;
    await upsertChassis(uid, r);
  } catch { /* هيتزامن في الرفع الشامل عند فتح الصفحة */ }
}

/** يرفع كل سجلات الشاص المحلية للسيرفر (upsert آمن للتكرار). */
export async function pushChassisRecords(
  agentId: string
): Promise<{ synced: number; total: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, total: 0, error: "الجهاز أوفلاين" };
  }
  const uid = await requireSession(agentId);
  if (!uid) return { synced: 0, total: 0, error: "مفيش جلسة صالحة" };

  const all = getChassisRecords();
  let synced = 0;
  let firstError: string | undefined;
  for (const r of all) {
    const err = await upsertChassis(uid, r);
    if (err) { if (!firstError) firstError = err; }
    else synced++;
  }
  return { synced, total: all.length, error: firstError };
}

/** يسترجع سجلات الشاص من السيرفر INTO localStorage — على دفعات (1000/دفعة). */
export async function restoreChassisRecords(
  agentId: string
): Promise<{ restored: number; error?: string }> {
  const PAGE = 1000;
  let from = 0;
  const incoming: ChassisRecord[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("chassis_records")
      .select("*")
      .eq("agent_id", agentId)
      .order("checked_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { restored: 0, error: error.message };

    const rows = data ?? [];
    for (const r of rows) {
      incoming.push({
        id: r.local_id,
        chassis: r.chassis,
        vehicleType: r.vehicle_type ?? undefined,
        notes: r.notes ?? undefined,
        region: r.region ?? undefined,
        row: (r.extra as Record<string, string>) ?? undefined,
        found: !!r.found,
        lat: r.lat ?? undefined,
        lng: r.lng ?? undefined,
        mapsLink: r.maps_link ?? undefined,
        checkedAt: r.checked_at,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  mergeChassisRecords(incoming);
  return { restored: incoming.length };
}

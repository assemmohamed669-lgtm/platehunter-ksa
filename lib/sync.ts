/**
 * Cloud sync for PlateHunter KSA.
 * Pushes pending local recordings (IndexedDB) to Supabase when the
 * device is online. Called automatically after each new recording and
 * when the browser regains connectivity.
 */

import { supabase } from "./supabaseClient";
import { getPendingSync, getAllRecordings, saveRecording, markSynced, type RecordingEntry } from "./idb";

async function syncOne(entry: RecordingEntry): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("recordings").upsert(
    {
      local_id: entry.localId,
      agent_id: entry.agentId,
      plate: entry.plate,
      vehicle_type: entry.vehicleType ?? null,
      lat: entry.lat ?? null,
      lng: entry.lng ?? null,
      street: entry.street ?? null,
      district: entry.district ?? null,
      recorded_at: entry.recordedAt,
      maps_link: entry.mapsLink ?? null,
    },
    { onConflict: "local_id" }
  );

  if (error) {
    console.warn("Sync error for", entry.localId, error.message);
    // Surface the fullest signal we have (message + code + details/hint).
    const parts = [error.message, (error as any).code, (error as any).details, (error as any).hint]
      .filter(Boolean);
    return { ok: false, error: parts.join(" · ") };
  }

  await markSynced(entry.localId);
  return { ok: true };
}

/**
 * Sync all pending recordings for the given agent to Supabase.
 * Safe to call multiple times — skips already-synced records.
 */
export async function syncPending(agentId: string): Promise<number> {
  const { synced } = await syncPendingDetailed(agentId);
  return synced;
}

/**
 * Same as syncPending but returns diagnostics — used by the manual «زامن دلوقتي»
 * button so the delegate (and we) can see WHY a sync fails instead of it dying
 * silently.
 */
export async function syncPendingDetailed(
  agentId: string
): Promise<{ synced: number; pending: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, pending: 0, error: "الجهاز أوفلاين (navigator.onLine=false)" };
  }

  // Confirm the client is actually authenticated and the session uid matches
  // the agent_id we're about to write (RLS requires auth.uid() = agent_id).
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { synced: 0, pending: 0, error: "مفيش جلسة مسجّلة (auth.uid فاضي)" };
  if (uid !== agentId) {
    return { synced: 0, pending: 0, error: `عدم تطابق: auth.uid=${uid} ≠ agent_id=${agentId}` };
  }

  const pending = await getPendingSync(agentId);
  let synced = 0;
  let firstError: string | undefined;

  for (const entry of pending) {
    const { ok, error } = await syncOne(entry);
    if (ok) synced++;
    else if (!firstError) firstError = error;
  }

  return { synced, pending: pending.length, error: firstError };
}

/**
 * Force-upload EVERY local recording for this agent, ignoring the local
 * `synced` flag. Used when the flag got out of sync with the server (rows
 * marked synced locally but the server row is missing). Re-stamps agent_id
 * via syncOne's upsert. Returns diagnostics.
 */
export async function forceSyncAll(
  agentId: string
): Promise<{ synced: number; total: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, total: 0, error: "الجهاز أوفلاين (navigator.onLine=false)" };
  }
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { synced: 0, total: 0, error: "مفيش جلسة مسجّلة (auth.uid فاضي)" };
  if (uid !== agentId) {
    return { synced: 0, total: 0, error: `عدم تطابق: auth.uid=${uid} ≠ agent_id=${agentId}` };
  }

  const all = await getAllRecordings(agentId);
  let synced = 0;
  let firstError: string | undefined;
  for (const entry of all) {
    const { ok, error } = await syncOne(entry);
    if (ok) synced++;
    else if (!firstError) firstError = error;
  }
  return { synced, total: all.length, error: firstError };
}

/**
 * Restore this agent's recordings FROM the server INTO local IndexedDB.
 * Used on a fresh device / after clearing cache so the delegate gets their
 * data back just by logging in. Merges (upsert by localId); marks them synced.
 */
export async function restoreRecordings(
  agentId: string
): Promise<{ restored: number; error?: string }> {
  const { data, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("agent_id", agentId);
  if (error) return { restored: 0, error: error.message };

  // الاسترجاع بيعمل put كامل فوق السجل المحلي — والسيرفر مايعرفش كل الحقول
  // (الملاحظات/الصوت/عدم-اليقين/اسم المسجّل/isManual مش بتتزامن). من غير دمج،
  // كل فتح للتطبيق كان بيمسح الملاحظات والصوت من كل سجل متزامن. نحافظ على
  // الحقول المحلية-فقط من النسخة الموجودة، والسيرفر يكسب بس فيما يعرفه.
  const existing = new Map<string, RecordingEntry>();
  for (const e of await getAllRecordings(agentId)) existing.set(e.localId, e);

  let restored = 0;
  for (const r of data ?? []) {
    const prev = existing.get(r.local_id);
    const entry: RecordingEntry = {
      localId: r.local_id,
      agentId: r.agent_id,
      plate: r.plate,
      vehicleType: r.vehicle_type ?? prev?.vehicleType ?? undefined,
      lat: r.lat ?? prev?.lat ?? undefined,
      lng: r.lng ?? prev?.lng ?? undefined,
      street: r.street ?? prev?.street ?? undefined,
      district: r.district ?? prev?.district ?? undefined,
      recordedAt: r.recorded_at,
      mapsLink: r.maps_link ?? prev?.mapsLink ?? undefined,
      // حقول محلية-فقط — السيرفر مايشيلهاش، فبنحافظ عليها من النسخة المحلية:
      notes: prev?.notes,
      uncertain: prev?.uncertain,
      originalPlate: prev?.originalPlate,
      rawLetterSource: prev?.rawLetterSource,
      recorderName: prev?.recorderName,
      audioBlobBase64: prev?.audioBlobBase64,
      audioMimeType: prev?.audioMimeType,
      isManual: (r as { is_manual?: boolean }).is_manual ?? prev?.isManual,
      synced: true,
    };
    await saveRecording(entry);
    restored++;
  }
  return { restored };
}

/**
 * Register a window listener that triggers sync whenever the app
 * regains internet connectivity. Call once on app mount.
 */
export function registerOnlineSync(agentId: string) {
  if (typeof window === "undefined") return;

  const handler = () => syncPending(agentId);
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

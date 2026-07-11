/**
 * Cloud sync for PlateHunter KSA.
 * Pushes pending local recordings (IndexedDB) to Supabase when the
 * device is online. Called automatically after each new recording and
 * when the browser regains connectivity.
 */

import { supabase } from "./supabaseClient";
import { getPendingSync, markSynced, type RecordingEntry } from "./idb";

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
 * Register a window listener that triggers sync whenever the app
 * regains internet connectivity. Call once on app mount.
 */
export function registerOnlineSync(agentId: string) {
  if (typeof window === "undefined") return;

  const handler = () => syncPending(agentId);
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

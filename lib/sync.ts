/**
 * Cloud sync for PlateHunter KSA.
 * Pushes pending local recordings (IndexedDB) to Supabase when the
 * device is online. Called automatically after each new recording and
 * when the browser regains connectivity.
 */

import { supabase } from "./supabaseClient";
import { getPendingSync, markSynced, type RecordingEntry } from "./idb";

async function syncOne(entry: RecordingEntry): Promise<boolean> {
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
    return false;
  }

  await markSynced(entry.localId);
  return true;
}

/**
 * Sync all pending recordings for the given agent to Supabase.
 * Safe to call multiple times — skips already-synced records.
 */
export async function syncPending(agentId: string): Promise<number> {
  if (!navigator.onLine) return 0;

  const pending = await getPendingSync(agentId);
  let synced = 0;

  for (const entry of pending) {
    const ok = await syncOne(entry);
    if (ok) synced++;
  }

  return synced;
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

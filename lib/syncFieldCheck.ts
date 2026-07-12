/**
 * Cloud sync for the field-check sheet (شيت التسجيلات) — the plates confirmed
 * in the التشييك page (camera / manual / voice). Pushes local FieldCheckEntry
 * rows to Supabase and restores them back on a fresh device. Text only — the
 * dynamic reference columns ride along in a JSONB `extra` column; no images,
 * no audio.
 */
import { supabase } from "./supabaseClient";
import { getAllFieldCheckEntries, saveFieldCheckEntry, type FieldCheckEntry } from "./idb";

async function requireSession(agentId: string): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
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
    if (error) { if (!firstError) firstError = [error.message, (error as any).code].filter(Boolean).join(" · "); }
    else synced++;
  }
  return { synced, total: all.length, error: firstError };
}

/** Restore this agent's field-check sheet FROM the server INTO IndexedDB. */
export async function restoreFieldChecks(
  agentId: string
): Promise<{ restored: number; error?: string }> {
  const { data, error } = await supabase
    .from("field_checks")
    .select("*")
    .eq("agent_id", agentId);
  if (error) return { restored: 0, error: error.message };

  let restored = 0;
  for (const r of data ?? []) {
    const entry: FieldCheckEntry = {
      id: r.local_id,
      agentId,
      plate: r.plate,
      row: (r.extra as Record<string, string>) ?? {},
      method: r.method ?? "",
      lat: r.lat ?? undefined,
      lng: r.lng ?? undefined,
      mapsLink: r.maps_link ?? undefined,
      checkedAt: r.checked_at,
    };
    await saveFieldCheckEntry(entry);
    restored++;
  }
  return { restored };
}

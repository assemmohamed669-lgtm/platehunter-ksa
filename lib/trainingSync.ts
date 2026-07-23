/**
 * مزامنة داتا التدريب المحلية لـ Supabase (خلفية، بلا زر):
 *  • ترفع صوت الجلسات لباكت "training-audio".
 *  • تدرج صفوف العيّنات في training_samples (مع مسار الصوت).
 *  • تعلّم المحلي «متزامن» عشان مايترفعش تاني.
 * آمنة للفشل (أوفلاين → تفضل تحاول بعدين). supabase lazy import.
 */
import {
  getUnsyncedSamples, getTrainingSession, saveTrainingSample, saveTrainingSession,
  type TrainingSample,
} from "./trainingStore";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function syncTrainingData(): Promise<{ uploaded: number; error?: string }> {
  try {
    const samples = await getUnsyncedSamples();
    if (samples.length === 0) return { uploaded: 0 };
    const { supabase } = await import("./supabaseClient");

    // ارفع صوت كل جلسة مرة واحدة، واحفظ مسارها.
    const sessionPath = new Map<string, string>();
    const uniqueSessions = [...new Set(samples.map((s) => s.sessionId))];
    for (const sid of uniqueSessions) {
      const sess = await getTrainingSession(sid);
      if (!sess) continue;
      const ext = (sess.mimeType.split("/")[1] || "webm").split(";")[0];
      const path = `${sess.agentId}/${sid}.${ext}`;
      if (!sess.synced) {
        const bytes = base64ToBytes(sess.audioBase64);
        const { error } = await supabase.storage.from("training-audio")
          .upload(path, bytes, { contentType: sess.mimeType, upsert: true });
        if (error) return { uploaded: 0, error: error.message };
        await saveTrainingSession({ ...sess, synced: true });
      }
      sessionPath.set(sid, path);
    }

    // أدرج صفوف العيّنات.
    let uploaded = 0;
    for (const s of samples) {
      const row = {
        id: s.id, session_id: s.sessionId, plate: s.plate, tier: s.tier, reason: s.reason,
        start_ms: Math.round(s.startMs), end_ms: Math.round(s.endMs),
        audio_path: sessionPath.get(s.sessionId) ?? null, agent_id: s.agentId, created_at: s.createdAt,
      };
      const { error } = await supabase.from("training_samples").upsert(row, { onConflict: "id" });
      if (error) return { uploaded, error: error.message };
      await saveTrainingSample({ ...(s as TrainingSample), synced: true });
      uploaded++;
    }
    return { uploaded };
  } catch (e) {
    return { uploaded: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * مزامنة داتا التدريب المحلية لـ Supabase (خلفية، بلا زر):
 *  • ترفع صوت الجلسات في جدول training_audio (base64) — عن طريق REST API مش
 *    Storage، لأن رفع Storage بيفشل على WebView الموبايل («Failed to fetch»).
 *  • تدرج صفوف العيّنات في training_samples.
 *  • تعلّم المحلي «متزامن» عشان مايترفعش تاني.
 * آمنة للفشل (أوفلاين → تفضل تحاول بعدين). supabase lazy import.
 */
import {
  getUnsyncedSamples, getTrainingSession, saveTrainingSample, saveTrainingSession,
  type TrainingSample,
} from "./trainingStore";

export async function syncTrainingData(): Promise<{ uploaded: number; error?: string }> {
  try {
    const samples = await getUnsyncedSamples();
    if (samples.length === 0) return { uploaded: 0 };
    const { supabase } = await import("./supabaseClient");

    // ارفع صوت كل جلسة مرة واحدة في جدول training_audio (base64) عبر REST. **مهم:**
    // لو الصوت فشل، ماننهارش المزامنة — نكمّل نرفع اللوحات، والجلسة تفضل غير متزامنة
    // فالصوت يُعاد رفعه بعدين. audioOk = الجلسات اللي صوتها اترفع (أو مفيش صوت).
    const audioOk = new Set<string>();
    let audioError: string | undefined;
    const uniqueSessions = [...new Set(samples.map((s) => s.sessionId))];
    for (const sid of uniqueSessions) {
      const sess = await getTrainingSession(sid);
      if (!sess) { audioOk.add(sid); continue; }   // مفيش صوت محفوظ — نسمح باللوحة تترفع
      if (sess.synced) { audioOk.add(sid); continue; }
      try {
        const { error } = await supabase.from("training_audio").upsert({
          session_id: sid, agent_id: sess.agentId || null,
          audio_base64: sess.audioBase64, mime_type: sess.mimeType, created_at: sess.createdAt,
        }, { onConflict: "session_id" });
        if (error) { audioError = error.message; continue; }
        await saveTrainingSession({ ...sess, synced: true });
        audioOk.add(sid);
      } catch (e) {
        audioError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }

    // أدرج صفوف العيّنات (بتترفع حتى لو الصوت فشل).
    let uploaded = 0;
    for (const s of samples) {
      const row = {
        id: s.id, session_id: s.sessionId, plate: s.plate, tier: s.tier, reason: s.reason,
        start_ms: Math.round(s.startMs), end_ms: Math.round(s.endMs),
        audio_path: audioOk.has(s.sessionId) ? s.sessionId : null, agent_id: s.agentId, created_at: s.createdAt,
      };
      const { error } = await supabase.from("training_samples").upsert(row, { onConflict: "id" });
      if (error) return { uploaded, error: error.message };
      // العيّنة تتعلّم «مرفوعة» بس لو صوتها اترفع كمان — عشان إعادة المزامنة تكمّل
      // ترفع الصوت لو لسه فاشل.
      if (audioOk.has(s.sessionId) || !s.sessionId) {
        await saveTrainingSample({ ...(s as TrainingSample), synced: true });
      }
      uploaded++;
    }
    return { uploaded, error: audioError };
  } catch (e) {
    return { uploaded: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

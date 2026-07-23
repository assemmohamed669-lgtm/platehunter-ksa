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

    // ارفع صوت كل جلسة مرة واحدة، واحفظ مسارها. **مهم:** لو رفع الصوت فشل (مثلاً
    // صلاحية Storage)، ماننهارش المزامنة كلها — نكمّل نرفع اللوحات (اللابيل) على
    // الأقل (audio_path=null)، ونبلّغ الخطأ في الآخر. الصوت يُعاد رفعه لما تتظبط
    // الصلاحية (لأن الجلسة تفضل synced=false).
    const sessionPath = new Map<string, string>();
    let audioError: string | undefined;
    const uniqueSessions = [...new Set(samples.map((s) => s.sessionId))];
    for (const sid of uniqueSessions) {
      const sess = await getTrainingSession(sid);
      if (!sess) continue;
      const ext = (sess.mimeType.split("/")[1] || "webm").split(";")[0];
      const path = `${sess.agentId}/${sid}.${ext}`;
      if (!sess.synced) {
        // معزول بالكامل: أي فشل (خطأ API أو استثناء شبكة «Failed to fetch») يتخطّى
        // الصوت بس ومايوقفش رفع اللوحات. الصوت يُعاد رفعه بعدين (الجلسة تفضل غير
        // متزامنة).
        try {
          const bytes = base64ToBytes(sess.audioBase64);
          const { error } = await supabase.storage.from("training-audio")
            .upload(path, bytes, { contentType: sess.mimeType, upsert: true });
          if (error) { audioError = error.message; continue; }
          await saveTrainingSession({ ...sess, synced: true });
        } catch (e) {
          audioError = e instanceof Error ? e.message : String(e);
          continue;
        }
      }
      sessionPath.set(sid, path);
    }

    // أدرج صفوف العيّنات (بتترفع حتى لو الصوت فشل — audio_path هيبقى null وقتها).
    let uploaded = 0;
    for (const s of samples) {
      const row = {
        id: s.id, session_id: s.sessionId, plate: s.plate, tier: s.tier, reason: s.reason,
        start_ms: Math.round(s.startMs), end_ms: Math.round(s.endMs),
        audio_path: sessionPath.get(s.sessionId) ?? null, agent_id: s.agentId, created_at: s.createdAt,
      };
      const { error } = await supabase.from("training_samples").upsert(row, { onConflict: "id" });
      if (error) return { uploaded, error: error.message };
      // العيّنة اتعلّمت مرفوعة بس لو صوتها اترفع كمان (أو مفيش صوت) — عشان لو الصوت
      // لسه فاشل، إعادة المزامنة بعدين تكمّل ترفع الصوت.
      if (sessionPath.has(s.sessionId) || !s.sessionId) {
        await saveTrainingSample({ ...(s as TrainingSample), synced: true });
      }
      uploaded++;
    }
    return { uploaded, error: audioError };
  } catch (e) {
    return { uploaded: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

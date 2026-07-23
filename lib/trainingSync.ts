/**
 * مزامنة داتا التدريب المحلية لـ Supabase (خلفية، بلا زر):
 *  • ترفع صوت الجلسات في جدول training_audio (base64) — عن طريق REST/RPC مش
 *    Storage، لأن رفع Storage بيفشل على WebView الموبايل («Failed to fetch»).
 *  • تدرج صفوف العيّنات في training_samples.
 *  • تعلّم المحلي «متزامن» عشان مايترفعش تاني.
 * الرفع بيتم عبر دوال security definer (بتتخطّى RLS، زي set_learning_enabled).
 * آمنة للفشل (أوفلاين → تفضل تحاول بعدين). supabase lazy import.
 */
import {
  getUnsyncedSamples, getAllTrainingSessions, saveTrainingSample, saveTrainingSession,
  type TrainingSample,
} from "./trainingStore";

export async function syncTrainingData(): Promise<{ uploaded: number; audioUploaded: number; error?: string }> {
  try {
    const samples = await getUnsyncedSamples();
    const allSessions = await getAllTrainingSessions();
    const unsyncedSessions = allSessions.filter((s) => !s.synced);
    // مفيش لوحات ولا صوت جديد → خلاص.
    if (samples.length === 0 && unsyncedSessions.length === 0) return { uploaded: 0, audioUploaded: 0 };
    const { supabase } = await import("./supabaseClient");

    // **مهم:** نستخدم معرّف اليوزر المسجّل **حالياً** لكل الصفوف. getSession() بيقرا
    // الجلسة **محلياً** بلا نداء شبكة (getUser بيعمل نداء بيفشل «Failed to fetch»).
    const { data: sessData } = await supabase.auth.getSession();
    const uid = sessData?.session?.user?.id;
    if (!uid) return { uploaded: 0, audioUploaded: 0, error: "مفيش جلسة دخول — سجّل الدخول الأول" };

    // (١) ارفع صوت أي جلسة لسه مااترفعتش — **مستقلة عن اللوحات** (عشان صوت اتحفظ
    // بعد ما لوحاته اترفعت، يترفع برضه). audioOk = الجلسات اللي صوتها متاح على
    // السيرفر (اترفع دلوقتي أو قبل كده).
    const knownSessions = new Set(allSessions.map((s) => s.sessionId));
    const audioOk = new Set<string>(allSessions.filter((s) => s.synced).map((s) => s.sessionId));
    let audioError: string | undefined;
    let audioUploaded = 0;
    for (const sess of unsyncedSessions) {
      try {
        const { error } = await supabase.rpc("save_training_audio", {
          p_session_id: sess.sessionId, p_agent_id: uid,
          p_audio_base64: sess.audioBase64, p_mime_type: sess.mimeType, p_created_at: sess.createdAt,
        });
        if (error) { audioError = error.message; continue; }
        await saveTrainingSession({ ...sess, synced: true });
        audioOk.add(sess.sessionId);
        audioUploaded++;
      } catch (e) {
        audioError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }

    // (٢) ارفع اللوحات — نتخطّى أي صف يفشل بدل ما نوقف الكل.
    let uploaded = 0;
    let sampleError: string | undefined;
    for (const s of samples) {
      const audioUp = audioOk.has(s.sessionId);
      try {
        const { error } = await supabase.rpc("save_training_sample", {
          p_id: s.id, p_session_id: s.sessionId, p_plate: s.plate, p_tier: s.tier, p_reason: s.reason,
          p_start_ms: Math.round(s.startMs), p_end_ms: Math.round(s.endMs),
          p_audio_path: audioUp ? s.sessionId : null, p_agent_id: uid, p_created_at: s.createdAt,
        });
        if (error) { sampleError = error.message; continue; }
        // العيّنة تتعلّم «مرفوعة» لو: صوتها اترفع، أو مفيش صوت محفوظ لجلستها أصلاً
        // (مفيش حاجة تستنّاها)، أو مالهاش جلسة.
        if (audioUp || !knownSessions.has(s.sessionId) || !s.sessionId) {
          await saveTrainingSample({ ...(s as TrainingSample), synced: true });
        }
        uploaded++;
      } catch (e) {
        sampleError = e instanceof Error ? e.message : String(e); // استثناء شبكة — تخطَّ الصف
      }
    }
    return { uploaded, audioUploaded, error: sampleError ?? audioError };
  } catch (e) {
    return { uploaded: 0, audioUploaded: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

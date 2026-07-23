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

    // **مهم:** نستخدم معرّف اليوزر المسجّل **حالياً** لكل الصفوف — مش المخزّن مع
    // العيّنة (اللي ممكن يكون فاضي لو اتجمّعت قبل اكتمال تسجيل الدخول). سياسة RLS
    // بتشترط agent_id = auth.uid()، فأي معرّف قديم/فاضي كان بيتسبّب في الرفض.
    // getSession() بيقرا الجلسة **محلياً** بلا نداء شبكة (getUser بيعمل نداء لسيرفر
    // المصادقة اللي بيفشل «Failed to fetch» على WebView الموبايل).
    const { data: sessData } = await supabase.auth.getSession();
    const uid = sessData?.session?.user?.id;
    if (!uid) return { uploaded: 0, error: "مفيش جلسة دخول — سجّل الدخول الأول" };

    // ارفع صوت كل جلسة في training_audio (base64) عبر REST. لو الصوت فشل، نكمّل
    // نرفع اللوحات، والجلسة تفضل غير متزامنة فالصوت يُعاد رفعه بعدين.
    const audioOk = new Set<string>();
    let audioError: string | undefined;
    const uniqueSessions = [...new Set(samples.map((s) => s.sessionId))];
    for (const sid of uniqueSessions) {
      const sess = await getTrainingSession(sid);
      if (!sess) { audioOk.add(sid); continue; }   // مفيش صوت محفوظ — نسمح باللوحة تترفع
      if (sess.synced) { audioOk.add(sid); continue; }
      try {
        // دالة security definer — بتتخطّى RLS (زي set_learning_enabled الشغّالة).
        const { error } = await supabase.rpc("save_training_audio", {
          p_session_id: sid, p_agent_id: uid,
          p_audio_base64: sess.audioBase64, p_mime_type: sess.mimeType, p_created_at: sess.createdAt,
        });
        if (error) { audioError = error.message; continue; }
        await saveTrainingSession({ ...sess, synced: true });
        audioOk.add(sid);
      } catch (e) {
        audioError = e instanceof Error ? e.message : String(e);
        continue;
      }
    }

    // أدرج صفوف العيّنات — نتخطّى أي صف يفشل بدل ما نوقف الكل (صف واحد غلط مايمنعش
    // الباقي).
    let uploaded = 0;
    let sampleError: string | undefined;
    for (const s of samples) {
      try {
        // دالة security definer — بتتخطّى RLS.
        const { error } = await supabase.rpc("save_training_sample", {
          p_id: s.id, p_session_id: s.sessionId, p_plate: s.plate, p_tier: s.tier, p_reason: s.reason,
          p_start_ms: Math.round(s.startMs), p_end_ms: Math.round(s.endMs),
          p_audio_path: audioOk.has(s.sessionId) ? s.sessionId : null, p_agent_id: uid, p_created_at: s.createdAt,
        });
        if (error) { sampleError = error.message; continue; }
        // العيّنة تتعلّم «مرفوعة» بس لو صوتها اترفع كمان — عشان إعادة المزامنة تكمّل
        // ترفع الصوت لو لسه فاشل.
        if (audioOk.has(s.sessionId) || !s.sessionId) {
          await saveTrainingSample({ ...(s as TrainingSample), synced: true });
        }
        uploaded++;
      } catch (e) {
        sampleError = e instanceof Error ? e.message : String(e); // استثناء شبكة — تخطَّ الصف
      }
    }
    return { uploaded, error: sampleError ?? audioError };
  } catch (e) {
    return { uploaded: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

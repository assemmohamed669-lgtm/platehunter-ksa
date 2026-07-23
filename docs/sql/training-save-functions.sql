-- =====================================================================
-- دوال حفظ داتا التدريب بصلاحية عالية (security definer) — بتتخطّى RLS تماماً
-- زي set_learning_enabled الشغّالة. عشان رفع المندوب يعدّي مهما كانت حالة RLS/الدور
-- على WebView الموبايل. يُشغَّل مرة واحدة. آمن للتكرار.
-- (يُشغَّل بعد training-data.sql و training-audio-db.sql)
-- =====================================================================

-- حفظ صوت جلسة (upsert).
create or replace function public.save_training_audio(
  p_session_id text, p_agent_id uuid, p_audio_base64 text, p_mime_type text, p_created_at timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.training_audio (session_id, agent_id, audio_base64, mime_type, created_at)
  values (p_session_id, p_agent_id, p_audio_base64, p_mime_type, coalesce(p_created_at, now()))
  on conflict (session_id) do update set
    audio_base64 = excluded.audio_base64, mime_type = excluded.mime_type;
$$;

-- حفظ عيّنة لوحة (upsert).
create or replace function public.save_training_sample(
  p_id text, p_session_id text, p_plate text, p_tier text, p_reason text,
  p_start_ms int, p_end_ms int, p_audio_path text, p_agent_id uuid, p_created_at timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.training_samples (id, session_id, plate, tier, reason, start_ms, end_ms, audio_path, agent_id, created_at)
  values (p_id, p_session_id, p_plate, p_tier, p_reason, p_start_ms, p_end_ms, p_audio_path, p_agent_id, coalesce(p_created_at, now()))
  on conflict (id) do update set
    plate = excluded.plate, tier = excluded.tier, reason = excluded.reason,
    start_ms = excluded.start_ms, end_ms = excluded.end_ms, audio_path = excluded.audio_path;
$$;

grant execute on function public.save_training_audio(text, uuid, text, text, timestamptz) to authenticated, anon;
grant execute on function public.save_training_sample(text, text, text, text, text, int, int, text, uuid, timestamptz) to authenticated, anon;

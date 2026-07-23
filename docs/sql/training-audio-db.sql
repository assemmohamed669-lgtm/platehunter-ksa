-- =====================================================================
-- صوت التدريب في قاعدة البيانات (بدل Storage) — لأن رفع Storage بيفشل على
-- WebView الموبايل («Failed to fetch»). الصوت base64 في جدول، يترفع عبر REST
-- API (اللي بيشتغل تمام). يُشغَّل مرة واحدة. آمن للتكرار.
-- =====================================================================

create table if not exists public.training_audio (
  session_id text primary key,
  agent_id uuid,
  audio_base64 text not null,
  mime_type text,
  created_at timestamptz not null default now(),
  downloaded_at timestamptz
);
alter table public.training_audio enable row level security;

-- الإدراج: المستخدم يرفع صوت جلسته هو.
drop policy if exists "training_audio_insert_own" on public.training_audio;
create policy "training_audio_insert_own" on public.training_audio
  for insert to authenticated
  with check (agent_id = auth.uid());

-- التحديث: المستخدم يحدّث صوت جلسته (لـ upsert).
drop policy if exists "training_audio_update_own" on public.training_audio;
create policy "training_audio_update_own" on public.training_audio
  for update to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

-- القراءة: سوبر أدمن فقط (لتنزيل الصوت).
drop policy if exists "training_audio_select_super" on public.training_audio;
create policy "training_audio_select_super" on public.training_audio
  for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

-- الحذف: سوبر أدمن فقط (للمسح بعد التنزيل).
drop policy if exists "training_audio_delete_super" on public.training_audio;
create policy "training_audio_delete_super" on public.training_audio
  for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

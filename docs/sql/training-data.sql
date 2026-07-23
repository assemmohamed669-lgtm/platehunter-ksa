-- =====================================================================
-- داتا تدريب الصوت — جدول عيّنات + باكت تخزين للصوت.
-- الصوت + اللوحة الصح بيتجمّعوا من الاستخدام (لما مفتاح التعلّم شغّال).
-- الإدراج: أي مستخدم مسجّل (المناديب). القراءة/الحذف: سوبر أدمن فقط.
-- يُشغَّل مرة واحدة على Supabase. آمن للتكرار.
-- =====================================================================

-- (١) باكت تخزين خاص لصوت الجلسات (لو مش موجود).
insert into storage.buckets (id, name, public)
values ('training-audio', 'training-audio', false)
on conflict (id) do nothing;

-- (٢) جدول عيّنات التدريب (بيانات كل لوحة + توقيتها + مسار صوت جلستها).
create table if not exists public.training_samples (
  id text primary key,
  session_id text not null,
  plate text not null,
  tier text not null,               -- gold | trusted
  reason text,
  start_ms integer,
  end_ms integer,
  audio_path text,                  -- مسار صوت الجلسة في الباكت
  agent_id uuid,
  created_at timestamptz not null default now()
);
alter table public.training_samples enable row level security;

-- الإدراج: أي مستخدم مسجّل (يدرج عيّنته هو).
drop policy if exists "training_insert_own" on public.training_samples;
create policy "training_insert_own" on public.training_samples
  for insert to authenticated
  with check (agent_id = auth.uid());

-- القراءة: سوبر أدمن فقط (لتنزيل الداتاسِت).
drop policy if exists "training_select_super" on public.training_samples;
create policy "training_select_super" on public.training_samples
  for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

-- الحذف: سوبر أدمن فقط (للمسح بعد التنزيل).
drop policy if exists "training_delete_super" on public.training_samples;
create policy "training_delete_super" on public.training_samples
  for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

-- (٣) صلاحيات الباكت: المستخدم يرفع صوته؛ السوبر أدمن يقرا/يمسح.
drop policy if exists "training_audio_upload" on storage.objects;
create policy "training_audio_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'training-audio');

drop policy if exists "training_audio_super_read" on storage.objects;
create policy "training_audio_super_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'training-audio'
    and exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

drop policy if exists "training_audio_super_delete" on storage.objects;
create policy "training_audio_super_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'training-audio'
    and exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

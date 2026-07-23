-- =====================================================================
-- تتبّع تنزيل داتا التدريب — عمود downloaded_at + صلاحية تحديثه للسوبر أدمن.
-- الهدف: «تنزيل الجديد بس / بدون تكرار» — العيّنة اللي اتنزّلت بتتعلّم بتاريخ
-- فمتيجيش تاني. يُشغَّل مرة واحدة على Supabase. آمن للتكرار.
-- (يُشغَّل بعد training-data.sql)
-- =====================================================================

-- (١) عمود تاريخ التنزيل (NULL = لسه جديدة).
alter table public.training_samples
  add column if not exists downloaded_at timestamptz;

create index if not exists training_samples_pending_idx
  on public.training_samples (agent_id) where downloaded_at is null;

-- (٢) صلاحية التحديث: سوبر أدمن فقط (لتعليم العيّنة إنها اتنزّلت).
drop policy if exists "training_update_super" on public.training_samples;
create policy "training_update_super" on public.training_samples
  for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_super = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_super = true));

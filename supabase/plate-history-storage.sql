-- ════════════════════════════════════════════════════════════════════════════
--  سجل السيارات (plate history) — نسخة احتياطية خاصة على Supabase Storage
--  شغّل الملف ده **مرة واحدة** في: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════
--
--  إيه اللي بيعمله:
--    • بينشئ bucket خاص (غير عام) اسمه plate-history لتخزين سجل كل مندوب.
--    • بيحط سياسات صلاحية تخلّي كل مندوب يقرا/يكتب **في مجلده هو بس**.
--
--  الخصوصية: مسار كل مندوب = {user_id}/... والسياسات بتقارن أول جزء من المسار
--  بـ auth.uid(). فمندوب **مايقدرش** يقرا ولا يكتب ولا يمسح ملف مندوب تاني —
--  الرفض على مستوى السيرفر نفسه، مش في كود التطبيق.
--
--  مهم: الملف ده **مايلمسش** أي جدول قايم (field_checks / profiles / recordings
--  / chassis_records / training_*). كله في Storage، وهي مساحة منفصلة تماماً.
-- ════════════════════════════════════════════════════════════════════════════

-- (١) الـbucket — private (public = false) فمحدش يوصله بلينك مباشر.
insert into storage.buckets (id, name, public)
values ('plate-history', 'plate-history', false)
on conflict (id) do nothing;

-- (٢) السياسات — نمسح القديمة الأول عشان التشغيل يبقى قابل للتكرار بأمان.
drop policy if exists "plate_history_select_own" on storage.objects;
drop policy if exists "plate_history_insert_own" on storage.objects;
drop policy if exists "plate_history_update_own" on storage.objects;
drop policy if exists "plate_history_delete_own" on storage.objects;

-- قراءة: المندوب يقرا ملفاته بس
create policy "plate_history_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'plate-history'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- إنشاء: يرفع في مجلده بس
create policy "plate_history_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'plate-history'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- تحديث (upsert للنسخة الجديدة): في مجلده بس
create policy "plate_history_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'plate-history'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'plate-history'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- مسح (تنظيف الشهور القديمة): في مجلده بس
create policy "plate_history_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'plate-history'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── تحقّق سريع بعد التشغيل ──────────────────────────────────────────────────
-- الـbucket موجود؟
--   select id, public from storage.buckets where id = 'plate-history';
-- السياسات الأربع موجودة؟
--   select policyname from pg_policies
--    where tablename = 'objects' and policyname like 'plate_history%';
-- حجم المستخدم (بالميجا) لما تبدأ تتجمّع بيانات:
--   select round(sum((metadata->>'size')::bigint)/1048576.0, 2) as mb
--     from storage.objects where bucket_id = 'plate-history';

-- ═══════════════════════════════════════════════════════════════════════════
--  أداء سياسات RLS — تنفيذ الدوال مرة واحدة للاستعلام بدل مرة لكل صف
-- ═══════════════════════════════════════════════════════════════════════════
--
--  المشكلة (متقاسة يوم 2026-08-25 من pg_stat_user_tables):
--    app_settings (صف واحد، ٣٢ ك.ب) عليه ٣٥٢ مليون index scan
--    profiles     (٦٥ صف، ١٢٠ ك.ب) عليه ٣٦٥ مليون
--  الرقمين دول مستحيل يكونوا عدد استعلامات حقيقي. السبب إن سياسات RLS مكتوبة
--  بنداء دالة مباشر — فPostgres بينفّذها لكل صف. استعلام واحد على field_checks
--  (٢٠٧ ألف صف) = ٢٠٧ ألف نداء لـhas_active_access، وكل نداء بيقرا من
--  app_settings و profiles.
--
--  الحل (موصى به من Supabase): لفّ النداء في (select ...). Postgres ساعتها
--  بيحسبه مرة واحدة كـInitPlan ويستخدم النتيجة لكل الصفوف.
--
--  المنطق مابيتغيّرش ولا حرف: auth.uid() = agent_id و
--  (select auth.uid()) = agent_id نتيجتهم واحدة بالظبط — الفرق في عدد مرات
--  التنفيذ بس. مين يشوف إيه يفضل زي ما هو تماماً.
--
--  الترتيب المقصود: كل جدول في معاملة لوحده، والأصغر الأول. جرّب
--  chassis_records و recordings، اتأكد إن المناديب شايفين سجلاتهم، وبعدين
--  field_checks. سطور التراجع في آخر الملف.
--
--  التعريفات تحت منقولة بالحرف من pg_policies يوم 2026-08-25 — لو اتغيّرت بعد
--  كده، اعِد قراءتها قبل التشغيل.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── (١) chassis_records — الأصغر، ابدأ بيه ────────────────────────────────
begin;

drop policy if exists chassis_records_own on public.chassis_records;
create policy chassis_records_own on public.chassis_records
  for all to authenticated
  using (agent_id = (select auth.uid()))
  with check (agent_id = (select auth.uid()));

drop policy if exists chassis_records_require_active on public.chassis_records;
create policy chassis_records_require_active on public.chassis_records
  as restrictive for all to authenticated
  using ((select has_active_access()))
  with check ((select has_active_access()));

commit;


-- ── (٢) recordings ────────────────────────────────────────────────────────
begin;

drop policy if exists recordings_admin_select on public.recordings;
create policy recordings_admin_select on public.recordings
  for select to public
  using ((select is_admin()));

drop policy if exists recordings_agent_select on public.recordings;
create policy recordings_agent_select on public.recordings
  for select to public
  using ((select auth.uid()) = agent_id);

drop policy if exists recordings_agent_insert on public.recordings;
create policy recordings_agent_insert on public.recordings
  for insert to public
  with check (((select auth.uid()) = agent_id) and (select agent_allowed()));

drop policy if exists recordings_agent_update on public.recordings;
create policy recordings_agent_update on public.recordings
  for update to public
  using (((select auth.uid()) = agent_id) and (select agent_allowed()));

drop policy if exists recordings_agent_delete on public.recordings;
create policy recordings_agent_delete on public.recordings
  for delete to public
  using ((select auth.uid()) = agent_id);

drop policy if exists recordings_require_active on public.recordings;
create policy recordings_require_active on public.recordings
  as restrictive for all to authenticated
  using ((select has_active_access()))
  with check ((select has_active_access()));

commit;


-- ── (٣) field_checks — الأكبر، وآخر واحد ──────────────────────────────────
begin;

drop policy if exists field_checks_admin_select on public.field_checks;
create policy field_checks_admin_select on public.field_checks
  for select to public
  using ((select is_admin()));

drop policy if exists field_checks_agent_select on public.field_checks;
create policy field_checks_agent_select on public.field_checks
  for select to public
  using ((select auth.uid()) = agent_id);

drop policy if exists field_checks_agent_insert on public.field_checks;
create policy field_checks_agent_insert on public.field_checks
  for insert to public
  with check (((select auth.uid()) = agent_id) and (select agent_allowed()));

drop policy if exists field_checks_agent_update on public.field_checks;
create policy field_checks_agent_update on public.field_checks
  for update to public
  using (((select auth.uid()) = agent_id) and (select agent_allowed()));

drop policy if exists field_checks_agent_delete on public.field_checks;
create policy field_checks_agent_delete on public.field_checks
  for delete to public
  using ((select auth.uid()) = agent_id);

drop policy if exists field_checks_require_active on public.field_checks;
create policy field_checks_require_active on public.field_checks
  as restrictive for all to authenticated
  using ((select has_active_access()))
  with check ((select has_active_access()));

commit;


-- ═══════════════════════════════════════════════════════════════════════════
--  التراجع — يرجّع التعريفات الأصلية بالحرف. شيل التعليق عن الجزء المطلوب.
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
-- drop policy if exists field_checks_admin_select on public.field_checks;
-- create policy field_checks_admin_select on public.field_checks
--   for select to public using (is_admin());
-- drop policy if exists field_checks_agent_select on public.field_checks;
-- create policy field_checks_agent_select on public.field_checks
--   for select to public using (auth.uid() = agent_id);
-- drop policy if exists field_checks_agent_insert on public.field_checks;
-- create policy field_checks_agent_insert on public.field_checks
--   for insert to public with check ((auth.uid() = agent_id) and agent_allowed());
-- drop policy if exists field_checks_agent_update on public.field_checks;
-- create policy field_checks_agent_update on public.field_checks
--   for update to public using ((auth.uid() = agent_id) and agent_allowed());
-- drop policy if exists field_checks_agent_delete on public.field_checks;
-- create policy field_checks_agent_delete on public.field_checks
--   for delete to public using (auth.uid() = agent_id);
-- drop policy if exists field_checks_require_active on public.field_checks;
-- create policy field_checks_require_active on public.field_checks
--   as restrictive for all to authenticated
--   using (has_active_access()) with check (has_active_access());
-- commit;


-- ═══════════════════════════════════════════════════════════════════════════
--  تحقّق بعد كل جدول — لازم يفضل نفس عدد السياسات ونفس الأنواع
-- ═══════════════════════════════════════════════════════════════════════════
--   select tablename, policyname, permissive, cmd, qual, with_check
--     from pg_policies where schemaname='public'
--      and tablename in ('field_checks','recordings','chassis_records')
--    order by tablename, policyname;
--
--  والأهم — اختبار حقيقي: مندوب يفتح التطبيق ويشوف سجلاته، ويعمل تشييك جديد.
--  الأرقام في pg_policies مابتثبتش إن الصلاحيات شغّالة.

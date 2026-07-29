-- =====================================================================
-- تقوية أمان — سحب صلاحية التنفيذ من anon على دوال SECURITY DEFINER التي لا
-- يحتاجها anon، وضبط search_path لدالة تسجيل المستخدم. آمن للتكرار وقابل للتراجع.
--
-- السياق: Supabase بيمنح anon تلقائياً لأي دالة جديدة (صلاحيات افتراضية)، حتى لو
-- الملف منح authenticated فقط. الدوال دي كلها بتتنده عبر supabase.rpc بجلسة
-- مندوب مسجّل، فـauthenticated بيكفّي — وanon مالوش لزوم.
--
-- التراجع لو احتجت: أعد المنح — grant execute on function <sig> to anon;
-- =====================================================================

-- (١) سحب anon (وpublic الافتراضية) من الدوال اللي مالهاش داعي لـanon.
--     authenticated بيفضل شغّال — المناديب المسجّلين مايتأثروش.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'agent_allowed',          -- غير مستخدمة في الكود أصلاً
        'get_learning_enabled',   -- بترجّع bool بس
        'bump_plate_correction',  -- بتكتب في التعلّم المشترك — الأهم
        'set_learning_enabled'    -- محميّة جوّه بـNOT_SUPER كمان
      )
  loop
    execute format('revoke execute on function %s from anon;', r.sig);
    execute format('revoke execute on function %s from public;', r.sig);
  end loop;
end $$;

-- (٢) ضبط search_path لدالة handle_new_user (تحذير Function Search Path Mutable).
--     باقي دوالك حاطّاها بالفعل؛ دي الوحيدة الناقصة.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  loop
    execute format('alter function %s set search_path = public, pg_temp;', r.sig);
  end loop;
end $$;

-- =====================================================================
-- (٣) اختياري — قرار المستخدم: دوال رفع داتا التدريب.
--     دي مُنِحت لـanon **عن قصد** كحل لمشكلة رفع WebView على الموبايل. لكن
--     كل النداءات في الكود بتتم عبر supabase.rpc بجلسة مندوب مسجّل، فالأرجح
--     إن authenticated بيكفّي. لو قررت تشيل anon، **جرّب رفع التدريب على
--     موبايل حقيقي بعدها** للتأكد إنه ماكسرش. شيل التعليق عن السطور لو موافق:
-- =====================================================================
-- revoke execute on function public.save_training_audio(text, uuid, text, text, timestamptz) from anon, public;
-- revoke execute on function public.save_training_sample(text, text, text, text, text, int, int, text, uuid, timestamptz) from anon, public;

-- =====================================================================
-- (٤) حذف سياسات RLS المفتوحة للعامة على جدولَي التدريب (تحذير RLS Policy
--     Always True). السياسات دي (role=public, expr=true) بتخلّي **أي حد حتى
--     غير مسجّل** يـ INSERT/UPDATE أي صف — سطح هجوم كتابة (حشو/تسميم الداتا).
--
--     آمن للحذف: الرفع بيتم عبر دوال save_training_* (SECURITY DEFINER تتخطّى
--     RLS)، وعمليات السوبر أدمن بتمشي على سياسات _super. مفيش حاجة في التطبيق
--     بتعتمد على السياسات الـ_public دي. القراءة مقفولة على السوبر أدمن (مفيش
--     تسريب). آمن للتكرار.
-- =====================================================================
drop policy if exists "training_audio_insert_public" on public.training_audio;
drop policy if exists "training_audio_update_public" on public.training_audio;
drop policy if exists "training_insert_public"       on public.training_samples;
drop policy if exists "training_update_public"       on public.training_samples;

-- استرجاع سياسة الإدراج المقيّدة الأصلية (المندوب يدرج صفّه هو فقط) — دفاع في
-- العمق ومطابقة لملفات الريبو. الرفع الفعلي عبر الدوال بيفضل شغّال بأي حال.
drop policy if exists "training_audio_insert_own" on public.training_audio;
create policy "training_audio_insert_own" on public.training_audio
  for insert to authenticated
  with check (agent_id = auth.uid());

drop policy if exists "training_insert_own" on public.training_samples;
create policy "training_insert_own" on public.training_samples
  for insert to authenticated
  with check (agent_id = auth.uid());

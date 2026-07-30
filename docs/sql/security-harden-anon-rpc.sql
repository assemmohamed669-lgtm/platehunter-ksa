-- =====================================================================
-- تقوية أمان (٢) — سحب anon من باقي دوال SECURITY DEFINER المكشوفة على
-- /rest/v1/rpc. تكملة لـsecurity-harden-grants.sql. آمن للتكرار وقابل للتراجع.
--
-- ليه: Supabase بيمنح PUBLIC تلقائياً لأي دالة جديدة، فـanon بياخد صلاحية
-- التنفيذ **حتى لو** الملف الأصلي منح authenticated بس. اتأكدنا من كل ملف:
--
--   get_shared_deepgram_key  → docs/sql/shared-deepgram-key.sql:56   (authenticated)
--   set_shared_deepgram_key  → docs/sql/shared-deepgram-key.sql:55   (authenticated)
--   touch_last_location      → docs/sql/agent-location-tracking.sql:36 (authenticated)
--   touch_last_seen          → docs/sql/agent-app-version.sql:30     (authenticated)
--   handle_device_login      → docs/sql/agent-device-exempt.sql:66   (authenticated)
--   handle_new_user          → دالة trigger، مش مفروض تُنده عبر RPC أصلاً
--
-- فالسحب ده **بيرجّع نية الملفات**، مش بيغيّرها. المناديب المسجّلين مايتأثروش.
--
-- الأخطر في القائمة: get_shared_deepgram_key كانت بترجّع مفتاح Deepgram
-- لأي حد غير مسجّل (والـanon key منشور في الـbundle) = تسريب مفتاح حقيقي.
--
-- ⚠️ بعد تشغيل الملف: **غيّر مفتاح Deepgram** من لوحة Deepgram وحُطّ الجديد من
--    شاشة السوبر أدمن. المفتاح القديم كان مكشوف، فقفل الباب مايكفّي لوحده.
--
-- التراجع لو احتجت: grant execute on function <sig> to anon;
-- =====================================================================

-- (١) سحب anon + public. نستخدم لوب على pg_proc عشان مانتعبش في مطابقة
--     البصمات (signatures) — أي نسخة من الدالة بأي بارامترات بتتغطّى.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_shared_deepgram_key',
        'set_shared_deepgram_key',
        'touch_last_location',
        'touch_last_seen',
        'handle_device_login',
        'handle_new_user'
      )
  loop
    execute format('revoke execute on function %s from anon;', r.sig);
    execute format('revoke execute on function %s from public;', r.sig);
  end loop;
end $$;

-- (٢) handle_new_user: دالة trigger بحتة — مافيش حاجة في الكود بتندهها عبر
--     rpc (اتأكدنا بالبحث). التريجر نفسه **مايتأثرش**: PostgreSQL بيتحقّق من
--     صلاحية EXECUTE وقت `create trigger` مش وقت التنفيذ. فسحبها من
--     authenticated كمان آمن، وبيقفل آخر باب مكشوف عليها.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  loop
    execute format('revoke execute on function %s from authenticated;', r.sig);
  end loop;
end $$;

-- =====================================================================
-- (٣) اختياري — دوال رفع داتا التدريب (نفس بند القسم ٣ في الملف الأول).
--     مُنِحت لـanon كحل لمشكلة رفع WebView على الموبايل، لكن كل النداءات في
--     الكود بتمرّ بجلسة مندوب مسجّل. لو شيلتها، **جرّب تسجيلة تدريب على موبايل
--     حقيقي بعدها**. شيل التعليق لو موافق:
-- =====================================================================
-- do $$
-- declare r record;
-- begin
--   for r in
--     select p.oid::regprocedure as sig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('save_training_audio', 'save_training_sample')
--   loop
--     execute format('revoke execute on function %s from anon;', r.sig);
--     execute format('revoke execute on function %s from public;', r.sig);
--   end loop;
-- end $$;

-- =====================================================================
-- (٤) مش بنلمس is_admin() — مقصود.
--
--     مش موجودة في أي ملف SQL في الريبو، يعني اتعملت على السيرفر مباشرة
--     وأغلب الظن مستخدمة جوّه سياسات RLS. تعبير سياسة RLS بيتنفّذ بصلاحيات
--     المستخدم اللي بيستعلم، فلو سحبنا EXECUTE منه أي استعلام على جدول
--     سياسته بتنده is_admin() هيرمي "permission denied" بدل ما يرجّع فاضي.
--     التحذير عليها منخفض القيمة (بترجّع bool)، والمخاطرة مش مستاهلة.
--
--     لو حبيت تتأكد بنفسك إنها مش في أي سياسة:
--       select tablename, policyname, qual, with_check
--         from pg_policies
--        where schemaname = 'public'
--          and (qual ilike '%is_admin%' or with_check ilike '%is_admin%');
--     لو رجعت صفر صفوف → آمن تسحبها من anon كمان.
--
-- (٥) تحذيرات authenticated_security_definer_function_executable الباقية
--     (١٣ تحذير) **بالتصميم** — دوال التطبيق لازم يقدر يندهها المندوب المسجّل.
--     تصفيرها معناه تكسير التطبيق. كل واحدة فيهم محميّة جوّه بـauth.uid()
--     أو فحص دور (زي NOT_ADMIN في set_shared_deepgram_key).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- عدّادات الكتابة على الجداول — للتنبيه المبكر قبل ما الضغط يوقّع الداتابيز.
--
-- ليه: يوم ٢٠٢٦-٠٩-٠٦ الداتابيز وقعت (PostgREST Unhealthy) من حلقة كانت بتكتب
-- على profiles كل ثانيتين لكل مندوب بيسوق (~٩٠٠ ألف كتابة/يوم). عرفنا بالمشكلة
-- **بعد** ما وقعت. المشكلة مكانتش فجائية — كانت بتكبر مع كل مندوب جديد.
--
-- Postgres بيمسك عدّاد تراكمي لكل جدول: كام صف اتزوّد/اتعدّل/اتمسح. أداة الباك أب
-- بتقراه كل يوم وبتطرح رقم امبارح من رقم النهاردة = حِمل اليوم. لو عدّى الحد
-- بتكتب تحذير على سطح المكتب زي تحذير فشل الباك أب بالظبط.
--
-- ⚠️ العدّادات بترجع لصفر مع أي ريستارت للداتابيز — عشان كده بنرجّع كمان
-- `stats_since` = **وقت آخر تشغيل لـPostgres** (pg_postmaster_start_time).
-- (جرّبنا pg_stat_database.stats_reset الأول وطلعت NULL على Supabase — فمعتمدناش
-- عليها.) الأداة بتقارن الوقت ده: لو اتغيّر يبقى حصل
-- ريستارت والفرق مالوش معنى، فبتتخطّى المقارنة بدل ما تطلّع تحذير كداب.
-- (تحذير كداب مرتين = المالك يبطّل يبص على التحذيرات = الأداة مالهاش لازمة.)
--
-- الأمان: القراءة دي مالهاش أي علاقة بداتا المناديب — أرقام إحصائية بس.
-- ومع ذلك مقفولة على `service_role` (مفتاح الباك أب) لوحده: لا المندوب ولا
-- الأدمن يقدر ينده عليها. شوف docs/sql/security-harden-anon-rpc.sql — أي دالة
-- جديدة لازم تتقفل صراحةً لأن Postgres بيدي EXECUTE لـPUBLIC افتراضياً.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.db_write_counters()
returns table (
  tbl           text,
  rows_inserted bigint,
  rows_updated  bigint,
  rows_deleted  bigint,
  live_rows     bigint,
  stats_since   timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select t.relname::text,
         t.n_tup_ins,
         t.n_tup_upd,
         t.n_tup_del,
         t.n_live_tup,
         pg_postmaster_start_time()
    from pg_stat_user_tables t
   order by (t.n_tup_ins + t.n_tup_upd + t.n_tup_del) desc;
$$;

-- Postgres بيدي EXECUTE لـPUBLIC على أي دالة جديدة — نسحبها ونديها للباك أب بس.
revoke all on function public.db_write_counters() from public;
revoke all on function public.db_write_counters() from anon;
revoke all on function public.db_write_counters() from authenticated;
grant execute on function public.db_write_counters() to service_role;

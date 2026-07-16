-- ─────────────────────────────────────────────────────────────────────────
-- تتبّع موقع المناديب (لايف + آخر ظهور)
-- شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
-- بيضيف أعمدة الموقع لجدول profiles، ودالة touch_last_location اللي التطبيق
-- بيستدعيها كل شوية عشان يحدّث موقع المندوب الحالي (صفّه هو بس).
-- الأدمن بيقرا المواقع من نفس صلاحية قراءة profiles الموجودة أصلاً.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists last_lat          double precision,
  add column if not exists last_lng          double precision,
  add column if not exists last_loc_accuracy double precision,
  add column if not exists last_loc_at       timestamptz;

-- المندوب بيحدّث آخر ظهور + موقعه في نفس النداء. SECURITY DEFINER عشان يتخطّى
-- RLS، بس بيلمس صفّ المستخدم الحالي (auth.uid()) لا غير.
create or replace function public.touch_last_location(
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen         = now(),
         last_lat          = p_lat,
         last_lng          = p_lng,
         last_loc_accuracy = p_accuracy,
         last_loc_at       = now()
   where id = auth.uid();
$$;

grant execute on function public.touch_last_location(double precision, double precision, double precision) to authenticated;

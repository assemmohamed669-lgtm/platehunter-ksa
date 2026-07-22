-- ─────────────────────────────────────────────────────────────────────────
-- نسخة البرنامج اللي كل مندوب شغّال بيها (للأدمن — يعرف مين على أحدث نسخة).
-- شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
-- بيضيف عمود app_version لجدول profiles، ويوسّع دالة touch_last_seen عشان
-- تخزّن النسخة اللي التطبيق بيبعتها كل ما المندوب يفتحه (صفّه هو بس).
-- الأدمن بيقرا العمود من نفس صلاحية قراءة profiles الموجودة أصلاً.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists app_version text;

-- نمسح النسخة القديمة (بدون بارامتر) عشان نستبدلها بواحدة بتاخد النسخة.
drop function if exists public.touch_last_seen();

-- المندوب بيحدّث آخر ظهور + نسخة البرنامج في نفس النداء. SECURITY DEFINER عشان
-- يتخطّى RLS، بس بيلمس صفّ المستخدم الحالي (auth.uid()) لا غير. النسخة اختيارية
-- (coalesce) عشان أي نداء قديم بدون بارامتر مايمسحش النسخة المخزّنة.
create or replace function public.touch_last_seen(p_version text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen   = now(),
         app_version = coalesce(nullif(p_version, ''), app_version)
   where id = auth.uid();
$$;

grant execute on function public.touch_last_seen(text) to authenticated;

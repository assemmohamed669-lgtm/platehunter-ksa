-- ─────────────────────────────────────────────────────────────────────────
-- نظام جهاز كل مندوب (آيفون / أندرويد / ويب) — للأدمن.
-- شغّل الملف ده مرة واحدة في Supabase → SQL Editor.
-- بيضيف عمود platform لجدول profiles، ويوسّع دالة touch_last_seen عشان
-- تخزّن النظام اللي التطبيق بيبعته كل ما المندوب يفتحه (صفّه هو بس) —
-- بنفس أسلوب app_version بالظبط.
-- القيم: ios / android / web-ios / web-android / web.
-- الأدمن بيقرا العمود من نفس صلاحية قراءة profiles الموجودة أصلاً.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists app_version text;

alter table public.profiles
  add column if not exists platform text;

-- نمسح النسخ القديمة عشان نستبدلها بواحدة بتاخد النسخة + النظام.
drop function if exists public.touch_last_seen();
drop function if exists public.touch_last_seen(text);

-- المندوب بيحدّث آخر ظهور + نسخة البرنامج + النظام في نفس النداء.
-- SECURITY DEFINER عشان يتخطّى RLS، بس بيلمس صفّ المستخدم الحالي (auth.uid())
-- لا غير. البارامترات اختيارية (coalesce) عشان أي نداء أقدم مايمسحش المخزّن.
create or replace function public.touch_last_seen(
  p_version  text default null,
  p_platform text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen   = now(),
         app_version = coalesce(nullif(p_version, ''),  app_version),
         platform    = coalesce(nullif(p_platform, ''), platform)
   where id = auth.uid();
$$;

grant execute on function public.touch_last_seen(text, text) to authenticated;

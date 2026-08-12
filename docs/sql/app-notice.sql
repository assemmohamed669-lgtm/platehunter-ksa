-- =====================================================================
-- رسالة الأدمن المؤقتة — بتظهر في شريط البرنامج لكل المناديب في أي صفحة.
-- الأدمن بيكتبها ويحدد مدتها (يوم/يومين/…)، وبتختفي لوحدها لما المدة تخلص،
-- أو لما الأدمن يشيلها بنفسه. المندوب يقدر يقفلها بـ✕ وترجع تظهرله في أول
-- تسجيل دخول جديد طول ما هي لسه سارية.
--
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). آمن للتشغيل المتكرر.
-- =====================================================================

-- جدول الإعدادات المفرد (لو مش موجود) — نفس الجدول بتاع باقي المفاتيح.
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true)
);
alter table public.app_settings enable row level security;

-- نص الرسالة (فاضي/NULL = مفيش رسالة)، وقت النشر، ووقت الانتهاء.
alter table public.app_settings
  add column if not exists notice_text  text,
  add column if not exists notice_at    timestamptz,
  add column if not exists notice_until timestamptz;

-- ---------------------------------------------------------------------
-- Setter: **الأدمن فقط** (role = 'admin'). p_hours = مدة الظهور بالساعات؛
-- 0 أو NULL = من غير مدة (تفضل لحد ما الأدمن يشيلها).
-- نص فاضي = مسح الرسالة.
-- ---------------------------------------------------------------------
create or replace function public.set_app_notice(p_text text, p_hours int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.app_settings (id, notice_text, notice_at, notice_until)
  values (
    true,
    v_text,
    case when v_text is null then null else now() end,
    case when v_text is null or coalesce(p_hours, 0) <= 0 then null
         else now() + make_interval(hours => p_hours) end
  )
  on conflict (id) do update
    set notice_text  = excluded.notice_text,
        notice_at    = excluded.notice_at,
        notice_until = excluded.notice_until;
end;
$$;

-- ---------------------------------------------------------------------
-- Getter: أي مستخدم مسجّل. بيرجّع NULL لو مفيش رسالة أو المدة خلصت.
-- ---------------------------------------------------------------------
create or replace function public.get_app_notice()
returns table (notice_text text, notice_at timestamptz, notice_until timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select s.notice_text, s.notice_at, s.notice_until
  from public.app_settings s
  where s.id = true
    and s.notice_text is not null
    and (s.notice_until is null or s.notice_until > now());
$$;

grant execute on function public.set_app_notice(text, int) to authenticated;
grant execute on function public.get_app_notice() to authenticated;

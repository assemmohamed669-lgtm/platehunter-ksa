-- =====================================================================
-- مفتاح جمع/تعلّم الصوت — السوبر أدمن بس يفعّله/يوقفه، وكل الأجهزة تقراه.
-- الافتراضي: متوقّف (false) — آمن، مفيش جمع من غير تفعيل صريح.
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). آمن للتشغيل المتكرر.
-- =====================================================================

-- جدول الإعدادات المفرد (لو مش موجود).
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true)
);
alter table public.app_settings enable row level security;

-- عمود مفتاح التعلّم — افتراضي false (متوقّف).
alter table public.app_settings
  add column if not exists learning_enabled boolean not null default false;

-- ---------------------------------------------------------------------
-- Setter: **السوبر أدمن فقط** (is_super = true). يفعّل/يوقف الجمع.
-- ---------------------------------------------------------------------
create or replace function public.set_learning_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_super = true
  ) then
    raise exception 'NOT_SUPER';
  end if;

  insert into public.app_settings (id, learning_enabled)
  values (true, coalesce(p_enabled, false))
  on conflict (id) do update
    set learning_enabled = coalesce(p_enabled, false);
end;
$$;

-- ---------------------------------------------------------------------
-- Getter: أي مستخدم مسجّل (كل الأجهزة محتاجة تقرا الحالة).
-- ---------------------------------------------------------------------
create or replace function public.get_learning_enabled()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(learning_enabled, false) from public.app_settings where id = true;
$$;

grant execute on function public.set_learning_enabled(boolean) to authenticated;
grant execute on function public.get_learning_enabled() to authenticated;

-- =====================================================================
-- إضافة: زر واتساب اختياري مع رسالة الأدمن.
-- لما الأدمن يعلّم عليه، بيظهر جنب الرسالة زر واتساب المندوب يدوس عليه
-- فيفتحله محادثة مع الإدارة (ونص الرسالة بيتحط جاهز في الخانة).
--
-- يُشغَّل بعد app-notice.sql. آمن للتشغيل المتكرر.
-- =====================================================================

alter table public.app_settings
  add column if not exists notice_wa boolean not null default false;

-- النسخة القديمة (بارامترين) بتتشال عشان مايحصلش لبس في الاستدعاء.
drop function if exists public.set_app_notice(text, int);

-- ---------------------------------------------------------------------
-- Setter: **الأدمن فقط**. p_hours = المدة بالساعات (0/NULL = بلا مدة)،
-- p_wa = يظهر زر واتساب معاها؟ نص فاضي = مسح الرسالة.
-- ---------------------------------------------------------------------
create or replace function public.set_app_notice(p_text text, p_hours int, p_wa boolean default false)
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

  insert into public.app_settings (id, notice_text, notice_at, notice_until, notice_wa)
  values (
    true,
    v_text,
    case when v_text is null then null else now() end,
    case when v_text is null or coalesce(p_hours, 0) <= 0 then null
         else now() + make_interval(hours => p_hours) end,
    v_text is not null and coalesce(p_wa, false)
  )
  on conflict (id) do update
    set notice_text  = excluded.notice_text,
        notice_at    = excluded.notice_at,
        notice_until = excluded.notice_until,
        notice_wa    = excluded.notice_wa;
end;
$$;

-- ---------------------------------------------------------------------
-- Getter: بيرجّع كمان حالة زر الواتساب.
-- ---------------------------------------------------------------------
drop function if exists public.get_app_notice();

create or replace function public.get_app_notice()
returns table (notice_text text, notice_at timestamptz, notice_until timestamptz, notice_wa boolean)
language sql
security definer
stable
set search_path = public
as $$
  select s.notice_text, s.notice_at, s.notice_until, coalesce(s.notice_wa, false)
  from public.app_settings s
  where s.id = true
    and s.notice_text is not null
    and (s.notice_until is null or s.notice_until > now());
$$;

grant execute on function public.set_app_notice(text, int, boolean) to authenticated;
grant execute on function public.get_app_notice() to authenticated;

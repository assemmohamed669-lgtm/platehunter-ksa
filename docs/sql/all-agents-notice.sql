-- ═══════════════════════════════════════════════════════════════════════════
-- 📣 رسالة خاصة لكل المناديب (٦ أكتوبر ٢٠٢٦)
--
-- المالك: «خلي الادمن يقدر يبعت رساله خاصه للمندوب او يحطها ل كل المناديب».
-- زي «رسالة خاصة للمندوب» بالظبط (بالأحمر في كل الصفحات، من غير زر إخفاء، لحد ما الأدمن يشيلها)
-- بس لكل المناديب مرة واحدة — من مربع «رسالة خاصة» في صفحة أي مندوب («ابعتها لكل المناديب»).
-- متخزّنة لوحدها في app_settings، فالرسايل الخاصة اللي عند كل مندوب مابتتلمسش.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.app_settings
  add column if not exists all_notice_text text,
  add column if not exists all_notice_at   timestamptz;

-- الكتابة: **الأدمن بس**. نص فاضي = مسح. أقصى ٥٠٠ حرف (زي الخاصة).
create or replace function public.set_all_agents_notice(p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := left(nullif(btrim(coalesce(p_text, '')), ''), 500);
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.app_settings (id, all_notice_text, all_notice_at)
  values (true, v_text, case when v_text is null then null else now() end)
  on conflict (id) do update
    set all_notice_text = excluded.all_notice_text,
        all_notice_at   = excluded.all_notice_at;
end;
$$;

-- القراية: أي حد داخل بحسابه.
create or replace function public.get_all_agents_notice()
returns table (notice_text text, notice_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select s.all_notice_text, s.all_notice_at
  from public.app_settings s
  where s.id = true and s.all_notice_text is not null;
$$;

revoke all on function public.set_all_agents_notice(text) from public, anon;
revoke all on function public.get_all_agents_notice() from public, anon;
grant execute on function public.set_all_agents_notice(text) to authenticated;
grant execute on function public.get_all_agents_notice() to authenticated;

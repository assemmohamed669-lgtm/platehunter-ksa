-- =====================================================================
-- مفتاح Deepgram مشترك — السوبر أدمن يحطّه مرة واحدة، وكل المناديب ياخدوه.
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). يعتمد على app_settings
-- (الصف المفرد id=true) المُعرَّف في schema_phase4_settings.sql.
-- =====================================================================

-- عمود المفتاح المشترك على صف الإعدادات المفرد.
alter table public.app_settings
  add column if not exists deepgram_key text;

-- ---------------------------------------------------------------------
-- Setter: أدمن فقط. يحفظ/يغيّر المفتاح المشترك (فارغ → NULL).
-- ---------------------------------------------------------------------
create or replace function public.set_shared_deepgram_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.app_settings (id, deepgram_key)
  values (true, nullif(btrim(p_key), ''))
  on conflict (id) do update
    set deepgram_key = nullif(btrim(p_key), '');
end;
$$;

-- ---------------------------------------------------------------------
-- Getter: أي مستخدم مسجّل (المناديب محتاجينه client-side لاستخدام Deepgram).
-- ---------------------------------------------------------------------
create or replace function public.get_shared_deepgram_key()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select deepgram_key from public.app_settings where id = true;
$$;

grant execute on function public.set_shared_deepgram_key(text) to authenticated;
grant execute on function public.get_shared_deepgram_key() to authenticated;

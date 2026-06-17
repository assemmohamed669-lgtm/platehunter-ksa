-- =====================================================================
-- PlateHunter KSA — Phase 4 schema: secondary admin password
-- Protects "Download" (Excel export) and "Upload" (bank list import)
-- actions with an optional admin-set password, per the spec section 2.
-- Run AFTER schema.sql and schema_phase2.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- Singleton settings row (id is always `true`, so there's only ever one row)
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true),
  secondary_password_hash text
);

alter table public.app_settings enable row level security;
-- Intentionally no select policy: clients can never read the hash directly,
-- only verify a guess against it via the function below.

-- ---------------------------------------------------------------------
-- Admin sets/changes the secondary password from the admin panel.
-- ---------------------------------------------------------------------
create or replace function public.set_secondary_password(p_password text)
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

  insert into public.app_settings (id, secondary_password_hash)
  values (true, crypt(p_password, gen_salt('bf')))
  on conflict (id) do update
    set secondary_password_hash = crypt(p_password, gen_salt('bf'));
end;
$$;

grant execute on function public.set_secondary_password(text) to authenticated;

-- ---------------------------------------------------------------------
-- Removes the secondary password requirement entirely (admin only).
-- ---------------------------------------------------------------------
create or replace function public.clear_secondary_password()
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

  update public.app_settings set secondary_password_hash = null where id = true;
end;
$$;

grant execute on function public.clear_secondary_password() to authenticated;

-- ---------------------------------------------------------------------
-- Any authenticated agent calls this to verify a password attempt
-- before a Download/Upload action. Returns true if correct, OR if no
-- secondary password has been set (feature is "optional" per spec).
-- ---------------------------------------------------------------------
create or replace function public.verify_secondary_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select secondary_password_hash into v_hash from public.app_settings where id = true;

  if v_hash is null then
    return true; -- no secondary password configured -> don't block anyone
  end if;

  return v_hash = crypt(p_password, v_hash);
end;
$$;

grant execute on function public.verify_secondary_password(text) to authenticated;

-- ---------------------------------------------------------------------
-- Lets the admin panel show whether a secondary password is currently set,
-- without ever exposing the hash itself.
-- ---------------------------------------------------------------------
create or replace function public.secondary_password_is_set()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.app_settings
    where id = true and secondary_password_hash is not null
  );
end;
$$;

grant execute on function public.secondary_password_is_set() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  حماية داتا المندوب — تفضل محفوظة حتى لو الحساب اتمسح
--  يُشغَّل مرة واحدة في Supabase → SQL Editor. آمن للتشغيل المتكرر.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  الوضع الحالي (متحقّق منه ٢٠٢٦/٧/٣٠):
--    ✅ field_checks / chassis_records / training_* → **مش مرتبطة** بحساب الدخول،
--       فحذف الحساب مايلمسهاش خالص. الداتا بتفضل كاملة على السيرفر.
--    ✅ recordings → مرتبطة بـ NO ACTION: الحذف بيتمنع لو فيها صفوف (الداتا محمية).
--    ⚠️ profiles → CASCADE: صف البروفايل بيتمسح مع حساب الدخول. ووقتها بنفقد
--       الرابط بين الإيميل والمعرّف (id) — فلو المندوب رجع بحساب جديد، هياخد
--       معرّف جديد وداتاه القديمة تفضل موجودة بس **متوصلش بيه**.
--
--  اللي الملف ده بيعمله: أرشيف تلقائي للبروفايل قبل حذفه، فيه المعرّف والإيميل
--  والاشتراك. فحتى لو الحساب اتمسح بالكامل، نقدر نرجّعه بنفس المعرّف → وكل
--  سجلاته وشغله بيرجعوا يتوصلوا بيه تلقائياً.
--
--  ⚠️ إضافة بحتة: **مايغيّرش ولا يمسح أي شيء قايم** — جدول جديد + مُشغِّل (trigger)
--  بيكتب فيه وقت الحذف بس.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) أرشيف البروفايلات المحذوفة ──────────────────────────────────────────
create table if not exists public.deleted_profiles (
  id               uuid primary key,
  username         text,
  email            text,
  role             text,
  is_active        boolean,
  is_trial         boolean,
  subscription_end date,
  deleted_at       timestamptz not null default now(),
  profile          jsonb          -- نسخة كاملة من الصف وقت الحذف
);

alter table public.deleted_profiles enable row level security;

-- السوبر أدمن بس يقرا الأرشيف
drop policy if exists "deleted_profiles_super_select" on public.deleted_profiles;
create policy "deleted_profiles_super_select"
  on public.deleted_profiles for select
  to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.is_super = true));

-- ── (٢) المُشغِّل: يأرشف قبل أي حذف ─────────────────────────────────────────
create or replace function public.archive_deleted_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.deleted_profiles
    (id, username, email, role, is_active, is_trial, subscription_end, profile)
  values
    (old.id, old.username, old.email, old.role, old.is_active,
     coalesce(old.is_trial, false), old.subscription_end, to_jsonb(old))
  on conflict (id) do update
    set deleted_at = now(),
        profile    = excluded.profile,
        username   = excluded.username,
        email      = excluded.email;
  return old;
exception when others then
  return old;   -- الأرشفة عمرها ما تعطّل الحذف
end $$;

drop trigger if exists trg_archive_deleted_profile on public.profiles;
create trigger trg_archive_deleted_profile
  before delete on public.profiles
  for each row execute function public.archive_deleted_profile();

-- ── (٣) استرجاع مندوب محذوف بنفس معرّفه (فداتاه ترجع تتوصل بيه) ────────────
-- الاستخدام:  select public.restore_agent('agent@email.com');
create or replace function public.restore_agent(p_email text, p_months int default 1)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_name text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_super = true) then
    raise exception 'NOT_SUPER';
  end if;

  select id, username into v_id, v_name
    from public.deleted_profiles
   where lower(email) = lower(p_email)
   order by deleted_at desc limit 1;

  if v_id is null then
    raise exception 'مفيش بروفايل مؤرشف بالإيميل ده: %', p_email;
  end if;

  -- حساب الدخول لازم يكون لسه موجود بنفس المعرّف
  if not exists (select 1 from auth.users where id = v_id) then
    raise exception 'حساب الدخول اتمسح كمان — محتاج remap يدوي';
  end if;

  insert into public.profiles (id, username, email, role, is_active, subscription_end)
  select v_id, v_name, u.email, 'agent', true,
         (current_date + (p_months || ' month')::interval)::date
    from auth.users u where u.id = v_id
  on conflict (id) do update
    set is_active = true,
        subscription_end = (current_date + (p_months || ' month')::interval)::date;

  return v_id;
end $$;

grant execute on function public.restore_agent(text, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  التحقّق بعد التشغيل (قراءة):
--     select count(*) from public.deleted_profiles;          -- 0 في الأول، طبيعي
--     select tgname from pg_trigger
--      where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
--  ── نصيحة مهمة ─────────────────────────────────────────────────────────────
--  **الأفضل ما تمسحش حساب مندوب أصلاً** — استخدم إيقاف بدل الحذف:
--     update public.profiles set is_active = false where username = 'اسم المندوب';
--  ده بيقطع الخدمة فوراً ويحافظ على كل حاجة، والرجوع بضغطة:
--     update public.profiles set is_active = true,
--            subscription_end = (current_date + interval '1 month')::date
--      where username = 'اسم المندوب';
--
--  ── لو حساب الدخول اتمسح والمندوب سجّل من جديد (معرّف جديد) ────────────────
--  الداتا القديمة موجودة بس تحت المعرّف القديم. لربطها بالحساب الجديد:
--    -- ١) هات المعرّفين
--    -- select id from public.deleted_profiles where lower(email)=lower('...');  -- القديم
--    -- select id from public.profiles         where lower(email)=lower('...');  -- الجديد
--    -- ٢) انقل الملكية (نفّذها بعد ما تتأكد من المعرّفين):
--    -- update public.field_checks set agent_id='المعرّف الجديد' where agent_id='القديم';
--    -- update public.recordings   set agent_id='المعرّف الجديد' where agent_id='القديم';
--    -- update public.chassis_records set agent_id='المعرّف الجديد' where agent_id='القديم';
-- ═══════════════════════════════════════════════════════════════════════════

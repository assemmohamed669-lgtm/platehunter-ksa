-- ═══════════════════════════════════════════════════════════════════════════
-- 🎡 عجلة الحظ — النسخة ٢: لفّة واحدة لكل **تجديد اشتراك**، بيفعّلها الأدمن.
--
-- طلب المالك (٣٠ سبتمبر ٢٠٢٦):
--   «زر في صفحة كل مندوب — لما ييجي ميعاد التجديد ويدفع وأمدّدله، أدوس الزر
--    فتظهرله العجلة مرة واحدة. الأيام اللي يكسبها تتحسبله (٣٠ ← ٣١)، وتتضاف
--    للصوت لو مشترك صوت، أو البرنامج لو مشترك برنامج، أو الاتنين لو الاتنين.
--    لو نسي وقفل الصفحة تظهرله تاني. ولو دوست الزر مرتين ميلفش غير مرة واحدة —
--    كل مندوب ليه مرة واحدة من وقت ما بجددله اشتراكه.»
--
-- 🔑 المفتاح هو **التجديد** مش ضغطة الزرار: كل تمديد بيتسجّل في
--    `subscription_events`، والتفعيل بيتربط بآخر تجديد. ضغطتين على نفس التجديد
--    = لفّة واحدة. تمديد جديد الشهر الجاي = لفّة جديدة.
--
-- 🔒 وبيقفل ثغرة قديمة: `spin_wheel` كانت مفتوحة لأي مندوب مسجّل يندهها من غير
--    التطبيق ويدّي نفسه أيام. دلوقتي مابتشتغلش إلا بتفعيل من الأدمن.
--
-- الاحتمالات (بطلب المالك): ٤ أيام ١٪ · ٣ أيام ٥٪ · يومين ٤٧٪ · يوم ٤٧٪.
-- لازم تفضل مطابقة لـ`lib/wheel.ts`.
--
-- آمن للتكرار. شغّله مرة واحدة في: Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) خانتين على المندوب ─────────────────────────────────────────────────
alter table public.profiles
  add column if not exists wheel_spin_at   timestamptz,   -- لفّة مفعّلة مستنية (null = مفيش)
  add column if not exists wheel_grant_key timestamptz;   -- التجديد اللي اتفعّلت عليه آخر لفّة

comment on column public.profiles.wheel_spin_at is
  'الأدمن فعّل لفّة عجلة حظ — بتتصفّر أول ما المندوب يلفّ';
comment on column public.profiles.wheel_grant_key is
  'created_at بتاع التجديد اللي اتفعّلت عليه آخر لفّة — يمنع لفّتين على نفس التجديد';

-- ── (٢) سجل اللفّات: كان صف واحد لكل مندوب للأبد، بقى متعدد ────────────────
--     السجل القديم **مايتمسحش** — بنغيّر المفتاح بس.
create table if not exists public.wheel_spins (
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  days_won   int  not null,
  applied_to text not null,
  spun_at    timestamptz not null default now()
);

alter table public.wheel_spins add column if not exists id bigint;

do $$
begin
  -- رقم تسلسلي للصفوف القديمة اللي مالهاش id
  if exists (select 1 from public.wheel_spins where id is null) then
    with n as (select ctid, row_number() over (order by spun_at) as rn from public.wheel_spins where id is null)
    update public.wheel_spins w set id = n.rn from n where w.ctid = n.ctid;
  end if;

  if not exists (select 1 from pg_sequences where schemaname = 'public' and sequencename = 'wheel_spins_id_seq') then
    create sequence public.wheel_spins_id_seq owned by public.wheel_spins.id;
  end if;
  perform setval('public.wheel_spins_id_seq', coalesce((select max(id) from public.wheel_spins), 0) + 1, false);

  -- المفتاح القديم كان على agent_id (لفّة واحدة للأبد) — نشيله ونحط id مكانه
  if exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'wheel_spins' and c.contype = 'p' and c.conname = 'wheel_spins_pkey'
  ) then
    -- لو المفتاح أصلاً على id مانعملش حاجة
    if (select count(*) from pg_attribute a
         join pg_constraint c on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
         join pg_class t on t.oid = c.conrelid
        where t.relname = 'wheel_spins' and c.contype = 'p' and a.attname = 'agent_id') > 0 then
      alter table public.wheel_spins drop constraint wheel_spins_pkey;
      alter table public.wheel_spins alter column id set not null;
      alter table public.wheel_spins alter column id set default nextval('public.wheel_spins_id_seq');
      alter table public.wheel_spins add primary key (id);
    end if;
  else
    alter table public.wheel_spins alter column id set not null;
    alter table public.wheel_spins alter column id set default nextval('public.wheel_spins_id_seq');
    alter table public.wheel_spins add primary key (id);
  end if;
end $$;

create index if not exists wheel_spins_agent_idx on public.wheel_spins(agent_id, spun_at desc);

alter table public.wheel_spins enable row level security;

-- المندوب يقرأ صفوفه هو بس. الكتابة عبر الدالة فقط.
drop policy if exists wheel_spins_own_read on public.wheel_spins;
create policy wheel_spins_own_read on public.wheel_spins
  for select using (agent_id = auth.uid());

-- الأدمن يقرأ الكل (عشان صفحة المندوب تعرض آخر لفّة).
drop policy if exists wheel_spins_admin_read on public.wheel_spins;
create policy wheel_spins_admin_read on public.wheel_spins
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ⚠️ Supabase وقّفت المنح التلقائي للجداول الجديدة — لازم منح صريح.
grant select on public.wheel_spins to authenticated;
grant all    on public.wheel_spins to service_role;

-- ── (٣) اللفّة نفسها — مش هتشتغل من غير تفعيل ──────────────────────────────
create or replace function public.spin_wheel()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_days  int;
  v_voice date;
  v_rest  date;
  v_ext_voice boolean;
  v_ext_rest  boolean;
  v_applied text;
  v_granted timestamptz;
  r double precision;
begin
  if v_uid is null then
    return json_build_object('error', 'no-auth');
  end if;

  -- 🔒 لازم الأدمن يكون فعّل لفّة. مافيش تفعيل = مافيش لفّة، مهما اتنده على
  --    الدالة من بره التطبيق.
  select wheel_spin_at into v_granted from profiles where id = v_uid;
  if v_granted is null then
    return json_build_object('error', 'not-granted');
  end if;

  -- عشوائي موزون **على السيرفر** — المتصفّح مايقدرش يغش.
  -- لازم يفضل مطابق لـpickDays في lib/wheel.ts.
  r := random();
  if    r < 0.01 then v_days := 4;
  elsif r < 0.06 then v_days := 3;
  elsif r < 0.53 then v_days := 2;
  else                v_days := 1;
  end if;

  select voicex_until, rest_until into v_voice, v_rest from profiles where id = v_uid;

  -- الأيام بتتضاف للخدمة اللي ليها تاريخ (يعني مشترك فيها). النَل = بلا حد فبنسيبه.
  -- خدمة تاريخها عدّى بتتمدّد من النهاردة (بتتفعّل من تاني).
  v_ext_voice := v_voice is not null;
  v_ext_rest  := v_rest  is not null;

  if v_ext_voice then
    update profiles set voicex_until = greatest(voicex_until, current_date) + v_days where id = v_uid;
  end if;
  if v_ext_rest then
    update profiles set rest_until = greatest(rest_until, current_date) + v_days where id = v_uid;
  end if;

  -- تاريخ الحساب العام = الأبعد (عشان قفل الحساب الكلي مايتكسرش).
  update profiles
     set subscription_end = greatest(
           coalesce(subscription_end, current_date),
           coalesce(voicex_until, current_date),
           coalesce(rest_until, current_date)),
         wheel_spin_at = null        -- 🔒 اللفّة اتستهلكت
   where id = v_uid;

  v_applied := case
    when v_ext_voice and v_ext_rest then 'both'
    when v_ext_voice then 'voice'
    when v_ext_rest  then 'rest'
    else 'none' end;

  insert into wheel_spins(agent_id, days_won, applied_to) values (v_uid, v_days, v_applied);

  return json_build_object('days', v_days, 'applied_to', v_applied);
end $$;

revoke execute on function public.spin_wheel() from public;
revoke execute on function public.spin_wheel() from anon;
grant  execute on function public.spin_wheel() to authenticated;

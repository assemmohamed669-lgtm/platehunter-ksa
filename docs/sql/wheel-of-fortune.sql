-- ═══════════════════════════════════════════════════════════════════════════
-- عجلة الحظ — إضافة أيام لاشتراك المندوب من السيرفر (آمن، لفّة واحدة لكل مندوب).
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor).
--
-- • السيرفر هو اللي بيقرّر النتيجة (عشوائي موزون) ويضيف الأيام — المتصفح مايقدرش
--   يغش. الاحتمالات: ٤ أيام ١٪ · ٣ أيام ١٠٪ · يومين ٤٤.٥٪ · يوم ٤٤.٥٪.
-- • كل مندوب يلفّ **مرة واحدة** (جدول wheel_spins عليه PK على agent_id).
-- • الأيام بتتضاف للخدمة اللي المندوب مشترك فيها: الصوت (voicex_until) و/أو باقي
--   البرنامج (rest_until) — اللي ليها تاريخ (مش unlimited). subscription_end = الأبعد.
--   الخدمة اللي تاريخها عدّى بتتمدّد من النهاردة (بتتفعّل من تاني).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.wheel_spins (
  agent_id   uuid primary key references public.profiles(id) on delete cascade,
  days_won   int  not null,
  applied_to text not null,             -- 'voice' | 'rest' | 'both' | 'none'
  spun_at    timestamptz not null default now()
);

alter table public.wheel_spins enable row level security;

-- المندوب يقرأ صفّه هو بس (عشان نعرف إنه لفّ قبل كده). الكتابة عبر الدالة فقط.
drop policy if exists wheel_spins_own_read on public.wheel_spins;
create policy wheel_spins_own_read on public.wheel_spins
  for select using (agent_id = auth.uid());

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
  r double precision;
  ex_days int;
  ex_applied text;
begin
  if v_uid is null then
    return json_build_object('error', 'no-auth');
  end if;

  -- لفّ قبل كده؟ رجّع نفس النتيجة بلا إضافة.
  select days_won, applied_to into ex_days, ex_applied from wheel_spins where agent_id = v_uid;
  if found then
    return json_build_object('days', ex_days, 'applied_to', ex_applied, 'already', true);
  end if;

  -- عشوائي موزون على السيرفر.
  r := random();
  if    r < 0.01  then v_days := 4;
  elsif r < 0.11  then v_days := 3;
  elsif r < 0.555 then v_days := 2;
  else                 v_days := 1;
  end if;

  select voicex_until, rest_until into v_voice, v_rest from profiles where id = v_uid;

  -- بنمدّد الخدمة اللي ليها تاريخ (يعني المندوب مشترك فيها). النَل = بلا حد فبنسيبه.
  v_ext_voice := v_voice is not null;
  v_ext_rest  := v_rest  is not null;

  -- لو الاتنين بلا حد (حالة نادرة/سوبر) مافيش حاجة تتضاف.
  if v_ext_voice then
    update profiles
       set voicex_until = greatest(voicex_until, current_date) + v_days
     where id = v_uid;
  end if;
  if v_ext_rest then
    update profiles
       set rest_until = greatest(rest_until, current_date) + v_days
     where id = v_uid;
  end if;

  -- تاريخ الحساب العام = الأبعد (عشان قفل الحساب الكلي مايتكسرش).
  update profiles
     set subscription_end = greatest(
           coalesce(subscription_end, current_date),
           coalesce(voicex_until, current_date),
           coalesce(rest_until, current_date))
   where id = v_uid;

  v_applied := case
    when v_ext_voice and v_ext_rest then 'both'
    when v_ext_voice then 'voice'
    when v_ext_rest  then 'rest'
    else 'none' end;

  insert into wheel_spins(agent_id, days_won, applied_to)
    values (v_uid, v_days, v_applied);

  return json_build_object('days', v_days, 'applied_to', v_applied, 'already', false);
end $$;

grant execute on function public.spin_wheel() to authenticated;

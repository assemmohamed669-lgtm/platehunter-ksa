-- ═══════════════════════════════════════════════════════════════════════════
-- إصلاحات مراجعة ميزة المجموعات — **مهم جدًا، شغّله بعد باقي ملفات المجموعات**.
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- بيصلّح حاجتين حقيقيتين اتكشفوا في المراجعة:
--
-- (١) **المشاركة ماكانتش شغّالة أصلًا**: RLS على profiles بيسمح للمندوب يقرا
--     صفّه هو بس. فأي استعلام بيحاول يعرف «مين في مجموعتي» كان بيرجّع المندوب
--     نفسه بس — يعني صفحة سجلات المجموعة وفرز المجموعة كانوا بيعرضوا **سجلاته
--     هو بس** مش سجلات المجموعة. الحل: دوال security definer بترجّع أعضاء
--     المجموعة (id/اسم بس — من غير ما تكشف إيميل أو تليفون أو مفاتيح)، والسياسات
--     تعتمد عليها.
--
-- (٢) **تطبيع اللوحة كان مختلف بين التطبيق والسيرفر**: التطبيق بيكمّل الرقم
--     لأربع خانات بأصفار (ابح٧٥ → ابح0075) والسيرفر مكانش بيعمل كده، فأي لوحة
--     رقمها أقل من ٤ خانات ماكانتش بتطابق في فرز المجموعة (بتضيع بصمت).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (أ) دوال المجموعة (security definer — بتتخطّى RLS بأمان وبترجّع الضروري بس)
create or replace function public.my_team() returns text
  language sql stable security definer set search_path = public as $$
  select team from public.profiles where id = auth.uid()
$$;

create or replace function public.my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where p.team is not null and p.team = (select team from public.profiles where id = auth.uid())
$$;

-- بترجّع الاسم + المعرّف بس (مش الإيميل/التليفون/المفاتيح) — للعرض في التطبيق.
create or replace function public.my_team_members() returns table (id uuid, username text)
  language sql stable security definer set search_path = public as $$
  select p.id, p.username from public.profiles p
  where p.team is not null and p.team = (select team from public.profiles where id = auth.uid())
$$;

grant execute on function public.my_team() to authenticated;
grant execute on function public.my_team_member_ids() to authenticated;
grant execute on function public.my_team_members() to authenticated;

-- ── (ب) سياسات قراءة سجلات المجموعة — تعتمد على الدالة بدل استعلام profiles
--        (اللي كان RLS بيقصّه على صف المندوب نفسه فالمشاركة ماكانتش بتحصل).
drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));

drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));

-- ── (ج) تطبيع اللوحة: يطابق normalizePlate في التطبيق بالظبط —
--        الحروف + **أول** مجموعة أرقام مكمّلة لأربع خانات بأصفار.
--        لازم نشيل العمود المحسوب الأول (قيمه المخزّنة اتحسبت بالدالة القديمة
--        ومابتتحدّثش لوحدها)، نبدّل الدالة، وبعدين نرجّعه فيتحسب من جديد.
drop index if exists public.field_checks_platenorm_idx;
alter table public.field_checks drop column if exists plate_norm;

create or replace function public.norm_plate(p text) returns text
language sql immutable as $$
  with c as (
    select regexp_replace(
      translate(coalesce(p, ''), 'أإآى٠١٢٣٤٥٦٧٨٩ـ', 'اااي0123456789'),
      '[^0-9ء-ي]', '', 'g') as v
  )
  select case
    when substring(v from '[0-9]+') is null then v          -- مفيش أرقام → زي ما هي
    else regexp_replace(v, '[0-9]', '', 'g')
         || lpad(substring(v from '[0-9]+'),
                 greatest(4, length(substring(v from '[0-9]+'))), '0')
  end
  from c;
$$;

alter table public.field_checks
  add column plate_norm text generated always as (public.norm_plate(plate)) stored;
create index if not exists field_checks_platenorm_idx on public.field_checks(plate_norm);

-- ── (د) الـRPC كمان يعتمد على دالة الأعضاء (بدل استعلام profiles المقصوص).
create or replace function public.match_group_plates(p_norms text[])
returns table (id uuid, plate text, method text, maps_link text, checked_at timestamptz, agent_id uuid)
language sql stable security invoker as $$
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id
  from public.field_checks fc
  where fc.plate_norm = any(p_norms)
    and fc.agent_id in (select public.my_team_member_ids());
$$;
grant execute on function public.match_group_plates(text[]) to authenticated;

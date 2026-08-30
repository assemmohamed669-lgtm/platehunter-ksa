-- =====================================================================
-- استطلاع رأي للمناديب — الأدمن ينشئ سؤال + خيارات، وكل مندوب يصوّت **خيار
-- واحد** (يقدر يغيّره طول ما الاستطلاع نشط)، والأدمن يشوف **مين اختار إيه**
-- بالاسم + عدد كل خيار. زي استطلاع واتساب.
--
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). آمن للتشغيل المتكرر.
-- الوصول كله عبر دوال security definer (زي نظام الإشعارات) — مفيش وصول مباشر
-- للجداول، فالصلاحيات مضبوطة جوّه الدوال.
-- =====================================================================

create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  options    jsonb not null,                 -- ["خيار 1","خيار 2", ...]
  active      boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.polls enable row level security;      -- مفيش سياسات = ممنوع مباشر

create table if not exists public.poll_votes (
  poll_id  uuid not null references public.polls(id) on delete cascade,
  agent_id uuid not null,
  choice   int not null,                     -- index الخيار المختار
  voted_at timestamptz not null default now(),
  primary key (poll_id, agent_id)            -- صوت واحد لكل مندوب لكل استطلاع
);
alter table public.poll_votes enable row level security;
create index if not exists poll_votes_poll_idx on public.poll_votes(poll_id);

-- ── إنشاء استطلاع (أدمن فقط) — بيقفل أي استطلاع نشط قديم وينشئ جديد. ──
create or replace function public.create_poll(p_question text, p_options jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q text := nullif(btrim(coalesce(p_question, '')), '');
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'NOT_ADMIN'; end if;
  if v_q is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
    raise exception 'BAD_INPUT'; end if;
  update public.polls set active = false where active;
  insert into public.polls(question, options, created_by) values (v_q, p_options, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

-- ── الاستطلاع النشط + صوت المستخدم الحالي (لأي مسجّل دخول). ──
create or replace function public.get_active_poll()
returns table(id uuid, question text, options jsonb, created_at timestamptz, my_choice int)
language sql security definer set search_path = public as $$
  select p.id, p.question, p.options, p.created_at,
    (select v.choice from public.poll_votes v where v.poll_id = p.id and v.agent_id = auth.uid())
  from public.polls p where p.active order by p.created_at desc limit 1;
$$;

-- ── تصويت/تغيير صوت (المستخدم لنفسه، على استطلاع نشط). ──
create or replace function public.submit_vote(p_poll uuid, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.polls where id = p_poll and active) then
    raise exception 'POLL_CLOSED'; end if;
  insert into public.poll_votes(poll_id, agent_id, choice) values (p_poll, auth.uid(), p_choice)
    on conflict (poll_id, agent_id) do update set choice = excluded.choice, voted_at = now();
end $$;

-- ── نتايج استطلاع (أدمن فقط): كل مندوب صوّت + اسمه + اختياره. ──
create or replace function public.get_poll_results(p_poll uuid)
returns table(agent_id uuid, username text, choice int, voted_at timestamptz)
language sql security definer set search_path = public as $$
  select v.agent_id, pr.username, v.choice, v.voted_at
  from public.poll_votes v
  left join public.profiles pr on pr.id = v.agent_id
  where v.poll_id = p_poll
    and exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin')
  order by v.voted_at desc;
$$;

-- ── قفل الاستطلاع (أدمن فقط). ──
create or replace function public.close_poll(p_poll uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'NOT_ADMIN'; end if;
  update public.polls set active = false where id = p_poll;
end $$;

-- ── الصلاحيات (إلزامي — قرار سحب execute الافتراضي في فحص الأمان). ──
grant execute on function public.create_poll(text, jsonb)  to authenticated;
grant execute on function public.get_active_poll()          to authenticated;
grant execute on function public.submit_vote(uuid, int)     to authenticated;
grant execute on function public.get_poll_results(uuid)     to authenticated;
grant execute on function public.close_poll(uuid)           to authenticated;

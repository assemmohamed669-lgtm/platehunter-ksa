-- ═══════════════════════════════════════════════════════════════════════════
--  سجل الأحداث الأمنية — عشان تعرف مين بيحاول يوصل للتطبيق بلا تصريح.
--  شغّله مرة واحدة في: Supabase → SQL Editor. آمن للتكرار.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  التصميم — نقطتين مهمين:
--
--  ١) **مافيش دالة جديدة مكشوفة على الـAPI.** الكتابة كلها من السيرفر بمفتاح
--     الخدمة (بيتخطّى RLS)، فمافيش سطح هجوم جديد. الجدول ده **مالوش سياسة
--     INSERT** خالص — يعني ولا مندوب ولا زائر يقدر يكتب فيه ولا صف.
--
--  ٢) **agent_id بـon delete set null** مش cascade: لو حساب اتمسح، سجل
--     الأحداث بيفضل. سجل تدقيق بيتمسح مع الحساب مالوش قيمة — وعمود
--     actor_label بيحفظ الاسم/الإيميل وقت الحدث فالصف يفضل مفهوم.
--
--  حدّ معروف: **كلمة سر غلط مابتوصلش الكود بتاعنا** — Supabase Auth بيرفضها
--  قبل أي حاجة. تشوفها في Supabase → Logs → Auth Logs (احتفاظ ٧ أيام).
--  الجدول ده بيسجّل اللي بيوصل تطبيقنا: نداءات API بلا تصريح، تعدّي الحدود،
--  الدخول بحساب مربوط بجهاز تاني، وكل إجراء أدمن.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.security_events (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  type         text not null,                                    -- من قايمة مقفولة في lib/securityLog.ts
  agent_id     uuid references auth.users(id) on delete set null,
  actor_label  text,                                             -- الاسم/الإيميل وقت الحدث
  target_id    uuid,                                             -- لإجراءات الأدمن: مين المتأثر
  target_label text,
  detail       text,                                             -- المسار أو اسم الإجراء
  suppressed   int not null default 0,                           -- كم محاولة مكررة اتخنقت
  ip           text,
  user_agent   text
);

create index if not exists security_events_at_idx   on public.security_events(at desc);
create index if not exists security_events_type_idx on public.security_events(type, at desc);

alter table public.security_events enable row level security;

-- قراءة للسوبر أدمن فقط (نفس نمط deleted_profiles).
drop policy if exists security_events_super_select on public.security_events;
create policy security_events_super_select on public.security_events
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.is_super = true
  ));

-- **مقصود: مافيش سياسة INSERT/UPDATE/DELETE.** الكتابة من السيرفر بمفتاح
-- الخدمة بس، والمسح بالدالة تحت.

-- ── تنظيف: احتفاظ ٩٠ يوم (السجل مايكبرش بلا حد) ──────────────────────────
create or replace function public.prune_security_events(p_days int default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_super = true) then
    raise exception 'NOT_SUPER';
  end if;
  delete from public.security_events where at < now() - (p_days || ' days')::interval;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- منح صريح — لازم دلوقتي بعد ما شلنا المنح الافتراضي لـPUBLIC.
grant execute on function public.prune_security_events(int) to authenticated;

-- ── تحقّق بعد التشغيل ─────────────────────────────────────────────────────
--   select count(*) from public.security_events;
--   select policyname from pg_policies where tablename = 'security_events';

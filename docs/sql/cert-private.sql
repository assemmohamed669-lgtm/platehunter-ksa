-- ═══════════════════════════════════════════════════════════════════════════
-- 🔒 الشهايد الخاصة — حساب درايف تاني لناس معيّنة بس (١٧ نوفمبر ٢٠٢٦)
--
-- المالك: «الايميل القديم المربوط حاليا ل المستخدمين هيفضل زي ماهو والايميل الجديد اللي هنربطه دة هيبقي
-- ل ناس معينه فقط انا اختارهم».
--
-- ٣ جداول جديدة بس — الجداول القديمة (cert_daily · cert_push_state) مابتتلمسش:
--   · cert_daily_private       شهايد الحساب التاني (نفس أعمدة cert_daily بالظبط، بتتمسح بعد أسبوع زيها)
--   · cert_push_state_private  آخر شهادة اتبعت عنها إشعار من الحساب التاني
--   · cert_private_access      المختارين: السوبر أدمن بيضيفهم بالاسم، ولكل واحد «الجديد بس» أو «الجديد والقديم»
-- للسيرفر بس (مفتاح الخدمة): RLS مقفول ومفيش أي سياسة. المنح صريح (Supabase بطّلت تدّيه لوحدها).
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين. مايغيّرش أي حاجة عند المناديب.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cert_daily_private (
  file_id     text primary key,
  day         date not null,
  created_at  timestamptz not null,
  name        text not null default '',
  uploader    text not null default '',
  plate       text not null default '',
  plate_text  text not null default '',
  vin         text not null default '',
  bank        text not null default '',
  make        text not null default '',
  model       text not null default '',
  year        text not null default '',
  color       text not null default '',
  status      text not null default '',
  cert_date   text not null default '',
  cert_no     text,
  tenant      text,
  parsed      boolean not null default false,
  tries       int not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists cert_daily_private_day_idx on public.cert_daily_private (day, created_at);
create index if not exists cert_daily_private_pending_idx on public.cert_daily_private (day) where not parsed;

alter table public.cert_daily_private enable row level security;
revoke all on public.cert_daily_private from public, anon, authenticated;
grant select, insert, update, delete on public.cert_daily_private to service_role;


create table if not exists public.cert_push_state_private (
  id               int primary key default 1 check (id = 1),
  last_created_at  timestamptz,   -- null = لسه أول مرة ⇒ بيعلّم بس من غير ما يبعت
  last_sent_at     timestamptz
);
insert into public.cert_push_state_private (id) values (1) on conflict do nothing;

alter table public.cert_push_state_private enable row level security;
revoke all on public.cert_push_state_private from public, anon, authenticated;
grant select, insert, update on public.cert_push_state_private to service_role;


create table if not exists public.cert_private_access (
  agent_id    uuid primary key,
  mode        text not null default 'both' check (mode in ('private_only', 'both')),
  added_by    uuid,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.cert_private_access enable row level security;
revoke all on public.cert_private_access from public, anon, authenticated;
grant select, insert, update, delete on public.cert_private_access to service_role;

select 'الشهايد الخاصة تمام' as done;

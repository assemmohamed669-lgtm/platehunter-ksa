-- ═══════════════════════════════════════════════════════════════════════════
-- إشعارات الهاتف (push) — جدول توكنات الأجهزة.
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- كل موبايل بيسجّل توكن FCM بتاعه هنا. لما مندوب يلاقي سيارة مطلوبة، السيرفر
-- بيجيب توكنات باقي المجموعة من الجدول ده ويبعتلهم إشعار — حتى والتطبيق مقفول.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.device_tokens (
  token       text primary key,
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  platform    text not null default 'android',
  updated_at  timestamptz not null default now()
);

create index if not exists device_tokens_agent_idx on public.device_tokens(agent_id);

alter table public.device_tokens enable row level security;

-- المندوب يقدر يسجّل/يحدّث/يمسح توكن جهازه هو بس. السيرفر (service role)
-- بيتخطّى ده وبيقرا توكنات المجموعة عشان يبعت.
-- ملحوظة: (select auth.uid()) بدل auth.uid() عشان تتنفّذ مرة واحدة مش لكل صف.
drop policy if exists "own device tokens" on public.device_tokens;
create policy "own device tokens" on public.device_tokens for all to authenticated
  using (agent_id = (select auth.uid()))
  with check (agent_id = (select auth.uid()));

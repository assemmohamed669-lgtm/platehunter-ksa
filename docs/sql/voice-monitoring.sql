-- ═══════════════════════════════════════════════════════════════════════════
-- 🩺 مراقبة الصوت (٣ أكتوبر ٢٠٢٦)
--
-- المالك: «عايز مراقبة شاملة علشان لما تحصل حاجة زي كده نرجع ونعرف إيه اللي
-- حصل والسبب ونحلّه — المهم مايأثرش على المناديب ولا شغل السيرفر».
--
-- جدولين:
--   (١) voice_telemetry — ملخّص من موبايل المندوب كل دقيقتين وهو بيسجّل في
--       Voice PRO: كل نافذة اتبعتت ورد السيرفر عليها، الفشل بكوده، الإعادة،
--       واللوحات اللي ظهرت. **مافيش صوت خالص** — أرقام وجمل قصيرة بس.
--   (٢) voice_health — مراقب من بره (Vercel cron) كل دقيقة: سيرفر ماليزيا
--       صاحي؟ بيرد في كام؟ كام طلب شغّال؟ **مابيلمسش السيرفر** غير بـ /health.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- تشغيله **مايغيّرش أي حاجة** عند أي مندوب — التطبيق بيبدأ يكتب لما ينزل الكود.
--
-- الحجم: صف كل دقيقتين لكل مندوب شغّال على الصوت (مش مع كل طلب) + صف كل دقيقة
-- للمراقب. الأقدم من ٣٠ يوم بيتمسح أوتوماتيك من المراقب نفسه.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) سجل الصوت من الموبايل ──────────────────────────────────────────────
create table if not exists public.voice_telemetry (
  id                 bigint generated always as identity primary key,
  agent_id           uuid not null,
  session_id         text not null,
  session_started_at timestamptz,
  started_at         timestamptz not null,
  ended_at           timestamptz not null,
  platform           text,
  build              text,
  server             text,
  counts             jsonb not null default '{}'::jsonb,
  latency            jsonb not null default '{}'::jsonb,
  events             jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  -- حارس حجم: الدفعة الطبيعية ٢-١٦ كيلو؛ أي حاجة فوق ٦٤ كيلو غلط في الكود.
  constraint voice_telemetry_events_size check (octet_length(events::text) < 65536)
);

create index if not exists voice_telemetry_agent_started_idx
  on public.voice_telemetry (agent_id, started_at desc);
create index if not exists voice_telemetry_started_idx
  on public.voice_telemetry (started_at);

alter table public.voice_telemetry enable row level security;

-- منح صريح للـData API (الجداول الجديدة مابتاخدش وصول تلقائي). RLS تحت
-- بتحكم مين يقرا/يكتب فعلاً. مافيش update/delete للمستخدمين خالص.
grant select, insert on public.voice_telemetry to authenticated;
grant select, insert, update, delete on public.voice_telemetry to service_role;

-- المندوب يكتب صفوفه هو بس.
drop policy if exists "agent inserts own voice telemetry" on public.voice_telemetry;
create policy "agent inserts own voice telemetry" on public.voice_telemetry for insert to authenticated
  with check (agent_id = (select auth.uid()));

-- القراية للسوبر أدمن بس.
drop policy if exists "super reads voice telemetry" on public.voice_telemetry;
create policy "super reads voice telemetry" on public.voice_telemetry for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_super = true));

-- ── (٢) نبض سيرفر الصوت من بره ─────────────────────────────────────────────
create table if not exists public.voice_health (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  target      text not null,
  ok          boolean not null,
  status      integer,
  ms          integer,
  inflight    integer,
  error       text,
  detail      jsonb
);

create index if not exists voice_health_checked_idx
  on public.voice_health (checked_at desc);

alter table public.voice_health enable row level security;

-- الكتابة من المراقب بس (service_role) — مافيش insert لأي مستخدم.
grant select on public.voice_health to authenticated;
grant select, insert, update, delete on public.voice_health to service_role;

drop policy if exists "super reads voice health" on public.voice_health;
create policy "super reads voice health" on public.voice_health for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_super = true));

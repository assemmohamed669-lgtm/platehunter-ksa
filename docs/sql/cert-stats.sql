-- ═══════════════════════════════════════════════════════════════════════════
-- 📊 إحصائيات الشهايد — العدّ على السيرفر في الخلفية (٤ أكتوبر ٢٠٢٦)
--
-- المالك: العدّ من الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف ملف ولسه. فالسيرفر بيعدّ لوحده كل
-- دقيقة (/api/cron/cert-stats) ويحفظ هنا، والصفحة بتفتح على طول بآخر نتيجة.
--
--   (١) cert_stats_state — صف واحد: حالة العدّ + آخر نتيجة + قفل الدورة.
--   (٢) cert_stats_plates — كل لوحة ليها شهادة مرة واحدة (عدد الصفوف = عدد اللوحات المختلفة).
--   (٣) cert_stats_plate_uploaders — كل لوحة مع كل حساب رفعها (لوحات كل شركة).
--
-- للسيرفر بس (مفتاح الخدمة): RLS مقفول ومفيش أي سياسة ⇒ ولا مندوب ولا حد من بره يشوفهم.
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- مايغيّرش أي حاجة عند المناديب — مفيش جدول قديم بيتلمس.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cert_stats_state (
  id          int primary key,
  state       jsonb not null default '{}'::jsonb,
  lock_until  timestamptz,
  updated_at  timestamptz not null default now()
);
insert into public.cert_stats_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.cert_stats_plates (
  k     text primary key,
  pass  int  not null
);
create index if not exists cert_stats_plates_pass_idx on public.cert_stats_plates (pass);

create table if not exists public.cert_stats_plate_uploaders (
  k     text not null,
  u     text not null,
  pass  int  not null,
  primary key (k, u)
);
create index if not exists cert_stats_plate_uploaders_u_pass_idx on public.cert_stats_plate_uploaders (u, pass);
create index if not exists cert_stats_plate_uploaders_pass_idx on public.cert_stats_plate_uploaders (pass);

alter table public.cert_stats_state           enable row level security;
alter table public.cert_stats_plates          enable row level security;
alter table public.cert_stats_plate_uploaders enable row level security;

-- السيرفر بس. (الجداول الجديدة مابتاخدش وصول تلقائي — المنح صريح.)
revoke all on public.cert_stats_state, public.cert_stats_plates, public.cert_stats_plate_uploaders from anon, authenticated;
grant select, insert, update, delete on public.cert_stats_state           to service_role;
grant select, insert, update, delete on public.cert_stats_plates          to service_role;
grant select, insert, update, delete on public.cert_stats_plate_uploaders to service_role;

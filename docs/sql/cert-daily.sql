-- ═══════════════════════════════════════════════════════════════════════════
-- 📄 «شهايد النهارده» — الفرز على الشهايد اللي بتترفع كل يوم (٥ أكتوبر ٢٠٢٦)
--
-- المالك: «احنا هنخلي الفرز علي الشهايد اللي بتنزل يومي … انهردة يفرز علي ال 690 شهادة دول بس».
-- السيرفر (كل دقيقة /api/cron/cert-daily) بيلقط شهايد النهارده ويقرا من كل واحدة: اللوحة
-- والشاص والبنك وبيانات العربية وحالة العقد وتاريخ الشهادة — ويحفظها هنا. صفحة المطلوب بتفرز عليها.
--
-- مفيش أي بيانات شخصية (اسم المستأجر/هويته/تليفونه) — العربية والبنك والعقد بس.
-- اللي أقدم من أسبوع بيتمسح لوحده.
-- للسيرفر بس (مفتاح الخدمة): RLS مقفول ومفيش أي سياسة.
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين. مايغيّرش أي حاجة عند المناديب.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cert_daily (
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
  parsed      boolean not null default false,
  tries       int not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists cert_daily_day_idx on public.cert_daily (day, created_at);
create index if not exists cert_daily_pending_idx on public.cert_daily (day) where not parsed;

alter table public.cert_daily enable row level security;

-- السيرفر بس. (الجداول الجديدة مابتاخدش وصول تلقائي — المنح صريح.)
revoke all on public.cert_daily from anon, authenticated;
grant select, insert, update, delete on public.cert_daily to service_role;

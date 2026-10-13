-- ═══════════════════════════════════════════════════════════════════════════
-- 📄🔔 إشعار الشهايد الجديدة على موبايلات المشتركين (المالك ١٣ أكتوبر ٢٠٢٦)
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين. مابيلمسش أي جدول موجود.
--
-- صف واحد بيفتكر «آخر شهادة اتبعت عنها إشعار» (وقت رفعها على درايف) — دورة الشهايد اليومية كل دقيقة
-- (`/api/cron/cert-daily` ⇒ `lib/certPushStore.ts`) بتبعت إشعار واحد لكل دفعة جديدة لما تبطّل تنزل ٥ دقايق.
-- للسيرفر بس (مفتاح الخدمة) — ولا مندوب ولا حد من برّه بيشوفه.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cert_push_state (
  id               int primary key default 1 check (id = 1),
  last_created_at  timestamptz,   -- آخر شهادة اتبعت عنها (null = لسه أول مرة ⇒ بيعلّم بس من غير ما يبعت)
  last_sent_at     timestamptz
);
insert into public.cert_push_state (id) values (1) on conflict do nothing;

alter table public.cert_push_state enable row level security;
revoke all on public.cert_push_state from anon, authenticated;
grant select, insert, update on public.cert_push_state to service_role;   -- Supabase بطّل يدّي الصلاحيات لوحده

select * from public.cert_push_state;

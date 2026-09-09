-- ═══════════════════════════════════════════════════════════════════════════
-- صفحة «حسابات المناديب» في الأدمن — دفعات + ملاحظة + رسوم شهرية اختيارية.
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor).
-- ═══════════════════════════════════════════════════════════════════════════

-- (1) أعمدة على profiles: ملاحظة الدفع (زي «قال هيسدد بعد يومين») + رسم شهري
--     اختياري (لو المالك عايز يحدّد رقم غير المقترح تلقائيًا من خطة المندوب).
alter table public.profiles add column if not exists payment_note text;
alter table public.profiles add column if not exists monthly_fee numeric;

-- (2) جدول الدفعات — صف لكل دفعة يسجّلها الأدمن.
create table if not exists public.agent_payments (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  amount     numeric not null,
  paid_at    date not null default current_date,
  method     text,          -- كاش/تحويل/... اختياري
  note       text,          -- ملاحظة على الدفعة نفسها
  created_by uuid,          -- الأدمن اللي سجّلها
  created_at timestamptz not null default now()
);
create index if not exists agent_payments_agent_idx   on public.agent_payments(agent_id);
create index if not exists agent_payments_paid_at_idx  on public.agent_payments(paid_at);

-- (3) RLS: الجدول مقفول للكل — الوصول عبر السيرفر (service role) في
--     /api/admin/payments بس (المسار متحقّق إنك أدمن). مفيش policies = مفيش
--     وصول للـanon/authenticated؛ والـservice role بيتخطّى RLS.
alter table public.agent_payments enable row level security;

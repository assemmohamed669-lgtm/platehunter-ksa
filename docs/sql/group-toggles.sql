-- ═══════════════════════════════════════════════════════════════════════════
-- مفاتيح المجموعة: (١) إشعارات السيارات المطلوبة  (٢) مشاركة السجلات.
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- الافتراضي **الاتنين مفتوحين** — يعني المجموعات الشغّالة دلوقتي ماتتأثرش.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.group_settings (
  team                   text primary key,
  notify_enabled         boolean not null default true,   -- إشعار «لقى مطلوبة»
  share_records_enabled  boolean not null default true,   -- سجلات الكل تظهر للكل
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);

alter table public.group_settings enable row level security;

-- المندوب يقرا إعدادات مجموعته هو بس (التطبيق محتاجها عشان يعرف يبعت إشعار ولا لأ).
-- الكتابة من السيرفر بس (راوت الأدمن بمفتاح الخدمة) — مافيش سياسة كتابة بقصد.
drop policy if exists "read own team settings" on public.group_settings;
create policy "read own team settings" on public.group_settings for select to authenticated
  using (team = public.my_team());

-- ── مشاركة السجلات بتتطبّق من **مكان واحد**: دالة أعضاء المجموعة ────────────
-- كل سياسات القراءة (field_checks / chassis_records) والـRPC بتعتمد عليها، فقفل
-- المشاركة بيقفلها في كل مكان مرة واحدة — من غير ما نعدّل كل سياسة لوحدها.
-- المشاركة مقفولة ⇒ المندوب يشوف صفوفه هو بس.
create or replace function public.my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  with me as (
    select id, team from public.profiles where id = auth.uid()
  ),
  shared as (
    select coalesce(
      (select g.share_records_enabled from public.group_settings g, me where g.team = me.team),
      true
    ) as on
  )
  select p.id
  from public.profiles p, me, shared
  where me.team is not null
    and p.team = me.team
    and (shared.on or p.id = me.id)
$$;

grant execute on function public.my_team_member_ids() to authenticated;

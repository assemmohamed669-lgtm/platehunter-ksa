-- ═══════════════════════════════════════════════════════════════════════════
--  قطع الخدمة على مستوى السيرفر عند انتهاء الاشتراك (RLS)
--  يُشغَّل مرة واحدة في Supabase → SQL Editor. آمن للتشغيل المتكرر.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ليه: القطع دلوقتي في التطبيق بس — يعني الأوفلاين بيتخطّاه، وحد فاهم تقنياً
--  يقدر يوصل للداتا عبر الـAPI. ده بيقفل الثغرة من جذرها.
--
--  ⚠️ ضمانات السلامة (مهمة):
--   ١) **مفيش أي سياسة قايمة بتتغيّر ولا بتتمسح.** بنضيف سياسة RESTRICTIVE
--      واحدة لكل جدول — بتتجمع بـAND مع الموجود. لو حبينا نلغي الحماية،
--      بنمسح السياسة دي بس وكل حاجة ترجع زي ماكانت.
--   ٢) **مفيش ولا صف بيتمسح.** القطع بيمنع الاستخدام بس؛ كل سجلات المندوب
--      بتفضل مكانها على السيرفر، وترجع تشتغل فوراً أول ما يجدّد.
--   ٣) **مفتاح إيقاف فوري:** enforce_subscription (افتراضي false = مطفي).
--      بعد تشغيل الملف ده **مفيش أي تغيير في السلوك** لحد ما تشغّل المفتاح.
--   ٤) **متسامح عند الشك:** مفيش بروفايل / مفيش تاريخ اشتراك / مش «agent»
--      → مسموح. عشان مانقفلش على حد بالغلط.
--   ٥) **أوسع من التطبيق بيوم:** فرق التوقيت بين السيرفر (UTC) والتليفون ممكن
--      يزحزح اليوم، فالسيرفر بيدي يوم زيادة — عشان عمره ما يقطع عن حد التطبيق
--      لسه شايفه نشط.
--
--  ملاحظة: service_role (لوحة الأدمن/السكربتات) بيتخطّى RLS أصلاً، فمش متأثر.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) مفتاح التشغيل/الإيقاف ───────────────────────────────────────────────
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true)
);
alter table public.app_settings enable row level security;

alter table public.app_settings
  add column if not exists enforce_subscription boolean not null default false;

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- ── (٢) دالة الفحص ──────────────────────────────────────────────────────────
-- بترجّع true = مسموح. stable عشان تتحسب مرة واحدة للاستعلام مش لكل صف.
create or replace function public.has_active_access(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- المفتاح مطفي → مفيش قطع خالص (السلوك زي ما هو)
    when not coalesce((select enforce_subscription from public.app_settings where id), false)
      then true
    when p_uid is null then true
    else coalesce(
      (select
         -- موقوف يدوياً → مقطوع فوراً
         p.is_active
         and (
           p.role is distinct from 'agent'          -- الأدمن/السوبر مايتقطعوش
           or p.subscription_end is null            -- بدون اشتراك محدّد → مايتقطعش
           or p.subscription_end >= (current_date
                -- سماح: يوم للعادي، صفر للتجربة + يوم زيادة لفرق التوقيت
                - (case when coalesce(p.is_trial, false) then 0 else 1 end)
                - 1)
         )
       from public.profiles p
       where p.id = p_uid),
      true)   -- مفيش بروفايل → مانقفلش (متسامح عند الشك)
  end
$$;

grant execute on function public.has_active_access(uuid) to authenticated, anon;

-- ── (٣) مبدّل المفتاح — السوبر أدمن فقط ────────────────────────────────────
create or replace function public.set_enforce_subscription(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_super = true
  ) then
    raise exception 'NOT_SUPER';
  end if;
  insert into public.app_settings (id, enforce_subscription)
  values (true, coalesce(p_enabled, false))
  on conflict (id) do update set enforce_subscription = excluded.enforce_subscription;
end $$;

grant execute on function public.set_enforce_subscription(boolean) to authenticated;

-- ── (٤) السياسات المقيِّدة (بتتجمع AND مع الموجود، مابتستبدلوش) ─────────────
-- شغل المندوب الميداني
drop policy if exists "field_checks_require_active" on public.field_checks;
create policy "field_checks_require_active"
  on public.field_checks
  as restrictive
  for all
  to authenticated
  using (public.has_active_access())
  with check (public.has_active_access());

-- التسجيلات
drop policy if exists "recordings_require_active" on public.recordings;
create policy "recordings_require_active"
  on public.recordings
  as restrictive
  for all
  to authenticated
  using (public.has_active_access())
  with check (public.has_active_access());

-- ═══════════════════════════════════════════════════════════════════════════
--  بعد التشغيل — التحقّق (كله قراءة):
--
--  (أ) المفتاح لسه مطفي؟ (المفروض false)
--      select enforce_subscription from public.app_settings;
--
--  (ب) مين هيتأثر لو شغّلناه؟ (المفروض كل المناديب النشطين = true)
--      select username, role, is_active, is_trial, subscription_end,
--             public.has_active_access(id) as "مسموح؟"
--        from public.profiles order by role, username;
--
--  (ج) شغّل الحماية (سوبر أدمن من التطبيق) أو من هنا:
--      update public.app_settings set enforce_subscription = true where id;
--
--  (د) إيقاف فوري لو حصل أي مشكلة:
--      update public.app_settings set enforce_subscription = false where id;
--
--  (هـ) إلغاء كامل (رجوع للوضع الأصلي تماماً):
--      drop policy if exists "field_checks_require_active" on public.field_checks;
--      drop policy if exists "recordings_require_active"   on public.recordings;
-- ═══════════════════════════════════════════════════════════════════════════

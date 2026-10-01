-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 مشاركة سجلات المجموعة: سجلات الكل تظهر للكل لما «مشاركة السجلات» مفتوحة.
--
-- بلاغ المالك (١ أكتوبر ٢٠٢٦): السجلات بتظهر لمسئول المجموعة بس. السبب: نسخة
-- سياسة قراءة سجلات الزمايل الأولى (group-records.sql / group-chassis.sql) كانت
-- بتجيب أعضاء المجموعة باستعلام على profiles — وRLS بتاع profiles بيقصّه على صف
-- المندوب نفسه، فالعضو مابيلاقيش غير نفسه. المسئول (أدمن) بيشوف كله بسياسة الأدمن.
-- الإصلاح كان في group-fix.sql، بس تشغيل الملفات القديمة بعده بيرجّع الغلط.
--
-- الملف ده بيثبّت الصح ومربوط بزرار «مشاركة السجلات» في صفحة المجموعات:
--   مفتوح ⇒ كل عضو يشوف سجلات كل زمايله · مقفول ⇒ كل عضو يشوف سجلاته بس.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- مابيلمسش أي سجل — دوال وسياسات قراءة بس.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) أعضاء مجموعتي — مربوطة بزرار «مشاركة السجلات» ─────────────────────
create or replace function public.my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  with me as (
    select id, team from public.profiles where id = (select auth.uid())
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

-- أسامي الأعضاء للعرض في التطبيق (الاسم والمعرّف بس — مش الإيميل/التليفون)
create or replace function public.my_team_members() returns table (id uuid, username text)
  language sql stable security definer set search_path = public as $$
  select p.id, p.username from public.profiles p
  where p.team is not null
    and p.team = (select team from public.profiles where id = (select auth.uid()))
$$;

grant execute on function public.my_team_members() to authenticated;

-- ── (٢) قراءة سجلات الزمايل — بالدالة (مش باستعلام profiles) ───────────────
drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));

drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));

-- ── (٣) للتأكد: السياسات الحيّة على الجدولين بعد التشغيل ────────────────────
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename in ('field_checks', 'chassis_records')
order by tablename, policyname;

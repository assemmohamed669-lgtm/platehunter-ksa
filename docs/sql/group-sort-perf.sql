-- ═══════════════════════════════════════════════════════════════════════════
-- تسريع «فرز على سجلات المجموعة» (match_group_plates).
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين. نفس النتيجة
-- بالظبط — تحسين خطة التنفيذ بس.
--
-- المشكلة: `plate_norm = any(p_norms)` مع إحالة فيها آلاف اللوحات وجدول
-- field_checks بيكبر ⇒ المخطّط أحياناً بيعمل Seq Scan على الجدول كله (بطيء).
-- الحل: JOIN على unnest(p_norms) ⇒ لكل لوحة بحث بالفهرس (nested-loop index scan)،
-- + فهرس مركّب (plate_norm, agent_id) يغطّي شرط اللوحة وشرط عضو المجموعة مع بعض.
-- ═══════════════════════════════════════════════════════════════════════════

-- فهرس مركّب: اللوحة أولاً (أعلى انتقائية) ثم المندوب (لفلتر المجموعة).
create index if not exists field_checks_platenorm_agent_idx
  on public.field_checks(plate_norm, agent_id);

drop function if exists public.match_group_plates(text[]);
create function public.match_group_plates(p_norms text[])
returns table (
  id          uuid,
  plate       text,
  method      text,
  maps_link   text,
  checked_at  timestamptz,
  agent_id    uuid,
  extra       jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  -- distinct على اللوحات: لو الإحالة فيها تكرار مانعملش بحث مكرر.
  with norms as (select distinct n.norm from unnest(p_norms) as n(norm))
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id, fc.extra
  from norms
  join public.field_checks fc on fc.plate_norm = norms.norm
  where fc.agent_id in (select public.my_team_member_ids());
$$;

grant execute on function public.match_group_plates(text[]) to authenticated;

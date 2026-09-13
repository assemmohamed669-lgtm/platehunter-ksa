-- ═══════════════════════════════════════════════════════════════════════════
-- تفاصيل كاملة لسجلات المجموعة في الفرز.
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- `match_group_plates` كانت بترجّع اللوحة والحالة والموقع والتاريخ بس — فالحي
-- والنوع وملاحظات المندوب ماكانوش بيظهروا في نتيجة فرز سجلات المجموعة.
-- بنضيف عمود `extra` (اللي فيه كل ده) للراجع.
--
-- ملاحظة: لازم DROP الأول — Postgres مابيسمحش بتغيير أعمدة الراجع بـREPLACE.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.match_group_plates(text[]);

create function public.match_group_plates(p_norms text[])
returns table (
  id          uuid,
  plate       text,
  method      text,
  maps_link   text,
  checked_at  timestamptz,
  agent_id    uuid,
  extra       jsonb            -- الحي-الشارع + النوع + ملاحظات المندوب
)
language sql stable security invoker as $$
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id, fc.extra
  from public.field_checks fc
  where fc.plate_norm = any(p_norms)
    and fc.agent_id in (select public.my_team_member_ids());
$$;

grant execute on function public.match_group_plates(text[]) to authenticated;

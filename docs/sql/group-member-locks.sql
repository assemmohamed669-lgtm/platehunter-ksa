-- ═══════════════════════════════════════════════════════════════════════════
-- 🔒 صلاحيات أعضاء المجموعة + إشعار المطلوب للمسئول بس (المالك ١١ أكتوبر ٢٠٢٦)
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- كل المفاتيح **مقفولة افتراضياً** ⇒ أي مجموعة شغّالة دلوقتي ماتتأثرش لحد ما تفتح
-- المفتاح بإيدك من صفحة المجموعات (ومحتاجة مسئول).
-- المسئول = group_settings.leader_id. الأدمن بيتعامل زي المسئول (بيشوف كل حاجة).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) المفاتيح ──────────────────────────────────────────────────────────
alter table public.group_settings
  add column if not exists records_leader_only  boolean not null default false,  -- سجلات الأعضاء للمسئول بس
  add column if not exists lock_member_records  boolean not null default false,  -- العضو مايشوفش أي سجلات
  add column if not exists lock_member_sort     boolean not null default false,  -- العضو مايفرزش
  add column if not exists lock_member_download boolean not null default false,  -- العضو مايحمّلش السجلات
  add column if not exists lock_member_edit     boolean not null default false,  -- العضو مايعدّلش السجلات
  add column if not exists finds_leader_only    boolean not null default false;  -- لقطة المطلوب للمسئول بس

-- ── (٢) مين يشوف سجلات مين — نفس الدالة اللي كل السياسات بتعتمد عليها ─────
-- المفتاح مقفول ⇒ نفس group-share-records.sql بالحرف (share_records_enabled).
-- «للمسئول بس» مفتوح ⇒ المسئول (والأدمن) يشوف الكل، وأي عضو تاني يشوف صفوفه هو بس.
create or replace function public.my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  with me as (
    select id, team, role from public.profiles where id = (select auth.uid())
  ),
  gs as (
    select coalesce(g.share_records_enabled, true)  as shared,
           coalesce(g.records_leader_only, false)   as leader_only,
           g.leader_id
    from me left join public.group_settings g on g.team = me.team
  )
  select p.id
  from public.profiles p, me, gs
  where me.team is not null
    and p.team = me.team
    and (
      p.id = me.id
      or (gs.leader_only and (gs.leader_id = me.id or me.role = 'admin'))
      or (not gs.leader_only and gs.shared)
    )
$$;

grant execute on function public.my_team_member_ids() to authenticated;

-- ── (٣) لقطات المطلوب (group_finds) — «للمسئول بس» ⇒ المسئول + اللي لقاها بس ──
-- ده اللي بيمنع الإشعار جوّه التطبيق (Realtime بيحترم السياسة) عن باقي الأعضاء.
drop policy if exists "read own team finds" on public.group_finds;
create policy "read own team finds" on public.group_finds for select to authenticated
  using (
    team is not null
    and team = public.my_team()
    and (
      not coalesce((select g.finds_leader_only from public.group_settings g where g.team = group_finds.team), false)
      or (select g.leader_id from public.group_settings g where g.team = group_finds.team) = (select auth.uid())
      or finder_id = (select auth.uid())
    )
  );

-- ── (٤) للتأكد ─────────────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'group_settings'
  and column_name in ('records_leader_only','lock_member_records','lock_member_sort',
                      'lock_member_download','lock_member_edit','finds_leader_only')
order by column_name;

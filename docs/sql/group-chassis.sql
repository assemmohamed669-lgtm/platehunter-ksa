-- ═══════════════════════════════════════════════════════════════════════════
-- ضمّ سجلات الشاص للمشترك: المندوب يقرا سجلات شاص مجموعته (عرض + فرز).
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- (مطابقة الشاص تامة/تقريبية/بآخر الأرقام — بتتعمل في التطبيق زي ما هي، فمفيش
--  RPC هنا؛ بس صلاحية القراءة والفهرس.)
-- ═══════════════════════════════════════════════════════════════════════════

-- فهرس بيسرّع استعلام سجلات شاص المجموعة.
create index if not exists chassis_records_agent_checked_idx on public.chassis_records(agent_id, checked_at desc);

-- RLS: المندوب يقرا سجلات شاص زمايل مجموعته (بالإضافة لسجلاته — OR).
drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (
    agent_id in (
      select p.id from public.profiles p
      where p.team is not null
        and p.team = (select me.team from public.profiles me where me.id = auth.uid())
    )
  );

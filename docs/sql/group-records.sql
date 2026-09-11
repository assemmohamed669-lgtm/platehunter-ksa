-- ═══════════════════════════════════════════════════════════════════════════
-- سجلات المجموعة المشتركة: المندوب يقرا سجلات زمايل مجموعته (بالإضافة لسجلاته).
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- العضوية ديناميكية (profiles.team): أضف مندوب للمجموعة → سجلاته كلها تظهر
-- للمجموعة فورًا؛ شيله → تختفي. مفيش عمود مكرّر ولا نسخ داتا.
-- ملايين الصفوف تفضل على السيرفر — التطبيق بيجيبها بالتقسيم + البحث + الفرز
-- على السيرفر، مش بينزّلها كلها على الجهاز.
-- ═══════════════════════════════════════════════════════════════════════════

-- فهرس بيسرّع استعلام سجلات المجموعة (بالمندوب + التاريخ) حتى عند الملايين.
create index if not exists field_checks_agent_checked_idx on public.field_checks(agent_id, checked_at desc);

-- RLS: قراءة سجلات زمايل نفس المجموعة. دي **بالإضافة** لسياسة «سجلاتك أنت»
-- الموجودة (سياسات SELECT بتتجمع بـ OR)، فمحدش بيفقد سجلاته.
drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (
    agent_id in (
      select p.id from public.profiles p
      where p.team is not null
        and p.team = (select me.team from public.profiles me where me.id = auth.uid())
    )
  );

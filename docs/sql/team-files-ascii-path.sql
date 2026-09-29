-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ملفات المجموعة (داتا + تشييك): مسار التخزين بقى **كود إنجليزي** للمجموعة.
--
-- المشكلة (بلاغ المالك ٢٩ سبتمبر ٢٠٢٦ — «مجموعه بوحه»): تخزين Supabase بيرفض
-- أي حرف برّه ASCII في مسار الملف (400 InvalidKey)، والمسار كان اسم المجموعة
-- نفسه («مجموعه بوحه/data.xlsx»). فملفات المجموعة **عمرها ما اترفعت** لأي
-- مجموعة اسمها عربي — والمسئول كان بيرفع والأعضاء مابيوصلهمش حاجة.
--
-- الحل: المسار = 't-' + UTF-8 hex لاسم المجموعة (نفس teamStorageKey في
-- lib/teamData.ts بالحرف)، والسياسات بتقارن بنفس الكود بدل الاسم.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- مابيلمسش أي جدول ولا أي داتا — دالة واحدة جديدة + إعادة كتابة ٨ سياسات تخزين.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) كود مجموعتي ────────────────────────────────────────────────────────
create or replace function public.my_team_key() returns text
  language sql stable security definer set search_path = public as $$
  select 't-' || encode(convert_to(p.team, 'UTF8'), 'hex')
  from public.profiles p
  where p.id = (select auth.uid())
$$;

grant execute on function public.my_team_key() to authenticated;

-- ── (٢) داتا المجموعة ──────────────────────────────────────────────────────
drop policy if exists "team members read team data" on storage.objects;
create policy "team members read team data" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-data'
    and (storage.foldername(name))[1] = public.my_team_key()
    and public.my_team_leader() is not null      -- الميزة مقفولة ⇒ محدش يقرا
  );

drop policy if exists "leader uploads team data" on storage.objects;
create policy "leader uploads team data" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-data'
    and (storage.foldername(name))[1] = public.my_team_key()
    and public.is_team_leader()
  );

drop policy if exists "leader replaces team data" on storage.objects;
create policy "leader replaces team data" on storage.objects for update to authenticated
  using (bucket_id = 'team-data' and (storage.foldername(name))[1] = public.my_team_key() and public.is_team_leader())
  with check (bucket_id = 'team-data' and (storage.foldername(name))[1] = public.my_team_key() and public.is_team_leader());

drop policy if exists "leader deletes team data" on storage.objects;
create policy "leader deletes team data" on storage.objects for delete to authenticated
  using (bucket_id = 'team-data' and (storage.foldername(name))[1] = public.my_team_key() and public.is_team_leader());

-- ── (٣) تشييك المجموعة ─────────────────────────────────────────────────────
drop policy if exists "team members read team check" on storage.objects;
create policy "team members read team check" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-check'
    and (storage.foldername(name))[1] = public.my_team_key()
    and public.my_team_check_leader() is not null   -- الميزة مقفولة ⇒ محدش يقرا
  );

drop policy if exists "leader uploads team check" on storage.objects;
create policy "leader uploads team check" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-check'
    and (storage.foldername(name))[1] = public.my_team_key()
    and public.is_team_check_leader()
  );

drop policy if exists "leader replaces team check" on storage.objects;
create policy "leader replaces team check" on storage.objects for update to authenticated
  using (bucket_id = 'team-check' and (storage.foldername(name))[1] = public.my_team_key() and public.is_team_check_leader())
  with check (bucket_id = 'team-check' and (storage.foldername(name))[1] = public.my_team_key() and public.is_team_check_leader());

drop policy if exists "leader deletes team check" on storage.objects;
create policy "leader deletes team check" on storage.objects for delete to authenticated
  using (bucket_id = 'team-check' and (storage.foldername(name))[1] = public.my_team_key() and public.is_team_check_leader());

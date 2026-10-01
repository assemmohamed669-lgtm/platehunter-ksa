-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 مفتاح المسئول: «شارك داتا المجموعة» — يفتح ويقفل بإيده
--
-- طلب المالك (١ أكتوبر ٢٠٢٦):
--   «زر عند مسئول المجموعة — لو فتحه، الداتا اللي رافعها توصل لباقي أفراد
--    المجموعة. ولو قفله، الداتا تظهر **للمسئول فقط**. مكانه في صفحة الفرز
--    تحت مربع رفع الداتا، ويظهر للمسئول بس.»
--   وقرار المالك: **الافتراضي مقفول** — المسئول يفتحه بإيده وقت ما يحب.
--
-- فيه مفتاحين مترتبين، والاتنين لازم يكونوا مفتوحين عشان العضو يشوف:
--   ١) `shared_data_enabled` — مفتاح **المالك** لكل مجموعة (موجود، مابيتلمسش).
--   ٢) `shared_data_open`    — مفتاح **المسئول** الجديد.
--
-- 🔒 المنع على **السيرفر** مش في الشاشة بس: سياسات القراءة نفسها بتتقفل، فحتى
--    لو حد حاول يجيب الملف من برّه البرنامج هيترفض. والمسئول بيفضل شايف ملفه.
--    والملف **مايتمسحش** لما يقفل — بيرجع يوصلهم بنفس الضغطة.
--
-- ⚠️ بعد التشغيل: المجموعات الشغّالة دلوقتي داتاها **هتقف عن الأعضاء** لحد ما
--    مسئول كل مجموعة يفتح المفتاح من صفحة الفرز. ده المطلوب بقرار المالك.
--
-- آمن للتكرار. شغّله مرة واحدة في: Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) مفتاح المسئول — مقفول لكل المجموعات القايمة ────────────────────────
alter table public.group_settings
  add column if not exists shared_data_open boolean not null default false;

comment on column public.group_settings.shared_data_open is
  'مفتاح مسئول المجموعة: داتا المجموعة مفتوحة للأعضاء ولا للمسئول وحده';

-- ── (٢) المفتاحين مع بعض ───────────────────────────────────────────────────
create or replace function public.team_data_open() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select g.shared_data_enabled and g.shared_data_open
    from public.group_settings g
    where g.team = (select p.team from public.profiles p where p.id = (select auth.uid()))
  ), false)
$$;

revoke execute on function public.team_data_open() from public;
revoke execute on function public.team_data_open() from anon;
grant  execute on function public.team_data_open() to authenticated;

-- ── (٣) قلب المفتاح — المسئول بس ───────────────────────────────────────────
create or replace function public.set_team_data_open(p_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_team text;
begin
  -- 🔒 الصلاحية بتتحقّق **هنا** — إخفاء الزرار في الواجهة مش حماية.
  if not public.is_team_leader() then
    raise exception 'مسئول المجموعة بس هو اللي يقدر يفتح أو يقفل مشاركة الداتا';
  end if;
  select p.team into v_team from public.profiles p where p.id = (select auth.uid());
  if v_team is null then
    raise exception 'مفيش مجموعة';
  end if;
  update public.group_settings
     set shared_data_open = coalesce(p_open, false)
   where team = v_team;
  return coalesce(p_open, false);
end $$;

revoke execute on function public.set_team_data_open(boolean) from public;
revoke execute on function public.set_team_data_open(boolean) from anon;
grant  execute on function public.set_team_data_open(boolean) to authenticated;

-- ── (٤) القفل الفعلي — سياسات قراءة الأعضاء ────────────────────────────────
--     المسئول (`is_team_leader`) بيفضل يقرا ملفه في كل الأحوال؛ الأعضاء
--     مربوطين بالمفتاح. الشرط القديم (`my_team_leader() is not null` = مفتاح
--     المالك مفتوح) **باقي زي ما هو** جنب الشرط الجديد.

drop policy if exists "read own team data file" on public.team_data_files;
create policy "read own team data file" on public.team_data_files for select to authenticated
  using (
    team = public.my_team()
    and public.my_team_leader() is not null
    and (public.is_team_leader() or public.team_data_open())
  );

drop policy if exists "team members read team data" on storage.objects;
create policy "team members read team data" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-data'
    and (storage.foldername(name))[1] = public.my_team()
    and public.my_team_leader() is not null
    and (public.is_team_leader() or public.team_data_open())
  );

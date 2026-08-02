-- =====================================================================
-- مفتاح طيّار «الرأي التاني» (موديل اللوحات المدرَّب يحكم جنب Deepgram).
-- الافتراضي: **متوقّف (false)** — آمن. ومع كده المفتاح لوحده مايكفي:
-- الكود كمان بيتحقّق إن المستخدم هو **المالك** (lib/plateJudgeGate.ts) وإن
-- النفق والتوكن محفوظين على الجهاز. تلات بوابات، وأي واحدة تفشل = مقفول.
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). آمن للتشغيل المتكرر.
-- =====================================================================

-- جدول الإعدادات المفرد (نفس اللي مفتاح التعلّم بيستخدمه).
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true)
);
alter table public.app_settings enable row level security;

-- عمود مفتاح الطيّار — افتراضي false (متوقّف).
alter table public.app_settings
  add column if not exists plate_judge_enabled boolean not null default false;

-- ---------------------------------------------------------------------
-- Setter: **السوبر أدمن فقط** (is_super = true).
-- ---------------------------------------------------------------------
create or replace function public.set_plate_judge_enabled(p_enabled boolean)
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

  insert into public.app_settings (id, plate_judge_enabled)
  values (true, coalesce(p_enabled, false))
  on conflict (id) do update
    set plate_judge_enabled = coalesce(p_enabled, false);
end;
$$;

-- ---------------------------------------------------------------------
-- Getter: أي مستخدم مسجّل (الأجهزة محتاجة تقرا الحالة). ملاحظة: القراءة
-- مسموحة للكل بس **الاستفادة** محصورة بالمالك في الكود — والقيمة نفسها
-- مش سر (بوليان واحد).
-- ---------------------------------------------------------------------
create or replace function public.get_plate_judge_enabled()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(plate_judge_enabled, false) from public.app_settings where id = true;
$$;

grant execute on function public.set_plate_judge_enabled(boolean) to authenticated;
grant execute on function public.get_plate_judge_enabled() to authenticated;

-- ---------------------------------------------------------------------
-- التشغيل/الإيقاف من غير أي واجهة أدمن (أصغر تغيير ممكن):
--   select public.set_plate_judge_enabled(true);   -- من حساب سوبر أدمن
-- أو مباشرة من الـSQL Editor:
--   insert into public.app_settings (id, plate_judge_enabled) values (true, true)
--     on conflict (id) do update set plate_judge_enabled = true;
-- والإيقاف الفوري لكل الأجهزة: نفس السطر بـfalse.
-- ---------------------------------------------------------------------

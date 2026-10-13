-- ═══════════════════════════════════════════════════════════════════════════
-- 🕐 وقت آخر تعديل لكل سجل — عشان التعديل اللي اتعمل من مكان تاني ينزل على موبايل المندوب (المالك ١٣ أكتوبر ٢٠٢٦)
-- محتاج field-checks-skip-unchanged.sql يكون اتشغّل. شغّله مرة واحدة. آمن لو اتشغّل مرتين. مابيلمسش أي سجل.
--
-- الموبايل بقى ينزّل **الناقص بس** وسجلاته مايتكتبش فوقها (#424/#425) — فالتعديل اللي المندوب عمله من صفحة
-- «سجلات المجموعة» أو من موبايل تاني ماكانش بينزل. دلوقتي السيرفر بيختم `updated_at` **لما السجل يتعدّل فعلاً**
-- بس (السجل الجديد والرفع المتكرر بنفس البيانات مابيتختموش)، والموبايل بينزّل المتعدّل بعد آخر مرة بس.
--
-- ⚠️ الفهرس في ملف لوحده (`field-checks-updated-at-index.sql`) — بيتعمل **من غير ما يوقّف رفع المناديب**
--    (concurrently) ولازم يتشغّل لوحده.
-- ═══════════════════════════════════════════════════════════════════════════

-- عمود من غير قيمة افتراضية = إضافة فورية (مابيكتبش على الـ١.٤ مليون صف)
alter table public.field_checks add column if not exists updated_at timestamptz;

-- «نفس البيانات بالظبط» مابيحسبش العمود ده (ولا plate_norm المحسوب)
create or replace function public.field_checks_skip_unchanged() returns trigger
  language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'plate_norm' - 'updated_at') = (to_jsonb(old) - 'plate_norm' - 'updated_at') then
    return null;   -- نفس البيانات بالظبط ⇒ ولا كتابة (الطلب بينجح عادي)
  end if;
  return new;
end $$;

-- الختم بعد «نفس البيانات» (الترتيب بالاسم: zz_ قبل zzz_) ⇒ التعديل الحقيقي بس اللي بيتختم
create or replace function public.field_checks_touch_updated() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists zzz_field_checks_touch_updated on public.field_checks;
create trigger zzz_field_checks_touch_updated before update on public.field_checks
  for each row execute function public.field_checks_touch_updated();

-- للتأكد: لازم zz_field_checks_skip_unchanged قبل zzz_field_checks_touch_updated
select tgname as "التريجر" from pg_trigger
where tgrelid = 'public.field_checks'::regclass and not tgisinternal
order by tgname;

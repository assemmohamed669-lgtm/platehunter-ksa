-- ═══════════════════════════════════════════════════════════════════════════
-- 🧈 السجل اللي بيترفع **بنفس بياناته بالظبط** مايتكتبش تاني (المالك ١٣ أكتوبر ٢٠٢٦)
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين. مابيلمسش أي سجل موجود.
--
-- فحص ١٣ أكتوبر (من آخر ريستارت، ~٢٩ يوم): field_checks اتضاف فيه ٨٧٦ ألف صف جديد و**اتعاد كتابة ٢ مليون**،
-- و٢.٨٧ مليون طلب رفع (صف في كل طلب). أغلب إعادة الكتابة دي صفوف جت بنفس بياناتها بالظبط (زرار «مزامنة» بيرفع
-- كل السجلات من الأول، وأي رفع متكرر) — وكل واحدة بتعمل نسخة جديدة من الصف + تحديث فهارسه + سجل تغييرات
-- (WAL) بيعدّي على Realtime. الحساب من رصيد قراية/كتابة القرص (Disk IO).
--
-- القاعدة: قبل أي تعديل، لو الصف الجديد = القديم بالظبط (كل الأعمدة ما عدا `plate_norm` المحسوب من اللوحة) ⇒
-- مايتكتبش. **أي تعديل حقيقي** (لوحة/نوع/ملاحظة/موقع/وقت/مجموعة) بيتكتب عادي، والمسح مالوش دعوة بده.
-- الاسم بيبدأ بـ`zz_` عشان يشتغل **آخر واحد** بعد `field_checks_keep_team` (اللي بيرجّع ختم المجموعة).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.field_checks_skip_unchanged() returns trigger
  language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'plate_norm') = (to_jsonb(old) - 'plate_norm') then
    return null;   -- نفس البيانات بالظبط ⇒ ولا كتابة (الطلب بينجح عادي)
  end if;
  return new;
end $$;

drop trigger if exists zz_field_checks_skip_unchanged on public.field_checks;
create trigger zz_field_checks_skip_unchanged before update on public.field_checks
  for each row execute function public.field_checks_skip_unchanged();

-- للتأكد: التريجرات اللي قبل التعديل على الجدول بالترتيب (لازم zz_ آخر واحد)
select tgname as "التريجر" from pg_trigger
where tgrelid = 'public.field_checks'::regclass and not tgisinternal
order by tgname;

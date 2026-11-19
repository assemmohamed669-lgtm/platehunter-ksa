-- ═══════════════════════════════════════════════════════════════════════════
-- 🔎 البحث بالرقم في الشهايد المقرية (١٩ نوفمبر ٢٠٢٦)
--
-- المالك: «رعب4925 ببحث عليها علي البرنامج … مش موجوده». أغلب الملفات اسمها رقم عقد (REPO-301-…) فالبحث بالاسم
-- في درايف مايلاقيهاش — دلوقتي البحث وعمود «شهايد» بيدوّروا كمان في اللوحة/الشاص اللي اتقروا من جوّه الملف، والشهايد
-- المقرية بتفضل سنة. الفهارس دي بتخلّي الدوّرة سريعة مع ما الجدول بيكبر. **اختياري** — البحث شغّال من غيره.
-- آمن لو اتشغّل مرتين. مايغيّرش أي داتا.
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists cert_daily_plate_idx on public.cert_daily (plate);
create index if not exists cert_daily_vin_idx on public.cert_daily (vin);

-- الشهايد الخاصة (لو cert-private.sql اتشغّل)
do $$
begin
  if to_regclass('public.cert_daily_private') is not null then
    execute 'create index if not exists cert_daily_private_plate_idx on public.cert_daily_private (plate)';
    execute 'create index if not exists cert_daily_private_vin_idx on public.cert_daily_private (vin)';
  end if;
end $$;

select 'فهارس البحث تمام' as done;

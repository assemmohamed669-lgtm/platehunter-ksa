-- ═══════════════════════════════════════════════════════════════════════════
-- الفرز على سجلات المجموعة (على السيرفر): المندوب يبعت لوحات الإحالة المطبّعة،
-- والسيرفر يرجّع اللي طابق من سجلات مجموعته — من غير ما ينزّل الملايين على الجهاز.
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- ⚠️ محتاج docs/sql/group-records.sql اتشغّل قبله (سياسة قراءة سجلات المجموعة).
-- ═══════════════════════════════════════════════════════════════════════════

-- (1) دالة تطبيع اللوحة — بتطابق normalizePlate في التطبيق للّوحات السعودية:
--     أإآ→ا · ى→ي · تشيل التطويل (ـ) · أرقام عربي→لاتيني · تشيل أي حاجة مش حرف
--     عربي/رقم · وترتّب الحروف قبل الأرقام (يتعامل مع اللوحة المعكوسة زي 5052حبك).
--     ⚠️ التطويل «ـ» آخر حاجة في نص المصدر عشان translate يحذفه (مش يحوّله رقم).
create or replace function public.norm_plate(p text) returns text
language sql immutable as $$
  with c as (
    select regexp_replace(
      translate(coalesce(p, ''), 'أإآى٠١٢٣٤٥٦٧٨٩ـ', 'اااي0123456789'),
      '[^0-9ء-ي]', '', 'g') as v
  )
  select regexp_replace(v, '[0-9]', '', 'g') || regexp_replace(v, '[^0-9]', '', 'g') from c;
$$;

-- (2) عمود اللوحة المطبّعة — محسوب تلقائيًا لكل الصفوف (الموجودة والجديدة) + فهرس.
alter table public.field_checks
  add column if not exists plate_norm text generated always as (public.norm_plate(plate)) stored;
create index if not exists field_checks_platenorm_idx on public.field_checks(plate_norm);

-- (3) RPC: يرجّع سجلات المجموعة اللي لوحاتها المطبّعة ضمن قائمة لوحات الإحالة.
--     security invoker → RLS بتطبّق (المندوب مايشوفش غير مجموعته)، والشرط تحت
--     حزام تاني صريح. الإحالة (بضع آلاف) بتتبعت في body مش URL فمفيش حد.
create or replace function public.match_group_plates(p_norms text[])
returns table (id uuid, plate text, method text, maps_link text, checked_at timestamptz, agent_id uuid)
language sql stable security invoker as $$
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id
  from public.field_checks fc
  where fc.plate_norm = any(p_norms)
    and fc.agent_id in (
      select pr.id from public.profiles pr
      where pr.team is not null
        and pr.team = (select me.team from public.profiles me where me.id = auth.uid())
    );
$$;
grant execute on function public.match_group_plates(text[]) to authenticated;

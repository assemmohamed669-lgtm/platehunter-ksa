-- ═══════════════════════════════════════════════════════════════════════════
--  عنوان خدمة الموديل المدرّب — بيتحدّث لوحده
--
--  المشكلة: خدمة الموديل شغالة على جهاز الأدمن وبتتعرض عبر نفق cloudflared
--  **مؤقت** — الرابط بيتغيّر كل مرة الجهاز يشتغل. وكان لازم الرابط يتحط في
--  كل تليفون **يدوي**، فلو الجهاز اتقفل وفتح، كل المناديب يقفوا لحد ما
--  تعدّي عليهم واحد واحد.
--
--  الحل: الخدمة تسجّل رابطها هنا أول ما تشتغل، والتطبيق يقراه لوحده.
--  تفتح الجهاز → كل المناديب يشتغلوا، من غير ما تلمس تليفون.
--
--  ⚠️ إضافة بحتة: عمودين على جدول قايم. مافيش سياسات بتتغيّر — قراءة
--  app_settings للمناديب موجودة أصلاً (بيقروا منها الرسالة الإدارية).
--  شغّله مرة واحدة في: Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.app_settings
  add column if not exists plate_model_url text,
  add column if not exists plate_model_at  timestamptz;

comment on column public.app_settings.plate_model_url is
  'أساس رابط خدمة الموديل (بدون /transcribe) — الخدمة بتكتبه أول ما تشتغل';
comment on column public.app_settings.plate_model_at is
  'آخر مرة الخدمة سجّلت نفسها — التطبيق بيتجاهل الرابط لو قديم';

-- ── دالة القراءة للمناديب ──────────────────────────────────────────────────
-- الجدول ده **مالوش سياسة قراءة** للمناديب (كل إعداد بيتقرا بدالة خاصة زي
-- get_app_notice و get_shared_deepgram_key). فالتطبيق محتاج الدالة دي عشان
-- يعرف عنوان الخدمة.
--
-- SECURITY DEFINER عشان تتخطّى RLS، وبترجّع **العنوان والتاريخ بس** — مافيش
-- أي إعداد تاني بيتسرّب.
create or replace function public.get_plate_model_endpoint()
returns table (url text, at timestamptz)
language sql
security definer
set search_path = public
as $$
  select plate_model_url, plate_model_at
    from public.app_settings
   where id = true
     and coalesce(plate_judge_enabled, false) = true   -- مقفولة؟ مايرجعش عنوان
$$;

grant execute on function public.get_plate_model_endpoint() to authenticated;

-- ── دالة التسجيل (اختيارية) ────────────────────────────────────────────────
-- الخدمة بتسجّل بمفتاح secret (بيتخطّى RLS أصلاً)، فمش محتاجة دالة. لكن لو
-- حبيت تسجّل بمفتاح أقل صلاحية، دي بتقفل الكتابة على العمودين دول بس.
create or replace function public.set_plate_model_endpoint(p_url text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.app_settings
     set plate_model_url = nullif(btrim(p_url), ''),
         plate_model_at  = now()
   where id = true
$$;

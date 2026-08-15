-- ═══════════════════════════════════════════════════════════════════════════
--  ذاكرة رفع شيتات التفريغ — مشتركة بين كل الأجهزة والأدمنز
--
--  المشكلة: المندوب بيرفع شيت التفريغ على الداتا، وبعد يومين ينسى ويرفعه
--  تاني — فنفس اللوحات تتضاف مرتين. وكمان زميله ممكن يكون رفعه أصلاً من
--  تليفون تاني وهو مش عارف.
--
--  الحل: كل شيت اترفع بيتسجّل هنا ببصمة لوحاته. أول ما حد يرفع شيت،
--  البرنامج بيقارن بصمته باللي هنا ويحذّره — بالتاريخ واسم الملف ومين رفعه.
--
--  ⚠️ إضافة بحتة: **مايغيّرش ولا يمسح أي جدول قايم**. جدول جديد بس.
--  شغّله مرة واحدة في: Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.data_uploads (
  -- بصمة لوحات الشيت — نفس اللوحات تدّي نفس البصمة مهما اتغيّر الترتيب
  -- أو اسم الملف. دي المفتاح لأنها الدليل الحقيقي إن الشيت اترفع.
  fingerprint       text primary key,
  plates            jsonb not null default '[]'::jsonb,  -- اللوحات المطبّعة (للتداخل الجزئي)
  file_name         text,                                 -- اسم الملف وقت الرفع
  row_count         integer default 0,
  uploaded_at       timestamptz not null default now(),   -- أول مرة اترفع
  data_file_name    text,                                 -- على أنهي ملف داتا
  inserted_after    text,                                 -- تحت أنهي موقع
  uploaded_by       uuid references auth.users(id) on delete set null,
  uploaded_by_name  text,                                 -- الاسم وقتها (عشان نعرف مين من غير join)
  created_at        timestamptz not null default now()
);

create index if not exists data_uploads_uploaded_at_idx
  on public.data_uploads(uploaded_at desc);

alter table public.data_uploads enable row level security;

-- كل مستخدم مسجّل دخول يقرا الكل ويضيف.
--
-- ليه القراءة للكل: دي الفايدة نفسها — لازم المندوب يعرف إن **زميله** رفع
-- الشيت ده. ولو خصّصناها للأدمن دلوقتي، هنحتاج SQL تاني لما تتفتح للمناديب
-- (والصفحة نفسها متقفولة على الأدمن من جوّه البرنامج).
drop policy if exists data_uploads_read on public.data_uploads;
create policy data_uploads_read on public.data_uploads
  for select to authenticated
  using (true);

drop policy if exists data_uploads_insert on public.data_uploads;
create policy data_uploads_insert on public.data_uploads
  for insert to authenticated
  with check (uploaded_by = auth.uid());

-- مافيش سياسة تعديل ولا حذف بقصد: السجل بيتكتب مرة واحدة وخلاص.
-- البرنامج بيبعت الإضافة بـ «تجاهل المكرر» — فلو الشيت مسجّل قبل كده
-- (حتى لو من زميل تاني) مابنلمسش سجله، وأول تاريخ رفع بيفضل هو المحفوظ،
-- وده بالظبط اللي التحذير بيقوله للمندوب.

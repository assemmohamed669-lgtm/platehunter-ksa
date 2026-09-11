-- ═══════════════════════════════════════════════════════════════════════════
-- اشتراك منفصل لكل خدمة: الصوت (voicex_until) وباقي البرنامج (rest_until).
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor).
--
-- • كل خدمة ليها تاريخ نهاية لوحدها؛ لما تعدّي، الخدمة دي بس تتقفل (مع العلم
--   اليدوي voicex_enabled / rest_pages_enabled — الخدمة شغّالة لو الاتنين تمام).
-- • تاريخ الحساب العام (subscription_end) بيفضل = الأبعد فيهم، فقفل الحساب الكلي
--   مايتكسرش (الحساب شغّال طول ما أي خدمة سارية).
-- • الموجود حاليًا محفوظ: بننسخ اشتراك كل مندوب الحالي على الخدمتين.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists voicex_until date;
alter table public.profiles add column if not exists rest_until   date;

-- الموجود حاليًا: كل مندوب أيامه الحالية تتحط على الخدمتين (مرة واحدة، بس اللي
-- لسه فاضي عشان ماندوسش على أي تعديل يدوي اتعمل بعد كده).
update public.profiles set voicex_until = subscription_end where voicex_until is null and role = 'agent';
update public.profiles set rest_until   = subscription_end where rest_until   is null and role = 'agent';

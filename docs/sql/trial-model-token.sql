-- =====================================================================
-- توكن الموديل الجديد (صفحة «الجديد» · سيرفر ماليزيا)
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). آمن للتشغيل المتكرر.
-- =====================================================================
--
-- 🔴 **ليه الملف ده موجود:**
--
-- التوكن كان **مكتوب صريح في الكود**:
--     export const TRIAL_MODEL_TOKEN = "plate-voice-lab-local-dev";
-- وتعليقه نفسه كان بيقول «مش سرّ حقيقي — أي تشغيل طويل لازم يتغيّر».
--
-- والكود بيتشحن جوّه التطبيق **لكل موبايل**، فأي حد يفتح ملفات التطبيق ياخد
-- التوكن. والسيرفر على الإنترنت المفتوح (voice.qannas-ksa.com) — يعني أي حد
-- معاه التوكن يبعت صوت على طول ⇒ ياكل الكارت، والمناديب يبطّوا أو يترفضوا
-- بـ503. مش سرقة بيانات (السيرفر مابيحفظش حاجة) — «حد ياكل سيرفرك».
--
-- ✅ والحل **موجود وشغّال عندنا أصلاً** لصفحة التشييك (`voicex-access.sql`):
--    السرّ في `app_settings` — جدول **مالوش سياسة SELECT** — ويُقرأ عبر دالة
--    SECURITY DEFINER للمسجّلين بس. الملف ده بيعمل نفس الشكل بالظبط.
--
-- ⚠️ التوكن **مايتحطّش في الـURL أبداً** — بيتبعت في ترويسة X-Plate-Token بس.
--
-- ─────────────────────────────────────────────────────────────────────
-- بعد التشغيل، خطوتين لازمين (نفس السرّ في الاتنين):
--
--   ① في Supabase:
--        select public.set_trial_token('<اكتب سرّ طويل عشوائي هنا>');
--
--   ② على سيرفر ماليزيا — يتحط في متغيّر البيئة ويتعاد تشغيل السيرفر:
--        echo 'PLATE_JUDGE_TOKEN=<نفس السرّ>' >> /root/lab.env
--        (والمشرف بيقراه عند التشغيل)
--
-- 🔴 من غير الخطوتين الصفحة **مش هتشتغل** — وده بالقصد: الفشل بيقفل مش بيفتح.
-- =====================================================================

-- الجدول موجود أصلاً من voicex-access.sql — بنتأكد بس ونضيف العمود.
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true)
);
alter table public.app_settings enable row level security;

alter table public.app_settings
  add column if not exists trial_token text;

-- الكتابة: المالك (is_super) بس.
create or replace function public.set_trial_token(p_token text)
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

  insert into public.app_settings (id, trial_token)
  values (true, nullif(btrim(p_token), ''))
  on conflict (id) do update
    set trial_token = nullif(btrim(p_token), '');
end;
$$;

-- القراءة: أي مستخدم مسجّل (التطبيق محتاجه عشان يوصل للسيرفر).
create or replace function public.get_trial_token()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select trial_token from public.app_settings where id = true;
$$;

-- المِنح: المسجّلون فقط. Supabase بيمنح PUBLIC تلقائياً فلازم سحب صريح —
-- من غير ده أي زائر غير مسجّل يقدر يقرا السرّ.
grant execute on function public.set_trial_token(text) to authenticated;
grant execute on function public.get_trial_token()     to authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_trial_token', 'get_trial_token')
  loop
    execute format('revoke execute on function %s from anon;', r.sig);
    execute format('revoke execute on function %s from public;', r.sig);
  end loop;
end $$;

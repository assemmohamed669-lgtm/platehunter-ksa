-- ─────────────────────────────────────────────────────────────────────────
-- إعفاء حساب مندوب من «قفل الجهاز» — يدخل بإيميله وباسووردته من أي جهاز.
-- المشكلة: بصمة الجهاز متخزّنة في localStorage. سفاري آيفون (خصوصاً التصفح الخاص
-- أو مسح بيانات المواقع) بيمسح localStorage كل خروج → بصمة جديدة → «الحساب مرتبط
-- بجهاز» (DEVICE_MISMATCH) → الدخول بيتمنع.
-- الحل: عمود إعفاء لكل حساب، ودالة الدخول بتتخطّى ربط الجهاز للمعفيين (زي الأدمن).
-- شغّل الملف مرة واحدة في Supabase → SQL Editor. آمن — مابيغيّرش سلوك باقي الحسابات.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) عمود الإعفاء (افتراضياً false — كل الحسابات مربوطة بالجهاز زي ما هي)
alter table public.profiles
  add column if not exists device_lock_exempt boolean not null default false;

-- 2) تحديث دالة تسجيل الدخول — تتخطّى ربط الجهاز للأدمن **وللمعفيين**
create or replace function public.handle_device_login(p_device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_new_token uuid := gen_random_uuid();
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_profile.is_active = false then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  -- الأدمن + الحسابات المعفية من قفل الجهاز: دخول من أي جهاز، مع تدوير توكن الجلسة.
  if v_profile.role = 'admin' or v_profile.device_lock_exempt then
    update public.profiles
      set session_token = v_new_token
      where id = auth.uid();
    return v_new_token;
  end if;

  -- أول دخول على الحساب: يربط الجهاز.
  if v_profile.device_fingerprint is null then
    update public.profiles
      set device_fingerprint = p_device_fingerprint,
          session_token = v_new_token
      where id = auth.uid();
    return v_new_token;
  end if;

  -- الربط الموجود لازم يطابق الجهاز ده.
  if v_profile.device_fingerprint <> p_device_fingerprint then
    raise exception 'DEVICE_MISMATCH';
  end if;

  -- نفس الجهاز: تدوير توكن الجلسة (يبطّل أي جلسة تانية مفتوحة للحساب).
  update public.profiles
    set session_token = v_new_token
    where id = auth.uid();

  return v_new_token;
end;
$$;

grant execute on function public.handle_device_login(text) to authenticated;

-- 3) (اختياري) اعفِ حساب معيّن فوراً بالإيميل — أو سيبها واستخدم الزر في لوحة
--    الأدمن: صفحة المندوب → «السماح بالدخول من أي جهاز».
-- update public.profiles
--   set device_lock_exempt = true, device_fingerprint = null, session_token = null
--   where id = (select id from auth.users where lower(email) = lower('agent-email@example.com'));

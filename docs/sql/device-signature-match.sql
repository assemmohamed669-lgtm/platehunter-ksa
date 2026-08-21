-- ─────────────────────────────────────────────────────────────────────────
-- ربط الجهاز بتوقيع الجهاز (مش برقم محفوظ في localStorage).
--
-- المشكلة: البصمة القديمة كانت `uuid.<sig>` والـ uuid متخزّن في localStorage.
-- سفاري آيفون بيمسح localStorage كل خروج → uuid جديد → البصمة تتغيّر →
-- «الحساب مرتبط بجهاز» (DEVICE_MISMATCH) كل تسجيل دخول.
--
-- الحل: العميل بقى يبعت **التوقيع فقط** (مواصفات الجهاز — ثابتة حتى لو اتمسح
-- التخزين). والدالة دي بتقارن **جزء التوقيع** (اللي بعد آخر نقطة) بدل السلسلة
-- كلها — فالحسابات المربوطة قديماً بـ `uuid.<sig>` تفضل تطابق التوقيع الجديد
-- `<sig>` بلا أي كسر، وبتتحدّث تلقائياً للشكل الجديد أول دخول ناجح.
--
-- متوافق ١٠٠٪ مع الاتجاهين: عميل قديم بيبعت `uuid.<sig>` وعميل جديد بيبعت
-- `<sig>` — الاتنين بيطابقوا نفس التوقيع المخزّن. **شغّله في Supabase → SQL
-- Editor قبل ما تنزل نسخة الموبايل الجديدة** (آمن للعملاء القدام).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.handle_device_login(p_device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_new_token uuid := gen_random_uuid();
  v_stored_sig text;
  v_incoming_sig text;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_profile.is_active = false then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  -- الأدمن + الحسابات المعفية من قفل الجهاز: دخول من أي جهاز، مع تدوير التوكن.
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

  -- نقارن **جزء التوقيع فقط** (اللي بعد آخر نقطة). القديم `uuid.<sig>` والجديد
  -- `<sig>` الاتنين توقيعهم = <sig>. لو مفيش نقطة، regexp_replace بيرجّع النص كما هو.
  v_stored_sig   := regexp_replace(v_profile.device_fingerprint, '^.*\.', '');
  v_incoming_sig := regexp_replace(p_device_fingerprint, '^.*\.', '');

  if v_stored_sig <> v_incoming_sig then
    raise exception 'DEVICE_MISMATCH';
  end if;

  -- نفس الجهاز: نطبّع البصمة المخزّنة للشكل الجديد + ندوّر توكن الجلسة (يبطّل
  -- أي جلسة تانية مفتوحة لنفس الحساب).
  update public.profiles
    set device_fingerprint = p_device_fingerprint,
        session_token = v_new_token
    where id = auth.uid();

  return v_new_token;
end;
$$;

grant execute on function public.handle_device_login(text) to authenticated;

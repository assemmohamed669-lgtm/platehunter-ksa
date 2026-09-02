# البحث عن شهادة السحب من Google Drive — التصميم والإثبات

> خدمة داخل **قناص**: لما المندوب يلاقي عربية مطلوبة، البرنامج يبحث تلقائياً في
> Google Drive عن **شهادة السحب (PDF)** بتاعتها ويفتحها — الشهادة اللي بتتقدّم
> للشرطة. تاريخ التوثيق: ٢٠٢٦-٠٩-٠٢.

## ١) الفكرة
- الشركات (تمويل/تحصيل) بترفع شهادات السحب كـ PDF على Google Drive.
- كل شهادة **متسمّية باللوحة** (`ر ع ب 1728.pdf`)، وجوّاها **رقم الهيكل (VIN)** كنص.
- المندوب معاه رقم الهيكل (من عمود الإحالة أو كاميرا «شاص») → البرنامج يبحث ويجيب الشهادة.

## ٢) اللي اتأكّد عملياً (على درايف حقيقي)
- ✅ **البحث بالهيكل** `fullText contains '<VIN>' and mimeType='application/pdf'` → **شهادة واحدة بالظبط**.
- ✅ **الأكسيز لكذا شركة** من حساب واحد: شهادات مملوكة لـ`almusanda2@gmail.com` و`repoqemmaa@gmail.com` ظهرت من نفس الحساب.
- ⚠️ **البحث باللوحة غير موثوق مباشرة** (بحث درايف العربي بيطابق الأرقام بس) — الحل: نجيب كل PDF بالأربع أرقام ثم **نطبّع الأسماء ونفلتر في الكود** بالحروف (`د و ا 8403` طلع صح بالتطبيع).
- ✅ **مفتاح دائم شغّال:** refresh token جدّد access token تلقائياً ولقى الشهادة (بدون تسجيل دخول متكرر).

## ٣) الأكسيز (مُجهّز وشغّال)
- **حساب:** `mafifi456@gmail.com` (الشركات مشاركة فولدراتها معاه). لاحقاً يُفضّل حساب شركة مخصّص.
- **Google Cloud project:** `platehunter-certs` → Drive API مفعّل → OAuth consent (Testing) → test user = الحساب.
- **OAuth client (Web):** redirect URI = `https://developers.google.com/oauthplayground`.
- **٣ قيم سرّية (السيرفر فقط):** `CLIENT_ID` · `CLIENT_SECRET` · `REFRESH_TOKEN` (دائم — طالما التطبيق Published أو يُستخدم بانتظام).

## ٤) إزاي بتشتغل (التنفيذ في قناص)
### السيرفر — `app/api/certificate/route.ts`
1. **Auth:** يتحقّق من جلسة المندوب (زي `read-plate`).
2. **Input:** `chassis` (أو `plate`).
3. **تجديد التوكن:** POST لـ`oauth2.googleapis.com/token` بالـrefresh token → access token (يتكاش ~ساعة).
4. **البحث:**
   - بالهيكل: `fullText contains '<chassis>' and mimeType='application/pdf'`.
   - باللوحة (احتياطي): `name contains '<digits>' and mimeType='application/pdf'` ثم تطبيع + فلترة في الكود.
5. **الرد:** `{ found, name, link }` أو `{ found:false }`.

### env على Vercel (السيرفر فقط)
```
GDRIVE_CLIENT_ID=...
GDRIVE_CLIENT_SECRET=...
GDRIVE_REFRESH_TOKEN=...
```

### الواجهة — زر «شهادة»
- جنب العربية المطلوبة (نتيجة الفرز / تطابق التشييك / صفحة المطلوب) يظهر زر **«شهادة»**.
- ينادي `/api/certificate?chassis=<VIN>` → يعرض: ⏳ → ✅ «شهادة موجودة [افتح]» (يفتح الـPDF) أو ❌ «مفيش شهادة».

## ٥) الأمان
- الـ٣ قيم **في السيرفر بس** (Vercel env) — عمرها ما تروح لموبايل المندوب.
- الصلاحية **قراءة فقط** (`drive.readonly`).
- الـClient Secret ظهر أثناء الإعداد → **يُعمل Regenerate قبل الإنتاج** ويتخزّن الجديد في السيرفر بس.
- ملف الاختبار المحلي (`Downloads/test_refresh.mjs`) فيه الـrefresh token → يتحفظ آمن أو يتمسح.

## ٦) قرارات مفتوحة
- تحويل الأكسيز لاحقاً لحساب شركة مخصّص بدل الحساب الشخصي (نفس الكود، بس نبدّل الـrefresh token).
- نشر التطبيق (Publish) عشان الـrefresh token يفضل دائم (في Testing بيعيش ٧ أيام لو مش مستخدم).
- ملف اختبار: `scratchpad/test_refresh.mjs` (تجديد التوكن + بحث بالهيكل).

# إشعارات الهاتف (Push) — إعداد مرة واحدة

الإشعار اللي جوّه التطبيق (Realtime) بيوصل للي **التطبيق مفتوح عنده** بس.
الملفات دي بتضيف إشعار **هاتف حقيقي** يوصل حتى والتطبيق مقفول.

## ١) Firebase (مجاني)

1. https://console.firebase.google.com → **Add project** (اسم: `PlateHunter`).
2. جوّه المشروع: **Add app → Android**، اسم الحزمة بالظبط:
   ```
   com.platehunter.ksa
   ```
3. نزّل **`google-services.json`** وحطّه في:
   ```
   android/app/google-services.json
   ```
   (الملف ده **مايترفعش على Git** — فيه معرّفات المشروع.)
4. **⚙️ Project settings → Service accounts → Generate new private key** → هينزل
   ملف JSON.

## ٢) Vercel

في إعدادات المشروع → **Environment Variables**، ضيف:

| الاسم | القيمة |
|-------|--------|
| `FCM_SERVICE_ACCOUNT` | محتوى ملف الـservice account JSON **كامل** |

من غير المتغيّر ده الراوت بيرجع `ok` من غير ما يبعت — يعني اللقطة والإشعار
الداخلي بيفضلوا شغّالين عادي، بس مافيش إشعار هاتف.

## ٣) Supabase

شغّل **`docs/sql/push-tokens.sql`** مرة واحدة (جدول `device_tokens`).

## ٤) بناء ورفع

```bash
npx cap sync android
cd android && ./gradlew bundleRelease
```
ارفع الـ`.aab` على Play Console كإصدار جديد (`versionCode 6` / `1.5`).
المناديب هياخدوه تحديث تلقائي من المتجر.

## إزاي بتشتغل

1. أول ما المندوب يفتح التطبيق (النسخة المثبَّتة بس) → `PushRegistrar` بياخد
   إذن الإشعارات ويحفظ توكن الجهاز في `device_tokens`.
2. مندوب يلاقي سيارة مطلوبة → `GroupFindNotifier` بيسجّل الصف في `group_finds`
   (ده الإشعار الداخلي) **و** بينده `POST /api/group-push`.
3. الراوت بيتأكد من الجلسة، يجيب مجموعة اللي لقاها **من السيرفر** (مش من
   الكلاينت)، يجيب توكنات باقي المجموعة، ويبعت FCM.
4. التوكنات الميتة (جهاز شال التطبيق) بتتمسح تلقائيًا.

# PlateHunter KSA — Project Context

## ما هو المشروع

تطبيق ويب + موبايل (PWA / Capacitor) لبحث وتتبع لوحات السيارات في المملكة العربية السعودية.
يُستخدم للمقارنة بين قوائم الإحالة (من البنوك / شركات التمويل) وبيانات التفريغ الميداني
لمعرفة أي سيارة مطلوبة موجودة في أي حي.

- **Production URL:** https://platehunter-ksa.vercel.app
- **Repo:** https://github.com/assemmohamed669-lgtm/platehunter-ksa
- **Mobile:** Capacitor APK — يتحمل الـ bundle من الـ Vercel URL مباشرة

---

## Tech Stack

| طبقة | التقنية |
|------|---------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Mobile | Capacitor 8 |
| Backend / Auth | Supabase |
| Excel parsing | xlsx (SheetJS) |
| Tests | Vitest |
| Deploy | Vercel (auto-deploy on push to `main`) |

---

## منهجية العمل — TDD (قانون لازم يتطبق)

**القانون الحديدي:** لا كود إنتاج بدون اختبار فاشل أولاً.

1. **RED** — اكتب اختبار يفشل أولاً
2. **GREEN** — اكتب أقل كود يخلّي الاختبار ينجح
3. **REFACTOR** — نظّف الكود والاختبارات معاً

```bash
npx vitest run          # تشغيل كل الاختبارات مرة واحدة
npx vitest              # watch mode
```

---

## الملفات الرئيسية

```
lib/
  plateParser.ts          # منطق مقارنة اللوحات (levenshtein, normalizePlate, bankPlateToArabic, buildReferralIndex, matchChunkAgainstIndex)
  sortingCols.ts          # PREFERRED_COLS, matchesPreferred, guessDefaultColumns

app/(app)/
  sorting/page.tsx        # صفحة الفرز — رفع ملفين Excel واختيار أعمدة ومقارنة اللوحات

__tests__/
  plateParser.test.ts     # 28 اختبار على منطق اللوحات
  sortingCols.test.ts     # 25 اختبار على الأعمدة التلقائية
```

---

## صفحة الفرز — كيف تشتغل

1. المستخدم يرفع **ملف داتا** (بيانات التفريغ الميداني) و**ملف إحالة** (قائمة البنك/الشركة)
2. البرنامج يكتشف عمود رقم اللوحة تلقائياً (`detectPlateColumn`)
3. يعرض كل أعمدة كل ملف ويختار تلقائياً الأعمدة المفيدة (`guessDefaultColumns`)
4. عند ضغط "ابدأ الفرز":
   - لو الداتا أكبر من الإحالة → يبني map للداتا (10K chunk) ويبحث في الإحالة الصغيرة (O(1) per row)
   - لو الإحالة أكبر → يبني index للإحالة ويلف على الداتا (300 chunk مع yield)
5. يعرض النتائج: رقم اللوحة + نوع التطابق (exact/fuzzy) + الأعمدة المختارة

---

## تفاصيل تقنية مهمة

### تطبيع اللوحة
```ts
normalizePlate("أ ب ح 1234") // → "ابح1234"
// يشيل الفراغات + يحول أ/إ → ا
```

### تحويل لوحات البنك الإنجليزية
```ts
bankPlateToArabic("NKD 5678") // → "نكد5678"
// خريطة: N→ن, K→ك, D→د, H→هـ, U→و, V→ي, A→ا, B→ب ...
// الحروف اللي ملهاش تعريب تبقى كما هي
```

### Levenshtein — Two-row optimization
- الفكرة: بدل 2D matrix → صفين فقط بـ module-level buffers
- عشان 7-char لوحات سعودية: threshold 88% = لازم يشتركوا في أول حرف

### اختيار الأعمدة التلقائي
`PREFERRED_COLS` في `lib/sortingCols.ts` — يشمل:
- الماركة / طراز المركبة / صانع المركبة / Vehicle Name
- GPS
- النوع / نوع السيارة / نوع المركبة
- الحي
- لون / لون السيارة / لون المركبة الأساسي
- سنة الصنع / Year Model

**لا يختار:** رقم الهيكل / Chassis Number / البنك / Agency / F-Account number

---

## حالة العمل الحالية

### مكتمل ✅
- [x] TDD cycle كامل على `plateParser.ts` (44 اختبار تعدي)
- [x] استخراج `sortingCols.ts` بـ tests
- [x] Async chunked matching — الصفحة لا تتجمد
- [x] إصلاح التجمد مع ملفات الداتا الكبيرة (464K صف)
  - الخوارزمية الجديدة: لما الداتا أكبر → بني data map → ابحث في الإحالة الصغيرة
  - من 6+ ثانية انتظار → ~1 ثانية
- [x] Debug panel يظهر عدد الصفوف والتطابقات وعينات اللوحات

### معلق ⏳
- [ ] إزالة debug panel بعد تأكيد الفرز يشتغل صح على الموبايل والويب
- [ ] بناء APK جديد — فيه إصلاح `MainActivity.java` لـ file picker على Android
  - الإصلاح موجود في الكود لكن مش متبني في APK بعد

---

## ملاحظات الملفات المستخدمة في الاختبار

| الملف | النوع | الصفوف | ملاحظة |
|-------|-------|--------|--------|
| نسخه من التفريغ .xlsx | داتا ميدانية | ~10 | ملف صغير للاختبار |
| داتا ج.xlsx | داتا ميدانية | 464,541 | الملف الكبير الحقيقي |
| مجمع البنك الاهلي .xlsx | إحالة بنك عربي | ~3,782 | أعمدة: رقماللوحة, طراز المركبة, صانع المركبة, سنة الصنع, لون المركبة الأساسي, رقم الهيكل |
| شيت احاله بنك .xlsx | إحالة بنك إنجليزي | صغير | أعمدة: Plate Number, Vehicle Name, Chassis Number, Year Model |

---

## أوامر مفيدة

```bash
npx vitest run                  # تشغيل الاختبارات
npx next dev                    # dev server على localhost:3000
git push                        # يبني Vercel تلقائياً
```

لاختبار APK على Android:
- امسح كاش التطبيق من إعدادات الهاتف
- أو ابني APK جديد: `npx cap build android` ثم رفع على GitHub Releases

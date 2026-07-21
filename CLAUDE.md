# PlateHunter KSA — Project Context

## ما هو المشروع

تطبيق ويب + موبايل (PWA / Capacitor) لبحث وتتبع لوحات السيارات في المملكة العربية السعودية.
يُستخدم للمقارنة بين قوائم الإحالة (من البنوك / شركات التمويل) وبيانات التفريغ الميداني
لمعرفة أي سيارة مطلوبة موجودة في أي حي.

- **Production URL:** https://platehunter-ksa.vercel.app
- **Repo:** https://github.com/assemmohamed669-lgtm/platehunter-ksa
- **Mobile:** Capacitor APK — يتحمل الـ bundle من الـ Vercel URL مباشرة
  - تغييرات JS/TS تظهر تلقائياً بعد `git push` بدون بناء APK جديد
  - بناء APK جديد مطلوب فقط لتغييرات Java/Kotlin أو AndroidManifest

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
  plateParser.ts     # normalizePlate, bankPlateToArabic, detectPlateColumn,
                     # similarityPercent, levenshtein, parsePlateFromTranscript,
                     # buildReferralIndex, matchChunkAgainstIndex
  sortingCols.ts     # PREFERRED_COLS, matchesPreferred(h), guessDefaultColumns, isMandatory
  gps.ts             # toMapsLink(lat,lng), extractLatLngFromMapsLink(url), haversineKm
  excel.ts           # parseExcelFile — يفضّل ورقة "تشييك" على أول ورقة
                     # exportRecordingsToExcel, buildExcelBlob, shareExcelBlob
  idb.ts             # IndexedDB: saveUploadedFile, getUploadedFile, deleteUploadedFile
                     # getAllRecordings, saveRecording, deleteRecording

app/(app)/
  sorting/page.tsx        # صفحة الفرز — رفع ملفين Excel ومقارنة اللوحات
  instant-check/page.tsx  # صفحة التشييك (الـ tab الرئيسي) — يدوي + كاميرا + صوت
  checking/page.tsx       # سجلات التشييك الميداني + إدارة ملف التشييك
  registration/page.tsx   # تسجيل اللوحات بالصوت — يقرأ ملف التشييك للمقارنة

app/api/
  read-plate/route.ts     # OCR الكاميرا — Groq qwen/qwen3.6-27b (بمفتاح المندوب)

components/
  PlateBadge.tsx      # عرض اللوحة (أرقام يسار / حروف يمين)، sizes: xs/sm/md/lg
  FileUploadBox.tsx   # مكوّن رفع ملفات Excel مع showReplaceButtons
  BottomNav.tsx       # التنقل: الرئيسية / الفرز / التسجيل / تشييك / الخرائط

__tests__/
  plateParser.test.ts  # 44 اختبار على منطق اللوحات
  sortingCols.test.ts  # 25 اختبار على الأعمدة التلقائية
```

---

## نمط IDB المشترك (local:check)

جميع الصفحات تشارك **نفس slot** لملف التشييك:

```ts
// الحفظ (instant-check فقط هو اللي يرفع ويحذف)
saveUploadedFile({ key: "local:check", agentId: "local", slot: "check", ... })

// القراءة (كل الصفحات)
getUploadedFile("local", "check")

// الحذف (instant-check فقط)
deleteUploadedFile("local", "check")
```

- **`/instant-check`** (tab "تشييك" في BottomNav) — يرفع / يغيّر / يحذف ملف التشييك
- **`/checking`** — يقرأ نفس الملف (read-only في السياق، لكن فيه FileUploadBox أيضاً)
- **`/registration`** — يقرأ فقط، بدون زر رفع

---

## صفحة التشييك `/instant-check` — كيف تشتغل

### الملف: `app/(app)/instant-check/page.tsx`

1. عند التحميل: يقرأ `local:check` من IDB
2. يبني `checkIndex: Map<normalizedPlate, row>` بـ `useMemo` — O(1) lookup
3. ثلاث طرق للبحث: **يدوي** / **كاميرا** / **صوت (PTT)**
4. `searchInCheck(rawPlate)`:
   - exact: `checkIndex.get(normalized)` — فوري
   - fuzzy: يلف على الـ Map مع first-char skip + threshold 88%
   - عند أي تطابق: `playMatchAlert()` (3 beeps)
5. `ResultCard`: يعرض `PlateBadge` + CheckCircle2 (exact) أو AlertTriangle (fuzzy %) أو XCircle (غير موجود)

### OCR الكاميرا: `app/api/read-plate/route.ts`
- Model: **`qwen/qwen3.6-27b`** (رؤية على Groq، بمفتاح المندوب نفسه بتاع الصوت) مع `reasoning_effort: "none"`
  - **ملاحظة:** موديل `meta-llama/llama-4-scout-17b-16e-instruct` القديم اتوقف من Groq (٢٠٢٦/٦/١٧). أي موديل رؤية جديد لازم يبقى من كتالوج Groq الحالي.
- البرومبت: يشجّع على best-guess حتى لو الصورة غير واضحة، لا يرجع NONE إلا لو مافيش لوحة خالص

---

## صفحة الفرز — كيف تشتغل

1. المستخدم يرفع **ملف داتا** (بيانات التفريغ الميداني) و**ملف إحالة** (قائمة البنك/الشركة)
2. البرنامج يكتشف عمود رقم اللوحة تلقائياً (`detectPlateColumn`)
3. يختار تلقائياً الأعمدة المفيدة بـ `matchesPreferred(h)` (GPS، الحي، الطراز، اللون، السنة...)
4. عند ضغط "ابدأ الفرز":
   - لو الداتا أكبر → يبني Map للداتا (8K chunk) ويبحث في الإحالة الصغيرة O(1)
   - لو الإحالة أكبر → يبني index للإحالة ويلف على الداتا (8K chunk مع yield)
5. GPS cells تظهر كـ links — يدعم URL مباشر وكذلك تنسيق `lat,lng`

### شيتات إحالة متعددة (زر "+ إضافة ملف إحالة")

- زر "**+ إضافة ملف إحالة**" تحت مربع الإحالة يضيف صناديق رفع إضافية (إحالة ٢، ٣، ٤...) بلا حد. كل صندوق نفس سياسة الأول (رفع/فتح/تغيير/مسح).
- كل شيتات الإحالة (الأساسية + الإضافية) **بتتدمج في فرز واحد** ونتيجة واحدة عبر `collectReferralEntries()` في `plateParser.ts` — بيوحّد اللوحات المطبّعة ويزيل التكرار (أول ظهور يكسب)، وكل شيت بيتطبّع بعمود لوحته وحالته (عربي/بنكي إنجليزي).
- **فرز كلي:** كل الإحالات تتطابق على ملف الداتا → نتيجة مجمّعة.
- **فرز جديد:** الجديد = لوحات الإحالة (كل الشيتات) اللي **مش** في ملف التشييك، وبعدين تتطابق على **ملف الداتا وشيت السجلات** معاً.
- الشيتات الإضافية بتتخزّن في IDB slots متتابعة (`referral-2`, `referral-3`...) فتفضل بعد إعادة فتح التطبيق. تلوين المكرر والتصدير بيستخدموا `MatchResult.refPlateNorm` (محسوبة وقت الفرز) عشان يشتغلوا عبر شيتات بأعمدة مختلفة.

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
```

### Levenshtein — Two-row optimization
- بدل 2D matrix → صفين فقط بـ module-level buffers
- threshold 88% مع first-char optimization (لوحات 7 أحرف)

### اختيار الأعمدة التلقائي — `matchesPreferred(h)`
يختار: الماركة / طراز / صانع / Vehicle Name / GPS / النوع / الحي / اللون / سنة الصنع / Year Model / **البنك** (بطلب المستخدم — بيجمّع محافظ من بنوك مختلفة)

**لا يختار:** رقم الهيكل / Chassis Number / Agency / F-Account number

### قراءة Excel — `parseExcelFile`
- يفضّل الورقة المسماة **"تشييك"** على أول ورقة في الملف
- إذا لم توجد ورقة بهذا الاسم → يقرأ الأولى

---

## حالة العمل الحالية

### مكتمل ✅
- [x] TDD cycle كامل على `plateParser.ts` (44 اختبار)
- [x] استخراج `sortingCols.ts` بـ tests
- [x] Async chunked matching — الصفحة لا تتجمد
- [x] إصلاح التجمد مع ملفات الداتا الكبيرة (464K صف) → ~1 ثانية
- [x] صفحة التشييك `/instant-check` — يدوي + كاميرا + صوت مع PlateBadge result card
- [x] Map index O(1) + fuzzy (88%) + playMatchAlert في instant-check
- [x] Camera OCR بـ Groq qwen/qwen3.6-27b مع prompt محسّن
- [x] ملف التشييك مشترك بين كل الصفحات عبر `local:check` IDB slot
- [x] GPS links في sorting و instant-check (URL و lat,lng)
- [x] `matchesPreferred` لاختيار الأعمدة تلقائياً في كل الصفحات
- [x] `parseExcelFile` يفضّل ورقة "تشييك"
- [x] شيتات إحالة متعددة — زر "+ إضافة ملف إحالة" + دمج كل الإحالات في فرز واحد (`collectReferralEntries`)

### معلق ⏳
- [ ] بناء APK جديد — إصلاح `MainActivity.java` لـ file picker على Android
  - التغيير موجود في الكود لكن مش متبني في APK بعد
  - بناء: `npx cap build android` ثم رفع على GitHub Releases

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

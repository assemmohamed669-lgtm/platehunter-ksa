# PlateHunter KSA — توثيق شامل للمشروع

## معلومات أساسية

- **اسم المشروع:** PlateHunter KSA
- **المسار على الجهاز:** `C:\Users\assem\OneDrive\Dokumente\GitHub\platehunter-ksa`
- **Production URL:** https://platehunter-ksa.vercel.app
- **GitHub:** https://github.com/assemmohamed669-lgtm/platehunter-ksa
- **Deploy:** تلقائي من `main` branch على Vercel
- **APK Android:** يُبنى من Android Studio، يُحمّل الـ web bundle من Vercel مباشرة

---

## الهدف من التطبيق

تطبيق PWA + Android لفرق التحصيل الميداني في المملكة العربية السعودية.  
يُستخدم لمطابقة لوحات السيارات بين بيانات الميدان وقوائم البنوك/شركات التمويل لتحديد السيارات المطلوبة.  
معظم المستخدمين مصريون → يدعم اللكنة المصرية والعامية.

---

## Tech Stack

| الطبقة | التقنية |
|--------|---------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Mobile | Capacitor 8 (Android APK) |
| Backend / Auth | Supabase |
| Excel | xlsx / SheetJS |
| Local Storage | IndexedDB (lib/idb.ts) |
| Tests | Vitest (TDD) |
| GPS | Capacitor Geolocation (native) + Web Geolocation API (fallback) |
| Speech | Capacitor Speech Recognition (native) + Web Speech API (fallback) |

---

## الصفحات

### `/registration` — صفحة التسجيل الميداني
الصفحة الرئيسية للعمل الميداني:
- **ملف التشييك:** رفع Excel فيه شيتين → يقرأ شيت **"تشييك"** بالاسم (قائمة لوحات البنك للمطابقة الفورية)
- **GPS:** يتتبع الموقع باستمرار + يعرض الشارع والحي تلقائياً عبر reverse geocoding
- **تسجيل صوتي:** زرار مايكروفون → يفرّغ الصوت → يستخرج اللوحة + النوع + الملاحظات تلقائياً
- **إدخال يدوي:** كتابة اللوحة يدوياً → يأخذ GPS في نفس اللحظة
- **مطابقة فورية:** كل لوحة تتسجل تُطابَق مع شيت التشييك → لو طلع match → صوت تنبيه + modal
- **Modal المطابقة:** يعرض كل اللوحات المتطابقة في نافذة واحدة (مش نافذة لكل لوحة)، كل لوحة معها GPS + شارع + حي
- **Export:** مشاركة أو فتح Excel، GPS فيه hyperlink حقيقي قابل للضغط
- **WhatsApp share:** كل لوحة تحتوي على `📍 الموقع على الخريطة: [link]`
- **Debug Panel:** يعرض مراحل تفريغ الصوت (للتشخيص)

### `/sorting` — صفحة الفرز
- **تاب الملفات:** رفع ملف داتا (ميدان) + ملف إحالة (بنك) → فرز ومطابقة
- **تاب اللصق النصي:** لصق لوحات نصياً → بحث في الداتا
- **الأعمدة:** accordion مطوي افتراضياً، السهم يفتح/يقفل
- **الأداء:** chunk size = 8000 صف → سريع حتى مع 464K صف
- **نتائج:** جدول قابل للتكبير، تحديد متعدد، مشاركة واتساب، export Excel

### `/instant-check` — فحص سريع
بحث نصي فوري في قائمة لوحات.

### `/checking` — عرض السجلات
عرض كل السجلات المحفوظة.

---

## الملفات الرئيسية

```
lib/
  plateParser.ts       — parser الصوت: 17 خطوة، يستخرج لوحة + نوع + ملاحظات
  sortingCols.ts       — PREFERRED_COLS، MANDATORY_COLS، guessDefaultColumns
  excel.ts             — buildExcelBlob (مع hyperlinks)، readBankExcel، shareExcelBlob
  idb.ts               — IndexedDB: saveRecording، getAllRecordings، updateGeodata، updateNotes
  gps.ts               — GpsService: startTracking، getLastCoords، pinCurrentLocation، toMapsLink
  geocoding.ts         — reverseGeocode: lat/lng → شارع + حي
  sync.ts              — مزامنة السجلات مع Supabase

app/(app)/
  registration/page.tsx  — صفحة التسجيل الكاملة
  sorting/page.tsx       — صفحة الفرز الكاملة

components/
  RecordingsTable.tsx    — جدول السجلات مع zoom + تحديد + مشاركة + حذف
  PlateBadge.tsx         — عرض اللوحة بشكل مميز
  FileUploadBox.tsx      — مكوّن رفع الملفات

__tests__/
  plateParser.test.ts    — 73 اختبار TDD
  sortingCols.test.ts    — اختبارات الأعمدة التلقائية
```

---

## plate parser — كيف يشتغل

**Pipeline (17 خطوة):**
1. إزالة diacritics
2. استخراج نوع السيارة (ونيت/فان/دباب)
3. تطبيع: ه→هـ، ى→ي
4. تحويل أسماء الحروف → حرف واحد (حاء→ح، ميم→م، نون→ن ...)
5. أسماء مصرية: را→ر، طا→ط، كي→ك، ءاف/آف→ق
6. دمج صوتي (phonetic merges)
7. تحويل الأرقام المنطوقة → أرقام (واحد→1، اتنين→2 ... حداشر→11، تلاتين→30 ...)
8. تنظيف

**Token scan (proximity-based):**
- يبحث عن tokens الأرقام أولاً
- يمشي للوراء منهم لأقرب حروف لوحة
- `letterBuf.unshift()` يحافظ على ترتيب الحروف
- يقبل token من 3 حروف كـ token واحد (حمن، ابك، درق)
- كل الكلمات اللي مش جزء من اللوحة → `notes`

**الـ 17 حرف الصحيحة:**
أ ب ح د ر س ص ط ع ق ك ل م ن هـ و ي (+ ى تُعامَل كـ ي)

---

## اللكنة المصرية (مضافة في parser)

**حروف:**
- را → ر
- طا → ط  
- كي → ك
- ءاف / آف → ق (glottal stop)

**أرقام:**
- اتنين → 2، تلاتة → 3، تمانية → 8
- حداشر → 11، اتناشر → 12، تلتاشر → 13، اربعتاشر → 14
- تلاتين → 30، اربعين → 40، تمانين → 80

---

## ملف التشييك (Excel)

الملف اللي يُرفع في صفحة التسجيل يحتوي على شيتين:
- **شيت "تشييك":** لوحات البنك المطلوبة (يُقرأ تلقائياً للمطابقة)
- **شيت "تسجيل":** مخصص للتسجيلات اليدوية (غير مستخدم برمجياً حالياً)

`readBankExcel` يبحث عن شيت اسمه "تشييك" أولاً، لو مش موجود يأخذ أول شيت.

---

## خوارزمية الفرز (sorting)

```
بناء referralMap → loop على dataTable بـ chunks (8000 صف) →
normalizePlate + bankPlateToArabic لكل صف →
Map.get() → O(1) per row
```

- **CHUNK = 8000** (كان 300 → بطيء جداً → تم تسريعه)
- **yield** كل chunk للحفاظ على استجابة الـ UI
- لا يوجد fuzzy matching في الصفحة الحالية (exact match فقط)

---

## الثيم والألوان

```typescript
// Tailwind config colors (آخر تحديث: يونيو 2026)
night: "#0D1117"        // خلفية التطبيق (رمادي داكن محايد)
surface: "#161B22"      // الكروت والـ nav
surface-2: "#21262D"    // الـ inputs
border: "#30363D"       // الحدود
primary: "#2EA043"      // الأخضر الناعم (أزرار، حالات نشطة)
glow: "#3FB950"         // أخضر فاتح (لوحات، مطابقات)
ink: "#E6EDF3"          // نص رئيسي
muted: "#8B949E"        // نص ثانوي
alert: "#D29922"        // تحذير (amber)
danger: "#F85149"       // خطر (أحمر ناعم)
```

الثيم مستوحى من GitHub Dark — مريح للعين، غير ناصع.

---

## GPS

- **Native (Android APK):** Capacitor Geolocation → `watchPosition` مستمر
- **Web fallback:** `navigator.geolocation.watchPosition`
- **كل 5 ثواني:** `setInterval` يُرسل آخر إحداثيات للـ subscribers
- **Reverse geocoding:** يحوّل lat/lng → اسم شارع + حي
- **toMapsLink:** `https://www.google.com/maps?q={lat},{lng}`
- **في التسجيل الصوتي:** GPS يُأخذ عند **بداية** التسجيل
- **في الإدخال اليدوي:** GPS يُأخذ من الـ `gps` React state عند الحفظ

---

## Capacitor / Android APK

```typescript
// capacitor.config.ts
server: { url: "https://platehunter-ksa.vercel.app" }
// الـ APK يحمّل الـ web bundle من Vercel مباشرة
```

**Plugins:**
- `@capacitor-community/speech-recognition` — التعرف الصوتي
- `@capacitor-community/file-opener` — فتح ملفات Excel
- `@capacitor/filesystem` — حفظ ملفات مؤقتة للمشاركة
- `@capacitor/geolocation` — GPS
- `@capacitor/share` — مشاركة الملفات

**بناء APK:**
```bash
npx cap sync android
# ثم: Android Studio → Build → Build Bundle(s)/APK(s) → Build APK(s)
```

---

## Excel — hyperlinks

`buildExcelBlob` في `lib/excel.ts` تفحص كل خلية:
- لو القيمة تبدأ بـ `https://` تُضاف `cell.l = { Target: url }` → hyperlink حقيقي في Excel

---

## RecordingsTable — مشاركة واتساب

`rowToText(entry)` تُرسل:
```
🚗 رقم اللوحة: حمن8531
نوع السيارة: ونيت
الشارع: شارع الملك فهد
الحي: العليا
ملاحظات: مركونه
المسجّل: assem
📍 الموقع على الخريطة: https://www.google.com/maps?q=...
التاريخ: 25-06-2026 14:30
```

---

## أوامر مفيدة

```bash
npx vitest run          # تشغيل كل الاختبارات
npx next dev            # dev server على localhost:3000
git push                # deploy تلقائي على Vercel
npx cap sync android    # sync الكود للـ APK
```

---

## حالة المشروع (آخر تحديث: 25 يونيو 2026)

### مكتمل ✅
- Parser صوتي كامل مع لكنة مصرية (73 اختبار)
- تسجيل صوتي + يدوي مع GPS
- مطابقة فورية مع شيت التشييك (modal يعرض كل المتطابقات)
- صفحة الفرز مع accordion للأعمدة + أداء عالي
- Export Excel مع hyperlinks + مشاركة واتساب مع link الخريطة
- ثيم مريح للعين (GitHub Dark inspired)
- Capacitor APK يشتغل على Android

### ملاحظات للجلسة القادمة
- الإضافة الجديدة (لم تُنفَّذ بعد) كانت في طور الشرح عند انتهاء الجلسة

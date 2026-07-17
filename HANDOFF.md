# HANDOFF — محرّك تطبيع الكلام (speech-normalizer) | تسليم للسيشن الجاي

**آخر تحديث:** ٢٠٢٦-٠٧-١٧
**الفرع:** `main` (كل الشغل تحت متنشر على Vercel)
**السياق:** بنبني «محرّك تطبيع كلام» عربي (من برومبت `platehunter-normalizer-full-prompt.md`) — استخراج منطق تطبيع **الكلام** من `lib/plateParser.ts` لموديول مستقل. إحنا في **المرحلة ١-ب**، خلّصنا الأساس الآمن بس، وواقفين قبل الـ refactor الكبير.

---

## ١) الحالة الحالية — إيه اللي خلص واتنشر

| الخطوة | الوصف | الـ commit |
|--------|-------|-----------|
| محركات الصوت | حذف Soniox/OpenAI + إضافة Groq Whisper و ElevenLabs (اختيار أدمن) | `b08acc4` |
| **hotfix الأرقام** | إضافة صيغ منطوقة ناقصة لـ `SPOKEN_NUMBERS` (اربعه/تمنيه… كانت بتضيع بصمت) + جرد كامل ٠-٩ | `69aa6a5` |
| **شيل «واحده/واحدة»** | كلمات شائعة كانت بتولّد لوحات وهمية؛ اتشالت (الرقم ١ = «واحد/وحده» بس) + بذرة golden dataset | `5ec3208` |
| **قفل `normalizePlate`** | `__tests__/normalizePlateLock.test.ts` — ١٦ حالة تقفل تطبيع المطابقة (الخط الأحمر) | `f2224f2` |
| **ملف بذرة الحروف** | `lib/dictionaries/saudiPlateLetters.ts` — الـ17 حرف محفوظين حرفياً (بيانات نقية، **مش متستوردة لسه**) | `f2224f2` |

**الاختبارات:** **٥٢٢ كلها خضرا.** البناء سليم. `normalizePlate` والفرز/المطابقة **ما اتلمسوش**.

**ملفات مهمة موجودة:**
- `lib/plateParser.ts` — البارسر الحالي (المصدر اللي هنستخرج منه).
- `lib/dictionaries/saudiPlateLetters.ts` — بذرة الحروف (SAUDI_PLATE_LETTERS + COMMON_LETTER_MISTAKES + PHONETIC_NEIGHBOR_GROUPS + LATIN_TO_ARABIC).
- `tests/golden/ambiguity-wahda.json` + `__tests__/golden.test.ts` — هارنس golden dataset (بذرة).
- `__tests__/normalizePlateLock.test.ts` — قفل المطابقة.
- `docs/speech-normalizer-notes.md` — مبدأ «ممنوع الإسقاط الصامت».
- البرومبت الكامل: `C:\Users\assem\OneDrive\الصور\platehunter-normalizer-full-prompt.md` (خارج الريبو).

---

## ٢) الخطوط الحمرا — ممنوع تكسرها

1. **`normalizePlate` ممنوع تتلمس.** دي تطبيع **المطابقة** (الفرز/المطلوب/التشييك)، **مش** تطبيع الكلام. `__tests__/normalizePlateLock.test.ts` (١٦ حالة) بيقفلها — لو اتكسر، إنت غيّرت سلوك المطابقة → **ارجع فوراً**.
2. **الـ ٥٢٢ اختبار لازم تفضل خضرا بدون تعديل توقّعات أي اختبار قديم.** لو اختبار قديم كسر أثناء الاستخراج → ده معناه الاستخراج **غيّر سلوك** → **وقف وبلّغ**، ماتعدّلش توقّع الاختبار عشان يعدّي.
3. **مبدأ «ممنوع الإسقاط الصامت» (No Silent Drops).** (تفاصيل في `docs/speech-normalizer-notes.md`.) أي رقم أو حرف بيسقط (توكن كان المفروض جزء من اللوحة واترفض) **لازم يعلّم اللوحة بثقة منخفضة (أحمر) للمراجعة** — **ممنوع** يختفي بصمت (زي ما كان بيحصل مع اربعه→ملاحظة والرقم يضيع). يتطبّق في **تصميم الإنجن نفسه**، مش كتعليق.

---

## ٣) خريطة الشغل المتبقي في المرحلة ١-ب (بالترتيب)

> القاعدة: كل خطوة تخلص + كل الاختبارات خضرا + ملخص، قبل الانتقال للي بعدها.

1. **اشتقاق القواميس من البذرة** (`lib/dictionaries/`): `letters.ts` و `phoneticAliases.ts` و قسم الحروف في `commonMistakes.ts` — **مشتقّة من** `saudiPlateLetters.ts` (import/transform — **مش** إعادة كتابة أو اختراع). احترم `riskyOverlaps` (ممنوع تحويلها بالقاموس المباشر — آلة الحالة بس).
2. **استخراج باقي القواميس كبيانات نقية** من `plateParser.ts` الحالي: `numbers.ts` (SPOKEN_NUMBERS بعد الـ hotfix)، `zeroForms.ts` (ZERO_WORD_RE)، `noiseWords.ts`، `mergedWords.ts` (PHONETIC_MERGES)، `vehicleTypes.ts` (VEHICLE_TYPES). نقل بدون تغيير قيم.
3. **وحدات الـ pipeline** (`lib/speech-normalizer/`): unicodeCleanup → removeNoise → learnedCorrections → normalizeNumbers → normalizeLetters → normalizeWords → splitMergedLetters → plateContextStateMachine → fuzzy → phonetic → platePatternDetector + validators (تستخدم قواعد `structuredPlates.ts` — مش تكرارها) → confidenceScore → trace.
4. **refactor `plateParser.ts` → thin consumer** للإنجن (آخر وأخطر خطوة). صفر تغيير سلوك — الأقفال والـ٥٢٢ اختبار هي الحكم. `parsePlateFromTranscript`/`extractMultiplePlates` يبقوا واجهة رفيعة بتنادي `normalizeTranscript`.

**نصيحة:** الخطوة ٤ هي الأخطر — اعملها بأصغر خطوات ممكنة مع تشغيل `npx vitest run` بعد كل نقلة.

---

## ٤) القرارات المعمارية المتفق عليها

1. **نطاق الإنجن = تطبيع الكلام (speech→plate) فقط.** مايلمسش تطبيع المطابقة (`normalizePlate`) اللي الفرز بيعتمد عليه. الاتنين مفهومين منفصلين في `plateParser.ts`.

2. **خريطة `bankPlateToArabic` (الموجودة) هي المعتمدة** لتحويل قوائم البنوك الإنجليزية — **مش** `LATIN_TO_ARABIC` بتاعة ملف البذرة. الخريطة المعتمدة (`EN_TO_AR` في `plateParser.ts` سطر ~506):
   ```
   A→ا B→ب C→ح J→ح D→د R→ر S→س X→ص T→ط
   E→ع G→ق K→ك L→ل M→م Z→م N→ن H→ه U→و V→ي
   ```
   **⚠️ فرق مهم:** بذرة `LATIN_TO_ARABIC` مختلفة (مافيهاش C/M، و V→ى بدل ي). فلمّا الإنجن يوصّل تحويل البنوك، **يستخدم `EN_TO_AR` المعتمدة** ويعتبر خريطة البذرة **مرجعية فقط** لحد ما تتأكد بلوحة حقيقية (البذرة نفسها واقفة عند م→Z مش متأكدة).

3. **حالات «واحدة» في `tests/golden/ambiguity-wahda.json` = مقياس نجاح آلة الحالة (المرحلة ٢).** دلوقتي خضرا (اتحلّت بشيل واحدة من القاموس)، بس اللبس الأعمق («وحده/واحد» الأصليين اللي لسه بيتحوّلوا ١) هيتحل جذرياً بـ `plateContextStateMachine` في المرحلة ٢ — والحالات دي (+ حالات مشابهة تتضاف) هي اللي بتثبت نجاحها. **ممنوع** حل اللبس ده باستبدال أعمى في القاموس (بيكسر عدّ حقيقي).

---

## ٥) أوامر مفيدة
```bash
npx vitest run                       # كل الاختبارات (٥٢٢، لازم كلها خضرا)
npx vitest run __tests__/normalizePlateLock.test.ts   # قفل المطابقة
npx vitest run __tests__/golden.test.ts               # golden dataset
npx tsc --noEmit                     # فحص الأنواع
git push origin HEAD:main            # ينشر على Vercel تلقائياً
```

**ابدأ من:** المرحلة ١-ب خطوة ١ (اشتقاق القواميس من البذرة). راجع البرومبت الكامل + `docs/speech-normalizer-notes.md` الأول.

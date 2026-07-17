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

1. ✅ **اشتقاق القواميس من البذرة** (`lib/dictionaries/`): `letters.ts` (CANONICAL_PLATE_LETTERS + LETTER_VARIANT_MAP + buildLetterVariantMap اللي بيرمي عند التعارض) و `phoneticAliases.ts` (phoneticNeighborsOf) و `commonMistakes.ts` (LETTER_MISTAKE_MAP) — كلها مشتقّة من `saudiPlateLetters.ts`. اختبارات: `__tests__/derivedDictionaries.test.ts` (١٤).
2. ✅ **استخراج باقي القواميس كبيانات نقية** من `plateParser.ts`: `numbers.ts` (SPOKEN_NUMBERS) / `zeroForms.ts` (ZERO_WORD_RE) / `noiseWords.ts` (NOTE_KEYWORDS) / `mergedWords.ts` (PHONETIC_MERGES) / `vehicleTypes.ts` (VEHICLE_TYPES). نقل حرفي مؤكّد IDENTICAL بمقارنة برمجية. اختبارات: `__tests__/extractedDictionaries.test.ts` (١٥).
3. ✅ **وحدات الـ pipeline** (`lib/speech-normalizer/`): كل الوحدات مبنية ومختبرة **ومستقلة (البارسر لسه مش بيستهلكها)**. المنسّق `normalizeTranscript` في `index.ts`. اختبارات: `speechNormalizer.core|letters|assembly.test.ts` (٤٠).
   - **مبني كامل (سلوك حالي حتمي):** unicodeCleanup / removeNoise[قائمة فاضية] / learnedCorrections[حقن] / normalizeNumbers[زير قبل الأرقام — مقفول باختبار] / normalizeLetters[variants high + mistakes medium/low] / splitMergedLetters / normalizeWords[تقطيع + note routing + سحب نوع] / platePatternDetector / validators[بيستخدم isStrictPlate] / confidenceScore / trace + سجلّ dropped.
   - **ستَب passthrough (ذكاء مؤجّل للمرحلة ٢):** plateContextStateMachine / fuzzy / phonetic — موجودين في مكانهم بالـ pipeline وبيسجّلوا trace، بس بدون تحويل.
   - **قيدين رسميين متطبّقين:** ترتيب صفر/زير مقفول باختبار بيبوظ لو اتعكس؛ و noise removal (بيتشال) مفصول عن note routing (NOTE_KEYWORDS → ملاحظات).
   - **No Silent Drops في التصميم:** `dropToken` بيسجّل في dropped **و** trace؛ والتوكن غير المعروف بيتحفظ بثقة منخفضة (مش بيختفي).
4. ⏳ **refactor `plateParser.ts` → thin consumer** — **اتقسم بعد بوابة التكافؤ**:
   - ✅ **٤أ — توحيد الداتا (اتعمل):** البارسر بقى يستورد القواميس الخمسة (ZERO_WORD_RE / VEHICLE_TYPES / NOTE_KEYWORDS / PHONETIC_MERGES / SPOKEN_NUMBERS) من `lib/dictionaries/` بدل نسخته الخاصة. صفر تغيير سلوك (القيم IDENTICAL) — كل الاختبارات القديمة خضرا بدون تعديل توقّعات. ٥ commits صغيرة (واحد لكل قاموس).
   - ⛔ **٤ب — توصيل المنطق (متأجّل للمرحلة ٢):** خلّي `parsePlateFromTranscript`/`extractMultiplePlates` ينادوا `normalizeTranscript`. **ممنوع دلوقتي** — بوابة التكافؤ بتوضّح إن الإنجن (scaffold بذكاء مؤجّل) بيختلف عن البارسر في ٦١/١٤٤ لوحة (تقطيع متعدد + حشو/جمع الأرقام + salvage الحروف + anchoring) + ٧/١٤٤ نوع + ثغرات اشتقاق البذرة (`ءاف→ق`, `كي→ك`). لازم المرحلة ٢ تبني الذكاء ده وتسدّ الثغرات، وبعدها بوابة التكافؤ تخضرّ (شيل `.skip`)، وبعدها بس يُسمح بالتوصيل.

**بوابة التكافؤ:** `__tests__/equivalence.harness.test.ts` + `tests/equivalence-corpus.json` (١٤٤ نص). حارس عدم-تراجع نشط (الاختلاف ماينزادش عن ٦١/٧) + بوابتين صارمتين `.skip` (٠ اختلاف) تتفعّلوا لمّا الإنجن يوصل للتطابق.

**⚠️ لبس «ألف» (اتحسم):** القرار المعتمد = الحروف قبل الأرقام (الف = الحرف ا) زي `plateAtoms`. المنسّق اتظبط (`normalizeLetters` قبل `normalizeNumbers`) واختبار صريح: «الف باء دال واحد اتنين تلاته اربعه» → ابد1234. أي إعادة نظر مكانها `plateContextStateMachine` في المرحلة ٢.

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

## ⚠️ ملاحظة بيئة معروفة — `excel.test.ts` بيفشل في الـ worktrees

`__tests__/excel.test.ts` بيفشل في الـ transform برسالة `Failed to resolve import "xlsx" from "lib/excel.ts"`، و`npx tsc` نفسه مابيشتغلش من جوّه الـ worktree (`MODULE_NOT_FOUND` جوّه `tsc.js`). **دي مشكلة بيئة قديمة مالهاش أي علاقة بشغل تطبيع الكلام** — `xlsx`/`typescript` مش قابلين للحل في node_modules المشترك من مسار الـ worktree.

**إثبات (٢٠٢٦-٠٧-١٧):** اتعمل worktree مؤقت على commit `fdfeff8` (parent لـ `b08acc4`، أي **قبل** بداية شغل السيشنات كلها) و`npx vitest run __tests__/excel.test.ts` طلع **نفس الفشل بالظبط**. يبقى موجود من الأصل.

**`npx next build` المحلي مكسور على الجهاز ده (مش worktree-only):** بيفشل بـ
`Module not found: Can't resolve '@/lib/idb'` (و`@/lib/excel`, `@/lib/supabaseClient`,
`@/components/...`) — الـ `@/*` alias مابيتحلّش محلياً رغم إنه متظبّط في tsconfig
والملفات موجودة. **اتأكّد إنه بيئة قديمة مش من أي شغل:** الفشل بنفس الأخطاء بالظبط على
(أ) build جذر الريبو على **`main` النضيف** بدون أي تغييرات، (ب) `fdfeff8` قبل السيشنات،
(ج) الـ worktree. السبب غالباً مسار OneDrive / إعداد node محلي.

> **⚙️ سير التحقق من الـ build:** التحقق يتم عبر **Vercel preview builds من خلال PRs**
> (مش build محلي). مثال: PR #7 — Vercel preview طلع **أخضر (Ready)**. أي فرع تعمله PR
> وتشوف Vercel check.
>
> **مهمة مستقلة مؤجّلة:** إصلاح بيئة الـ build المحلي (`@/` alias) على الجهاز ده.

نفس السبب بيخلي `tsc` مايشتغلش من جوّه الـ worktree — استخدم الالتفاف اللي تحت (tsc من جذر الريبو).

**للتغلب عليها:** شغّل `tsc` من جذر الريبو مباشرةً:
```bash
# من جذر الريبو (مش من جوّه الـ worktree)
node node_modules/typescript/bin/tsc --noEmit -p ".claude/worktrees/<worktree>/tsconfig.json"
```
لتشغيل الاختبارات من غير ملف excel: السويت بيعدّي (٥٠٧ + الجديد)، والملف الفاشل الوحيد هو excel.test.ts للسبب ده. مايتحسبش regression.

## ٥) أوامر مفيدة
```bash
npx vitest run                       # كل الاختبارات (٥٢٢، لازم كلها خضرا)
npx vitest run __tests__/normalizePlateLock.test.ts   # قفل المطابقة
npx vitest run __tests__/golden.test.ts               # golden dataset
npx tsc --noEmit                     # فحص الأنواع
git push origin HEAD:main            # ينشر على Vercel تلقائياً
```

**ابدأ من:** **المرحلة ٢** — بناء ذكاء الإنجن (تقطيع لوحات متعددة + حشو/جمع الأرقام + salvage الحروف + anchoring + سدّ ثغرات البذرة) لحد ما بوابة التكافؤ تخضرّ، وبعدها خطوة ٤ب (توصيل المنطق) **بإذن صريح**. خطوات ١-٢-٣ + ٤أ (توحيد الداتا) خلصت. راجع البرومبت الكامل + `docs/speech-normalizer-notes.md` + بوابة التكافؤ فوق.

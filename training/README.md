# تدريب موديل اللوحات — دليل مرحلة التعلّم

الهدف: نجمّع (صوت المندوب + اللوحة الصح) ونستخدمها نـ**نفصّل (fine-tune)** موديل
Whisper عشان يبقى أدق من Deepgram على اللوحات السعودية (نكسر «حائط الحروف»).

## الخطوات

```
١) تنزيل الداتا  →  ٢) تجهيز (السكريبت ده)  →  ٣) تدريب Whisper  →  ٤) تقييم  →  ٥) ربط بالتطبيق
```

### ١) تنزيل الداتا (من التطبيق)
صفحة الأدمن → «داتا المناديب (مركزي)» → «تنزيل الجديد». بينزّل لكل مندوب:
- `training-<اسم>-labels.json` (اللوحات الصح + التوقيت + الجودة)
- ملفات `<sessionId>.webm` (الصوت)

**حطّي كل الملفات دي في فولدر واحد.**

### ٢) تجهيز الداتا (السكريبت `prepare_dataset.py`)

**المتطلبات:** Python 3.8+ و ffmpeg مثبّت (اكتبي `ffmpeg -version` للتأكد).

```bash
python prepare_dataset.py --input "مسار فولدر التنزيلات" --output "مسار فولدر الداتاسِت"
```

مثال (Windows):
```bash
python prepare_dataset.py --input "C:/Users/assem/Downloads" --output "C:/Users/assem/Desktop/plate-dataset"
```

خيارات:
- `--exclude-weak` : استبعاد اللوحات ضعيفة الثقة (`export-weak`) — للتدريب بأنضف داتا.
- `--pad-ms 200` : هامش الصوت قبل/بعد كل لوحة (افتراضي 200ms).

**المخرجات:** فولدر `data/` فيه:
- `clip_00001.wav …` — مقطع صوت لكل لوحة (16kHz أحادي = صيغة Whisper)
- `metadata.csv` — يربط كل مقطع بنص اللوحة (`file_name,transcription,…`)
- `summary.txt` — ملخّص العدد والجودة

### ٣) التدريب (Google Colab)
السكريبت `train_whisper.py` بيدرّب Whisper على فولدر `data/`.

> ⚠️ **مهم:** التدريب على عدد قليل (عشرات) = «تجربة تشغيل» بس، مش موديل حقيقي
> (الموديل بيحفظهم بس). للموديل الجاد محتاجين **بضع مئات-آلاف** مقطع. كمّلي جمّعي
> الأول، والتدريب الحقيقي يبقى لما نوصل عدد محترم.

**خطوات Colab (بالترتيب):**
1. افتحي [colab.research.google.com](https://colab.research.google.com) → New notebook.
2. **Runtime → Change runtime type → GPU (T4)** → Save.
3. **ارفعي الداتا:** اضغطي فولدر `data/` (اللي فيه الـwav + metadata.csv) في ملف
   `data.zip`، وارفعيه من أيقونة الملفات على شمال Colab. أو من خلية:
   ```python
   from google.colab import files; files.upload()   # ارفعي data.zip
   !unzip -q data.zip -d dataset
   ```
4. **ارفعي السكريبت** `train_whisper.py` بنفس الطريقة (أو انسخي محتواه في خلية).
5. **ثبّتي المكتبات وشغّلي التدريب:**
   ```python
   !pip -q install "transformers==4.44.2" "datasets==2.21.0" accelerate evaluate jiwer soundfile librosa
   !python train_whisper.py --data "dataset/data" --output "whisper-plates" --base "openai/whisper-small"
   ```
6. **نزّلي الموديل المدرّب:**
   ```python
   !zip -r model.zip whisper-plates
   from google.colab import files; files.download("model.zip")
   ```

**مؤشّر النتيجة:** `CER` = نسبة خطأ الحروف (الأقل أحسن). بنقارنها بين النسخ ومع Deepgram.

> لو ظهر أي خطأ وقت التشغيل، ابعتيه لي ونصلّحه سوا (نسخ المكتبات بتتغيّر أحياناً).

### ٤) التقييم
نقيس دقة الموديل المدرّب على لوحات ما شافهاش، ونقارن بـ Deepgram.

### ٥) الربط بالتطبيق
نستضيف الموديل ونربطه خلف مفتاح سوبر أدمن — على Preview الأول، وبعد التأكد نعلّي main.

## ملاحظات الجودة (الوسوم في metadata)
- `gold` / `edited` — المندوب عدّلها بإيده = **أنضف داتا** (صح مؤكّد).
- `export-matched` — طابقت قائمة معروفة = موثوقة.
- `export-highconf` — ثقة تفريغ عالية.
- `export-weak` — مصدّرة بس (أضعف — استخدمي `--exclude-weak` لو عايزة تتجنّبيها).

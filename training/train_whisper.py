#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
train_whisper.py
================
يدرّب (fine-tune) موديل Whisper على داتا اللوحات اللي جهّزناها بـ prepare_dataset.py.
النتيجة = موديل متخصص في نطق اللوحات السعودية، ممكن يشتغل بدل/مع Deepgram.

يُشغَّل على **Google Colab** (بـ GPU مجاني) — مش على جهاز عادي (التدريب محتاج GPU).

الخطوات في Colab:
  1) Runtime → Change runtime type → GPU (T4).
  2) ارفعي فولدر الداتا (data/ اللي فيه المقاطع + metadata.csv) — مضغوط zip.
  3) شغّلي الخلايا بالترتيب (شوفي training/README.md).

الاستخدام (في خلية Colab):
  !pip -q install "transformers==4.44.2" "datasets==2.21.0" accelerate evaluate jiwer soundfile librosa
  !python train_whisper.py --data "dataset/data" --output "whisper-plates" --base "openai/whisper-small"

المخرجات: فولدر فيه الموديل المدرّب (نضغطه وننزّله).
"""
import argparse
import os
import sys


def main():
    # شاشة ويندوز (cp1252) بتفشل في طباعة العربي/الإيموجي — نجبر UTF-8.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="تدريب Whisper على داتا اللوحات")
    ap.add_argument("--data", required=True, help="فولدر الداتا (فيه metadata.csv + ملفات wav)")
    ap.add_argument("--output", default="whisper-plates", help="فولدر حفظ الموديل المدرّب")
    ap.add_argument("--base", default="openai/whisper-small", help="الموديل الأساسي (small أخف، medium أدق)")
    ap.add_argument("--epochs", type=float, default=10, help="عدد مرات المرور على الداتا")
    ap.add_argument("--batch", type=int, default=8, help="حجم الدفعة (قلّليه لو الذاكرة صغيرة)")
    ap.add_argument("--lr", type=float, default=1e-5, help="معدّل التعلّم")
    ap.add_argument("--eval-samples", type=int, default=200, help="عيّنات التقييم الداخلي (التقييم الحقيقي بـtest_whisper.py)")
    args = ap.parse_args()

    # استيراد المكتبات جوّه الدالة عشان رسالة الخطأ تبقى واضحة لو مش متثبّتة.
    try:
        import torch
        from datasets import Dataset, Audio
        from transformers import (
            WhisperProcessor, WhisperForConditionalGeneration,
            Seq2SeqTrainingArguments, Seq2SeqTrainer,
        )
        import evaluate
    except ImportError as e:
        print("❌ مكتبة ناقصة:", e)
        print('ثبّتي الأول:  !pip install "transformers==4.44.2" "datasets==2.21.0" accelerate evaluate jiwer soundfile librosa')
        sys.exit(1)

    from dataclasses import dataclass
    from typing import Any

    # ── (١) تحميل الداتا يدوياً من metadata.csv ──────────────────────────────
    # (بدل audiofolder — فيه باج مع الأعمدة الإضافية: «file_name key must be a string»)
    import csv as _csv
    print(f"📂 بحمّل الداتا من: {args.data}")
    meta_path = os.path.join(args.data, "metadata.csv")
    _rows = []
    with open(meta_path, encoding="utf-8") as _f:
        for r in _csv.DictReader(_f):
            fn = (r.get("file_name") or "").strip()
            tx = (r.get("transcription") or "").strip()
            if not fn or not tx:
                continue
            _rows.append({"audio": os.path.join(args.data, fn), "transcription": tx})
    ds = Dataset.from_list(_rows).cast_column("audio", Audio(sampling_rate=16000))
    n = len(ds)
    print(f"   عدد المقاطع: {n}")
    if n < 20:
        print("⚠️  الداتا قليلة جداً — النتيجة دي «تجربة تشغيل» بس، مش موديل حقيقي.")
        print("    الموديل الجاد محتاج مئات-آلاف المقاطع. كمّلي جمّعي وأعيدي التشغيل بعدين.")
    # قسمة تدريب/تقييم (10% تقييم، على الأقل عيّنة واحدة)
    test_size = max(1, int(n * 0.1)) if n >= 10 else 1
    split = ds.train_test_split(test_size=test_size, seed=42)
    split = split.cast_column("audio", Audio(sampling_rate=16000))
    print(f"   تدريب: {len(split['train'])} | تقييم: {len(split['test'])}")

    # ── (٢) الموديل والمعالج ─────────────────────────────────────────────────
    print(f"🧠 بحمّل الموديل الأساسي: {args.base}")
    processor = WhisperProcessor.from_pretrained(args.base, language="arabic", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(args.base)
    model.generation_config.language = "arabic"
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None

    # ── (٣) الميزات **وقت التدريب** (لكل دفعة) — مش map مسبق ───────────────────
    # ليه؟ حساب الميزات لكل الداتاسِت مقدماً (map) بياخد ~١ ميجا للمقطع، فـ٧٦٠٠
    # مقطع = ~٧ جيجا → Colab بيقتل العملية في نص الطريق (اتأكد ميدانياً: كانت
    # بتموت عند ٧٣٪ بالظبط مرتين). بحساب الميزات في المُجمِّع، الذاكرة المستخدمة
    # = حجم الدفعة بس (٨ مقاطع) — ثابتة وصغيرة، وكمان بنوفّر وقت الـmap.
    @dataclass
    class Collator:
        processor: Any
        def __call__(self, features):
            arrays = [f["audio"]["array"] for f in features]      # فك الصوت لحظياً
            batch = self.processor.feature_extractor(
                arrays, sampling_rate=16000, return_tensors="pt")
            lab = [{"input_ids": self.processor.tokenizer(f["transcription"]).input_ids}
                   for f in features]
            labels_batch = self.processor.tokenizer.pad(lab, return_tensors="pt")
            labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
            if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
                labels = labels[:, 1:]
            batch["labels"] = labels
            return batch

    collator = Collator(processor)

    # التقييم الداخلي: نكتفي بعيّنة صغيرة (التقييم الحقيقي بيتم بـtest_whisper.py
    # على مقاطع حقيقية محجوزة) — التوليد بطيء، و٧٦١ مقطع بياخد ~٢٥ دقيقة بلا داعي.
    if len(split["test"]) > args.eval_samples:
        split["test"] = split["test"].select(range(args.eval_samples))
    print(f"   تقييم داخلي على: {len(split['test'])} مقطع", flush=True)

    # ── (٥) مقياس الدقة (CER = نسبة خطأ الحروف؛ الأقل أحسن) ───────────────────
    cer_metric = evaluate.load("cer")

    def compute_metrics(pred):
        pred_ids = pred.predictions
        label_ids = pred.label_ids
        label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
        pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
        label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)
        return {"cer": cer_metric.compute(predictions=pred_str, references=label_str)}

    # ── (٦) إعدادات التدريب ──────────────────────────────────────────────────
    steps_per_epoch = max(1, len(split["train"]) // max(1, args.batch))
    max_steps = max(20, int(steps_per_epoch * args.epochs))
    training_args = Seq2SeqTrainingArguments(
        output_dir=args.output,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        gradient_accumulation_steps=1,
        learning_rate=args.lr,
        warmup_steps=min(20, max_steps // 10),
        max_steps=max_steps,
        fp16=torch.cuda.is_available(),
        predict_with_generate=True,
        generation_max_length=16,
        logging_steps=5,
        save_strategy="no",
        report_to=[],
        remove_unused_columns=False,  # الـcollator محتاج أعمدة audio/transcription
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=split["train"],
        eval_dataset=split["test"],
        data_collator=collator,
        compute_metrics=compute_metrics,
        tokenizer=processor.feature_extractor,
    )

    # ── (٧) التدريب ──────────────────────────────────────────────────────────
    print(f"🚀 ببدأ التدريب: {max_steps} خطوة (GPU: {torch.cuda.is_available()})")
    trainer.train()

    # ── (٨) تقييم سريع ───────────────────────────────────────────────────────
    print("📊 التقييم:")
    metrics = trainer.evaluate()
    print(f"   CER (نسبة خطأ الحروف، الأقل أحسن): {metrics.get('eval_cer', 'n/a')}")

    # ── (٩) الحفظ ────────────────────────────────────────────────────────────
    trainer.save_model(args.output)
    processor.save_pretrained(args.output)
    print(f"✅ خلص. الموديل المدرّب في: {args.output}")
    print("   اضغطيه ونزّليه:  !zip -r model.zip " + args.output)


if __name__ == "__main__":
    main()

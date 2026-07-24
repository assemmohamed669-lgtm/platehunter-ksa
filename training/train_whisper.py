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
    ap = argparse.ArgumentParser(description="تدريب Whisper على داتا اللوحات")
    ap.add_argument("--data", required=True, help="فولدر الداتا (فيه metadata.csv + ملفات wav)")
    ap.add_argument("--output", default="whisper-plates", help="فولدر حفظ الموديل المدرّب")
    ap.add_argument("--base", default="openai/whisper-small", help="الموديل الأساسي (small أخف، medium أدق)")
    ap.add_argument("--epochs", type=float, default=10, help="عدد مرات المرور على الداتا")
    ap.add_argument("--batch", type=int, default=8, help="حجم الدفعة (قلّليه لو الذاكرة صغيرة)")
    ap.add_argument("--lr", type=float, default=1e-5, help="معدّل التعلّم")
    args = ap.parse_args()

    # استيراد المكتبات جوّه الدالة عشان رسالة الخطأ تبقى واضحة لو مش متثبّتة.
    try:
        import torch
        from datasets import load_dataset, Audio
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

    # ── (١) تحميل الداتا ─────────────────────────────────────────────────────
    print(f"📂 بحمّل الداتا من: {args.data}")
    ds = load_dataset("audiofolder", data_dir=args.data)["train"]
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

    # ── (٣) تجهيز العيّنات (صوت → ميزات، لوحة → رموز) ─────────────────────────
    def prepare(batch):
        audio = batch["audio"]
        batch["input_features"] = processor.feature_extractor(
            audio["array"], sampling_rate=16000).input_features[0]
        batch["labels"] = processor.tokenizer(batch["transcription"]).input_ids
        return batch

    cols = split["train"].column_names
    split = split.map(prepare, remove_columns=cols, num_proc=1)

    # ── (٤) مُجمِّع الدفعات ───────────────────────────────────────────────────
    @dataclass
    class Collator:
        processor: Any
        def __call__(self, features):
            inp = [{"input_features": f["input_features"]} for f in features]
            batch = self.processor.feature_extractor.pad(inp, return_tensors="pt")
            lab = [{"input_ids": f["labels"]} for f in features]
            labels_batch = self.processor.tokenizer.pad(lab, return_tensors="pt")
            labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
            if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
                labels = labels[:, 1:]
            batch["labels"] = labels
            return batch

    collator = Collator(processor)

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

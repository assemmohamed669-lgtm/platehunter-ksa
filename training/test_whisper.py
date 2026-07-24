#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_whisper.py — يجرّب الموديل المدرّب على المقاطع اللي ماشافهاش في التدريب
(نفس قسمة التقييم بـ seed ثابت)، ويطبع: اللوحة الصح مقابل توقّع الموديل + الدقة.

الاستخدام:
  python test_whisper.py --model "C:/Users/assem/Desktop/whisper-plates" \
                         --data  "C:/Users/assem/Desktop/plate-dataset/data"
"""
import argparse, csv, os, re, sys
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def norm(s):
    return re.sub(r"\s+", "", s or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="C:/Users/assem/Desktop/whisper-plates")
    ap.add_argument("--data", default="C:/Users/assem/Desktop/plate-dataset/data")
    ap.add_argument("--all", action="store_true", help="جرّب على كل المقاطع (مش بس التقييم)")
    args = ap.parse_args()

    import torch
    from datasets import Dataset, Audio
    from transformers import WhisperProcessor, WhisperForConditionalGeneration
    import evaluate

    rows = []
    with open(os.path.join(args.data, "metadata.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            fn = (r.get("file_name") or "").strip()
            tx = (r.get("transcription") or "").strip()
            if fn and tx:
                rows.append({"audio": os.path.join(args.data, fn), "transcription": tx})
    ds = Dataset.from_list(rows).cast_column("audio", Audio(sampling_rate=16000))
    if args.all:
        test = ds
    else:
        # نفس القسمة بتاعة التدريب (seed=42) عشان ناخد المقاطع غير المُدرَّب عليها.
        test = ds.train_test_split(test_size=max(1, int(len(ds) * 0.1)), seed=42)["test"]

    print(f"بجرّب على {len(test)} مقطع (غير مُدرَّب عليها)...\n")
    proc = WhisperProcessor.from_pretrained(args.model, language="arabic", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(args.model)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()

    preds, refs, exact = [], [], 0
    for ex in test:
        feat = proc.feature_extractor(ex["audio"]["array"], sampling_rate=16000, return_tensors="pt").input_features.to(device)
        with torch.no_grad():
            ids = model.generate(feat, max_new_tokens=12, language="arabic", task="transcribe")
        pred = proc.tokenizer.decode(ids[0], skip_special_tokens=True).strip()
        ref = ex["transcription"]
        preds.append(pred); refs.append(ref)
        ok = norm(pred) == norm(ref)
        exact += ok
        print(f"{'صح ✅' if ok else 'غلط ❌'} | الصح: {ref:<12} | الموديل قال: {pred}")

    cer = evaluate.load("cer").compute(predictions=[norm(p) for p in preds], references=[norm(r) for r in refs])
    print(f"\n=== النتيجة ===")
    print(f"مطابقة كاملة (لوحة صح تماماً): {exact}/{len(test)} = {round(100 * exact / len(test))}%")
    print(f"CER (نسبة خطأ الحروف): {round(cer * 100, 1)}%")


if __name__ == "__main__":
    main()

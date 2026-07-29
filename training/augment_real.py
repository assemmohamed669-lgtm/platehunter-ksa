#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
augment_real.py — تضخيم المقاطع **الحقيقية** (نفس اللوحة، ظروف صوت مختلفة).
================================================================================
ليه؟ عندنا ٥٣٩ مقطع حقيقي بس — قليلة، والموديل بيحفظها (overfit: الـloss نزل
0.008). التضخيم بيخلّي كل مقطع عدة عيّنات مختلفة (سرعة/نبرة/ضجيج/ضغط تليفون)،
فالموديل يتعلّم **الصوت** مش يحفظ المقطع.

مهم: التضخيم **مايغيّرش اللوحة** — نفس التسمية بالظبط، بس صوت مختلف.

كمان بيحجز جزء **حقيقي نضيف بلا تضخيم** للتقييم الصادق (الموديل عمره ما يشوفه).

مثال:
  python augment_real.py --input "C:/Users/assem/Desktop/plate-dataset-clean/data" \
                         --output "C:/Users/assem/Desktop/plate-real-aug" --variants 5 --holdout 100
"""
import argparse
import csv
import os
import random
import shutil
import subprocess
import sys


def build_filters(rng, variant):
    """سلسلة فلاتر ffmpeg لنسخة مختلفة من نفس المقطع."""
    f = []
    tempo = rng.choice([0.9, 0.95, 1.05, 1.12])
    f.append(f"atempo={tempo}")
    f.append(f"volume={rng.choice([0.6, 0.8, 1.2, 1.4])}")
    if rng.random() < 0.5:
        f.append("highpass=f=200,lowpass=f=3400")   # سماعة تليفون
    if rng.random() < 0.3:
        f.append(f"asetrate=16000*{rng.choice([0.97, 1.03])},aresample=16000")  # نبرة
    return ",".join(f)


def make_variant(src, out, rng):
    afx = build_filters(rng, 0)
    noise_db = rng.choice([None, -28, -22, -18])
    if noise_db is None:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
               "-af", afx, "-ar", "16000", "-ac", "1", out]
    else:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
               "-f", "lavfi", "-i", "anoisesrc=color=brown:sample_rate=16000:amplitude=0.5",
               "-filter_complex",
               f"[0:a]{afx}[s];[1:a]lowpass=f=1200,volume={noise_db}dB[n];"
               f"[s][n]amix=inputs=2:duration=first:dropout_transition=0[a]",
               "-map", "[a]", "-ar", "16000", "-ac", "1", out]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return os.path.exists(out) and os.path.getsize(out) > 1000
    except subprocess.CalledProcessError:
        return False


def main():
    ap = argparse.ArgumentParser(description="تضخيم مقاطع اللوحات الحقيقية")
    ap.add_argument("--input", required=True, help="فولدر data الحقيقي (فيه metadata.csv)")
    ap.add_argument("--output", required=True, help="فولدر المخرجات")
    ap.add_argument("--variants", type=int, default=5, help="نسخ لكل مقطع (غير الأصل)")
    ap.add_argument("--holdout", type=int, default=100, help="مقاطع حقيقية محجوزة للتقييم (بلا تضخيم)")
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        print("❌ ffmpeg مش موجود.")
        sys.exit(1)

    rng = random.Random(args.seed)
    src_meta = os.path.join(args.input, "metadata.csv")
    if not os.path.exists(src_meta):
        print(f"❌ مفيش metadata.csv في {args.input}")
        sys.exit(1)

    with open(src_meta, encoding="utf-8") as f:
        src_rows = [r for r in csv.DictReader(f) if (r.get("transcription") or "").strip()]
    rng.shuffle(src_rows)

    hold = src_rows[: args.holdout]
    train = src_rows[args.holdout :]

    train_dir = os.path.join(args.output, "data")
    eval_dir = os.path.join(args.output, "eval-real", "data")
    os.makedirs(train_dir, exist_ok=True)
    os.makedirs(eval_dir, exist_ok=True)

    # ── التقييم: مقاطع حقيقية نضيفة زي ما هي (مافيش تضخيم ولا تدريب عليها) ──────
    eval_rows = []
    for i, r in enumerate(hold):
        src = os.path.join(args.input, r["file_name"])
        if not os.path.exists(src):
            continue
        name = f"real_eval_{i:04d}.wav"
        shutil.copy2(src, os.path.join(eval_dir, name))
        eval_rows.append({"file_name": name, "transcription": r["transcription"]})
    with open(os.path.join(eval_dir, "metadata.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "transcription"]); w.writeheader(); w.writerows(eval_rows)

    # ── التدريب: الأصل + نسخ مضخّمة ─────────────────────────────────────────────
    rows, made, failed = [], 0, 0
    for i, r in enumerate(train):
        src = os.path.join(args.input, r["file_name"])
        if not os.path.exists(src):
            continue
        base = f"real_{i:05d}"
        orig = f"{base}_o.wav"
        shutil.copy2(src, os.path.join(train_dir, orig))
        rows.append({"file_name": orig, "transcription": r["transcription"]})
        for v in range(args.variants):
            name = f"{base}_a{v}.wav"
            if make_variant(src, os.path.join(train_dir, name), rng):
                rows.append({"file_name": name, "transcription": r["transcription"]})
                made += 1
            else:
                failed += 1
        if (i + 1) % 100 == 0:
            print(f"  … {i + 1}/{len(train)} مقطع  (نسخ {made})", flush=True)

    with open(os.path.join(train_dir, "metadata.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "transcription"]); w.writeheader(); w.writerows(rows)

    print(f"\n✅ تدريب: {len(rows)} مقطع في {train_dir}  (أصل {len(train)} + نسخ {made} / فشل {failed})")
    print(f"✅ تقييم حقيقي محجوز: {len(eval_rows)} مقطع في {eval_dir}  ← الموديل عمره ما يشوفهم")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()

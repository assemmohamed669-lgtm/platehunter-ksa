#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
to_flac.py — يحوّل داتاسِت WAV لـ FLAC (ضغط **بلا أي فقد**) عشان الرفع يبقى أسهل.
================================================================================
ليه؟ ٧٦٠٠ مقطع WAV = ~٦٠٠ ميجا، والرفع المباشر على Colab بيفشل مع الأحجام دي.
FLAC بيوفّر ~٥٠٪ **من غير ما يغيّر بايت واحد في الصوت** (lossless)، ومكتبة
datasets/soundfile بتقراه عادي زي WAV.

مثال:
  python to_flac.py --input "C:/.../plate-synth/data" --input "C:/.../plate-real-aug/data" \
                    --output "C:/Users/assem/Desktop/plate-flac"
"""
import argparse
import csv
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor


def conv(args):
    src, dst = args
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
           "-ar", "16000", "-ac", "1", "-compression_level", "8", dst]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return os.path.exists(dst) and os.path.getsize(dst) > 500
    except subprocess.CalledProcessError:
        return False


def main():
    ap = argparse.ArgumentParser(description="تحويل داتاسِت لـFLAC (بلا فقد)")
    ap.add_argument("--input", action="append", required=True, help="فولدر data (يتكرر)")
    ap.add_argument("--output", required=True)
    ap.add_argument("--workers", type=int, default=16)
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        print("❌ ffmpeg مش موجود."); sys.exit(1)

    out_data = os.path.join(args.output, "data")
    if os.path.isdir(args.output):
        shutil.rmtree(args.output)
    os.makedirs(out_data)

    jobs, rows = [], []
    for si, d in enumerate(args.input):
        meta = os.path.join(d, "metadata.csv")
        if not os.path.exists(meta):
            print(f"⚠️ مفيش metadata في {d}"); continue
        with open(meta, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                fn = (r.get("file_name") or "").strip()
                tx = (r.get("transcription") or "").strip()
                src = os.path.join(d, fn)
                if not fn or not tx or not os.path.exists(src):
                    continue
                name = f"s{si}_{os.path.splitext(fn)[0]}.flac"
                jobs.append((src, os.path.join(out_data, name)))
                rows.append({"file_name": name, "transcription": tx})

    print(f"🎛️  بحوّل {len(jobs)} مقطع لـFLAC…", flush=True)
    ok = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, res in enumerate(ex.map(conv, jobs), 1):
            ok += bool(res)
            if i % 1000 == 0:
                print(f"  … {i}/{len(jobs)}", flush=True)

    # نسيب بس اللي اتحوّل بنجاح
    rows = [r for r in rows if os.path.exists(os.path.join(out_data, r["file_name"]))]
    with open(os.path.join(out_data, "metadata.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "transcription"])
        w.writeheader(); w.writerows(rows)

    size = sum(os.path.getsize(os.path.join(out_data, n)) for n in os.listdir(out_data)) / 1024 / 1024
    print(f"\n✅ {len(rows)} مقطع FLAC في {out_data}  (~{round(size)} MB قبل الضغط)")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()

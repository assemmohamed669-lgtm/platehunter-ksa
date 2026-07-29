#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pack_dataset.py — يدمج داتاسِت التدريب النهائي ويعبّيه للرفع على Colab.
================================================================================
بياخد فولدرات data متعددة (مولّد صناعي + حقيقي مضخّم) ويدمجها في داتاسِت واحد
بأسماء ملفات مانعة للتكرار + metadata.csv واحد، ثم يضغطه.

كمان بيضغط فولدر التقييم الحقيقي المحجوز لوحده (الموديل عمره ما يتدرّب عليه).

مثال:
  python pack_dataset.py --add "C:/.../plate-synth/data" --add "C:/.../plate-real-aug/data" \
      --eval "C:/.../plate-real-aug/eval-real/data" --output "C:/Users/assem/Desktop/المكسيكي"
"""
import argparse
import csv
import os
import shutil
import sys


def read_meta(d):
    p = os.path.join(d, "metadata.csv")
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8") as f:
        return [r for r in csv.DictReader(f)
                if (r.get("file_name") or "").strip() and (r.get("transcription") or "").strip()]


def main():
    ap = argparse.ArgumentParser(description="دمج وتعبئة داتاسِت التدريب")
    ap.add_argument("--add", action="append", required=True, help="فولدر data للدمج (يتكرر)")
    ap.add_argument("--eval", default="", help="فولدر التقييم الحقيقي المحجوز (يتضغط لوحده)")
    ap.add_argument("--output", required=True, help="فولدر المخرجات (الـzip)")
    args = ap.parse_args()

    work = os.path.join(args.output, "_build")
    data = os.path.join(work, "data")
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(data)
    os.makedirs(args.output, exist_ok=True)

    rows, per_src = [], []
    for si, d in enumerate(args.add):
        src_rows = read_meta(d)
        n = 0
        for r in src_rows:
            src = os.path.join(d, r["file_name"])
            if not os.path.exists(src):
                continue
            name = f"s{si}_{r['file_name']}"            # بادئة تمنع تعارض الأسماء
            shutil.copy2(src, os.path.join(data, name))
            rows.append({"file_name": name, "transcription": r["transcription"].strip()})
            n += 1
        per_src.append((d, n))
        print(f"  + {n} مقطع من {d}", flush=True)

    with open(os.path.join(data, "metadata.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "transcription"])
        w.writeheader(); w.writerows(rows)

    zip_train = shutil.make_archive(os.path.join(args.output, "plate-train"), "zip", work, "data")
    shutil.rmtree(work, ignore_errors=True)
    size = round(os.path.getsize(zip_train) / 1024 / 1024, 1)
    print(f"\n✅ داتاسِت التدريب: {len(rows)} مقطع → {zip_train}  ({size} MB)")

    if args.eval and os.path.isdir(args.eval):
        ework = os.path.join(args.output, "_ebuild")
        edata = os.path.join(ework, "data")
        if os.path.isdir(ework):
            shutil.rmtree(ework)
        os.makedirs(edata)
        er = read_meta(args.eval)
        for r in er:
            src = os.path.join(args.eval, r["file_name"])
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(edata, r["file_name"]))
        shutil.copy2(os.path.join(args.eval, "metadata.csv"), os.path.join(edata, "metadata.csv"))
        zip_eval = shutil.make_archive(os.path.join(args.output, "plate-eval-real"), "zip", ework, "data")
        shutil.rmtree(ework, ignore_errors=True)
        print(f"✅ تقييم حقيقي محجوز: {len(er)} مقطع → {zip_eval}")

    # توزيع الحروف في التدريب (نتأكد إن الحروف الصعبة مشبّعة)
    cov = {}
    for r in rows:
        for c in r["transcription"][:3]:
            cov[c] = cov.get(c, 0) + 1
    print("\nتغطية الحروف:", "  ".join(f"{c}={n}" for c, n in sorted(cov.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()

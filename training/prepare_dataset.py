#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
prepare_dataset.py
==================
يحوّل تنزيلات التدريب (اللي بتنزّليها من صفحة الأدمن) لداتاسِت جاهز لتدريب Whisper.

المدخلات (في فولدر واحد — مثلاً فولدر Downloads أو فولدر تنقلي فيه التنزيلات):
  • ملف/ملفات اللوحات:  training-<اسم المندوب>-labels.json
  • ملفات الصوت:        <sessionId>.webm   (لكل جلسة)

المخرجات (فولدر جديد):
  • data/*.wav          — مقطع صوت صغير لكل لوحة (16kHz أحادي — صيغة Whisper)
  • data/metadata.csv   — يربط كل مقطع بنص اللوحة الصح (+ الجودة والمصدر)
  • summary.txt         — ملخّص (كام مقطع، بالجودة)

المتطلبات:
  • Python 3.8+
  • ffmpeg مثبّت وفي PATH   (تأكيد: اكتب  ffmpeg -version  في التيرمينال)

مثال تشغيل:
  python prepare_dataset.py --input "C:/Users/assem/Downloads" --output "C:/Users/assem/Desktop/plate-dataset"
  # لاستبعاد اللوحات ضعيفة الثقة (export-weak):
  python prepare_dataset.py --input ... --output ... --exclude-weak
"""
import argparse
import csv
import glob
import json
import os
import shutil
import subprocess
import sys


def find_audio(input_dir, session_id):
    """يدوّر على ملف صوت الجلسة بأي امتداد (webm/ogg/m4a/wav)."""
    for ext in ("webm", "ogg", "m4a", "mp4", "mp3", "wav"):
        p = os.path.join(input_dir, f"{session_id}.{ext}")
        if os.path.exists(p):
            return p
    # احتياطي: أي ملف يبدأ بالـ sessionId
    matches = glob.glob(os.path.join(input_dir, f"{session_id}.*"))
    audio = [m for m in matches if not m.lower().endswith(".json")]
    return audio[0] if audio else None


def slice_clip(src_audio, start_ms, end_ms, pad_ms, out_wav):
    """يقصّ مقطع [start,end] (بهامش) ويحوّله لـ 16kHz WAV أحادي عبر ffmpeg."""
    start = max(0.0, (start_ms - pad_ms) / 1000.0)
    end = (end_ms + pad_ms) / 1000.0
    if end <= start:
        return False
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", src_audio,
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
        "-ar", "16000", "-ac", "1",
        out_wav,
    ]
    try:
        subprocess.run(cmd, check=True)
        return os.path.exists(out_wav) and os.path.getsize(out_wav) > 0
    except subprocess.CalledProcessError:
        return False


def main():
    ap = argparse.ArgumentParser(description="تجهيز داتا تدريب Whisper من تنزيلات التشييك")
    ap.add_argument("--input", required=True, help="فولدر فيه ملفات labels JSON + ملفات الصوت")
    ap.add_argument("--output", required=True, help="فولدر المخرجات (هيتعمل لو مش موجود)")
    ap.add_argument("--pad-ms", type=int, default=200, help="هامش قبل/بعد كل لوحة بالملّي ثانية (افتراضي 200)")
    ap.add_argument("--exclude-weak", action="store_true", help="استبعاد اللوحات ضعيفة الثقة (export-weak)")
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        print("❌ ffmpeg مش موجود. ثبّته الأول وتأكد إنه في PATH (جرّب: ffmpeg -version).")
        sys.exit(1)

    data_dir = os.path.join(args.output, "data")
    os.makedirs(data_dir, exist_ok=True)

    label_files = glob.glob(os.path.join(args.input, "training-*-labels.json"))
    if not label_files:
        print(f"❌ مفيش ملفات training-*-labels.json في: {args.input}")
        sys.exit(1)

    rows = []              # صفوف metadata
    missing_audio = set()  # جلسات مالهاش صوت
    skipped_timing = 0     # لوحات توقيتها غير صالح
    counts = {}            # عدّاد بالجودة (reason)
    clip_idx = 0

    for lf in label_files:
        with open(lf, "r", encoding="utf-8") as f:
            data = json.load(f)
        agent = data.get("username") or data.get("agentId") or "unknown"
        for sess in data.get("sessions", []):
            sid = sess.get("sessionId", "")
            audio = find_audio(args.input, sid)
            plates = sess.get("plates", [])
            if not audio:
                if plates:
                    missing_audio.add(sid)
                continue
            for p in plates:
                plate = (p.get("plate") or "").strip()
                reason = p.get("reason") or ""
                tier = p.get("tier") or ""
                if not plate:
                    continue
                if args.exclude_weak and "weak" in reason:
                    continue
                start_ms = p.get("startMs") or 0
                end_ms = p.get("endMs") or 0
                if end_ms <= start_ms:
                    skipped_timing += 1
                    continue
                clip_idx += 1
                fname = f"clip_{clip_idx:05d}.wav"
                out_wav = os.path.join(data_dir, fname)
                if not slice_clip(audio, start_ms, end_ms, args.pad_ms, out_wav):
                    skipped_timing += 1
                    continue
                rows.append({
                    "file_name": fname,
                    "transcription": plate,
                    "tier": tier,
                    "reason": reason,
                    "agent": agent,
                    "session_id": sid,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                })
                counts[reason] = counts.get(reason, 0) + 1

    # اكتب metadata.csv (صيغة HuggingFace audiofolder: file_name + transcription)
    meta_path = os.path.join(data_dir, "metadata.csv")
    with open(meta_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "transcription", "tier", "reason", "agent", "session_id", "start_ms", "end_ms"])
        w.writeheader()
        w.writerows(rows)

    # ملخّص
    lines = [
        f"عدد المقاطع الجاهزة: {len(rows)}",
        f"ملفات اللوحات المقروءة: {len(label_files)}",
        f"جلسات صوتها ناقص: {len(missing_audio)}",
        f"لوحات اتخطّت (توقيت غير صالح): {skipped_timing}",
        "",
        "التوزيع بالجودة (reason):",
    ] + [f"  • {k}: {v}" for k, v in sorted(counts.items(), key=lambda x: -x[1])]
    summary = "\n".join(lines)
    with open(os.path.join(args.output, "summary.txt"), "w", encoding="utf-8") as f:
        f.write(summary + "\n")

    print(summary)
    print(f"\n✅ خلص. الداتا في: {data_dir}")
    print(f"   • {len(rows)} مقطع WAV + metadata.csv")
    if missing_audio:
        print(f"⚠️  {len(missing_audio)} جلسة مالهاش صوت — تأكدي إن ملفات .webm نزلت في نفس الفولدر.")


if __name__ == "__main__":
    main()

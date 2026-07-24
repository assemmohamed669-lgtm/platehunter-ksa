#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
predict_audio.py — يشغّل الموديل المدرّب على ملف/فولدر صوت ويطبع توقّع اللوحة.
بيحوّل أي صيغة (m4a/webm/wav/mp3/ogg) لـ 16kHz عبر ffmpeg قبل التوقّع.

الاستخدام:
  python predict_audio.py --audio "C:/.../تسجيلي.m4a"
  python predict_audio.py --audio "C:/فولدر فيه تسجيلات"     # كل الملفات
"""
import argparse, glob, os, subprocess, sys, tempfile
try:
    sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def to_wav16k(src, dst):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", dst], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True, help="ملف صوت أو فولدر فيه تسجيلات")
    ap.add_argument("--model", default="C:/Users/assem/Desktop/whisper-plates")
    args = ap.parse_args()

    # اجمع ملفات الصوت
    exts = ("m4a", "webm", "wav", "mp3", "ogg", "aac", "mp4")
    if os.path.isdir(args.audio):
        files = []
        for e in exts:
            files += glob.glob(os.path.join(args.audio, f"*.{e}"))
        files.sort()
    else:
        files = [args.audio]
    if not files:
        print("❌ مفيش ملفات صوت."); sys.exit(1)

    import torch, soundfile as sf
    from transformers import WhisperProcessor, WhisperForConditionalGeneration
    print(f"بحمّل الموديل من: {args.model} ...")
    proc = WhisperProcessor.from_pretrained(args.model, language="arabic", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(args.model)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()
    print(f"جاهز (GPU: {torch.cuda.is_available()}). بجرّب {len(files)} ملف:\n")

    tmp = os.path.join(tempfile.gettempdir(), "_pred16k.wav")
    for fpath in files:
        try:
            to_wav16k(fpath, tmp)
            audio, sr = sf.read(tmp)
            feat = proc.feature_extractor(audio, sampling_rate=16000, return_tensors="pt").input_features.to(device)
            with torch.no_grad():
                ids = model.generate(feat, max_new_tokens=16, language="arabic", task="transcribe")
            pred = proc.tokenizer.decode(ids[0], skip_special_tokens=True).strip()
            print(f"🎙️  {os.path.basename(fpath)}")
            print(f"    الموديل قال: {pred}\n")
        except Exception as e:
            print(f"⚠️  {os.path.basename(fpath)}: خطأ — {e}\n")


if __name__ == "__main__":
    main()

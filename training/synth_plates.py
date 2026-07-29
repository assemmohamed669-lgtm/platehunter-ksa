#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
synth_plates.py — مولّد داتا تدريب صناعية للوحات السعودية (صوت + اللوحة الصح).
================================================================================
ليه؟ عنق الزجاجة إننا محتاجين آلاف مقاطع (صوت لوحة + اللوحة الصح). الحل: **إحنا
نولّد النطق** بأصوات عربية مجانية (edge-tts — ٣٢ صوت، مصري/سعودي/خليجي، بلا مفتاح).
اللوحة الصح معروفة ١٠٠٪ لأننا إحنا اللي كتبناها → صفر أخطاء تسمية.

المهمة مفرداتها **مقفولة**: ١٧ حرف سعودي + ١٠ أرقام. فالتوليد يقدر يغطّي الفضاء
كله — وبالأخص الحروف اللي المحرّك بيغلط فيها (ه · ح/ه · س/ص · ق/ك · د/ط).

الواقعية: كل مقطع بياخد تشويه بـffmpeg (ضجيج محرّك/شارع، سرعة، مستوى صوت، ضغط
سماعة تليفون) عشان يشبه الميدان مش الاستوديو.

المخرجات (نفس صيغة prepare_dataset.py — جاهزة لـ train_whisper.py):
  <output>/data/*.wav        — 16kHz أحادي
  <output>/data/metadata.csv — file_name,transcription   (transcription = اللوحة)

مثال:
  python synth_plates.py --count 5000 --output "C:/Users/assem/Desktop/plate-synth"
"""
import argparse
import asyncio
import csv
import os
import random
import shutil
import subprocess
import sys

# ── الأبجدية المقفولة: حروف اللوحات السعودية (نفس VALID_PLATE_LETTERS في المحلّل)
LETTERS = list("ابحدرسصطعقكلمنهوي")

# الحروف اللي المحرّك بيلخبط فيها — نزوّد نسبتها عشان الموديل يشبع منها.
CONFUSABLE = list("هحسصقكدط")

# صيغ النطق الحقيقية لكل حرف (من LETTER_NAMES + اللي المناديب بيقولوه فعلاً في
# النص الخام: «هه» «ره» «طه» «طا» «م» ...). التنويع بيخلّي الموديل يعرف الحرف
# بأي صيغة بينطق بيها.
SPOKEN = {
    "ا": ["ألف", "الف", "الألف"],
    "ب": ["باء", "با", "الباء"],
    "ح": ["حاء", "حا", "الحاء", "حاه"],
    "د": ["دال", "الدال", "داه"],
    "ر": ["راء", "را", "الراء", "ريه"],
    "س": ["سين", "السين", "سينه"],
    "ص": ["صاد", "الصاد", "صاده", "صادي"],
    "ط": ["طاء", "طا", "الطاء", "طاه"],
    "ع": ["عين"],
    "ق": ["قاف", "القاف", "قافي"],
    "ك": ["كاف", "الكاف", "كافه", "كي"],
    "ل": ["لام", "اللام"],
    "م": ["ميم", "الميم", "ميمه"],
    "ن": ["نون", "النون", "نونه"],
    "ه": ["هاء", "الهاء", "هه"],
    "و": ["واو", "وا", "الواو", "واوه"],
    "ي": ["ياء", "يا", "الياء"],
}

# أرقام بالعامية المصرية (زي ما المناديب بيقولوها في النص الخام).
DIGITS = {
    0: ["زيرو", "صفر"],
    1: ["واحد"],
    2: ["اتنين", "إتنين"],
    3: ["تلاتة", "ثلاثة"],
    4: ["أربعة", "اربعة"],
    5: ["خمسة"],
    6: ["ستة"],
    7: ["سبعة"],
    8: ["تمانية", "ثمانية"],
    9: ["تسعة"],
}

# أصوات عربية (مصري + سعودي أولاً، وخليجي للتنويع) — كلها مجانية بلا مفتاح.
VOICES = [
    "ar-EG-ShakirNeural", "ar-EG-SalmaNeural",
    "ar-SA-HamedNeural", "ar-SA-ZariyahNeural",
    "ar-KW-FahedNeural", "ar-KW-NouraNeural",
    "ar-BH-AliNeural", "ar-JO-TaimNeural",
]
RATES = ["-10%", "+0%", "+0%", "+10%", "+20%"]   # معظمها طبيعي/أسرع شوية


def make_plate(rng):
    """لوحة سعودية: ٣ حروف + ٤ أرقام، مع ترجيح الحروف اللي بتغلط."""
    ls = []
    while len(ls) < 3:
        c = rng.choice(CONFUSABLE) if rng.random() < 0.55 else rng.choice(LETTERS)
        ls.append(c)                      # التكرار مسموح (لوحات حقيقية فيها تكرار)
    ds = [rng.randrange(10) for _ in range(4)]
    # أنماط أرقام صعبة بنسبة: أصفار في الأول/الآخر، تكرار، تسلسل
    r = rng.random()
    if r < 0.10:
        ds = [ds[0]] * 4                                  # 5555
    elif r < 0.20:
        ds = [0, 0, ds[2], ds[3]]                         # 0043
    elif r < 0.30:
        ds = [ds[0], ds[1], 0, 0]                         # 5500
    elif r < 0.36:
        s = rng.randrange(1, 7)
        ds = [s, s + 1, s + 2, s + 3]                     # تسلسل
    plate = "".join(ls) + "".join(str(d) for d in ds)
    text = " ".join(rng.choice(SPOKEN[c]) for c in ls) + " " + " ".join(rng.choice(DIGITS[d]) for d in ds)
    return plate, text


def augment(src_mp3, out_wav, rng):
    """
    تحويل لـ16kHz أحادي + تشويه واقعي: ضجيج محرّك/شارع، سرعة، مستوى، ضغط تليفون.
    كل ده بـffmpeg محلياً (مجاني وسريع).
    """
    filters = []
    # سرعة (تغيير طبيعي في إيقاع الكلام)
    tempo = rng.choice([0.92, 1.0, 1.0, 1.08, 1.15])
    if tempo != 1.0:
        filters.append(f"atempo={tempo}")
    # مستوى صوت (مندوب قريب/بعيد من المايك)
    filters.append(f"volume={rng.choice([0.6, 0.8, 1.0, 1.0, 1.3])}")
    # ضغط سماعة تليفون (نطاق ترددي ضيّق) — نص الحالات
    if rng.random() < 0.5:
        filters.append("highpass=f=200,lowpass=f=3400")
    afx = ",".join(filters)

    noise_db = rng.choice([None, -30, -24, -20, -16])     # None = بلا ضجيج
    if noise_db is None:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src_mp3,
               "-af", afx, "-ar", "16000", "-ac", "1", out_wav]
    else:
        # ضجيج بنّي مفلتر = هدير محرّك/طريق، ممزوج بالكلام
        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-i", src_mp3,
               "-f", "lavfi", "-i", "anoisesrc=color=brown:sample_rate=16000:amplitude=0.5",
               "-filter_complex",
               f"[0:a]{afx}[s];[1:a]lowpass=f=1200,volume={noise_db}dB[n];"
               f"[s][n]amix=inputs=2:duration=first:dropout_transition=0[a]",
               "-map", "[a]", "-ar", "16000", "-ac", "1", out_wav]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000
    except subprocess.CalledProcessError:
        return False


async def main():
    ap = argparse.ArgumentParser(description="توليد داتا تدريب صناعية للوحات")
    ap.add_argument("--count", type=int, default=5000, help="عدد اللوحات")
    ap.add_argument("--output", required=True, help="فولدر المخرجات")
    ap.add_argument("--concurrency", type=int, default=12, help="طلبات TTS متوازية")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    if shutil.which("ffmpeg") is None:
        print("❌ ffmpeg مش موجود في PATH.")
        sys.exit(1)
    try:
        import edge_tts
    except ImportError:
        print("❌ محتاج edge-tts:  python -m pip install edge-tts")
        sys.exit(1)

    rng = random.Random(args.seed)
    data_dir = os.path.join(args.output, "data")
    tmp_dir = os.path.join(args.output, "_tmp")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(tmp_dir, exist_ok=True)

    # لوحات فريدة (مانكررش نفس اللوحة بنفس الصوت)
    jobs, seen = [], set()
    while len(jobs) < args.count:
        plate, text = make_plate(rng)
        voice = rng.choice(VOICES)
        key = (plate, voice)
        if key in seen:
            continue
        seen.add(key)
        jobs.append((len(jobs), plate, text, voice, rng.choice(RATES)))

    rows, failed = [], 0
    sem = asyncio.Semaphore(args.concurrency)
    lock = asyncio.Lock()
    done = 0

    async def work(job):
        nonlocal failed, done
        i, plate, text, voice, rate = job
        mp3 = os.path.join(tmp_dir, f"s{i:06d}.mp3")
        wav_name = f"syn_{i:06d}.wav"
        wav = os.path.join(data_dir, wav_name)
        async with sem:
            for attempt in range(3):                       # إعادة محاولة على تعثّر الشبكة
                try:
                    await edge_tts.Communicate(text, voice, rate=rate).save(mp3)
                    break
                except Exception:
                    if attempt == 2:
                        async with lock:
                            failed += 1
                        return
                    await asyncio.sleep(1.5 * (attempt + 1))
        ok = await asyncio.to_thread(augment, mp3, wav, rng)
        try:
            os.remove(mp3)
        except OSError:
            pass
        async with lock:
            done += 1
            if ok:
                rows.append({"file_name": wav_name, "transcription": plate})
            else:
                failed += 1
            if done % 250 == 0:
                print(f"  … {done}/{len(jobs)}  (نجح {len(rows)} / فشل {failed})", flush=True)

    print(f"🎙️  بولّد {len(jobs)} لوحة بـ{len(VOICES)} أصوات عربية…", flush=True)
    await asyncio.gather(*[work(j) for j in jobs])

    meta = os.path.join(data_dir, "metadata.csv")
    with open(meta, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file_name", "transcription"])
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["file_name"]))
    shutil.rmtree(tmp_dir, ignore_errors=True)

    # تغطية الحروف (نتأكد إن الحروف الصعبة مشبّعة)
    cov = {c: 0 for c in LETTERS}
    for r in rows:
        for c in r["transcription"][:3]:
            if c in cov:
                cov[c] += 1
    print(f"\n✅ خلص: {len(rows)} مقطع في {data_dir}   (فشل {failed})")
    print("تغطية الحروف:", "  ".join(f"{c}={n}" for c, n in sorted(cov.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    asyncio.run(main())

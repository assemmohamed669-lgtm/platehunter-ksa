#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
plate_confidence.py — 🚦 بوابة الثقة: تقرّر **نقبل اللوحة ولا نرفضها**.
================================================================================
المشكلة اللي بتحلّها: موديلنا (whisper-plates-v5plus) **مايعرفش يقول «مش عارف»**.
على ٢٣٠ مقطع مافيهم لوحة خالص (صمت / ضجيج محرّك / أسماء شوارع / دردشة) طلّع
لوحة سليمة الشكل **٢٢٣ مرّة (٩٧٪)** وامتنع **صفر مرّة**. أي ضغطة غلط أو سكتة
بتوصّل لوحة وهمية للتشييك، ولو اللوحة دي على شيت الإحالة بيرنّ تنبيه «مطلوبة».

البوابة **مابتلمسش فكّ الترميز** — بتقبل أو ترفض اللي الموديل قاله بس. فمافيش
احتمال تضيّع دقّة على الكلام السليم (P5 محقَّق: ١١٥/١٢٠ قبل وبعد).

كل رقم في `THRESHOLDS` **مقيس**، مش مخمَّن. القياس والمنهجية في
`docs/confidence-gate.md` §١٠.

الاستخدام:
    from plate_confidence import gate
    d = gate(pred, mean_logprob=..., min_logprob=..., no_speech_prob=...,
             mean_db=..., peak_db=..., gate_max_rms=...)
    if not d.accept:
        show_to_agent("مسمعتش لوحة، كرّر")     # ممنوع الإسقاط الصامت
    else:
        use_plate(d.plate)

البوابة الصوتية (mean_db/peak_db/gate_max_rms) اختيارية وبتشتغل **قبل** الموديل:
    from plate_confidence import audio_pregate
    if not audio_pregate(mean_db=…, peak_db=…, gate_max_rms=…).accept:
        return REFUSE                          # مافيش استدعاء موديل خالص
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

__all__ = ["THRESHOLDS", "CANON_LETTERS", "GateDecision", "is_valid_plate",
           "audio_pregate", "gate", "clip_quality_features"]

# حروف اللوحات السعودية المسموحة (المجموعة المغلقة)
CANON_LETTERS = frozenset("ابحدرسصطعقكلمنهوي")

# ─────────────────────────────────────────────────────────────────────────────
# العتبات المشحونة — كلها مقيسة على:
#   لازم-يقبل : ١٢٠ مقطع ذهبي (تسمياتها محتجَزة: ١١٨/١٢٠ مش في التدريب)
#               + ٧٧٠ نبضة ميدانية الموديل جابها صح (متحدثين **مش** في التدريب)
#   لازم-يرفض : ٢٣٠ مقطع بلا لوحة (١١٨ صمت/ضجيج + ٨٧ كلام بلا لوحة
#               + ٢٥ مقطع بلا أي ذرّة لوحة)
# المقيس عند النقطة دي: رفض ٩٠٫٩٪ من الصوت بلا لوحة، مقابل رفض ٠٫٨٧٪ من
# اللوحات الصحيحة الذهبية و٠٫٦٥٪ من اللوحات الصحيحة الميدانية.
# ─────────────────────────────────────────────────────────────────────────────
THRESHOLDS = {
    # (أ) درجة الموديل — القناة المتدرّجة
    "mean_logprob_min": -0.30,   # p01 للنبضات الميدانية الصحيحة ≈ -0.25 → -0.30 بهامش
    "min_logprob_min": -1.20,   # أضعف توكن؛ p01 الميداني ≈ -1.09
    "no_speech_prob_max": 1e-6,    # <|nocaptions|> — صفر تام على ٨٩٠ لوحة صحيحة
    # (ب) البوابة الصوتية — قناة الرفض القاطعة، بلا موديل
    #     ⚠️ العتبات دي **متحفّظة عن قصد**: توزيع الشدّة بيختلف جذرياً بين
    #     تسجيلات التطبيق (مُعيَّرة، peak ≈ 0 dBFS) والملاحظات الصوتية الميدانية
    #     (peak وسيط -6.5 dBFS). عتبة مُعايَرة على مقاطع التطبيق كانت هترفض
    #     ٨٥٪ من اللوحات الميدانية الصحيحة. تفاصيل في docs §١٠٫٣.
    "peak_db_min": -22.0,
    "mean_db_min": -34.0,
    "gate_max_rms_min": 0.030,
}


@dataclass(frozen=True)
class GateDecision:
    """قرار البوابة. `reason` سبب واحد قابل للتسجيل (أول سبب اتحقّق بالترتيب)."""
    accept: bool
    reason: str
    plate: str = ""
    score: float = float("nan")   # mean_logprob (الدرجة الأساسية) لو متاحة

    def __bool__(self) -> bool:   # `if gate(...):`
        return self.accept


def is_valid_plate(p: Optional[str]) -> bool:
    """لوحة سعودية قانونية = ٣ حروف من المجموعة المغلقة + ٤ أرقام (٧ محارف)."""
    if not p:
        return False
    s = p.strip()
    letters = [c for c in s if not c.isdigit()]
    digits = [c for c in s if c.isdigit()]
    return (len(letters) == 3 and len(digits) == 4 and len(s) == 7
            and all(c in CANON_LETTERS for c in letters))


def _finite(x) -> bool:
    return x is not None and isinstance(x, (int, float)) and math.isfinite(float(x))


def audio_pregate(mean_db=None, peak_db=None, gate_max_rms=None,
                  th=None) -> GateDecision:
    """
    البوابة الصوتية — بلا موديل، بتتنفّذ **قبل** ما الصوت يوصل للموديل فبترفض
    من غير أي حساب على الكارت. القيم من `clip_quality_features()` أو من
    `training/reslice_real.py clip_quality()`.
    """
    t = th or THRESHOLDS
    if _finite(peak_db) and float(peak_db) < t["peak_db_min"]:
        return GateDecision(False, "audio_peak_db_low")
    if _finite(mean_db) and float(mean_db) < t["mean_db_min"]:
        return GateDecision(False, "audio_mean_db_low")
    if _finite(gate_max_rms) and float(gate_max_rms) < t["gate_max_rms_min"]:
        return GateDecision(False, "audio_rms_low")
    return GateDecision(True, "audio_ok")


def gate(pred: Optional[str], mean_logprob=None, min_logprob=None,
         no_speech_prob=None, mean_db=None, peak_db=None, gate_max_rms=None,
         th=None) -> GateDecision:
    """
    القرار الكامل. الترتيب مقصود — من الأرخص/الأقطع للأغلى:

      ١. `empty`               الموديل مطلّعش حاجة
      ٢. `bad_shape`           المخرَج مش ٣ حروف + ٤ أرقام قانونية
      ٣. `audio_*`             البوابة الصوتية (قاطعة)
      ٤. `no_speech`           رأس <|nocaptions|> شغّال ← «مافيش كلام»
      ٥. `low_mean_logprob`    متوسط لوغ-الاحتمال للتوكن ضعيف
      ٦. `low_min_logprob`     أضعف توكن ضعيف أوي

    كل الوسائط اختيارية: أي إشارة ناقصة (None/NaN) **بتتخطّى** — البوابة
    مابترفضش على معلومة غايبة، لأن الرفض الخاطئ بيضيّع لوحة حقيقية.
    """
    t = th or THRESHOLDS
    p = (pred or "").strip()
    sc = float(mean_logprob) if _finite(mean_logprob) else float("nan")

    if not p:
        return GateDecision(False, "empty", "", sc)
    if not is_valid_plate(p):
        return GateDecision(False, "bad_shape", p, sc)

    a = audio_pregate(mean_db=mean_db, peak_db=peak_db,
                      gate_max_rms=gate_max_rms, th=t)
    if not a.accept:
        return GateDecision(False, a.reason, p, sc)

    if _finite(no_speech_prob) and float(no_speech_prob) > t["no_speech_prob_max"]:
        return GateDecision(False, "no_speech", p, sc)
    if _finite(mean_logprob) and float(mean_logprob) < t["mean_logprob_min"]:
        return GateDecision(False, "low_mean_logprob", p, sc)
    if _finite(min_logprob) and float(min_logprob) < t["min_logprob_min"]:
        return GateDecision(False, "low_min_logprob", p, sc)
    return GateDecision(True, "ok", p, sc)


# ─────────────────────────────────────────────────────────────────────────────
def clip_quality_features(path: str, sr: int = 16000) -> dict:
    """
    يحسب `mean_db` / `peak_db` / `silence_pct` / `gate_max_rms` من ملف صوت.
    مطابق لـ`training/reslice_real.py clip_quality()` (تم التحقّق مقابل ffmpeg:
    r = ١٫٠٠٠٠٠ على mean_db/peak_db/silence_pct، أقصى فرق ٠٫٠٥ dB) لكن بـnumpy
    فبيشتغل ~٣٠ مرّة أسرع وبلا عمليات فرعية.
    """
    import numpy as np
    try:
        import soundfile as sf
        a, got = sf.read(path, dtype="float32", always_2d=False)
        if getattr(a, "ndim", 1) > 1:
            a = a.mean(axis=1)
        if got != sr:
            import librosa
            a = librosa.resample(a, orig_sr=got, target_sr=sr)
    except Exception:
        import subprocess
        r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le",
                            "-ac", "1", "-ar", str(sr), "-"], capture_output=True)
        a = np.frombuffer(r.stdout, dtype="<i2").astype("float32") / 32768.0
    a = np.asarray(a, dtype=np.float64)
    if a.size < 16:
        return dict(dur_s=0.0, mean_db=-99.0, peak_db=-99.0, silence_pct=100.0,
                    gate_max_rms=0.0)

    def _db(x):
        return 20.0 * math.log10(max(float(x), 1e-12))

    n = max(1, int(0.020 * sr))                       # فريم ٢٠ms = TICK_MS
    k = a.size // n
    fr = (a[:k * n].reshape(k, n) if k else a.reshape(1, -1))
    rms = np.sqrt((fr * fr).mean(axis=1) + 1e-20)
    # silence_pct: نفس تعريف silencedetect=noise=-35dB:d=0.25 في نسخة ffmpeg
    # المثبَّتة — فحص على **العيّنة المفردة** (النسخة دي مافيهاش خيار window).
    quiet = np.abs(a) < 10 ** (-35.0 / 20.0)
    tot, i, N = 0, 0, quiet.size
    while i < N:
        if not quiet[i]:
            i += 1
            continue
        j = i
        while j < N and quiet[j]:
            j += 1
        if (j - i) / sr >= 0.25:
            tot += (j - i)
        i = j
    dur = a.size / sr
    return dict(dur_s=dur, mean_db=_db(math.sqrt(float((a * a).mean()))),
                peak_db=_db(float(np.abs(a).max())),
                silence_pct=(100.0 * tot / sr / dur) if dur else 100.0,
                gate_max_rms=float(rms.max()))

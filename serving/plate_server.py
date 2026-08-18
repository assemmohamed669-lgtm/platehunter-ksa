#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
plate_server.py — 🎙️ خدمة استنتاج محلّية لموديل اللوحات (whisper-plates-v5plus).
================================================================================
إيه ده؟ خدمة HTTP صغيرة بتشيل الموديل المدرَّب **مُحمَّل ودافي** في الذاكرة،
بتاخد مقطع صوت من التطبيق (نفس الصوت اللي MediaRecorder بيطلّعه في WebView
أندرويد: webm/opus أو m4a أو wav)، بتحوّله ١٦ كيلو مونو بـffmpeg، بتشغّل
الموديل مرّة واحدة، وبترجّع اللوحة + درجات الثقة + قرار بوابة الثقة.

ليه محتاجينها؟ (القياس، مش الرأي)
  • موديلنا على ١٢٠ مقطع ذهبي محتجَز: **١١٥/١٢٠ = ٩٥٫٨٪** لوحة صح تماماً، CER ٠٫٨٪.
    Deepgram nova-3 بإعدادات الإنتاج على نفس المقاطع: **٩٨/١٢٠ = ٨١٫٧٪**.
  • بس Deepgram **لازم يفضل** لأنه بيطلّع نص حر (نوع السيارة، ملاحظات، أكتر من
    لوحة في نبضة واحدة) والتطبيق بيستهلك ده كله. موديلنا بيطلّع **اللوحة بس**.
  • فالتصميم: موديلنا **قاضي (judge)** جنب Deepgram، مش بديل له. لما الاتنين
    يتفقوا (٨١٫٧٪ من الحالات) الإجابة صح **٩٩٪** من الوقت — الاتفاق إشارة يقين
    أقوى من أي درجة حسبناها. ولما يختلفوا، ٤ من ٥ أخطاءنا الباقية بتقع هناك.
  • عشان كده الخدمة دي **مابتاخدش قرار** — بترجّع اللوحة + `accepted` + السبب،
    والتطبيق هو اللي يقرر. ومافيش إسقاط صامت أبداً.

الموديل مايعرفش يقول «مش عارف»: على ٢٣٠ مقطع بلا لوحة طلّع لوحة سليمة الشكل
٩٧٫٨٪ من المرات. فالقرار بيمرّ إجبارياً على `training/plate_confidence.py`
(العتبات **مقيسة** — رفض ٩٠٫٩٪ من الصوت بلا لوحة مقابل ٠٫٦٥٪ رفض خاطئ ميداني).
الخدمة **مابتعيدش تنفيذ** أي عتبة — بتستورد `gate()` وخلاص.

──────────────────────────────────────────────────────────────────────────────
ليه stdlib (http.server) ومش FastAPI؟
  اتفحص `C:/Users/assem/Desktop/plate-train-env/Scripts/python.exe`:
      fastapi ❌ ناقص · uvicorn ❌ ناقص · starlette ❌ ناقص · pydantic ❌ ناقص
      torch ٢٫٩٫١+cu126 ✅ · transformers ٤٫٤٤٫٢ ✅ · soundfile ✅ · numpy ✅
  البيئة **مثبَّتة بالإصدار** (ممنوع أي ترقية — الترقية بتبوّظ إعادة إنتاج
  الأرقام). تنصيب FastAPI بيجرّ pydantic-core (عجلة مبنيّة بـRust) + starlette
  + anyio، يعني ٤ اعتماديات جديدة في بيئة تدريب متزنة عشان راوتر واحد.
  فالمشحون: `ThreadingHTTPServer` من المكتبة القياسية — **صفر اعتمادية جديدة**.
  الحمل المتوقّع: طلب واحد كل شوية من تليفون واحد (طيّار لشخص واحد)، والـGPU
  بيتسلسل بقفل على أي حال، فمافيش أي مكسب من async هنا.

──────────────────────────────────────────────────────────────────────────────
ليه التوكن مطلوب **حتى في طيّار شخصي**؟ (والخدمة **مابتقومش** بدونه)
  ١. نفق Cloudflare بيدّي URL **على الإنترنت المفتوح**. مافيش «سري بالغموض»:
     شهادات TLS بتتقيّد في سجلات CT العامة، والزحّافات بتلاقي النطاقات
     الفرعية دي في دقايق. أي حد يعرف الـURL بيشغّل كارت الـGPU بتاعك.
  ٢. السطح ده بيغذّي **ffmpeg** بميديا من الطرف التاني. أي طلب مجهول = تشغيل
     مُفكِّك ميديا على بايتات مش موثوقة. التوكن بيقفل ده قبل ffmpeg يشتغل.
  ٣. الطيّار **قياس**: كل طلب بيتسجّل في JSONL وبناءً عليه بنقرر نوسّع ولا لأ.
     أي طلب غريب بيلوّث القياس، والأرقام تبطل تبقى أرقام.
  ٤. منع خدمة (DoS): الطابور صغير بقصد. طلبات مجهولة بتزحم المندوب الحقيقي
     برّه الطابور وبتخلّي مساره يرجع لـDeepgram من غير سبب.
  ٥. التوكن في **ترويسة** (`X-Plate-Token` أو `Authorization: Bearer`) —
     **ممنوع** في الـquery string: الـquery بيتسرّب في سجلات الوسطاء وتاريخ
     المتصفّح ولوحة Cloudflare.
  التوكن **مش** بديل لطبقات الحماية في التطبيق (بوابة الهوية + المفتاح المركزي
  + الرجوع الصامت لـDeepgram) — هو الطبقة الأخيرة على الخدمة نفسها.

──────────────────────────────────────────────────────────────────────────────
الوصول من التليفون — نفق Cloudflare مجاني (**اتفرّج، ماتنفّذش من الأداة دي**)
  ليه النفق أحسن من IP الشبكة المحلية؟ المندوب في الشارع على **بيانات الجوّال**،
  مش على واي-فاي البيت — فـ`192.168.x.x` مش موجود عنده أصلاً. وكمان الـWebView
  بيحمّل التطبيق من `https://platehunter-ksa.vercel.app`، فأي طلب لـ`http://`
  بيتقفل كـmixed-content. النفق بيحلّ الاتنين: HTTPS حقيقي + عنوان عام.

  (أ) تنصيب مرّة واحدة (PowerShell):
        winget install --id Cloudflare.cloudflared
  (ب) نفق سريع بلا حساب (URL عشوائي، بيتغيّر كل مرّة — للتجربة بس):
        cloudflared tunnel --url http://127.0.0.1:8756
      بيطبع سطر زي:
        https://random-words-1234.trycloudflare.com
  (ج) نفق ثابت باسم (مطلوب حساب Cloudflare مجاني + نطاق عندهم):
        cloudflared tunnel login
        cloudflared tunnel create platehunter-judge
        cloudflared tunnel route dns platehunter-judge judge.example.com
        cloudflared tunnel run --url http://127.0.0.1:8756 platehunter-judge
      → https://judge.example.com  (ثابت، وبيعدّي إعادة تشغيل الجهاز)
  (د) شكل الـURL اللي التطبيق محتاجه:
        POST  https://<host>/transcribe      ← الاستنتاج
        GET   https://<host>/health          ← الحالة (بتوكن)
        GET   https://<host>/ping            ← نبضة حياة (بلا توكن)
      يعني `PLATE_JUDGE_URL = "https://<host>"` وبعدها `+ "/transcribe"`.
  (هـ) البديل (LAN): `--host 0.0.0.0` وبعدها `http://<IP>:8756` + فتح المنفذ في
      جدار حماية ويندوز. بيشتغل **بس** لو التليفون على نفس الواي-فاي، وبـHTTP
      عادي فالـWebView هيرفضه. مقبول للتجربة على المكتب فقط.
  ⚠️ اللابتوب بينام: النفق بيقع مع النوم. للطيّار: خطة طاقة «مافيش نوم» على
      الكهرباء، ولو الخدمة وقعت التطبيق بيرجع لـDeepgram صامت (ده المطلوب).

──────────────────────────────────────────────────────────────────────────────
الاستخدام:
  python serving/plate_server.py --token "<سر-طويل-عشوائي>"
  python serving/plate_server.py --token "$env:PLATE_JUDGE_TOKEN" \
      --model C:/Users/assem/Desktop/whisper-plates-v6 --port 8756 \
      --log C:/Users/assem/Desktop/plate-pilot/requests.jsonl

قصّ النبضة (اختياري، **متوافق للخلف**):
  POST /transcribe?start=12.500&end=16.000     ← بالثواني
  POST /transcribe?start_ms=12500&end_ms=16000 ← بالملي ثانية
  (وكذلك المفاتيح start/end أو startMs/endMs جوّه جسم الـJSON)
  ليه؟ التطبيق بيبعت **بادئة جلسة** webm/opus مش مقطع مقصوص: تيار
  MediaRecorder الواحد ترويسته في أول جزء بس، فأي شريحة من الوسط مش ملف يتفك.
  فالتطبيق بيبعت من الجزء صفر لحد آخر جزء فيه اللوحة، والخدمة هي اللي تقصّ.
  أي قيمة ناقصة/غلط = المقطع كله = سلوك النهاردة بالحرف.

المخرَج لكل طلب:
  { "plate", "plate_norm",
    "confidence": {"mean_logprob", "min_logprob", "no_speech_prob"},
    "accepted", "refuse_reason", "ms", "model" }
  + مفاتيح إضافية للتشخيص: req, dur_s, n_tok, device, ms_ffmpeg, ms_model.
  **مهم:** لو البوابة رفضت، اللوحة بترجع زي ما هي مع `accepted: false` والسبب —
  التطبيق هو اللي يقرر (يعرضها «راجع» ولا يتجاهلها). مافيش إسقاط صامت هنا.

──────────────────────────────────────────────────────────────────────────────
القياس (اتعمل على الجهاز ده — RTX 4060 لابتوب ٨ جيجا، ويندوز ١١)
  التحقّق من الأمانة: ١٢٠ مقطع ذهبي (`C:/Users/assem/Desktop/plate-v5-build/
  eval/data`) اتبعتوا **عبر HTTP** لنفس الخدمة دي:
      HTTP  : ١١٥/١٢٠ = ٩٥٫٨٪ لوحة صح تماماً
      أوفلاين: ١١٥/١٢٠ = ٩٥٫٨٪  → **صفر فرق**، لا في اللوحة ولا في
               mean_logprob (فرق < ٥e-5 على ١٢٠/١٢٠) — يعني طبقة الخدمة
               مابتعيدش تشكيل الصوت ولا بتقصّه بالسكوت.
      قرار البوابة كان **متطابقاً** في التلات جولات: مقبول ١١٩/١٢٠، والمرفوض
      الوحيد `bad_shape` على مخرَج غلط أصلاً (طم5355) — يعني ٠ رفض خاطئ.
      نفس الـ١٢٠ بـ--cpu: ١١٥/١٢٠ برضه، ونفس اللوحات بالحرف.
      webm/opus 24k (زي MediaRecorder على أندرويد) على ٢٠ مقطع: ١٧/٢٠ = نفس
      نتيجة الـwav بالحرف — الضغط الفاقد ماغيّرش ولا لوحة.
  الزمن (نفس الـ١٢٠ مقطع، طلب-ورا-طلب):
      كارت fp16 : متوسط ٢٢٥–٤٠٨ms · p95 ٢٦٤–٤٩٤ms  (منها ffmpeg ٤٤–٦٨ms)
      معالج fp32: متوسط ٣٦٠٨ms · p95 ٤٥٠١ms
      المدى على الكارت بسبب حالة ترددات لابتوب (ffmpeg اتحرّك بنفس النسبة).
  البدء البارد (إطلاق العملية → أول رد HTTP): **٤٫٦–٦٫١ث** كارت · **٨٫٠–١٠٫١ث**
      معالج. منها تحميل الأوزان ٢٫٠–٤٫٦ث وتسخين ١٫٤–٧٫٩ث.
  التسخين مهم: بـ--no-warmup أول طلب حقيقي **١٩٦٧ms** بدل ٣٥٠ms (٥٫٦×).
  ذاكرة الكارت: مخصَّص ٤٨٨ ميجا · ذروة ٦١٠ ميجا (من ٨١٨٧) — يعني تدريب أو
      لعبة على نفس الكارت مش هيصطدموا بيها.

⚠️ ممنوع أي فلتر صوتي (highpass / dynaudnorm / نورمالايز) في مسار التحويل:
   الموديل اتدرّب على صوت **خام** ١٦ك مونو، وأي فلتر بيحرّك الأرقام. مسار
   `app/api/transcribe/route.ts` بيفلتر لأنه رايح لـGroq/whisper-large — ده
   مسار تاني خالص. ماتنقلش الفلاتر هنا.
"""
from __future__ import annotations

import argparse
import http.server
import hmac
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

try:                                    # العربي لازم UTF-8 على كونسول ويندوز
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

SERVER_NAME = "plate-judge/1.0"
SR = 16000                              # الموديل مايعرفش غير ١٦ كيلو مونو

# الأصول المسموح لها CORS. الـWebView بيحمّل من Vercel (capacitor.config.ts:
# server.url) فأصله هو نفس أصل الموقع؛ والباقي للحالات المحلية/الاحتياطية.
DEFAULT_ORIGINS = (
    "https://platehunter-ksa.vercel.app",   # الإنتاج + جوّه الـWebView
    "https://localhost",                    # Capacitor androidScheme=https
    "http://localhost",                     # Capacitor القديم / cleartext
    "capacitor://localhost",                # iOS / مخطّط Capacitor
    "ionic://localhost",
    "http://localhost:3000",                # next dev
    "http://127.0.0.1:3000",
)

# ⚠️ القايمة فوق مكتوبة لطوبولوجيا **الشيبنج** (WebView ← Vercel). لكن كود
#    الطيّار وقت التجربة **لسه مش متكوميت** (مش على main ولا على أي remote) ⇒
#    نسخة Vercel الإنتاجية **مستحيل** تكون هي اللي شغّالة عند المالك. يعني في
#    الطيّار التطبيق بيتحمّل من حاجة تانية (نفق تاني · نسخة معاينة · LAN IP)،
#    وكل الحالات التلاتة **مش** في القايمة ⇒ الـpreflight بيترفض ⇒ الـPOST
#    **عمره ما يخرج من التليفون** ⇒ الخدمة سليمة و«مستلمة صفر طلبات».
#    دي كانت الحادثة الميدانية. الحل بلا كود: `--origin https://<الأصل>`.
#    ولأن اسم النفق السريع بيتغيّر **كل تشغيلة** (docs/pilot-runbook.md §٢٫٣)
#    فيه كمان `--origin-suffix` (اختياري، مطفي افتراضياً — بلا توسيع صامت).


def origin_allowed(origin: str, exact: set, suffixes=()) -> bool:
    """
    هل نعكس الأصل ده؟ مطابقة **حرفية** من القايمة، أو لاحقة مسموحة صراحةً
    (مثلاً `.trycloudflare.com`). فشل مغلق: أصل فاضي = لأ، ولاحقة لازم تبقى
    على **مضيف https** وتبدأ بنقطة عشان `evil-trycloudflare.com` مايعدّيش.
    """
    if not origin:
        return False
    if origin in exact:
        return True
    for suf in suffixes or ():
        s = (suf or "").strip().lower()
        if not s or not s.startswith("."):
            continue
        try:
            u = urlparse(origin)
        except Exception:
            continue
        if u.scheme != "https" or not u.hostname:
            continue
        if u.hostname.lower().endswith(s):
            return True
    return False

# صيغ الصوت اللي بتوصل من MediaRecorder، وامتداد الملف المؤقّت المناسب لكل واحدة.
# ffmpeg بيكتشف بنفسه، بس الامتداد الصح بيساعد المُفكِّكات اللي محتاجة تدوير
# (m4a/mp4 عندهم moov atom في الآخر).
MIME_EXT = {
    "audio/webm": ".webm", "audio/webm;codecs=opus": ".webm",
    "audio/ogg": ".ogg", "audio/ogg;codecs=opus": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav", "audio/wave": ".wav", "audio/x-wav": ".wav",
    "audio/mp4": ".m4a", "audio/m4a": ".m4a", "audio/x-m4a": ".m4a",
    "audio/aac": ".aac", "audio/mpeg": ".mp3", "audio/3gpp": ".3gp",
    "audio/amr": ".amr", "audio/flac": ".flac", "audio/x-flac": ".flac",
}


# ═══════════════════════════════════════════════ استيراد منطق المشروع (مش نسخ)
def import_project_modules(training_dir: str):
    """
    بيجيب `gate` من `training/plate_confidence.py` و`normalize_plate` من
    `training/plate_parser_port.py` (النقل الحرفي لـlib/plateParser.ts).
    ⚠️ **ممنوع** إعادة تنفيذ العتبات أو التطبيع هنا — أي نسخة تانية بتنفصل عن
    الأصل بصمت وتبوّظ إعادة إنتاج الأرقام.
    """
    if training_dir not in sys.path:
        sys.path.insert(0, training_dir)
    try:
        from plate_confidence import gate, is_valid_plate, THRESHOLDS  # noqa
    except Exception as e:
        raise SystemExit(f"❌ مش قادر أستورد plate_confidence من {training_dir}: {e}")
    try:
        from plate_parser_port import normalize_plate                  # noqa
    except Exception as e:
        raise SystemExit(f"❌ مش قادر أستورد plate_parser_port من {training_dir}: {e}")
    return gate, is_valid_plate, THRESHOLDS, normalize_plate


# ═══════════════════════════════════════════════════════════ أخطاء الطلب
class BadRequest(Exception):
    """طلب غلط (صوت تالف / جسم فاضي / JSON بايظ) — بيرجع ٤٠٠، **مايوقّعش الخدمة**."""

    def __init__(self, reason: str, detail: str = "", status: int = 400):
        super().__init__(detail or reason)
        self.reason, self.detail, self.status = reason, detail, status


# ═══════════════════════════════════════════════════════ تحويل الصوت (ffmpeg)
def resolve_ffmpeg(explicit: str | None) -> str:
    """يلاقي ffmpeg: الفلاج ← PATH ← نسخة المشروع في node_modules/ffmpeg-static."""
    if explicit:
        if not os.path.isfile(explicit):
            raise SystemExit(f"❌ --ffmpeg مش موجود: {explicit}")
        return explicit
    p = shutil.which("ffmpeg")
    if p:
        return p
    here = os.path.dirname(os.path.abspath(__file__))
    bundled = os.path.join(os.path.dirname(here), "node_modules", "ffmpeg-static",
                           "ffmpeg.exe")
    if os.path.isfile(bundled):
        return bundled
    raise SystemExit("❌ ffmpeg مش متاح (لا في PATH ولا في node_modules/ffmpeg-static). "
                     "نصّبه: winget install Gyan.FFmpeg  أو مرّر --ffmpeg <path>")


def decode_to_pcm(raw: bytes, mime: str, ffmpeg: str, max_seconds: float,
                  timeout: float, start_s: float = 0.0,
                  window_s: float | None = None):
    """
    بايتات أي صيغة → مصفوفة float32 مونو ١٦ك في المدى [-1, 1).

    • بنكتب ملف مؤقّت بدل الأنبوب: mp4/m4a محتاجين تدوير (moov في الآخر) وعلى
      stdin بيفشلوا. الملف المؤقّت بيتمسح دايماً (finally).
    • القسمة على ٣٢٧٦٨ **مطابقة** لـ`training/transcribe_folder.py:105` ولطريقة
      libsndfile في تحويل PCM_16 لـfloat — عشان مسار HTTP يدّي نفس أرقام
      المسار الأوفلاين بالبِت.
    • `-t` بيقصّ المدّة كسقف حساب. (المستخلِص بيقصّ على ٣٠ث بأي حال.)
    • `start_s`/`window_s` = **قصّ النبضة** (اختياري، الافتراضي المقطع كله فمسار
      النهاردة مايتغيّرش). `-ss` **قبل** `-i` مقصود: بحث على الدخل، فـffmpeg
      بيعدّي الحزم بلا فك ترميز لحد نقطة البدء — رخيص حتى على بادئة جلسة طويلة
      (مافيش Cues في webm الحي، فالبديل — البحث على المخرَج — كان بيفك ترميز
      كل اللي قبلها).
    • مافيش **أي** فلتر صوتي — الموديل اتدرّب على خام.
    """
    import numpy as np
    ext = MIME_EXT.get((mime or "").strip().lower().replace(" ", ""), "")
    if not ext:                     # mime مجهول → سيب ffmpeg يكتشف من المحتوى
        ext = ".bin"
    dur = max_seconds if window_s is None else min(window_s, max_seconds)
    fd, tmp = tempfile.mkstemp(suffix=ext, prefix="platejudge_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        cmd = [ffmpeg, "-nostdin", "-hide_banner", "-v", "error"]
        if start_s > 0:
            cmd += ["-ss", f"{start_s:.3f}"]
        cmd += ["-i", tmp, "-map", "0:a:0", "-vn",
                "-t", f"{dur:.3f}",
                "-f", "s16le", "-acodec", "pcm_s16le",
                "-ac", "1", "-ar", str(SR), "-"]
        try:
            p = subprocess.run(cmd, capture_output=True, timeout=max(1.0, timeout))
        except subprocess.TimeoutExpired:
            raise BadRequest("ffmpeg_timeout", f"ffmpeg عدّى {timeout:.1f}ث", 504)
        if p.returncode != 0 or not p.stdout:
            err = (p.stderr or b"").decode("utf-8", "replace").strip()[:300]
            raise BadRequest("audio_decode_failed",
                             err or f"ffmpeg رجع {p.returncode} بلا مخرَج")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    a = np.frombuffer(p.stdout, dtype="<i2").astype("float32") / 32768.0
    if a.size < 400:                # أقل من ٢٥ms — مافيش حاجة تتفرّغ
        raise BadRequest("audio_too_short", f"{a.size} عيّنة بعد التحويل")
    return a


def audio_features(pcm) -> dict:
    """
    `mean_db` / `peak_db` / `gate_max_rms` — الإشارات التلات اللي `audio_pregate`
    بيقراها (وبس؛ `silence_pct` مش مستخدَم في البوابة).

    نسخة متجهيّة من نفس الحساب في `training/plate_confidence.py:178-203`
    (فريم ٢٠ms = TICK_MS، `+1e-20` جوّه الجذر، وحدّ `_db` عند 1e-12). اتحقّقنا
    منها مقابل `clip_quality_features()` على ١٢٠ مقطع ذهبي: **أقصى فرق ٠٫٠e+00
    على التلاتة** (تطابق تام بالبِت). اتعملت هنا مش استيراد لأن
    `clip_quality_features` بتاخد **مسار ملف** (يعني كتابة وقراءة wav مؤقّت لكل
    طلب) وبتحسب كمان `silence_pct` بحلقة بايثون خالصة مش محتاجينها — المقيس:
    ٤٫٧٤ms للمقطع مقابل **٠٫٤٤ms** هنا. **العتبات لسه بتيجي من
    `plate_confidence.THRESHOLDS` — مافيش رقم قرار مكتوب في الملف ده.**
    """
    import math
    import numpy as np
    a = np.asarray(pcm, dtype=np.float64)
    if a.size < 16:
        return dict(dur_s=0.0, mean_db=-99.0, peak_db=-99.0, gate_max_rms=0.0)

    def _db(x):
        return 20.0 * math.log10(max(float(x), 1e-12))

    n = max(1, int(0.020 * SR))
    k = a.size // n
    fr = (a[:k * n].reshape(k, n) if k else a.reshape(1, -1))
    rms = np.sqrt((fr * fr).mean(axis=1) + 1e-20)
    return dict(dur_s=a.size / SR,
                mean_db=_db(math.sqrt(float((a * a).mean()))),
                peak_db=_db(float(np.abs(a).max())),
                gate_max_rms=float(rms.max()))


# ═══════════════════════════════════════════════════════════════ الموديل
class PlateModel:
    """
    الموديل مُحمَّل **مرّة واحدة** وقت البدء وفاضل دافي. فكّ الترميز مطابق
    بالحرف لـ`training/transcribe_folder.py --scores` (سطور ٢٢٦-٢٦٠):
        language="arabic", task="transcribe", max_new_tokens=12, greedy
        + compute_transition_scores(normalize_logits=True)
        + تمريرة أمامية خام لـ`<|nocaptions|>` (التوكن مكبوت جوّه generate)
    أي تغيير في الوصفة دي بيفصل الخدمة عن الأرقام المقيسة (١١٥/١٢٠).

    التسلسل: قفل واحد حوالين الـGPU. الكارت جهاز واحد و`batch=1` على أي حال،
    فالتوازي هنا كان بيزوّد ذاكرة وزمن انتظار بلا أي مكسب.
    """

    def __init__(self, path: str, cpu: bool = False, fp32: bool = False):
        import torch
        from transformers import WhisperProcessor, WhisperForConditionalGeneration
        self.torch = torch
        self.path = path
        self.name = os.path.basename(os.path.normpath(path))
        self.device = "cpu" if cpu else ("cuda" if torch.cuda.is_available() else "cpu")
        self.dtype = (torch.float16 if (self.device == "cuda" and not fp32)
                      else torch.float32)
        self.proc = WhisperProcessor.from_pretrained(path, language="arabic",
                                                     task="transcribe")
        self.model = WhisperForConditionalGeneration.from_pretrained(
            path, torch_dtype=self.dtype)
        self.model.to(self.device).eval()

        # معرّفات التوكنات المطلوبة للدرجات — نفس حساب
        # transformers/models/whisper/generation_whisper.py
        gc = self.model.generation_config
        self.eot_id = gc.eos_token_id
        nt = getattr(gc, "no_timestamps_token_id", None)
        if nt is None:
            nt = self.proc.tokenizer.convert_tokens_to_ids("<|notimestamps|>")
        self.nospeech_id = nt - 1                       # <|nocaptions|>
        self.sot_id = self.proc.tokenizer.convert_tokens_to_ids("<|startoftranscript|>")
        self.lock = threading.Lock()

    def warmup(self, seconds: float = 3.0, rounds: int = 2):
        """
        تمريرتين على ضجيج خفيف: أول استدعاء على CUDA بيدفع تكلفة تخصيص الذاكرة
        وتوليف النوى (cudnn autotune) — لو مادفعناهاش هنا، **أول** طلب حقيقي من
        المندوب هو اللي هيدفعها. **مقيس**: بـ--no-warmup أول طلب ١٩٦٧ms مقابل
        ٣٥٠ms مستقر = ٥٫٦×. وده أول لوحة يقولها المندوب، فمهم.
        """
        import numpy as np
        rng = np.random.default_rng(0)
        a = (rng.standard_normal(int(seconds * SR)) * 1e-3).astype("float32")
        for _ in range(max(1, rounds)):
            self.infer(a)

    def infer(self, pcm, deadline: float | None = None) -> dict:
        """
        مقطع واحد → {text, mean_logprob, min_logprob, no_speech_prob, n_tok}.

        `deadline` = وقت انتهاء ميزانية الطلب (time.time()). الانتظار على القفل
        هو **الجزء الوحيد** اللي بيطول فعلاً لما تجيلنا طلبات مع بعض، فبناخد
        القفل بمهلة: لو الطابور أكل الميزانية بنرفع ٥٠٤ **قبل** ما نحرق حساب على
        رد فات وقته. (النواة نفسها مش قابلة للمقاطعة وسطها — ده حدّ في
        بايثون/torch، بس هي **محدودة بالبناء**: ١٢ توكن كأقصى ومستخلِص ثابت
        على ٣٠ث. المقيس لمرحلة الموديل لوحدها: p95 ٢١٩–٤٢٣ms كارت ·
        ٤٤٢٠ms معالج.)
        """
        torch = self.torch
        if deadline is None:
            got = self.lock.acquire()
        else:
            got = self.lock.acquire(timeout=max(0.0, deadline - time.time()))
        if not got:
            raise BadRequest("deadline_exceeded",
                             "الطابور أكل ميزانية الطلب قبل ما الكارت يفضى", 504)
        try:
            feats = self.proc.feature_extractor(
                pcm, sampling_rate=SR, return_tensors="pt").input_features
            feats = feats.to(device=self.device, dtype=self.dtype)
            with torch.no_grad():
                out = self.model.generate(
                    feats, max_new_tokens=12, language="arabic", task="transcribe",
                    output_scores=True, return_dict_in_generate=True)
                seq = out.sequences
                # ⚠️ out.scores = logits بعد المعالِجات مش log-probs →
                #    normalize_logits=True **إجبارية**.
                tr = self.model.compute_transition_scores(
                    seq, tuple(x.float() for x in out.scores),
                    beam_indices=getattr(out, "beam_indices", None),
                    normalize_logits=True)
                # قناع: التوكنات المولَّدة لحد أول <|endoftext|> (شامله) — الحشو
                # بعد كده بيخرّب min_logprob.
                gen = seq[:, seq.shape[1] - tr.shape[1]:]
                is_eot = (gen == self.eot_id)
                prior = is_eot.int().cumsum(dim=1) - is_eot.int()
                keep = (prior == 0) & tr.isfinite()
                # <|nocaptions|> لازم من تمريرة أمامية خام: التوكن مكبوت جوّه
                # generate فعمره ما يظهر في out.scores.
                sot = torch.full((feats.shape[0], 1), self.sot_id,
                                 dtype=torch.long, device=feats.device)
                lg = self.model(input_features=feats, decoder_input_ids=sot).logits
                nsp = float(lg[:, 0].float().softmax(-1)[0, self.nospeech_id])
            text = self.proc.tokenizer.decode(seq[0], skip_special_tokens=True).strip()
            v = tr[0][keep[0]]
            if v.numel() == 0:
                return dict(text=text, mean_logprob=None, min_logprob=None,
                            no_speech_prob=nsp, n_tok=0)
            return dict(text=text, mean_logprob=float(v.mean()),
                        min_logprob=float(v.min()), no_speech_prob=nsp,
                        n_tok=int(v.numel()))
        finally:
            self.lock.release()

    def vram(self) -> dict:
        """حالة ذاكرة الكارت — بتظهر في /health عشان نعرف لو في تسريب."""
        t = self.torch
        if self.device != "cuda" or not t.cuda.is_available():
            return dict(device="cpu")
        free, total = t.cuda.mem_get_info()
        return dict(device="cuda", gpu=t.cuda.get_device_name(0),
                    free_mb=free // 1048576, total_mb=total // 1048576,
                    allocated_mb=round(t.cuda.memory_allocated() / 1048576, 1),
                    peak_mb=round(t.cuda.max_memory_allocated() / 1048576, 1))


# ═══════════════════════════════════════════════════════════ سجل JSONL
class JsonlLog:
    """
    سطر JSON لكل طلب، بـflush فوري. الطيّار **لازم** يطلّع داتا قابلة للقياس؛
    لو الخدمة شغّالة بلا سجل يبقى مافيش إثبات على أي حاجة.
    فشل الكتابة (قرص مليان مثلاً) **مايوقّعش** الطلب — بيتحوّل لتحذير.
    """

    def __init__(self, path: str | None):
        self.path = path
        self.lock = threading.Lock()
        self.warned = False
        if path:
            d = os.path.dirname(os.path.abspath(path))
            if d:
                os.makedirs(d, exist_ok=True)

    def write(self, rec: dict):
        if not self.path:
            return
        line = json.dumps(rec, ensure_ascii=False)
        try:
            with self.lock, open(self.path, "a", encoding="utf-8", newline="\n") as f:
                f.write(line + "\n")
                f.flush()
        except Exception as e:
            if not self.warned:
                self.warned = True
                print(f"⚠️ مش قادر أكتب السجل {self.path}: {e}", flush=True)


# ═══════════════════════════════════════════════════════ حالة الخدمة المشتركة
class Service:
    """كل الحالة المشتركة في مكان واحد — المعالِج بيقراها من `server.svc`."""

    def __init__(self, args, model: PlateModel, gate, normalize_plate, ffmpeg: str,
                 log: JsonlLog, started_at: float, cold_start_s: float):
        self.args = args
        self.model = model
        self.gate = gate
        self.normalize_plate = normalize_plate
        self.ffmpeg = ffmpeg
        self.log = log
        self.started_at = started_at
        self.cold_start_s = cold_start_s
        self.origins = set(DEFAULT_ORIGINS) | set(args.origin or [])
        # لواحق مسموحة صراحةً (نفق سريع باسم عشوائي كل تشغيلة). **مطفية**
        # افتراضياً — التوسيع لازم يكون قرار مكتوب في أمر التشغيل.
        self.origin_suffixes = tuple(getattr(args, "origin_suffix", None) or [])
        # سقف الطلبات الجوّه (اللي بتتنفّذ + اللي في الطابور). فوقه ٥٠٣ فوراً
        # بدل ما نخلّي المندوب مستني على حاجة مش هتوصل في الوقت.
        self.slots = threading.BoundedSemaphore(max(1, args.max_inflight))
        self.inflight = 0
        self.cnt_lock = threading.Lock()
        self.n_total = self.n_ok = self.n_refused = self.n_err = 0
        # الـpreflight **بيوصل** للخدمة. لو رفضناه المتصفّح بيلغي الـPOST، فبلا
        # العدّادين دول الفشل ده مالوش أثر في أي مكان — وده اللي خلّى الحادثة
        # تتفسّر «صفر طلبات» وهي فعلاً كانت طلبات واصلة ومترفوضة.
        self.n_preflight = self.n_cors_blocked = 0

    def bump(self, key: str):
        with self.cnt_lock:
            setattr(self, key, getattr(self, key) + 1)

    def save_clip(self, pcm) -> str | None:
        """
        يحفظ **نفس** المقطع اللي الموديل سمعه (بعد القصّ والتحويل) كـWAV 16k مونو.

        ليه بعد التحويل مش البايتات الخام؟ لأن الخام هو **بادئة الجلسة كلها**
        (ميجابايتات، ومتكرّرة في كل طلب)، أما ده المقطع المقصوص بالظبط — وهو
        اللي نحتاجه لو عايزين نعيد التجربة بموديل تانٍ ونقارن على نفس الدخل.

        فاشل الحفظ **مايكسرش الطلب أبداً**: بيرجّع None والرد يخرج عادي.
        """
        d = getattr(self.args, "save_audio", "") or ""
        if not d:
            return None
        try:
            import wave
            import numpy as np          # زي باقي الملف: استيراد محلي مش على المستوى الأعلى
            os.makedirs(d, exist_ok=True)
            with self.cnt_lock:
                self.n_clips = getattr(self, "n_clips", 0) + 1
                seq = self.n_clips
            name = f"{datetime.now().strftime('%H%M%S')}_{seq:04d}.wav"
            path = os.path.join(d, name)
            pcm16 = (np.clip(np.asarray(pcm, dtype=np.float32), -1.0, 0.999969)
                     * 32767.0).astype("<i2")
            with wave.open(path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(16000)
                w.writeframes(pcm16.tobytes())
            return name
        except Exception:
            return None


# ═══════════════════════════════════════════════════════════ معالِج HTTP
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = SERVER_NAME
    sys_version = ""
    protocol_version = "HTTP/1.1"       # لازم Content-Length على كل رد

    # ─────────────────────────────────────────────────────────── مساعدات
    _body_read = False        # اتقرا جسم الطلب بالكامل؟ (بيحدّد قفل الاتصال)

    @property
    def svc(self) -> Service:
        return self.server.svc            # type: ignore[attr-defined]

    def log_message(self, fmt, *a):
        """سكوت: سجل الوصول الافتراضي بيروح stderr ومابيضيفش على JSONL."""
        return

    def handle_one_request(self):
        # المُعالِج بيتعاد استخدامه على نفس الاتصال (keep-alive) فلازم نصفّر
        # العلامة قبل كل طلب، وإلا طلب قديم بيأثّر على قرار القفل للي بعده.
        self._body_read = False
        return super().handle_one_request()

    def send_error(self, code, message=None, explain=None):
        """
        المكتبة القياسية بترجّع **صفحة HTML** في أخطائها الداخلية (سطر طلب بايظ،
        طريقة مش معروفة، ترويسة أطول من الحد). الخدمة دي عقدها JSON دايماً،
        فبنستبدلها — عشان التطبيق مايحتاجش يفرّق بين نوعين ردّ.
        """
        try:
            self.close_connection = True
            body = json.dumps({"error": "bad_http_request", "code": int(code),
                               "detail": (message or explain or None)},
                              ensure_ascii=False).encode("utf-8")
            self.send_response_only(code, message)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD" and code >= 200 and code not in (204, 304):
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass

    def _origin(self) -> str:
        return (self.headers.get("Origin") or "").strip()

    def _cors(self) -> bool:
        """
        بنعكس الأصل **بس** لو مسموح (مافيش `*` أبداً). ملاحظة: CORS متصفّحي، مش
        تحقّق هوية — الطلبات الأصلية (native fetch) بتوصل بلا Origin. اللي بيمنع
        الغريب هو **التوكن**، مش الترويسة دي.

        بيرجّع: هل عكسنا الأصل؟ (`False` كمان لو مافيش Origin خالص = طلب مش
        متصفّحي، وده **مش** رفض.) المنادي بيستعمل القيمة للتسجيل.
        """
        o = self._origin()
        if origin_allowed(o, self.svc.origins, self.svc.origin_suffixes):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Credentials", "false")
            return True
        return False

    def _drain_body(self, budget_s: float = 1.0, cap: int = 16 << 20):
        """
        قراءة وتجاهل باقي جسم الطلب لفترة **محدودة** بعد ما بعتنا رد الرفض.

        ليه؟ العميل لسه بيبعت (مثلاً ٩ ميجا) وهو مقفول في `sendall`، فمش بيقرا
        الرد. لو قفلنا الـsocket ولسه فيه داتا جاية، ويندوز بيبعت RST فالعميل
        بياخد `WinError 10053` **بدل** ٤١٣ ومايعرفش ليه اترفض. القفل الأعمى ده
        اتصاد في الاختبار وكان **متقلقل** (نجح مرة وفشل مرة على نفس الكود).
        الحل: نصرّف الباقي بسقف زمن وسقف بايتات (lingering close) وبعدين نقفل.
        السقفين مقصودين: مانخلّيش حد يشغّلنا بـContent-Length خيالي.
        """
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except (ValueError, TypeError):
            return
        if n <= 0:
            return
        end = time.time() + budget_s
        left = min(n, cap)
        try:
            self.connection.settimeout(0.25)
            while left > 0 and time.time() < end:
                b = self.rfile.read(min(left, 1 << 16))
                if not b:
                    break
                left -= len(b)
        except Exception:
            pass
        finally:
            try:
                self.connection.settimeout(None)
            except Exception:
                pass

    def _json(self, status: int, body: dict):
        """
        ⚠️ لو رفضنا POST **قبل** ما نقرا جسمه (٤٠١ / ٤١٣ / ٤١١ / ٤٠٤) لازم نقفل
        الاتصال (`Connection: close`، RFC 9112 §9.6) **وكمان** نصرّف الباقي —
        شوف `_drain_body`. الاتنين مطلوبين: القفل لوحده كان بيدّي RST.
        """
        try:
            raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
            unread = (self.command == "POST" and not self._body_read)
            if unread:
                self.close_connection = True
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            if self.close_connection:
                self.send_header("Connection", "close")
            self._cors()
            self.end_headers()
            self.wfile.write(raw)
            self.wfile.flush()
            if unread:
                self._drain_body()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass                          # التليفون قفل الاتصال — مش خطأ عندنا

    def _authorized(self) -> bool:
        """
        `X-Plate-Token: <سر>` أو `Authorization: Bearer <سر>`. المقارنة
        بـ`compare_digest` (زمن ثابت) عشان مانسرّبش السر بفرق الزمن.
        """
        want = self.svc.args.token
        got = (self.headers.get("X-Plate-Token") or "").strip()
        if not got:
            auth = (self.headers.get("Authorization") or "").strip()
            if auth.lower().startswith("bearer "):
                got = auth[7:].strip()
        return bool(got) and hmac.compare_digest(got, want)

    def _read_body(self) -> bytes:
        """
        بنقرا **بالظبط** Content-Length، وبنرفض قبل القراءة لو أكبر من السقف.
        chunked مش مدعوم بقصد: `fetch()` بـBlob بيحدّد Content-Length دايماً،
        والدعم بيحتاج فك تقطيع يدوي = سطح هجوم زيادة بلا داعي.
        """
        if (self.headers.get("Transfer-Encoding") or "").lower() == "chunked":
            raise BadRequest("chunked_not_supported",
                             "ابعت الجسم بـContent-Length", 411)
        try:
            n = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            n = -1
        if n <= 0:
            raise BadRequest("empty_body", "Content-Length ناقص أو صفر", 411)
        cap = self.svc.args.max_bytes
        if n > cap:
            raise BadRequest("payload_too_large", f"{n} بايت > السقف {cap}", 413)
        buf, left = bytearray(), n
        while left > 0:
            chunk = self.rfile.read(min(left, 1 << 16))
            if not chunk:
                break
            buf += chunk
            left -= len(chunk)
        if len(buf) != n:
            raise BadRequest("short_body", f"وصل {len(buf)} من {n}")
        self._body_read = True          # الجسم اتستهلك → keep-alive آمن
        return bytes(buf)

    # ───────────────────────────────────────────────────── الطرق المدعومة
    def do_OPTIONS(self):
        """
        الفحص المسبق (preflight). لازم يسمّي ترويسة التوكن وإلا المتصفّح يقفل.

        ⚠️ **الطلب ده بيتسجّل، وده مقصود.** الطيّار بيبعت `X-Plate-Token` +
        `Content-Type: audio/webm` — الاتنين **مش** من القايمة الآمنة، فالمتصفّح
        بيعمل preflight إجباري قبل كل POST. لو الأصل مش مسموح بنرجّع 204 **بلا**
        `Access-Control-Allow-Origin`، والمتصفّح ساعتها بيلغي الـPOST من نفسه ⇒
        الخدمة كانت بتبان «مستلمة صفر طلبات» وهي مستلمة preflight ومرفّضاه.
        الرفض ده **مش** غير مرئي بطبيعته — كان غير مرئي لأننا كنا برميه. بقى له
        عدّاد في `/health` وسطر في JSONL باسم `cors_origin_rejected`.
        """
        t0 = time.time()
        req = uuid.uuid4().hex[:12]
        s = self.svc
        s.bump("n_preflight")
        self.send_response(204)
        ok = self._cors()
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, X-Plate-Token, Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()
        if not ok and self._origin():
            s.bump("n_cors_blocked")
            # الأصل نفسه في `detail` — هو بالظبط اللي المالك محتاج يزوّده بـ
            # `--origin`. مافيش أي سر في الترويسة دي.
            self._audit(req, t0, status=204, reason="cors_origin_rejected",
                        detail=self._origin())
            print(f"⛔ CORS: أصل مرفوض ← {self._origin()}   "
                  f"(الـPOST مش هيتبعت. زوّده: --origin {self._origin()})",
                  flush=True)

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/ping":
            # نبضة حياة بلا توكن — عشان فحص النفق مايحتاجش السر. مافيهاش أي
            # معلومة عن الموديل ولا الجهاز.
            return self._json(200, {"ok": True})
        if path == "/health":
            if not self._authorized():
                return self._json(401, {"error": "unauthorized"})
            s = self.svc
            return self._json(200, {
                "ok": True,
                "model": s.model.name,
                "model_path": s.model.path,
                "device": s.model.device,
                "dtype": str(s.model.dtype).replace("torch.", ""),
                "uptime_s": round(time.time() - s.started_at, 1),
                "cold_start_s": round(s.cold_start_s, 2),
                "vram": s.model.vram(),
                "inflight": s.inflight,
                "max_inflight": s.args.max_inflight,
                "requests": {"total": s.n_total, "accepted": s.n_ok,
                             "refused": s.n_refused, "errors": s.n_err},
                # الـpreflight مش POST فمش في `total`. لو `preflight > 0` و
                # `total == 0` يبقى التليفون **بيوصل** والمتصفّح هو اللي بيلغي —
                # يعني CORS، مش نفق واقع. والفرق ده هو كل الفرق في التشخيص.
                "preflight": {"total": s.n_preflight, "cors_blocked": s.n_cors_blocked},
                "cors": {"origins": sorted(s.origins),
                         "suffixes": list(s.origin_suffixes)},
                "log": s.log.path,
            })
        return self._json(404, {"error": "not_found",
                                "paths": ["POST /transcribe", "GET /health", "GET /ping"]})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        t0 = time.time()
        req = uuid.uuid4().hex[:12]
        s = self.svc
        # ⚠️ العدّ والتسجيل **قبل** أي بوابة، ومقصود:
        #    قبل كده كان ٤٠٤ و٤٠١ بيرجعوا من غير `_audit` ومن غير `bump`، و
        #    `log_message` مسكّتة (:555) — يعني توكن غلط أو عنوان غلط = الخدمة
        #    شغّالة وسليمة و«مستلمة صفر طلبات» في كل مكان تبصّ فيه: لا سطر في
        #    JSONL، لا عدّاد في /health، لا سطر في الكونسول. الحادثة الميدانية
        #    ضاعت أسبوع فيها بالظبط عشان كده. أي طلب بيوصل لازم يسمّي نفسه.
        s.bump("n_total")
        if path != "/transcribe":
            s.bump("n_err")
            self._audit(req, t0, status=404, reason="not_found", detail=path)
            return self._json(404, {"error": "not_found", "paths": ["POST /transcribe"]})
        if not self._authorized():
            s.bump("n_err")
            # التوكن اللي وصل **عمره ما يتسجّل** — بس وجوده من عدمه.
            self._audit(req, t0, status=401, reason="unauthorized",
                        detail=("token_present" if self.headers.get("X-Plate-Token")
                                or self.headers.get("Authorization") else "token_missing"))
            return self._json(401, {"error": "unauthorized"})

        # ── التحكّم في الدخول: لو الجوّه وصل السقف نرفض **فوراً**. المندوب
        #    مايستناش على حاجة مش هتلحق — الرجوع لـDeepgram أسرع وأنضف.
        if not s.slots.acquire(blocking=False):
            s.bump("n_err")
            self._audit(req, t0, status=503, reason="queue_full")
            return self._json(503, {"error": "busy", "refuse_reason": "queue_full",
                                    "retry_after_ms": 500})
        with s.cnt_lock:
            s.inflight += 1
        try:
            body = self._handle_transcribe(req, t0)
            return self._json(200, body)
        except BadRequest as e:
            s.bump("n_err")
            self._audit(req, t0, status=e.status, reason=e.reason, detail=e.detail)
            return self._json(e.status, self._empty_result(req, t0, e.reason, e.detail))
        except Exception as e:                       # ⚠️ أبداً مانوقّع العملية
            s.bump("n_err")
            detail = f"{type(e).__name__}: {e}"
            self._audit(req, t0, status=500, reason="internal_error", detail=detail)
            print(f"⚠️ [{req}] خطأ داخلي: {detail}", flush=True)
            return self._json(500, self._empty_result(req, t0, "internal_error", detail))
        finally:
            with s.cnt_lock:
                s.inflight -= 1
            s.slots.release()

    # ────────────────────────────────────────────────── منطق /transcribe
    @staticmethod
    def _cut_window(start: float | None, end: float | None,
                    max_seconds: float) -> tuple[float, float | None]:
        """
        (start, end) اللي وصلوا → (بداية القصّ، طول النافذة) للـffmpeg.

        **متوافق للخلف بالكامل**: أي قيمة ناقصة أو غلط (غير رقمية / سالبة /
        مقلوبة / صفر مدّة / لانهائية) = `(0.0, None)` = المقطع كله = عقد النهاردة
        بالحرف. النافذة مقصوصة على `--max-seconds` لأن مستخلِص Whisper بيثبّت
        على ٣٠ث بأي حال.
        """
        if start is None or end is None:
            return 0.0, None
        try:
            a, b = float(start), float(end)
        except (TypeError, ValueError):
            return 0.0, None
        if not (a == a and b == b):                    # NaN
            return 0.0, None
        if a in (float("inf"), float("-inf")) or b in (float("inf"), float("-inf")):
            return 0.0, None
        if a < 0 or b <= a:
            return 0.0, None
        return a, min(b - a, max_seconds)

    @staticmethod
    def _num(v) -> float | None:
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    def _query_window(self, qs: dict) -> tuple[float | None, float | None]:
        """`?start=&end=` بالثواني، أو `?start_ms=&end_ms=` بالملي ثانية."""
        def pick(name: str, ms_name: str) -> float | None:
            if name in qs and qs[name]:
                return self._num(qs[name][0])
            if ms_name in qs and qs[ms_name]:
                v = self._num(qs[ms_name][0])
                return None if v is None else v / 1000.0
            return None
        return pick("start", "start_ms"), pick("end", "end_ms")

    def _handle_transcribe(self, req: str, t0: float) -> dict:
        s = self.svc
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        # نافذة القصّ (اختيارية) — من الـquery. مافيش أي سر في الـquery: التوكن
        # في ترويسة، وده وقت بالثواني بس.
        q_start, q_end = self._query_window(parse_qs(urlparse(self.path).query))
        raw = self._read_body()

        # صيغتين مقبولتين: (١) بايتات خام مع Content-Type بتاع الصوت — الأرخص
        # والمُفضَّل. (٢) JSON {audio: base64, mimeType} — نفس شكل الطلب اللي
        # التطبيق بيبعته لـ/api/transcribe، فالكود الموجود بيتنقل كما هو.
        if ctype == "application/json":
            try:
                obj = json.loads(raw.decode("utf-8"))
            except Exception as e:
                raise BadRequest("bad_json", str(e))
            b64 = (obj.get("audio") or "").strip()
            if not b64:
                raise BadRequest("empty_body", "JSON بلا حقل audio")
            if b64.startswith("data:"):        # لو حد بعت data: URI بالغلط
                b64 = b64.split(",", 1)[-1]
            import base64
            try:
                audio = base64.b64decode(b64, validate=False)
            except Exception as e:
                raise BadRequest("bad_base64", str(e))
            mime = (obj.get("mimeType") or obj.get("mime") or "").strip()
            # نفس النافذة تنفع تيجي في الـJSON (بالثواني أو بالملي ثانية).
            if q_start is None and q_end is None:
                js = obj.get("start", obj.get("startMs"))
                je = obj.get("end", obj.get("endMs"))
                scale = 1000.0 if ("startMs" in obj or "endMs" in obj) else 1.0
                vs, ve = self._num(js), self._num(je)
                q_start = None if vs is None else vs / scale
                q_end = None if ve is None else ve / scale
        else:
            audio = raw
            mime = ctype
        if len(audio) < 64:
            raise BadRequest("empty_body", f"{len(audio)} بايت بس")
        cut_start, cut_window = self._cut_window(q_start, q_end, s.args.max_seconds)

        # ── الميزانية: كل الوقت اللي فاضل من --timeout يروح لـffmpeg، وبعدين
        #    اللي فاضل بعده بيبقى مهلة أخذ قفل الـGPU (شوف PlateModel.infer).
        #    الموديل نفسه **محدود بالبناء** (١٢ توكن كأقصى، والمستخلِص بيثبّت
        #    الدخل على ٣٠ث) فمايقدرش يسرح — بس مايتقاطعش وسط نواة CUDA، وده حدّ
        #    في بايثون/torch مش تصميم. المقيس على ١٢٠ مقطع ذهبي × ٣ جولات:
        #    p95 ٢٦٤–٤٩٤ms على الكارت · ٤٥٠١ms على المعالج (--cpu).
        left = s.args.timeout - (time.time() - t0)
        if left <= 0:
            raise BadRequest("deadline_exceeded", "الميزانية خلصت قبل التحويل", 504)
        tA = time.time()
        pcm = decode_to_pcm(audio, mime, s.ffmpeg, s.args.max_seconds, left,
                            start_s=cut_start, window_s=cut_window)
        ms_ff = int((time.time() - tA) * 1000)

        left = s.args.timeout - (time.time() - t0)
        if left <= 0:
            raise BadRequest("deadline_exceeded", "الميزانية خلصت قبل الموديل", 504)

        feats = audio_features(pcm)
        clip_name = s.save_clip(pcm)     # اختياري (--save-audio) ومابيكسرش الطلب
        tB = time.time()
        out = s.model.infer(pcm, deadline=t0 + s.args.timeout)
        ms_md = int((time.time() - tB) * 1000)

        # ── القرار: **مستورد** من training/plate_confidence.py. مافيش أي عتبة
        #    مكتوبة هنا. لو رفض، اللوحة بترجع زي ما هي + السبب.
        d = s.gate(out["text"],
                   mean_logprob=out["mean_logprob"], min_logprob=out["min_logprob"],
                   no_speech_prob=out["no_speech_prob"],
                   mean_db=feats["mean_db"], peak_db=feats["peak_db"],
                   gate_max_rms=feats["gate_max_rms"])
        s.bump("n_ok" if d.accept else "n_refused")

        ms = int((time.time() - t0) * 1000)
        body = {
            "plate": out["text"],
            "plate_norm": s.normalize_plate(out["text"]),
            "confidence": {
                "mean_logprob": out["mean_logprob"],
                "min_logprob": out["min_logprob"],
                "no_speech_prob": out["no_speech_prob"],
            },
            "accepted": bool(d.accept),
            "refuse_reason": (None if d.accept else d.reason),
            "ms": ms,
            "model": s.model.name,
            # إضافات تشخيصية (مايعتمدش عليها التطبيق)
            "req": req, "dur_s": round(feats["dur_s"], 3), "n_tok": out["n_tok"],
            "device": s.model.device, "ms_ffmpeg": ms_ff, "ms_model": ms_md,
            # النافذة اللي اتقصّت فعلاً (null = المقطع كله زي الأول).
            "cut_start": (round(cut_start, 3) if cut_window is not None else None),
            "cut_window": (round(cut_window, 3) if cut_window is not None else None),
        }
        s.log.write({
            "ts": datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds"),
            "req": req, "status": 200, "ms": ms, "ms_ffmpeg": ms_ff, "ms_model": ms_md,
            "plate": body["plate"], "plate_norm": body["plate_norm"],
            "accepted": body["accepted"], "reason": (d.reason if not d.accept else "ok"),
            "mean_logprob": out["mean_logprob"], "min_logprob": out["min_logprob"],
            "no_speech_prob": out["no_speech_prob"], "n_tok": out["n_tok"],
            "dur_s": round(feats["dur_s"], 3),
            "mean_db": round(feats["mean_db"], 2), "peak_db": round(feats["peak_db"], 2),
            "cut_start": body["cut_start"], "cut_window": body["cut_window"],
            "bytes": len(audio), "mime": mime or None, "origin": self._origin() or None,
            "model": s.model.name, "device": s.model.device,
            "clip": clip_name,
        })
        return body

    # ───────────────────────────────────────────────────────── سجل/رد الفشل
    def _empty_result(self, req: str, t0: float, reason: str, detail: str = "") -> dict:
        """
        نفس شكل الرد الناجح لكن بلوحة فاضية — عشان التطبيق يبقى عنده **مسار
        واحد** لقراءة الرد، ومايفرقش بين رفض البوابة وفشل التحويل في الشكل.
        """
        return {"plate": "", "plate_norm": "",
                "confidence": {"mean_logprob": None, "min_logprob": None,
                               "no_speech_prob": None},
                "accepted": False, "refuse_reason": reason,
                "ms": int((time.time() - t0) * 1000),
                "model": self.svc.model.name, "req": req,
                "error": reason, "detail": detail or None}

    def _audit(self, req: str, t0: float, status: int, reason: str, detail: str = ""):
        self.svc.log.write({
            "ts": datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds"),
            "req": req, "status": status, "ms": int((time.time() - t0) * 1000),
            "plate": None, "plate_norm": None, "accepted": False, "reason": reason,
            "detail": (detail or None), "bytes": None,
            "mime": (self.headers.get("Content-Type") or None),
            "origin": self._origin() or None,
            "model": self.svc.model.name, "device": self.svc.model.device,
        })


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True        # ماتعلّقش الخروج على خيط طلب
    allow_reuse_address = True
    svc: Service


# ═════════════════════════════════════════════ تسجيل العنوان تلقائياً
# النفق السريع بيدّي اسم عشوائي جديد كل تشغيلة، فكان لازم الأدمن يلزق العنوان
# في كل تليفون كل يوم. بدل كده الخدمة بتسجّل عنوانها بنفسها، والتطبيق بيقراه
# من app_settings عبر RPC. صلاحيته ١٢ ساعة (lib/modelEndpoint.ts) — عنوان بايت
# بيترفض، فالتطبيق مابيحاولش يكلّم نفق واقع.

SUPABASE_URL = "https://utpoidcyvbuxriirlgim.supabase.co"
QUICK_TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def register_model_url(public_url: str) -> bool:
    """يكتب عنوان النفق الحالي في app_settings. محتاج PLATE_SUPABASE_KEY."""
    key = os.environ.get("PLATE_SUPABASE_KEY", "")
    if not key:
        print("⚠️  PLATE_SUPABASE_KEY مش مظبوط — الخدمة شغالة، لكن التطبيق مش "
              "هيلاقي العنوان لوحده. الزق العنوان يدوي في التطبيق.", flush=True)
        return False
    body = json.dumps({
        "plate_model_url": public_url.rstrip("/"),
        "plate_model_at": datetime.now(timezone.utc).isoformat(),
    }).encode()
    req = urllib.request.Request(
        SUPABASE_URL + "/rest/v1/app_settings?id=eq.true",
        data=body, method="PATCH",
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            ok = 200 <= r.status < 300
    except Exception as e:
        print("⚠️  تعذّر تسجيل الرابط: {}".format(e), flush=True)
        return False
    print("✅ العنوان اتسجّل — التطبيق هيلاقي الخدمة لوحده."
          if ok else "⚠️  التسجيل رجع كود غريب.", flush=True)
    return ok


def start_tunnel(port: int, exe: str):
    """يشغّل cloudflared، يمسك العنوان من مخرجاته، ويسجّله. بيرجّع العملية."""
    if not os.path.exists(exe):
        print("⚠️  مالقيتش cloudflared في {} — شغّل النفق بإيدك.".format(exe), flush=True)
        return None
    p = subprocess.Popen(
        [exe, "tunnel", "--url", "http://127.0.0.1:{}".format(port)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )

    def watch():
        seen = False
        for line in p.stdout:                       # type: ignore[union-attr]
            m = QUICK_TUNNEL_RE.search(line)
            if m and not seen:
                seen = True
                print("\n🌍 عنوان النفق: " + m.group(0), flush=True)
                register_model_url(m.group(0))

    threading.Thread(target=watch, daemon=True).start()
    return p


# ═════════════════════════════════════════════════════════════════ main
def build_argparser():
    ap = argparse.ArgumentParser(
        description="خدمة استنتاج محلّية لموديل لوحات PlateHunter (بلا اعتماديات جديدة)")
    ap.add_argument("--model", default="C:/Users/assem/Desktop/whisper-plates-v5plus",
                    help="مجلد الموديل المخدوم (v5plus = ٩٥٫٨٪ ذهبي؛ v6 للـA/B)")
    ap.add_argument("--host", default="127.0.0.1",
                    help="127.0.0.1 (المُفضَّل — النفق بيوصل محلياً) أو 0.0.0.0 لـLAN")
    ap.add_argument("--port", type=int, default=8756)
    ap.add_argument("--token", default=os.environ.get("PLATE_JUDGE_TOKEN", ""),
                    help="السر المشترك (أو متغيّر البيئة PLATE_JUDGE_TOKEN). "
                         "**الخدمة مابتقومش بدونه** — الأسباب في وصف الملف.")
    ap.add_argument("--origin", action="append", default=[],
                    help="أصل CORS إضافي (يتكرّر). الافتراضيات مضافة أصلاً. "
                         "**لازم** لو التطبيق محمَّل من غير Vercel الإنتاجية "
                         "(نفق تجربة · نسخة معاينة · LAN) وإلا الـPOST مايخرجش.")
    ap.add_argument("--origin-suffix", action="append", default=[],
                    help="لاحقة مضيف https مسموحة، تبدأ بنقطة (مثلاً "
                         ".trycloudflare.com). للطيّار بس — اسم النفق السريع "
                         "بيتغيّر كل تشغيلة فالمطابقة الحرفية مابتنفعش.")
    ap.add_argument("--tunnel", action="store_true",
                    help="شغّل cloudflared لوحده وسجّل عنوانه في Supabase "
                         "(محتاج PLATE_SUPABASE_KEY) — فالتطبيق يلاقي "
                         "الخدمة بلا لزق يدوي في كل تليفون.")
    ap.add_argument("--cloudflared",
                    default=os.environ.get(
                        "CLOUDFLARED",
                        r"C:\Program Files (x86)\cloudflared\cloudflared.exe"),
                    help="مسار cloudflared.exe")
    ap.add_argument("--cpu", action="store_true", help="اجبر CPU (لابتوب بلا كارت)")
    ap.add_argument("--fp32", action="store_true",
                    help="بلا fp16 على CUDA (تطابق رقمي حرفي مع مسار التقييم fp32)")
    ap.add_argument("--log", default="", help="ملف JSONL لكل طلب (بيتعمل لو مش موجود)")
    ap.add_argument("--timeout", type=float, default=10.0,
                    help="ميزانية الطلب بالثواني (تحويل + استنتاج)")
    ap.add_argument("--max-bytes", type=int, default=8 * 1024 * 1024, dest="max_bytes",
                    help="أقصى حجم جسم الطلب (افتراضي ٨ ميجا؛ نبضة ٣ث ≈ ١٠ كيلو)")
    ap.add_argument("--max-seconds", type=float, default=30.0, dest="max_seconds",
                    help="أقصى مدّة صوت تتفرّغ (مستخلِص Whisper بيثبّت على ٣٠ث)")
    ap.add_argument("--max-inflight", type=int, default=4, dest="max_inflight",
                    help="أقصى طلبات جوّه (تنفيذ + طابور). فوقه ٥٠٣ فوراً.")
    ap.add_argument("--ffmpeg", default="", help="مسار ffmpeg (الافتراضي: PATH)")
    ap.add_argument("--training-dir", default="", dest="training_dir",
                    help="مجلد training/ (الافتراضي: جنب الريبو)")
    ap.add_argument("--save-audio", default="", dest="save_audio",
                    help="مجلد يحفظ فيه **المقطع اللي الموديل سمعه فعلاً** (WAV 16k مونو). "
                         "ليه؟ عشان بعد الجلسة نقدر نشغّل موديل تانٍ على نفس المقاطع "
                         "بالظبط ونقارن بلا تحميل موديلين في الذاكرة — وكمان صوت "
                         "متكلّم جديد = داتا تدريب.")
    ap.add_argument("--no-warmup", action="store_true",
                    help="ماتسخّنش (أول طلب هيبقى أبطأ ٢-٤ مرات)")
    return ap


def main(argv=None) -> int:
    ap = build_argparser()
    args = ap.parse_args(argv)
    t_boot = time.time()

    # ── تحقّق الإعداد: كل فشل هنا **خروج بكود مش صفر** قبل ما نفتح أي منفذ.
    if not args.token or len(args.token) < 12:
        print("❌ --token مطلوب (١٢ محرف على الأقل) أو متغيّر البيئة "
              "PLATE_JUDGE_TOKEN.\n"
              "   نفق Cloudflare بيدّي URL على الإنترنت المفتوح: بلا توكن أي حد "
              "يعرف العنوان\n"
              "   يشغّل كارتك، يغذّي ffmpeg بايتات مش موثوقة، ويلوّث قياس الطيّار.\n"
              "   سر عشوائي: python -c \"import secrets;print(secrets.token_urlsafe(32))\"",
              file=sys.stderr)
        return 2
    if not os.path.isdir(args.model):
        print(f"❌ مجلد الموديل مش موجود: {args.model}", file=sys.stderr)
        return 2
    if not os.path.isfile(os.path.join(args.model, "config.json")):
        print(f"❌ {args.model} مافيهوش config.json — ده مش مجلد موديل transformers.",
              file=sys.stderr)
        return 2
    if args.timeout <= 0 or args.max_bytes <= 0 or args.max_inflight <= 0:
        print("❌ --timeout / --max-bytes / --max-inflight لازم أكبر من صفر.",
              file=sys.stderr)
        return 2

    training_dir = args.training_dir or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "training")
    if not os.path.isdir(training_dir):
        print(f"❌ مجلد training مش موجود: {training_dir} (استعمل --training-dir)",
              file=sys.stderr)
        return 2
    try:
        ffmpeg = resolve_ffmpeg(args.ffmpeg or None)
        gate, _is_valid, THRESHOLDS, normalize_plate = import_project_modules(training_dir)
    except SystemExit as e:
        print(str(e), file=sys.stderr)
        return 2

    print(f"🔧 موديل: {args.model}")
    print(f"🔧 ffmpeg: {ffmpeg}")
    print(f"🔧 بوابة الثقة: {training_dir}\\plate_confidence.py  "
          f"(mean_logprob<{THRESHOLDS['mean_logprob_min']} · "
          f"no_speech>{THRESHOLDS['no_speech_prob_max']})")
    try:
        model = PlateModel(args.model, cpu=args.cpu, fp32=args.fp32)
    except Exception as e:
        print(f"❌ فشل تحميل الموديل: {type(e).__name__}: {e}", file=sys.stderr)
        return 3
    t_loaded = time.time()
    if not args.no_warmup:
        try:
            model.warmup()
        except Exception as e:
            print(f"⚠️ التسخين فشل (بكمّل): {type(e).__name__}: {e}", flush=True)
    cold = time.time() - t_boot
    print(f"✅ الموديل جاهز: {model.name}  جهاز={model.device}  dtype={model.dtype}")
    print(f"   تحميل {t_loaded - t_boot:.2f}ث · تسخين {time.time() - t_loaded:.2f}ث "
          f"· **بدء بارد إجمالي {cold:.2f}ث**")
    if model.device == "cuda":
        print(f"   VRAM: {model.vram()}")

    log = JsonlLog(args.log or None)
    svc = Service(args, model, gate, normalize_plate, ffmpeg, log, time.time(), cold)
    try:
        httpd = Server((args.host, args.port), Handler)
    except OSError as e:
        print(f"❌ مش قادر أفتح {args.host}:{args.port} — {e}", file=sys.stderr)
        return 4
    httpd.svc = svc
    httpd.timeout = None
    try:                       # nagle off: ردودنا صغيرة والتأجيل بيزوّد الزمن
        httpd.socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except Exception:
        pass

    print(f"\n🎙️  شغّال على http://{args.host}:{args.port}   (PID {os.getpid()})")
    print(f"    POST /transcribe  ·  GET /health  ·  GET /ping")
    print(f"    سجل: {log.path or '(مقفول — استعمل --log عشان الطيّار يطلّع قياس)'}")
    print(f"    سقف: {args.max_bytes // 1024} كيلو · ميزانية {args.timeout:.1f}ث · "
          f"جوّه {args.max_inflight}")
    print(f"    النفق: cloudflared tunnel --url http://127.0.0.1:{args.port}")
    # ⚠️ التحذيرين دول موجودين عشان استنتاج غلط حصل فعلاً: «الملف مش موجود ⇒
    #    الخدمة مستلمة صفر طلبات». الملف مش موجود لأن مافيش --log من الأصل،
    #    والمقاطع مش موجودة لأن مافيش --save-audio. الغياب **مش** دليل.
    if not log.path:
        print("⚠️  مافيش سجل: أي طلب بيوصل **مش** هيسيب أثر في أي ملف. "
              "شغّلها بـ--log وإلا غياب الملف مش دليل على غياب الطلبات.", flush=True)
    if not getattr(args, "save_audio", ""):
        print("ℹ️  مافيش حفظ مقاطع (--save-audio): مافيش أي wav هيتكتب في أي مجلد.", flush=True)
    print("    عدّاد الطلبات الواصلة (بما فيها ٤٠١/٤٠٤): GET /health → requests.total", flush=True)
    # ⚠️ الأصول مطبوعة بقصد: أكتر فشل مكلّف في الطيّار كان أصل مش في القايمة —
    #    الـpreflight بيترفض، الـPOST مايخرجش، وكل حاجة تبان سليمة.
    print(f"    أصول CORS المسموحة ({len(svc.origins)}): {', '.join(sorted(svc.origins))}")
    if svc.origin_suffixes:
        print(f"    لواحق مسموحة: {', '.join(svc.origin_suffixes)}")
    print("⚠️  التطبيق محمَّل من أصل مش في القايمة دي (نفق تجربة/معاينة/LAN)؟ "
          "الـPOST **مش هيخرج من التليفون** خالص. زوّد الأصل بـ--origin، "
          "وشوف الرفض لحظياً: سطر ⛔ هنا + /health → preflight.cors_blocked", flush=True)
    tunnel = start_tunnel(args.port, args.cloudflared) if args.tunnel else None
    print("    (Ctrl+C للإيقاف)", flush=True)
    try:
        httpd.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print("\n⏹ إيقاف…", flush=True)
    finally:
        httpd.shutdown()
        httpd.server_close()
        if tunnel:
            tunnel.terminate()
    print(f"📊 إجمالي {svc.n_total} طلب · مقبول {svc.n_ok} · مرفوض {svc.n_refused} "
          f"· أخطاء {svc.n_err}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

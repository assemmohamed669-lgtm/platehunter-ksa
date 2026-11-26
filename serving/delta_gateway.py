#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
 🗜️➕ delta_gateway — Voice PRO يبعت **الصوت الجديد بس**، والنافذة تتبني هنا
═══════════════════════════════════════════════════════════════════════
المالك (٢٦ نوفمبر ٢٠٢٦): «البرنامج بيستهلك انترنت كتير جدا … ٥٢ جيجا» ⇒ «نفذ انت دة امر مني اهم حاجه انه ميأثرش لا علي
السيرفر ولا علي المناديب ولا علي الشغل».

Voice PRO بيبعت نافذة ٥.٤ث كل ١.٥ث ⇒ كل ثانية صوت بتطلع ~٣.٦ مرة. هنا الموبايل بيبعت **الجزء اللي ماتبعتش قبل كده** بس
(خام ٢٤-بت FLAC)، والوسيط ده:
  ١. بيحفظ صوت الجلسة بأرقام عيّناته (`sid` + المدى المطلق [u, b))
  ٢. بيبني النافذة [a, b) **بنفس تعلية الموبايل بالظبط** (`normalizePeak` + `floatToPcm16` في lib/wav.ts)
  ٣. بيسلّمها WAV لسيرفر اللوحات الشغّال (127.0.0.1:8761/transcribe) **زي ما بيستلمها من الموبايل النهارده**، ويرجّع رده
     زي ما هو.

🔴 **مابيلمسش سيرفر اللوحات** — عملية لوحدها على 8790 (مسار ‎/d/‎ على نفق المجمّع). أي حاجة ناقصة ⇒ ٤٠٩ والموبايل بيبعت
النافذة كاملة على الطريق القديم (`lib/voiceDelta.ts`). وقع ⇒ الموبايل بيرجع للقديم لوحده.

المقيس (١٣٧ نافذة ميدانية): الطلب ~٣٤٪ من الـWAV (القديم المضغوط ٥٩٪)، والنافذة اللي بتتبني مختلفة عن بتاعة الموبايل في
~٠.١٢٪ من العيّنات بـ١/٣٢٧٦٨ (تقريب ٢٤-بت) — أصغر من فرق سيرفر اللوحات نفسه بين طلبين متطابقين (تجميع الكارت).

POST /d/transcribe?sid=&a=&b=&u=&rate=   ترويسة X-Plate-Token (نفس توكن المناديب) · جسم FLAC ٢٤-بت للعيّنات [u, b)
GET  /d/health
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np

try:
    import soundfile as sf
except Exception:  # الاختبارات المحلية بتحقن فك الترميز
    sf = None

TOKEN = os.environ.get("PLATE_JUDGE_TOKEN", "")
UPSTREAM = os.environ.get("DELTA_UPSTREAM", "http://127.0.0.1:8761/transcribe")
SCALE24 = 8388607.0
MAX_WINDOW_S = 10.0
KEEP_S = 150.0              # صوت الجلسة اللي بيتحفظ (النافذة ٥.٤ث — والإعادة بتبعت كامل أصلاً)
IDLE_S = 300.0              # جلسة سكتت ٥ دقايق ⇒ تتمسح
MAX_SESSIONS = 500
WAIT_MISSING_S = 1.5        # طلبين في نفس الوقت ممكن يوصلوا بالعكس ⇒ نستنى الجزء الناقص شوية
SID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

_DEFAULT_ORIGINS = [
    "https://platehunter-ksa.vercel.app",
    "capacitor://localhost", "ionic://localhost",
    "http://localhost", "https://localhost",
    "http://localhost:3000", "http://127.0.0.1:3000",
]
ALLOWED_ORIGINS = set(_DEFAULT_ORIGINS + [o.strip() for o in os.environ.get("SEG_ALLOWED_ORIGINS", "").split(",") if o.strip()])


# ═════════════════════════════════════════ نفس تعلية الموبايل بالظبط (lib/wav.ts)
def normalize_like_app(x32: np.ndarray) -> np.ndarray:
    """`normalizePeak(input, 0.97)` ثم `floatToPcm16` — نفس الحساب: الكسب double، التخزين float32، القصّ trunc."""
    x32 = np.asarray(x32, dtype=np.float32)
    peak = float(np.max(np.abs(x32))) if x32.size else 0.0
    if peak >= 0.0015 and 0.97 / peak > 1.02:
        y = (x32.astype(np.float64) * (0.97 / peak)).astype(np.float32)
    else:
        y = x32
    s = np.clip(y.astype(np.float64), -1.0, 1.0)
    return np.trunc(np.where(s < 0, s * 32768.0, s * 32767.0)).astype(np.int16)


def wav_bytes(pcm16: np.ndarray, rate: int) -> bytes:
    """نفس ترويسة `encodeWav` (٤٤ بايت، PCM ١٦-بت مونو)."""
    data = pcm16.astype("<i2").tobytes()
    h = bytearray()
    h += b"RIFF" + (36 + len(data)).to_bytes(4, "little") + b"WAVE"
    h += b"fmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + (1).to_bytes(2, "little")
    h += int(rate).to_bytes(4, "little") + int(rate * 2).to_bytes(4, "little")
    h += (2).to_bytes(2, "little") + (16).to_bytes(2, "little")
    h += b"data" + len(data).to_bytes(4, "little")
    return bytes(h) + data


def decode_int24(raw: bytes) -> tuple[np.ndarray, int]:
    """FLAC/WAV ٢٤-بت ⇒ قيم ٢٤-بت صحيحة (int32) + المعدل."""
    a, rate = sf.read(io.BytesIO(raw), dtype="int32", always_2d=False)
    if a.ndim > 1:
        raise ValueError("mono only")
    return (a.astype(np.int64) >> 8).astype(np.int32), int(rate)


# ═════════════════════════════════════════════════════════ صوت الجلسات
class Session:
    def __init__(self):
        self.segs: list[tuple[int, np.ndarray]] = []   # (بداية مطلقة، عيّنات int24) — مرتّبة ومن غير تداخل
        self.last = time.time()
        self.cond = threading.Condition()

    def add(self, start: int, arr: np.ndarray) -> None:
        with self.cond:
            self.last = time.time()
            end = start + len(arr)
            keep: list[tuple[int, np.ndarray]] = []
            for s, a in self.segs:
                e = s + len(a)
                if e <= start or s >= end:
                    keep.append((s, a))
                    continue
                # الجديد بيغطّي جزء — نسيب اللي برّه بس (العيّنات نفسها في الحالتين)
                if s < start:
                    keep.append((s, a[: start - s]))
                if e > end:
                    keep.append((end, a[end - s:]))
            keep.append((start, arr))
            keep.sort(key=lambda t: t[0])
            # نلزق المتلاصق ونرمي القديم
            merged: list[tuple[int, np.ndarray]] = []
            for s, a in keep:
                if merged and merged[-1][0] + len(merged[-1][1]) == s:
                    ps, pa = merged[-1]
                    merged[-1] = (ps, np.concatenate([pa, a]))
                else:
                    merged.append((s, a))
            self.segs = merged
            self.cond.notify_all()

    def trim(self, rate: int) -> None:
        with self.cond:
            if not self.segs:
                return
            newest = self.segs[-1][0] + len(self.segs[-1][1])
            floor_ = newest - int(KEEP_S * rate)
            out = []
            for s, a in self.segs:
                e = s + len(a)
                if e <= floor_:
                    continue
                if s < floor_:
                    a, s = a[floor_ - s:], floor_
                out.append((s, a))
            self.segs = out

    def get(self, a: int, b: int) -> np.ndarray | None:
        for s, arr in self.segs:
            if s <= a and s + len(arr) >= b:
                return arr[a - s: b - s]
        return None

    def wait_get(self, a: int, b: int, timeout: float) -> np.ndarray | None:
        deadline = time.time() + timeout
        with self.cond:
            while True:
                got = self.get(a, b)
                if got is not None:
                    return got.copy()
                left = deadline - time.time()
                if left <= 0:
                    return None
                self.cond.wait(left)


SESSIONS: dict[str, Session] = {}
S_LOCK = threading.Lock()
STATS = {"req": 0, "served": 0, "missing": 0, "bad": 0, "up_err": 0, "bytes_in": 0, "bytes_win": 0}


def session(sid: str) -> Session:
    with S_LOCK:
        s = SESSIONS.get(sid)
        if s is None:
            if len(SESSIONS) >= MAX_SESSIONS:
                oldest = min(SESSIONS, key=lambda k: SESSIONS[k].last)
                SESSIONS.pop(oldest, None)
            s = SESSIONS[sid] = Session()
        return s


def sweeper() -> None:
    while True:
        time.sleep(30)
        now = time.time()
        with S_LOCK:
            for k in [k for k, v in SESSIONS.items() if now - v.last > IDLE_S]:
                SESSIONS.pop(k, None)


def build_window(sess: Session, a: int, b: int, rate: int, wait_s: float = WAIT_MISSING_S) -> bytes | None:
    raw = sess.wait_get(a, b, wait_s)
    if raw is None:
        return None
    x32 = (raw.astype(np.float64) / SCALE24).astype(np.float32)
    return wav_bytes(normalize_like_app(x32), rate)


# ═════════════════════════════════════════════════════════════ HTTP
def forward(wav: bytes, token: str, agent: str, timeout: float = 30.0) -> tuple[int, bytes]:
    headers = {"Content-Type": "audio/wav", "X-Plate-Token": token}
    if agent:
        headers["X-Agent-Id"] = agent
    req = urllib.request.Request(UPSTREAM, data=wav, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _cors(self):
        o = self.headers.get("Origin", "")
        if o and o in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "X-Plate-Token, Content-Type, X-Agent-Id")
            self.send_header("Access-Control-Max-Age", "86400")

    def _send(self, code: int, body: bytes, ctype: str = "application/json; charset=utf-8"):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Delta", "1")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/d/health":
            with S_LOCK:
                n = len(SESSIONS)
            return self._json(200, {"ok": True, "sessions": n, **STATS})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        p = urlparse(self.path)
        n = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(n) if n else b""
        if p.path != "/d/transcribe":
            return self._json(404, {"error": "not found"})
        STATS["req"] += 1
        if not TOKEN or self.headers.get("X-Plate-Token", "") != TOKEN:
            return self._json(401, {"error": "bad token"})
        q = parse_qs(p.query)
        try:
            sid = q["sid"][0]
            a, b, u, rate = (int(q[k][0]) for k in ("a", "b", "u", "rate"))
            if not SID_RE.match(sid) or not (0 <= a <= u <= b) or not (8000 <= rate <= 48000):
                raise ValueError("range")
            if b - a > MAX_WINDOW_S * rate or b == a:
                raise ValueError("window")
        except Exception:
            STATS["bad"] += 1
            return self._json(400, {"error": "bad params"})
        sess = session(sid)
        if b > u:
            try:
                arr, r2 = decode_int24(raw)
            except Exception:
                STATS["bad"] += 1
                return self._json(400, {"error": "bad audio"})
            if r2 != rate or len(arr) != b - u:
                STATS["bad"] += 1
                return self._json(400, {"error": "length mismatch"})
            STATS["bytes_in"] += len(raw)
            sess.add(u, arr)
            sess.trim(rate)
        wav = build_window(sess, a, b, rate)
        if wav is None:
            STATS["missing"] += 1
            return self._json(409, {"error": "missing"})
        STATS["bytes_win"] += len(wav)
        try:
            code, body = forward(wav, self.headers.get("X-Plate-Token", ""), self.headers.get("X-Agent-Id", ""))
        except Exception:
            STATS["up_err"] += 1
            return self._json(502, {"error": "upstream"})
        if code == 200:
            STATS["served"] += 1
        else:
            STATS["up_err"] += 1
        return self._send(code, body)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    if not TOKEN:
        print("❌ PLATE_JUDGE_TOKEN مش موجود", flush=True)
        sys.exit(1)
    threading.Thread(target=sweeper, daemon=True).start()
    print(f"🗜️ delta_gateway على {a.host}:{a.port} ⇒ {UPSTREAM}", flush=True)
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

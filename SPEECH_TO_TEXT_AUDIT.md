# PlateHunter KSA — Speech-to-Text System: Complete Technical Audit
**تقرير مراجعة تقنية شاملة لنظام تحويل الصوت إلى نص (تفريغ اللوحات)**

> Read-only audit. No code was modified. Generated from the current `main` branch (commit `21162fa`, 2026-07-21).
> Files reviewed: `lib/plateParser.ts`, `lib/sessionParser.ts`, `lib/audioGate.ts`, `lib/speechmaticsRT.ts`, `lib/deepgramKey.ts`, `lib/voiceKeys.ts`, `lib/sharedVoiceKey.ts`, `lib/structuredPlates.ts`, `lib/plateCorrection.ts`, `lib/plateCorrectionsSync.ts`, `lib/dictionaries/saudiPlateLetters.ts`, `app/api/transcribe`, `app/api/reanalyze`, `app/api/structure-plates`, `app/api/read-plate`, `app/api/elevenlabs-test`, `app/api/groq-test`, `app/(app)/registration/page.tsx`, `app/(app)/instant-check/page.tsx`, `app/test-speech/page.tsx`.

---

## ملخّص تنفيذي (Arabic Executive Summary)

نظامك **مش نظام STT عادي** — هو في الحقيقة **محرك تفريغ عام (cloud ASR) + طبقة معالجة لغوية عربية ضخمة ومصمّمة يدوياً خصيصاً للوحات السعودية باللهجة المصرية**. القوة الحقيقية مش في التعرّف على الصوت نفسه (ده بتعمله خدمات جاهزة: Whisper / Deepgram / Speechmatics)، القوة في **`plateParser.ts` (2014 سطر)** اللي بيصلّح، يطبّع، يفصل لوحات متعددة، ويتعلّم من أخطائه.

**أقوى ٣ نقاط:** الفهم العربي (قاموس نطق + خرائط التباس + جيرة صوتية)، محرك استخراج اللوحات (atom-based + carry-over + تثبيت على المطلوبين)، والتعلّم الذاتي المشترك بين المناديب.

**أضعف ٣ نقاط:** (١) الـ VAD مبنيّ لكنه **مش بيقفل إرسال الصوت فعلياً** (بيرسل حتى في الصمت)؛ (٢) **مفيش ensemble** — المحركات حصرية واحد بس، مع إن دمج محركين هيرفع الدقة كتير؛ (٣) **مفيش decoding مقيّد بقواعد اللوحة** ولا **N-best rescoring** من محركات السحابة — التصحيح كله بيحصل *بعد* التفريغ، مش أثناءه.

التقييم الكلي: **7.0 / 10** لنظام إنتاجي شغّال، لكن فيه مساحة واضحة للقفز لـ 9+ بتحسينات محدّدة (تفاصيلها في القسم ١٠ و١١).

---

# 1. Complete Architecture — المعمارية الكاملة

## 1.1 The full pipeline (microphone → extracted plate)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MICROPHONE                                                                   │
│  navigator.mediaDevices.getUserMedia({ audio: true })   ← NO constraints      │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                     │
      ┌──────────────────────────────┴───────────────────────────────┐
      │                    ENGINE CASCADE (first that works wins)      │
      │  registration: Groq-raw → Speechmatics → Deepgram → Groq-chunk │
      │                 → native Capacitor SR → Web Speech API         │
      │  instant-check: Speechmatics → Deepgram → Groq-Whisper(native) │
      │                 → native Capacitor SR → Web Speech API         │
      └──────────────────────────────┬───────────────────────────────┘
                                     │
   ┌─────────────────────┬───────────┴───────────┬────────────────────────┐
   │   STREAMING          │   RECORD-THEN-UPLOAD  │   ON-DEVICE RECOGNIZER  │
   │   Deepgram WS        │   Groq Whisper (batch)│   Capacitor SR (ar-SA)  │
   │   Speechmatics WS    │   ElevenLabs Scribe   │   Web Speech (ar-SA)    │
   │   (PCM/WebM stream)  │   (WebM/AAC upload)   │   (returns TEXT + N-best)│
   └─────────┬───────────┴───────────┬───────────┴────────────┬───────────┘
             │                        │                        │
             │           ┌────────────▼────────────┐           │
             │           │  /api/transcribe (Node)  │           │
             │           │  1. ffmpeg cleanAudio:   │           │
             │           │     highpass=80,dynaudnorm│          │
             │           │     mono, AAC 96k, →m4a  │           │
             │           │  2. Groq whisper-large-v3│           │
             │           │     lang=ar, temp=0,     │           │
             │           │     prompt=dictation style│          │
             │           │     response=verbose_json │          │
             │           │  3. drop segments where   │          │
             │           │     no_speech_prob > 0.7  │          │
             │           └────────────┬─────────────┘           │
             │                        │                          │
             └────────────────────────┼──────────────────────────┘
                                      │  raw transcript text
                                      ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  ARABIC NORMALIZATION + PLATE EXTRACTION  (lib/plateParser.ts)          │
   │  Step 1  removeDiacritics (تشكيل)                                       │
   │  Step 1b punctuation → space; ZERO_WORD_RE (زير/زيرو → 0)               │
   │  Step 2  alef/ya unification (أإآ→ا, ى→ي); protect واو letter-name       │
   │  Step 3  LETTER_NAMES map (دال→د, صاد→ص …)                              │
   │  Step 4  PHONETIC_MERGES (حابة علامة→ح ب ل, ياسين→ي س …)                 │
   │  Step 5  SPOKEN_NUMBERS (خمسة→5, ثلاثة عشر→13, ألفين→2000, تلات خمسات→555)│
   │  Step 6  bare ه → هـ  (AFTER word maps); Arabic-Indic ٥→5               │
   │  Step 7  tokenize → PlateAtoms (L/D/V/N)                                │
   │  Step 8  و-conjunction digit-join heuristic (6 و 1 → 61)                │
   │  Step 9  group digits into 4-digit chunks; scan back for ≤3 letters     │
   │  Step 10 assign vehicle types + notes to nearest plate                  │
   │  Step 11 fold letters-less digit orphans into nearest plate's notes     │
   └───────────────────────────────────┬───────────────────────────────────┘
                                        │  MultiPlateResult[] (plate, uncertain, rawLetterSource)
                                        ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  SESSION STATE MACHINE  (lib/sessionParser.ts)                          │
   │  • carry-over: plate split across chunk boundary migrates forward       │
   │  • note context: "جراج يمين" applies to ALL following plates            │
   │  • append-only records                                                   │
   └───────────────────────────────────┬───────────────────────────────────┘
                                        │
                                        ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  POST-PROCESSING / CORRECTION LAYER                                     │
   │  1. applyWordBlend(rawLetterSource)   ← whole-fragment learned fix      │
   │  2. applyLetterConfusions(plate)       ← per-letter learned fix (local  │
   │                                           + shared team map, merged)    │
   │  3. anchorPlateToWanted(plate, index)  ← snap throat-letter to wanted   │
   │                                           list if digits match (ح↔ه…)   │
   │  4. plateNeedsReview() → uncertain flag → "راجع" badge                  │
   └───────────────────────────────────┬───────────────────────────────────┘
                                        │
                                        ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  MATCH + PERSIST                                                        │
   │  instant-check: searchInCheck → exact O(1) Map, else fuzzy ≥88%         │
   │                 → fireWantedAlert (war-siren overlay)                    │
   │  registration:  saveRecording (IndexedDB) + checkPlateMatch             │
   │  Optional 2nd pass: /api/reanalyze (re-transcribe full audio + llama    │
   │                     structuring → {plate, vehicleType, notes})          │
   └───────────────────────────────────────────────────────────────────────┘
```

## 1.2 Two independent voice surfaces

| Page | Purpose | Primary engine | Extraction entry | Output |
|------|---------|----------------|------------------|--------|
| `/registration` | Field dictation of many plates into a session (append-only records) | **Groq record-then-analyze** (if Groq key present), else Speechmatics → Deepgram → … | `parseSessionChunk` (live) / `extractPlates` (batch) | Saved recordings + optional "تحليل ذكي" reanalyze |
| `/instant-check` | Push-to-talk lookup against the loaded check file | **Deepgram streaming** (overrides selected engine — "live by nature") | `processWhisperText`→`parseSessionChunk`, or `addPttResult`→`mapEgyptianSpeech` | Instant wanted/not-wanted alert |

Both share the same parser, the same learned-correction maps (`ph:registration:letterConfusions`, `ph:registration:wordBlends`), and the same `audioGate` VAD.

---

# 2. Technologies Used — التقنيات المستخدمة

### Speech recognition engines (STT)
| Engine | Model | Mode | Where | Key ownership |
|--------|-------|------|-------|---------------|
| **Groq Whisper** | `whisper-large-v3` (NOT turbo — deliberate accuracy-over-speed) | Batch (record → upload) | `/api/transcribe`, `/api/reanalyze` | Agent's own Groq key (`ph:registration:groqApiKey`) |
| **Deepgram** | `nova-3`, `language=ar` | Streaming WebSocket | both pages | Agent key / shared super-admin key |
| **Speechmatics** | `operating_point=enhanced`, `ar` | Streaming WebSocket (PCM16) | both pages | Agent key, JWT minted client-side |
| **ElevenLabs Scribe** | `scribe_v1`, `language_code=ar` | Batch | `/api/reanalyze` only | Admin-set key |
| **Web Speech API** | browser native (`webkitSpeechRecognition`) | On-device | fallback | — |
| **Capacitor SR** | `@capacitor-community/speech-recognition` `lang=ar-SA` | On-device (Android) | fallback | — |

### Vision / OCR (camera path, adjacent to voice)
- **Groq vision** `qwen/qwen3.6-27b` (`reasoning_effort:"none"`) — `/api/read-plate`.
- **On-device `TextDetector`** (Chrome/Android ML Kit) — fallback in `instant-check`.
- **tesseract.js 5.1** — listed in `package.json` (available; used in image paths).

### Audio processing
- **ffmpeg-static** (server, Node runtime) — `highpass=f=80,dynaudnorm`, mono, AAC 96k, remux raw-AAC→m4a.
- **@ffmpeg/ffmpeg + @ffmpeg/util** (ffmpeg.wasm, client) — re-encode oversized uploads to mono 64k AAC, CDN-loaded core v0.12.10.
- **Web Audio API** (`AudioContext` + `AnalyserNode`, `fftSize=512`) — VAD/level meter in `lib/audioGate.ts`.
- **MediaRecorder** — capture (`audio/webm;codecs=opus` preferred).
- **@independo/capacitor-voice-recorder** — native ADTS-AAC capture on Android.

### LLM structuring / correction
- **Groq `llama-3.3-70b-versatile`** (`temperature:0`, `response_format:json_object`) — `/api/structure-plates` and inside `/api/reanalyze`, turns a full transcript into `{plate, vehicleType, notes}` rows.
- **@anthropic-ai/sdk** and **openai** SDKs present in `package.json`.

### Platform / infra
Next.js 14 (App Router) · TypeScript · Capacitor 8 · Supabase (auth + `plate_corrections` + `app_settings` shared-key RPCs) · IndexedDB (`lib/idb.ts`) · localStorage · Vercel (Node runtime for `/api` routes) · Vitest.

---

# 3. Audio Recording — التسجيل الصوتي

| Aspect | Value | Source |
|--------|-------|--------|
| **Recording libraries** | `MediaRecorder` (web), `@independo/capacitor-voice-recorder` (native), Web Audio (VAD only) | registration/instant-check |
| **Requested MIME** | `audio/webm;codecs=opus` → `audio/webm` → `audio/ogg;codecs=opus` → (`audio/mp4` in one path). Native = ADTS `audio/aac` | reg:1877, ic:1730 |
| **Codec** | Opus (WebM) on web; AAC (ADTS) on native Android | — |
| **Sample rate** | **Not set** on capture (browser default, usually 48 kHz). Speechmatics requests `AudioContext({sampleRate:16000})` and sends the actual context rate | speechmaticsRT:79 |
| **Channels** | **Not set** on capture. Server downmixes to mono (`-ac 1`) before Whisper | transcribe:102 |
| **Bitrate** | Not set on capture. Server re-encodes AAC **96 kbps**; client ffmpeg.wasm path **64 kbps** | transcribe:103 |
| **Chunk duration** | Streaming: `MediaRecorder.start(250)` → 250 ms. Groq native chunk: **90 s** (`GROQ_CHUNK_MS`). Groq-live segment cap: 20 s (dead code). Whisper PTT chunk: **7 s** | multiple |
| **VAD (Voice Activity Detection)** | ✅ `lib/audioGate.ts` — RMS vs **adaptive** noise floor. Opts: `hangoverMs:1800, factor:2.2, minEnergy:0.008, floorAttack:0.02, floorRelease:0.2` | audioGate:30 |
| **Noise reduction** | Server ffmpeg `highpass=f=80` (cuts rumble/wind) + `dynaudnorm` (loudness). **Deliberately NO denoise/low-pass** — protects fricatives س/ص/ش | transcribe:82-88 |
| **Audio preprocessing** | Server: remux raw-AAC→m4a (Groq rejects bare ADTS); MIME alias table (`x-wav`→`wav` …). Client: none | transcribe:40-111 |

### ⚠️ Recording findings
1. **`getUserMedia({ audio: true })` sets NO constraints anywhere** — `echoCancellation`, `noiseSuppression`, `autoGainControl`, `sampleRate`, `channelCount` are all left to browser defaults (reg:1670/1824/1881, ic:1734). For a noisy field environment this is an untuned lever.
2. **The VAD does not gate the transmitted byte stream.** In both Deepgram paths every 250 ms chunk is `ws.send`-ed unconditionally; the gate only (a) suppresses `KeepAlive` frames during silence and (b) drives the mic indicator. The `audioGate.ts` header comment claims silence isn't sent — that is **not** what the wiring does (reg:1928-1966, ic:1770-1797). So the "don't bill silence" goal is only partly met (KeepAlive is suppressed, but audio still streams).
3. **Whisper input isn't resampled to 16 kHz.** Whisper operates internally at 16 kHz mono; you send AAC 96k at the capture rate. Not wrong, but not optimized.

---

# 4. Speech-to-Text Engine — محرك التفريغ

### Groq Whisper (`/api/transcribe`) — the accuracy anchor
| Param | Value |
|-------|-------|
| Model | `whisper-large-v3` (explicitly not `-turbo`) |
| Language | `ar` |
| Temperature | `0` (greedy/deterministic) |
| Prompt | Dictation-style exemplar (see below) — placed to exploit Whisper's "last ~224 tokens" prompt window; balances ح/ه, forbids summarizing repeated digits |
| Response format | `verbose_json` (exposes per-segment `no_speech_prob`) |
| Hallucination guard | Drop any segment with `no_speech_prob > 0.7` |
| Timeout | None explicit on the Groq fetch |
| Retry | `uploadGroqChunk` retries **once** on network throw (1500 ms delay); does NOT retry on Groq error responses |
| Format-error handling | Detects `unsupported_format` → client re-encodes via ffmpeg.wasm and retries |

The Whisper prompt (transcribe:185): *"إملاء لوحة سيارة سعودية، مأمور مصري، كل حرف كلمة منفصلة… حه غير هه، سين غير صاد، قاف غير كاف، دال غير طاء، عين غير ألف."* — a **soft prior**, not an instruction; the wanted-list anchor is the authoritative net.

### Deepgram (streaming) — the low-latency path
`wss://api.deepgram.com/v1/listen` with:
`model=nova-3`, `language=ar`, `interim_results=true`, `smart_format=false`, `punctuate=false`, `numerals=true`, `endpointing=300` (registration) / `endpointing=100` (instant-check), plus one `keyterm=` per Saudi letter name (`PLATE_LETTER_KEYTERMS`, 17 entries). Auth via WebSocket subprotocol `["token", KEY]`. Only `is_final` transcripts are committed. Instant-check auto-reconnects up to 5× (1200 ms); registration does not auto-reconnect.

### Speechmatics (streaming) — PCM path
JWT minted client-side from the master key (`ttl:3600`). Audio = raw `pcm_s16le` at the actual `AudioContext` rate via a `ScriptProcessor(4096)`. `transcription_config`: `operating_point=enhanced`, `enable_partials=true`, `max_delay=4`, `max_delay_mode=flexible`, `punctuation_overrides.permitted_marks=[]`. Transcript is read from `metadata.transcript` (a fixed historical bug).

### ElevenLabs Scribe — reanalyze only
`scribe_v1`, `language_code=ar`, server-side in `/api/reanalyze`; falls back to Groq on failure. A separate `/api/elevenlabs-test` does rich key diagnostics (10 s timeout, full error classification).

### On-device (fallback)
`lang=ar-SA`, `maxResults/maxAlternatives=5`. This is the **only** path that returns N-best alternatives + per-alt confidence, consumed by `pickBestHypothesis`.

### ⚠️ STT engine findings
- **Config drift between pages:** `endpointing` is 300 ms (registration) vs 100 ms (instant-check); Deepgram language is `ar` here but comments elsewhere reference `ar-EG`/`ar-SA`. Intentional per-page, but undocumented and easy to regress.
- **`elevenlabs` is selectable in `voiceKeys` but has no code path in instant-check's `startPtt()`** — selecting it silently falls back to Deepgram/native/web.
- **Dead code:** `startGroqLiveRecording`/`startGroqLiveSegment`/`transcribeSegmentLive` in registration (VAD-segmented near-live Groq) are never called; only `startRawRecording` runs for Groq.

---

# 5. Arabic Processing — المعالجة العربية

This is the system's strongest layer. Every step is a **pure, unit-tested function** in `lib/plateParser.ts` + `lib/dictionaries/saudiPlateLetters.ts`.

### 5.1 Letter normalization
- **Diacritics** stripped (`removeDiacritics`, range `ً-ٰٟ`).
- **Alef variants** `أ إ آ → ا`; **alef maqsura** `ى → ي`; **tatweel** `ـ` stripped.
- **`ه → هـ`** rewrite runs **after** word maps (critical ordering — running earlier corrupts "هاء" and heh-final numbers like "ميه"/100).
- **Letter names → char** (`LETTER_NAMES`, longest-first): `دال→د`, `صاد→ص`, `قاف→ق`, incl. Egyptian glottal-stop quirk `آف/اف→ق`, and `الـ`-prefixed forms (`النون→ن`).
- **English → Arabic** (`EN_TO_AR` / `LATIN_TO_ARABIC`) for bank lists (`N→ن`, `K→ك`, `Z→م` …). Note the documented ⚠️ that `م`'s Latin is `Z` (needs one real-plate confirmation).

### 5.2 Number normalization
- **Arabic-Indic** `٠-٩ → 0-9`.
- **Spoken numbers** (`SPOKEN_NUMBERS`, longest-first so multi-word wins): 0-9, 10-19, tens, hundreds, thousands, **و-prefixed compounds** (`خمسة وعشرين→25`, `ألف ومئة→1100`).
- **Whisper summarization quirks captured explicitly:** `تلات خمسات→555`, `تلات اصفار→000` — a genuinely clever domain observation.
- **Arabized "zero" family** `زير/زيرو/زيرة/زيره/زيرا/زيرى → 0` via `ZERO_WORD_RE` (lookbehind/ahead keep "وزير"/minister safe).

### 5.3 Dialect handling
- **`EGYPTIAN_LETTERS`** map: short Egyptian pronunciations (`حه→ح`, `به→ب`, `ره→ر`) + Gulf/MSA forms.
- **`COMMON_LETTER_MISTAKES`** (confidence-tagged): the engine's *spelling* errors, e.g. `سعد→ص` (Whisper's favorite mis-spell of صاد), `خاء→ح`, `غين→ع`, `طه→ط`.
- Egyptian glottal-stop for ق → heard as آف → mapped to ق.

### 5.4 Spoken numbers → digits
Handled two ways: token-level (`mapEgyptianSpeech`, per-word) for letter-by-letter dictation, and phrase-level (`replaceAll(SPOKEN_NUMBERS)`) for compounds. The atom parser then concatenates single digits (`5 9 3 2 → 5932`) but *sums* when any token ≥10 (`5 + 20 → 25`).

### 5.5 Fuzzy matching
- `levenshtein` (two-row, module-level buffers, O(n) space) + `similarityPercent`.
- **First-char bucketing** optimization: at ≥88% on 7-char plates, a first-char edit scores 85.7% < threshold, so bucketing by first char is safe and fast.
- Note-phrase matching uses edit-distance ≤1 tolerance (`anchorEq`, `matchDirection`).

### 5.6 Dictionary replacement
- `LETTER_NAMES`, `PHONETIC_MERGES`, `SPOKEN_NUMBERS`, `NOTE_KEYWORDS`, `VEHICLE_TYPES` — all whole-word matched via `replaceAll` with Arabic-boundary lookaround (prevents "با" eating "دبا").
- `NOTE_KEYWORDS` protects direction words made of valid letters (`يمين=ي م ي ن`, `يسار=ي س ا ر`) from being salvaged into plates.

### 5.7 Confusion maps
- **`CONFUSION_CLASS`** (throat/near pairs): ح↔ه, س↔ص, ق↔ك, د↔ط — used only by the wanted-list anchor.
- **`PHONETIC_NEIGHBOR_GROUPS`** (8 groups incl. ح/ه, س/ص, ق/ك, د/ط, ا/ع, ب/م, ن/ل, و/ر).
- **`LetterConfusionMap`** (learned, per-letter) + **`WordBlendMap`** (learned, whole-fragment) — see §7.

### 5.8 Custom rules (notable ones)
- `PHONETIC_MERGES` scoped to whole 2-word phrases only (`حابة علامة→ح ب ل`) because `علامة`/`حابة` are legit note words.
- `واو` letter-name protected with a Latin placeholder `__WAWNAME__` so it survives the collapse to bare `و` and can be told apart from the conjunction و.
- `ألف` → `1000` only when followed by و in number context; otherwise → letter ا.

---

# 6. Plate Parsing Engine — محرك استخراج اللوحات

The Saudi plate grammar is **fixed: exactly 3 Arabic letters + 4 digits**, letters ∈ `ابحدرسصطعقكلمنهوي`.

### 6.1 Grammar & atom model
`plateAtoms()` classifies every token into ordered atoms:
- `L` = single plate letter (with `fromName` flag for explicit واو),
- `D` = single digit (with `joinedByWaw` flag),
- `V` = vehicle type,
- `N` = note word (carries best-effort `letters[]`).

### 6.2 Assembly rules (`platesFromAtoms`, Steps 3-6)
1. **Anchor on digit runs**, split into 4-digit chunks (so back-to-back plate numbers each become a plate).
2. **Scan backward** ≤3 adjacent `L` atoms per digit group (bounded by previous group).
3. **Salvage:** if no clean letters, fall back to a garbled `N` word's best-effort letters (marked `uncertain`), and keep pulling clean `L` atoms stranded before the garbled word.
4. **و-conjunction join:** a standalone و between two digit atoms joins them if the result ≤4 digits (`6 و 1 و 2 و 1 → 6121`); flagged `joinedByWaw` → `uncertain`.
5. **Assign leftovers:** vehicle → nearest preceding plate; notes → preceding (trailing) else following (leading).
6. **Orphan fold:** a digit group with NO letters is never a plate (agents never dictate a bare number) → folded into nearest lettered plate's notes.

### 6.3 Regex / fallbacks (`parsePlateFromTranscript`, Steps 9-11)
- **Token scan** (primary): find digits, scan back ≤3 letters, then forward.
- **Regex fallback** (Step 10): `([ء-ي]{1,3})\s*(\d{1,4})` or the reverse — marked `uncertain`.
- **Char-extraction fallback** (Step 11): first digit run + preceding Arabic chars.
- Digits zero-padded to 4 (`حكل80 → حكل0080`).

### 6.4 Validation
- `isStrictPlate` (structuredPlates): exactly 3 valid letters + 4 digits.
- `plateNeedsReview`: flags empty, digits-only, letters-only, >3 letters, >4 digits, or an invalid letter → `uncertain`/"راجع" badge.
- `normalizePlate`: handles reversed plates (`5052حبك → حبك5052`), strips non-plate chars, pads to 4.

### 6.5 Multi-plate parsing
- `extractMultiplePlates` / `platesFromAtoms` split one utterance into many plates.
- `sessionParser` adds **carry-over** (a plate cut on a chunk boundary migrates to the next chunk — "صفر فقد على الحدود") and **forward note context** ("جراج يمين" applies to all subsequent plates until a new note).

### 6.6 Plate confidence
There is **no numeric plate confidence score**. Confidence is expressed as a **boolean `uncertain`** flag, set when: letters salvaged from a garbled word, letter overflow (>3 dictated), و-join guess, digits <4, an auto-correction changed the plate, `plateNeedsReview` true, or a wanted-anchor correction/ambiguity. `plateContentScore` (a heuristic 0..n) exists but is used only to *pick among hypotheses*, not stored.

---

# 7. Post Processing — المعالجة اللاحقة

Order of corrections applied at save time (`applySessionText` / `addOnePttRow`):

1. **Word-blend correction** — `applyWordBlend(rawLetterSource, merged)`: if the letters came from a guess, replace the whole garbled fragment with a learned mapping. Threshold: seen ≥2× AND ≥70% dominance.
2. **Letter-confusion correction** — `applyLetterConfusions(plate, merged)`: per-letter substitution learned from user edits. Same ≥2×/≥70% safety.
   - Both maps are `mergeCountMaps(localMap, sharedTeamMap)` — **local device learning + shared server learning combined**.
3. **Wanted-list anchor** — `anchorPlateToWanted(plate, wantedIndex)`: if the 4 digits match a wanted plate and the letters differ by exactly one *confusable* letter (ح↔ه, س↔ص, ق↔ك, د↔ط) with a single candidate → snap to it (marks `uncertain`, keeps `originalPlate`). Ambiguous → flag, don't correct. **Never invents a plate not in the list.** Deliberately does NOT feed the global confusion dictionary (avoids a feedback loop).
4. **Review flagging** — `plateNeedsReview` → `uncertain` → orange "راجع" badge.

### Learning loop (self-improving)
- Corrections are learned **only from manual table edits** (a typo ≠ a mishearing distinction is enforced): `diffLetterCorrections` → `recordLetterCorrections` (single-letter drift) or `recordWordBlend` (whole group changed).
- Persisted locally (`ph:registration:letterConfusions`, `ph:registration:wordBlends`) **and** pushed to the server via `pushCorrection` → Supabase RPC `bump_plate_correction` (atomic counter), with an offline queue (`flushPendingCorrections`, max 500). Read on mount via `fetchSharedCorrections`.
- `lib/plateCorrection.ts` provides an alternate **known-DB correction** (`correctPlate`/`buildPlateIndex`): index known plates by their 4 digits, snap ASR letters to the single candidate exactly one edit away.

### Second-pass "تحليل ذكي" (`/api/reanalyze`)
Re-transcribes the **full session audio** (no chunk-boundary errors) with the selected engine, then either (a) runs it through the local `extractPlates` (auto-save path — parser is more accurate on letters than the LLM) or (b) sends to Groq `llama-3.3-70b-versatile` for `{plate, vehicleType, notes}` structuring with forward-note context, validated to 3+4 on the server.

---

# 8. AI Logic — منطق الذكاء الاصطناعي

Every AI-based decision in the app:

| # | Decision | Model / method | Where |
|---|----------|----------------|-------|
| 1 | **Transcribe speech → text** | Whisper large-v3 / Deepgram nova-3 / Speechmatics enhanced / ElevenLabs scribe | STT layer |
| 2 | **Bias the decoder toward plate vocab** | Whisper `prompt` exemplar; Deepgram `keyterm` (17 letter names) | prompts |
| 3 | **Reject hallucinated speech** | `no_speech_prob > 0.7` segment drop | transcribe |
| 4 | **Pick best hypothesis among N-best** | `pickBestHypothesis` + `plateContentScore` heuristic (+ Web-SR confidence tiebreak) | plateParser |
| 5 | **Structure a transcript into rows** | Groq `llama-3.3-70b-versatile`, temp 0, JSON mode, forward-note-context prompt | structure-plates / reanalyze |
| 6 | **Correct plate letters from learning** | statistical confusion/blend maps (≥2×, ≥70% dominance) | plateParser |
| 7 | **Snap to wanted list** | deterministic confusable-pair anchor | plateParser |
| 8 | **Camera OCR (adjacent)** | Groq vision `qwen/qwen3.6-27b` + on-device `TextDetector` + tesseract.js | read-plate |
| 9 | **Detect plate column in a sheet** | content-based statistical detection (`detectPlateColumnByContent`) | plateParser |

**Key architectural stance:** the AI (cloud ASR/LLM) is treated as *fallible input*; the deterministic Arabic + grammar + wanted-list layers are the *authority*. That's a sound design for high-stakes plate data.

---

# 9. Performance — الأداء

### Bottlenecks
1. **`/api/transcribe` ffmpeg pass** — spawns an ffmpeg process per chunk (highpass+dynaudnorm+AAC encode), writes/reads temp files. On Vercel cold starts this is the dominant latency for the batch paths.
2. **Whisper large-v3** — deliberately the slow, accurate model (turbo rejected). Fine for record-then-analyze, adds latency to the near-live path.
3. **Registration now defaults to record-then-analyze** when a Groq key exists — accuracy up, *perceived latency up* vs streaming.
4. **Serial session queue** — parse+save run in speech order (`sessionQueueRef` promise chain). Correct for context, but a slow save stalls the chain.

### Expensive operations
- Fuzzy matching is **O(index size)** per lookup, mitigated by first-char bucketing and **capped: skipped entirely when the exact map > 50,000 entries** (`matchChunkAgainstIndex`, `matchReferralAgainstData`). Large data files silently lose fuzzy matching — a documented trade-off.
- `similarityPercent`/`levenshtein` reuse module-level buffers (no per-call allocation) — well optimized.

### Memory
- Full-session audio kept in memory as base64 for "تحليل ذكي" (`dgChunksRef`, `lastSessionAudioRef`) — a long session holds the whole recording in RAM + base64 (≈1.33× inflation).
- IndexedDB for recordings + uploaded files; audio base64 attached to **only the first record** of a chunk to limit bloat.

### CPU
- Web Audio VAD loop runs every animation frame (RMS over 512 samples) + two `setInterval`s (150 ms meter, 7 s KeepAlive) — negligible.
- ffmpeg.wasm client re-encode (only on oversized/unsupported uploads) is CPU-heavy but rare.

### Network calls (per voice session)
- Streaming: 1 WebSocket (Deepgram/Speechmatics), continuous 250 ms frames.
- Batch: N × `/api/transcribe` (per chunk), optional 1 × `/api/reanalyze`, optional 1 × `/api/structure-plates`.
- Correction sync: `fetchSharedCorrections` on mount, `pushCorrection`/`bump_plate_correction` per learned edit.
- Auth: `verifySession` + per-route rate limits (transcribe 120/min, structure 60/min, reanalyze 30/min, read-plate 60/min).

---

# 10. Missing Advanced Features — الميزات المتقدمة الناقصة ⭐

Compared against a **state-of-the-art specialized license-plate speech-recognition system**. For each: what it is · why it helps · difficulty · estimated accuracy gain · priority. "Estimated gain" is relative to your current field accuracy on the throat-letter/digit failure modes described in your own code comments.

> **Legend for current state:** ❌ absent · 🟡 partial (some form exists but not the full technique).

### 10.1 — Ensemble / dual-engine decoding — ❌
- **What:** Run 2+ ASR engines on the same audio and reconcile (agreement → high confidence; disagreement → arbitrate via plate grammar + wanted list).
- **Why:** Deepgram and Whisper fail on *different* letters; where they agree you're near-certain, where they differ you know exactly which plate to flag. This is the single highest-leverage missing piece for you because you already run 4 engines — you just never combine them.
- **Difficulty:** Medium. **Est. gain:** +8-15% on hard plates. **Priority:** 🔴 Critical.

### 10.2 — Grammar-constrained decoding — ❌ (🟡 post-hoc only)
- **What:** Constrain the decoder to only emit sequences valid under the plate grammar (3 letters ∈ 17-set + 4 digits) — as opposed to validating *after* decoding.
- **Why:** Prevents impossible outputs (invalid letters, wrong lengths) at the source instead of salvaging them. You enforce the grammar *after* transcription; a real constrained decoder never emits an invalid token.
- **Difficulty:** Hard (needs a decoder you control — on-device or a model exposing logit biasing). **Est. gain:** +5-10%. **Priority:** 🟠 High.

### 10.3 — N-Best hypotheses from cloud engines + rescoring — ❌ (🟡 web-only)
- **What:** Get the top-K transcripts from Deepgram/Whisper (Deepgram `alternatives`, Whisper logprobs/`n`) and rescore with `plateContentScore` + wanted-list match.
- **Why:** The correct plate is often the 2nd/3rd hypothesis. You already do exactly this for Web Speech (`maxAlternatives=5` → `pickBestHypothesis`) — extend it to the cloud engines you actually use in production.
- **Difficulty:** Medium. **Est. gain:** +4-8%. **Priority:** 🔴 Critical.

### 10.4 — Language-model / wanted-list rescoring — ❌ (🟡 anchor only)
- **What:** Rescore hypotheses with a domain LM (or the wanted-list itself as a prior) so plates on the list are preferred when acoustically plausible.
- **Why:** You *are* searching for a known set. Biasing decoding toward that set (beyond the single-letter anchor) turns "search" into "recognition against a closed vocabulary" — a huge accuracy multiplier.
- **Difficulty:** Medium. **Est. gain:** +6-12% when a wanted list is loaded. **Priority:** 🔴 Critical.

### 10.5 — Confidence rescoring / calibration — ❌
- **What:** A calibrated numeric confidence per plate (0-1), combining acoustic score, N-best margin, dictionary hit, wanted-list distance.
- **Why:** Today confidence is a boolean `uncertain`. A calibrated score lets you sort the review queue, auto-accept high-confidence, and set thresholds per engine.
- **Difficulty:** Medium. **Est. gain:** indirect (fewer missed reviews). **Priority:** 🟠 High.

### 10.6 — Context-aware decoding — 🟡 partial
- **What:** Feed session context (recent plates, current district/note, agent history) into the recognizer.
- **Why:** You already carry note-context forward in the parser; extending it into decoding bias (e.g. boosting recently-seen letters) helps consecutive similar plates.
- **Difficulty:** Medium. **Est. gain:** +2-4%. **Priority:** 🟡 Medium.

### 10.7 — Beam search control — ❌
- **What:** Explicit beam width / patience tuning on the decoder.
- **Why:** Wider beams help on short, ambiguous utterances (plates are exactly that). Cloud APIs mostly hide this — realistic only with an on-device/self-hosted model.
- **Difficulty:** Hard. **Est. gain:** +2-5%. **Priority:** 🟡 Medium (blocked on self-hosting).

### 10.8 — Candidate generation (phonetic expansion) — 🟡 partial
- **What:** From one hypothesis, generate plausible neighbors via `PHONETIC_NEIGHBOR_GROUPS` and test each against the wanted list.
- **Why:** You already have the neighbor groups and the wanted index — generating candidates and matching all of them would catch more than the current "exactly one confusable letter" rule.
- **Difficulty:** Easy. **Est. gain:** +3-6%. **Priority:** 🔴 Critical (cheap, uses assets you already built).

### 10.9 — Multi-pass verification — 🟡 partial
- **What:** Systematic 2nd/3rd pass (different engine or slower model) on low-confidence plates only.
- **Why:** "تحليل ذكي" exists but is manual/whole-session. Auto-trigger a targeted re-transcribe on `uncertain` plates only.
- **Difficulty:** Medium. **Est. gain:** +3-5% on flagged plates. **Priority:** 🟠 High.

### 10.10 — Self-learning — 🟡 strong-partial ✅
- **What:** Learn from corrections. **You have this** (letter + blend maps, local + shared/team).
- **Gap:** learning is per-letter/fragment only; no learning of *acoustic* patterns, no per-agent/per-device model. **Difficulty:** — **Priority:** 🟢 Low (already good).

### 10.11 — Active learning — 🟡 partial
- **What:** Prioritize which plates to ask the human to verify (uncertainty sampling) to maximize learning per correction.
- **Why:** You flag `uncertain` but don't rank the review queue by information gain. **Difficulty:** Medium. **Est. gain:** faster learning curve. **Priority:** 🟡 Medium.

### 10.12 — Dynamic dictionaries — 🟡 partial
- **What:** Per-session vocab loaded into the decoder (keyterms = the actual wanted-list letters/plates for this file).
- **Why:** Deepgram `keyterm` and Whisper prompt are **static** (letter names only). Injecting the loaded file's actual plates/districts as keyterms per session would sharply bias correctly. **Difficulty:** Easy. **Est. gain:** +4-8%. **Priority:** 🔴 Critical (easy + high).

### 10.13 — Domain-specific language model / fine-tune — ❌
- **What:** Fine-tune Whisper (or train an LM) on Egyptian-dialect plate dictation with your real recordings.
- **Why:** Would fix the systematic dialect/letter errors at the source rather than post-hoc. **Difficulty:** Hard (data + training + hosting). **Est. gain:** +10-20% (largest ceiling). **Priority:** 🟠 High (long-term).

### 10.14 — Plate pattern validation — ✅ present
- Fully implemented (`isStrictPlate`, `plateNeedsReview`, `normalizePlate`). **Priority:** 🟢 Done.

### 10.15 — AI validator — 🟡 partial
- **What:** A dedicated model that verifies "does this audio actually say this plate?" (re-ask an LLM/ASR with the candidate).
- **Why:** llama structuring exists but validates *text→rows*, not *audio→plate*. **Difficulty:** Medium. **Est. gain:** +3-5%. **Priority:** 🟡 Medium.

### 10.16 — Real-time correction (live) — 🟡 partial
- **What:** Apply learned corrections + wanted anchor to the **live** transcript shown during streaming.
- **Why:** Corrections currently apply at save; the live transcript display is raw (and in registration, removed entirely). **Difficulty:** Easy. **Est. gain:** UX + earlier alerts. **Priority:** 🟡 Medium.

### 10.17 — Streaming optimization — 🟡 partial
- **What:** Tuned endpointing, utterance segmentation, interim stabilization.
- **Why:** You have `endpointing` (100/300) and interim results, but no interim-stabilization or utterance-final barge-in. **Difficulty:** Medium. **Est. gain:** +2-4% + latency. **Priority:** 🟡 Medium.

### 10.18 — VAD improvements (make the gate actually gate) — 🟡 broken-partial
- **What:** Use the existing VAD to (a) actually stop sending silence, (b) segment utterances for the batch paths.
- **Why:** Your VAD is built and adaptive but **does not gate the transmitted audio** (only KeepAlive). Fixing this cuts cost and enables clean utterance segmentation. **Difficulty:** Easy. **Est. gain:** cost ↓, indirect accuracy via clean segments. **Priority:** 🟠 High (cheap fix, you already wrote the VAD).

### 10.19 — Pronunciation dictionary — ✅ strong (🟡 not in decoder)
- **What:** Spoken-form → grapheme lexicon.
- **State:** You have an **excellent hand-built one** (`EGYPTIAN_LETTERS`, `LETTER_NAMES`, `SPOKEN_NUMBERS`, `COMMON_LETTER_MISTAKES`). **Gap:** it's applied post-transcription, and fed to the decoder only weakly (Whisper prompt / Deepgram keyterms). **Difficulty:** Medium (to push into decoding). **Priority:** 🟡 Medium.

### 10.20 — Dialect adaptation — 🟡 partial
- **What:** Acoustic adaptation to Egyptian-agent-speaking-Saudi-plates.
- **State:** Handled purely in text post-processing; ASR uses generic `ar`. **Difficulty:** Hard (acoustic). **Est. gain:** +5-10%. **Priority:** 🟠 High (via fine-tune, 10.13).

### 10.21 — Error recovery — ✅ good
- Carry-over across chunk boundaries, WS auto-reconnect (instant-check), retry/back-off, failed-chunk accounting. **Priority:** 🟢 Done (registration Deepgram lacks reconnect — minor).

### 10.22 — Ensemble decoding — ❌ (= 10.1, listed for completeness).

### 10.23 — Hybrid STT architecture — 🟡 partial
- **What:** Combine on-device (fast, offline) + cloud (accurate) intelligently, not just as a fallback chain.
- **State:** You have a fallback *cascade*, not a *hybrid* (e.g. on-device for instant feedback, cloud to confirm). **Difficulty:** Medium. **Priority:** 🟡 Medium.

### Missing-features summary table

| Feature | State | Difficulty | Est. gain | Priority |
|---------|-------|-----------|-----------|----------|
| Ensemble / dual-engine | ❌ | Medium | +8-15% | 🔴 Critical |
| Dynamic dictionaries (per-file keyterms) | 🟡 | **Easy** | +4-8% | 🔴 Critical |
| Candidate generation (phonetic) | 🟡 | **Easy** | +3-6% | 🔴 Critical |
| N-Best + rescoring (cloud) | 🟡 | Medium | +4-8% | 🔴 Critical |
| Wanted-list LM rescoring | 🟡 | Medium | +6-12% | 🔴 Critical |
| VAD actually gating audio | 🟡(bug) | **Easy** | cost↓ | 🟠 High |
| Grammar-constrained decoding | ❌ | Hard | +5-10% | 🟠 High |
| Confidence calibration | ❌ | Medium | indirect | 🟠 High |
| Multi-pass on uncertain only | 🟡 | Medium | +3-5% | 🟠 High |
| Domain fine-tune / dialect acoustic | ❌ | Hard | +10-20% | 🟠 High (LT) |
| Context-aware decoding | 🟡 | Medium | +2-4% | 🟡 Medium |
| Active learning (review ranking) | 🟡 | Medium | — | 🟡 Medium |
| Real-time live correction | 🟡 | Easy | UX | 🟡 Medium |
| AI validator (audio→plate) | 🟡 | Medium | +3-5% | 🟡 Medium |
| Hybrid on-device+cloud | 🟡 | Medium | — | 🟡 Medium |
| Beam search control | ❌ | Hard | +2-5% | 🟡 Medium |
| Self-learning | ✅ | — | — | 🟢 Done |
| Plate pattern validation | ✅ | — | — | 🟢 Done |
| Pronunciation dictionary | ✅ | — | — | 🟢 Done |
| Error recovery | ✅ | — | — | 🟢 Done |

---

# 11. Overall Evaluation — التقييم العام

| Dimension | Score | Rationale |
|-----------|:-----:|-----------|
| **Recording** | 6.5 / 10 | Robust multi-backend capture, VAD meter, chunking, good fallbacks. Loses points: no `getUserMedia` constraints, VAD doesn't gate audio, no 16 kHz targeting. |
| **Audio Quality** | 6.5 / 10 | Smart server clean (highpass+dynaudnorm, mono, deliberate no-denoise to save fricatives). Loses points: browser-default capture, double AAC re-encode, no capture-side tuning. |
| **Speech Recognition** | 6.5 / 10 | Uses genuinely SOTA cloud models (Whisper large-v3, nova-3, Speechmatics enhanced). Loses points: generic Arabic models, no ensemble, no cloud N-best, no constrained decoding, config drift. |
| **Arabic Understanding** | 9.0 / 10 | Exceptional. Hand-built dialect lexicon, confusion maps, phonetic groups, Whisper-quirk captures (تلات خمسات→555), glottal-stop handling. Best-in-class for this niche. |
| **Plate Extraction** | 8.5 / 10 | Sophisticated atom parser, multi-plate, carry-over, orphan folding, wanted anchor, strict validation. Loses points: no numeric confidence, heuristic-heavy. |
| **Post Processing** | 8.0 / 10 | Local+shared self-learning, safety-thresholded, wanted-anchor, reanalyze 2nd pass, no-silent-drop principle. Loses points: no calibrated confidence, learning only on manual edits. |
| **Architecture** | 7.0 / 10 | Clean lib separation, pure/tested functions, TDD, event-driven session parser. Loses points: dead code, VAD-not-gating, page config drift, unwired elevenlabs, key handling spread. |
| **Speed** | 6.5 / 10 | Deepgram streaming is snappy. Loses points: record-then-analyze now primary in registration, ffmpeg-per-chunk latency, deliberate slow Whisper. |
| **Scalability** | 7.5 / 10 | Per-agent keys (no pooling), rate limits, serverless, Vercel-limit chunking, shared learning. Loses points: fuzzy disabled >50k rows, in-RAM full-session audio. |
| **Overall** | **7.0 / 10** | A production-grade, thoughtfully-built system whose Arabic/parsing layers are outstanding and whose ASR/decoding layer has clear, high-ROI headroom. |

---

## Prioritized Roadmap — خارطة الطريق (highest impact → lowest)

### 🔴 Phase 1 — High impact, mostly cheap (do these first)
1. **Dynamic per-session keyterms** (10.12) — inject the loaded wanted/check file's actual plate letters (and districts) as Deepgram `keyterm` / Whisper prompt vocab for that session. *Easy, +4-8%.*
2. **Candidate generation + match-all against wanted list** (10.8) — you already have `PHONETIC_NEIGHBOR_GROUPS` and the wanted index; generate neighbors and test each, instead of the single-confusable-letter rule. *Easy, +3-6%.*
3. **Fix the VAD to actually gate transmitted audio + segment utterances** (10.18) — the gate is already written; wire it into `ws.send` and batch segmentation. *Easy, cost↓ + cleaner segments.*
4. **Cloud N-best + rescoring** (10.3) — request Deepgram `alternatives`/Whisper alternatives and run them through the `pickBestHypothesis`/`plateContentScore` you already use for Web Speech. *Medium, +4-8%.*
5. **Wanted-list rescoring / closed-vocabulary bias** (10.4) — prefer on-list plates when acoustically plausible. *Medium, +6-12% when a list is loaded.*

### 🟠 Phase 2 — High impact, more effort
6. **Ensemble / dual-engine reconcile** (10.1) — run Deepgram + Whisper, agree→accept, disagree→arbitrate via grammar + wanted list. *Medium, +8-15%.*
7. **Confidence calibration + ranked review queue** (10.5 + 10.11) — numeric 0-1 score; auto-accept high, sort review by uncertainty.
8. **Auto multi-pass on `uncertain` plates only** (10.9) — targeted re-transcribe (different engine) for flagged plates.
9. **Clean up config drift + dead code + unwired elevenlabs** (architecture) — unify endpointing/language, delete `startGroqLive*`, either wire or hide ElevenLabs on instant-check.

### 🟢 Phase 3 — Highest ceiling, hardest
10. **Domain fine-tune / dialect acoustic adaptation** (10.13 + 10.20) — fine-tune Whisper on your real Egyptian-agent plate recordings. *Hard, +10-20% — the biggest single ceiling, longest lead time.*
11. **Grammar-constrained + beam-controlled decoding** (10.2 + 10.7) — realistic only on a self-hosted/on-device model; unlocks true constrained recognition.

---

*End of audit. No code was modified during this review.*

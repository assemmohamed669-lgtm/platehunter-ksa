/**
 * ==========================================================================
 *  مسجّل التسجيل الممتد — WebM/Opus زي قناص اللوحات
 * ==========================================================================
 *
 *  ليه مسجّل تاني غير `MicEngine`؟
 *  ────────────────────────────────
 *  `MicEngine` بيطلّع WAV بـ١٦kHz بعد معالجة — وده اتضح إنه بيضرّ:
 *   - موديلنا المدرَّب اتدرّب على صوت **خام**
 *   - Deepgram بيشتغل أحسن على **Opus بمعدل الميك الكامل** في حاوية
 *     (بيقرأ المعدل من ترويسة Opus بنفسه)
 *
 *  فالمسجّل ده نسخة من اللي في قناص اللوحات بالحرف:
 *   • ‎getUserMedia({ audio: true })‎ — بلا أي قيود، سايبين المتصفح
 *   • ‎MediaRecorder‎ بـ Opus في حاوية WebM
 *   • ‎timeslice = 250ms‎ — وده **أساس تحويل ms↔فهرس** لنوافذ الموديل
 *   • **بلا أي معالجة** على الصوت الخارج
 *
 *  وبيحفظ الأجزاء في مصفوفة عشان نقدر نبعت «بادئة» تبدأ من ترويسة WebM —
 *  اللي سيرفر الموديل بيقصّها بـ‎?start=&end=‎.
 */

import { createSpeechGate, type SpeechGate } from "./ph/audioGate";

/**
 * ترتيب الصيغ المدعومة — Opus في WebM هو المطلوب.
 *
 * 🧮 قناص (١٦ أكتوبر ٢٠٢٦): `audio/mp4` **آخر احتياطي** — الآيفون (WKWebView) مابيسجّلش
 * WebM/Opus، فمن غيره الصفحة كانت بتقول «افتح في Chrome على أندرويد» ومافيش تسجيل خالص.
 * أندرويد مابيوصلوش (بيلاقي WebM الأول) ⇒ نفس صوت المعمل بالبايت. السيرفر بيفكّ m4a
 * بـffmpeg، والوسيط بيأرشفه `audio.m4a`.
 */
export const BATCH_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];
const MIME_CANDIDATES = BATCH_MIME_CANDIDATES;

/** حجم الجزء — لازم يطابق ثابت الحاكم (JUDGE_CHUNK_MS) */
export const BATCH_TIMESLICE_MS = 250;

export interface BatchRecorderOptions {
  /** مستوى الصوت ٠..١ + شكل الموجة للعرض الحي */
  onLevel?: (level: number, waveform: Uint8Array | null) => void;
  /** بيسمع كلام دلوقتي؟ */
  onSpeaking?: (speaking: boolean) => void;
  /** المدة الحالية بالثواني */
  onTick?: (seconds: number) => void;
  /** وصلنا الحد الأقصى */
  onMaxDuration?: () => void;
  /** أقصى مدة بالثواني */
  maxSeconds?: number;
}

export class BatchRecorder {
  private o: BatchRecorderOptions;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private gate: SpeechGate | null = null;
  private timer: number | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  private startedAt = 0;
  private running = false;
  /**
   * محلّل منفصل لعرض الموجة.
   * ‎createSpeechGate‎ بيبني محلّل جوّاه بس مابيعرضش الـ buffer، وإحنا
   * عايزين نرسم الموجة — فمحلّل تاني على نفس التيار. ده تحليل موازي
   * تماماً: عمره ما يلمس الصوت الخارج للتسجيل.
   */
  private waveCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private waveBuf: Uint8Array<ArrayBuffer> | null = null;

  constructor(options: BatchRecorderOptions = {}) {
    this.o = options;
  }

  get isRecording(): boolean {
    return this.running;
  }

  get mime(): string {
    return this.mimeType;
  }

  /** أجزاء الصوت بالترتيب — الجزء ٠ فيه ترويسة WebM */
  get audioChunks(): Blob[] {
    return this.chunks;
  }

  get durationSec(): number {
    if (!this.startedAt) return 0;
    return (performance.now() - this.startedAt) / 1000;
  }

  /** الملف كامل — للتفريغ والاستماع */
  buildBlob(): Blob {
    return new Blob(this.chunks, { type: this.mimeType || "audio/webm" });
  }

  static isSupported(): boolean {
    if (typeof MediaRecorder === "undefined") return false;
    return MIME_CANDIDATES.some((m) => {
      try {
        return MediaRecorder.isTypeSupported(m);
      } catch {
        return false;
      }
    });
  }

  async start(): Promise<void> {
    if (this.running) return;

    const mime = MIME_CANDIDATES.find((m) => {
      try {
        return MediaRecorder.isTypeSupported(m);
      } catch {
        return false;
      }
    });
    if (!mime) {
      throw new Error(
        "المتصفح ده ما بيدعمش تسجيل Opus — افتح الصفحة في Chrome على أندرويد"
      );
    }
    this.mimeType = mime;

    // ‎{ audio: true }‎ بالحرف — بلا تحديد معدل ولا قنوات ولا كبت ضوضاء
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    /**
     * ⚠️ أي فشل بعد ما الميك اتفتح لازم يقفله.
     *
     * ‎new MediaRecorder‎ ممكن ترمي حتى بعد ما ‎isTypeSupported‎ قالت أيوه
     * (بيحصل على أجهزة معيّنة). المنادي بيمسك الخطأ ويرجع — بس مافيش أي
     * مسار بيقفل الميك بعدها، فلمبة التسجيل بتفضل مولّعة لحد ما تعمل
     * إعادة تحميل.
     */
    try {
      this.chunks = [];
      const rec = new MediaRecorder(this.stream, { mimeType: mime });
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder = rec;
    } catch (err) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      throw err;
    }
    const rec = this.recorder!;

    // بوابة الكلام: تحليل موازي للمستوى والنقطة — عمرها ما تمنع تسجيل
    try {
      this.gate = createSpeechGate(this.stream);
    } catch {
      this.gate = null;
    }

    // محلّل الموجة — تحليل موازي كذلك
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.waveCtx = new Ctor();
      const src = this.waveCtx.createMediaStreamSource(this.stream);
      const an = this.waveCtx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.55;
      src.connect(an); // مش متوصّل بالخروج — تحليل بس
      this.analyser = an;
      this.waveBuf = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
    } catch {
      this.analyser = null;
      this.waveBuf = null;
    }

    this.startedAt = performance.now();
    this.running = true;
    try {
      rec.start(BATCH_TIMESLICE_MS);
    } catch (err) {
      this.running = false;
      this.gate?.close();
      this.gate = null;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.recorder = null;
      throw err;
    }

    const maxSeconds = this.o.maxSeconds ?? 320;
    this.timer = window.setInterval(() => {
      if (!this.running) return;
      const secs = this.durationSec;
      this.o.onTick?.(secs);
      let wave: Uint8Array | null = null;
      if (this.analyser && this.waveBuf) {
        this.analyser.getByteTimeDomainData(this.waveBuf);
        wave = this.waveBuf.slice(0);
      }
      this.o.onLevel?.(this.gate?.level() ?? 0, wave);
      this.o.onSpeaking?.(this.gate?.isSpeaking() ?? false);
      if (secs >= maxSeconds) this.o.onMaxDuration?.();
    }, 150);
  }

  /** يوقف التسجيل ويستنى آخر جزء يوصل */
  async stop(): Promise<Blob> {
    this.running = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;

    const rec = this.recorder;
    this.recorder = null;

    if (rec && rec.state !== "inactive") {
      // ‎stop()‎ بيطلّع آخر جزء بعد لحظة — لازم نستناه وإلا آخر لوحة تضيع
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        rec.addEventListener("stop", done, { once: true });
        try {
          rec.stop();
        } catch {
          resolve();
        }
        // شبكة أمان لو الحدث ما جاش
        setTimeout(resolve, 800);
      });
    }

    this.gate?.close();
    this.gate = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.waveBuf = null;
    if (this.waveCtx && this.waveCtx.state !== "closed") {
      void this.waveCtx.close();
    }
    this.waveCtx = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.o.onLevel?.(0, null);
    this.o.onSpeaking?.(false);

    return this.buildBlob();
  }
}

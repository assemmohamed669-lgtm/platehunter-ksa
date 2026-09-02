/**
 * محرك الميكروفون + معالجة الصوت (منقول من معمل الصوت، مقيس ومجرّب ميدانياً).
 * =============================================================================
 * سلسلة معالجة (تمرير عالي 85Hz + تعزيز وضوح الحروف 2.6kHz + ضاغط) + التقاط PCM
 * عبر AudioWorklet (احتياطي ScriptProcessor) + ذاكرة دوّارة ٩٠ث. بنسجّل نسختين:
 * **خام** (للموديل — اتدرّب على خام) و**معالَجة** (لكشف الكلام/العرض).
 * sliceWav بيعلّي القمة (normalizePeak) قبل الإرسال — ده اللي بيدّي الدقة.
 * ⚠️ الذاكرة الدوّارة بتلغي الحاجة لإعادة تشغيل مسجّل (سبب الوقفة في الطريقة القديمة).
 */
import { encodeWav, normalizePeak } from "./wav";
import { clipQuality, type ClipQuality } from "./audioPregate";

export const TARGET_SAMPLE_RATE = 16_000;
export const LIVE_CHUNK_SAMPLES = 1024;          // ٦٤ms
export const MAX_BATCH_SECONDS = 320;
export const LIVE_RING_SECONDS = 90;

export interface MicEngineOptions {
  mode: "batch" | "live";
  onChunk?: (pcm: Float32Array, startSec: number) => void;
  onRawChunk?: (pcm: Float32Array) => void;
  onLevel?: (level: number, waveform: Uint8Array) => void;
  onMaxDuration?: () => void;
  onError?: (error: Error) => void;
}

const WORKLET_SOURCE = `
class PlateCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunkSize = (options && options.processorOptions && options.processorOptions.chunkSize) || 1024;
    this.buffer = new Float32Array(this.chunkSize);
    this.filled = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === this.chunkSize) {
        this.port.postMessage(this.buffer.slice(0));
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('plate-capture', PlateCaptureProcessor);
`;

export class MicEngine {
  private options: MicEngineOptions;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private rawWorklet: AudioWorkletNode | null = null;
  private legacyProcessor: ScriptProcessorNode | null = null;
  private rawLegacyProcessor: ScriptProcessorNode | null = null;
  private levelTimer: number | null = null;
  private workletUrl: string | null = null;

  private chunks: Float32Array[] = [];
  private rawChunks: Float32Array[] = [];
  private storedSamples = 0;
  private droppedSamples = 0;
  private startedAt = 0;
  private running = false;
  private ownsStream = true;
  private actualSampleRate = TARGET_SAMPLE_RATE;

  constructor(options: MicEngineOptions) { this.options = options; }

  get isRecording(): boolean { return this.running; }
  get oldestSec(): number { return this.droppedSamples / this.actualSampleRate; }
  get sampleRate(): number { return this.actualSampleRate; }
  get durationSec(): number {
    if (!this.running && this.storedSamples === 0) return 0;
    return (this.droppedSamples + this.storedSamples) / this.actualSampleRate;
  }
  get elapsedSec(): number {
    if (!this.startedAt) return 0;
    return (Date.now() - this.startedAt) / 1000;
  }

  async start(existingStream?: MediaStream): Promise<void> {
    if (this.running) return;
    this.chunks = [];
    this.rawChunks = [];
    this.storedSamples = 0;
    this.droppedSamples = 0;
    this.ownsStream = !existingStream;

    this.stream = existingStream ?? (await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    }));

    const Ctor = window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try { this.ctx = new Ctor({ sampleRate: TARGET_SAMPLE_RATE }); }
    catch { this.ctx = new Ctor(); }
    this.actualSampleRate = this.ctx.sampleRate;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass"; highpass.frequency.value = 85; highpass.Q.value = 0.7;
    const presence = this.ctx.createBiquadFilter();
    presence.type = "peaking"; presence.frequency.value = 2600; presence.Q.value = 0.9; presence.gain.value = 4;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -26; compressor.knee.value = 22; compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004; compressor.release.value = 0.2;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.55;

    this.source.connect(highpass);
    highpass.connect(presence);
    presence.connect(compressor);
    compressor.connect(this.analyser);

    let captured = false;
    try {
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      this.workletUrl = URL.createObjectURL(blob);
      await this.ctx.audioWorklet.addModule(this.workletUrl);
      const makeTap = (node: AudioNode, onData: (chunk: Float32Array) => void): AudioWorkletNode => {
        const tap = new AudioWorkletNode(this.ctx!, "plate-capture", {
          numberOfInputs: 1, numberOfOutputs: 0, processorOptions: { chunkSize: LIVE_CHUNK_SAMPLES },
        });
        tap.port.onmessage = (event) => onData(event.data as Float32Array);
        node.connect(tap);
        return tap;
      };
      this.worklet = makeTap(compressor, (chunk) => this.handleChunk(chunk));
      this.rawWorklet = makeTap(this.source, (chunk) => this.handleRawChunk(chunk));
      captured = true;
    } catch { captured = false; }

    if (!captured) {
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      mute.connect(this.ctx.destination);
      const makeLegacyTap = (node: AudioNode, onData: (chunk: Float32Array) => void): ScriptProcessorNode => {
        const proc = this.ctx!.createScriptProcessor(LIVE_CHUNK_SAMPLES * 2, 1, 1);
        proc.onaudioprocess = (event) => onData(new Float32Array(event.inputBuffer.getChannelData(0)));
        node.connect(proc);
        proc.connect(mute);
        return proc;
      };
      this.legacyProcessor = makeLegacyTap(compressor, (c) => this.handleChunk(c));
      this.rawLegacyProcessor = makeLegacyTap(this.source, (c) => this.handleRawChunk(c));
    }

    if (this.options.onLevel) {
      const waveform = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.running || !this.analyser) return;
        this.analyser.getByteTimeDomainData(waveform);
        let sum = 0;
        for (let i = 0; i < waveform.length; i++) { const v = (waveform[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / waveform.length);
        this.options.onLevel?.(Math.min(1, rms * 3.2), waveform);
        this.levelTimer = requestAnimationFrame(tick);
      };
      this.levelTimer = requestAnimationFrame(tick);
    }

    this.startedAt = Date.now();
    this.running = true;
  }

  private handleChunk(chunk: Float32Array) {
    if (!this.running) return;
    const startSec = (this.droppedSamples + this.storedSamples) / this.actualSampleRate;
    this.options.onChunk?.(chunk, startSec);
    this.chunks.push(chunk);
    this.storedSamples += chunk.length;
    if (this.options.mode === "batch") {
      if (this.storedSamples >= MAX_BATCH_SECONDS * this.actualSampleRate) this.options.onMaxDuration?.();
      return;
    }
    const ringMax = LIVE_RING_SECONDS * this.actualSampleRate;
    while (this.storedSamples > ringMax && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.storedSamples -= dropped.length;
      this.droppedSamples += dropped.length;
    }
  }

  private handleRawChunk(chunk: Float32Array) {
    if (!this.running) return;
    this.options.onRawChunk?.(chunk);
    this.rawChunks.push(chunk);
    if (this.options.mode === "batch") return;
    const ringMax = LIVE_RING_SECONDS * this.actualSampleRate;
    let rawSamples = 0;
    for (const c of this.rawChunks) rawSamples += c.length;
    while (rawSamples > ringMax && this.rawChunks.length > 1) rawSamples -= this.rawChunks.shift()!.length;
  }

  stop(): void {
    this.running = false;
    if (this.levelTimer !== null) { cancelAnimationFrame(this.levelTimer); this.levelTimer = null; }
    for (const tap of [this.worklet, this.rawWorklet]) {
      if (!tap) continue;
      tap.port.onmessage = null;
      tap.disconnect();
    }
    this.worklet = null; this.rawWorklet = null;
    for (const proc of [this.legacyProcessor, this.rawLegacyProcessor]) {
      if (!proc) continue;
      proc.onaudioprocess = null;
      proc.disconnect();
    }
    this.legacyProcessor = null; this.rawLegacyProcessor = null;
    this.analyser?.disconnect(); this.analyser = null;
    this.source?.disconnect(); this.source = null;
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    this.ctx = null;
    if (this.workletUrl) { URL.revokeObjectURL(this.workletUrl); this.workletUrl = null; }
  }

  getAudio(raw = false): Float32Array {
    const source = raw ? this.rawChunks : this.chunks;
    let total = 0;
    for (const c of source) total += c.length;
    const out = new Float32Array(total);
    let offset = 0;
    for (const chunk of source) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }

  /** يقطع نافذة WAV بالثواني (زمن مطلق) — معلّاة، raw=true للموديل. */
  sliceWav(fromSec: number, toSec: number, paddingSec = 0.2, raw = false): Blob | null {
    const rate = this.actualSampleRate;
    const from = Math.max(0, fromSec - paddingSec);
    const to = toSec + paddingSec;
    const absoluteStart = Math.floor(from * rate) - this.droppedSamples;
    const absoluteEnd = Math.ceil(to * rate) - this.droppedSamples;
    const audio = this.getAudio(raw);
    const start = Math.max(0, absoluteStart);
    const end = Math.min(audio.length, absoluteEnd);
    if (end - start < rate * 0.2) return null;
    return encodeWav(normalizePeak(new Float32Array(audio.subarray(start, end))), rate);
  }

  /** جودة النافذة على الصوت **الخام قبل التعلية** — لبوابة السكوت. */
  sliceQuality(fromSec: number, toSec: number, paddingSec = 0.2): ClipQuality | null {
    const rate = this.actualSampleRate;
    const from = Math.max(0, fromSec - paddingSec);
    const to = toSec + paddingSec;
    const absoluteStart = Math.floor(from * rate) - this.droppedSamples;
    const absoluteEnd = Math.ceil(to * rate) - this.droppedSamples;
    const audio = this.getAudio(true);
    const start = Math.max(0, absoluteStart);
    const end = Math.min(audio.length, absoluteEnd);
    if (end - start < rate * 0.2) return null;
    return clipQuality(new Float32Array(audio.subarray(start, end)), rate);
  }
}

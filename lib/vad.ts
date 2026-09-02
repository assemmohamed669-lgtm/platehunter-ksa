/**
 * كشف الكلام المحلي (VAD) — منقول من معمل الصوت. بيتعلّم **أرضية الضوضاء**
 * باستمرار وقت السكوت والعتبة نسبة منها (الشارع ضوضاءه عالية)، بعتبتين
 * (hysteresis) عشان الجملة ماتتقطّعش. بيغذّي «إمتى بدأ الكلام وإمتى سكت».
 */
export interface Utterance {
  startSec: number;
  endSec: number;
}

export interface VadOptions {
  sampleRate: number;
  absoluteThreshold?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  maxSpeechMs?: number;
  calibrationMs?: number;
  onUtterance: (u: Utterance) => void;
  onSpeechStart?: (atSec: number) => void;
}

const DEFAULTS = {
  absoluteThreshold: 0.014,
  silenceMs: 550,
  minSpeechMs: 450,
  maxSpeechMs: 11_000,
  calibrationMs: 400,
};

/** طاقة القطعة (RMS) */
export function rmsOf(chunk: Float32Array): number {
  if (chunk.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  return Math.sqrt(sum / chunk.length);
}

export class Vad {
  private o: Required<Omit<VadOptions, "onUtterance" | "onSpeechStart">> &
    Pick<VadOptions, "onUtterance" | "onSpeechStart">;
  private noiseFloor = 0.004;
  private speaking = false;
  private speechStart = 0;
  private lastVoiceEnd = 0;
  private silenceAcc = 0;
  private heardSec = 0;

  constructor(options: VadOptions) {
    this.o = {
      sampleRate: options.sampleRate,
      absoluteThreshold: options.absoluteThreshold ?? DEFAULTS.absoluteThreshold,
      silenceMs: options.silenceMs ?? DEFAULTS.silenceMs,
      minSpeechMs: options.minSpeechMs ?? DEFAULTS.minSpeechMs,
      maxSpeechMs: options.maxSpeechMs ?? DEFAULTS.maxSpeechMs,
      calibrationMs: options.calibrationMs ?? DEFAULTS.calibrationMs,
      onUtterance: options.onUtterance,
      onSpeechStart: options.onSpeechStart,
    };
  }

  get isCalibrating(): boolean { return this.heardSec * 1000 < this.o.calibrationMs; }
  get isSpeaking(): boolean { return this.speaking; }
  get currentThreshold(): number { return Math.max(this.o.absoluteThreshold, this.noiseFloor * 3.2); }

  /** تُنادى لكل قطعة صوت. startSec = ثانية بداية القطعة (زمن مطلق). */
  push(chunk: Float32Array, startSec: number): void {
    const energy = rmsOf(chunk);
    const durSec = chunk.length / this.o.sampleRate;
    const chunkEnd = startSec + durSec;
    const wasCalibrating = this.isCalibrating;
    this.heardSec += durSec;

    if (!this.speaking) {
      this.noiseFloor = this.noiseFloor * 0.88 + energy * 0.12;
      if (wasCalibrating) return;
      if (energy > this.currentThreshold) {
        this.speaking = true;
        this.speechStart = startSec;
        this.lastVoiceEnd = chunkEnd;
        this.silenceAcc = 0;
        this.o.onSpeechStart?.(startSec);
      }
      return;
    }

    if (energy < this.noiseFloor) this.noiseFloor = this.noiseFloor * 0.9 + energy * 0.1;
    const exitThreshold = Math.max(this.o.absoluteThreshold * 0.65, this.noiseFloor * 2.2);
    if (energy > exitThreshold) {
      this.silenceAcc = 0;
      this.lastVoiceEnd = chunkEnd;
    } else {
      this.silenceAcc += durSec;
      if (this.silenceAcc * 1000 >= this.o.silenceMs) { this.end(this.lastVoiceEnd); return; }
    }
    if ((chunkEnd - this.speechStart) * 1000 >= this.o.maxSpeechMs) this.end(chunkEnd);
  }

  flush(nowSec: number): void { if (this.speaking) this.end(Math.max(nowSec, this.lastVoiceEnd)); }

  reset(): void {
    this.speaking = false; this.silenceAcc = 0; this.speechStart = 0;
    this.lastVoiceEnd = 0; this.noiseFloor = 0.004; this.heardSec = 0;
  }

  private end(endSec: number): void {
    this.speaking = false;
    this.silenceAcc = 0;
    if ((endSec - this.speechStart) * 1000 >= this.o.minSpeechMs) {
      this.o.onUtterance({ startSec: this.speechStart, endSec });
    }
  }
}

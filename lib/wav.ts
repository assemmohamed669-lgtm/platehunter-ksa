/**
 * ترميز WAV — من صوت خام لملف يفهمه الموديل (منقول من معمل الصوت).
 * بنبعت WAV مش webm/opus: مافيش ضغط (جودة = دقة)، ونقدر نقطّع أي جزء بالثانية.
 */

/** يحوّل عيّنات ‎-1..1‎ لبايتات PCM 16-bit */
export function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * تسوية الصوت (Peak Normalisation) — بنعلّي أعلى قمة لـ٩٧٪ فالموديل يستقبل
 * مستوى ثابت (المندوب بعيد/لازق للميك). ده **بيقلّل أخطاء التفريغ فعلياً**
 * (مقيس). هامش ٣٪ عشان مانقصّش (Clipping).
 */
export function normalizePeak(input: Float32Array, target = 0.97): Float32Array {
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    if (a > peak) peak = a;
  }
  if (peak < 0.0015) return input;          // شبه ساكت — التعلية هتكبّر الضوضاء بس
  const gain = target / peak;
  if (gain <= 1.02) return input;           // قريب من المستوى المطلوب أصلاً
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * gain;
  return out;
}

/** يبني ملف WAV (PCM 16-bit، قناة واحدة) */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const pcm = floatToPcm16(samples);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, 1, true);              // قناة واحدة
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) view.setInt16(offset, pcm[i], true);
  return new Blob([buffer], { type: "audio/wav" });
}

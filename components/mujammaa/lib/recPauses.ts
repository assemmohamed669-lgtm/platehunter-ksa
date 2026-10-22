/**
 * ==========================================================================
 *  ⏸️ «وقف مؤقت» في نفس التسجيل — وقت كل لوحة الحقيقي
 * ==========================================================================
 *
 *  المالك (٢٢ أكتوبر ٢٠٢٦): «زر … يوقف التسجيل دة مؤقت الي حين ما يطلع من مكان مفيهوش لوحات … ويرجع بعدين
 *  يدوس استئناف التسجيل يشتغل معاه ويكمل ويقول لوحات علي نفس الملف» + «اللوحات اللي قبل كدة تبقي متاخد ليها
 *  موقعها قدام كل لوحه بالظبط وقت ما قالها … ولما ييستأنف … كل لوحه بعدها يتاخدل ليها الموقع وقت ماقالها».
 *
 *  الصوت **مافيهوش الوقفة** (`MediaRecorder.pause`) ⇒ ثانية اللوحة جوّه الصوت (`timeStart`) بتبقى أبدر من
 *  وقت نطقها بمجموع الوقفات اللي قبلها. ومسار الموقع والمربعات (الحي/المسجّل/الجراج) متسجّلين بوقت الساعة.
 *  ⇒ أي حاجة محتاجة «لحظة النطق» بتعدّي على `audioToWallMs` الأول. من غير وقفات = نفس الرقم بالظبط.
 */

export interface RecPause {
  /** مكان الوقفة جوّه الصوت (ms من أول الصوت) — الصوت اللي بعدها اتسجّل بعد ما كمّل */
  atAudioMs: number;
  /** مدتها بالساعة (ms) — مافيهاش صوت */
  durMs: number;
}

/** ثانية في الصوت (ms) ⇐ وقتها الحقيقي من بداية التسجيل (ms). لوحة على حد الوقفة بالظبط = اتقالت بعد ما كمّل. */
export function audioToWallMs(audioMs: number, pauses?: readonly RecPause[] | null): number {
  if (!Number.isFinite(audioMs) || !pauses || pauses.length === 0) return audioMs;
  let add = 0;
  for (const p of pauses) if (p.atAudioMs <= audioMs) add += p.durMs;
  return audioMs + add;
}

/** الوقفات زي ما اتحفظت (تخزين قديم/بايظ) ⇒ السليمة بس، بالترتيب */
export function sanitizePauses(raw: unknown): RecPause[] {
  if (!Array.isArray(raw)) return [];
  const out: RecPause[] = [];
  for (const x of raw) {
    const at = Number((x as RecPause | null)?.atAudioMs);
    const dur = Number((x as RecPause | null)?.durMs);
    if (!Number.isFinite(at) || !Number.isFinite(dur) || at < 0 || dur <= 0) continue;
    out.push({ atAudioMs: at, durMs: dur });
  }
  return out.sort((a, b) => a.atAudioMs - b.atAudioMs);
}

/** مجموع الوقفات (ms) */
export function pausedTotalMs(pauses?: readonly RecPause[] | null): number {
  return (pauses ?? []).reduce((n, p) => n + (Number.isFinite(p.durMs) ? p.durMs : 0), 0);
}

const r1 = (ms: number) => Math.round(ms / 100) / 10;

/** للتقرير على السيرفر: [ثانيتها في الصوت, مدتها بالثواني] — من غير وقفات ⇒ مافيش حقل */
export function pausesForReport(pauses?: readonly RecPause[] | null): Array<[number, number]> | undefined {
  if (!pauses?.length) return undefined;
  return pauses.map((p) => [r1(p.atAudioMs), r1(p.durMs)]);
}

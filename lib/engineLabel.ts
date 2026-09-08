/**
 * اسم محرك الصوت اللي المندوب بيشوفه أثناء التسجيل.
 *
 * ليه ظاهر للمندوب أصلاً: لما VoiceX يفصل (النفق/السيرفر)، البرنامج بيرجع
 * لديبجرام **بصمت**. عربي ديبجرام أضعف، فالمندوب بيشوف «البرنامج بقى بيغلط»
 * وهو مش عارف إن المحرك اتبدّل. الشارة بتخلّيه يقول «كان مكتوب ديبجرام» —
 * فالشكوى بتوصلنا بسببها بدل ما نتّهم الموديل.
 */
export interface EngineLabel {
  /** الاسم المعروض. */
  text: string;
  /** موديلنا؟ (بيتلوّن أخضر؛ أي محرك تاني = احتياطي بيتلوّن كهرماني) */
  ours: boolean;
}

const NAMES: Record<string, string> = {
  voicex: "VoiceX",
  deepgram: "ديبجرام",
  speechmatics: "Speechmatics",
  whisper: "Whisper",
  local: "المحرك المحلي",
};

export function engineLabel(engine: string | null | undefined): EngineLabel {
  const e = (engine ?? "").trim();
  if (!e) return { text: "—", ours: false };
  return { text: NAMES[e] ?? e, ours: e === "voicex" };
}

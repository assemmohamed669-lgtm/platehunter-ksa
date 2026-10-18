/**
 * 🧮 **مين يتفرّغ دلوقتي** — طابور المقاطع بالترتيب اللي المندوب داس بيه (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «لو مثلا مسجل 5 مقاطع … وداس قدام كل واحد علي كلمه تفريغ يتفرغو بالترتيب يقفو صف اللي يخلص
 * يتفرغ غيرو وهكذا».
 *
 * 🔴 الثغرة اللي ده بيقفلها: «تفريغ» بيقرا صوت المقطع من التخزين الأول (`store.audio`) وبعدين يحطه في
 * الطابور. مقطع كبير (١٥ دقيقة ≈ ١٤ ميجا) بياخد وقت أطول في القراية من مقطع صغير — فلو المندوب داس على
 * الكبير وبعده الصغير بسرعة، الصغير كان بيدخل الطابور الأول ويتفرّغ قبله. دلوقتي كل دوسة بتاخد رقمها
 * **لحظة الدوسة**، والطابور مابيبدأش مقطع وفيه مقطع اتداس عليه قبله لسه بيتقري.
 */
export interface QueueJobLike {
  status: string;
  /** رقم الدوسة (بيزيد) — مهمة قديمة من غيره ⇒ بعد اللي ليهم أرقام بترتيب القايمة */
  order?: number;
}

export function pickNextJob<T extends QueueJobLike>(jobs: readonly T[], preparing: Iterable<number>): T | null {
  let best: T | null = null;
  let bestKey = Infinity;
  let bestIdx = Infinity;
  jobs.forEach((j, i) => {
    if (j.status !== "waiting") return;
    const key = typeof j.order === "number" ? j.order : Infinity;
    if (key < bestKey || (key === bestKey && i < bestIdx)) {
      best = j;
      bestKey = key;
      bestIdx = i;
    }
  });
  if (!best) return null;
  let earliest = Infinity;
  for (const o of preparing) if (o < earliest) earliest = o;
  // فيه مقطع اتداس عليه قبله ولسه بيتقري ⇒ نستناه (هو هيشغّل الطابور أول ما يجهز)
  if (earliest < bestKey) return null;
  return best;
}

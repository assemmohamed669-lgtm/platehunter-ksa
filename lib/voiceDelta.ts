/**
 * ══════════════════════════════════════════════════════════════════════
 *  🗜️➕ Voice PRO يبعت **الصوت الجديد بس** — والنافذة تتبني على السيرفر (المالك ٢٦ نوفمبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «اة اعمل كدة بس المهم قبل ماتعمل دة اتأكد انه مش هيأثر علي الشغل» ⇒ «نفذ انت دة امر مني اهم حاجه انه ميأثرش لا علي
 * السيرفر ولا علي المناديب ولا علي الشغل».
 *
 * النافذة ٥.٤ث كل ١.٥ث ⇒ كل ثانية صوت بتطلع ~٣.٦ مرة. هنا كل طلب بيحمل **اللي ماتبعتش قبل كده** من [a, b) بس (خام ٢٤-بت
 * FLAC)، و`serving/delta_gateway.py` (عملية لوحدها على إيطاليا — مابتلمسش سيرفر اللوحات) بيبني النافذة بنفس تعلية الموبايل
 * ويسلّمها لسيرفر اللوحات. مقيس على ١٣٧ نافذة ميدانية: ~٣٤٪ من الـWAV (المضغوط لوحده ٥٩٪)؛ النافذة المبنية مختلفة في ~٠.١٢٪
 * من العيّنات بـ١/٣٢٧٦٨.
 *
 * 🛟 **أي مشكلة ⇒ نفس الطلب يتبعت كامل على الطريق القديم** (نفس النافذة بالظبط):
 *  · ٤٠٩ (الجزء القديم مش عند السيرفر — طلب قبله وقع) ⇒ الطلب الجاي يبعت مداه كامل.
 *  · الوسيط مش واصل/وقع/أي كود تاني ⇒ «الجديد بس» يتقفل دقيقة.
 *  · الإعادة بعد وقعة النت والجسّات ⇒ الطريق القديم على طول.
 */

/**
 * 🟢 للكل — المالك (٢٦ نوفمبر ٢٠٢٦): «طيب انشرة للكل». الرجوع الفوري من غير نشر: وقّف الوسيط على إيطاليا
 * (`pkill -f /root/serving/delta_gateway.py` + شيل سطر `delta-supervise.sh` من الكرون) ⇒ كل الموبايلات بترجع للطريق القديم لوحدها.
 * أو هنا `false` (نشر).
 */
export const VOICE_DELTA_FOR_ALL = true;

export function voiceDeltaFor(isSuper: boolean): boolean {
  return VOICE_DELTA_FOR_ALL || isSuper === true;
}

/** مسار ‎/d/‎ على نفق المجمّع ⇒ 127.0.0.1:8790 (`serving/delta_gateway.py`) */
export const DELTA_URL = "https://batch.qannas-ksa.com/d/transcribe";
/** الوسيط وقع ⇒ مانجرّبهوش تاني قبل دقيقة (كل النوافذ على الطريق القديم من غير تأخير) */
export const DELTA_OFF_MS = 60_000;
/** مهلة قصيرة ومحاولة واحدة — لو مش رادد، الطريق القديم يلحق النافذة بدري */
export const DELTA_TIMEOUT_MS = 5_000;

const SCALE24 = 8388607;

/** خام الميك (float32) ⇒ ٢٤-بت صحيح (نفس الحساب اللي الوسيط بيرجّعه: ÷ ٨٣٨٨٦٠٧). */
export function quantize24(raw: Float32Array): Int32Array {
  const out = new Int32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] > 1 ? 1 : raw[i] < -1 ? -1 : raw[i];
    out[i] = Math.round(s * SCALE24);
  }
  return out;
}

/** معرّف جلسة عشوائي (حروف وأرقام، ١٦+) — بيتغيّر مع كل «ابدأ». */
export function newDeltaSid(rand: () => number = Math.random): string {
  let s = "";
  try {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    for (const x of b) s += x.toString(36).padStart(2, "0");
  } catch {
    for (let i = 0; i < 12; i++) s += Math.floor(rand() * 1296).toString(36).padStart(2, "0");
  }
  return s;
}

export interface DeltaWindow { a: number; b: number; u: number; rate: number }

export function deltaUrl(base: string, sid: string, w: DeltaWindow): string {
  return `${base}?sid=${encodeURIComponent(sid)}&a=${w.a}&b=${w.b}&u=${w.u}&rate=${w.rate}`;
}

/** الفشل ده معناه إيه؟ ٤٠٩ = الجزء القديم ناقص (الطلب الجاي يبعت كامل) · غيره = الوسيط مش تمام (دقيقة على القديم). */
export function deltaFailureKind(code: string | null | undefined): "missing" | "down" {
  return code === "http_409" ? "missing" : "down";
}

/**
 * لحد فين اتبعت صوت الجلسة (`sentEnd`) — **متفائل**: بيتحدّث لحظة الإرسال، فالنافذة اللي بعدها بتبعت الجديد بس حتى لو اللي
 * قبلها لسه في الطريق (الوسيط بيستنى الجزء الناقص ١.٥ث). فشل ⇒ يترجع.
 */
export class DeltaState {
  private sentEnd = -1;
  private offUntil = 0;

  constructor(readonly sid: string) {}

  usable(now: number): boolean {
    return now >= this.offUntil;
  }

  /** بداية اللي هيتبعت للنافذة [a, b): كله لو مافيش حاجة متبعتة جوّاها، وإلا من آخر المتبعت. */
  plan(a: number, b: number): number {
    if (this.sentEnd <= a) return a;
    return Math.min(this.sentEnd, b);
  }

  sent(b: number): void {
    if (b > this.sentEnd) this.sentEnd = b;
  }

  /** ٤٠٩ — النافذة الجاية تبعت مداها كامل */
  missing(): void {
    this.sentEnd = -1;
  }

  /** الوسيط مش تمام ⇒ دقيقة على الطريق القديم */
  down(now: number): void {
    this.offUntil = now + DELTA_OFF_MS;
    this.sentEnd = -1;
  }
}

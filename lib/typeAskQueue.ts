/**
 * ══════════════════════════════════════════════════════════════════════
 *  🛡️ طابور أسئلة كوهير على موبايل المندوب — «Voice PRO» (٢٣ أكتوبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك فتح النوع والملاحظة للكل. كل سؤال بيرفع نافذة ٥ث (~١٦٠ك) و~٢.٥ سؤال للوحة — ومن غير ترتيب، النت الضعيف
 * كان هيتزحم برفع كوهير **قدام** رفع نوافذ اللوحات نفسها فاللوحة تتأخر (قاعدة المالك: سرعة اللوحة أولاً).
 *  · **سؤال واحد في المرة** — الباقي بيستنى.
 *  · الطابور سقفه `TYPE_ASK_MAX_PENDING` — بيتشال الأقدم من **الإضافيين** (النوافذ اللي بعد اللوحة) الأول.
 *  · كوهير مزحوم (503) أو النت فصل ⇒ **تهدية** `TYPE_ASK_BACKOFF_MS`: الإضافيين بيتسابوا، والأساسي (نافذة اللوحة
 *    نفسها) بيستنى ويتسأل بعدها.
 *  · سؤال معلّق أكتر من `TYPE_ASK_TIMEOUT_MS` بيتساب (الطابور مايقفش).
 */
export type TypeAskResult = "ok" | "busy" | "fail";

export const TYPE_ASK_MAX_PENDING = 4;
export const TYPE_ASK_BACKOFF_MS = 10_000;
export const TYPE_ASK_TIMEOUT_MS = 8_000;

export class TypeAskQueue<J extends { primary: boolean }> {
  private pending: J[] = [];
  private busy = false;
  private calmUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private run: (job: J) => Promise<TypeAskResult>,
    private now: () => number = () => Date.now(),
  ) {}

  get pendingCount(): number {
    return this.pending.length;
  }

  push(job: J): void {
    this.pending.push(job);
    while (this.pending.length > TYPE_ASK_MAX_PENDING) {
      const i = this.pending.findIndex((j) => !j.primary);
      this.pending.splice(i >= 0 ? i : 0, 1);
    }
    this.kick();
  }

  clear(): void {
    this.pending = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private kick(): void {
    if (this.busy || !this.pending.length) return;
    const t = this.now();
    if (t < this.calmUntil) {
      // التهدية: الإضافيين بيتسابوا · الأساسي بيستنى لحد ما تخلص
      this.pending = this.pending.filter((j) => j.primary);
      if (this.pending.length && !this.timer) {
        this.timer = setTimeout(() => { this.timer = null; this.kick(); }, this.calmUntil - t + 1);
      }
      return;
    }
    const job = this.pending.shift()!;
    this.busy = true;
    let done = false;
    const end = (r: TypeAskResult) => {
      if (done) return;
      done = true;
      this.busy = false;
      if (r !== "ok") this.calmUntil = this.now() + TYPE_ASK_BACKOFF_MS;
      this.kick();
    };
    const guard = setTimeout(() => end("fail"), TYPE_ASK_TIMEOUT_MS);
    this.run(job).then(
      (r) => { clearTimeout(guard); end(r); },
      () => { clearTimeout(guard); end("fail"); },
    );
  }
}

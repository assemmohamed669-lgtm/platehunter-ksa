/**
 * ==========================================================================
 *  فكّ الإجماع الحيّ — لمحرك VoiceX المستقل (منقول من معمل الصوت، مقيس)
 * ==========================================================================
 *
 *  المشكلة المقيسة (٢٧ أغسطس، على صوت محجوز LOAO):
 *   · القصّ نبضة‑بنبضة بيضيّع ~١٠٪ (لوحات على حواف النوافذ) → استحضار ٨٩٪.
 *   · النوافذ المتداخلة بترفعه ٩٩٪ **بس** بتقرا نفس اللوحة كذا مرة (توائم).
 *
 *  الحل: نجمّع القراءات المتداخلة في **عناقيد** (نفس ٣ الحروف + قريبة زمنياً)،
 *  ونصوّت على الإملاء الصح، و**عدد النوافذ اللي اتّفقت (التعدّد)** = إشارة
 *  «حقيقي مش هلوسة». لوحة اتقرت في نافذتين+ = 🟢 مؤكّدة؛ قراءة مفردة/ثقة
 *  منخفضة = 🟡 للمراجعة.
 *
 *  ⚠️ **التمييز بالأرقام ممنوع** (مقيس ٢٥ أغسطس: أسطول بنفس الحروف ررم/رحص
 *  اتشال منه لوحات حقيقية). فاللوحات اللي بنفس ٣ الحروف بس **بعيدة زمنياً**
 *  (خارج نافذة العنقود) = لوحات مختلفة، مابتتدمجش. اللي جوّه نافذة واحدة بس
 *  وأرقامها قريبة = نفس النطق اتقرا مرتين → تصويت.
 */

/** قراءة واحدة من نافذة: لوحة مطبّعة (٣ حروف + أرقام)، لحظتها، ثقتها ٠..١ */
export interface PlateRead {
  plate: string;
  tMs: number;
  conf: number;
  /** أضعف توكن (min_logprob) — لحاجز الاختراع على القراءة المفردة (اختياري). */
  minLp?: number;
}

export type Tier = "green" | "yellow";

export interface CommittedPlate {
  plate: string;
  tier: Tier;
  /** عدد القراءات اللي اتّفقت في العنقود */
  mult: number;
  /** أعلى ثقة في العنقود (٠..١) */
  conf: number;
  tMs: number;
}

interface Cluster {
  letters: string;
  tMs: number;
  times: number[];
  /** إملاء كامل → {عدد مرات ظهوره، مجموع ثقته، أعلى ثقة مفردة} */
  spellings: Map<string, { count: number; confSum: number; maxConf: number; minLps: number[] }>;
  confs: number[];
  minLps: number[];
  lastMs: number;
  committed: boolean;
}

const LETTERS_RE = /^[ء-ي]{3}/;
function lettersOf(plate: string): string {
  const m = plate.match(LETTERS_RE);
  return m ? m[0] : plate.slice(0, 3);
}

export interface ConsensusOptions {
  /**
   * أقصى **فجوة بين قراءتين متتاليتين** في نفس العنقود (single-linkage).
   * لازم تبقى أكبر من خطوة الزحلقة (~١.٥ث) وأصغر من إيقاع نطق اللوحة (~٣.٤ث)
   * عشان قراءات اللوحة الواحدة تتسلسل والأسطول بنفس الحروف يتفصل. الافتراضي ٢ث.
   */
  windowMs?: number;
  /** العنقود «مستقر» (جاهز للاعتماد) لما تعدّي المدة دي بلا قراءة جديدة. الافتراضي ١.٨ث */
  stableMs?: number;
  /** التعدّد المطلوب للأخضر (اتقرت في كام نافذة). الافتراضي ٢ */
  greenMinMult?: number;
  /** لو التعدّد ١ بس والثقة ≥ ده → برضه أخضر. الافتراضي ٠.٩٥ */
  greenSoloConf?: number;
  /**
   * الحد الأدنى لثقة قراءة **نافذة-واحدة** عشان تظهر أصلاً. تحته = بتتحجب
   * (اختراع وقفة/انتقال). الافتراضي ٠.٦ — مقيس: اللوحات الحقيقية النافذة-
   * الواحدة ثقتها ≥٠.٩، والاختراعات ≤٠.٦٢، فالفجوة نضيفة.
   */
  minSoloConf?: number;
  /**
   * حاجز الاختراع على القراءة **المفردة** بس: لوحة اتقرت مرة واحدة (mult <
   * greenMinMult) وأضعف توكن فيها أقل من ده = احتمال تلفيق → تتحجب. اللوحة
   * اللي اتأكدت في نافذتين+ **تعدّي مهما كانت** (لأن الاتفاق دليل إنها حقيقية).
   * مقيس: min_logprob للوحات الحقيقية في النوافذ المتداخلة وسيطه -0.5 (مش زي
   * المقاطع النضيفة)، فالحاجز على الكل بيرمي نص اللوحات الحقيقية؛ عليها مفردة بس آمن.
   */
  soloMinLp?: number;
}

/**
 * مجمّع الإجماع الحيّ. بنغذّيه بقراءات النوافذ المتداخلة أول بأول،
 * و`drain(now)` بيرجّع اللوحات اللي **استقرّت** (مبقّاش ليها قراءات جديدة)
 * مع تصنيفها 🟢/🟡. كل لوحة بترجع **مرة واحدة**.
 */
export class LiveConsensus {
  private clusters: Cluster[] = [];
  private readonly windowMs: number;
  private readonly stableMs: number;
  private readonly greenMinMult: number;
  private readonly greenSoloConf: number;
  private readonly minSoloConf: number;
  private readonly soloMinLp: number;

  constructor(opts: ConsensusOptions = {}) {
    this.windowMs = opts.windowMs ?? 2000;
    this.stableMs = opts.stableMs ?? 1800;
    this.greenMinMult = opts.greenMinMult ?? 2;
    this.greenSoloConf = opts.greenSoloConf ?? 0.95;
    this.minSoloConf = opts.minSoloConf ?? 0.6;
    this.soloMinLp = opts.soloMinLp ?? -0.5;
  }

  /** أضف قراءة نافذة واحدة (لوحة واحدة). */
  add(read: PlateRead): void {
    const letters = lettersOf(read.plate);
    // ألاقي عنقود مفتوح بنفس الحروف وقريب من **آخر قراءة فيه** (single-linkage):
    // قراءات نفس اللوحة بتيجي كل خطوة زحلقة (~١.٥ث) فبتتسلسل؛ والأسطول بنفس
    // الحروف بيبقى بينه وبين اللي بعده إيقاع نطق (~٣.٤ث) فبيتفصل. المقارنة
    // بآخر قراءة (مش المتوسط) بتمنع «انجراف المتوسط» اللي كان بيقسّم اللوحة.
    let target: Cluster | null = null;
    for (const cl of this.clusters) {
      if (cl.committed) continue;
      if (cl.letters === letters && Math.abs(read.tMs - cl.lastMs) <= this.windowMs) {
        target = cl;
        break;
      }
    }
    if (!target) {
      target = {
        letters,
        tMs: read.tMs,
        times: [],
        spellings: new Map(),
        confs: [],
        minLps: [],
        lastMs: read.tMs,
        committed: false,
      };
      this.clusters.push(target);
    }
    target.times.push(read.tMs);
    target.tMs = target.times.reduce((a, b) => a + b, 0) / target.times.length;
    const cur = target.spellings.get(read.plate) ?? { count: 0, confSum: 0, maxConf: -Infinity, minLps: [] };
    cur.count += 1;
    cur.confSum += read.conf;
    cur.maxConf = Math.max(cur.maxConf, read.conf);
    if (typeof read.minLp === "number") cur.minLps.push(read.minLp);
    target.spellings.set(read.plate, cur);
    target.confs.push(read.conf);
    if (typeof read.minLp === "number") target.minLps.push(read.minLp);
    target.lastMs = Math.max(target.lastMs, read.tMs);
  }

  /**
   * رجّع اللوحات اللي استقرّت لغاية `nowMs` (عدّى عليها `stableMs` بلا قراءة
   * جديدة) وصنّفها. بتترجّع مرة واحدة بس.
   */
  drain(nowMs: number): CommittedPlate[] {
    const out: CommittedPlate[] = [];
    for (const cl of this.clusters) {
      if (cl.committed) continue;
      if (nowMs - cl.lastMs < this.stableMs) continue;
      cl.committed = true;
      out.push(...this.finalize(cl));
    }
    return out;
  }

  /** اعتمد كل العناقيد المفتوحة فوراً (عند إيقاف التسجيل). */
  flush(): CommittedPlate[] {
    const out: CommittedPlate[] = [];
    for (const cl of this.clusters) {
      if (cl.committed) continue;
      cl.committed = true;
      out.push(...this.finalize(cl));
    }
    return out;
  }

  private finalize(cl: Cluster): CommittedPlate[] {
    /**
     * الإملاء = صاحب **أعلى ثقة مفردة** (مش مجموع الثقة ولا الأكثر تكراراً).
     *
     * ⚠️ **درس مقيس (٢٩ أغسطس، صوت محمد عفيفي المتدرَّب عليه):** لما النافذة
     * بتقطع اللوحة، الموديل بيقرا أرقام غلط، وعلى الصوت اللايف الغلط ده أوقات
     * بيتكرّر في نوافذ **أكتر** من الصح — فمجموع الثقة (زي التكرار) بياخد الغلط.
     * لكن القراءة الكاملة الصحيحة بتبقى في النافذة اللي **إطارها ظبط اللوحة**،
     * وثقتها المفردة أعلى من أي غلط. فاختيار أعلى ثقة مفردة رفع الدقة من
     * **٣٣٪ لـ٨٥٪**. (المجموع كان بيتصرّف زي التكرار وبيضيّع الصح.)
     */
    /**
     * ⚠️ **كل إملاء مختلف = لوحة مختلفة** (قرار المالك ٢٠٢٦-٠٩-٢١:
     * «لو قال أسطول سيارات لشركة وفيها اختلاف فقط في آخر رقم بردو يطلعوا،
     *   أي لوحات يقولها المندوب تطلع»).
     *
     * كان فيه دمج للإملاءات اللي فرقها **خانة واحدة** على إنها ضجيج نافذة
     * لنفس النطق. القاعدة دي كانت بتاكل أساطيل حقيقية: ربع4821 و ربع4822
     * و ربع4823 (أرقام متتالية، مركونين ورا بعض) كانوا بيطلعوا **لوحة واحدة**.
     * وفي محفظة المالك ٧٦٪ من اللوحات بتشارك حروفها مع لوحة تانية — فالحالة
     * دي هي القاعدة مش الاستثناء.
     *
     * الثمن المعروف والمقبول: النطق الواحد اللي النافذة قطعته وقراه الموديل
     * برقم غلط هيطلّع لوحة زيادة. الحماية: اللوحة الزيادة مابتدقّش جرس إلا لو
     * طابقت ملف التشييك **بالظبط**، وحواجز الاختراع (الثقة/أضعف توكن) لسه
     * شغّالة على كل إملاء اتقرا مرة واحدة.
     */
    type G = { best: string; totalCount: number; maxConf: number; minLps: number[] };
    const entries = [...cl.spellings.entries()].sort((a, b) => b[1].maxConf - a[1].maxConf);
    const groups: G[] = entries.map(([spelling, sp]) => ({
      best: spelling,
      totalCount: sp.count,
      maxConf: sp.maxConf,
      minLps: sp.minLps,
    }));

    const out: CommittedPlate[] = [];
    for (const g of groups) {
      const solo = g.totalCount < this.greenMinMult;
      /**
       * 🔴 حاجز الاختراع (مقيس ٣١ أغسطس): قراءة **نافذة-واحدة** بثقة واطية
       * جداً = اختراع في الوقفة/الانتقال بين لوحتين (ردس8211 ثقته ٠.٣٥).
       * اللوحات الحقيقية النافذة-الواحدة ثقتها ≥٠.٩. اللي اتأكدت في نافذتين+
       * بتعدّي مهما كانت — الاتفاق نفسه دليل إنها حقيقية.
       */
      if (solo && g.maxConf < this.minSoloConf) continue;
      /** وحاجز التلفيق على القراءة المفردة: أضعف توكن واطي جداً = احتمال اختراع. */
      if (solo && g.minLps.length && Math.max(...g.minLps) < this.soloMinLp) continue;
      out.push({
        plate: g.best,
        tier: !solo || g.maxConf >= this.greenSoloConf ? "green" : "yellow",
        mult: g.totalCount,
        conf: g.maxConf,
        tMs: cl.tMs,
      });
    }
    return out;
  }

  reset(): void {
    this.clusters = [];
  }
}

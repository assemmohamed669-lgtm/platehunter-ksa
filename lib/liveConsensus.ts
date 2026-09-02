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
  spellings: Map<string, { count: number; confSum: number; maxConf: number }>;
  confs: number[];
  lastMs: number;
  committed: boolean;
}

const LETTERS_RE = /^[ء-ي]{3}/;
function lettersOf(plate: string): string {
  const m = plate.match(LETTERS_RE);
  return m ? m[0] : plate.slice(0, 3);
}

/** عدد الخانات المختلفة بين أرقام لوحتين (نفس الحروف). ≤١ = ضجيج نافذة لنفس
 *  النطق؛ ≥٢ = أرقام مختلفة فعلاً. لو الطول مختلف = مختلفين شكلاً. */
function digitDist(a: string, b: string): number {
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (da.length !== db.length) return Math.max(da.length, db.length);
  let d = 0;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) d++;
  return d;
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

  constructor(opts: ConsensusOptions = {}) {
    this.windowMs = opts.windowMs ?? 2000;
    this.stableMs = opts.stableMs ?? 1800;
    this.greenMinMult = opts.greenMinMult ?? 2;
    this.greenSoloConf = opts.greenSoloConf ?? 0.95;
    this.minSoloConf = opts.minSoloConf ?? 0.6;
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
        lastMs: read.tMs,
        committed: false,
      };
      this.clusters.push(target);
    }
    target.times.push(read.tMs);
    target.tMs = target.times.reduce((a, b) => a + b, 0) / target.times.length;
    const cur = target.spellings.get(read.plate) ?? { count: 0, confSum: 0, maxConf: -Infinity };
    cur.count += 1;
    cur.confSum += read.conf;
    cur.maxConf = Math.max(cur.maxConf, read.conf);
    target.spellings.set(read.plate, cur);
    target.confs.push(read.conf);
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
    // نجمّع الإملاءات في **مجموعات أرقام** (فرق ≤١ خانة = نفس النطق، ضجيج نافذة).
    type G = { rep: string; totalCount: number; maxConf: number; best: string; bestConf: number };
    const groups: G[] = [];
    const entries = [...cl.spellings.entries()].sort(
      (a, b) => b[1].maxConf - a[1].maxConf
    );
    for (const [spelling, s] of entries) {
      let g = groups.find((g) => digitDist(g.rep, spelling) <= 1);
      if (!g) {
        g = { rep: spelling, totalCount: 0, maxConf: -Infinity, best: spelling, bestConf: -Infinity };
        groups.push(g);
      }
      g.totalCount += s.count;
      g.maxConf = Math.max(g.maxConf, s.maxConf);
      if (s.maxConf > g.bestConf) {
        g.bestConf = s.maxConf;
        g.best = spelling;
      }
    }

    /**
     * ⚠️ **تقسيم لوحتين بنفس الحروف اتنطقوا ورا بعض (مقيس ٢٩ أغسطس).**
     * الأساطيل المتباعدة زمنياً بتتفصل بالتوقيت لوحده. لكن لو المندوب قال
     * لوحتين بنفس ٣ الحروف **بسرعة** (فرق زمني < نافذة العنقود) بيتدمجوا
     * وواحدة بتضيع (دوا7299 + دوا7116 → واحدة). الإشارة الآمنة اللي بتفرّقهم
     * عن ضجيج النافذة: **كل مجموعة أرقام ظهرت ٢+ مرة (ثابتة)**. ضجيج النطق
     * الواحد بيظهر مرة واحدة، فمابيتقسمش. ده بيسترجع اللوحة الضايعة من غير
     * ما يقسّم أسطول (لسه محمي بالتوقيت + شرط الثبات).
     */
    const stable = groups.filter((g) => g.totalCount >= this.greenMinMult);
    if (stable.length >= 2) {
      return stable.map((g) => ({
        plate: g.best,
        tier: "green" as Tier,
        mult: g.totalCount,
        conf: g.maxConf,
        tMs: cl.tMs,
      }));
    }

    // الحالة العادية: إملاء واحد بأعلى ثقة، mult = كل قراءات العنقود (زي ما كان).
    const best = entries.length ? entries[0][0] : "";
    const mult = cl.times.length;
    const conf = cl.confs.length ? Math.max(...cl.confs) : 0;
    /**
     * 🔴 **حاجز الاختراع (مقيس ٣١ أغسطس).** قراءة **نافذة-واحدة** بثقة واطية
     * جداً = اختراع في الوقفة/الانتقال بين لوحتين (ردس8211 ثقته ٠.٣٥). اللوحات
     * الحقيقية النافذة-الواحدة ثقتها ≥٠.٩ (دبر2898=٠.٩٠)، والمتعددة كلها ≥٠.٨؛
     * وكل ما ظهر تحت ٠.٦ نافذة-واحدة كان اختراع/رفرفة خسرانة. فبنحجبها هنا —
     * بيشيل الاختراع بلا خسارة لوحة حقيقية.
     */
    if (mult < this.greenMinMult && conf < this.minSoloConf) return [];
    const green = mult >= this.greenMinMult || conf >= this.greenSoloConf;
    return [{ plate: best, tier: green ? "green" : "yellow", mult, conf, tMs: cl.tMs }];
  }

  reset(): void {
    this.clusters = [];
  }
}

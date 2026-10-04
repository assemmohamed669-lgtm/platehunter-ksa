/**
 * 📊 **إحصائيات الشهايد** (منطق نقي — من غير درايف).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم
 * شهادة وعايز كم شهادة اترفعت يوميا». وبعد أول نسخة: «مش عايز التأخير دة يحصل … عايز كل
 * الشهادات ميسيبش ولا شهادة ويجيب اسم الشركه بالظبط اللي منزله الشهادة … انا مش عايز
 * العدد يكون ناقص». فـ:
 *  · **الشهادة** = أي PDF على درايف (من غير المحذوف) — زي ما بحث الشهادة بيدوّر. كان اللي
 *    اسمه مش لوحة بيتساب.
 *  · **الشركة** = **الحساب اللي رفع الملف** (صاحبه؛ ولو في درايف مشترك مالوش صاحب ⇒ آخر حد
 *    عدّله = اللي رفعه) — باسمه وإيميله. كان اسم الفولدر، وفولدر زي «الشهادات» مابيقولش مين.
 *  · **اليوم** = يوم رفع الملف بتوقيت السعودية (UTC+3، مفيش توقيت صيفي).
 *  · **العدّ** = فترات بتاريخ الرفع بتتعدّ **مع بعض** (`countAll`)، والفترة اللي فيها ملفات
 *    كتير بتتقسم لوحدها (`stepFromPage` ⇒ `splitRange`). مافيش حد أقصى، وخطوة فشلت ⇒ العدّ
 *    كله بيفشل — يا رقم كامل يا مفيش رقم جديد.
 */

export const UNKNOWN_UPLOADER = "من غير اسم الرافع";

export interface DriveUserLite { displayName?: string; emailAddress?: string }
/** اللي محتاجينه من ملف درايف (`fields` في `/api/admin/cert-stats/files`). */
export interface StatFile { createdTime?: string; owners?: DriveUserLite[]; lastModifyingUser?: DriveUserLite }

/** الرافع (إيميله، أو اسمه لو الإيميل مخفي) ← اسمه. */
export type PeopleMap = Record<string, string>;
/** الرافع ← اليوم ← عدد الشهايد. */
export type CompanyDayCounts = Record<string, Record<string, number>>;

/**
 * فترة بتاريخ الرفع: من `after` (شاملة) لحد `until` (مش شاملة) — "" = من غير حد.
 * `verify` = خطوة تأكيد (`countAll`) — مابتتجمعش في العدّ.
 */
export interface CountTask { after: string; until: string; token?: string; verify?: boolean }

/** رد خطوة (صفحة واحدة من درايف). */
export interface StepResult {
  counts: CompanyDayCounts;
  people: PeopleMap;
  /** كام ملف اتعدّ في الخطوة دي. */
  n: number;
  /** نفس الفترة لسه فيها — كمّل بالعلامة دي. */
  next: string | null;
  /** نفس الفترة لسه فيها من اللحظة دي (شاملة) — اتعدّ اللي قبلها بس، والباقي يتقسم. */
  resume: string | null;
}

export interface CertStats {
  /** كل الشهايد لكل الشركات. */
  total: number;
  /** كل حساب رفع: إجماليه وآخر `days` يوم — الأكتر فوق. */
  companies: { name: string; email: string; total: number; last30: number }[];
  /** كل يوم من النهارده لورا `days` يوم — الأحدث فوق، والأيام الفاضية صفر. */
  daily: { day: string; total: number; byCompany: { name: string; count: number }[] }[];
}

/** المحفوظ على الموبايل — بيظهر على طول، والصفحة بتعدّ من جديد في الخلفية. */
export interface CertStatsCache {
  v: 2;
  counts: CompanyDayCounts;
  people: PeopleMap;
  n: number;
  /** إمتى العدّ الكامل ده خلص. */
  at: string;
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** «YYYY-MM-DD» بتوقيت السعودية — "" لو التاريخ بايظ. */
export function riyadhDay(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** اللي رفع الملف: صاحبه، ولو مالوش (درايف مشترك) آخر حد عدّله. */
export function uploaderOf(f: StatFile): { key: string; name: string } {
  const u = f.owners?.[0] ?? f.lastModifyingUser;
  const email = (u?.emailAddress ?? "").trim();
  const name = (u?.displayName ?? "").trim();
  return { key: email || name, name: name || email };
}

/** أقل عدد لحظات مختلفة في الصفحة عشان نقسم — صفحة فيها لحظات قليلة «مترتّبة» ممكن تبقى صدفة. */
const MIN_CUT_TIMES = 10;

/**
 * السيرفر: صفحة من درايف (مطلوبة مترتّبة بتاريخ الرفع) ⇒ عدّ.
 *  · آخر صفحة ⇒ الكل.
 *  · فيه بعدها والصفحة مترتّبة فعلاً ⇒ اللي **قبل** آخر لحظة فيها بس، و`resume` = آخر لحظة:
 *    الباقي (من اللحظة دي، شاملة — فاللي في نفس اللحظة مايتعدّش مرتين ولا يتساب) بيتقسم
 *    فترات تتعدّ مع بعض بدل ما يستنى صفحة ورا صفحة.
 *  · مش مترتّبة / لحظات قليلة / `cut=false` ⇒ الكل، ونكمّل بالعلامة (`next`).
 */
export function stepFromPage(files: readonly StatFile[], next: string | null, after: string, cut = true): StepResult {
  let counted: readonly StatFile[] = files;
  let resume: string | null = null;
  if (cut && next && files.length >= MIN_CUT_TIMES) {
    const times = files.map((f) => f.createdTime);
    const sorted = times.every((t, i) => typeof t === "string" && (i === 0 || t >= times[i - 1]!));
    const first = times[0]!, last = times[times.length - 1]!;
    if (sorted && new Set(times).size >= MIN_CUT_TIMES && (!after || first >= after)) {
      resume = last;
      counted = files.filter((f) => f.createdTime! < last);
    }
  }
  const counts: CompanyDayCounts = {};
  const people: PeopleMap = {};
  for (const f of counted) {
    const { key, name } = uploaderOf(f);
    if (key && name) people[key] = name;
    const day = riyadhDay(f.createdTime ?? "") || "?";
    const byDay = counts[key] ?? (counts[key] = {});
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  return { counts, people, n: counted.length, next: resume ? null : next, resume };
}

const DAY_MS = 86_400_000;

/**
 * أول فترات العدّ: أكتر تفصيل في الأيام الأخيرة (اللي فيها الرفع غالباً) — قبل النهارده بيوم،
 * يومين، ٤، ٨ … ١٠٢٤ يوم، وقبل كده كله فترة واحدة. الأولى من غير بداية والأخيرة من غير نهاية.
 */
export function countRanges(now: Date): CountTask[] {
  const cuts: string[] = [];
  for (let d = 1024; d >= 1; d /= 2) cuts.push(new Date(now.getTime() - d * DAY_MS).toISOString());
  const out: CountTask[] = [];
  let after = "";
  for (const c of cuts) { out.push({ after, until: c }); after = c; }
  out.push({ after, until: "" });
  return out;
}

const SPLIT_PARTS = 4;

/** الباقي من `after` لحد `until` (أو لحد دلوقتي لو من غير نهاية) ⇒ ٤ فترات متلاصقة. */
export function splitRange(after: string, until: string, nowMs: number): CountTask[] {
  const start = Date.parse(after);
  const end = until ? Date.parse(until) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < SPLIT_PARTS) return [{ after, until }];
  const out: CountTask[] = [];
  let from = after;
  for (let i = 1; i < SPLIT_PARTS; i++) {
    const cut = new Date(start + Math.floor(((end - start) * i) / SPLIT_PARTS)).toISOString();
    out.push({ after: from, until: cut });
    from = cut;
  }
  out.push({ after: from, until });
  return out;
}

/** حارس: درايف بيرجّع علامات من غير آخر. */
const MAX_STEPS = 50_000;
const ORDER_MISMATCH = "order_mismatch";

type Counted = { counts: CompanyDayCounts; people: PeopleMap; n: number };

/**
 * عدّ الأرشيف كله: الفترات بتتعدّ مع بعض (`concurrency` خطوة في نفس الوقت)، والفترة اللي
 * لسه فيها بتتقسم أو بتكمّل بالعلامة. خطوة فشلت ⇒ بيرمي (مافيش نتيجة ناقصة).
 *
 * التقسيم معتمد على إن درايف بيرتّب بتاريخ الرفع **على كل الصفحات**. أول تقسيم بيتأكّد منه:
 * الفترة اللي اتعدّت من أول صفحة بتتعدّ تاني لوحدها صفحة صفحة — لو العدد مختلف، الترتيب مش
 * مضمون ⇒ العدّ كله بيتعاد من غير تقسيم (أبطأ بس بالظبط).
 */
export function countAll(
  step: (t: CountTask, cut: boolean) => Promise<StepResult>,
  opts: { now: Date; concurrency?: number; onProgress?: (n: number) => void },
): Promise<Counted> {
  const pass = (cut: boolean) => countPass(step, cut, opts);
  return pass(true).catch((e) => ((e as Error)?.message === ORDER_MISMATCH ? pass(false) : Promise.reject(e)));
}

function countPass(
  step: (t: CountTask, cut: boolean) => Promise<StepResult>,
  cut: boolean,
  opts: { now: Date; concurrency?: number; onProgress?: (n: number) => void },
): Promise<Counted> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const nowMs = opts.now.getTime();
  const queue = countRanges(opts.now);
  const counts: CompanyDayCounts = {};
  const people: PeopleMap = {};
  let n = 0, active = 0, steps = 0, failed = false;
  let verifyExpected: number | null = null, verifySum = 0;

  return new Promise((resolve, reject) => {
    const fail = (e: unknown) => { if (!failed) { failed = true; reject(e); } };
    const done = (t: CountTask, r: StepResult) => {
      if (t.verify) {
        // التأكيد بيعدّ صفحة صفحة (من غير تقسيم) ومابيتجمعش
        verifySum += r.n;
        if (r.next) queue.push({ ...t, token: r.next });
        else if (verifySum !== verifyExpected) return fail(new Error(ORDER_MISMATCH));
        return pump();
      }
      for (const [key, byDay] of Object.entries(r.counts)) {
        const into = counts[key] ?? (counts[key] = {});
        for (const [day, c] of Object.entries(byDay)) into[day] = (into[day] ?? 0) + c;
      }
      Object.assign(people, r.people);
      n += r.n;
      opts.onProgress?.(n);
      if (r.resume) {
        if (verifyExpected === null && !t.token) {
          verifyExpected = r.n;
          queue.push({ after: t.after, until: r.resume, verify: true });
        }
        queue.push(...splitRange(r.resume, t.until, nowMs));
      } else if (r.next) {
        queue.push({ after: t.after, until: t.until, token: r.next });
      }
      pump();
    };
    const pump = () => {
      if (failed) return;
      if (!queue.length && !active) { resolve({ counts, people, n }); return; }
      while (active < concurrency && queue.length) {
        if (++steps > MAX_STEPS) { fail(new Error("too_many_steps")); return; }
        const t = queue.shift()!;
        active++;
        step(t, cut && !t.verify).then(
          (r) => { active--; if (!failed) done(t, r); },
          (e) => { active--; fail(e); },
        );
      }
    };
    pump();
  });
}

const byCountThenName = (a: { name: string; n: number }, b: { name: string; n: number }) =>
  b.n - a.n || a.name.localeCompare(b.name, "ar");

/** الإحصائيات من العدّ المتجمّع. */
export function statsFromCounts(counts: CompanyDayCounts, people: PeopleMap, now: Date, days = 30): CertStats {
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) dayKeys.push(riyadhDay(new Date(now.getTime() - i * DAY_MS).toISOString()));
  const inWindow = new Set(dayKeys);
  const nameOf = (key: string) => people[key] || key || UNKNOWN_UPLOADER;

  let total = 0;
  const companies: { name: string; email: string; n: number; last30: number }[] = [];
  for (const [key, byDay] of Object.entries(counts)) {
    let n = 0, last30 = 0;
    for (const [day, c] of Object.entries(byDay)) {
      n += c;
      if (inWindow.has(day)) last30 += c;
    }
    if (!n) continue;
    total += n;
    companies.push({ name: nameOf(key), email: key.includes("@") ? key : "", n, last30 });
  }

  return {
    total,
    companies: companies.sort(byCountThenName).map(({ name, email, n, last30 }) => ({ name, email, total: n, last30 })),
    daily: dayKeys.map((day) => {
      const byCompany = Object.entries(counts)
        .map(([key, byDay]) => ({ name: nameOf(key), n: byDay[day] ?? 0 }))
        .filter((x) => x.n > 0)
        .sort(byCountThenName)
        .map(({ name, n }) => ({ name, count: n }));
      return { day, total: byCompany.reduce((s, x) => s + x.count, 0), byCompany };
    }),
  };
}

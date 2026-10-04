/**
 * 📊 **إحصائيات الشهايد** (منطق نقي — من غير درايف ولا داتابيز).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم شهادة
 * وعايز كم شهادة اترفعت يوميا» — وبعدين: «مش عايز التأخير دة … عايز كل الشهادات ميسيبش ولا
 * شهادة ويجيب اسم الشركه بالظبط اللي منزله الشهادة … مش عايز العدد يكون ناقص». ولما العدّ من
 * الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف ملف («اللوحات اللي موجوده في كل الشركات ميكملوش نص
 * الرقم دة»): العدّ اتنقل **للسيرفر في الخلفية** (`lib/certStatsJob.ts`) والصفحة بتعرض آخر
 * نتيجة على طول — **عدد الملفات** و**عدد اللوحات المختلفة** (كل لوحة مرة واحدة).
 *
 *  · **الملف** = أي بي دي إف على درايف (من غير المحذوف). **اللوحة** = اسم الملف لو رقم لوحة
 *    (`plateOf`) — نفس اللوحة بأي شكل كتابة = مفتاح واحد.
 *  · **الشركة** = الحساب اللي رفع الملف (صاحبه؛ ولو درايف مشترك آخر حد عدّله).
 *  · **اليوم** = يوم الرفع بتوقيت السعودية (UTC+3).
 *  · **العدّ الكامل** (`advancePass`) = فترات بتاريخ الرفع بتتعدّ مع بعض على كذا دورة، والحالة
 *    بتتحفظ بينهم. الفترة اللي فيها كتير بتتقسم عند **أول ثانية كاملة** (كل الحدود بالثانية،
 *    فمش فارق درايف بيقارن بالمللي ولا بالثانية). أول تقسيم بيتأكّد إن درايف مرتّب فعلاً، ولو لأ
 *    العدّ بيتعاد صفحة صفحة. خطوة فشلت ⇒ بتتعاد الدورة الجاية. يا عدّ كامل يا مفيش نتيجة جديدة.
 *  · **الجديد** بين العدّات الكاملة (`addNewFiles`): اللي اترفع من ربع ساعة قبل أحدث ملف
 *    (درايف ممكن يتأخّر في إظهار ملف)، واللي اتعدّ قبل كده بيتعرف بالـid فمابيتعدّش مرتين.
 */
import { plateCertKey } from "./certificateMatch";

export const UNKNOWN_UPLOADER = "من غير اسم الرافع";
/** التحديث بالجديد بيبص ورا كده — درايف ممكن يتأخّر في إظهار ملف اترفع. */
export const LOOKBACK_MS = 15 * 60_000;

export interface DriveUserLite { displayName?: string; emailAddress?: string }
/** اللي محتاجينه من ملف درايف. */
export interface StatFile {
  id?: string;
  name?: string;
  createdTime?: string;
  owners?: DriveUserLite[];
  lastModifyingUser?: DriveUserLite;
}

/** الرافع (إيميله، أو اسمه لو الإيميل مخفي) ← اسمه. */
export type PeopleMap = Record<string, string>;
/** الرافع ← اليوم ← عدد الملفات. */
export type CompanyDayCounts = Record<string, Record<string, number>>;

/**
 * فترة بتاريخ الرفع: من `after` (شاملة) لحد `until` (مش شاملة) — "" = من غير حد.
 * `verify` = خطوة تأكيد الترتيب — مابتتجمعش في العدّ.
 */
export interface CountTask { after: string; until: string; token?: string; verify?: boolean }

/** رد خطوة (صفحة واحدة من درايف). */
export interface StepResult {
  counts: CompanyDayCounts;
  people: PeopleMap;
  /** كام ملف اتعدّ. */
  n: number;
  /** [اللوحة، اللي رفع] — من غير تكرار في الصفحة. */
  pairs: [plate: string, uploader: string][];
  /** ملفات اسمها مش رقم لوحة. */
  notPlate: number;
  /** أحدث تاريخ رفع اتعدّ. */
  newest: string;
  /** [id، تاريخ الرفع] للي اترفع في آخر `LOOKBACK_MS` قبل أحدث ملف في الصفحة (لو `keepRecent`)
   *  — عشان التحديث بالجديد مايعدّهاش تاني. */
  recent: [id: string, createdTime: string][];
  /** نفس الفترة لسه فيها — كمّل بالعلامة دي. */
  next: string | null;
  /** نفس الفترة لسه فيها من الثانية دي (شاملة) — والباقي يتقسم. */
  resume: string | null;
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** «YYYY-MM-DD» بتوقيت السعودية — "" لو التاريخ بايظ. */
export function riyadhDay(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** نفس اللحظة من أول الثانية («…:SS.000Z») — كل حدود الفترات بالثانية الكاملة. */
export function floorSec(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(Math.floor(t / 1000) * 1000).toISOString() : iso;
}

/** اللي رفع الملف: صاحبه، ولو مالوش (درايف مشترك) آخر حد عدّله. */
export function uploaderOf(f: StatFile): { key: string; name: string } {
  const u = f.owners?.[0] ?? f.lastModifyingUser;
  const email = (u?.emailAddress ?? "").trim();
  const name = (u?.displayName ?? "").trim();
  return { key: email || name, name: name || email };
}

/** مفتاح اللوحة لو اسم الملف رقم لوحة (حروف ١–٤ + أرقام ١–٤)، وإلا "". */
export function plateOf(name: string | undefined): string {
  const key = plateCertKey(String(name ?? ""));
  const letters = key.replace(/[0-9]/g, "").length;
  const digits = key.replace(/[^0-9]/g, "").length;
  return letters >= 1 && letters <= 4 && digits >= 1 && digits <= 4 ? key : "";
}

function addCounts(into: CompanyDayCounts, from: CompanyDayCounts): void {
  for (const [key, byDay] of Object.entries(from)) {
    const target = into[key] ?? (into[key] = {});
    for (const [day, c] of Object.entries(byDay)) target[day] = (target[day] ?? 0) + c;
  }
}

/** أقل عدد لحظات مختلفة في الصفحة عشان نقسم — صفحة فيها لحظات قليلة «مترتّبة» ممكن تبقى صدفة. */
const MIN_CUT_TIMES = 10;

/**
 * السيرفر: صفحة من درايف (مطلوبة مترتّبة بتاريخ الرفع) ⇒ عدّ.
 *  · آخر صفحة ⇒ الكل.
 *  · فيه بعدها والصفحة مترتّبة فعلاً ⇒ اللي **قبل ثانية آخر ملف** بس، و`resume` = أول الثانية دي:
 *    الباقي (من أول الثانية، شاملة) بيتقسم فترات تتعدّ مع بعض.
 *  · مش مترتّبة / لحظات قليلة / كلها في نفس الثانية / `cut=false` ⇒ الكل، ونكمّل بالعلامة.
 */
export function stepFromPage(
  files: readonly StatFile[], next: string | null, after: string, cut = true, keepRecent = false,
): StepResult {
  let counted: readonly StatFile[] = files;
  let resume: string | null = null;
  if (cut && next && files.length >= MIN_CUT_TIMES) {
    const times = files.map((f) => f.createdTime);
    const sorted = times.every((t, i) => typeof t === "string" && (i === 0 || t >= times[i - 1]!));
    if (sorted && new Set(times).size >= MIN_CUT_TIMES) {
      const first = times[0]!;
      const cutAt = floorSec(times[times.length - 1]!);
      if (first < cutAt && (!after || first >= after)) {
        resume = cutAt;
        counted = files.filter((f) => f.createdTime! < cutAt);
      }
    }
  }

  const counts: CompanyDayCounts = {};
  const people: PeopleMap = {};
  const pairs: [string, string][] = [];
  const seenPairs = new Set<string>();
  let notPlate = 0;
  let newest = "";
  for (const f of counted) {
    const { key, name } = uploaderOf(f);
    if (key && name) people[key] = name;
    const t = f.createdTime ?? "";
    const day = riyadhDay(t) || "?";
    const byDay = counts[key] ?? (counts[key] = {});
    byDay[day] = (byDay[day] ?? 0) + 1;
    const plate = plateOf(f.name);
    if (plate) {
      const pk = plate + "\u0000" + key;
      if (!seenPairs.has(pk)) { seenPairs.add(pk); pairs.push([plate, key]); }
    } else {
      notPlate++;
    }
    if (t > newest) newest = t;
  }
  // أي ملف جوّه آخر ربع ساعة من أحدث ملف في الكل هو جوّه آخر ربع ساعة من أحدث ملف في صفحته
  const recent: [string, string][] = [];
  if (keepRecent && newest) {
    const since = new Date(Date.parse(newest) - LOOKBACK_MS).toISOString();
    for (const f of counted) if (f.id && f.createdTime && f.createdTime >= since) recent.push([f.id, f.createdTime]);
  }
  return { counts, people, n: counted.length, pairs, notPlate, newest, recent, next: resume ? null : next, resume };
}

/**
 * أول فترات العدّ: أكتر تفصيل في الأيام الأخيرة — قبل النهارده بيوم، يومين، ٤ … ١٠٢٤ يوم، وقبل
 * كده كله فترة واحدة. الأولى من غير بداية والأخيرة من غير نهاية. الحدود بالثانية الكاملة.
 */
export function countRanges(now: Date): CountTask[] {
  const cuts: string[] = [];
  for (let d = 1024; d >= 1; d /= 2) cuts.push(floorSec(new Date(now.getTime() - d * DAY_MS).toISOString()));
  const out: CountTask[] = [];
  let after = "";
  for (const c of cuts) { out.push({ after, until: c }); after = c; }
  out.push({ after, until: "" });
  return out;
}

const SPLIT_PARTS = 4;

/** الباقي من `after` لحد `until` (أو لحد `nowMs` لو من غير نهاية) ⇒ ٤ فترات متلاصقة بالثانية. */
export function splitRange(after: string, until: string, nowMs: number): CountTask[] {
  const start = Date.parse(after);
  const end = until ? Date.parse(until) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < SPLIT_PARTS * 1000) return [{ after, until }];
  const out: CountTask[] = [];
  let from = after;
  for (let i = 1; i < SPLIT_PARTS; i++) {
    const cut = floorSec(new Date(start + Math.floor(((end - start) * i) / SPLIT_PARTS)).toISOString());
    out.push({ after: from, until: cut });
    from = cut;
  }
  out.push({ after: from, until });
  return out;
}

/** يحتفظ بس باللي اترفع في آخر `LOOKBACK_MS` قبل أحدث ملف (من غير تكرار). */
export function pruneRecent(recent: readonly [string, string][], newest: string): [string, string][] {
  const since = newest ? new Date(Date.parse(newest) - LOOKBACK_MS).toISOString() : "";
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const r of recent) {
    if (r[1] >= since && !seen.has(r[0])) { seen.add(r[0]); out.push(r); }
  }
  return out;
}

/** عدّة كاملة شغّالة — بتتحفظ بين الدورات. */
export interface PassState {
  /** رقم العدّة (اللوحات في الداتابيز متعلّمة بيه). */
  pass: number;
  startedAt: string;
  queue: CountTask[];
  /** التقسيم مسموح (لحد ما التأكيد يقول إن درايف مش مرتّب). */
  cut: boolean;
  verifyExpected: number | null;
  verifySum: number;
  counts: CompanyDayCounts;
  people: PeopleMap;
  n: number;
  notPlate: number;
  newest: string;
  recent: [string, string][];
  steps: number;
  /** خطوات فشلت (بتتعاد) + آخر سبب. */
  fails: number;
  lastFail?: string;
}

export function newPass(pass: number, now: Date, cut = true): PassState {
  return {
    pass, startedAt: now.toISOString(), queue: countRanges(now), cut,
    verifyExpected: null, verifySum: 0,
    counts: {}, people: {}, n: 0, notPlate: 0, newest: "", recent: [], steps: 0, fails: 0,
  };
}

/** حارس: درايف بيرجّع علامات من غير آخر. */
const MAX_STEPS = 500_000;

/**
 * يشتغل على العدّة لحد ما `stop()` تقول كفاية (الوقت خلص) أو الطابور يفضى. الخطوات اللي
 * اتبعتت بتكمّل قبل الرجوع، فالحالة اللي بتتحفظ دايماً مظبوطة.
 *  · `onCounted` (اللوحات في الداتابيز) بيتنادى **قبل** ما الخطوة تتجمع؛ لو فشل ⇒ الخطوة
 *    بتتعاد (والكتابة نفسها بتتكرر من غير ضرر).
 *  · خطوة فشلت ⇒ بترجع أول الطابور، والدورة بتقف (الدورة الجاية بتكمّل).
 *  · التأكيد لقى الترتيب كداب ⇒ العدّ كله من الأول من غير تقسيم (واللي كانت شغّالة بتترمي).
 */
export async function advancePass(
  st: PassState,
  step: (t: CountTask, cut: boolean) => Promise<StepResult>,
  opts: { concurrency: number; stop: () => boolean; onCounted?: (r: StepResult) => Promise<void> },
): Promise<"done" | "paused"> {
  const nowMs = Date.parse(st.startedAt);
  const concurrency = Math.max(1, opts.concurrency);
  let epoch = 0;
  let halt = false;
  let active = 0;

  const merge = (t: CountTask, r: StepResult) => {
    addCounts(st.counts, r.counts);
    Object.assign(st.people, r.people);
    st.n += r.n;
    st.notPlate += r.notPlate;
    if (r.newest > st.newest) st.newest = r.newest;
    if (r.recent.length) st.recent = pruneRecent([...st.recent, ...r.recent], st.newest);
    if (r.resume) {
      if (st.cut && st.verifyExpected === null && !t.token) {
        st.verifyExpected = r.n;
        st.queue.push({ after: t.after, until: r.resume, verify: true });
      }
      st.queue.push(...splitRange(r.resume, t.until, nowMs));
    } else if (r.next) {
      st.queue.push({ after: t.after, until: t.until, token: r.next });
    }
  };

  const runOne = async (t: CountTask, myEpoch: number) => {
    let r: StepResult;
    try {
      r = await step(t, st.cut && !t.verify);
      if (myEpoch === epoch && !t.verify) await opts.onCounted?.(r);
    } catch (e) {
      if (myEpoch === epoch) {
        st.queue.unshift(t);
        st.fails++;
        st.lastFail = (e as Error)?.message || "error";
      }
      halt = true;
      return;
    }
    if (myEpoch !== epoch) return;
    st.steps++;
    delete st.lastFail;   // درايف رجع يرد
    if (!t.verify) { merge(t, r); return; }
    st.verifySum += r.n;
    if (r.next) {
      st.queue.push({ ...t, token: r.next });
    } else if (st.verifySum !== st.verifyExpected) {
      // الترتيب مش مضمون ⇒ العدّ كله من الأول صفحة صفحة (اللي شغّال دلوقتي بيترمي)
      epoch++;
      const fresh = newPass(st.pass, new Date(nowMs), false);
      Object.assign(st, { ...fresh, startedAt: st.startedAt, steps: st.steps, fails: st.fails, lastFail: st.lastFail });
    }
  };

  await new Promise<void>((resolve) => {
    const pump = () => {
      while (!halt && active < concurrency && st.queue.length) {
        if (opts.stop() || st.steps >= MAX_STEPS) { halt = true; break; }
        const t = st.queue.shift()!;
        const myEpoch = epoch;
        active++;
        void runOne(t, myEpoch).finally(() => { active--; pump(); });
      }
      if (active === 0 && (halt || !st.queue.length)) resolve();
    };
    pump();
  });
  return st.queue.length ? "paused" : "done";
}

/** آخر نتيجة كاملة (+ الجديد اللي اتضاف عليها) — بتتحفظ والصفحة بتعرضها على طول. */
export interface CertSnapshot {
  pass: number;
  /** آخر عدّ كامل خلص إمتى. */
  fullAt: string;
  /** آخر تحديث (عدّ كامل أو جديد اتضاف). */
  at: string;
  counts: CompanyDayCounts;
  people: PeopleMap;
  n: number;
  notPlate: number;
  /** عدد اللوحات المختلفة — وكل رافع لوحاته المختلفة. */
  plates: number;
  platesBy: Record<string, number>;
  newest: string;
  recent: [string, string][];
}

export function snapshotFromPass(
  st: PassState, plates: number, platesBy: Record<string, number>, now: Date,
): CertSnapshot {
  return {
    pass: st.pass, fullAt: now.toISOString(), at: now.toISOString(),
    counts: st.counts, people: st.people, n: st.n, notPlate: st.notPlate,
    plates, platesBy, newest: st.newest || st.startedAt, recent: pruneRecent(st.recent, st.newest),
  };
}

/**
 * الجديد من آخر عدّ: اللي اترفع من ربع ساعة قبل أحدث ملف (مترتّب، صفحة صفحة) — اللي اتعدّ قبل
 * كده بيتعرف بالـid. بيعدّل `snap`. `onCounted` = اللوحات في الداتابيز (قبل ما تتجمع).
 */
export async function addNewFiles(
  snap: CertSnapshot,
  list: (since: string, token?: string) => Promise<{ files: StatFile[]; next: string | null }>,
  opts: { stop: () => boolean; onCounted?: (pairs: [string, string][]) => Promise<void> },
): Promise<{ added: number; uploaders: string[]; done: boolean }> {
  const since = floorSec(new Date(Date.parse(snap.newest || snap.fullAt) - LOOKBACK_MS).toISOString());
  const seen = new Set(snap.recent.map((r) => r[0]));
  const touched = new Set<string>();
  let added = 0;
  let token: string | undefined;
  let done = false;
  while (!opts.stop()) {
    const page = await list(since, token);
    const fresh = page.files.filter((f) => f.id && !seen.has(f.id) && typeof f.createdTime === "string");
    if (fresh.length) {
      const r = stepFromPage(fresh, null, "", false, true);
      await opts.onCounted?.(r.pairs);
      addCounts(snap.counts, r.counts);
      Object.assign(snap.people, r.people);
      snap.n += r.n;
      snap.notPlate += r.notPlate;
      added += r.n;
      if (r.newest > snap.newest) snap.newest = r.newest;
      for (const [id] of r.recent) seen.add(id);
      snap.recent.push(...r.recent);
      for (const k of Object.keys(r.counts)) touched.add(k);
    }
    if (!page.next) { done = true; break; }
    token = page.next;
  }
  snap.recent = pruneRecent(snap.recent, snap.newest);
  return { added, uploaders: [...touched], done };
}

export interface CertStats {
  total: number;
  companies: { key: string; name: string; email: string; total: number; last30: number }[];
  daily: { day: string; total: number; byCompany: { name: string; count: number }[] }[];
}

const byCountThenName = (a: { name: string; n: number }, b: { name: string; n: number }) =>
  b.n - a.n || a.name.localeCompare(b.name, "ar");

/** الإجمالي · كل رافع (إجمالي + آخر `days` يوم) · كل يوم لآخر `days` يوم. */
export function statsFromCounts(counts: CompanyDayCounts, people: PeopleMap, now: Date, days = 30): CertStats {
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) dayKeys.push(riyadhDay(new Date(now.getTime() - i * DAY_MS).toISOString()));
  const inWindow = new Set(dayKeys);
  const nameOf = (key: string) => people[key] || key || UNKNOWN_UPLOADER;

  let total = 0;
  const companies: { key: string; name: string; email: string; n: number; last30: number }[] = [];
  for (const [key, byDay] of Object.entries(counts)) {
    let n = 0, last30 = 0;
    for (const [day, c] of Object.entries(byDay)) {
      n += c;
      if (inWindow.has(day)) last30 += c;
    }
    if (!n) continue;
    total += n;
    companies.push({ key, name: nameOf(key), email: key.includes("@") ? key : "", n, last30 });
  }

  return {
    total,
    companies: companies.sort(byCountThenName).map(({ key, name, email, n, last30 }) => ({ key, name, email, total: n, last30 })),
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

/** اللي الصفحة بتعرضه. */
export interface CertStatsView {
  files: number;
  plates: number;
  notPlate: number;
  companies: { name: string; email: string; total: number; plates: number; last30: number }[];
  daily: CertStats["daily"];
  at: string;
  fullAt: string;
}

export function viewFromSnapshot(s: CertSnapshot, now: Date): CertStatsView {
  const st = statsFromCounts(s.counts, s.people, now, 30);
  return {
    files: s.n,
    plates: s.plates,
    notPlate: s.notPlate,
    companies: st.companies.map((c) => ({ name: c.name, email: c.email, total: c.total, plates: s.platesBy[c.key] ?? 0, last30: c.last30 })),
    daily: st.daily,
    at: s.at,
    fullAt: s.fullAt,
  };
}

/**
 * 📊 **إحصائيات الشهايد** (منطق نقي — من غير درايف).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات وعايز كل شركه رافعه كم
 * شهادة وعايز كم شهادة اترفعت يوميا».
 *  · **الشهادة** = PDF اسمه لوحة (حروف ١–٤ + أرقام ١–٤ بعد `plateCertKey`) — ده بالظبط
 *    اللي البرنامج يقدر يلاقيه للعربية (البحث بيطابق الاسم كله). أي PDF تاني بيتعدّ
 *    لوحده (`otherPdfs`) ومايدخلش في الإجمالي.
 *  · **الشركة** = الفولدر اللي الشركة مشاركاه مع حساب درايف (أعلى فولدر نقدر نوصله —
 *    فولدرات الشهور جواه بتتجمع تحته). ملف من غير فولدر ⇒ `NO_FOLDER`.
 *  · **اليوم** = يوم رفع الملف على درايف بتوقيت السعودية (UTC+3، مفيش توقيت صيفي).
 */
import { plateCertKey } from "./certificateMatch";

export const NO_FOLDER = "من غير فولدر";

export interface StatFile {
  id: string;
  name: string;
  /** تاريخ رفع الملف على درايف (ISO). */
  createdTime: string;
  parents?: string[];
}

export interface CertStats {
  /** كل الشهايد لكل الشركات. */
  total: number;
  /** ملفات PDF مش باسم لوحة — مش محسوبة في الإجمالي. */
  otherPdfs: number;
  /** كل شركة: إجماليها وآخر `days` يوم — الأكتر فوق. */
  companies: { name: string; total: number; last30: number }[];
  /** كل يوم من النهارده لورا `days` يوم — الأحدث فوق، والأيام الفاضية صفر. */
  daily: { day: string; total: number; byCompany: { name: string; count: number }[] }[];
}

/** اسم الملف لوحة؟ (حروف ١–٤ + أرقام ١–٤ بعد التوحيد). */
export function isCertName(name: string): boolean {
  const key = plateCertKey(String(name ?? ""));
  const letters = key.replace(/[0-9]/g, "").length;
  const digits = key.replace(/[^0-9]/g, "").length;
  return letters >= 1 && letters <= 4 && digits >= 1 && digits <= 4;
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** «YYYY-MM-DD» بتوقيت السعودية — "" لو التاريخ بايظ. */
export function riyadhDay(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

const byCountThenName = (a: { name: string; n: number }, b: { name: string; n: number }) =>
  b.n - a.n || a.name.localeCompare(b.name, "ar");

export function buildCertStats(
  files: readonly StatFile[],
  companyOf: (f: StatFile) => string,
  now: Date,
  days = 30,
): CertStats {
  const certs = files.filter((f) => isCertName(f.name));
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) dayKeys.push(riyadhDay(new Date(now.getTime() - i * 86_400_000).toISOString()));
  const inWindow = new Set(dayKeys);

  const companies = new Map<string, { total: number; last30: number }>();
  const perDay = new Map<string, Map<string, number>>();
  for (const f of certs) {
    const c = companyOf(f) || NO_FOLDER;
    const row = companies.get(c) ?? { total: 0, last30: 0 };
    row.total++;
    const d = riyadhDay(f.createdTime);
    if (inWindow.has(d)) {
      row.last30++;
      const m = perDay.get(d) ?? new Map<string, number>();
      m.set(c, (m.get(c) ?? 0) + 1);
      perDay.set(d, m);
    }
    companies.set(c, row);
  }

  return {
    total: certs.length,
    otherPdfs: files.length - certs.length,
    companies: [...companies.entries()]
      .map(([name, r]) => ({ name, n: r.total, r }))
      .sort(byCountThenName)
      .map(({ name, r }) => ({ name, total: r.total, last30: r.last30 })),
    daily: dayKeys.map((day) => {
      const m = perDay.get(day) ?? new Map<string, number>();
      const byCompany = [...m.entries()].map(([name, n]) => ({ name, n })).sort(byCountThenName)
        .map(({ name, n }) => ({ name, count: n }));
      return { day, total: byCompany.reduce((s, x) => s + x.count, 0), byCompany };
    }),
  };
}

export type FolderMeta = { name: string; parents?: string[] } | null;

/**
 * فولدر ← اسم الشركة (أعلى فولدر نقدر نوصله). كل فولدر بيتسأل عنه **مرة واحدة** حتى
 * لو كذا فولدر شهور جوّه نفس فولدر الشركة. فولدر مش متاح ⇒ `NO_FOLDER`. لفّة في
 * البيانات (أب بيشاور على ابنه) مابتعلّقش.
 */
export async function resolveTopFolders(
  ids: readonly string[],
  get: (id: string) => Promise<FolderMeta>,
  concurrency = 8,
): Promise<Map<string, string>> {
  const meta = new Map<string, Promise<FolderMeta>>();
  const metaOf = (id: string) => {
    let p = meta.get(id);
    if (!p) { p = get(id).catch(() => null); meta.set(id, p); }
    return p;
  };
  const tops = new Map<string, Promise<string | null>>();
  const topOf = (id: string, seen: ReadonlySet<string>): Promise<string | null> => {
    const memo = tops.get(id);
    if (memo) return memo;
    const p = (async () => {
      const m = await metaOf(id);
      if (!m) return null;
      const parent = m.parents?.[0];
      if (!parent || seen.has(parent) || seen.has(id)) return m.name;
      const up = await topOf(parent, new Set([...seen, id]));
      return up ?? m.name;
    })();
    tops.set(id, p);
    return p;
  };

  const out = new Map<string, string>();
  const uniq = [...new Set(ids)];
  let next = 0;
  const worker = async () => {
    while (next < uniq.length) {
      const id = uniq[next++];
      out.set(id, (await topOf(id, new Set())) ?? NO_FOLDER);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, uniq.length) }, worker));
  return out;
}

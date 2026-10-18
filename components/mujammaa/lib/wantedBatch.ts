/**
 * 🚨 **مربع «سيارات مطلوبة» بعد التفريغ** (١٨ أكتوبر ٢٠٢٦) — `components/WantedBatchModal.tsx`.
 *
 * المالك: «لو اتفرغ وطلع مطلوبه اكتر من لوحه اولا يظهر في مربع وبصوت والمربع مكتوب فيه بيانات السيارة
 * كامله ولو ليها شهادة وكل بيانات السيارة ويظهر كلمه فوق يوجد مثلا ٣ سيارات مطلوبه ولما يسحب من
 * اليمين لليسار او العكس يلاقي اللوحات التانيه بكل بياناتهم».
 *
 * ليه مربع واحد مش تنبيه لكل لوحة: التفريغ بيطلّع اللوحات كلها في نفس اللحظة — ٥ صفّارات ورا بعض
 * والمندوب سايق. فمربع واحد بصوت واحد، والعربيات كلها جوّاه بالسحب.
 */
import { detectChassisColumn } from "@/lib/chassis";
import { bankPlateToArabic, normalizePlate } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import type { PlateEntry } from "./plateEntry";

/** «يوجد 3 سيارات مطلوبة» — بالعدد العربي الصح */
export function wantedHeadline(n: number): string {
  if (n <= 1) return "يوجد سيارة مطلوبة";
  if (n === 2) return "يوجد سيارتين مطلوبين";
  if (n <= 10) return `يوجد ${n} سيارات مطلوبة`;
  return `يوجد ${n} سيارة مطلوبة`;
}

const isPlateCell = (v: string, plate: string): boolean => {
  try {
    const a = normalizePlate(bankPlateToArabic(v));
    return !!a && a === normalizePlate(plate);
  } catch {
    return false;
  }
};

/**
 * بيانات السيارة **كاملة** من صف ملف التشييك: كل عمود فيه قيمة — من غير عمود اللوحة نفسه (اللوحة
 * ظاهرة فوق). الأعمدة المهمة (`matchesPreferred`: الماركة/الطراز/اللون/السنة/البنك…) الأول، والباقي
 * بترتيب الملف.
 */
export function carInfoRows(row: Record<string, unknown> | null | undefined, plate: string): [string, string][] {
  if (!row) return [];
  const all: [string, string][] = [];
  for (const [k, raw] of Object.entries(row)) {
    if (!k || k.startsWith("__")) continue;
    const v = String(raw ?? "").trim();
    if (!v || isPlateCell(v, plate)) continue;
    all.push([k, v]);
  }
  return [...all.filter(([k]) => matchesPreferred(k)), ...all.filter(([k]) => !matchesPreferred(k))];
}

/** رقم الهيكل (للشهادة) — بالاسم الأول، وإلا بشكل الرقم (VIN) */
export function chassisOf(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) r[k] = String(v ?? "");
  const col = detectChassisColumn(Object.keys(r), [r]);
  const v = col ? r[col].trim() : "";
  return v || null;
}

/** المطلوبة بتطابق تام بس (قاعدة البرنامج كله) */
export function wantedOf(entries: PlateEntry[] | null | undefined): PlateEntry[] {
  return Array.isArray(entries) ? entries.filter((e) => e?.match?.kind === "exact") : [];
}

/** مقطع تاني خلص والمربع لسه مفتوح ⇒ الجديد يتضاف في الآخر من غير تكرار */
export function mergeWanted(prev: PlateEntry[], next: PlateEntry[]): PlateEntry[] {
  const seen = new Set(prev.map((e) => e.review?.plate));
  const out = prev.slice();
  for (const e of next) {
    const p = e.review?.plate;
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(e);
    }
  }
  return out;
}

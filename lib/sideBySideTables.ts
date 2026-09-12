/**
 * جداول متجاورة في نفس الورقة (Side-by-side tables).
 *
 * بعض الشركات بتبعت المحفظة كـ**كذا جدول جنب بعض في نفس الصفحة** — مثلاً
 * «سيارات الخرج» في الأعمدة A–F، «سيارات الرياض» في H–M، «الشرقية» في O–T،
 * وكل جدول فيه نفس رؤوس الأعمدة (م · القرار · النوع · رقم · الاسم · رقم الهيكل).
 *
 * البرنامج بيقرا **عمود لوحة واحد** لكل ملف، فكان بيفرز على جدول واحد بس
 * ويسيب الباقي (٢٠ من ٤٩ لوحة في محفظة حقيقية). الحل: نقسّم الورقة لجداول،
 * وكل جدول يبقى مصدر إحالة مستقل ببياناته هو — فاللوحة بتطلع ومعاها الاسم
 * والنوع ورقم الهيكل بتوعها هي.
 *
 * قاعدة التقسيم: **تكرار اسم عمود** = بداية جدول جديد. الجداول المتجاورة
 * بتكرّر نفس الرؤوس، والجدول العادي مابيكرّرش رأس فمابيتقسّمش.
 */

/** بيشيل لاحقة التمييز اللي `buildTableFromAoa` بتحطّها للأعمدة المكرّرة: «رقم (2)». */
export function baseHeaderName(name: string): string {
  return name.replace(/\s*\(\d+\)$/, "");
}

import {
  detectPlateColumn, detectPlateColumnByContent,
  detectArabicPlateColumn, detectArabicPlateColumnByContent,
} from "./plateParser";

export interface SplitTable {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * بيقسّم الجدول لجداول متجاورة. بيرجّع `null` لو الورقة جدول واحد عادي
 * (مافيش رأس مكرّر) — الحالة الغالبة، فمافيش أي تغيير على الملفات العادية.
 *
 * `hasPlates` بتحدد إذا كان الجدول فيه عمود لوحات — بنقسّم بس لما **جدولين
 * على الأقل** فيهم لوحات، عشان جدول ملاحظات مكرّر الرؤوس مايقسّمش الورقة.
 */
export function splitSideBySideTables(
  headers: string[],
  rows: Record<string, string>[],
  hasPlates: (headers: string[], rows: Record<string, string>[]) => boolean,
): SplitTable[] | null {
  if (headers.length < 4) return null;

  // (١) اقسم بالرؤوس: أي اسم بيتكرّر جوّه نفس الجدول = جدول جديد ابتدا.
  const groups: string[][] = [];
  let cur: string[] = [];
  let seen = new Set<string>();
  for (const h of headers) {
    const base = baseHeaderName(h);
    if (seen.has(base) && cur.length > 0) {
      groups.push(cur);
      cur = [];
      seen = new Set<string>();
    }
    cur.push(h);
    seen.add(base);
  }
  if (cur.length > 0) groups.push(cur);
  if (groups.length < 2) return null;

  // (٢) ابنِ كل جدول بصفوفه — وبالأسماء الأصلية (من غير لاحقة) عشان أعمدة
  //     النتيجة تطلع موحّدة بدل «الاسم (2)» و«الاسم (3)».
  const tables: SplitTable[] = groups.map((cols) => {
    const names = cols.map(baseHeaderName);
    const out: Record<string, string>[] = [];
    for (const r of rows) {
      const o: Record<string, string> = {};
      let any = false;
      cols.forEach((c, i) => {
        const v = r[c] ?? "";
        o[names[i]] = v;
        if (v.trim()) any = true;
      });
      // صف بيكرّر رؤوس الأعمدة جوّه الجدول (الشركات بتعيد الرأس وسط الصفحة) —
      // مش داتا، وكان بيطلع كمدخل إحالة مالوش لوحة.
      const isRepeatedHeader = any && cols.every((c, i) => {
        const v = (r[c] ?? "").trim();
        return !v || v === names[i];
      });
      if (any && !isRepeatedHeader) out.push(o);   // صفوف الجدول ده بس (أطوالها مختلفة)
    }
    return { headers: names, rows: out };
  });

  // (٣) لازم جدولين على الأقل فيهم لوحات — غير كده الورقة مش «جداول متجاورة».
  const withPlates = tables.filter((t) => t.rows.length > 0 && hasPlates(t.headers, t.rows));
  if (withPlates.length < 2) return null;
  return withPlates;
}

export interface ReferralBlock {
  headers: string[];
  rows: Record<string, string>[];
  plateCol: string | null;
  isArabic: boolean;
}

/**
 * ورقة إحالة → قايمة جداول جاهزة للفرز (جدول واحد للورقة العادية، وكذا جدول
 * للورقة اللي فيها جداول جنب بعض) وكل جدول بعمود لوحته.
 *
 * **استخدم الدالة دي في أي صفحة بتفرز إحالة** — إعادة كتابة المنطق في كل صفحة
 * هي اللي خلّت الإصلاح يوصل لمسار ويفوت التاني.
 */
export function referralBlocks(
  headers: string[],
  rows: Record<string, string>[],
): ReferralBlock[] {
  const hasPlates = (h: string[], r: Record<string, string>[]) =>
    detectArabicPlateColumnByContent(h, r) !== null ||
    detectPlateColumnByContent(h, r, 50, 0.5) !== null;
  const blocks = splitSideBySideTables(headers, rows, hasPlates) ?? [{ headers, rows }];
  return blocks.map((b) => {
    const ar = detectArabicPlateColumn(b.headers) ?? detectArabicPlateColumnByContent(b.headers, b.rows);
    return {
      headers: b.headers,
      rows: b.rows,
      plateCol: ar ?? detectPlateColumn(b.headers, b.rows),
      isArabic: ar !== null,
    };
  });
}

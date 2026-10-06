/**
 * 📄 «شهايد النهارده» — القارئ بيقرا اللوحة صح من جوّه الشهادة؟ (أرقام بس — مفيش لوحة ولا بيانات بتطلع)
 *
 * المالك (٦ أكتوبر ٢٠٢٦): «فيه حد بيفرز مش بيطلع معاه نتيجه الفرز ... ورافع الداتا وعندو سجلات».
 * المقياس: الشهايد اللي اسم ملفها لوحة كاملة — اللوحة اللي اتقرت من جوّه زيها؟ ولا حروفها مقلوبة
 * (الملف مكتوب بالترتيب المرئي)؟ ولا حاجة تانية؟ والملف اللي اسمه أرقام بس — الأرقام زي بعض؟
 */
import { plateOf } from "./certStats";
import { bankPlateToArabic, normalizePlate } from "./plateParser";

export interface CertParseStats {
  /** فيها لوحة / فيها شاص / الاتنين ناقصين (من اللي اتقرى). */
  withPlate: number;
  withVin: number;
  /** اسم الملف لوحة كاملة ⇒ اللي اتقرى زيها / حروفه مقلوبة / حاجة تانية / مالقيناش لوحة. */
  nameFull: number;
  nameAgree: number;
  nameReversed: number;
  nameOther: number;
  nameNoPlate: number;
  /** اسم الملف أرقام بس ⇒ أرقام اللوحة اللي اتقرت زيها. */
  nameDigits: number;
  digitsAgree: number;
}

const split = (key: string) => ({ letters: key.replace(/[0-9]/g, ""), digits: key.replace(/\D/g, "").replace(/^0+/, "") });

export function certParseStats(rows: readonly { name: string; plate: string; vin: string }[]): CertParseStats {
  const s: CertParseStats = {
    withPlate: 0, withVin: 0, nameFull: 0, nameAgree: 0, nameReversed: 0, nameOther: 0, nameNoPlate: 0, nameDigits: 0, digitsAgree: 0,
  };
  for (const r of rows) {
    if (r.plate) s.withPlate++;
    if (r.vin) s.withVin++;
    const base = r.name.replace(/\.[A-Za-z0-9]{2,4}$/, "").replace(/_\d+$/, "").trim();
    if (plateOf(base)) {
      s.nameFull++;
      if (!r.plate) { s.nameNoPlate++; continue; }
      const want = normalizePlate(bankPlateToArabic(base));
      if (r.plate === want) { s.nameAgree++; continue; }
      const a = split(r.plate), b = split(want);
      if (a.digits === b.digits && a.letters.length > 1 && a.letters === [...b.letters].reverse().join("")) s.nameReversed++;
      else s.nameOther++;
    } else if (/^\d{1,4}$/.test(base)) {
      s.nameDigits++;
      if (r.plate && split(r.plate).digits === base.replace(/^0+/, "")) s.digitsAgree++;
    }
  }
  return s;
}

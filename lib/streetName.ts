/**
 * اسم الشارع اللي المندوب بيكتبه بإيده في التشييك (يدوي/صوتي).
 *
 * بيتختم على الصف **وقت إنشائه** — مش بيتقرا لحظياً وقت العرض. الفرق مهم:
 * لما المندوب يغيّر الاسم وهو ماشي من شارع لشارع، اللوحات اللي اتسجّلت قبل
 * التغيير لازم تفضل بالاسم القديم لأن ده اللي حصل على الأرض فعلاً.
 *
 * والمربع الفاضي **مايكتبش حاجة** — لا نص فاضي ولا شرطة — عشان العمود
 * مايتلوّثش بقيم وهمية في الشيت والإكسيل.
 */
export const STREET_KEY = "اسم الشارع";

export function withStreetName<T extends Record<string, string>>(row: T, street: string): T {
  const v = (street ?? "").trim();
  if (!v) return row;                       // فاضي = مافيش ختم أصلاً
  return { ...row, [STREET_KEY]: v };
}

const LS_KEY = "ic-street-name";

export function loadStreetName(): string {
  try { return localStorage.getItem(LS_KEY) ?? ""; } catch { return ""; }
}

export function saveStreetName(v: string): void {
  try { localStorage.setItem(LS_KEY, v); } catch { /* storage unavailable */ }
}

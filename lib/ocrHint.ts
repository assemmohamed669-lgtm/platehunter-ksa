/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔎 سبب فشل قراية الصورة — رسالة تقول الحقيقة
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (١٤ أكتوبر ٢٠٢٦): مندوب آيفون صوّر رقم الشاص والرقم باين في
 * الصورة، والبرنامج كتب **«خطأ OCR: HTTP 200»** — ومنها مفيش أي خيط.
 *
 * «HTTP 200» معناها السيرفر ردّ تمام، فالمشكلة في **رد الموديل** مش في الشبكة.
 * الرسالة دي بتفرّق بين الحالات عشان صورة الشاشة لوحدها تكفي للتشخيص:
 *   · الموديل قال «مافيش رقم»   ⇒ الصورة مش واضحة له
 *   · الموديل قال كلام مش رقم   ⇒ بنعرض كلامه زي ما هو
 *   · مفتاح/صلاحية/شبكة         ⇒ السبب اللي السيرفر بعته
 */
export interface OcrResponse {
  chassis?: string | null;
  plate?: string | null;
  raw?: string | null;
  hint?: string | null;
  detail?: string | null;
  error?: string | null;
}

/** أقصى طول للرسالة — الشاشة ضيقة. */
const MAX = 120;

export function ocrFailureHint(json: OcrResponse | null, status: number): string {
  const first = json?.hint ?? json?.detail ?? json?.error;
  if (first) return `خطأ OCR: ${String(first).slice(0, MAX)}`;

  const raw = String(json?.raw ?? "").trim();
  if (raw) {
    // الموديل قال «NONE» أو ما لقاش رقم
    if (/none/i.test(raw) && raw.length <= 12) return "الموديل مالقاش رقم في الصورة — قرّب الكاميرا أو نضّف اللوحة المعدنية";
    return `الموديل قال: ${raw.slice(0, MAX)}`;
  }

  if (status === 200) return "الموديل رجع فاضي — الصورة غالباً مش واضحة له (جرّب صورة أقرب وأوضح)";
  return `خطأ OCR: HTTP ${status}`;
}

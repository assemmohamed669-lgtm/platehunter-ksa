/**
 * saveFailure — رسالة فشل التصدير **ومعاها السبب**.
 *
 * الرسالة القديمة («تعذّر حفظ أي لوحة — كلها فضلت مكانها») كانت بتترمي بعد
 * `Promise.allSettled` و**أسباب الرفض بترمى معاها**. فالمندوب بيصوّر الشاشة
 * وإحنا مانقدرش نعرف: مساحة ممتلئة؟ التخزين مقفول؟ صف بايظ؟ كل الاحتمالات
 * ليها علاج مختلف تماماً، والرسالة مابتفرّقش بينهم.
 */

/** نص أول سبب رفض في نتيجة `Promise.allSettled`. فاضي لو مافيش رفض. */
export function firstFailureReason(
  results: Array<{ status: "fulfilled" | "rejected"; reason?: unknown }>,
): string {
  for (const r of results) {
    if (r.status !== "rejected") continue;
    const e = r.reason;
    if (e instanceof Error) return (e.message || e.name || "").trim() || "سبب غير معروف";
    const s = String(e ?? "").trim();
    return s || "سبب غير معروف";
  }
  return "";
}

/**
 * رسالة الفشل الكامل. بتطمّن المندوب إن شغله مكانه، وبتدّي السبب الخام عشان
 * صورة الشاشة تبقى تشخيص مش مجرد شكوى.
 */
export function saveFailureMessage(reason: string): string {
  const head = "تعذّر حفظ أي لوحة في السجلات — كلها فضلت مكانها في التشييك، متمسحتش.";
  // طريق يكمّل بيه شغله دلوقتي: «مشاركة إكسيل» مابتلمسش تخزين الجهاز خالص،
  // فحتى لو التخزين ممتلئ أو مقفول اللوحات بتخرج منه سليمة.
  const tip = "تقدر تستخدم «مشاركة إكسيل» عشان تطلّعها دلوقتي، وابعت صورة الرسالة دي للإدارة.";
  return reason ? `${head}\n\n${tip}\n\nالسبب: ${reason}` : `${head}\n\n${tip}`;
}

/**
 * 📥 **رفع/تغيير/مسح ملف التشييك الأساسي من أي صفحة** (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «انا عايز المندوب لو غير الملف بتاع التشييك من صفحه التشييك او من صفحه المجمع يظهر في باقي
 * الصفحات والبرنامج يعتمدة في كل حاجه».
 *
 * **نفس خطوات صفحة التشييك (`handleParsed`) و«Voice PRO» (`onCheckParsed`) بالحرف** — وحارس التوافق في
 * `__tests__/checkFileOps.test.ts` بيتأكد إنهم لسه زي بعض:
 *   ١. نفس السلوت `local:check` (ملف واحد مشترك للبرنامج كله — CLAUDE.md).
 *   ٢. `notifyCheckSheetChanged()` ⇒ كل صفحة مفتوحة أو هتتفتح بتقرا الجديد (`lib/checkSheetSync.ts`).
 *   ٣. المسئول ⇒ بيتبعت للمجموعة (`shareCheckToTeamIfLeader` — بيسأل عن الدور وقت الرفع).
 * ⛔ مابيمسحش لوحات/سجلات المندوب — الملف المرجعي بس.
 */
import type { ExcelTable } from "./excel";
import type { TeamShareResult } from "./teamCheck";
import { bankPlateToArabic, detectPlateColumn, normalizePlate } from "./plateParser";
import { onUserCheckChanged } from "./appCheck";

/** بيرجّع نتيجة الإرسال للمجموعة (null = مش مسئول / مافيش مجموعة / وقع) — الحفظ نفسه مابيفشلش بسببها. */
export async function saveMainCheckFile(table: ExcelTable, file: File): Promise<TeamShareResult> {
  const { saveUploadedFile } = await import("./idb");
  const { notifyCheckSheetChanged } = await import("./checkSheetSync");
  await saveUploadedFile({
    key: "local:check", agentId: "local", slot: "check",
    fileName: file.name, headers: table.headers, rows: table.rows,
    uploadedAt: new Date().toISOString(), fileBlob: file,
  });
  notifyCheckSheetChanged();
  // 📢 تشييك البرنامج: الأدمن ⇒ بيتبعت لكل المناديب · المندوب ⇒ بيشتغل على بتاعه (`lib/appCheck.ts`)
  void onUserCheckChanged();
  try {
    const { shareCheckToTeamIfLeader } = await import("./teamCheck");
    return await shareCheckToTeamIfLeader(file, table.rows.length, () => {
      const pcol = detectPlateColumn(table.headers, table.rows);
      return pcol
        ? new Set(table.rows.map((r) => normalizePlate(bankPlateToArabic(String(r[pcol] ?? "")))).filter(Boolean)).size
        : 0;
    });
  } catch {
    return null;
  }
}

export async function clearMainCheckFile(): Promise<void> {
  const { deleteUploadedFile } = await import("./idb");
  const { notifyCheckSheetChanged } = await import("./checkSheetSync");
  await deleteUploadedFile("local", "check").catch(() => {});
  notifyCheckSheetChanged();
  // 📢 المندوب مسح بتاعه ⇒ تشييك البرنامج بيرجع لوحده · الأدمن ⇒ بيتمسح عند الكل
  void onUserCheckChanged();
}

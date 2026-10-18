"use client";

/**
 * 📥 **مربع ملف التشييك في «التسجيل» (المجمّع)** — نفس مربع صفحة التشييك و«Voice PRO» بالحرف (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «انا عايز المندوب لو غير الملف بتاع التشييك من صفحه التشييك او من صفحه المجمع يظهر في باقي
 * الصفحات والبرنامج يعتمدة في كل حاجه».
 *  · الحفظ والمسح من `lib/checkFileOps.ts` (نفس سلوت `local:check` · إشارة لكل الصفحات · المسئول ⇒ المجموعة).
 *  · بيقرا تاني مع أي تغيير من أي صفحة (`onCheckSheetChanged` + الوارد من واتساب) ولما المندوب يرجع للصفحة.
 *  · عدد اللوحات جاي من المجمّع نفسه (`plateCount`) — مابيبنيش فهرس ٥٠ ألف لوحة تاني على الموبايل.
 *  ⚠️ برّه `components/mujammaa` بالقصد: كود المجمّع نفسه بيفضل قراية بس (حارس `appPortGuards`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import FileUploadBox from "@/components/FileUploadBox";
import { clearMainCheckFile, saveMainCheckFile } from "@/lib/checkFileOps";
import { lastCheckSheetStamp, onCheckSheetChanged } from "@/lib/checkSheetSync";
import { syncTeamCheckToLocal, teamCheckShareMessage } from "@/lib/teamCheck";
import type { ExcelTable } from "@/lib/excel";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function extraLabel(n: number): string {
  if (n === 1) return "ملف تشييك إضافي";
  if (n === 2) return "ملفين تشييك إضافيين";
  return `${n} ملفات تشييك إضافية`;
}

export default function SharedCheckFileBox({
  plateCount,
  extraFiles,
}: {
  /** لوحات كل ملفات التشييك (من المجمّع) — `null` = لسه بيقرا */
  plateCount: number | null;
  /** ملفات التشييك الإضافية (٢، ٣…) — بتشتغل معاه وبتتغيّر من صفحة التشييك */
  extraFiles: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<number | null>(null);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const loadedStampRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    loadedStampRef.current = lastCheckSheetStamp();
    try {
      const { getUploadedFile } = await import("@/lib/idb");
      const rec = await getUploadedFile("local", "check").catch(() => null);
      if (rec) {
        setFile(new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: XLSX_TYPE }));
        setRows(rec.rows.length);
      } else {
        setFile(null);
        setRows(null);
      }
    } catch {
      /* التخزين مابيردّش — المربع فاضي والمجمّع لسه شغّال */
    }
  }, []);

  useEffect(() => {
    void load();
    // تشييك المجموعة: العضو بياخد شيت المسئول لو أحدث (نفس صفحة التشييك و«Voice PRO»)
    void syncTeamCheckToLocal().catch(() => {});
    const off = onCheckSheetChanged(() => void load(), { idbEvent: true });
    const onVis = () => {
      if (document.visibilityState === "visible" && lastCheckSheetStamp() !== loadedStampRef.current) void load();
    };
    try {
      document.addEventListener("visibilitychange", onVis);
    } catch {
      /* ignore */
    }
    return () => {
      off();
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {
        /* ignore */
      }
    };
  }, [load]);

  const onParsed = async (table: ExcelTable, f: File) => {
    setTeamMsg(null);
    setFile(f);
    setRows(table.rows.length);
    const r = await saveMainCheckFile(table, f);
    setTeamMsg(teamCheckShareMessage(r));
  };

  const onClear = async () => {
    setTeamMsg(null);
    await clearMainCheckFile();
    setFile(null);
    setRows(null);
  };

  return (
    <section className="flex flex-col gap-1" data-testid="shared-check-file">
      <FileUploadBox
        title="ملف التشييك"
        hint="اللي فيه هيطلع مطلوب في التفريغ"
        parsedFile={file}
        parsedRowCount={rows}
        plateCount={plateCount}
        onParsed={(t, f) => void onParsed(t, f)}
        onClear={() => void onClear()}
        showReplaceButtons
        sky
      />
      {extraFiles > 0 && (
        <p className="px-0.5 text-[11px] text-muted">
          + {extraLabel(extraFiles)} بيشتغلوا معاه — بيتغيّروا من صفحة «تشييك».
        </p>
      )}
      {teamMsg && (
        <p className={`px-0.5 text-[11px] font-bold ${teamMsg.startsWith("✅") ? "text-primary" : "text-danger"}`}>{teamMsg}</p>
      )}
    </section>
  );
}

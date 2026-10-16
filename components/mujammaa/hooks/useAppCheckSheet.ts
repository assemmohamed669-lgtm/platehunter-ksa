/**
 * ==========================================================================
 *  🧮 خطّاف ملف التشييك بتاع قناص — بديل `useBankSheet` في صفحة المجمّع
 * ==========================================================================
 *  في المعمل الصفحة ليها شيت بنك بترفعه وتمسحه. في قناص **ملف التشييك واحد**
 *  (`local:check` + `check-2..N`) والرفع والمسح من صفحة التشييك بس — هنا قراية بس.
 *  بيتقري تاني لوحده لما الملف يتغيّر (`idbFileUpdated` — استقبال واتساب/المجموعة).
 */
import { useEffect, useRef, useState } from "react";
import type { BankSheet } from "../lib/bankSheet";
import type { ErrorLog } from "../lib/errorLog";
import { buildCheckBankSheet } from "../lib/checkSheetAdapter";

export interface UseAppCheckSheet {
  sheet: BankSheet | null;
  loading: boolean;
  /** عدد ملفات التشييك (الأساسي + الإضافيين) */
  files: number;
  /** لوحات الملف مطبّعة (نفس شكل `useBankSheet`) */
  vocabulary: string[];
}

export function useAppCheckSheet(errorLog: ErrorLog): UseAppCheckSheet {
  const [state, setState] = useState<{ sheet: BankSheet | null; loading: boolean; files: number }>({
    sheet: null,
    loading: true,
    files: 0,
  });
  const logRef = useRef(errorLog);
  logRef.current = errorLog;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [{ loadAllCheckSources }, { getUploadedFile }] = await Promise.all([
          import("@/lib/checkSheets"),
          import("@/lib/idb"),
        ]);
        const sources = await loadAllCheckSources();
        const main = await getUploadedFile("local", "check").catch(() => null);
        const sheet = buildCheckBankSheet(sources, main?.fileName || "ملف التشييك");
        if (alive) setState({ sheet, loading: false, files: sources.length });
      } catch (err) {
        logRef.current.add("شيت البنك", `ماقدرناش نقرا ملف التشييك: ${(err as Error)?.message ?? err}`);
        if (alive) setState((s) => ({ ...s, loading: false }));
      }
    };
    void load();
    const onIdb = () => void load();
    try {
      window.addEventListener("idbFileUpdated", onIdb);
    } catch {
      // مش متاح — القراية الأولى كفاية
    }
    return () => {
      alive = false;
      try {
        window.removeEventListener("idbFileUpdated", onIdb);
      } catch {
        // ignore
      }
    };
  }, []);

  return { ...state, vocabulary: state.sheet?.plates ?? [] };
}

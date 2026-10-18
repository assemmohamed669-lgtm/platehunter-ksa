/**
 * ==========================================================================
 *  🧮 خطّاف ملف التشييك بتاع قناص — بديل `useBankSheet` في صفحة المجمّع
 * ==========================================================================
 *  في المعمل الصفحة ليها شيت بنك بترفعه وتمسحه. في قناص **ملف التشييك واحد**
 *  (`local:check` + `check-2..N`) والرفع والمسح من صفحة التشييك بس — هنا قراية بس.
 *  بيتقري تاني لوحده لما الملف يتغيّر — من **أي** صفحة (`onCheckSheetChanged`: التشييك · «Voice PRO» ·
 *  مربع «التسجيل» · الوارد من واتساب/المجموعة) ولما المندوب يرجع للصفحة وفاته تغيير. المالك (١٨ أكتوبر):
 *  «لو غير الملف بتاع التشييك من صفحه التشييك او من صفحه المجمع يظهر في باقي الصفحات».
 */
import { useEffect, useRef, useState } from "react";
import type { BankSheet } from "../lib/bankSheet";
import type { ErrorLog } from "../lib/errorLog";
import { buildCheckBankSheet } from "../lib/checkSheetAdapter";
import { lastCheckSheetStamp, onCheckSheetChanged } from "@/lib/checkSheetSync";

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
    let loadedStamp: string | null = null;
    const load = async () => {
      loadedStamp = lastCheckSheetStamp();
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
    // نفس إشارة «Voice PRO» — `idbEvent`: الوارد من واتساب/المجموعة كمان
    const off = onCheckSheetChanged(() => void load(), { idbEvent: true });
    const onVis = () => {
      if (document.visibilityState === "visible" && lastCheckSheetStamp() !== loadedStamp) void load();
    };
    try {
      document.addEventListener("visibilitychange", onVis);
    } catch {
      // مش متاح — الإشارة كفاية
    }
    return () => {
      alive = false;
      off();
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {
        // ignore
      }
    };
  }, []);

  return { ...state, vocabulary: state.sheet?.plates ?? [] };
}

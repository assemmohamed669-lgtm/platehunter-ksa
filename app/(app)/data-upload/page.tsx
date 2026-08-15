"use client";

/**
 * «رفع للداتا» — يدمج شيت التفريغ (اللي المفرّغ بيبعته) جوّه ملف الداتا الكبير،
 * في المكان الصح: تحت آخر صف للموقع اللي المندوب كان واقف عنده.
 *
 * مبدأ الأمان: **البرنامج بيقترح والأدمن بيأكّد.** كل خطوة معروضة قبل التنفيذ
 * (ربط الأعمدة، مكان الإدخال، معاينة الصفوف)، والملف الأصلي مابيتلمسش أبداً —
 * الناتج ملف جديد بينزل. تحديث داتا البرنامج خطوة منفصلة بزرار لوحده.
 *
 * للأدمن فقط دلوقتي (تجربة قبل ما تتفتح للمناديب).
 */

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, ArrowDownToLine, Check, AlertTriangle, RefreshCw, X, Share2, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { readAllSheetsRawStream } from "@/lib/xlsxStream";
import {
  buildTableFromAoa, buildExcelBlob, buildBigExcelBlob, openExcelBlob, shareExcelBlob,
  type ExcelTable,
} from "@/lib/excel";
import { importRowsToData } from "@/lib/dataStore";
import {
  buildLocationIndex, suggestLocations, locationsInSheet, suggestColumnMapping,
  mergeIntoData, verifyMerge, detectLocationColumn, buildReviewRows,
  type ColumnMapping, type LocationInfo,
} from "@/lib/dataMerge";

/** فوق العدد ده بنوري الأدمن إن الفتح هياخد شوية — مش بنمنعه. */
const SLOW_ROWS = 150_000;

export default function DataUploadPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [dataTable, setDataTable] = useState<ExcelTable | null>(null);
  const [dataName, setDataName] = useState("");
  const [sheetTable, setSheetTable] = useState<ExcelTable | null>(null);
  const [sheetName, setSheetName] = useState("");

  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState<{ rows: Record<string, string>[]; at: number; added: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      if (prof?.role !== "admin") { router.replace("/sorting"); return; }
      setAllowed(true);
    })();
  }, [router]);

  /** يقرا ملف بالقارئ المتدفّق (خفيف على الذاكرة) ويرجّع جدوله. */
  async function readFile(file: File): Promise<ExcelTable> {
    const buf = new Uint8Array(await file.arrayBuffer());
    const sheets = await readAllSheetsRawStream(buf, { raw: true });
    const visible = sheets.filter((s) => !s.hidden && s.aoa.length > 0);
    const pick = (visible.length ? visible : sheets.filter((s) => s.aoa.length > 0))[0];
    if (!pick) throw new Error("الملف مافيهوش بيانات.");
    return buildTableFromAoa(pick.aoa, pick.name, sheets.map((s) => s.name));
  }

  async function pickData(file: File) {
    setBusy("جاري قراءة ملف الداتا…"); setError(null); setMerged(null);
    try {
      const t = await readFile(file);
      setDataTable(t); setDataName(file.name); setInsertAfter(null);
    } catch (e) { setError((e as Error)?.message ?? "تعذّرت قراءة ملف الداتا."); }
    finally { setBusy(null); }
  }

  async function pickSheet(file: File) {
    setBusy("جاري قراءة شيت التفريغ…"); setError(null); setMerged(null);
    try {
      const t = await readFile(file);
      setSheetTable(t); setSheetName(file.name);
    } catch (e) { setError((e as Error)?.message ?? "تعذّرت قراءة شيت التفريغ."); }
    finally { setBusy(null); }
  }

  // ربط الأعمدة المقترح — بيتحسب أول ما الملفين يجهزوا، والأدمن يعدّله
  useEffect(() => {
    if (!dataTable || !sheetTable) { setMapping([]); return; }
    setMapping(suggestColumnMapping(sheetTable.headers, dataTable.headers));
  }, [dataTable, sheetTable]);

  /**
   * عمود الموقع في الداتا — اللي الأدمن ربط بيه عمود موقع الشيت (عشان لو عدّل
   * الربط بإيده يتمشّى معاه)، وإلا الكشف التلقائي.
   */
  const sheetLocCol = useMemo(
    () => (sheetTable ? detectLocationColumn(sheetTable.headers) : null),
    [sheetTable],
  );

  const dataLocCol = useMemo(() => {
    if (!dataTable) return null;
    const byMap = sheetLocCol ? mapping.find((m) => m.source === sheetLocCol)?.target : null;
    return byMap ?? detectLocationColumn(dataTable.headers);
  }, [dataTable, mapping, sheetLocCol]);

  const locIndex = useMemo<LocationInfo[]>(
    () => (dataTable && dataLocCol ? buildLocationIndex(dataTable.rows, dataLocCol) : []),
    [dataTable, dataLocCol],
  );

  const sheetLocations = useMemo(
    () => (sheetTable && sheetLocCol ? locationsInSheet(sheetTable.rows, sheetLocCol) : []),
    [sheetTable, sheetLocCol],
  );

  const suggestions = useMemo(
    () => (sheetLocations[0] ? suggestLocations(locIndex, sheetLocations[0], 8) : []),
    [locIndex, sheetLocations],
  );

  // اقتراح مكان الإدخال تلقائياً (أول مرة بس — بعدها الأدمن هو اللي يقرر)
  useEffect(() => {
    if (insertAfter === null && suggestions[0]) setInsertAfter(suggestions[0].lastRow);
  }, [suggestions, insertAfter]);

  function runMerge() {
    if (!dataTable || !sheetTable || insertAfter === null) return;
    setBusy("جاري الدمج…"); setError(null);
    try {
      const r = mergeIntoData(dataTable.rows, sheetTable.rows, mapping, dataTable.headers, insertAfter);
      const check = verifyMerge(dataTable.rows, r.rows, r.insertedAt, r.addedCount);
      if (!check.ok) { setError(`الدمج اتوقف — ${check.problem}`); return; }
      setMerged({ rows: r.rows, at: r.insertedAt, added: r.addedCount });
    } catch (e) { setError((e as Error)?.message ?? "تعذّر الدمج."); }
    finally { setBusy(null); }
  }

  /**
   * الملف الكامل — **الداتا كلها إكسيل**، مهما كبرت (الأدمن طلب كده صراحة).
   * بنستخدم الكاتب الخفيف: الـ buildExcelBlob العادية بتلف على كل خلية
   * وبتفجّر الذاكرة على نص مليون صف.
   */
  function buildFullBlob(): { blob: Blob; name: string } {
    if (!merged || !dataTable) throw new Error("مافيش نتيجة.");
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      blob: buildBigExcelBlob(merged.rows, dataTable.headers, "داتا"),
      name: `داتا-محدّثة-${stamp}.xlsx`,
    };
  }

  /** شيت المراجعة: الجديد ومعاه اللي قبله وبعده — xlsx صغير بيفتح في لحظة. */
  function buildReviewBlob(): { blob: Blob; name: string } {
    if (!merged) throw new Error("مافيش نتيجة.");
    const rows = buildReviewRows(merged.rows, merged.at, merged.added);
    return { blob: buildExcelBlob(rows, "مراجعة"), name: "شيت-المراجعة.xlsx" };
  }

  /** بيلف أي عملية ملف بحالة انشغال ورسالة خطأ واضحة. */
  async function withFile(label: string, run: () => Promise<void>) {
    setBusy(label); setError(null);
    try { await run(); }
    catch (e) { setError((e as Error)?.message ?? "تعذّرت العملية."); }
    finally { setBusy(null); }
  }

  const openReview = () => withFile("جاري فتح شيت المراجعة…", async () => {
    const { blob, name } = buildReviewBlob();
    await openExcelBlob(blob, name);
  });

  const openFull = () => withFile("جاري فتح الملف…", async () => {
    const { blob, name } = buildFullBlob();
    await openExcelBlob(blob, name);
  });

  const shareFull = () => withFile("جاري تجهيز المشاركة…", async () => {
    const { blob, name } = buildFullBlob();
    await shareExcelBlob(blob, name, "الداتا بعد الرفع");
  });

  async function updateAppData() {
    if (!merged || !dataTable) return;
    if (!confirm(`هيتحدّث داتا البرنامج بـ${merged.rows.length} صف (بدل اللي موجودة دلوقتي). متأكد؟`)) return;
    setBusy("جاري تحديث داتا البرنامج…"); setError(null);
    try {
      await importRowsToData(merged.rows, dataTable.headers, { fileName: `داتا-محدّثة-${dataName}` });
      alert("تم تحديث داتا البرنامج. افتح صفحة الفرز وجرّب.");
    } catch (e) { setError((e as Error)?.message ?? "تعذّر التحديث."); }
    finally { setBusy(null); }
  }

  if (allowed === null) {
    return <div className="py-16 text-center text-sm text-muted">جارٍ التحقق…</div>;
  }

  const ready = dataTable && sheetTable && insertAfter !== null;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="text-xl font-black text-ink">رفع للداتا</h1>
      <p className="-mt-2 text-xs leading-relaxed text-muted">
        ارفع ملف الداتا + شيت التفريغ اللي المفرّغ بعتهولك، والبرنامج هيحط اللوحات
        الجديدة تحت آخر موقع سجّله المندوب في نفس المنطقة. <b className="text-ink">الملف الأصلي مايتلمسش</b> —
        بينزّلك ملف جديد، وتحديث داتا البرنامج بزرار منفصل بعد ما تتأكد.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="flex-1 text-xs text-danger">{error}</p>
          <button onClick={() => setError(null)} className="text-danger"><X size={14} /></button>
        </div>
      )}

      {/* ① الملفين */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FileBox label="ملف الداتا" icon={<FileSpreadsheet size={16} />} name={dataName}
          info={dataTable ? `${dataTable.rows.length.toLocaleString("en")} صف · ${dataTable.headers.length} عمود` : null}
          onPick={pickData} />
        <FileBox label="شيت التفريغ" icon={<Upload size={16} />} name={sheetName}
          info={sheetTable ? `${sheetTable.rows.length.toLocaleString("en")} صف · ${sheetTable.headers.length} عمود` : null}
          onPick={pickSheet} />
      </div>

      {/* ② ربط الأعمدة */}
      {dataTable && sheetTable && (
        <section className="rounded-xl border border-border bg-surface p-3">
          <h2 className="mb-2 text-sm font-bold text-ink">١) ربط الأعمدة</h2>
          <p className="mb-2 text-[11px] text-muted">البرنامج خمّنها — راجعها وغيّر أي واحدة غلط.</p>
          <div className="flex flex-col gap-1.5">
            {mapping.map((m, i) => (
              <div key={m.source} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted" title={m.source}>{m.source}</span>
                <span className="shrink-0 text-muted">←</span>
                <select
                  value={m.target ?? ""}
                  onChange={(e) => setMapping((p) => p.map((x, j) => (j === i ? { ...x, target: e.target.value || null } : x)))}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-ink outline-none focus:border-primary">
                  <option value="">— تجاهل —</option>
                  {dataTable.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ③ مكان الإدخال */}
      {dataTable && sheetTable && (
        <section className="rounded-xl border border-border bg-surface p-3">
          <h2 className="mb-2 text-sm font-bold text-ink">٢) مكان الإدخال</h2>
          {sheetLocations.length > 0 && (
            <p className="mb-2 text-[11px] text-muted">
              مواقع شيت التفريغ: <b className="text-ink">{sheetLocations.slice(0, 3).join("، ")}</b>
              {sheetLocations.length > 3 ? ` (+${sheetLocations.length - 3})` : ""}
            </p>
          )}
          {suggestions.length === 0 && (
            <p className="mb-2 text-[11px] text-alert">
              مالقيتش موقع قريب في الداتا — اختار المكان بنفسك من القايمة تحت أو هيتحط في آخر الملف.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <button key={s.name} onClick={() => setInsertAfter(s.lastRow)}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  insertAfter === s.lastRow ? "border-primary bg-primary/10 text-ink" : "border-border text-muted hover:text-ink"
                }`}>
                <span className="min-w-0 flex-1 truncate text-right" title={s.name}>{s.name}</span>
                <span className="shrink-0 text-[10px] text-muted">{s.count} صف · آخر صف {s.lastRow + 1}</span>
              </button>
            ))}
            <button onClick={() => setInsertAfter(dataTable.rows.length - 1)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                insertAfter === dataTable.rows.length - 1 ? "border-primary bg-primary/10 text-ink" : "border-border text-muted hover:text-ink"
              }`}>
              في آخر الملف
            </button>
          </div>
          {insertAfter !== null && (
            <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] text-ink">
              هيتحط <b>{sheetTable.rows.length}</b> صف بعد صف رقم <b>{insertAfter + 1}</b>
              {dataLocCol ? ` (${String(dataTable.rows[insertAfter]?.[dataLocCol] ?? "").slice(0, 40)})` : ""}
            </p>
          )}
        </section>
      )}

      {/* ④ تنفيذ */}
      {ready && !merged && (
        <button onClick={runMerge} disabled={!!busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition disabled:opacity-50">
          <Check size={16} /> {busy ?? "ادمج"}
        </button>
      )}

      {/* ⑤ النتيجة */}
      {merged && dataTable && (
        <section className="rounded-xl border-2 border-brand bg-brand/5 p-3">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-brand">
            <Check size={15} /> اتدمجت — {merged.added} صف اتضافوا
          </h2>
          <p className="mb-2 text-[11px] text-muted">
            الإجمالي بقى {merged.rows.length.toLocaleString("en")} صف. اتأكدنا إن مافيش صف قديم اتغيّر أو اتشال.
          </p>

          {/* معاينة حوالين مكان الإدخال */}
          <div className="mb-2 overflow-auto rounded-lg border border-border" style={{ maxHeight: "40vh" }}>
            <table className="w-full border-collapse text-[11px]" style={{ direction: "rtl" }}>
              <thead className="sticky top-0 bg-surface-2 text-muted">
                <tr>
                  <th className="border-b border-l border-border px-2 py-1 text-right">#</th>
                  {dataTable.headers.map((h) => (
                    <th key={h} className="border-b border-l border-border px-2 py-1 text-right whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRange(merged.at, merged.added, merged.rows.length).map((i) => {
                  const isNew = i >= merged.at && i < merged.at + merged.added;
                  return (
                    <tr key={i} className={isNew ? "bg-primary/15 font-bold" : ""}>
                      <td className="border-b border-l border-border px-2 py-1 text-muted">{i + 1}</td>
                      {dataTable.headers.map((h) => (
                        <td key={h} className="border-b border-l border-border px-2 py-1 whitespace-nowrap text-ink">
                          {String(merged.rows[i]?.[h] ?? "").slice(0, 28) || "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mb-2 text-[10px] text-muted">الصفوف المميّزة هي الجديدة.</p>

          <div className="flex flex-col gap-2">
            <button onClick={openFull} disabled={!!busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition disabled:opacity-50">
              <ArrowDownToLine size={16} /> {busy ?? "افتح الداتا كلها (إكسيل)"}
            </button>
            <p className="-mt-1 text-center text-[10px] text-muted">
              {merged.rows.length.toLocaleString("en")} صف كاملين، ملف إكسيل بيفتح من اليمين
              {merged.rows.length > SLOW_ROWS ? " — التجهيز بياخد شوية ثواني، استنى" : ""}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={shareFull} disabled={!!busy}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-ink transition disabled:opacity-50">
                <Share2 size={14} /> شارك الداتا
              </button>
              <button onClick={openReview} disabled={!!busy}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-ink transition disabled:opacity-50">
                <Eye size={14} /> شيت المراجعة
              </button>
            </div>

            <button onClick={updateAppData} disabled={!!busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/10 py-2.5 text-sm font-bold text-primary transition disabled:opacity-50">
              <RefreshCw size={15} /> حدّث داتا البرنامج
            </button>
            <button onClick={() => setMerged(null)}
              className="rounded-xl border border-border py-2 text-xs text-muted transition hover:text-ink">
              رجوع وتعديل
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** صفوف المعاينة: ٣ قبل، الجديد (بحد أقصى ٦)، و٣ بعد. */
function previewRange(at: number, added: number, total: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, at - 3); i < at; i++) out.push(i);
  for (let i = at; i < Math.min(at + added, at + 6); i++) out.push(i);
  for (let i = at + added; i < Math.min(total, at + added + 3); i++) out.push(i);
  return out;
}

function FileBox({ label, icon, name, info, onPick }: {
  label: string; icon: React.ReactNode; name: string; info: string | null;
  onPick: (f: File) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-1 rounded-xl border-2 border-dashed border-border bg-surface p-3 transition hover:border-primary">
      <span className="flex items-center gap-1.5 text-sm font-bold text-ink">{icon} {label}</span>
      {name ? (
        <>
          <span className="truncate text-[11px] text-primary" title={name}>{name}</span>
          {info && <span className="text-[10px] text-muted">{info}</span>}
        </>
      ) : (
        <span className="text-[11px] text-muted">دوس عشان تختار الملف</span>
      )}
      <input type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </label>
  );
}

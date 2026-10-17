/**
 * 📊 التقارير المحفوظة — صفحة المجمّع (٣٠ سبتمبر ٢٠٢٦)
 *
 * كل تفريغ بيعمل تقرير شامل (`buildBatchReport`) ويتحفظ في IndexedDB
 * (`reportStore`). بتفضل بعد الخروج من الصفحة وقفل المتصفح، ومابتتمسحش غير
 * بزرّ «امسح» على التقرير نفسه أو «امسح كل التقارير» (بيسأل الأول).
 *
 * 🎙️ تقرير واحد للجلسة (٤ أكتوبر ٢٠٢٦): المالك «تطلع كله في تقرير واحد سواء
 * سجلت مقطع صوتي واحد او اكتر». كل التسجيلات اللي بتتفرّغ بنفس ورقة القراية
 * بتتجمع في التقرير المفتوح (`sessionReport.ts`). «📄 ابدأ تقرير جديد» بيقفله
 * — مابيمسحش حاجة — فالتفريغ الجاي بيبدأ تقرير لوحده.
 */
import { useEffect, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { diagText, extrasMaybeSaid, mmss, recordingsAr, reportText, type BatchReport } from "../lib/batchReport";
import { clearReports, closeOpenSessionReports, deleteReport, listReports, removeReportPart } from "../lib/reportStore";
import { hasReportDiag, newestOpenSession, pickSessionReport, withDiag } from "../lib/sessionReport";

const sec = (ms: number) => (ms / 1000).toFixed(1);

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "bad" | "warn" }) {
  const c = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : "text-slate-200";
  return (
    <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
      <div className={`text-base font-bold tabular-nums ${c}`}>{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

/** وقت الساعة بس («٣:١٥ م») — إمتى التسجيل ده اتسجّل */
const clockAr = (ms: number) => new Date(ms).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });

function ReportCard({ r, isOpen, onDelete, onRemovePart }: {
  r: BatchReport;
  isOpen?: boolean;
  onDelete: () => void;
  /** «شيل التسجيل ده» (مراجعة ٤ أكتوبر · عيب ٣) */
  onRemovePart: (clipId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  /**
   * 🔍 التشخيص (٣ أكتوبر ٢٠٢٦): ليه كل لوحة طلعت غلط أو ماطلعتش + نص الموديل
   * وكوهير الخام لكل مقطع. طويل ⇒ مقفول لحد ما يتفتح، وله زرّ نسخ لوحده
   * (رسالة الواتساب بتتقص عند ٤٠٩٦ بايت فمابيدخلش في «انسخ التقرير»).
   * التقارير القديمة مافيهاش تشخيص ⇒ الزرّين مابيظهروش.
   */
  const showDiag = hasReportDiag(r);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  /**
   * 🔎 (عيب ٦/١١ · مراجعة ٤ أكتوبر) تقرير الجلسة بيتحفظ من غير نص المقاطع
   * الخام (موجود في التسجيلات) ⇒ بيتبني منها لما التشخيص يتفتح أو يتنسخ بس.
   */
  const diagFull = () => diagText(withDiag(r));
  /** التسجيل اللي مستني تأكيد «أيوه شيله» */
  const [confirmPart, setConfirmPart] = useState<string | null>(null);
  const canRemovePart = !r.snapshotOf && Array.isArray(r.sheet) && (r.parts?.length ?? 0) > 1;
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <button className="flex w-full items-center justify-between text-right" onClick={() => setOpen((v) => !v)}>
        <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-200">
          {r.label}
          {isOpen && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-normal text-emerald-300">
              مفتوح — بيتحدّث مع كل تفريغ
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          ⏱️ {mmss(r.audioSec)} في {sec(r.elapsedMs)}ث
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* 🔁 (عيب ٨) الورقة اتقرت تاني ⇒ التقرير ده لوحده */}
      {r.rereadOf && (
        <p className="mt-2 text-[11px] text-sky-200/80">
          🔁 نفس الورقة اتقرت تاني ⇒ ده تقرير لوحده (اللي قبله اتقفل بأرقامه زي ما هي)
        </p>
      )}

      {/* 🎙️ التقرير بيجمع أكتر من تسجيل — كل واحد بمدته وكام لوحة طلعت منه */}
      {(r.parts?.length ?? 0) > 1 && (
        <div className="mt-2 rounded-lg bg-black/30 px-2 py-1.5 text-xs text-slate-300">
          <div className="font-bold text-sky-300">🎙️ بيجمع {recordingsAr(r.parts!.length)} بنفس ورقة القراية</div>
          <ul className="mt-1 space-y-0.5">
            {r.parts!.map((p, k) => (
              <li key={p.clipId} className="flex flex-wrap items-center gap-x-2 tabular-nums">
                <span>
                  {k + 1}. {p.label || `تسجيل ${k + 1}`}
                  {p.startedAtMs ? ` · ${clockAr(p.startedAtMs)}` : ""}
                  {" · "}⏱️ {mmss(p.input.audioSec)}
                  {" · "}🚗 {p.input.rows?.length ?? 0} لوحة
                </span>
                {/*
                  🔎 (عيب ٣ · مراجعة ٤ أكتوبر) أخد غلط أو دوشة اتفرّغ ⇒ يتشال من
                  التقرير بإيد المالك (خطوتين). مسح المقطع نفسه مابيلمسش التقارير.
                */}
                {canRemovePart && (confirmPart !== p.clipId ? (
                  <button className="text-[11px] text-slate-400 underline" onClick={() => setConfirmPart(p.clipId)}>
                    شيل التسجيل ده
                  </button>
                ) : (
                  <span className="flex gap-2 text-[11px]">
                    <button
                      className="text-rose-300 underline"
                      onClick={() => { setConfirmPart(null); onRemovePart(p.clipId); }}
                    >
                      أيوه شيله من التقرير
                    </button>
                    <button className="text-slate-400 underline" onClick={() => setConfirmPart(null)}>لأ</button>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {r.hasSheet && <Stat label="قلت" value={r.said} />}
        <Stat label="طلع" value={r.got} />
        {r.hasSheet && <Stat label="صح" value={r.correct} tone="ok" />}
        {r.hasSheet && <Stat label="ماطلعش" value={r.missed.length} tone={r.missed.length ? "bad" : "ok"} />}
        <Stat label={r.hasSheet ? "اختراع" : "اختراع (تقدير)"} value={r.inventions} tone={r.inventions ? "bad" : "ok"} />
        {/* من غير «القراية التانية الغلط لنفس اللوحة» — دي اتقالت، مش زيادة */}
        {r.hasSheet && <Stat label="زيادة ممكن اتقالت" value={extrasMaybeSaid(r)} tone="warn" />}
      </div>
      {/* ⏳ (عيب ١٠) ضايعة في حتة من الورقة مافيش تسجيل متفرّغ سمع حاجة فيها */}
      {r.hasSheet && (r.notYet ?? 0) > 0 && (
        <p className="mt-1.5 text-[11px] text-amber-200/80">
          ⏳ منهم {r.notYet} في حتة من الورقة مافيش تسجيل متفرّغ سمع حاجة فيها (بعد آخر لوحة اتسمعت، قبل أولها، أو بين تسجيلين) — غالباً في تسجيل لسه ماتفرّغش، مش غلط موديل
        </p>
      )}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-xs text-slate-300">
        <div className="rounded-lg bg-black/30 px-2 py-1.5">
          🏷️ النوع: {r.hasSheet ? `قلت ${r.types.said} · ` : ""}طلع {r.types.got}
          {r.hasSheet && ` · صح ${r.types.correct} · غلط ${r.types.wrong.length} · ماطلعش ${r.types.missing.length}`}
        </div>
        <div className="rounded-lg bg-black/30 px-2 py-1.5">
          📝 الملاحظة: {r.hasSheet ? `قلت ${r.notes.said} · ` : ""}طلع {r.notes.got}
          {r.hasSheet && ` · صح ${r.notes.correct} · غلط ${r.notes.wrong.length} · ماطلعتش ${r.notes.missing.length}`}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {r.missed.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold text-rose-300">اللوحات اللي ماطلعتش وسببها</div>
              <ul className="space-y-1 text-sm text-slate-300">
                {r.missed.map((m) => (
                  <li key={m.plate}><span className="font-mono text-rose-200">{m.plate}</span> — {m.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {r.extras.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold text-amber-300">لوحات طلعت ومااتقالتش</div>
              <ul className="space-y-1 text-sm text-slate-300">
                {r.extras.map((x) => (
                  <li key={x.plate}><span className="font-mono text-amber-200">{x.plate}</span> — {x.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs leading-relaxed text-slate-300">
            {reportText(r)}
          </p>
          {showDiag && (
            <div className="rounded-xl border border-white/10 bg-black/30">
              <button
                className="flex w-full items-center justify-between px-3 py-2 text-right text-xs font-bold text-sky-300"
                onClick={() => setDiagOpen((v) => !v)}
              >
                <span>🔍 التشخيص (نص الموديل وكوهير)</span>
                {diagOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {diagOpen && (
                <p className="max-h-[60vh] overflow-auto whitespace-pre-wrap border-t border-white/10 p-3 text-xs leading-relaxed text-slate-300">
                  {diagFull()}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="btn-ghost btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(reportText(r));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch { /* المتصفح رفض النسخ */ }
          }}
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? "اتنسخ ✓" : "انسخ التقرير"}
        </button>
        {showDiag && (
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(diagFull());
                setDiagCopied(true);
                setTimeout(() => setDiagCopied(false), 2000);
              } catch { /* المتصفح رفض النسخ */ }
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {diagCopied ? "اتنسخ ✓" : "انسخ التشخيص"}
          </button>
        )}
        {!confirmDel ? (
          <button className="btn-ghost btn-sm" onClick={() => setConfirmDel(true)}>
            <Trash2 className="h-3.5 w-3.5" /> امسح
          </button>
        ) : (
          <>
            <button className="btn-ghost btn-sm text-rose-300" onClick={onDelete}>أيوه امسحه</button>
            <button className="btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>لأ</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function BatchReports({ refreshKey, sheetKey }: {
  refreshKey: number;
  /** مفتاح ورقة القراية الحالية — عشان نعلّم التقرير اللي التفريغ الجاي هيدخله */
  sheetKey?: string;
}) {
  const [reports, setReports] = useState<BatchReport[]>([]);
  const [confirmAll, setConfirmAll] = useState(false);
  const [startedNew, setStartedNew] = useState(false);

  const reload = () => listReports().then(setReports).catch(() => setReports([]));
  useEffect(() => { void reload(); }, [refreshKey]);

  /** التقرير المفتوح = نفس اختيار التفريغ الجاي بالظبط (`pickSessionReport`) */
  const openId = sheetKey === undefined ? undefined : pickSessionReport(reports, sheetKey, Date.now())?.id;
  /**
   * 🔎 (عيب ١٢ · مراجعة ٤ أكتوبر) فيه تقرير مفتوح بس على ورقة تانية ⇒ الورقة
   * اتعدّلت في النص، والتفريغ الجاي هيبدأ تقرير لوحده — كان بيحصل من غير ما
   * حد يقول (التقرير القديم بس بيفقد علامة «مفتوح»).
   */
  const staleOpen = sheetKey !== undefined && !openId ? newestOpenSession(reports, Date.now()) : undefined;

  /** «📄 ابدأ تقرير جديد» — دوسة واحدة من غير تأكيد: مابيمسحش حاجة، بيقفل المفتوح بس */
  const startNew = async () => {
    try {
      await closeOpenSessionReports();
    } catch { /* التخزين مابيردّش — التقارير زي ما هي */ }
    setStartedNew(true);
    setTimeout(() => setStartedNew(false), 3000);
    void reload();
  };

  return (
    <div className="card">
      <div className="card-title justify-between">
        <span className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> التقارير المحفوظة ({reports.length})
        </span>
        <span className="flex flex-wrap gap-2">
          {reports.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={startNew}>
              {startedNew ? "✓ التفريغ الجاي هيبدأ تقرير جديد" : "📄 ابدأ تقرير جديد"}
            </button>
          )}
          {reports.length > 0 && (!confirmAll ? (
            <button className="btn-ghost btn-sm" onClick={() => setConfirmAll(true)}>
              <Trash2 className="h-3.5 w-3.5" /> امسح كل التقارير
            </button>
          ) : (
            <span className="flex gap-2">
              <button className="btn-ghost btn-sm text-rose-300" onClick={async () => { await clearReports(); setConfirmAll(false); void reload(); }}>
                أيوه امسحهم كلهم
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmAll(false)}>لأ</button>
            </span>
          ))}
        </span>
      </div>
      {reports.length > 0 && (
        <p className="mb-2 text-[11px] text-slate-400">
          📄 «ابدأ تقرير جديد» ⇐ التسجيلات اللي هتتفرّغ بعد كده هتتجمع في تقرير لوحدها
        </p>
      )}
      {staleOpen && (
        <p className="mb-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          ⚠️ ورقة القراية اتغيّرت — التفريغ الجاي هيبدأ تقرير جديد (التقرير المفتوح «{staleOpen.label}» على الورقة القديمة)
        </p>
      )}
      {reports.length === 0 ? (
        <p className="text-xs text-slate-400">لسه مافيش تقارير — التفريغ بيعمل تقرير ويتحفظ هنا (التسجيلات بنفس ورقة القراية بتتجمع في تقرير واحد)، ومابيتمسحش غير بإيدك.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              r={r}
              isOpen={r.id === openId}
              onDelete={async () => { await deleteReport(r.id); void reload(); }}
              onRemovePart={async (clipId) => {
                try { await removeReportPart(r.id, clipId); } catch { /* التخزين مابيردّش — التقرير زي ما هو */ }
                void reload();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

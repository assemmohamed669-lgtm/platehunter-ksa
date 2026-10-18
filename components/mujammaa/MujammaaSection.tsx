"use client";
/**
 * ==========================================================================
 *  🧮 المجمّع في صفحة «التسجيل» (سوبر أدمن بس) — الغلاف
 * ==========================================================================
 *  المالك (١٦ أكتوبر ٢٠٢٦): «تنقل شغل المجمع زي ماهو في صفحه التسجيل اللي علي قناص
 *  اللي هيا مخفيه عن المناديب وظاهرة للسوبر ادمن فقط».
 *
 *  الغلاف ده بيعمل اللي كان بيعمله تطبيق المعمل حوالين الصفحة:
 *   · سجل أخطاء واحد للجلسة (المعمل: `useRef(new ErrorLog())` في App)
 *   · التوكن من قاعدة البيانات (`get_trial_token` — نفس توكن «الجديد»، مافيش سر جديد)
 *   · فحص سيرفر المجمّع (الوسيط على إيطاليا) قبل التفريغ + زرار «افحص تاني»
 *   · عنوان بديل للتجربة (مثلاً http://localhost:8780 بنفق SSH)
 *  والكلاسات محبوسة جوّه `.mj-root` (mujammaa.css) — مابتلمسش باقي التطبيق.
 *
 *  ⚠️ بيتعرض بس بعد ما الصفحة تتأكّد إن الحساب سوبر أدمن (`superOk` في
 *  registration/page.tsx) — والتوكن مابيتطلبش غير هنا.
 *
 *  🧮➡️ ١٨ أكتوبر: بقى للمشترك في **كل** الخدمات كمان (`canUseMujammaa`) — `advanced=false`:
 *  المالك: «الشروحات عايزك تشيلها كلها هيا تظهر بس للسوبر ادمن فقط وكمان اخفي عنهم نسخ التقارير
 *  والحاجات اللي انا ببعتلك منها تقارير لما بعمل تجربه». فالمندوب مابيشوفش العنوان/الموديل/العنوان
 *  البديل (وبيكلّم السيرفر الأساسي دايماً) — بس سطر «السيرفر مش جاهز» لو فيه مشكلة.
 */
import "./mujammaa.css";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import BatchPage from "./pages/BatchPage";
import { ErrorLog } from "./lib/errorLog";
import {
  BATCH_BASE,
  clearBatchBaseOverride,
  probeBatchServer,
  readBatchBase,
  saveBatchBaseOverride,
  type BatchProbe,
} from "./lib/batchServer";
import { fetchTrialToken } from "@/lib/trialModelGate";
import { normalizeJudgeToken } from "@/lib/plateJudgeGate";

/** سجل واحد طول ما التطبيق مفتوح — زي المعمل (الرجوع للصفحة مابيمسحش الأخطاء) */
let sessionLog: ErrorLog | null = null;

export default function MujammaaSection({
  agentName,
  onBusyChange,
  visible = true,
  advanced = true,
  onExportToRecords,
  hideCheckBox = false,
  onCheckInfo,
}: {
  agentName: string;
  /** بيسجّل أو بيقفل المقطع — «التسجيل» بتقفل المفتاح وقتها */
  onBusyChange?: (busy: boolean) => void;
  /** 📍 ظاهر؟ — المجمّع بيفضل متحمّل ورا «التسجيل القديم»، والموقع كل ثانية بيتقفل وقتها */
  visible?: boolean;
  /** true = السوبر أدمن (الشروحات والتقارير والتشخيص) · false = المندوب */
  advanced?: boolean;
  /** 📋 «تصدير للسجلات» ⇒ «داتا التسجيلات» (من صفحة التسجيل — الحفظ برّه المجمّع) */
  onExportToRecords?: ComponentProps<typeof BatchPage>["onExportToRecords"];
  /** 📥 «التسجيل» بيعرض مربع ملف التشييك (رفع/تغيير/مسح) ⇒ مربع القراية بتاع المجمّع يستخبى */
  hideCheckBox?: boolean;
  onCheckInfo?: ComponentProps<typeof BatchPage>["onCheckInfo"];
}) {
  const errorLog = useMemo(() => (sessionLog ??= new ErrorLog()), []);
  // المندوب بيكلّم السيرفر الأساسي دايماً — العنوان البديل (للتجربة) للسوبر أدمن بس
  const [base, setBase] = useState<string>(() => (advanced ? readBatchBase() : BATCH_BASE));
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [probe, setProbe] = useState<BatchProbe | null>(null);
  const [checking, setChecking] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlMsg, setUrlMsg] = useState<string | null>(null);

  const recheck = useCallback(async (b: string, t: string | null) => {
    setChecking(true);
    try {
      // التوكن ماوصلش أول مرة (نت/جلسة) ⇒ «افحص تاني» بيجيبه تاني بدل ما يفضل مقفول
      let tok = t;
      if (!tok) {
        tok = normalizeJudgeToken(await fetchTrialToken());
        setToken(tok);
      }
      setProbe(await probeBatchServer(b, tok));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const t = normalizeJudgeToken(await fetchTrialToken());
      if (!alive) return;
      setToken(t);
      setTokenLoaded(true);
      void recheck(advanced ? readBatchBase() : BATCH_BASE, t);
    })();
    return () => {
      alive = false;
    };
  }, [recheck, advanced]);

  const ok = !!probe && probe.ready && probe.tokenOk;

  return (
    <div className="mj-root space-y-4" dir="rtl">
      {/* المندوب: ولا كلمة لو السيرفر تمام — سطر واحد بس لو فيه مشكلة */}
      {!advanced && ((probe && !ok && !checking) || (tokenLoaded && !token)) && (
        <div className="card border-red-400/40 bg-red-500/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-red-100">
            <span>
              🔴 {tokenLoaded && !token
                ? "مش قادرين نوصل لحسابك دلوقتي — اقفل الصفحة وافتحها تاني."
                : "سيرفر التسجيل مش جاهز دلوقتي — جرّب كمان شوية (تسجيلاتك محفوظة على الموبايل)."}
            </span>
            <button className="btn-ghost btn-sm" disabled={checking || !tokenLoaded} onClick={() => void recheck(base, token)}>
              افحص تاني
            </button>
          </div>
        </div>
      )}
      {advanced && (
      <div className="card">
        <div className="card-title justify-between">
          <span className="flex items-center gap-2">🧮 سيرفر المجمّع</span>
          <span className="flex items-center gap-2 text-xs font-normal">
            <span className={`chip ${ok ? "bg-emerald-500/20 text-emerald-200" : probe ? "bg-red-500/20 text-red-200" : "bg-white/10 text-slate-300"}`}>
              {checking || !probe ? "بيفحص…" : ok ? "🟢 شغّال" : "🔴 مش جاهز"}
            </span>
            <button
              className="btn-ghost btn-sm"
              disabled={checking || !tokenLoaded}
              onClick={() => void recheck(base, token)}
            >
              افحص تاني
            </button>
          </span>
        </div>
        <div className="space-y-1 text-xs text-slate-300">
          <div className="truncate">
            <span className="text-slate-500">العنوان: </span>
            <span className="ltr-nums">{base}</span>
            {base !== BATCH_BASE && <span className="chip mr-2 bg-amber-500/20 text-amber-200">بديل للتجربة</span>}
          </div>
          {probe?.model && (
            <div>
              <span className="text-slate-500">الموديل: </span>
              <span className="font-bold text-sky-200">{probe.model}</span>
              <span className="text-slate-500"> · النوع من كوهير · الأرشيف على السيرفر: </span>
              {probe.archiveOn ? "شغّال" : "واقف"}
            </div>
          )}
          {tokenLoaded && !token && (
            <div className="text-red-200">مافيش توكن من قاعدة البيانات — اقفل الصفحة وافتحها تاني.</div>
          )}
          {probe && !ok && probe.message && <div className="text-amber-200">⚠️ {probe.message}</div>}
        </div>
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer select-none">عنوان بديل (للتجربة)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="input ltr-nums min-w-0 flex-1"
              dir="ltr"
              placeholder="http://localhost:8780"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
            />
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                if (!saveBatchBaseOverride(urlDraft)) {
                  setUrlMsg("العنوان لازم يبقى https (أو localhost) ومن غير توكن أو استعلام.");
                  return;
                }
                const b = readBatchBase();
                setBase(b);
                setUrlMsg(null);
                void recheck(b, token);
              }}
            >
              احفظ وافحص
            </button>
            {base !== BATCH_BASE && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  clearBatchBaseOverride();
                  setBase(BATCH_BASE);
                  setUrlDraft("");
                  void recheck(BATCH_BASE, token);
                }}
              >
                رجّع الأساسي
              </button>
            )}
          </div>
          {urlMsg && <div className="mt-1 text-red-200">{urlMsg}</div>}
        </details>
      </div>
      )}

      <BatchPage
        errorLog={errorLog}
        advanced={advanced}
        server={{ base, token, probe }}
        agentName={agentName}
        onBusyChange={onBusyChange}
        visible={visible}
        onExportToRecords={onExportToRecords}
        hideCheckBox={hideCheckBox}
        onCheckInfo={onCheckInfo}
      />
    </div>
  );
}

"use client";

/**
 * «التسجيل الجديد» — سجّل أو ارفع، وبعدين فرّغ مرة واحدة.
 *
 * الفرق عن الصفحة القديمة: مافيش بثّ لحظي. المندوب بيسجّل كلامه كله متصل
 * (أو يرفع ملف) ويدوس «تفريغ» — والبرنامج بيفرّغ التسجيل كله ويطلّع اللوحات.
 * الملف الكامل بيدّي دقة أعلى من البثّ لأن المحرك بيشوف السياق كله ويراجع
 * نفسه — نفس السبب اللي خلّى دقة المنافس عالية.
 *
 * **للسوبر أدمن بس** لحد ما تتجرّب — نفس قفل الصفحة القديمة بالظبط.
 */

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Upload, FileAudio, Loader2, AlertTriangle, CheckCircle2, X, Cpu, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { runBatchTranscription, type MergedPlate, type BatchProgress } from "@/lib/batchTranscript";
import { transcribeWithEngine, readPlateSliceWithModel } from "@/lib/batchAudio";
import { resolveModelBase } from "@/lib/modelEndpoint";
import { readJudgeEndpoint, saveJudgeEndpoint } from "@/lib/plateJudgeGate";
import { getGroqKey } from "@/lib/voiceKeys";
import PlateBadge from "@/components/PlateBadge";

export default function RegistrationV2Page() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plates, setPlates] = useState<MergedPlate[] | null>(null);
  const [usedModel, setUsedModel] = useState(false);

  // عنوان خدمة الموديل + توكنها. مكانهم هنا **بالقصد**: ده إعداد بتاع الصفحة
  // دي لوحدها، فمالوش لازمة يتحط في صفحة تانية والمندوب شغّال عليها.
  const [modelUrl, setModelUrl] = useState("");
  const [modelToken, setModelToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; msg: string } | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      // القفل بيقول **ليه** رفض، ومابيحوّلش بصمت.
      //
      // كان بيعمل router.replace ساكت: الصفحة بتختفي وإنت في صفحة تانية
      // فاكر نفسك في التسجيل، وتدوّر على مربّع مش موجود لأنك أصلاً مش هنا.
      // التحويل الصامت بيخفي السبب ويخلّي الغلط يبان وكأنه «الميزة مااترفعتش».
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data.user) { setDenied("مش مسجّل دخول — ادخل الأول وبعدين افتح الصفحة دي تاني."); return; }
      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("is_super").eq("id", data.user.id).single();
      if (profErr) { setDenied("مش قادر أقرا صلاحيتك: " + profErr.message); return; }
      if (!prof?.is_super) { setDenied("الصفحة دي للسوبر أدمن بس، وحسابك الحالي مش سوبر أدمن."); return; }
      const saved = readJudgeEndpoint();
      if (saved) { setModelUrl(saved.base); setModelToken(saved.token); }
      setAllowed(true);
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function startRecording() {
    setError(null);
    setPlates(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setAudio(blob);
        setAudioName("تسجيل " + new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("مش قادر يفتح الميكروفون — اسمح للتطبيق بالتسجيل وجرّب تاني.");
    }
  }

  function stopRecording() {
    try { recRef.current?.stop(); } catch { /* اتوقف خلاص */ }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
  }

  async function transcribe() {
    if (!audio) return;
    setError(null);
    setPlates(null);
    setBusy("جاري التفريغ…");
    try {
      const apiKey = (await getGroqKey()) ?? "";
      // عنوان الموديل: المسجّل تلقائياً من الخدمة، وإلا اللي محطوط يدوي هنا
      const manual = readJudgeEndpoint();
      const base = await resolveModelBase(manual?.base ?? null);
      const token = manual?.token ?? "";

      const out = await runBatchTranscription(audio, {
        transcribe: (a) => transcribeWithEngine(a, apiKey),
        modelBase: base && token ? base : null,
        token,
        readSlice: readPlateSliceWithModel,
        onProgress: (p: BatchProgress) => {
          if (p.phase === "transcribing") setBusy("جاري تفريغ التسجيل…");
          else if (p.phase === "reading") setBusy("جاري قراءة اللوحات… " + p.done + " من " + p.total);
        },
      });
      setPlates(out.plates);
      setUsedModel(out.usedModel);
    } catch (e) {
      setError((e as Error)?.message ?? "تعذّر التفريغ.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * اختبار حقيقي — رحلة كاملة للخدمة بالتوكن، مش مجرد «فيه حاجة متخزّنة».
   *
   * `/health` بالذات لأنه بيتحقق من **الاتنين مرة واحدة**: العنوان (النفق
   * لازم يرد) والتوكن (بيرجع ٤٠١ لو غلط). `/ping` كان هيقول «واصل» حتى
   * والتوكن غلط — ودي بالظبط الغلطة اللي ضيّعت جلسة كاملة قبل كده.
   */
  async function probeModel() {
    setProbing(true);
    setProbe(null);
    const base = modelUrl.trim().replace(/\/+$/, "");
    try {
      // AbortSignal.timeout مش موجود في WebView قديم — من غير الحارس ده
      // الاختبار كان هيرمي ويقول «مافيش رد» والخدمة شغالة فعلاً.
      const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(20000) : undefined;
      const res = await fetch(base + "/health", {
        headers: { "X-Plate-Token": modelToken.trim() },
        signal: timeout,
      });
      if (res.status === 401) {
        setProbe({ ok: false, msg: "النفق واصل بس التوكن مرفوض — راجع التوكن." });
      } else if (!res.ok) {
        setProbe({ ok: false, msg: "الخدمة ردّت بكود " + res.status + "." });
      } else {
        const body = await res.json() as { model?: string; device?: string };
        setProbe({
          ok: true,
          msg: "واصل — " + (body.model ?? "الموديل") + " على " + (body.device === "cuda" ? "كارت الشاشة" : body.device ?? "الجهاز"),
        });
      }
    } catch {
      // مافيش رد خالص: النفق واقع، أو الجهاز مقفول، أو الأصل مرفوض في CORS.
      setProbe({ ok: false, msg: "مافيش رد — الخدمة مقفولة أو عنوان النفق اتغيّر." });
    } finally {
      setProbing(false);
    }
  }

  if (denied) {
    return (
      <div className="flex flex-col gap-3 py-10">
        <h1 className="text-xl font-black text-ink">التسجيل الجديد</h1>
        <div className="flex items-start gap-2 rounded-xl border border-alert/40 bg-alert/10 px-3 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-xs leading-relaxed text-ink">{denied}</p>
        </div>
      </div>
    );
  }

  if (allowed === null) return <div className="py-16 text-center text-sm text-muted">جارٍ التحقق…</div>;

  const configured = !!modelUrl && !!modelToken;
  const statusLabel = !configured ? "محتاج إعداد"
    : probe?.ok ? "واصل ✓"
    : probe ? "مش واصل ✗"
    : "محفوظ (مش متجرَّب)";
  const statusTone = !configured ? "text-alert"
    : probe?.ok ? "text-brand"
    : probe ? "text-danger"
    : "text-amber-500";

  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  const mmss = pad(seconds / 60) + ":" + pad(seconds % 60);
  const review = plates?.filter((p) => p.needsReview).length ?? 0;

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="text-xl font-black text-ink">التسجيل الجديد</h1>
      <p className="-mt-2 text-xs leading-relaxed text-muted">
        سجّل كلامك كله على راحتك — قول اللوحات ورا بعض من غير ما تستنى — وبعدين
        دوس <b className="text-ink">تفريغ</b> مرة واحدة.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="flex-1 text-xs text-danger">{error}</p>
          <button onClick={() => setError(null)} className="text-danger" aria-label="إخفاء"><X size={14} /></button>
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        {recording ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-2xl font-black tabular-nums text-danger">
              <span className="h-3 w-3 animate-pulse rounded-full bg-danger" /> {mmss}
            </div>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 rounded-xl bg-danger px-6 py-3 text-sm font-bold text-white"
            >
              <Square size={16} /> وقف التسجيل
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-bold text-night disabled:opacity-50"
          >
            <Mic size={20} /> ابدأ التسجيل
          </button>
        )}
      </section>

      {!recording && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface py-3 text-sm text-muted transition hover:border-primary">
          <Upload size={16} /> أو ارفع ملف صوتي
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setAudio(f); setAudioName(f.name); setPlates(null); setError(null); }
              e.target.value = "";
            }}
          />
        </label>
      )}

      {audio && !recording && (
        <section className="rounded-xl border-2 border-brand/50 bg-brand/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm text-ink">
            <FileAudio size={16} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate">{audioName}</span>
            <span className="shrink-0 text-[11px] text-muted">{(audio.size / 1048576).toFixed(1)} MB</span>
          </div>
          <button
            onClick={transcribe}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night disabled:opacity-60"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" /> {busy}</> : "تفريغ"}
          </button>
        </section>
      )}

      {plates && (
        <section className="rounded-xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <CheckCircle2 size={15} className="text-brand" /> {plates.length} لوحة
            </h2>
            <div className="flex items-center gap-2 text-[11px]">
              {review > 0 && (
                <span className="rounded-full bg-alert/15 px-2 py-0.5 font-bold text-alert">
                  {review} محتاجة مراجعة
                </span>
              )}
              <span className="text-muted">{usedModel ? "بموديلنا" : "بالمحرك العام"}</span>
            </div>
          </div>

          {plates.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">مالقيناش لوحات في التسجيل ده.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {plates.map((p, i) => (
                <div
                  key={p.normalized + "-" + i}
                  className={
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 " +
                    (p.needsReview ? "border-alert/50 bg-alert/5" : "border-border")
                  }
                >
                  <span className="w-12 shrink-0 text-[10px] tabular-nums text-muted">
                    {pad(p.startSec / 60)}:{pad(p.startSec % 60)}
                  </span>
                  <PlateBadge value={p.plate || p.normalized} size="sm" />
                  <span className="flex-1 truncate text-[11px] text-muted">{p.vehicleType ?? ""}</span>
                  {p.needsReview && <AlertTriangle size={13} className="shrink-0 text-alert" />}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* إعداد خدمة الموديل — ظاهر على طول بالقصد (مش مطوي): العنوان نفق
          مؤقت بيتغيّر كل مرة الخدمة تشتغل، فده إعداد بتتفقده كل يوم مش
          مرة واحدة وتنساه. ومكانه هنا مش في صفحة شغل المناديب. */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Cpu size={14} className="shrink-0 text-muted" />
          <h2 className="text-xs font-bold text-ink">إعداد موديلنا</h2>
          <span className={"mr-auto text-[10px] font-bold " + statusTone}>{statusLabel}</span>
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-muted">
          من غير الإعداد ده التفريغ بيشتغل بالمحرك العام لوحده — شغّال، بس من
          غير مراجعة موديلنا لكل لوحة.
        </p>
        <div className="flex flex-col gap-1.5">
          <input
            dir="ltr" inputMode="url" autoComplete="off" spellCheck={false}
            value={modelUrl}
            onChange={(e) => { setModelUrl(e.target.value); setSaved(false); setProbe(null); }}
            placeholder="https://xxx.trycloudflare.com"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary"
          />
          <input
            dir="ltr" autoComplete="off" spellCheck={false}
            value={modelToken}
            onChange={(e) => { setModelToken(e.target.value); setSaved(false); setProbe(null); }}
            placeholder="التوكن"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const ok = saveJudgeEndpoint(modelUrl, modelToken);
                setSaved(ok);
                if (!ok) setError("العنوان أو التوكن شكلهم مش سليم — العنوان لازم يبدأ بـhttps.");
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 py-2 text-xs font-bold text-ink"
            >
              {saved ? <><Check size={14} className="text-brand" /> اتحفظ</> : "احفظ"}
            </button>
            <button
              onClick={probeModel}
              disabled={probing || !modelUrl || !modelToken}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-night disabled:opacity-50"
            >
              {probing ? <><Loader2 size={14} className="animate-spin" /> بجرّب…</> : "اختبار"}
            </button>
          </div>
          {probe && (
            <p className={"text-[11px] leading-relaxed " + (probe.ok ? "text-brand" : "text-danger")}>
              {probe.ok ? "✓ " : "✗ "}{probe.msg}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

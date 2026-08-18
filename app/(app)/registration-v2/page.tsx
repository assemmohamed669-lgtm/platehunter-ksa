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
import { useRouter } from "next/navigation";
import { Mic, Square, Upload, FileAudio, Loader2, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { runBatchTranscription, type MergedPlate, type BatchProgress } from "@/lib/batchTranscript";
import { transcribeWithEngine, readPlateSliceWithModel } from "@/lib/batchAudio";
import { resolveModelBase } from "@/lib/modelEndpoint";
import { readJudgeEndpoint } from "@/lib/plateJudgeGate";
import { getGroqKey } from "@/lib/voiceKeys";
import PlateBadge from "@/components/PlateBadge";

export default function RegistrationV2Page() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plates, setPlates] = useState<MergedPlate[] | null>(null);
  const [usedModel, setUsedModel] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
      if (!prof?.is_super) { router.replace("/instant-check"); return; }
      setAllowed(true);
    })();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [router]);

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

  if (allowed === null) return <div className="py-16 text-center text-sm text-muted">جارٍ التحقق…</div>;

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
    </div>
  );
}

/**
 * ==========================================================================
 *  🧮 المجمّع في قناص — صفحة «التسجيل الممتد والتفريغ المجمع» من المعمل بالحرف
 * ==========================================================================
 *
 *  منقولة من `plate-voice-lab/client/src/pages/BatchPage.tsx` (HEAD 1ce9616 · ٤ أكتوبر)
 *  بطلب المالك (١٦ أكتوبر ٢٠٢٦): «تنقل شغل المجمع زي ماهو في صفحه التسجيل اللي علي
 *  قناص … ظاهرة للسوبر ادمن فقط».
 *
 *  اللي اتغيّر عن المعمل (وبس):
 *   · محرك واحد: «كامل ⚡» (الافتراضي في المعمل). الخمسة التانيين (المسح/المقاطع/VAD/
 *     المدمج/Whisper) بيكلّموا سيرفرات ومفاتيح المعمل — مش موجودين في قناص.
 *   · النداء بيروح لوسيط المجمّع على إيطاليا مباشرةً (`batchServer.ts`) بدل Express
 *     بتاع المعمل — نفس البث ونفس الأرشيف ونفس شكل الأخطاء (batch_gateway.py).
 *   · «مطلوبة» من ملف التشييك بتاع قناص (`useAppCheckSheet`) بقواعد التطبيق — مش شيت
 *     بنك بيترفع هنا (الرفع والمسح من صفحة التشييك بس).
 *   · رفع التصحيحات لسيرفر المعمل (`/api/corrections` · `/api/edit-log`) اتشال —
 *     التصحيح بيفضل محفوظ على الجهاز زي ما هو.
 *   · كارت «بلا شاهد» بقى عن كوهير (كان بيتكلم عن Deepgram ويظهر في كل تفريغ).
 *
 *  والنتايج بتتحفظ على الجهاز مع كل تغيير — أندرويد بيقفل التبويب لما
 *  المندوب يخرج على واتساب، وبلا الحفظ كانت بتضيع كلها.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  ClipboardCheck,
  Mic,
  Play,
  Share2,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";

import BatchReports from "../components/BatchReports";
import CheckSheetBox from "../components/CheckSheetBox";
import ClipList from "../components/ClipList";
import dynamic from "next/dynamic";
// 🚨 بيتحمّل وقت ما يظهر بس — جوّاه شارة الشهادة (بحث على النت)، مالهاش لازمة لحد ما تطلع عربية مطلوبة
const WantedBatchModal = dynamic(() => import("../components/WantedBatchModal"), { ssr: false });
import { mergeWanted, newlyWanted, rematchEntries, wantedOf } from "../lib/wantedBatch";
import ReadingSheetBox, { loadReadingSheet } from "../components/ReadingSheetBox";
import { parseReadingSheet } from "../lib/batchReport";
import { saveReportFrom } from "../lib/reportStore";
import { planSessionSave, sheetKey, type ReportPart } from "../lib/sessionReport";
import ErrorLogBox from "../components/ErrorLogBox";
import PlateBadge from "../components/PlateBadge";
import PlateTable from "../components/PlateTable";
import Waveform from "../components/Waveform";

import { matchInCheckSheet } from "../lib/checkSheetAdapter";
import { chunksHeaders, chunksUrl, httpFailure, type BatchProbe } from "../lib/batchServer";
import { buildRunReport, sendRunReport, type RunReportInput } from "../lib/runTelemetry";
import { currentSession } from "@/lib/authSession";
import { ErrorLog } from "../lib/errorLog";
import { GpsTrack, currentFix, lastFixRecvAt, pinLink, recordGpsWarning, subscribeGps } from "../lib/gps";
import {
  FixCollector,
  MEM_ONLY_WARNING,
  PIN_PENDING,
  PLATES_ONLY_ERROR,
  ProgressiveClipWriter,
  SAVE_LOG_TAG,
  SaveErrorOnce,
  clipJobFields,
  clipRunOutcome,
  closeRecordedClip,
  formatBytes,
  matchingChunks,
  openClipStore,
  platesOnlyEntries,
  preliminaryEntries,
  runFailureLog,
  runVerdict,
  storageNearlyFull,
  withDeadline,
  type ClipStore,
  type SaveError,
  type StoredClip,
} from "../lib/clipStore";
import { countPinned, type TrackFix } from "../lib/platePin";
import type { BankSheet } from "../lib/bankSheet";
import { CorrectionLog } from "../lib/corrections";
import { chunkScanTiming, mapChunkFields } from "../lib/chunksResult";
import { spokenTimes } from "../lib/spokenTime";
import {
  batchEngineLabel,
  type BatchEngine,
} from "../lib/batchEngine";
import {
  SessionStamp,
  type SessionStampJSON,
} from "../lib/sessionStamp";
import { VEHICLE_TYPE_KINDS } from "../lib/plateEntry";
import { saveCorrections } from "../lib/sessionStore";
import { BatchRecorder } from "../lib/batchRecorder";
import {
  makePlateEntry,
  type PlateEntry,
} from "../lib/plateEntry";
import { openEntriesCsv, openEntriesExcel, shareEntriesExcel } from "../lib/appExport";
import { setMicBusy } from "@/lib/micBusy";
import { createBusyHold } from "@/lib/busyHold";
import {
  applyManualEdit,
  extractPlates,
  type ReviewedPlate,
} from "../lib/plateReview";
import { playMatchAlert, unlockAudio } from "../lib/alerts";
import {
  clearSession,
  keepScreenAwake,
  loadSession,
  releaseScreenAwake,
  saveSession,
} from "../lib/sessionStore";
import { useAppCheckSheet } from "../hooks/useAppCheckSheet";
import { useGps } from "../hooks/useGps";

/** أقصى مدة تسجيل — ٥ دقايق + هامش */
/**
 * أقصى مدة تسجيل — **١٥ دقيقة** بطلب المالك: المندوب بيعمل جولة كاملة في
 * التسجيل الواحد. كان ٣٢٠ث (٥:٢٠) وده كان بيقطع عليه الجولة.
 */
const MAX_BATCH_SECONDS = 900;


type Phase =
  | "idle"
  | "recording"
  | "recorded"
  | "transcribing"
  | "reviewing"
  | "done";

/** مقطع في الطابور — لسه مستني، أو بيتفرّغ، أو خلص */
/** 📋 توقيتات التفريغ الشغّال — للتقرير (`responded` = السيرفر رد أصلاً) */
type RunInfo = {
  responded: boolean;
  run?: string;
  uploadMs?: number;
  platesMs?: number;
  totalMs?: number;
  /** 🚦 دخل الطابور إمتى (performance.now) · استنى قد إيه · أطول رقم */
  queuedAt?: number;
  queuedMs?: number;
  queuePosMax?: number;
  result?: RunReportInput["result"];
};

export interface ClipJob {
  id: string;
  blob: Blob;
  /** اسم قصير يظهر للمندوب («مقطع ٣») */
  label: string;
  /** طول المقطع بالثواني — بيتحسب وقت التسجيل */
  sec: number;
  status: "waiting" | "working" | "done" | "failed";
  /**
   * 🔴 **صورة ختم الجلسة وقت دخول المقطع الطابور.**
   *
   * مسار الموقع بياخد `snapshot()` لنفس السبب بالظبط، والختم ماكانش —
   * فـ`buildEntry` كانت بتقرا `stampRef.current` **الحيّ**. والمندوب
   * بيسجّل مقطع، يحطّه في الطابور، ويرجع يسجّل تاني — و`startRecording`
   * بيعمل ختم **جديد** فاضي. فالمقطع اللي بيتفرّغ في الخلفية كان بياخد
   * ختم المقطع اللي بعده (أو فاضي).
   *
   * وده بالظبط المسار اللي زر «تفريغ واستخراج اللوحات» بيستخدمه.
   */
  stamp: SessionStampJSON;
  /** كام لوحة طلعت منه — بعد ما يخلص */
  plates?: number;
  /** كام ثانية أخد في التفريغ — عشان نعرض السرعة الحقيقية */
  tookSec?: number;
  /**
   * 🔴 لحظة بدء **التسجيل ده بالذات** (توقيت مطلق) + صورة مسار الموقع
   * وقت دخوله الطابور.
   *
   * من غيرهم، أول ما المندوب يبدأ تسجيل جديد بيدوس على
   * ‎recordingStartedAtRef‎ و‎GpsTrack.start()‎ بتمسح القراءات — فالمقطع
   * اللي لسه في الدور بتتحسب لوحاته بتوقيت المقطع الجديد وبمكانه.
   * يعني العربية تتحط في شارع تاني من غير أي رسالة خطأ.
   */
  startedAtMs: number;
  /** المسار القديم (للمهام اللي مش من مقطع محفوظ) */
  track?: GpsTrack;
  /**
   * 💾 المقطع المحفوظ اللي المهمة دي جاية منه (`clipStore`) — نتيجته
   * بتتحفظ معاه فتفضل بعد التحديث.
   */
  clipId?: string;
  /**
   * 📍 مسار موقع المقطع بتوقيت نسبي لبداية صوته — لو موجود، الدبوس بيتحط
   * بعد التفريغ بقواعد `platePin` الصارمة (≤١٠٠م · ≤٢ث · مافيش قراءة واحدة على لوحتين جيران)
   * بدل `GpsTrack.pinAt` الواسعة.
   */
  fixes?: TrackFix[];
  /** مصدر الصوت — محفوظ مع المهمة بدل قراية `source` الحيّة */
  source?: "record" | "upload";
  /**
   * 🔴 أجزاء التسجيل (٢٥٠ms) **بتاعة المقطع ده** لو لسه في الذاكرة — المدمج
   * واحتياطي المسح بيقصّوا منها ببادئة. كانوا بيقصّوا من `chunksRef` (آخر
   * تسجيل، أو فاضي بعد التحديث) ⇒ الحَكَم بيسمع **تسجيل تاني** (مراجعة ٣
   * أكتوبر — عيب ٣). مش موجودة ⇒ القصّ من عيّنات صوت المقطع نفسه.
   */
  chunks?: Blob[];
  mime?: string;
}

/** 💾 جلسة تسجيل واحد — كل حاجته في مكان واحد، ومحدّش تاني بيلمسها */
interface RecSession {
  rec: BatchRecorder;
  startEpoch: number;
  /** ختم الجلسة بتاع التسجيل ده (المربعات بتعدّل فيه وهو شغّال) */
  stamp: SessionStamp;
  col: FixCollector;
  unsub: (() => void) | null;
  timer: number | null;
  clipId: string | null;
  writer: ProgressiveClipWriter | null;
  begin: Promise<void> | null;
  /** التسجيل وقف — مافيش مؤقّت حفظ يبدأ بعد كده */
  closing: boolean;
  /** آخر مرة قِسنا المساحة وهو بيسجّل */
  storageCheckedAt: number;
}

/**
 * ==========================================================================
 *  رد «كامل ⚡» المتدفّق — اللوحات الأول، والحقول بعدها
 * ==========================================================================
 *
 *  المالك (٣ أكتوبر): «نخلي ال 5 دقايق دول يتفرغو في 10 ثواني … بدون ما
 *  يأثر علي حاجه». اللوحات بتخلص على السيرفر في ~٦ث لخمس دقايق، وكوهير
 *  (النوع/الملاحظة) هو اللي بياخد الباقي. فـ`?stream=1` بيرجّع **سطر JSON
 *  لكل مرحلة** (NDJSON):
 *     {"phase":"plates", "plates":[{plate, support, t_s}, …]}  ⇐ نعرضها فوراً
 *     {"phase":"done", …نفس الرد القديم بالحقول…}              ⇐ زي النهارده
 *  والسيرفر القديم بيتجاهل `stream=1` ويرجّع JSON واحد ⇒ بنقراه زي الأول.
 */

/** بيضيف `stream=1` على الاستعلام اللي موجود (لو فيه) */
export function withStreamParam(url: string): string {
  if (/[?&]stream=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}stream=1`;
}

type ChunksMsg = Record<string, unknown> & { phase?: unknown; ok?: unknown };

function parseObj(line: string): ChunksMsg | null {
  try {
    const v = JSON.parse(line);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as ChunksMsg) : null;
  } catch {
    return null;
  }
}

/** سطر «done» ⇒ نفس شكل الرد القديم (`{ok, plates, …}`) */
function unwrapDone(msg: ChunksMsg): ChunksMsg {
  const inner = [msg.data, msg.result].find((x) => x && typeof x === "object" && !Array.isArray(x)) as
    | ChunksMsg
    | undefined;
  const { phase: _phase, ...rest } = inner ? { ...msg, ...inner } : msg;
  delete (rest as ChunksMsg).data;
  delete (rest as ChunksMsg).result;
  return { ...rest, ok: rest.ok !== false };
}

/**
 * بيقرا رد `/api/seg-chunks` — متدفّق (NDJSON) أو JSON واحد (سيرفر قديم).
 * `onPlates` بيتنده أول ما سطر `{"phase":"plates"}` يوصل. بيرجّع الرد
 * النهائي بشكل الرد القديم؛ والتدفّق اللي اتقطع قبل «done» ⇒ `{ok:false}`
 * (مش «خلص»). JSON مش مفهوم من السيرفر القديم ⇒ بيرمي زي `r.json()`.
 */
export async function readChunksResponse(
  res: Response,
  onPlates: (msg: ChunksMsg) => void,
  /** 🚦 الطابور (١٨ أكتوبر): رقمه في الطابور، و`null` لما دوره ييجي («admitted») */
  onQueue?: (position: number | null) => void
): Promise<ChunksMsg> {
  /**
   * 🧮 قناص: الصفحة بتكلّم السيرفر مباشرةً (مش Express) — والسيرفر بيرجّع 401/400/413/
   * 503/52x كـJSON عادي من غير `ok`، اللي كان هيتقري «نجح بـ٠ لوحة». ⇒ فشل بالكود.
   */
  if (!res.ok) return httpFailure(res.status, await res.text().catch(() => "")) as ChunksMsg;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let streaming = ct.includes("ndjson");
  let platesMsg: ChunksMsg | null = null;
  let final: ChunksMsg | null = null;
  let all = "";
  let buf = "";

  const take = (line: string) => {
    const t = line.trim();
    if (!t) return;
    const obj = parseObj(t);
    if (!obj || typeof obj.phase !== "string") return; // مش سطر مرحلة
    streaming = true;
    if (final) return;
    // 🚦 وقت الزحمة الوسيط بيحط المجمّع في طابور — سطور معلومات بس، مش نتيجة
    if (obj.phase === "queued") {
      const pos = typeof obj.position === "number" && obj.position > 0 ? obj.position : 1;
      onQueue?.(pos);
      return;
    }
    if (obj.phase === "admitted") {
      onQueue?.(null);
      return;
    }
    if (obj.phase === "plates") {
      platesMsg = obj;
      onPlates(obj);
    } else if (obj.phase === "done") {
      final = unwrapDone(obj);
    } else if (obj.phase === "error" || obj.ok === false) {
      const { phase: _phase, ...rest } = obj;
      final = { ...rest, ok: false };
    }
  };

  const body = res.body as ReadableStream<Uint8Array> | null;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const s = dec.decode(value, { stream: true });
      all += s;
      buf += s;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        take(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    const tail = dec.decode();
    all += tail;
    buf += tail;
  } else {
    all = await res.text();
    buf = all;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      take(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  take(buf);

  if (streaming) {
    if (final) return mergeChunksPhases(platesMsg, final);
    return {
      ok: false,
      error: {
        where: "موديل المقاطع",
        status: res.status,
        message: platesMsg
          ? "الرد اتقطع بعد اللوحات وقبل النوع والملاحظات — فرّغه تاني"
          : "الرد اتقطع قبل ما يخلص — فرّغه تاني",
      },
    };
  }
  // سيرفر قديم: JSON واحد زي الأول
  return JSON.parse(all) as ChunksMsg;
}

/**
 * بيكمّل الرد النهائي من سطر اللوحات لو ناقص.
 *
 * 🔴 **الحقول بتتربط بنص اللوحة، مش بالترتيب** — المالك: «مش عايز نوع
 * سيارة او ملاحظه تنزل قدام سيارة غير سيارتها حتي بالغلط». لو «done» جايب
 * `fields[]` من غير `plates[]`، كل صف حقول بيروح للوحة اللي **نصّها** هو،
 * والمكرّرة: أول صف لأول لوحة.
 */
export function mergeChunksPhases(platesMsg: ChunksMsg | null, done: ChunksMsg): ChunksMsg {
  if (!done || done.ok === false) return done;
  const early = Array.isArray(platesMsg?.plates) ? (platesMsg!.plates as Array<Record<string, unknown>>) : [];
  // `t_s_final:false` بتاع سطر اللوحات مايوصلش للنهائي (أوقات «done» نهائية)
  const { phase: _phase, t_s_final: tsFinal, ...earlyInfo } = platesMsg ?? {};
  /**
   * 🔴 (مراجعة ٣ أكتوبر جولة ٢ — عيب ٢) **الدبوس من الأوقات النهائية بس.**
   * وقت سطر اللوحات مبدئي (أسوأ فرق ١٠ث ≈ ٨٧م)، فمايتورّثش للنهائي إلا لو
   * السيرفر قال صراحةً إنه نهائي — غير كده وقت «done» أو `null` (بلا دبوس).
   */
  const earlyTimeFinal = tsFinal === true;
  const finalPlates = Array.isArray(done.plates) ? (done.plates as unknown[]) : null;
  if ((finalPlates && finalPlates.length > 0) || early.length === 0) {
    return { ...earlyInfo, ...done };
  }
  const pool = new Map<string, Array<Record<string, unknown>>>();
  for (const f of Array.isArray(done.fields) ? (done.fields as Array<Record<string, unknown>>) : []) {
    const k = String(f?.plate ?? "");
    if (!k) continue;
    const arr = pool.get(k);
    if (arr) arr.push(f);
    else pool.set(k, [f]);
  }
  const plates = early.map((r) => {
    const f = pool.get(String(r.plate ?? ""))?.shift();
    const earlyT = earlyTimeFinal ? (r.t_s ?? null) : null;
    if (!f) return { ...r, t_s: earlyT };
    return { ...r, ...f, plate: r.plate, t_s: f.t_s ?? earlyT };
  });
  return { ...earlyInfo, ...done, plates };
}

/**
 * «وقّف التفريغ» يبان طول ما فيه مهمة **شغّالة** في الطابور — مهما كانت حالة
 * الصفحة (بيسجّل/وقف التسجيل/التسجيل جاهز). كان مربوط بـ`phase` فاستخبى
 * وقت التسجيل وبعد وقفه والتفريغ لسه ماشي (مراجعة ٣ أكتوبر جولة ٢ — عيب ٨).
 */
export function canStopTranscription(jobs: ReadonlyArray<{ status: string }>): boolean {
  return jobs.some((j) => j.status === "working");
}

/**
 * أقصى وقت لقفل المقطع قبل ما «بدء التسجيل» يرجع. كل نداء للمخزن له مهلة
 * أصلاً (أسوأ حالة ~٤ث)؛ ده حد أمان فوقها — بعده الصوت الكامل بيتحجز في
 * الذاكرة والحفظ بيكمّل ورا (عيب ١).
 */
const FINALIZE_MAX_MS = 6000;
/** كل قد إيه نجرّب نحفظ الصوت المحجوز في الذاكرة لو المساحة فضيت (عيب ٧) */
const RETRY_SAVE_MS = 20_000;

/** 📋 الجدول المسترجَع من الجلسة بيعرض لوحات أنهي مقطع (بيتحفظ مع الجلسة) */
const TABLE_CLIP_KEY = "mj:batch:tableClip";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "جاهز",
  recording: "بيسجّل",
  recorded: "التسجيل جاهز",
  transcribing: "بيفرّغ الصوت…",
  reviewing: "بيراجع اللوحات المشكوك فيها…",
  done: "خلص",
};

/** 🧮 قناص: سيرفر المجمّع (وسيط إيطاليا) + التوكن + آخر فحص — من `MujammaaSection` */
export interface BatchServerCtx {
  base: string;
  token: string | null;
  probe: BatchProbe | null;
}

export default function BatchPage({
  errorLog,
  advanced = true,
  server,
  agentName,
  onBusyChange,
  visible = true,
  onExportToRecords,
  hideCheckBox = false,
  onCheckInfo,
}: {
  errorLog: ErrorLog;
  /** false = وضع المندوب النظيف (بلا شرح/اختيار محركات/خانات مفاتيح) */
  advanced?: boolean;
  server: BatchServerCtx;
  /** اسم المسجّل — بيتحفظ مع الشريط في أرشيف السيرفر (`meta.json`) */
  agentName: string;
  /** 🧮 بيسجّل أو بيقفل المقطع — صفحة «التسجيل» بتقفل مفتاح «التسجيل القديم» وقتها */
  onBusyChange?: (busy: boolean) => void;
  /**
   * 📍 المجمّع ظاهر؟ — بعد أول فتحة بيفضل متحمّل مستخبي ورا «التسجيل القديم» (عشان
   * الطابور مايقفش)، فالموقع (كل ثانية على أندرويد) بيشتغل **وهو ظاهر بس** — بطارية.
   * وهو بيسجّل المفتاح مقفول (`onBusyChange`)، ولو التسجيل بدأ وهو مستخبي (دوسة على
   * «التسجيل القديم» وإذن الميك لسه بيتطلب) `GpsTrack.start()` بيفتح الموقع لوحده.
   */
  visible?: boolean;
  /**
   * 📋 «تصدير للسجلات» ⇒ تاب «داتا التسجيلات» في صفحة السجلات (١٨ أكتوبر — المالك: «هيتحفظ
   * هناك لما المندوب يصدر اللوحات اللي اتفرغت واول ما تتصدر وتتحفظ تلقائي تتمسح»). صفحة التسجيل
   * بتدّيها (الحفظ برّه المجمّع — `lib/mujammaaRecords.ts`). بترجّع اللوحات اللي اتحفظت فعلاً.
   */
  onExportToRecords?: (
    entries: PlateEntry[],
    ctx: { sheet: BankSheet | null; clipKey: string }
  ) => Promise<{ savedEntryIds: string[]; failed: number }>;
  /**
   * 📥 «التسجيل» بيعرض مربع ملف التشييك نفسه (رفع/تغيير/مسح — `components/SharedCheckFileBox.tsx`) ⇒
   * مربع القراية بتاع المجمّع بيستخبى (مايبقاش فيه مربعين لنفس الملف).
   */
  hideCheckBox?: boolean;
  /** عدد لوحات ملفات التشييك (اللي المجمّع قراها) — المربع اللي برّه بيعرضه من غير مايبني فهرس تاني */
  onCheckInfo?: (info: { plates: number | null; files: number }) => void;
}) {
  const bank = useAppCheckSheet(errorLog);
  const gps = useGps(visible);
  // النداء جوّه عامل الطابور (closure قديم) ⇒ آخر قيمة من ref
  const serverRef = useRef(server);
  serverRef.current = server;
  const agentNameRef = useRef(agentName);
  agentNameRef.current = agentName;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  /**
   * 🧮 ملف التشييك **الحالي** وقت بناء كل صف — عامل الطابور شغّال بـclosure من وقت ما
   * بدأ، فلو الملف لسه بيتقري (أو اتغيّر) كانت اللوحات المطلوبة هتطلع «مش مطلوبة».
   */
  const sheetRef = useRef(bank.sheet);
  sheetRef.current = bank.sheet;
  const onCheckInfoRef = useRef(onCheckInfo);
  onCheckInfoRef.current = onCheckInfo;
  useEffect(() => {
    onCheckInfoRef.current?.({ plates: bank.sheet ? bank.sheet.plates.length : null, files: bank.files });
  }, [bank.sheet, bank.files]);
  /**
   * 🧮 الصفحة اتقفلت (السوبر أدمن راح تاب تاني) ⇒ عامل الطابور مايكمّلش يبعت مقاطع للسيرفر
   * في الخلفية — المعمل عمره ما كان بيقفل الصفحة (`<div hidden>`)، قناص بيقفلها.
   */
  const unmountedRef = useRef(false);
  /**
   * 🧮 «الميك مشغول» (`@/lib/micBusy`): التحديث التلقائي للتطبيق وصفّارة الرسالة العاجلة
   * بيستنّوا لحد ما التسجيل يتقفل والتفريغ يخلص — زي «الجديد» بالظبط (`busyHold.ts`).
   */
  const busyRef = useRef(createBusyHold(setMicBusy));
  const recReleaseRef = useRef<(() => void) | null>(null);

  const [phase, setPhaseRaw] = useState<Phase>("idle");
  const recorderRef = useRef<BatchRecorder | null>(null);
  /**
   * 🔴 **التفريغ مايقلبش حالة «بيسجّل».**
   *
   * بقى ينفع المندوب يدوس «تفريغ» على مقطع قديم **وهو بيسجّل** مقطع جديد،
   * ومحرّكات التفريغ بتكتب `setPhase("transcribing")` ثم `"done"`. من غير
   * الحارس ده زرار «إيقاف التسجيل» كان بيتقلب «بدء التسجيل» والميك لسه
   * شغّال — ودوسة عليه تفتح مسجّل تاني ويضيع الأول.
   * طول ما فيه مسجّل شغّال (`recorderRef`) الحالة بتفضل «بيسجّل»؛ و
   * `stopRecording` بيصفّر `recorderRef` **قبل** ما يغيّر الحالة.
   */
  const setPhase = useCallback((p: Phase) => {
    setPhaseRaw(recorderRef.current && p !== "recording" ? "recording" : p);
  }, []);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [waveform, setWaveform] = useState<Uint8Array | null>(null);

  /**
   * محرك التفريغ — **«كامل ⚡» بس** في قناص (الافتراضي في المعمل، والوحيد المقيس على
   * المسطرة الكبيرة: ٩٨.٩٪ على ٢٠٣٢ لوحة برّه التدريب).
   */
  const engine: BatchEngine = "chunks";
  /** اسم الموديل الشغّال — من فحص السيرفر (`/health`) مش مكتوب بالإيد */
  const batchModelName = server.probe?.model || "SHIP-MUJAMMAA-v6";
  const [transcript, setTranscript] = useState("");
  // بنرجّع لوحات آخر جلسة — أندرويد بيقفل التبويب لما تخرج على واتساب
  const [entries, setEntries] = useState<PlateEntry[]>(() => loadSession("batch"));
  const [restoredCount] = useState(() => loadSession("batch").length);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  /** 📝 ورقة القراية + 📊 التقارير المحفوظة (٣٠/٩ — «تقرير شامل ميتمسحش غير بإيدي») */
  const [readingSheet, setReadingSheet] = useState<string>(loadReadingSheet);
  const [reportsKey, setReportsKey] = useState(0);
  /** مفتاح الورقة الحالية — كارت التقارير بيعلّم التقرير المفتوح اللي التفريغ الجاي هيدخله */
  const readingSheetKey = useMemo(() => sheetKey(parseReadingSheet(readingSheet)), [readingSheet]);
  /**
   * 🔎 (عيب ١٢ · مراجعة ٤ أكتوبر) الورقة **وقت بنا التقرير** مش وقت ما الطابور
   * بدأ: عامل الطابور (`runQueue`) بيلفّ على المقاطع بنفس الـclosure، فتعديل
   * الورقة وهو شغّال ماكانش بيوصل للمقاطع اللي في الدور — اتقيّمت واتجمّعت
   * على الورقة القديمة.
   */
  const readingSheetRef = useRef(readingSheet);
  readingSheetRef.current = readingSheet;
  /**
   * تأكيد المسح — خطوتين.
   *
   * نتيجة المجمع تعب تسجيل كامل + عشرات الثواني تفريغ، فدوسة غلط
   * على «مسح الكل» تضيّع الشغل كله. (البث المباشر مختلف — اللوحات
   * بتيجي واحدة واحدة فالخسارة أصغر، وزرّاره بلا تأكيد.)
   */
  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * 🚨 مربع «سيارات مطلوبة» بعد التفريغ (١٨ أكتوبر ٢٠٢٦ — `components/WantedBatchModal.tsx`). المالك: «لو اتفرغ
   * وطلع مطلوبه اكتر من لوحه اولا يظهر في مربع وبصوت … ولما يسحب من اليمين لليسار او العكس يلاقي اللوحات
   * التانيه بكل بياناتهم». مقطع تاني خلص والمربع مفتوح ⇒ عربياته بتتضاف من غير تكرار.
   */
  const [wantedBatch, setWantedBatch] = useState<PlateEntry[]>([]);
  /** «وريني في الجدول» — ينزل لصف اللوحة (متظلل ومكتوب عليه «اللوحة دي مطلوبة») */
  const showWantedRow = (id: string) => {
    try {
      document.getElementById(`mj-row-${id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    } catch {
      /* مش موجود في الجدول (التسجيل اللي بعده فضّاه) */
    }
  };
  /**
   * 📥 ملف التشييك اتغيّر (من أي صفحة) ⇒ لوحات الجدول بتتقارن تاني بالملف الجديد. المالك (١٨ أكتوبر):
   * «يظهر في باقي الصفحات والبرنامج يعتمدة في كل حاجه». اللي بقت مطلوبة بسبب **التغيير** ⇒ المربع بصوت؛
   * أول قراية للملف (الصفحة لسه فاتحة واللوحات راجعة من الجلسة) ⇒ الألوان بس من غير صوت.
   * ماتعتبرش تعديل من المندوب (`tableDirtyRef` مابيتلمسش).
   */
  const entriesLatestRef = useRef(entries);
  entriesLatestRef.current = entries;
  const prevSheetRef = useRef<BankSheet | null>(null);
  useEffect(() => {
    const sheet = bank.sheet;
    const prev = prevSheetRef.current;
    prevSheetRef.current = sheet;
    if (sheet === prev) return;
    const before = entriesLatestRef.current;
    const r = rematchEntries(entriesLatestRef.current, (p) => matchInCheckSheet(sheet, p));
    if (!r.changed) return;
    if (entriesRef.current === before) entriesRef.current = r.entries;
    setEntries(r.entries);
    if (prev) {
      const w = newlyWanted(before, r.entries);
      if (w.length) setWantedBatch((cur) => mergeWanted(cur, w));
    }
  }, [bank.sheet]);

  /**
   * مرحلة محرك الـVAD الحالية — «قراءة المقاطع» / «دمج الناقص» / «مسح
   * الأزواج». المندوب لازم يعرف إنه في مرحلة تانية، لأن العدّاد بيرجع
   * لصفر مع كل مرحلة والشكل بيبقى كأنه بدأ من الأول.
   */
  const [vadStage, setVadStage] = useState<string | null>(null);
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  /**
   * ==========================================================================
   *  طابور المقاطع — المندوب يسجّل وهو مستني، مش بدل ما يستنى
   * ==========================================================================
   *
   * 🔴 **المشكلة اللي بيحلّها:** زرار التسجيل كان مقفول طول ما التفريغ
   * ماشي (`disabled={busy}`). فالمندوب اللي بيمشي في الشارع بيقف مستني
   * دقيقة كاملة قدام كل مقطع — والعربيات اللي بيعدّي عليها في الدقيقة
   * دي بتضيع خالص. الوقت ده أغلى حاجة عنده.
   *
   * دلوقتي: يدوس «تفريغ» ⇒ المقطع يقف في الطابور ⇒ **التسجيل يفتح
   * فوراً**. المقاطع بتتفرّغ واحد ورا التاني والنتايج بتتجمّع مع بعض.
   *
   * ⚠️ **واحد في المرة عن قصد.** الكارت بيشيل موديل واحد شغّال كويس؛
   * تشغيل اتنين على التوازي بيخنق الاتنين وبيخلّي المقطع الأول يبقى
   * أبطأ من لو كان لوحده. الطابور مش تنازل — هو الشكل الأسرع فعلياً.
   */
  const [clips, setClips] = useState<ClipJob[]>([]);
  const clipsRef = useRef<ClipJob[]>([]);
  /** قافل عشان ما يشتغلش عاملين على نفس الطابور */
  const workerRef = useRef(false);
  /**
   * نتايج المقاطع اللي **خلصت**. المحرّكات بتنشر فوقها بدل ما تمسحها،
   * فالمقطع الجديد مابيمحيش اللي قبله.
   */
  const entriesBaseRef = useRef<PlateEntry[]>([]);

  /**
   * آخر قائمة منشورة — العامل محتاج يقراها **بعد** ما المقطع يخلص عشان
   * يخلّيها أساس للمقطع اللي بعده، و‎entries‎ نفسها ماتكونش اتحدّثت في
   * الإغلاق بتاعه لسه.
   */
  const entriesRef = useRef<PlateEntry[]>([]);

  /**
   * سياق المقطع اللي العامل شغّال عليه دلوقتي — توقيت بدايته ومسار
   * موقعه. ‎null‎ يعني مافيش مهمة من الطابور شغالة (تفريغ مباشر).
   */
  const jobCtxRef = useRef<{
    startedAtMs: number;
    track?: GpsTrack;
    stamp: SessionStamp;
    clipId?: string;
    fixes?: TrackFix[];
    source?: "record" | "upload";
    /** أجزاء تسجيل المقطع ده (لو في الذاكرة ونفس صوته) — `activeChunks()` */
    chunks?: Blob[];
    mime?: string;
    /** اسمه في القايمة («مقطع ٣») — بيظهر في تقرير الجلسة جنب تسجيله */
    label?: string;
  } | null>(null);

  /**
   * ==========================================================================
   *  💾 المقاطع المحفوظة على الجهاز (طلب المالك ٣ أكتوبر ٢٠٢٦)
   * ==========================================================================
   * «لما المندوب يسجل كذا مقطع تظهر المقاطع دي تحت بعض وكل مقطع يبقي قدامه
   * كلمه تفريغ … ولما يبدأ تسجيل او الصفحه تعمل تحديث او خرج او اتنقل بين
   * الصفحات المقاطع دي متروحش».
   *
   * كل تسجيل بيبقى مقطع في `clipStore` (IndexedDB لوحدها) من **أول ثانية**:
   * الصوت بيتحفظ وهو بيتسجّل (كل ثانية) ومعاه مسار الموقع والختم. فتحديث
   * الصفحة وسط التسجيل بيسيب مقطع «اتقطع» صوته محفوظ ويتفرّغ.
   * والطابور (`clips` فوق) لسه هو العامل اللي بيفرّغ واحد واحد.
   */
  const clipStoreP = useRef<Promise<ClipStore> | null>(null);
  const [storedClips, setStoredClips] = useState<StoredClip[]>([]);
  const storedClipsRef = useRef<StoredClip[]>([]);
  storedClipsRef.current = storedClips;
  /**
   * 📋 الجدول بيعرض لوحات أنهي مقطع — عشان التعديل/المسح يرجع للمقطع نفسه (التسجيل الجديد
   * بيفضّي الجدول، فاللوحات اللي لسه ماتصدّرتش لازم تفضل في مقطعها بتعديلاتها)، وعشان التصدير
   * يعلّم المقطع «اتصدّر».
   */
  const tableClipIdRef = useRef<string | null>(null);
  /**
   * 🔴 مراجعة ١٨ أكتوبر: الربط **بيتحفظ مع الجلسة** — المندوب بيخرج من الصفحة ويرجع (أو الآيفون بيقفلها)
   * والجدول بيرجع من الجلسة؛ من غير الربط التعديل ماكانش بيوصل لمقطعه والمقطع يفضل «لسه ماتصدّرتش».
   */
  const setTableClip = (id: string | null) => {
    tableClipIdRef.current = id;
    try {
      if (id) localStorage.setItem(TABLE_CLIP_KEY, id);
      else localStorage.removeItem(TABLE_CLIP_KEY);
    } catch {
      /* تخزين مقفول — الربط للجلسة دي بس */
    }
  };
  /** المندوب عدّل/مسح في الجدول ⇒ يتحفظ في المقطع بعد ما الحالة تتحدّث */
  const tableDirtyRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  /** وهو بيصدّر الجدول مقفول — تعديل في النص كان هيضيع مع تفضية اللي اتحفظ */
  const exportingRef = useRef(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  /** 📋 للتقرير: المندوب عدّل/مسح كام لوحة من آخر تصدير */
  const editCountRef = useRef(0);
  const deleteCountRef = useRef(0);
  const advancedRef = useRef(advanced);
  advancedRef.current = advanced;
  const onExportToRecordsRef = useRef(onExportToRecords);
  onExportToRecordsRef.current = onExportToRecords;
  const [clipsPersistent, setClipsPersistent] = useState(true);
  const [storageWarn, setStorageWarn] = useState<string | null>(null);
  /** الحفظ وقت التسجيل فشل (المساحة/الاتصال) — بيتشال أول ما حفظ ينجح */
  const [saveWarn, setSaveWarn] = useState<string | null>(null);
  /**
   * 🔴 **كل تسجيل ليه جلسته** — مقطعه وكاتبه ومسار موقعه ومؤقّته.
   *
   * كانوا refs مشتركة (`recClipIdRef`/`writerRef`/`fixColRef`…): لو المندوب
   * بدأ تسجيل جديد وقفل الأول لسه ماخلصش، آخر `finalizeClip` بتاع الأول
   * كان بيصفّر كاتب ومقطع ومسار **التاني** ⇒ التاني مابيتحفظش تدريجي،
   * ولوحاته كلها «من غير موقع دقيق»، ويفضل مقطع يتيم «بيسجّل» (مراجعة ٣
   * أكتوبر — عيب ٥). دلوقتي القفل بيلمس جلسته هو بس.
   */
  const recSessionRef = useRef<RecSession | null>(null);
  const [recClipId, setRecClipId] = useState<string | null>(null);
  /** المقطع اللي اتقفل لسه بيتحفظ — «بدء التسجيل» مقفول لحد ما يخلص */
  const finalizingRef = useRef(false);
  const [finalizing, setFinalizing] = useState(false);
  /** أجزاء آخر تسجيل (٢٥٠ms) بمقطعها — للمحركات اللي بتقصّ ببادئة */
  const lastRecRef = useRef<{ clipId: string; chunks: Blob[] } | null>(null);
  /** آخر مقطع اتسجّل ولسه مادخلش الطابور — زرار «تفريغ واستخراج اللوحات» الكبير */
  const [pendingClipId, setPendingClipIdState] = useState<string | null>(null);
  const pendingClipIdRef = useRef<string | null>(null);
  const setPendingClipId = useCallback((id: string | null) => {
    pendingClipIdRef.current = id;
    setPendingClipIdState(id);
  }, []);
  /** حارس الدوسة المزدوجة على «تفريغ» لنفس المقطع */
  const queuingRef = useRef(new Set<string>());
  const [clipAudio, setClipAudio] = useState<{ id: string; url: string } | null>(null);
  const clipAudioUrlRef = useRef<string | null>(null);
  /**
   * 🔴 المحرّك **وصل لآخره بنجاح** — بيتعلّم من `finishRun()` بس (عيب ٢).
   * غيابه = «فشل» بالسبب، حتى لو المحرّك رجع من غير ما يقول حاجة.
   */
  const runSucceededRef = useRef(false);
  /** سبب الفشل لو المحرّك قاله صراحة */
  const lastRunErrRef = useRef<string | undefined>(undefined);
  /** «وقّف التفريغ» بيقطع طلب «كامل ⚡» نفسه، مش بس الحلقات */
  const chunksAbortRef = useRef<AbortController | null>(null);
  /**
   * ⚡ لوحات سطر اللوحات (قبل «done») — **للقراية بس**: بلا دبوس (أوقاتها
   * مبدئية) ومش في الجدول اللي بيتحفظ ويتصدّر ويتعدّل. سطر «done» بيبني
   * الجدول الحقيقي؛ ولو ماوصلش بتنزل الجدول بلا دبوس (عيب ٢ + ٣).
   */
  const [prelim, setPrelimState] = useState<PlateEntry[] | null>(null);
  const prelimRef = useRef<PlateEntry[] | null>(null);
  const setPrelim = useCallback((v: PlateEntry[] | null) => {
    prelimRef.current = v;
    setPrelimState(v);
  }, []);
  /** المهمة دي طلّعت لوحات بس ووقفت قبل الأنواع — حكمها «الأنواع ماوصلتش» */
  const platesOnlyRef = useRef(false);
  /** رسالة حفظ واحدة لكل مقطع لكل نوع خطأ (عيب ٦) */
  const saveErrOnceRef = useRef(new SaveErrorOnce());
  /** محاولة حفظ الصوت المحجوز شغّالة — مانبدأش تانية فوقها */
  const retryingRef = useRef(false);
  /**
   * ✅ المحرّك خلص **بنجاح** — الطريق الوحيد لـ«خلص» في الصفحة (حارس في
   * `batchChunksStream.test.ts`). أي رجوع من غيره = «فشل» بالسبب.
   */
  const finishRun = () => {
    runSucceededRef.current = true;
    setPhase("done");
  };
  /** معرّف التقرير اللي آخر تفريغ حفظه — بيتربط بالمقطع */
  const lastReportIdRef = useRef<string | undefined>(undefined);
  /**
   * 📋 **تقرير التسجيل للسيرفر** (١٨ أكتوبر — المالك: «أهم حاجه عايزين نعرف كل التقارير عن
   * التسجيل»): توقيتات التفريغ اللي شغّال (`responded` = السيرفر رد أصلاً — من غيره التسجيل
   * ماوصلش) ⇐ `runQueue` بيبعتها بعد ما المقطع يخلص بالموقع النهائي (`lib/runTelemetry.ts`).
   */
  const runInfoRef = useRef<RunInfo | null>(null);
  /** في الخلفية — مافيش await: النت الضعيف أو السيرفر الواقع مايأخّروش الطابور ولا المندوب */
  const queueRunReport = (i: Omit<RunReportInput, "agent" | "uid">) => {
    const srv = serverRef.current;
    const agent = agentNameRef.current;
    void currentSession()
      .then((s) => sendRunReport(srv.base, srv.token, buildRunReport({ ...i, agent, uid: s.userId })))
      .catch(() => {
        /* التقرير عمره ما يوقّف التفريغ */
      });
  };

  const getClipStore = useCallback((): Promise<ClipStore> => {
    if (!clipStoreP.current) {
      // 🔴 الفتح بمهلة قصيرة — تخزين معلّق (آيفون) مابيوقّفش الصفحة (عيب ١)
      clipStoreP.current = openClipStore().then((o) => {
        setClipsPersistent(o.persistent);
        if (!o.persistent) {
          errorLog.add(
            "التفريغ",
            `المقاطع مش هتتحفظ على الجهاز (${o.error ?? "التخزين مقفول"}) — هتفضل لحد ما الصفحة تتقفل بس.`
          );
        } else if (o.error) {
          errorLog.add("التفريغ", `${SAVE_LOG_TAG} ${o.error}`);
        }
        return o.store;
      });
    }
    return clipStoreP.current;
  }, [errorLog]);

  /**
   * القائمة من المخزن (مابترميش — اللي في الذاكرة بيفضل ظاهر)، و💾 (عيب ٧)
   * لو فيه صوت محجوز في الذاكرة أو بيانات ماتحفظتش بنحاول نحفظها **من غير ما
   * نستنى** — مع أي حركة (تسجيل/تفريغ/مسح بيفضّي مساحة) وكل شوية.
   */
  const refreshClips = useCallback(async () => {
    try {
      const store = await getClipStore();
      setStoredClips(await store.list());
      if (store.hasPending() && !retryingRef.current) {
        retryingRef.current = true;
        void store
          .retryPending()
          .then(async (n) => {
            if (n > 0) setStoredClips(await store.list());
          })
          .catch(() => {})
          .finally(() => {
            retryingRef.current = false;
          });
      }
    } catch (err) {
      errorLog.add("التفريغ", `ماقدرناش نقرا المقاطع المحفوظة: ${(err as Error)?.message ?? err}`);
    }
  }, [errorLog, getClipStore]);

  /** 💾 كل شوية: الصوت المحجوز في الذاكرة يتحفظ لو المساحة فضيت (عيب ٧) */
  useEffect(() => {
    const timer = window.setInterval(() => {
      void clipStoreP.current?.then((s) => {
        if (s.hasPending()) void refreshClips();
      });
    }, RETRY_SAVE_MS);
    return () => clearInterval(timer);
  }, [refreshClips]);

  /** خطأ حفظ ⇒ سجل الأخطاء **مرة واحدة لكل مقطع لكل نوع** (عيب ٦) */
  const logSaveError = useCallback(
    (clipId: string | null | undefined, what: string, err: unknown) => {
      if (!saveErrOnceRef.current.first(clipId, err)) return;
      errorLog.add("التفريغ", `${SAVE_LOG_TAG} ${what}: ${(err as Error)?.message ?? err}`);
    },
    [errorLog]
  );
  /** أخطاء `closeRecordedClip` — نفس القاعدة (نوع الخطأ جاي معاها) */
  const logCloseErrors = useCallback(
    (clipId: string | null | undefined, errors: SaveError[]) => {
      for (const e of errors) {
        logSaveError(clipId, `حفظ المقطع على الجهاز (${e.where})`, Object.assign(new Error(e.message), { name: e.kind }));
      }
    },
    [logSaveError]
  );

  /** المساحة قرّبت تخلص؟ (٨٠٪) — تحذير بس، مابنمسحش حاجة لوحدنا */
  const checkStorage = useCallback(async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est && storageNearlyFull(est.usage, est.quota)) {
        setStorageWarn(
          `مساحة التخزين قرّبت تخلص (${formatBytes(est.usage ?? 0)} من ${formatBytes(est.quota ?? 0)}) — ` +
            "امسح مقاطع خلص تفريغها عشان التسجيل الجاي يتحفظ."
        );
      } else {
        setStorageWarn(null);
      }
    } catch {
      // المتصفح مابيدعمش القياس — مش مشكلة
    }
  }, []);

  const markClip = useCallback(
    async (id: string | undefined, patch: Partial<StoredClip>) => {
      if (!id) return;
      try {
        const store = await getClipStore();
        await store.update(id, patch);
      } catch (err) {
        errorLog.add("التفريغ", `ماقدرناش نحدّث «${id}»: ${(err as Error)?.message ?? err}`);
      }
      await refreshClips();
    },
    [errorLog, getClipStore, refreshClips]
  );

  // أول فتح للصفحة: المقاطع المحفوظة ترجع، واللي كان «بيسجّل» يبقى «اتقطع».
  // ⚠️ مرة واحدة بس — لو اتعادت وسط تسجيل كانت هتعلّم المقطع الشغّال «اتقطع».
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (recoveredRef.current) return;
    recoveredRef.current = true;
    let alive = true;
    void (async () => {
      try {
        const store = await getClipStore();
        const list = await store.recover();
        if (alive) setStoredClips(list);
        else void refreshClips();
      } catch (err) {
        errorLog.add("التفريغ", `ماقدرناش نرجّع المقاطع: ${(err as Error)?.message ?? err}`);
      }
      try {
        // المتصفح مايمسحش المقاطع لوحده وقت الزحمة
        await navigator.storage?.persist?.();
      } catch {
        // مش مدعوم — مش مشكلة
      }
      void checkStorage();
    })();
    return () => {
      alive = false;
    };
  }, [errorLog, getClipStore, checkStorage, refreshClips]);

  /**
   * المسح خلص وDeepgram كان معانا؟
   *
   * ⚠️ لازم يبقى **ظاهر على الشاشة** مش سطر في الخلاصة. المندوب مشى مسح
   * كامل والشاهد مقفول وما لاحظش — والنتيجة كانت ٣ لوحات غلط ثابتة.
   * وأشهر سبب: لينك النفق بيتغيّر كل مرة، فالمتصفح بيعتبره **موقع جديد**
   * ويمسح المفاتيح والشيت المحفوظين.
   */
  const [witnessUsed, setWitnessUsed] = useState<boolean | null>(null);
  /**
   * وقت التفريغ — عشان أي تعديل على السرعة يبقى **مقيس** مش محزور.
   * المندوب مايقدرش يقارن تسجيل بتسجيل من غير رقم قدامه.
   */
  const [scanTiming, setScanTiming] = useState<{
    ms: number;
    segments: number;
    audioSec: number;
  } | null>(null);
  /**
   * الصوت جه منين — تسجيل من الصفحة ولا ملف مرفوع.
   *
   * الفرق مش شكلي: الملف المرفوع **مالوش مسار موقع**، فمينفعش نحطّ عليه
   * دبوس. لو حطينا الموقع الحالي هيبقى كذب — المندوب هيفتكر إن السيارة
   * كانت هناك وهو ممكن يكون سجّل الصوت في حي تاني إمبارح.
   */
  const [source, setSource] = useState<"record" | "upload">("record");

  /** الملف كامل (WebM/Opus خام) — للتفريغ والاستماع */
  const audioBlobRef = useRef<Blob | null>(null);
  /** أجزاء الصوت بالترتيب — الجزء ٠ فيه ترويسة WebM، منها بنبعت بادئة للموديل */
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");
  /**
   * مسار الموقع وقت التسجيل + لحظة بدء التسجيل.
   * الاتنين مع بعض بيخلّونا نحوّل «ثانية اللوحة في الصوت» لـ«مكان المندوب
   * وقت نطقها» — وده المطلوب بالظبط.
   */
  const gpsTrackRef = useRef(new GpsTrack());
  /**
   * تصحيحات المندوب = **تسمية من إنسان** على المقاطع اللي الموديل غلط فيها.
   * دي أثمن داتا تدريب: الحصاد المسمّى بالموديل ورّث أخطاءه ووقّع v13/v14،
   * وديبجرام كشاهد بيأكّد السهل بس. التصحيح هو اللي بيدّي الصعب.
   */
  const correctionsRef = useRef(new CorrectionLog());
  /**
   * معرّف التسجيل الحالي — بيتبعت مع كل تصحيح.
   * من غيره التصحيحات بتبقى أرقام زمن عايمة مانعرفش أي تسجيل نقصّ منه.
   */
  const sessionIdRef = useRef<string>("");

  /**
   * سياق الجلسة: الشارع · الملاحظة · النوع.
   * المندوب بيدخلهم **مرة واحدة** وبيفضلوا ساريين على كل اللوحات اللي بعدهم —
   * ده سلوكه الحقيقي المقيس من شيتاته (نفس النص متكرر على عشرات الصفوف).
   *
   * 🔴 الختم بيتحدّد **بلحظة نطق اللوحة**، مش بلحظة تفريغها. التفريغ بيمشي
   * بعد التسجيل، فلو ختمنا وقته اللوحة اللي اتقالت في شارع ١ ممكن تتكتب على
   * شارع ٢ لأن المندوب غيّر المربع في الوقت ده.
   */
  const stampRef = useRef(new SessionStamp());
  /**
   * الوقت المنقضي من بداية التسجيل. لو مافيش تسجيل شغّال بيرجّع ٠ — يعني
   * اللي المندوب يكتبه قبل ما يبدأ بيسري من أول التسجيل، وده المطلوب.
   */
  const recStartRef = useRef(0);
  const elapsedMsRef = useRef(() => (recStartRef.current ? Date.now() - recStartRef.current : 0));
  const [street, setStreet] = useState("");
  const [note, setNote] = useState("");
  const [vType, setVType] = useState("");
  const recordingStartedAtRef = useRef(0);
  /**
   * آخر لحظة نطق عرفناها من مدى مُثبَت.
   * اللوحات اللي مالهاش مدى بتاخد التقدير ده بدل وقت المعالجة —
   * فتفضل في مكانها الصح على الخط الزمني.
   */
  const lastKnownSpokenAtRef = useRef(0);
  /** بيتحوّل true عند الخروج من الصفحة عشان المسح الطويل يقف */
  const cancelScanRef = useRef(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  /** نفس الرابط في ref عشان التنظيف عند الخروج يشوف آخر قيمة مش الأولى */
  const playbackUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const setPlayback = useCallback((url: string | null) => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = url;
    setPlaybackUrl(url);
  }, []);

  /* ---------------------------------------------------------- التسجيل */

  const stopTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * 💾 يبدأ مقطع محفوظ للتسجيل اللي لسه بادئ:
   *  · مسار موقع **للمقطع ده بس** — كل قراءة بوقتها ووقت وصولها
   *    (`FixCollector`)، فالمقطع اللي بعده مايمسحهوش.
   *  · الصوت بيتكتب في IndexedDB كل ثانية (`ProgressiveClipWriter`) ومعاه
   *    المدة والمسار والختم لحد اللحظة دي.
   * أي فشل في التخزين مابيوقفش التسجيل — `finalizeClip` بيحفظه كامل في الآخر،
   * ولو المساحة لسه مليانة بيفضل كامل في الذاكرة (`closeRecordedClip`).
   * كل حاجة على **جلسة التسجيل ده** (`s`) — مش refs مشتركة.
   */
  const beginClip = useCallback(
    async (s: RecSession) => {
      const now = currentFix();
      // القراءة الجاهزة بوقتها الحقيقي — لو قديمة مش هتلزق في أي لوحة (platePin).
      // ووقت وصولها **مش معروف** (وصلت قبل البداية) ⇒ null، مش وقت القراءة
      // نفسها — وإلا تأخيرها الوهمي (صفر) بيشدّ حساب فرق الساعة (عيب ٦).
      if (now) s.col.add(now, null);
      s.unsub = subscribeGps(() => s.col.add(currentFix(), Date.now()));
      try {
        const store = await getClipStore();
        // `create` مابيرميش: المساحة مليانة ⇒ مقطع في الذاكرة (memOnly)
        const clip = await store.create({
          startEpoch: s.startEpoch,
          mime: s.rec.mime || "audio/webm",
          source: "record",
          stamp: s.stamp.toJSON(),
        });
        s.clipId = clip.id;
        if (recSessionRef.current === s) setRecClipId(clip.id);
        if (clip.memOnly) {
          setSaveWarn("مساحة الموبايل مليانة — التسجيل شغّال وصوته في الذاكرة بس لحد ما تفرّغه؛ ماتقفلش الصفحة.");
        }
        s.writer = new ProgressiveClipWriter(
          store,
          clip.id,
          () => s.rec.audioChunks,
          () => ({
            durationSec: s.rec.durationSec,
            rawFixes: s.col.list(),
            stamp: s.stamp.toJSON(),
          })
        );
        if (!s.closing) {
          s.timer = window.setInterval(() => {
            const w = s.writer;
            if (!w) return;
            void w.flush().then(
              () => setSaveWarn(null),
              (err) => {
                // 🔴 بنحذّر **وهو بيسجّل** — مش بعد ما يقفل ويلاقي المساحة خلصت
                setSaveWarn(
                  "مساحة الموبايل مليانة أو الحفظ واقف — التسجيل شغّال وصوته في الذاكرة، فرّغه قبل ما تقفل الصفحة."
                );
                // 🔴 (عيب ٦) مرة لكل مقطع لكل نوع — مش رسالة كل ثانية تزقّ السجل كله
                logSaveError(s.clipId, "الحفظ وقت التسجيل وقف", err);
              }
            );
            // المساحة بتتقاس وهو بيسجّل كمان (كل ١٥ث)
            if (Date.now() - s.storageCheckedAt >= 15_000) {
              s.storageCheckedAt = Date.now();
              void checkStorage();
            }
          }, 1000);
        }
        void refreshClips();
      } catch (err) {
        errorLog.add(
          "التفريغ",
          `المقطع مش بيتحفظ وهو بيتسجّل (هيتحفظ كامل لما توقف): ${(err as Error)?.message ?? err}`
        );
      }
    },
    [errorLog, getClipStore, refreshClips, checkStorage, logSaveError]
  );

  /**
   * 💾 يقفل المقطع المحفوظ بعد ما التسجيل يقف: آخر أجزاء الصوت + المدة +
   * مسار الموقع ⇒ «جاهز للتفريغ». ولو الحفظ التدريجي ماكانش شغّال بيحفظ
   * الصوت كامل دلوقتي — المهم إن مافيش تسجيل يضيع.
   * بيرجّع معرّف المقطع (أو `null`).
   *
   * 🔴 (عيب ١) لو النسخة المحفوظة ناقصة والمساحة مليانة، التسجيل الكامل
   * اللي في الذاكرة (`blob`) بيتحجز للمقطع — التفريغ والاستماع بياخدوه هو،
   * والمقطع «جاهز» بزراير شغّالة وتحذير. (عيب ٥) بيلمس جلسته `s` بس.
   */
  const finalizeClip = useCallback(
    async (s: RecSession, seconds: number, blob: Blob | null): Promise<string | null> => {
      s.closing = true;
      if (s.timer !== null) {
        clearInterval(s.timer);
        s.timer = null;
      }
      s.unsub?.();
      s.unsub = null;
      try {
        await s.begin;
      } catch {
        // الفشل اتسجّل جوّه
      }
      const chunks = s.rec.audioChunks.slice();
      // 🔴 (عيب ٥) الأطول: آخر جزء ممكن يوصل بعد مهلة stop() فيبقى في الأجزاء بس
      const chunksSize = chunks.reduce((n, c) => n + c.size, 0);
      const full: Blob | null =
        chunksSize > (blob?.size ?? 0) ? new Blob(chunks, { type: blob?.type || s.rec.mime || "audio/webm" }) : blob;
      let id: string | null = s.clipId;
      try {
        const store = await getClipStore();
        const closing = closeRecordedClip(store, {
          clipId: s.clipId,
          writer: s.writer,
          blob,
          chunks,
          durationSec: seconds,
          rawFixes: s.col.list(),
          stamp: s.stamp.toJSON(),
          startEpoch: s.startEpoch,
          mime: blob?.type || s.rec.mime || "audio/webm",
        });
        const report = (out: Awaited<typeof closing>) => {
          logCloseErrors(out.id, out.errors);
          if (out.memOnly) {
            errorLog.add("التفريغ", `${MEM_ONLY_WARNING} (الصوت الكامل محجوز للتفريغ).`);
          }
        };
        /**
         * 🔴 (عيب ١) القفل له حد أقصى — «بدء التسجيل» مايفضلش «بيحفظ
         * المقطع…» للأبد لو التخزين علّق (آيفون). بعده الصوت الكامل بيتحجز
         * للمقطع في الذاكرة (يتفرّغ ويتسمع)، والحفظ بيكمّل ورا لوحده.
         */
        try {
          const out = await withDeadline(closing, FINALIZE_MAX_MS, "حفظ المقطع");
          id = out.id;
          report(out);
        } catch (err) {
          if (id && full && full.size > 0) store.holdAudio(id, full, chunks);
          void closing.then(
            (out) => {
              report(out);
              void refreshClips();
            },
            () => {}
          );
          throw err;
        }
      } catch (err) {
        errorLog.add("التفريغ", `المقطع ماتحفظش على الجهاز لسه (الصوت في الذاكرة): ${(err as Error)?.message ?? err}`);
        // الصوت الكامل مايضيعش حتى هنا — بيتحجز للمقطع
        if (id && full && full.size > 0) (await getClipStore()).holdAudio(id, full, chunks);
      }
      if (id && full && full.size > 0) lastRecRef.current = { clipId: id, chunks };
      s.writer = null;
      if (recSessionRef.current === s) {
        recSessionRef.current = null;
        setRecClipId(null);
      }
      setSaveWarn(null);
      // القائمة بتتحدّث — بس «بدء التسجيل» مايستناهاش أكتر من ثانية ونص
      await withDeadline(refreshClips(), 1500, "تحديث القائمة").catch(() => {});
      void checkStorage();
      return id;
    },
    [errorLog, getClipStore, refreshClips, checkStorage, logCloseErrors]
  );
  const finalizeClipRef = useRef(finalizeClip);
  finalizeClipRef.current = finalizeClip;
  const stoppingRef = useRef<BatchRecorder | null>(null);
  const startingRef = useRef(false);

  const startRecording = async () => {
    /**
     * 🔴 (عيب ٥) مافيش تسجيل جديد والقديم لسه بيتقفل/بيتحفظ — ولا دوستين
     * ورا بعض وإذن الميك لسه بيتسأل. الزرار نفسه مقفول وقتها، والحارس هنا
     * لأي طريق تاني.
     */
    if (finalizingRef.current || recorderRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      await startRecordingInner();
    } finally {
      startingRef.current = false;
    }
  };

  const startRecordingInner = async () => {
    unlockAudio();
    setTranscript("");
    setEntries([]);
    // الجلسة لسه شايلة الجدول ده (saveSession مابتحفظش الفاضي) ⇒ مفتاح الربط يفضل، والرجوع للصفحة يربطه تاني
    tableClipIdRef.current = null;
    setExportMsg(null);
    setEditing(null);
    audioBlobRef.current = null;
    chunksRef.current = [];
    // تسجيل جديد = معرّف جديد. التصحيحات بتحمله عشان نعرف بعدين **أي تسجيل**
    // نقصّ منه صوت كل تصحيح.
    sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    /**
     * 🔴 **الختم الجديد بياخد اللي مكتوب في المربعات دلوقتي.**
     *
     * قبل كده: `new SessionStamp()` فاضي، والمربعات بتفضل **مليانة على
     * الشاشة**. فالمندوب اللي بيكتب اسم الشارع وبعدين يدوس «سجّل» كان
     * بيشوف الشارع قصاده والختم فاضي — والحي بيطلع فاضي على كل لوحة
     * وهو شايف الاسم مكتوب. أسوأ نوع بق: الشاشة بتقول حاجة والداتا
     * بتقول غيرها.
     *
     * `tMs = 0` يعني «ساري من أول التسجيل».
     */
    stampRef.current = new SessionStamp({ startedAt: Date.now() });
    if (street.trim()) stampRef.current.setStreet(street, 0);
    if (note.trim()) stampRef.current.setNote(note, 0);
    if (vType.trim()) stampRef.current.setType(vType, 0);
    recStartRef.current = Date.now();
    setSource("record");
    setPlayback(null);

    if (!BatchRecorder.isSupported()) {
      errorLog.add(
        "الميكروفون",
        "المتصفح ده ما بيدعمش تسجيل الصوت (لا WebM ولا MP4) — حدّث التطبيق أو افتح الصفحة في Chrome."
      );
      return;
    }

    const rec = new BatchRecorder({
      maxSeconds: MAX_BATCH_SECONDS,
      onLevel: (l, w) => {
        setLevel(l);
        setWaveform(w);
      },
      onTick: (secs) => setSeconds(secs),
      onMaxDuration: () => {
        errorLog.add(
          "الميكروفون",
          `وصلنا الحد الأقصى للتسجيل (${Math.round(MAX_BATCH_SECONDS / 60)} دقايق) — التسجيل اتوقف تلقائياً`
        );
        void stopRecording();
      },
    });

    try {
      await rec.start();
    } catch (err) {
      errorLog.add("الميكروفون", micErrorMessage(err), {
        detail: String((err as Error)?.stack ?? err),
      });
      return;
    }

    recorderRef.current = rec;
    recReleaseRef.current = busyRef.current.hold();
    mimeRef.current = rec.mime || "audio/webm";
    // الشاشة لو قفلت وسط تسجيل ٥ دقايق، أندرويد بيوقف الصفحة والتسجيل يضيع
    void keepScreenAwake();
    // من هنا نبدأ نسجّل مسار الموقع مع الصوت
    recordingStartedAtRef.current = Date.now();
    gpsTrackRef.current.start();
    // 💾 المقطع بيتحفظ من أول ثانية — صوته ومسار موقعه — مش لما يخلص
    const s: RecSession = {
      rec,
      startEpoch: recordingStartedAtRef.current,
      stamp: stampRef.current,
      col: new FixCollector(),
      unsub: null,
      timer: null,
      clipId: null,
      writer: null,
      begin: null,
      closing: false,
      storageCheckedAt: Date.now(),
    };
    recSessionRef.current = s;
    s.begin = beginClip(s);
    setPendingClipId(null);
    setPhase("recording");
    setSeconds(0);
  };


  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    // دوستين ورا بعض (الحد الأقصى + إيد المندوب) ماتقفلش المقطع مرتين
    if (stoppingRef.current === rec) return;
    stoppingRef.current = rec;
    const s = recSessionRef.current?.rec === rec ? recSessionRef.current : null;
    // 🔴 (عيب ٥) «بدء التسجيل» مقفول من دلوقتي لحد ما المقطع يتقفل ويتحفظ
    finalizingRef.current = true;
    setFinalizing(true);

    let clipId: string | null = null;
    let blob: Blob;
    try {
      stopTimer();
      releaseScreenAwake();
      const seconds = rec.durationSec;

      // ‎stop()‎ بتستنى آخر جزء يوصل — بلا الانتظار ده آخر لوحة بتضيع
      blob = await rec.stop();
      chunksRef.current = rec.audioChunks.slice();
      audioBlobRef.current = blob;
      mimeRef.current = rec.mime || "audio/webm";

      recorderRef.current = null;
      gpsTrackRef.current.stop();

      setWaveform(null);
      setLevel(0);
      setSeconds(seconds);

      // 💾 المقطع بيتقفل «جاهز للتفريغ» في القائمة — مابيضيعش مع التسجيل الجاي
      if (s) clipId = await finalizeClipRef.current(s, seconds, blob);
    } finally {
      finalizingRef.current = false;
      setFinalizing(false);
      recReleaseRef.current?.();
      recReleaseRef.current = null;
    }

    if (blob.size === 0) {
      setPhase("idle");
      errorLog.add(
        "الميكروفون",
        "التسجيل طلع فاضي — الميك مش شغّال أو الإذن مرفوض"
      );
      return;
    }

    setPendingClipId(clipId);
    setPlayback(URL.createObjectURL(blob));
    setPhase("recorded");
  }, [errorLog, setPhase, setPendingClipId, setPlayback]);

  // 🧮 مفتاح «التسجيل القديم» يتقفل طول ما الميك هنا مفتوح أو المقطع بيتقفل
  useEffect(() => {
    onBusyChangeRef.current?.(phase === "recording" || finalizing);
  }, [phase, finalizing]);

  // حفظ تلقائي — ده اللي بيمنع ضياع اللوحات لما تخرج من الصفحة
  useEffect(() => {
    saveSession("batch", entries);
  }, [entries]);


  // تنظيف عند الخروج من الصفحة
  useEffect(() => {
    // (StrictMode بيعمل قفل/فتح وهمي وقت التطوير — الـref بيفضل، فالفتح بيرجّعها)
    unmountedRef.current = false;
    const track = gpsTrackRef.current;
    return () => {
      unmountedRef.current = true;
      busyRef.current.reset();
      stopTimer();
      releaseScreenAwake();
      // المسح بياخد عشرات الثواني — لازم يقف لما المندوب يخرج من الصفحة،
      // وإلا فضل يبعت طلبات لسيرفر الموديل بلا فايدة
      cancelScanRef.current = true;
      chunksAbortRef.current?.abort();
      const rec = recorderRef.current;
      const s = recSessionRef.current;
      recorderRef.current = null;
      if (rec) {
        // 💾 المقطع اللي كان بيتسجّل بيتقفل محفوظ — مش بيضيع مع الخروج
        const secs = rec.durationSec;
        void rec
          .stop()
          .then((blob) => (s && s.rec === rec ? finalizeClipRef.current(s, secs, blob) : null))
          .catch(() => {});
      }
      track.stop();
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      if (clipAudioUrlRef.current) URL.revokeObjectURL(clipAudioUrlRef.current);
    };
  }, []);

  /**
   * 💾 الصفحة رايحة الخلفية أو بتتقفل (تحديث · واتساب · أندرويد قافل التبويب)
   * ⇒ نحفظ اللي اتسجّل لحد اللحظة دي فوراً، مانستناش دورة الثانية الجاية.
   */
  useEffect(() => {
    const flushNow = () => {
      void recSessionRef.current?.writer?.flush().catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flushNow);
    };
  }, []);

  /* -------------------------------------------------------- التفريغ */

  const buildEntry = useCallback(
    (review: ReviewedPlate, silent = false): PlateEntry => {
      const match = matchInCheckSheet(sheetRef.current, review.plate);
      if (!silent && match.kind !== "none") playMatchAlert(match.kind);

      // دبوس **لحظة نطق اللوحة** مش لحظة التفريغ.
      // توقيت اللوحة في الصوت + لحظة بدء التسجيل = التوقيت المطلق،
      // وبنجيب أقرب قراءة موقع للتوقيت ده من المسار المسجّل.
      /**
       * لحظة نطق اللوحة بالتوقيت المطلق.
       *
       * ⚠️ لو مالهاش مدى مُثبَت، **ممنوع** نستخدم ‎Date.now()‎: ده وقت
       * **المعالجة** مش وقت النطق، والفرق بينهم ممكن يكون دقايق. وده كان
       * بيبوّظ حاجتين:
       *   - تنظيف المكرّرات: القاعدة بتعتمد على قرب الوقت، فلوحة بلا مدى
       *     عمرها ما كانت تتقارن بجارتها ⇒ المكرّرة تفضل ظاهرة.
       *   - ولوحتين بلا مدى اتقالوا بفارق دقايق كانوا بياخدوا نفس الوقت
       *     تقريباً (نفس الحلقة) ⇒ يتدمجوا غلط ونضيّع سيارة حقيقية.
       *
       * فبنقدّرها من آخر لوحة عرفنا مداها — الترتيب الزمني بيفضل سليم.
       */
      /**
       * 🔴 **وقتين بوحدتين مختلفتين، وكانوا بيتبادلوا.**
       * `pinAt()` بتاخد epoch، و`SessionStamp.at()` بتاخد **نسبي** من
       * بداية التسجيل. الصفحة كانت بتبعت المطلق للاتنين ⇒ الختم بيرجّع
       * آخر إدخال دايماً في «المقاطع»، و**فاضي خالص** في «كامل ⚡».
       * `spokenTimes()` بترجّع الاتنين بأسماء واضحة + `known`.
       */
      const when = spokenTimes({
        timeStartS: review.timeStart,
        baseMs: jobCtxRef.current?.startedAtMs ?? recordingStartedAtRef.current,
        lastKnownAbsMs: lastKnownSpokenAtRef.current,
      });
      const spokenAtMs = when.absMs;

      if (review.timeStart !== undefined) lastKnownSpokenAtRef.current = spokenAtMs;

      /**
       * ⚠️ الملف المرفوع **مايتحطّش عليه دبوس**.
       *
       * مافيش مسار موقع اتسجّل معاه، والموقع الحالي مش موقع النطق —
       * المندوب ممكن يكون سجّل الصوت في حي تاني إمبارح. دبوس غلط أسوأ
       * من مافيش دبوس، لأنه بيتصدّر في Excel كأنه حقيقة.
       */
      /**
       * 🔴 **مافيش رجوع للموقع الحالي.**
       * كان `pinAt(spokenAtMs) ?? stampPin()` — يعني لو المسار مالوش قراءة
       * للحظة النطق، اللوحة بتتختم بمكان المندوب **وقت التفريغ**. والتفريغ
       * بيحصل بعد التسجيل بدقايق وهو ماشي، فده حرفياً بيحط العربية في مكان
       * تاني. دلوقتي: مافيش قراءة موثوقة ⇒ بلا دبوس.
       */
      /**
       * 🔴 `|| Date.now()` اتشال — كان بيخالف التعليق اللي فوقه بالحرف.
       * لوحة بلا وقت موثوق كانت بتتدبّس بمكان المندوب **لحظة دوسة
       * التفريغ**، وهو ساعتها بيكون مشي. `known === false` ⇒ بلا دبوس.
       */
      /**
       * 📍 مقطع محفوظ معاه مساره (`fixes`) ⇒ الدبوس **مابيتحطّش هنا**:
       * بيتحط بعد ما المقطع كله يتقري (`stampEntriesWithTrack` في `runQueue`)
       * بقواعد «مميّز ودقيق» — ≤١٠٠م، ≤ثانيتين من لحظة النطق، ومافيش لوحتين
       * ورا بعض على نفس قراءة GPS. القاعدة الأخيرة محتاجة كل اللوحات مع بعض.
       * و`source` من سياق المهمة: الحيّة هنا قديمة (`[bank.sheet]` بس).
       */
      const ctx = jobCtxRef.current;
      const src = ctx?.source ?? source;
      const pin =
        ctx?.fixes || src === "upload" || !when.known
          ? null
          : (ctx?.track ?? gpsTrackRef.current).pinAt(when.absMs);

      // سياق الجلسة الساري **لحظة نطق اللوحة دي بالذات** — بالوقت النسبي.
      // ومن **ختم المقطع** لو إحنا في الطابور، مش الختم الحيّ.
      const stamp = (ctx?.stamp ?? stampRef.current).at(when.relMs);
      return makePlateEntry({
        review,
        pin,
        match,
        source: "batch",
        capturedAt: spokenAtMs || Date.now(),
        vehicleType: stamp.type ?? undefined,
        note: stamp.note ?? undefined,
        neighborhood: stamp.street ?? undefined,
      });
    },
    // 🧮 الملف من `sheetRef` (آخر نسخة) — مش من الـclosure
    []
  );

  /**
   * ══════════════════════════════════════════════════════════════════
   *  محرك **المقاطع** — تسجيل كامل ⇒ نداء واحد للسيرفر
   * ══════════════════════════════════════════════════════════════════
   *
   *  الفرق عن باقي المحركات: **مافيش تقطيع في الصفحة**. الصوت بيتبعت
   *  مرة واحدة والسيرفر بيقطّع ٢٨ث/خطوة ٩ث، يقصّ في السكوت، يلزق
   *  السلاسل ويصوّت على الإملاء.
   *
   *  ── ليه؟ (مقيس ١٠ سبتمبر · ١٣ تسجيل GOLD مستثنى · ٢٠٣٢ لوحة) ─────
   *   · ويسبر بياخد **٣٠ ثانية في كل نداء مهما كان الداخل**، فنافذة ٥ث
   *     بترمي ٦ من ٧ من طاقة النداء. عشر دقايق = ٤٠٠ نداء بدل ٤٣.
   *   · والقص في السكوت بيمنع «قطع اللوحة نصّها» — اللي بيخلّي الموديل
   *     يلفّق باقي الرقم بثقة.
   *        حدّ ثابت بلا إجماع  ٩٣.٥٪ · ١٠٨ غلط · ١٩٤ اختراع
   *        الوصفة            **٩٨.٩٪** · **١٣ غلط** · ١٠٧
   *   · والنوع/الملاحظة من **كوهير** (شاهد مستقل، دقة مقيسة ٩٩.٤٪ على
   *     ٣٤٣ تسمية بشرية) — مش من موديل اللوحات.
   *
   *  📍 الدبوس: السيرفر بقى بيرجّع لحظة نطق كل لوحة (`t_s`)، والمقطع المحفوظ
   *  بيحطّ الدبوس منها بقواعد `platePin` (بعد ما المقطع يخلص في `runQueue`)
   *  — من أوقات سطر «done» **النهائية بس**، مش من سطر اللوحات المتدفّق
   *  (مبدئي). لوحة `t_s` بتاعها `null` ⇒ بلا دبوس — دبوس غلط أسوأ من مافيش.
   */
  const runChunksTranscription = async () => {
    const blob = audioBlobRef.current;
    // 💾 المقطع المحفوظ بيعرف النتيجة: «خلص» بس من `finishRun()` في الآخر
    lastRunErrRef.current = undefined;
    lastReportIdRef.current = undefined;
    if (!blob || blob.size === 0) {
      errorLog.add("التفريغ", "مافيش تسجيل — سجّل الأول");
      lastRunErrRef.current = "مافيش صوت";
      return;
    }
    if (unmountedRef.current) {
      lastRunErrRef.current = "الصفحة اتقفلت قبل التفريغ — فرّغه تاني";
      return;
    }
    cancelScanRef.current = false;
    const startedAt = performance.now();
    runInfoRef.current = { responded: false };
    setScanTiming(null);
    setConfirmClear(false);
    setPhase("transcribing");
    setEntries(entriesBaseRef.current);
    setTranscript("");
    /**
     * 🧮 قناص: الكارت بيظهر **بعد** التفريغ بس لو كوهير ماشتغلش (كان `false` من أول
     * التفريغ ⇒ «بلا شاهد Deepgram» ظاهر في كل تفريغ وهو مش بتاعه).
     */
    setWitnessUsed(null);
    setReviewProgress({ done: 0, total: 0 });
    setVadStage("بيفرّغ التسجيل كامل…");
    setPrelim(null);

    type ChunkRow = {
      plate: string;
      support?: number;
      type?: string | null;
      condition?: string | null;
      place?: string | null;
      place_effective?: string | null;
      /** لحظة نطق اللوحة (ث) — الدبوس والختم بيتحسبوا منها؛ `null` = مالهاش */
      t_s?: number | null;
    };

    /**
     * 🔴 اللوحات بتمرّ على **نفس** مراجعة اللوحات بتاعة باقي المحركات
     * (`extractPlates` ⇒ حصر الـ١٧ حرف + الثقة + الأعلام). السيرفر
     * بيفلترها شكلياً، بس المراجعة فيها قواعد تانية مالهاش بديل هنا.
     *
     * والربط بالحقول **بنص اللوحة** مش بالترتيب: المراجعة ممكن تدمج أو
     * تصحّح فالترتيب مش مضمون، ونص اللوحة هو المفتاح المشترك الوحيد.
     * ولو اللوحة اتكرّرت، أول صف بياخد أول حقول — والتكرار نادر جوّه
     * تسجيل واحد.
     */
    const buildChunkEntries = (rows: ChunkRow[]): PlateEntry[] => {
      const reviewed = extractPlates(rows.map((r) => r.plate).join(" "));
      const fields = mapChunkFields(rows, reviewed);
      return reviewed.map((review, i) => {
        /**
         * 🔴 وقت اللوحة جاي من **نفس** الربط اللي جاب حقولها (`mapChunkFields`)
         * — بنص اللوحة مش بالترتيب. من غيره كانت كل لوحة بتوصل بلا وقت،
         * فالدبوس بياخد لحظة التفريغ والحي بيطلع فاضي.
         */
        const t = fields[i]?.timeStart;
        const e = buildEntry(t === undefined ? review : { ...review, timeStart: t }, true);
        return {
          ...e,
          vehicleType: fields[i]?.vehicleType || e.vehicleType,
          note: fields[i]?.note || e.note,
        };
      });
    };

    /**
     * ⚡ **اللوحات فوراً** (سطر `{"phase":"plates"}`) — قبل ما كوهير يخلص
     * النوع والملاحظة.
     *
     * 🔴 (مراجعة ٣ أكتوبر جولة ٢ — عيب ٢ + ٣) أوقات السطر ده **مبدئية**
     * (`t_s_final:false`، أسوأ فرق ١٠ث ≈ ٨٧م بسرعة ٣٠ كم/س) ⇒ **مافيش دبوس**
     * منها، واللوحات بتتعرض «📍 بيتحدّد…» **للقراية بس** (`prelim`) — مش في
     * الجدول اللي بيتحفظ ويتصدّر ويتعدّل. كانت بتنزل الجدول بدبابيس مبدئية
     * تتحفظ وتتصدّر، وأي تعديل عليها بيتمسح بالسكوت لما «done» يبني الجدول.
     * الدبوس والحقول بييجوا من «done» بس (`runQueue` ⇐ `clipRunOutcome`).
     */
    let early: PlateEntry[] = [];
    /**
     * 🚦 السيرفر عليه ضغط من المناديب ⇒ الوسيط بيحط التسجيل في طابور (١٨ أكتوبر). المندوب يشوف
     * «في الطابور» بدل «بيفرّغ» الساكتة، ولما دوره ييجي الرسالة بترجع لوحدها.
     */
    const onQueue = (pos: number | null) => {
      // 📋 للتقرير — حتى لو المندوب داس «وقّف» وهو مستني
      const qi = runInfoRef.current;
      if (qi) {
        if (pos !== null) {
          runInfoRef.current = {
            ...qi,
            queuedAt: qi.queuedAt ?? performance.now(),
            queuePosMax: Math.max(qi.queuePosMax ?? 0, pos),
          };
        } else if (qi.queuedAt !== undefined) {
          runInfoRef.current = { ...qi, queuedMs: performance.now() - qi.queuedAt };
        }
      }
      if (cancelScanRef.current) return;
      setVadStage(
        pos === null
          ? "بيفرّغ التسجيل كامل…"
          : `⏳ السيرفر عليه ضغط دلوقتي — تسجيلك في الطابور${pos > 1 ? ` (قبلك ${pos - 1})` : " (الدور الجاي عليك)"}. هيبدأ لوحده، ماتقفلش الصفحة.`
      );
    };
    const onPlates = (msg: Record<string, unknown>) => {
      if (runInfoRef.current && runInfoRef.current.platesMs === undefined)
        runInfoRef.current.platesMs = performance.now() - startedAt;
      if (cancelScanRef.current) return;
      try {
        const rows = (Array.isArray(msg.plates) ? msg.plates : []) as ChunkRow[];
        early = preliminaryEntries(buildChunkEntries(rows));
        setPrelim(early);
        setVadStage(
          `⚡ طلعت ${early.length} لوحة في ${((performance.now() - startedAt) / 1000).toFixed(1)}ث — بيكمّل الأنواع…`
        );
      } catch (err) {
        // العرض البدري مايوقّعش التفريغ — «done» هيبني الجدول كامل
        errorLog.add("التفريغ", `اللوحات البدرية ماتعرضتش: ${(err as Error)?.message ?? err}`);
      }
    };

    /**
     * الرد ماكملش بعد سطر اللوحات (اتقطع/اترفض/اتوقف) ⇒ اللوحات **تفضل**
     * في الجدول **بلا دبوس** ومتعلّمة، والمقطع «الأنواع ماوصلتش — فرّغ تاني».
     */
    const giveUpAfterPlates = () => {
      setPrelim(null);
      if (!early.length) return;
      const kept = platesOnlyEntries(early);
      const merged = entriesBaseRef.current.concat(kept);
      entriesRef.current = merged;
      setEntries(merged);
      platesOnlyRef.current = true;
      lastRunErrRef.current = PLATES_ONLY_ERROR;
    };

    let data: any;
    const ac = new AbortController();
    chunksAbortRef.current = ac;
    const releaseReq = busyRef.current.hold();
    try {
      // 🧮 قناص: وسيط المجمّع على إيطاليا مباشرةً (في المعمل: Express `/api/seg-chunks`)
      const srv = serverRef.current;
      if (!srv.token) throw new Error("مافيش توكن للسيرفر — اقفل الصفحة وافتحها تاني");
      const r = await fetch(chunksUrl(srv.base), {
        method: "POST",
        headers: chunksHeaders({ token: srv.token, mime: blob.type || "audio/webm", agent: agentNameRef.current }),
        body: blob,
        signal: ac.signal,
      });
      // 📋 الوسيط بيرد بالهيدرز أول ما الصوت يوصله كله ⇒ ده تقريباً وقت الرفع
      runInfoRef.current = { ...runInfoRef.current, responded: true, uploadMs: performance.now() - startedAt };
      data = await readChunksResponse(r, onPlates, onQueue);
      runInfoRef.current = {
        ...runInfoRef.current,
        run: typeof data?.run === "string" ? data.run : undefined,
        totalMs: performance.now() - startedAt,
        result: {
          n: Number(data?.n_plates) || (Array.isArray(data?.plates) ? data.plates.length : undefined),
          durS: Number(data?.dur_s) || undefined,
          serverMs: Number(data?.ms) || undefined,
          fieldsFrom: typeof data?.fields_from === "string" ? data.fields_from : undefined,
          cohereCalls: Number.isFinite(Number(data?.cohere_calls)) ? Number(data?.cohere_calls) : undefined,
          dropped: Array.isArray(data?.dropped) ? data.dropped.length : undefined,
        },
      };
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError" || cancelScanRef.current;
      errorLog.add(
        "التفريغ",
        aborted
          ? "وقّفت التفريغ — المقطع محفوظ وتقدر تفرّغه تاني."
          : `فشل الاتصال بسيرفر المقاطع: ${(err as Error)?.message ?? err}`
      );
      lastRunErrRef.current = aborted ? "اتوقف قبل ما يخلص — فرّغه تاني" : "السيرفر مش بيرد";
      giveUpAfterPlates();
      setVadStage(null);
      setPhase("recorded");
      return;
    } finally {
      releaseReq();
      if (chunksAbortRef.current === ac) chunksAbortRef.current = null;
    }
    if (cancelScanRef.current) {
      lastRunErrRef.current = "اتوقف قبل ما يخلص — فرّغه تاني";
      giveUpAfterPlates();
      setVadStage(null);
      return;
    }
    if (!data || data.ok === false) {
      const e = data?.error;
      errorLog.add("التفريغ", e?.message || "سيرفر المقاطع رفض الطلب", {
        detail: JSON.stringify(e?.detail ?? data, null, 2)?.slice(0, 1200),
      });
      lastRunErrRef.current = String(e?.message || "السيرفر رفض الطلب").slice(0, 150);
      // اللوحات اللي ظهرت بدري بتفضل في الجدول بلا دبوس — والمقطع «الأنواع ماوصلتش»
      giveUpAfterPlates();
      setVadStage(null);
      setPhase("recorded");
      return;
    }

    const rows: ChunkRow[] = Array.isArray(data.plates) ? data.plates : [];
    const built: PlateEntry[] = buildChunkEntries(rows);

    // ✅ «done» وصل: الجدول الحقيقي بأوقاته النهائية (الدبوس في `runQueue`)
    setPrelim(null);
    const merged = entriesBaseRef.current.concat(built);
    entriesRef.current = merged;
    setEntries(merged);
    setReviewProgress({ done: built.length, total: built.length });
    setVadStage(null);
    // 🧮 كوهير واقع = بيرجّع فاضي من غير غلط ⇒ العلامة الوحيدة: ٠ نداء مع إن فيه لوحات
    setWitnessUsed(data.fields_from === "cohere" && !(Number(data.cohere_calls) === 0 && rows.length > 0));
    setScanTiming(
      chunkScanTiming(data, Math.round(performance.now() - startedAt))
    );
    setTranscript(
      [
        `المقاطع · ${data.calls} نداء · ${rows.length} لوحة`,
        `الحقول من: ${data.fields_from === "cohere" ? "كوهير (شاهد مستقل)" : "موديل اللوحات"}`,
        `${(Number(data.dur_s) || 0).toFixed(1)}ث صوت في ${((Number(data.ms) || 0) / 1000).toFixed(1)}ث` +
          ` = ${Math.round(Number(data.realtime_x) || 0)}× الحقيقي`,
        "",
        ...rows.map(
          (r) =>
            `${r.plate}  شهود=${r.support ?? "?"}` +
            `${r.type ? "  نوع=" + r.type : ""}` +
            `${r.condition ? "  حالة=" + r.condition : ""}` +
            `${r.place ? "  مكان=" + r.place : ""}`
        ),
      ].join("\n")
    );
    /**
     * 📊 **التقرير الشامل** — بيتبني ويتحفظ مع كل تفريغ (IndexedDB · مابيتمسحش غير
     * بزرّ المسح). المالك (٣٠/٩): «قلت كام وطلع كام … والأهم إنه ميتمسحش».
     * أي فشل في الحفظ بيطلع في سجل الأخطاء ومابيوقفش التفريغ.
     *
     * 🎙️ **تقرير واحد للجلسة** (٤ أكتوبر ٢٠٢٦): «تطلع كله في تقرير واحد سواء
     * سجلت مقطع صوتي واحد او اكتر». التفريغ ده بيدخل كتسجيل (`ReportPart`) في
     * التقرير المفتوح بنفس ورقة القراية (`pickSessionReport` — آخر ٦ ساعات،
     * ماتقفلش بـ«ابدأ تقرير جديد»)، والتقرير بيتبني من جديد على التسجيلات كلها.
     * «فرّغ تاني» لنفس المقطع بيبدّل تسجيله. فكل مقاطع الجلسة بتشاور على نفس
     * التقرير (`reportId` في `runQueue`). الجدول لسه لوحات المقطع ده بس.
     */
    let reportBuilt = false;
    // 📊 تقرير التجربة (تشخيص) للسوبر أدمن بس — عند المندوب كان بيتراكم في التخزين ومالوش مسح
    if (advancedRef.current) try {
      const sheet = parseReadingSheet(readingSheetRef.current);
      const ctx = jobCtxRef.current;
      const part: ReportPart = {
        // من غير مقطع محفوظ (المسار القديم) ⇒ معرّف جديد: تسجيل لوحده مابيبدّلش حاجة
        clipId: ctx?.clipId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: ctx?.label,
        startedAtMs: ctx?.startedAtMs,
        input: {
          rows,
          dropped: Array.isArray(data.dropped) ? data.dropped : [],
          cohereFixed: Array.isArray(data.cohere_fixed) ? data.cohere_fixed : [],
          cohereRescued: Array.isArray(data.cohere_rescued) ? data.cohere_rescued : [],
          seqs: Array.isArray(data.seqs) ? data.seqs : [],
          // 🔍 التشخيص (٣/١٠): نص كل مقطع الخام + حدوده + نص كوهير الخام + اسم الأرشيف
          chunks: Array.isArray(data.chunks) ? data.chunks : [],
          cuts: Array.isArray(data.cuts) ? data.cuts : [],
          cohereTexts: Array.isArray(data.cohere_texts) ? data.cohere_texts : [],
          run: typeof data.run === "string" ? data.run : undefined,
          cohereDigits: Array.isArray(data.cohere_digits) ? data.cohere_digits : [],
          audioSec: Number(data.dur_s) || 0,
          elapsedMs: Math.round(performance.now() - startedAt),
          serverMs: Number(data.ms) || undefined,
          realtimeX: Number(data.realtime_x) || undefined,
          calls: Number(data.calls) || undefined,
          model: data.model,
          recipe: data.recipe,
          fieldsFrom: data.fields_from,
        },
      };
      /**
       * القراية والاختيار والكتابة في معاملة واحدة — «ابدأ تقرير جديد» في النص
       * مايضيعش. 🔎 (مراجعة ٤ أكتوبر) `planSessionSave`: «فرّغ تاني» ⇒ تقرير
       * المقطع نفسه + نسخة من نتيجته القديمة · الورقة اتقرت تاني ⇒ تقرير لوحده.
       */
      const report = await saveReportFrom((reports) => {
        const plan = planSessionSave(reports, part, sheet, Date.now());
        reportBuilt = true;
        return plan;
      });
      lastReportIdRef.current = report.id;
      setReportsKey((k) => k + 1);
    } catch (err) {
      errorLog.add("التقرير", `${reportBuilt ? "ماتحفظش" : "ماتبناش"}: ${(err as Error)?.message ?? err}`);
    }
    finishRun();
  };

  /* ------------------------------------------------- مسح كل النتايج */

  /**
   * يمسح نتيجة التفريغ كلها مرة واحدة.
   *
   * ⚠️ لازم ننده ‎clearSession‎ صراحةً. ‎saveSession‎ بترفض تحفظ قايمة
   * فاضية عن قصد (ده كان بيمنع ضياع داتا حقيقية)، فلو اكتفينا بتفضية
   * الشاشة كانت اللوحات هترجع تاني مع أول إعادة فتح للصفحة.
   *
   * وبنمسح معاها كل اللي بيوصف النتيجة (الفجوات · الوقت · التقرير) —
   * «مسح الكل» اللي بيسيب نص الشاشة مليان بيلخبط أكتر ما بينضّف.
   *
   * **التسجيل نفسه مابيتمسحش** — تقدر تدوس «تفريغ واستخراج اللوحات»
   * تاني على طول.
   */
  /** مقاطع خلص تفريغها — التقرير بيقول لو أكتر من واحد */
  const doneClips = clips.filter((c) => c.status === "done").length;

  const clearAll = useCallback(() => {
    setEntries([]);
    setTableClip(null);
    setExportMsg(null);
    clearSession("batch");
    /**
     * 🔴 **«مسح الكل» ماكانش بيمسح كل حاجة.**
     *
     * كان بيصفّر الحالة المعروضة **بس**، والأساس (`entriesBaseRef`)
     * يفضل فيه القديم — فأول تفريغ بعد المسح بيرجّع اللي اتمسح. يعني
     * مافيش طريقة **تبدأ من جديد** أصلاً.
     *
     * تقرير المالك (١٠ سبتمبر): سجّل قايمة ٣٠ لوحة **تلات مرات** فطلعت
     * **٩٠**، وقال: «لما ادوس مسح يمسح وميظهرش اللوحات اللي فاتت».
     *
     * والمرجع والأساس بيتصفّروا، والمقاطع الخالصة بتتشال من الطابور —
     * الكارت لازم يوافق الجدول.
     */
    entriesRef.current = [];
    entriesBaseRef.current = [];
    clipsRef.current = clipsRef.current.filter(
      (c) => c.status === "waiting" || c.status === "working"
    );
    setClips(clipsRef.current);
    setScanTiming(null);
    setWitnessUsed(null);
    setTranscript("");
    setEditing(null);
    setConfirmClear(false);
  }, []);

  /**
   * يحطّ التسجيل الحالي في الطابور ويفتح الميك فوراً.
   *
   * 🔴 **مابيستناش التفريغ.** ده كل الهدف: المندوب يكمّل شغل بدل ما يقف
   * قدام الشاشة. العامل بياخد المقاطع واحد ورا التاني لوحده.
   */
  const enqueueCurrent = () => {
    const id = pendingClipIdRef.current;
    if (!id) {
      errorLog.add("التفريغ", "مافيش تسجيل — سجّل الأول");
      return;
    }
    void transcribeClip(id);
  };

  /**
   * 💾 «تفريغ» قدام مقطع محفوظ (طلب المالك ٣ أكتوبر ٢٠٢٦): «ولما يدوس عليها
   * يتفرغ المقطع اللي داس عليه».
   *
   * المقطع بيدخل **نفس** الطابور (واحد في المرة) بصوته المحفوظ، ومعاه
   * لحظة بدايته وختمه ومسار موقعه ومصدره — فبيتفرّغ بالظبط زي ما كان
   * هيتفرّغ وقت ما اتسجّل، حتى لو بعد تحديث الصفحة أو تسجيل تاني.
   */
  const transcribeClip = async (id: string) => {
    if (queuingRef.current.has(id)) return;
    if (clipsRef.current.some((j) => j.clipId === id && (j.status === "waiting" || j.status === "working"))) {
      return;
    }
    if (id === recSessionRef.current?.clipId) return; // لسه بيتسجّل/بيتقفل
    // 📋 وهو بيصدّر للسجلات ⇒ استنى (التفريغ بيفضّي الجدول اللي بيتصدّر)
    if (exportingRef.current) {
      errorLog.add("التفريغ", "استنى التصدير للسجلات يخلص وبعدين فرّغ.");
      return;
    }
    // 📋 المقطع اتصدّر للسجلات قبل كده ⇒ التفريغ تاني بيطلّع لوحاته تاني (لو اتصدّرت هتتكرر)
    const exportedBefore = storedClipsRef.current.find((c) => c.id === id)?.result?.exportedCount ?? 0;
    if (
      exportedBefore > 0 &&
      !window.confirm(
        `المقطع ده اتصدّر منه ${exportedBefore} لوحة للسجلات قبل كده — التفريغ تاني هيطلّع لوحاته تاني، ولو صدّرتها هتتكرر في السجلات. تكمّل؟`
      )
    )
      return;
    queuingRef.current.add(id);
    try {
      const store = await getClipStore();
      const clip = await store.get(id);
      if (!clip) {
        errorLog.add("التفريغ", "المقطع ده مش موجود — اتمسح؟");
        await refreshClips();
        return;
      }
      // الكامل اللي في الذاكرة الأول (لو النسخة المحفوظة ناقصة) — `store.audio`؛
      // 🔴 (عيب ١) والتخزين مابيردّش ⇒ أجزاء التسجيل اللي في الذاكرة
      let audioErr: unknown = null;
      let blob = new Blob([], { type: clip.mime });
      try {
        blob = await store.audio(id);
      } catch (err) {
        audioErr = err;
      }
      if (!blob.size) blob = memoryAudio(id, clip.mime) ?? blob;
      if (!blob.size) {
        errorLog.add(
          "التفريغ",
          audioErr
            ? `صوت «${clip.label}» مش متاح دلوقتي — التخزين مابيردّش؛ جرّب تاني بعد شوية (${(audioErr as Error)?.message ?? audioErr})`
            : `«${clip.label}» مافيهوش صوت محفوظ`
        );
        return;
      }
      /**
       * أجزاء التسجيل (٢٥٠ms) لو لسه في الذاكرة **ونفس الصوت بالظبط** — المدمج
       * واحتياطي المسح بيقصّوا منها. مش موجودة ⇒ بيقصّوا من عيّنات `blob`.
       */
      const chunks = matchingChunks(
        blob,
        store.heldChunks(id) ?? (lastRecRef.current?.clipId === id ? lastRecRef.current.chunks : undefined)
      );
      const job: ClipJob = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clipId: id,
        blob,
        status: "waiting",
        chunks,
        mime: blob.type || clip.mime,
        ...clipJobFields(clip),
      };
      clipsRef.current = [...clipsRef.current, job];
      setClips(clipsRef.current);
      await markClip(id, { status: "queued", error: undefined });

      /**
       * ⚠️ لو ده التسجيل اللي لسه خالص، بنفضّي مكانه في المسجّل **قبل** ما
       * العامل يبدأ (زي زرار «تفريغ واستخراج اللوحات» من الأول) — المقطع
       * نفسه محفوظ في القائمة.
       */
      if (pendingClipIdRef.current === id) {
        setPendingClipId(null);
        audioBlobRef.current = null;
        setPlayback(null);
        setSeconds(0);
        setPhase("idle");
      }
    } catch (err) {
      errorLog.add("التفريغ", `ماقدرناش نجهّز المقطع: ${(err as Error)?.message ?? err}`);
      return;
    } finally {
      queuingRef.current.delete(id);
    }
    void runQueue();
  };

  /** ▶ اسمع المقطع المحفوظ (دوسة تانية تقفله) */
  const playClip = async (id: string) => {
    if (clipAudio?.id === id) {
      if (clipAudioUrlRef.current) URL.revokeObjectURL(clipAudioUrlRef.current);
      clipAudioUrlRef.current = null;
      setClipAudio(null);
      return;
    }
    try {
      const store = await getClipStore();
      // 🔴 (عيب ٧) «اسمع» من الذاكرة: المحجوز (`store.audio`) أو أجزاء التسجيل
      let blob: Blob | null = null;
      let audioErr: unknown = null;
      try {
        blob = await store.audio(id);
      } catch (err) {
        audioErr = err;
      }
      if (!blob?.size) blob = memoryAudio(id, blob?.type || "audio/webm") ?? blob;
      if (!blob?.size) throw audioErr ?? new Error("مافيهوش صوت");
      const url = URL.createObjectURL(blob);
      if (clipAudioUrlRef.current) URL.revokeObjectURL(clipAudioUrlRef.current);
      clipAudioUrlRef.current = url;
      setClipAudio({ id, url });
    } catch (err) {
      errorLog.add("التفريغ", `ماقدرناش نشغّل المقطع: ${(err as Error)?.message ?? err}`);
    }
  };

  /**
   * صوت المقطع من **أجزاء التسجيل اللي في الذاكرة** (آخر تسجيل، لو هو نفس
   * المقطع) — لما التخزين مابيردّش والمقطع اتحفظ كامل قبلها (فمش محجوز).
   */
  const memoryAudio = (id: string, mime: string): Blob | null => {
    const last = lastRecRef.current;
    if (last?.clipId !== id || last.chunks.length === 0) return null;
    return new Blob(last.chunks, { type: mime || "audio/webm" });
  };

  /**
   * لوحات مقطع خلص تفريغه ⇒ الجدول (بعد التحديث كمان).
   * ⚠️ لو الجدول فيه لوحات، `ClipList` بيسأل الأول (`replaceTableWarning`)
   * وبينده هنا بعد «أيوه» بس — التعديلات اليدوية مابترجعش للمقطع (عيب ٤).
   */
  const showClipPlates = (id: string) => {
    const c = storedClips.find((x) => x.id === id);
    if (!c?.result) return;
    /**
     * 🔴 (عيب ٣) تفريغ شغّال هيبدّل الجدول بنتيجته أول ما يخلص — فأي تعديل
     * على اللوحات اللي هنعرضها دلوقتي كان هيتمسح من غير ما المندوب يحس.
     * لوحات المقطع ظاهرة برضه في «اللوحات والموقع» تحت المقطع.
     */
    if (canStopTranscription(clipsRef.current)) {
      errorLog.add(
        "التفريغ",
        "فيه تفريغ شغّال والجدول هيتبدّل بنتيجته — اعرض لوحات المقطع ده لما يخلص (أو شوفها في «اللوحات والموقع»)."
      );
      return;
    }
    entriesBaseRef.current = [];
    // 📥 بحالتها على ملف التشييك **الحالي** (الملف ممكن يكون اتغيّر من ساعة التفريغ)
    const fresh = rematchEntries(c.result.entries, (p) => matchInCheckSheet(sheetRef.current, p)).entries;
    entriesRef.current = fresh;
    setEntries(fresh);
    setTableClip(id);
    setExportMsg(null);
    setEditing(null);
    setConfirmClear(false);
  };

  /** «امسح» — بعد التأكيد في القائمة. مافيش مسح غير من هنا. */
  const deleteClip = async (id: string) => {
    if (id === recSessionRef.current?.clipId) return;
    if (clipsRef.current.some((j) => j.clipId === id && (j.status === "waiting" || j.status === "working"))) {
      errorLog.add("التفريغ", "المقطع ده في الدور أو بيتفرّغ — استنى يخلص وبعدين امسحه.");
      return;
    }
    try {
      const store = await getClipStore();
      await store.remove(id);
    } catch (err) {
      errorLog.add("التفريغ", `ماتمسحش: ${(err as Error)?.message ?? err}`);
      await refreshClips();
      return;
    }
    if (lastRecRef.current?.clipId === id) lastRecRef.current = null;
    if (clipAudio?.id === id) {
      if (clipAudioUrlRef.current) URL.revokeObjectURL(clipAudioUrlRef.current);
      clipAudioUrlRef.current = null;
      setClipAudio(null);
    }
    if (pendingClipIdRef.current === id) {
      setPendingClipId(null);
      audioBlobRef.current = null;
      setPlayback(null);
      setSeconds(0);
      setPhase("idle");
    }
    await refreshClips();
    void checkStorage();
  };

  /**
   * العامل — بياخد مقطع مستني، يفرّغه، ينشر نتايجه، ويعدّي للّي بعده.
   * واحد في المرة (الكارت مايشيلش اتنين مع بعض بكفاءة).
   */
  const runQueue = async () => {
    if (workerRef.current) return;
    workerRef.current = true;
    try {
      for (;;) {
        // 🧮 الصفحة اتقفلت ⇒ الباقي يفضل «في الدور» على الجهاز ويرجع «جاهز» لما تفتحها
        if (unmountedRef.current) break;
        const next = clipsRef.current.find((c) => c.status === "waiting");
        if (!next) break;

        const mark = (patch: Partial<ClipJob>) => {
          clipsRef.current = clipsRef.current.map((c) =>
            c.id === next.id ? { ...c, ...patch } : c
          );
          setClips(clipsRef.current);
        };
        mark({ status: "working" });

        // المحرّكات بتقرا من ‎audioBlobRef‎، والعامل هو **الوحيد** اللي
        // بيكتب فيه دلوقتي — فمافيش تصادم مع تسجيل جديد ماشي بالتوازي.
        audioBlobRef.current = next.blob;
        // 📋 للتقرير — الصوت بيتشال من الذاكرة بعد ما المقطع يخلص
        const clipBytes = next.blob.size;
        runInfoRef.current = null;
        // سياق المقطع ده — ‎buildEntry‎ بتقرا منه بدل الـrefs الحيّة
        jobCtxRef.current = {
          startedAtMs: next.startedAtMs,
          track: next.track,
          stamp: SessionStamp.fromJSON(next.stamp),
          clipId: next.clipId,
          fixes: next.fixes,
          source: next.source,
          // 🔴 أجزاء **المقطع ده** بس (عيب ٣) — `activeChunks()` بتقرا منها
          chunks: next.chunks,
          mime: next.mime,
          label: next.label,
        };
        const startedAt = performance.now();
        const before = entriesBaseRef.current.length;
        // نتيجة المهمة دي لوحدها — المحرّكات بتكتب لوحاتها في entriesRef
        entriesRef.current = [];
        runSucceededRef.current = false;
        platesOnlyRef.current = false;
        cancelScanRef.current = false;
        lastRunErrRef.current = undefined;
        lastReportIdRef.current = undefined;
        // آخر رسالة في السجل قبل المهمة — اللي بعدها هي سبب الفشل لو المحرّك ماقالش
        const logMark = errorLog.getSnapshot()[0]?.id;
        void markClip(next.clipId, { status: "working" });
        // 🔴 التفريغ ده بيفضّي الجدول ويحط لوحاته هو ⇒ الجدول مش مربوط بالمقطع اللي قبله (التعديل أو التصدير
        // كان بيكتب فوق لوحات مقطع تاني لما الرد يتقطع بعد اللوحات) — بيترَبط تاني بعد النجاح بس.
        tableClipIdRef.current = null;
        setExportMsg(null);
        // وقت نطق لوحة من غير توقيت بياخد آخر وقت معروف **في المقطع ده** (مش المقطع اللي قبله)
        lastKnownSpokenAtRef.current = 0;
        let threw: string | null = null;
        try {
          await runTranscription();
        } catch (err) {
          errorLog.add("التفريغ", `مقطع فشل: ${(err as Error)?.message ?? err}`);
          threw = String((err as Error)?.message ?? err).slice(0, 120);
        }
        // المحرّك وقع بعد سطر اللوحات من غير ما يقفله ⇒ نفس القاعدة: اللوحات
        // تفضل بلا دبوس والمقطع «الأنواع ماوصلتش» (عيب ٢)
        if (prelimRef.current) {
          const kept = platesOnlyEntries(prelimRef.current);
          entriesRef.current = entriesBaseRef.current.concat(kept);
          setEntries(entriesRef.current);
          if (kept.length) platesOnlyRef.current = true;
          setPrelim(null);
        }

        /**
         * 🔴 **الحكم لأي محرّك** (عيب ٢): «خلص» بس لو المحرّك وصل لآخره
         * (`finishRun`) ومحدّش داس «وقّف». غير كده «فشل» بالسبب — مش
         * «✅ خلص · ٠ لوحة» اللي بيخلّي المندوب يمسح صوت عمره ما اتفرّغ.
         */
        const snap = errorLog.getSnapshot();
        const markAt = logMark ? snap.findIndex((e) => e.id === logMark) : -1;
        const sinceJob = markAt < 0 ? snap : snap.slice(0, markAt);
        const verdict = runVerdict({
          succeeded: runSucceededRef.current,
          threw,
          cancelled: cancelScanRef.current,
          error: lastRunErrRef.current,
          // 🔴 (عيب ٦) رسايل الحفظ مش سبب فشل التفريغ
          lastLog: runFailureLog(sinceJob),
          platesOnly: platesOnlyRef.current,
        });
        const ok = verdict.ok;
        mark(
          ok
            ? { status: "done", tookSec: (performance.now() - startedAt) / 1000 }
            : { status: "failed" }
        );

        /**
         * 📍 الدبوس بعد ما المقطع كله يتقري: كل لوحة بمكان المندوب **لحظة
         * نطقها** من مسار المقطع ده — ≤١٠٠م و≤ثانيتين، ومافيش لوحتين ورا بعض
         * على نفس القراءة؛ وغير كده «من غير موقع دقيق» (`platePin.ts`).
         */
        const outcome = clipRunOutcome({
          ok,
          error: verdict.ok ? undefined : verdict.error,
          entries: entriesRef.current,
          fixes: next.fixes,
          startEpoch: next.startedAtMs,
          tookSec: (performance.now() - startedAt) / 1000,
          reportId: lastReportIdRef.current,
          engine,
          now: Date.now(),
        });
        if (ok && next.fixes) {
          entriesRef.current = outcome.entries;
          setEntries(outcome.entries);
        }
        // 🚨 المطلوبة من المقطع ده (بموقعها النهائي) ⇒ المربع بصوت — وحتى لو الأنواع ماوصلتش (اللوحات طلعت)
        {
          const w = wantedOf(ok ? outcome.entries : platesOnlyRef.current ? entriesRef.current : []);
          if (w.length) setWantedBatch((prev) => mergeWanted(prev, w));
        }
        // اللوحات اللي في الجدول من المقطع ده — حتى لو الرد اتقطع بعد اللوحات (من غير أنواع/موقع):
        // تعديلها وتصديرها لازم يتسجّلوا على مقطعها (وإلا «فرّغ تاني» بيكرّرها في السجلات من غير سؤال)
        if (next.clipId && (ok || platesOnlyRef.current)) {
          setTableClip(next.clipId);
          setExportMsg(null);
        }
        /**
         * 📋 تقرير المقطع ده للسيرفر — **نجح أو فشل** (أهمه اللي ماوصلش السيرفر أصلاً: السيرفر
         * مايعرفش عنه حاجة). بالموقع النهائي لكل لوحة. في الخلفية — الطابور مايستناش.
         */
        try {
          // (as: الـref اتصفّر فوق في نفس الدالة — TS فاكره لسه null)
          const info = runInfoRef.current as RunInfo | null;
          queueRunReport({
            kind: info?.responded ? "run" : "fail",
            ok,
            error: verdict.ok ? undefined : verdict.error,
            run: info?.run,
            clip: {
              id: next.clipId,
              label: next.label,
              source: next.source,
              sec: next.sec,
              bytes: clipBytes,
              mime: next.mime || next.blob.type || undefined,
              startedAtMs: next.startedAtMs,
            },
            timing: {
              totalMs: info?.totalMs,
              uploadMs: info?.uploadMs,
              platesMs: info?.platesMs,
              queuedMs: info?.queuedMs, queuePosMax: info?.queuePosMax,
            },
            result: info?.result,
            entries: ok ? outcome.entries : entriesRef.current,
            fixes: next.fixes?.length,
            errors: sinceJob.map((e) => `${e.source}: ${e.message}`),
          });
        } catch {
          /* التقرير عمره ما يوقّف الطابور */
        }
        // 💾 النتيجة بتتحفظ مع المقطع — بعد التحديث الصف بيقول «N لوحة» ويعرضها
        if (next.clipId) {
          // «فرّغ تاني» لمقطع اتصدّر منه قبل كده ⇒ العدّ يفضل (التحذير من التكرار يفضل شغّال)
          if (outcome.patch.result) {
            try {
              const prev = (await (await getClipStore()).get(next.clipId))?.result;
              if (prev?.exportedCount) {
                outcome.patch.result = {
                  ...outcome.patch.result,
                  exportedCount: prev.exportedCount,
                  exportedAt: prev.exportedAt,
                };
              }
            } catch {
              /* التخزين مابيردّش — النتيجة الجديدة بس */
            }
          }
          await markClip(next.clipId, outcome.patch);
          // الصوت محفوظ في المقطع — مانشيلش نسخة تانية منه في الذاكرة
          mark({ blob: new Blob() });
        }
        /**
         * 🔴 **مافيش تجميع — كل تفريغ يعرض لوحاته هو بس.**
         *
         * كان: `entriesBaseRef.current = entriesRef.current` — نتيجة كل
         * مقطع تبقى «أساس» للّي بعده، فالجدول يجمّع الجولة كلها. والمالك
         * سجّل قايمة ٣٠ لوحة تلات مرات فطلعت **٩٠** (١٠ سبتمبر)، وقال
         * صريح: «لما ادوس مسح يمسح وميظهرش اللوحات اللي فاتت، هو يظهر
         * اللوحات اللي قولتها فقط في الجلسه اللي فرغتها».
         *
         * فالأساس بيفضل فاضي، وكل محرك بيعمل `setEngine`→
         * `setEntries(entriesBaseRef.current)` في أوله ⇒ الجدول يتصفّى
         * ويتملى بنتيجة المقطع الحالي لوحده. وكارت الطابور لسه بيعرض كل
         * المقاطع وأرقامها، فمافيش معلومة بتضيع.
         */
        entriesBaseRef.current = [];
        void before;
        audioBlobRef.current = null;
        jobCtxRef.current = null;
      }
    } finally {
      workerRef.current = false;
    }
  };

  const runTranscription = async () => runChunksTranscription();

  /* ------------------------------------------------------- التعديل */

  /**
   * 🔴 **أعمدة النوع/الحي/الملاحظة كانت مخفية في المجمّع كله.**
   *
   * `PlateTable` بيفعّل الأعمدة دي بوجود `onAnnotate` (سطر ٦٣:
   * `const fieldMode = !!onAnnotate`)، والمجمّع ماكانش بيبعته. فالنوع
   * اللي كوهير بيطلّعه **صح** كان بيتحفظ في الصف ويتطبع في الخام —
   * ومافيش عمود يعرضه. والعمود اللي المالك كان بيبصّ عليه اسمه «النوع»
   * بس هو **عمود شيت البنك** (تفاصيل السيارة المطلوبة)، فبيفضل فاضي
   * للوحات اللي مش في الشيت.
   *
   * تقرير المالك (١٠ سبتمبر): «مفيش ولا نوع من اللي قولته راح في عمود
   * النوع» — والخام في نفس التقرير فيه ٨ من ١٠ حقول مظبوطة.
   *
   * ⚠️ والأعمدة قابلة للتعديل (منسدلة مقفولة للنوع، قلم للحي والملاحظة)
   * — بس **مش شاشة مراجعة إجبارية**: الصف محفوظ خلاص، ده تصحيح اختياري.
   */
  const annotateEntry = (
    id: string,
    patch: { vehicleType?: string; neighborhood?: string; note?: string }
  ) => {
    if (exportingRef.current || canStopTranscription(clipsRef.current)) return;
    tableDirtyRef.current = true;
    editCountRef.current += 1;
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      entriesRef.current = next;
      return next;
    });
  };

  const editEntry = (id: string, next: { letters?: string[]; digits?: string }) => {
    if (exportingRef.current || canStopTranscription(clipsRef.current)) return;
    tableDirtyRef.current = true;
    editCountRef.current += 1;
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const review = applyManualEdit(entry.review, next);
        const match = matchInCheckSheet(sheetRef.current, review.plate);
        // 🔴 التصحيح ده تسمية بشرية على مقطع الموديل غلط فيه — بنحفظه بلحظة
        // النطق عشان نعرف نقصّ صوته بعدين. السجل نفسه بيرمي الكتابة الوسط
        // (ابح12) وبيحتفظ بقراءة الموديل الأصلية مهما اتعدّل الصف تاني.
        correctionsRef.current.record({
          id,
          heard: entry.review.plate,
          corrected: review.plate,
          tMs: entry.capturedAt,
          requireTime: true,
        });
        // بيتراكم عبر الجلسات — ده داتا تدريب مش حالة صفحة، فمابيروحش مع
        // «تسجيل جديد» ولا مع قفل الصفحة.
        saveCorrections(correctionsRef.current.list());
        return { ...entry, review, match };
      })
    );
  };

  const removeEntry = (id: string) => {
    if (exportingRef.current || canStopTranscription(clipsRef.current)) return;
    tableDirtyRef.current = true;
    deleteCountRef.current += 1;
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  /** نتيجة المقطع اللي الجدول بيعرضه = الجدول (بعد تعديل/مسح/تصدير) */
  const saveTableToClip = useCallback(
    async (next: PlateEntry[], extra?: { exported?: number; clipId?: string | null }): Promise<boolean> => {
      const id = extra?.clipId !== undefined ? extra.clipId : tableClipIdRef.current;
      if (!id) return true;
      // من التخزين نفسه — بيستنى نتيجة التفريغ اللي لسه بتتكتب (القايمة المعروضة ممكن تكون قبلها)
      let c: StoredClip | undefined;
      try {
        c = await (await getClipStore()).get(id);
      } catch {
        c = storedClipsRef.current.find((x) => x.id === id);
      }
      if (!c) return false;
      // الرد اتقطع بعد اللوحات ⇒ المقطع مالوش نتيجة محفوظة — الجدول هو نتيجته (تعديل/تصدير ماتضيعش)
      if (!c.result && c.status !== "failed") return false;
      const base = c.result ?? { at: Date.now(), plates: 0, pinned: 0, entries: [] };
      await markClip(id, {
        result: {
          ...base,
          entries: next,
          plates: next.length,
          pinned: countPinned(next),
          ...(extra?.exported
            ? { exportedAt: Date.now(), exportedCount: (base.exportedCount ?? 0) + extra.exported }
            : {}),
        },
      });
      return true;
    },
    [markClip, getClipStore]
  );

  // 📋 الجدول رجع من الجلسة ⇒ يرجع مربوط بمقطعه — بس لو لوحاته فعلاً من المقطع ده (نفس المعرّفات)
  const bindRestoredRef = useRef(false);
  useEffect(() => {
    if (bindRestoredRef.current || storedClips.length === 0) return;
    bindRestoredRef.current = true;
    if (tableClipIdRef.current) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TABLE_CLIP_KEY);
    } catch {
      saved = null;
    }
    const ids = new Set(entriesRef.current.concat(entries).map((e) => e.id));
    const c = saved ? storedClips.find((x) => x.id === saved) : undefined;
    if (c?.result && ids.size > 0 && c.result.entries.some((e) => ids.has(e.id))) tableClipIdRef.current = c.id;
    else setTableClip(null);
  }, [storedClips, entries]);

  // ✏️ التعديل والمسح بيرجعوا للمقطع نفسه — تسجيل جديد بيفضّي الجدول، والمقطع لازم يفضل فيه
  // اللوحات اللي لسه ماتصدّرتش **بتعديلاتها** («اعرض لوحاته» بيرجّعها زي ما سابها).
  useEffect(() => {
    if (!tableDirtyRef.current) return;
    tableDirtyRef.current = false;
    entriesRef.current = entries;
    // المندوب مسح آخر لوحة ⇒ الجلسة كمان (saveSession مابتحفظش الفاضي — كانت هترجع مع أول فتحة)
    if (entries.length === 0) clearSession("batch");
    void saveTableToClip(entries).then((ok) => {
      // المقطع لسه مالوش نتيجة محفوظة ⇒ التعديل يفضل مستني ويتحفظ أول ما القايمة تتحدّث
      if (!ok) tableDirtyRef.current = true;
    });
  }, [entries, storedClips, saveTableToClip]);

  /**
   * 📋 «تصدير للسجلات» ⇒ «داتا التسجيلات». اللي اتحفظ فعلاً بس بيتشال من الجدول (الفاشل بيفضل
   * قدامه يجرّب تاني)، والمقطع بيتعلّم «اتصدّر». اللوحة اللي مالهاش موقع بيتسأل عليها الأول —
   * مابنخترعش موقع، ومابنسيبهاش محبوسة (المجمّع مش هيجيبلها موقع بعدين).
   */
  const exportToRecords = async () => {
    const run = onExportToRecordsRef.current;
    const list = entries;
    if (!run || exportingRef.current || list.length === 0) return;
    // تفريغ شغّال ⇒ لوحاته لسه من غير موقع ومش مربوطة بمقطعها — استنى يخلص
    if (canStopTranscription(clipsRef.current)) {
      setExportMsg("⏳ استنى التفريغ اللي شغّال يخلص وبعدين صدّر — اللوحات لسه بتاخد مواقعها.");
      return;
    }
    const noPin = list.filter((e) => !e.pin).length;
    if (
      noPin > 0 &&
      !window.confirm(
        noPin === list.length
          ? `اللوحات (${noPin}) من غير موقع — هتتصدّر من غير موقع. تكمّل؟`
          : `فيه ${noPin} لوحة من غير موقع — هتتصدّر من غير موقع. تكمّل؟`
      )
    )
      return;
    exportingRef.current = true;
    setExporting(true);
    setExportMsg(null);
    // المقطع اللي الجدول بيعرضه **دلوقتي** — تفريغ يبدأ وإحنا بنحفظ مايغيّرش هو اتعلّم على أنهي مقطع
    const exportClipId = tableClipIdRef.current;
    try {
      const clipKey = exportClipId ?? "restored";
      const res = await run(list, { sheet: bank.sheet, clipKey });
      const saved = new Set(res.savedEntryIds);
      const left = list.filter((e) => !saved.has(e.id));
      // 📋 تقرير التصدير للسيرفر (في الخلفية): اتحفظ كام · فشل كام · من غير موقع · عدّل/مسح كام قبله
      queueRunReport({
        kind: "export",
        clip: { id: exportClipId ?? undefined },
        entries: list.filter((e) => saved.has(e.id)),
        export: { saved: saved.size, failed: res.failed, total: list.length, no_pin: noPin,
          edited: editCountRef.current, deleted: deleteCountRef.current },
      });
      if (saved.size > 0) {
        editCountRef.current = 0;
        deleteCountRef.current = 0;
      }
      entriesRef.current = left;
      setEntries(left);
      setEditing(null);
      setConfirmClear(false);
      await saveTableToClip(left, { exported: saved.size, clipId: exportClipId });
      if (left.length === 0) {
        // saveSession بترفض القايمة الفاضية عن قصد ⇒ لازم مسح صريح وإلا ترجع مع أول فتح
        clearSession("batch");
        setTableClip(null);
      }
      setExportMsg(
        res.failed > 0
          ? `⚠️ اتصدّر ${saved.size} لوحة — ${res.failed} ماتحفظوش وفاضلين في الجدول، دوس «تصدير للسجلات» تاني.`
          : `✅ اتصدّر ${saved.size} لوحة لـ«داتا التسجيلات» في صفحة السجلات.`
      );
    } catch (err) {
      const m = (err as Error)?.message ?? String(err);
      errorLog.add("التصدير", `ماتصدّرش للسجلات: ${m}`);
      queueRunReport({
        kind: "export",
        ok: false,
        error: `ماتصدّرش للسجلات: ${m}`,
        clip: { id: exportClipId ?? undefined },
        export: { saved: 0, failed: list.length, total: list.length, no_pin: noPin,
          edited: editCountRef.current, deleted: deleteCountRef.current },
      });
      setExportMsg(`⚠️ ماتصدّرش للسجلات: ${m} — اللوحات زي ما هي، جرّب تاني.`);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(
        entries.map((e) => e.review.plate).join("\n")
      );
    } catch {
      errorLog.add("التصدير", "المتصفح رفض النسخ للحافظة");
    }
  };

  /* --------------------------------------------------------- إحصاء */

  const stats = useMemo(() => {
    const wanted = entries.filter((e) => e.match.kind === "exact").length;
    const near = 0; // مافيش «قريبة» بعد قرار ٢٠٢٦/٨/١٥
    const needsLook = entries.filter((e) => e.review.status !== "solid").length;
    const corrected = entries.filter((e) => e.review.corrections.length > 0).length;
    return { wanted, near, needsLook, corrected };
  }, [entries]);

  const busy = phase === "transcribing" || phase === "reviewing";

  return (
    <div className="space-y-4">
      {/* 🚨 مربع المطلوبة — والمجمّع ظاهر بس (مستخبي ورا «التسجيل القديم» ⇒ يستنى لحد ما يظهر، الصوت مايطلعش في الخلفية) */}
      {visible && wantedBatch.length > 0 && (
        <WantedBatchModal items={wantedBatch} onClose={() => setWantedBatch([])} onShowRow={showWantedRow} />
      )}

      {/* ============================================ الإعداد */}
      <div className="grid gap-4 lg:grid-cols-2">
        {!hideCheckBox && <CheckSheetBox bank={bank} />}
        {/* ورقة القراية = أداة تجربة المالك (تقارير الدقة) — للسوبر أدمن بس */}
        {advanced && <ReadingSheetBox value={readingSheet} onChange={setReadingSheet} />}
      </div>

      {/* ============================================ المسجّل */}
      <div className="card">
        <div className="card-title justify-between">
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-emerald-300" />
            التسجيل الممتد
          </span>
          <span className="flex items-center gap-2 text-xs font-normal">
            <span className="chip bg-white/10 text-slate-300">{PHASE_LABEL[phase]}</span>
            <span className="chip bg-white/10 text-slate-300">
              {gps.status === "active" ? "📍 الموقع شغّال" : `📍 ${gpsShort(gps.status)}`}
            </span>
          </span>
        </div>

        <Waveform waveform={waveform} level={level} active={phase === "recording"} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="ltr-nums rounded-xl bg-black/40 px-3 py-2 font-mono text-2xl font-bold text-emerald-300">
            {formatTime(seconds)}
          </div>

          {/*
            🔴 زرار التسجيل **مش مقفول أثناء التفريغ**. كان `disabled={busy}`
            فالمندوب يقف مستني دقيقة قدام كل مقطع، والعربيات اللي بيعدّي
            عليها في الدقيقة دي بتضيع. التفريغ ماشي في الخلفية دلوقتي.
          */}
          {/*
            🔴 (عيب ٥) مقفول لحد ما المقطع اللي اتقفل يخلص حفظه — دوسة في
            الشبّاك ده كانت بتخلّي قفل الأول يصفّر كاتب ومسار التاني.
          */}
          {phase !== "recording" ? (
            <button className="btn-primary" onClick={startRecording} disabled={finalizing}>
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {finalizing ? "بيحفظ المقطع…" : "بدء التسجيل"}
            </button>
          ) : (
            <button className="btn-danger animate-pulse-ring" onClick={stopRecording}>
              <Square className="h-4 w-4" />
              إيقاف التسجيل
            </button>
          )}

          {/*
            🔴 **رفع المقاطع الصوتية اتشال بطلب المالك.**
            المجمّع بقى للتسجيل من الصفحة بس — عشان كل لوحة يبقى ليها **توقيت
            نطق حقيقي** نقدر نختمها بيه (GPS · الشارع · الملاحظة · التاريخ
            والوقت). الملف المرفوع مالوش مسار GPS ولا توقيت بداية معروف، فكان
            بيدّي لوحات بلا مكان ولا سياق.
            كود المعالجة سايبينه شغّال (`pickAudioFile`) عشان مانكسرش حاجة،
            بس **مافيش مدخل ليه في الواجهة**.
          */}
          <span className="text-xs text-slate-500">
            التسجيل لحد {Math.floor(MAX_BATCH_SECONDS / 60)} دقيقة
          </span>
        </div>

        {/* المندوب: آخر غلط (الميك/السيرفر/التصدير) هنا جنب زرار التسجيل — مش في آخر الصفحة */}
        {!advanced && (
          <div className="mt-3">
            <LastErrorNote errorLog={errorLog} />
          </div>
        )}

        {/*
          ⚠️ الموقع وهو بيسجّل: لو مش جاهز/ضعيف/واقف، يعرف **دلوقتي** إن اللوحات اللي
          بيقولها هتطلع من غير موقع — مش بعد التفريغ (`recordGpsWarning`). العدّاد
          بيحدّث الصفحة كل ثانية وهو بيسجّل، فـ«واقف من كام ثانية» بيتحدّث معاه.
        */}
        {(() => {
          const warn = recordGpsWarning(gps.fix, phase === "recording", Date.now(), lastFixRecvAt());
          return warn ? (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {warn}
            </div>
          ) : null;
        })()}

        {/*
          سياق الجلسة — يتكتب **مرة واحدة** ويختم كل اللوحات اللي بعده.
          ده سلوك المندوب الحقيقي المقيس من شيتاته: «غمارتين» اتكررت ٥٤ مرة
          على صفوف متتالية، و«أول الشارع» ١٩٠ مرة. فبدل ما يملا كل صف لوحده،
          يدخلها مرة والباقي يتختم لوحده.
          🔴 الختم بلحظة **نطق** اللوحة — التفريغ بيمشي وراه، فلو اتحسب وقته
          كانت اللوحة تاخد شارع غلط.
        */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="input"
            placeholder="اسم الشارع"
            value={street}
            onChange={(e) => {
              setStreet(e.target.value);
              stampRef.current.setStreet(e.target.value, elapsedMsRef.current());
            }}
          />
          <input
            className="input"
            placeholder="ملاحظة"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              stampRef.current.setNote(e.target.value, elapsedMsRef.current());
            }}
          />
          <select
            className="input"
            value={vType}
            onChange={(e) => {
              setVType(e.target.value);
              stampRef.current.setType(e.target.value, elapsedMsRef.current());
            }}
          >
            {/* قاموس مقفول — مافيش كتابة حرة عشان مايتكتبش تخمين.
                🔴 **الأنواع بس** (طلب المالك ٩ سبتمبر ٢٠٢٦: «كل واحدة في
                عمودها») — الحالة والمكان مكانهم عمود «ملاحظة». */}
            <option value="">النوع (اختياري)</option>
            {VEHICLE_TYPE_KINDS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>


        {/* مشغّل المراجعة قبل المعالجة */}
        {playbackUrl && phase !== "recording" && (
          <div className="mt-3 rounded-xl bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <Play className="h-3.5 w-3.5" />
              اسمع التسجيل قبل التفريغ
            </div>
            <audio src={playbackUrl} controls className="w-full" />
          </div>
        )}

        {/* 🧮 قناص: محرك واحد — «كامل ⚡» (الخمسة التانيين بتوع سيرفرات المعمل) — شرح للسوبر أدمن بس */}
        {advanced && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <span className="font-bold">كامل ⚡</span>
          <span className="text-amber-100/70">
            نداء واحد · {batchModelName} · النوع والملاحظة من كوهير
          </span>
        </div>
        )}

        {/*
          🔴 **زر يوقّف التفريغ.** قبل كده الإلغاء كان بيحصل في حالة واحدة
          بس: إن المندوب **يخرج من الصفحة**. ومحرك الـVAD بيبعت ٣ أضعاف
          طلبات المسح (المقاطع + المدموج + كل الأزواج)، فلو بدأ على ملف
          طويل بالغلط مافيش قدامه غير إنه يستنى أو يسيب الصفحة ويخسر
          اللوحات اللي طلعت.

          ⚠️ والزر لازم **يرجّع الحالة** كمان: دوال التفريغ بترجع بـ
          ‎if (cancelScanRef.current) return;‎ من غير ما تلمس ‎phase‎ —
          فبلا الترجيع هنا الصفحة تفضل «بيفرّغ» للأبد.

          🔴 (مراجعة ٣ أكتوبر جولة ٢ — عيب ٨) **مربوط بالطابور مش بحالة
          الصفحة**: كان `busy && phase === "transcribing"`، فوهو بيسجّل (الحالة
          «بيسجّل») أو بعد ما وقف التسجيل (الحالة «التسجيل جاهز») والتفريغ لسه
          ماشي، الزرار كان مستخبي ومافيش طريقة توقّفه.
        */}
        {/* 🚦 حالة التفريغ الشغّال (الطابور/بيفرّغ) — باينة حتى وهو بيسجّل اللي بعده */}
        {canStopTranscription(clips) && vadStage && phase !== "transcribing" && (
          <p className="mt-3 rounded-xl bg-black/30 px-3 py-2 text-center text-xs text-slate-200">{vadStage}</p>
        )}
        {canStopTranscription(clips) && (
          <button
            className="btn-ghost mt-3 w-full py-2 text-sm text-amber-300"
            onClick={() => {
              cancelScanRef.current = true;
              // «كامل ⚡» نداء واحد طويل — بنقطعه هو كمان
              chunksAbortRef.current?.abort();
              setVadStage(null);
              setReviewProgress({ done: 0, total: 0 });
              // وهو بيسجّل `setPhase` بيسيبها «بيسجّل»؛ غير كده: فيه تسجيل مستني ولا لأ
              setPhase(pendingClipIdRef.current ? "recorded" : "idle");
              // المقطع بيتعلّم «فشل — اتوقف» (مش «خلص») ويفضل يتفرّغ تاني
              errorLog.add(
                "التفريغ",
                "وقّفت التفريغ. اللوحات اللي طلعت لحد دلوقتي في الجدول (من غير موقع لو الأنواع ماوصلتش)، والمقطع محفوظ وتقدر تفرّغه تاني."
              );
            }}
          >
            ✋ وقّف التفريغ
          </button>
        )}

        {/* 🧮 قناص: حالة سيرفر المجمّع من الفحص (`probeBatchServer`) */}
        {advanced && server.probe && !(server.probe.ready && server.probe.tokenOk) && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            ⚠️ {server.probe.message || "سيرفر المجمّع مش جاهز دلوقتي"} — المقاطع بتتحفظ عادي وتتفرّغ لما يرجع.
          </div>
        )}

        <button
          className="btn-primary mt-3 w-full py-3 text-base"
          // الزرار بقى **بيحط في الطابور** مش بيفرّغ على طول، فالمندوب
          // يقدر يدوسه ويرجع يسجّل في نفس اللحظة. وعشان كده `busy` اتشالت
          // من شرط التعطيل: مقطع بيتفرّغ مايمنعش اللي بعده إنه يقف في الدور.
          onClick={enqueueCurrent}
          // 💾 آخر مقطع اتسجّل (محفوظ في القائمة تحت) — نفس «تفريغ» قدامه
          disabled={phase === "recording" || !pendingClipId}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {/*
                ⚠️ محرك الـVAD بيعدّي **تلات مراحل**، والعدّاد بيرجع لصفر
                مع كل واحدة. بلا اسم المرحلة الشكل بيبقى كأنه بدأ من الأول
                مرتين — فالمندوب يفتكره واقف في لوب.
              */}
              {/*
                قراءة النوع بتيجي **بعد** ما اللوحات تخلص، فلو سبنا نص
                المراجعة زي ما هو المندوب هيفتكر إن الفرز اتعلّق: الشريط
                واقف على «راجع ٤٠ من ٤٠» وهو لسه شغال دقيقة كمان.
              */}
              {phase === "transcribing" && vadStage
                ? // ⚡ «طلعت N لوحة في Xث — بيكمّل النوع والملاحظات…»
                  vadStage
                : "بيفرّغ التسجيل كله…"}
            </>
          ) : (
            <>
              <Wand2 className="h-5 w-5" />
              تفريغ واستخراج اللوحات
            </>
          )}
        </button>

      </div>

      {/*
        💾 المقاطع — تحت بعض، وقدام كل واحد «تفريغ» (طلب المالك ٣ أكتوبر).
        بدل «طابور التفريغ» اللي كان في الذاكرة بس: القائمة دي محفوظة على
        الجهاز وبتفضل بعد التحديث والخروج والتنقّل وبدء تسجيل جديد، وحالة
        كل مقطع (في الدور/بيتفرّغ/خلص) بتظهر قدامه. المسح بإيد المندوب بس.
      */}
      <ClipList
        clips={storedClips}
        recordingId={recClipId}
        recordingSeconds={seconds}
        persistent={clipsPersistent}
        storageWarn={[saveWarn, storageWarn].filter(Boolean).join(" · ") || null}
        tableRows={entries.length}
        playing={clipAudio}
        onTranscribe={(id) => void transcribeClip(id)}
        onPlay={(id) => void playClip(id)}
        onShow={showClipPlates}
        onDelete={(id) => void deleteClip(id)}
        showExportState={!!onExportToRecords}
        advanced={advanced}
        transcribing={canStopTranscription(clips)}
      />

      {/* شريط الاسترجاع — يطمّن المندوب إن اللوحات ما ضاعتش */}
      {restoredCount > 0 && !restoreDismissed && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-xs text-sky-100">
          <span>
            ✅ رجّعنا <strong>{restoredCount}</strong> لوحة من آخر جلسة — ما
            ضاعتش لما خرجت من الصفحة.
          </span>
          <button
            className="btn-ghost btn-sm shrink-0"
            onClick={() => setRestoreDismissed(true)}
          >
            تمام
          </button>
        </div>
      )}

      {/*
        🧮 قناص: تحذير «النوع ماجاش من كوهير» — بعد التفريغ بس.
        في المعمل الكارت ده كان عن Deepgram (محرك «المسح») وبيظهر في كل تفريغ «كامل ⚡».
        هنا: السيرفر قال إن الحقول مش من كوهير، أو كوهير ماتنداش خالص (`cohere_calls = 0`)
        مع إن فيه لوحات — ده العلامة الوحيدة إن كوهير واقع (بيرجّع فاضي من غير غلط).
      */}
      {witnessUsed === false && (
        <div className="card border-amber-400/40 bg-amber-500/[0.08]">
          <div className="card-title text-amber-200">
            {advanced ? "⚠️ النوع والملاحظة ماجوش من كوهير" : "⚠️ النوع والملاحظة ماوصلوش المرة دي"}
          </div>
          <p className="text-[11px] leading-relaxed text-amber-100/80">
            {advanced
              ? "اللوحات طلعت عادي، بس سيرفر النوع (كوهير) ماكانش شغّال وقت التفريغ — فالنوع والملاحظة ممكن يبقوا فاضيين. المقطع محفوظ: دوس «فرّغ تاني» كمان شوية."
              : "اللوحات طلعت عادي، بس النوع والملاحظة ممكن يبقوا فاضيين. المقطع محفوظ: دوس «فرّغ تاني» كمان شوية."}
          </p>
        </div>
      )}

      {/* وقت التفريغ — رقم قدام المندوب يقارن بيه بدل ما يحزر (تشخيص — للسوبر أدمن) */}
      {advanced && scanTiming && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-300">
          <span className="font-bold text-emerald-300">
            ⏱️ التفريغ خد {(scanTiming.ms / 1000).toFixed(1)} ثانية
          </span>
          <span className="text-slate-500">
            لتسجيل {scanTiming.audioSec.toFixed(1)}ث · {scanTiming.segments} مقطع ·{" "}
            {(scanTiming.ms / scanTiming.segments / 1000).toFixed(2)}ث للمقطع
          </span>
        </div>
      )}

      {/*
        ⚡ لوحات سطر اللوحات — **للقراية بس** (مراجعة ٣ أكتوبر جولة ٢ — عيب ٢ + ٣).
        أوقاتها مبدئية فمالهاش دبوس («📍 بيتحدّد…»)، ومش في الجدول اللي بيتحفظ
        ويتصدّر — ومافيش تعديل عليها لحد ما الأنواع توصل، عشان سطر «done» بيبني
        الجدول من جديد وكان بيمسح أي تعديل من غير ما المندوب يحس.
      */}
      {prelim && prelim.length > 0 && (
        <div className="card border-sky-400/30">
          <div className="card-title justify-between">
            <span className="flex items-center gap-2">
              ⚡ اللوحات طلعت
              <span className="chip bg-white/10 text-slate-300">{prelim.length}</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-normal text-sky-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              بيكمّل الأنواع…
            </span>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            الموقع والنوع بييجوا مع آخر الرد بثواني. التعديل والتصدير بيفتحوا أول ما يكمّل — عشان
            مافيش تعديل يتمسح من غير ما تحس.
          </p>
          <ul className="grid gap-1">
            {prelim.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2 py-1 text-xs"
              >
                <PlateBadge letters={e.review.letters} digits={e.review.digits} size="sm" />
                <span className="text-[11px] text-sky-300">{PIN_PENDING}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ============================================ النتائج */}
      {entries.length > 0 && (
        <div className="card">
          <div className="card-title justify-between">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-sky-300" />
              اللوحات المستخرجة
              <span className="chip bg-white/10 text-slate-300">{entries.length}</span>
            </span>

            <span className="flex flex-wrap gap-1">
              {onExportToRecords && (
                <button className="btn-primary btn-sm" onClick={() => void exportToRecords()} disabled={exporting || canStopTranscription(clips)}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                  {exporting ? "بيصدّر…" : "تصدير للسجلات"}
                </button>
              )}
              {/*
                📋 المندوب بيصدّر للسجلات بس — وصفحة السجلات فيها الفتح والمشاركة (وأقفال المجموعة
                على التنزيل بتشتغل هناك). Excel/CSV/النسخ هنا للسوبر أدمن.
              */}
              {advanced && (<>
              <button className="btn-ghost btn-sm" onClick={copyAll}>
                <Copy className="h-3.5 w-3.5" />
                انسخ الكل
              </button>
              {/* 🧮 فتح/مشاركة التطبيق — `<a download>` بتاع المعمل مابيشتغلش جوّه التطبيق */}
              <button
                className="btn-ghost btn-sm"
                onClick={() => void openEntriesExcel(entries, bank.sheet, "تفريغ_مجمع", (m) => errorLog.add("التفريغ", m))}
              >
                <Download className="h-3.5 w-3.5" />
                Excel
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => void shareEntriesExcel(entries, bank.sheet, "تفريغ_مجمع", (m) => errorLog.add("التفريغ", m))}
              >
                <Share2 className="h-3.5 w-3.5" />
                مشاركة
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => void openEntriesCsv(entries, bank.sheet, "تفريغ_مجمع", (m) => errorLog.add("التفريغ", m))}
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              </>)}

              {/*
                مسح الكل بخطوتين. الدوسة الأولى بتسأل، والتانية بتمسح.
                نتيجة المجمع تعب تسجيل كامل + عشرات الثواني تفريغ — دوسة
                غلط واحدة كانت هتضيّعها كلها.
              */}
              {confirmClear ? (
                <>
                  <button className="btn-danger btn-sm" onClick={clearAll}>
                    <Trash2 className="h-3.5 w-3.5" />
                    أيوه امسح {entries.length}
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => setConfirmClear(false)}
                  >
                    رجوع
                  </button>
                </>
              ) : (
                <button
                  className="btn-ghost btn-sm text-red-300"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  مسح الكل
                </button>
              )}
            </span>
          </div>

          {exportMsg && (
            <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              {exportMsg}
            </div>
          )}

          {/* ملخّص سريع */}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {stats.wanted > 0 && (
              <span className="chip bg-red-500/25 text-red-100">
                {stats.wanted} مطلوبة
              </span>
            )}
            {stats.near > 0 && (
              <span className="chip bg-amber-500/25 text-amber-100">
                {stats.near} قريبة من مطلوبة
              </span>
            )}
            {stats.needsLook > 0 && (
              <span className="chip bg-amber-500/20 text-amber-200">
                {stats.needsLook} محتاجة نظرة
              </span>
            )}
            {stats.corrected > 0 && (
              <span className="chip bg-sky-500/20 text-sky-200">
                {stats.corrected} اتصحّحت تلقائياً
              </span>
            )}
          </div>

          <PlateTable
            entries={entries}
            sheet={bank.sheet}
            editingId={editing}
            onEdit={(id) => setEditing((cur) => (cur === id ? null : id))}
            onEditChange={editEntry}
            onEditClose={() => setEditing(null)}
            onDelete={removeEntry}
            onAnnotate={annotateEntry}
          />
        </div>
      )}

      {/* ============================================ النص المفرّغ — تقرير التجربة للسوبر أدمن بس */}
      {advanced && transcript && (
        <div className="card">
          <div className="card-title justify-between">
            <span>📋 تقرير التفريغ (ابعته زي ما هو)</span>
            <button
              className="btn-ghost btn-sm"
              onClick={async () => {
                const report = [
                  `عدد اللوحات اللي طلعت: ${entries.length}`,
                  /**
                   * 🔴 **العدد بيجمّع كل مقاطع الجولة، والخام بيوصف الأخير
                   * لوحده.** والفرق ده لخبط المالك: سجّل ٣٠ لوحة تلات مرات
                   * فالتقرير قال «٩٠» والخام قال «٣٠ لوحة» — والاتنين صح،
                   * بس مافيش سطر يقول إن فيه تلات مقاطع. بقى فيه.
                   */
                  ...(doneClips > 1
                    ? [
                        `ℹ️ فرّغت **${doneClips} مقاطع** في الجلسة دي — ` +
                          `المعروض فوق هو **آخر مقطع** لوحده.`,
                      ]
                    : []),
                  /**
                   * 🔴 **التقرير كان بيسمّي محرك تاني.**
                   * السلسلة دي كانت بتغطّي scan/vad/fused بس، و**كل اللي
                   * غيرهم بيقع على «Whisper»** — فتقرير المالك (١٠ سبتمبر)
                   * قال «المحرك: Whisper» والفعلي كان «المقاطع». تقرير
                   * بيسمّي محرك مااشتغلش يخلّي أي تشخيص مبني عليه غلط،
                   * فبقى `engineReportLabel` بيغطّي الستة كلهم.
                   */
                  `المحرك: ${batchEngineLabel(engine, batchModelName)}`,
                  // 📍 كام لوحة خدت موقع (≤١٠٠م و≤ثانيتين من لحظة نطقها)
                  `📍 بموقع دقيق: ${entries.filter((e) => e.pin).length} من ${entries.length}`,
                  "",
                  ...entries.map(
                    (e, i) =>
                      `${i + 1}. ${e.review.plate}  (ثقة ${e.review.confidence}٪)` +
                      (e.match.kind !== "none" ? "  — مطلوبة" : "") +
                      (e.pin ? `  📍 ${pinLink(e.pin)}` : "  · من غير موقع دقيق")
                  ),
                  "",
                  "────────── الخام ──────────",
                  transcript,
                ].join("\n");
                try {
                  await navigator.clipboard.writeText(report);
                  setReportCopied(true);
                  setTimeout(() => setReportCopied(false), 2000);
                } catch {
                  errorLog.add("التصدير", "المتصفح رفض النسخ — اعمل سكرين شوت بدلها");
                }
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {reportCopied ? "اتنسخ ✓ الزقه لي" : "انسخ التقرير"}
            </button>
          </div>
          <p className="whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-sm leading-relaxed text-slate-300">
            {transcript}
          </p>
        </div>
      )}

      {/*
        التقارير وسجل الأخطاء بالتفاصيل الخام = أدوات تجربة المالك (بيبعتهم في التجربة) — للسوبر
        أدمن بس. المندوب بيشوف آخر غلط بكلامه هو بس (الميك/السيرفر/التصدير) من غير نسخ ولا تفاصيل.
      */}
      {advanced && (
        <>
          <BatchReports refreshKey={reportsKey} sheetKey={readingSheetKey} />
          <ErrorLogBox errorLog={errorLog} title="أخطاء صفحة التسجيل المجمع" />
        </>
      )}
    </div>
  );
}

/** المندوب: آخر غلط بس، بكلامه، ويتقفل — من غير نسخ ولا تفاصيل خام */
function LastErrorNote({ errorLog }: { errorLog: ErrorLog }) {
  const [items, setItems] = useState(() => errorLog.getSnapshot());
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  useEffect(() => errorLog.subscribe(() => setItems(errorLog.getSnapshot())), [errorLog]);
  const last = items[0];
  if (!last || last.id === hiddenId) return null;
  return (
    <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <span>⚠️ {last.message}</span>
      <button className="btn-ghost btn-sm" onClick={() => setHiddenId(last.id)}>
        تمام
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ مساعدات */

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function gpsShort(status: string): string {
  if (status === "denied") return "الإذن مرفوض";
  if (status === "requesting") return "بيجيب الموقع…";
  if (status === "unavailable") return "غير مدعوم";
  if (status === "error") return "خطأ";
  return "متوقف";
}

function micErrorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === "NotAllowedError")
    return "إذن الميكروفون مرفوض — لازم توافق عليه من إعدادات الموقع في المتصفح";
  if (e?.name === "NotFoundError") return "مافيش ميكروفون متاح على الجهاز";
  if (e?.name === "NotReadableError")
    return "الميكروفون مشغول ببرنامج تاني — اقفله وجرّب تاني";
  return e?.message || "ما قدرناش نفتح الميكروفون";
}

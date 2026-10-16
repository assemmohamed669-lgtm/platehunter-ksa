/**
 * ==========================================================================
 *  شارات صغيرة مشتركة: الثقة / الحالة / المطابقة / الموقع
 * ==========================================================================
 *  كلها بتتكرّر في الصفحتين، فجمعناها في ملف واحد عشان الشكل يفضل
 *  موحّد ومافيش تكرار.
 */

import { AlertTriangle, CheckCircle2, MapPin, MapPinOff, XCircle } from "lucide-react";
import type { ReviewedPlate } from "../lib/plateReview";
import type { BankMatch } from "../lib/bankSheet";
import type { GpsPin } from "../lib/gps";
import { pinLabel, pinLink } from "../lib/gps";
import { stageLabel, stageTitle, statusLabel, type PlateStage } from "../lib/plateEntry";

/* ------------------------------------------------------ مرحلة التأكيد */

/**
 * حالة اللوحة في البث الحي — **بديل نسبة الثقة**.
 *
 * ⚠️ النسبة كانت بتكذب: قراءة Deepgram اللي موديلنا لسه ماراجعهاش كانت
 * بتعرض ١٠٠٪ واللي اتفق عليها المحرّكان ٩٩٪. والمندوب بيحكم بالرقم، فالرقم
 * كان بيوجّهه للعكس.
 *
 * ومستوحاة من سلوك مقيس في تطبيق منافس: بيعرض اللوحة **الناقصة** بالأحمر
 * وبيكمّلها لما تتمّ، ومابيعرضش نسب خالص — فالمندوب عمره ما يشوف لوحة
 * كاملة الشكل وهي لسه مش جاهزة.
 */
export function StageChip({ stage }: { stage: PlateStage }) {
  /**
   * 🔴 **الأحمر كان الافتراضي لأي حالة جديدة.** فلما فصلنا «فيها حشو»
   * و«بلا مراجعة» عن «شكلها غلط»، كانوا هيفضلوا **أحمر زي ما هم** —
   * يعني الإصلاح مايبانش للمندوب. لكل حالة لونها.
   */
  const tone =
    stage === "agreed"
      ? "bg-emerald-500/20 text-emerald-200"
      : stage === "heard"
        ? "bg-amber-500/20 text-amber-200"
        : stage === "edited"
          ? "bg-sky-500/20 text-sky-200"
          : stage === "padded"
            ? "bg-orange-500/20 text-orange-200"
            : stage === "unreviewed"
              ? "bg-slate-500/25 text-slate-200"
              : stage === "conflict"
                ? "bg-amber-500/20 text-amber-200"
                : "bg-red-500/20 text-red-200";

  // النص في `plateEntry` — مختبَر، ومش نسخة تانية من نفس المنطق
  const title = stageTitle(stage);

  return (
    <span className={`chip ${tone}`} title={title}>
      {stageLabel(stage)}
    </span>
  );
}

/* ------------------------------------------------------------ الثقة */

export function ConfidenceChip({ value }: { value: number }) {
  const tone =
    value >= 90
      ? "bg-emerald-500/20 text-emerald-200"
      : value >= 55
        ? "bg-amber-500/20 text-amber-200"
        : "bg-red-500/20 text-red-200";

  return (
    <span className={`chip ltr-nums ${tone}`} title="ثقة المحرك في اللوحة">
      {value}٪
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 90 ? "bg-emerald-400" : value >= 55 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- الحالة */

export function StatusChip({ status }: { status: ReviewedPlate["status"] }) {
  if (status === "solid") {
    return (
      <span className="chip bg-emerald-500/20 text-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        {statusLabel(status)}
      </span>
    );
  }
  if (status === "review") {
    return (
      <span className="chip bg-amber-500/20 text-amber-200">
        <AlertTriangle className="h-3 w-3" />
        {statusLabel(status)}
      </span>
    );
  }
  return (
    <span className="chip bg-red-500/20 text-red-200">
      <XCircle className="h-3 w-3" />
      {statusLabel(status)}
    </span>
  );
}

/* -------------------------------------------------------- المطابقة */

export function MatchChip({ match }: { match: BankMatch }) {
  if (match.kind === "exact") {
    return (
      <span className="chip bg-red-500/25 text-red-100">
        <AlertTriangle className="h-3 w-3" />
        مطلوبة ✓
      </span>
    );
  }
  return (
    <span className="chip bg-white/10 text-slate-400">
      <CheckCircle2 className="h-3 w-3" />
      غير مطلوبة
    </span>
  );
}

/* ---------------------------------------------------------- الموقع */

export function GpsChip({ pin }: { pin: GpsPin | null }) {
  if (!pin) {
    return (
      <span className="chip bg-white/10 text-slate-500" title="مافيش قراءة موقع وقت النطق">
        <MapPinOff className="h-3 w-3" />
        بدون موقع
      </span>
    );
  }

  const href = pinLink(pin)!;
  const tone = pin.stale
    ? "bg-amber-500/20 text-amber-200"
    : "bg-sky-500/20 text-sky-200";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`chip hover:brightness-125 ${tone}`}
      title={`${pinLabel(pin)}${pin.stale ? " — القراءة قديمة" : ""}`}
    >
      <MapPin className="h-3 w-3" />
      دبوس
      {pin.stale && " (قديم)"}
    </a>
  );
}

/**
 * 🎙️ مقاطع المجمّع — تحت بعض، وقدام كل مقطع «تفريغ» (طلب المالك ٣ أكتوبر ٢٠٢٦)
 *
 * «لما المندوب يسجل كذا مقطع تظهر المقاطع دي تحت بعض وكل مقطع يبقي قدامه
 * كلمه تفريغ ولما يدوس عليها يتفرغ المقطع اللي داس عليه».
 *
 *  · المقاطع محفوظة على الجهاز (`clipStore`) — بتفضل بعد التحديث والخروج
 *    والتنقّل وبدء تسجيل جديد.
 *  · «امسح» بيسأل الأول، وبيحذّر لو المقطع لسه ماتفرّغش — مافيش حاجة
 *    بتتمسح غير بإيد المندوب.
 *  · المقطع اللي خلص بيعرض لوحاته وموقع كل لوحة (أو «من غير موقع دقيق»).
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Play, Square, Trash2, Wand2 } from "lucide-react";
import {
  MEM_ONLY_WARNING,
  canPlay,
  clipDurationSec,
  clipForRow,
  clipStatusText,
  deleteWarning,
  formatBytes,
  replaceTableWarning,
  transcribeAction,
  type StoredClip,
} from "../lib/clipStore";
import { pinLink } from "../lib/gps";
import { NO_PRECISE_PIN, PIN_MAX_ACCURACY_M } from "../lib/platePin";

export interface ClipListProps {
  clips: StoredClip[];
  /** المقطع اللي بيتسجّل دلوقتي — مدته الحيّة من العدّاد */
  recordingId: string | null;
  recordingSeconds: number;
  /** false = IndexedDB مش شغّالة ⇒ المقاطع للجلسة دي بس */
  persistent: boolean;
  storageWarn: string | null;
  /** عدد اللوحات في الجدول دلوقتي — «اعرض لوحاته» بيسأل الأول لو فيه */
  tableRows: number;
  playing: { id: string; url: string } | null;
  onTranscribe: (id: string) => void;
  onPlay: (id: string) => void;
  onShow: (id: string) => void;
  onDelete: (id: string) => void;
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const timeOf = (epoch: number) =>
  new Date(epoch).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

const dayOf = (epoch: number) => new Date(epoch).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

export default function ClipList({
  clips,
  recordingId,
  recordingSeconds,
  persistent,
  storageWarn,
  tableRows,
  playing,
  onTranscribe,
  onPlay,
  onShow,
  onDelete,
}: ClipListProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /** «اعرض لوحاته» مستني تأكيد (الجدول فيه لوحات هتتبدّل) */
  const [showAskId, setShowAskId] = useState<string | null>(null);

  if (clips.length === 0 && persistent && !storageWarn) return null;

  const today = new Date().toDateString();

  return (
    <div className="card">
      <div className="card-title justify-between">
        <span className="flex items-center gap-2">
          🎙️ المقاطع
          <span className="chip bg-white/10 text-slate-300">{clips.length}</span>
        </span>
        <span className="text-[11px] font-normal text-slate-500">
          {clips.filter((c) => c.status === "done").length} اتفرّغ ·{" "}
          {clips.filter((c) => c.status === "ready" || c.status === "interrupted").length} مستني تفريغ
        </span>
      </div>

      {!persistent && (
        <p className="mb-2 rounded-lg bg-amber-500/15 p-2 text-[11px] leading-relaxed text-amber-100">
          ⚠️ المتصفح مش سامح بالحفظ على الجهاز — المقاطع هتفضل لحد ما الصفحة تتقفل بس.
          فرّغها قبل ما تقفل.
        </p>
      )}
      {storageWarn && (
        <p className="mb-2 rounded-lg bg-amber-500/15 p-2 text-[11px] leading-relaxed text-amber-100">
          ⚠️ {storageWarn}
        </p>
      )}

      <ul className="grid gap-2">
        {clips.map((raw) => {
          // «بيسجّل» بس لو هو التسجيل الشغّال فعلاً — غير كده «اتقطع» بزراير شغّالة
          const { isRec, clip: c } = clipForRow(raw, recordingId);
          const dur = isRec ? recordingSeconds : clipDurationSec(c);
          const action = transcribeAction(c);
          const isPlaying = playing?.id === c.id;
          const open = openId === c.id && !!c.result;
          const sameDay = new Date(c.startEpoch).toDateString() === today;
          const askShow = showAskId === c.id ? replaceTableWarning(tableRows) : null;
          return (
            <li
              key={c.id}
              className={`rounded-xl border p-2.5 text-xs ${
                c.memOnly ? "border-amber-400/50 bg-amber-500/10" : "border-white/10 bg-black/25"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-slate-200">
                  <strong>{c.label}</strong>
                  <span className="ltr-nums text-slate-400">
                    {" · "}
                    {sameDay ? "" : `${dayOf(c.startEpoch)} `}
                    {timeOf(c.startEpoch)} · {mmss(dur)}
                    {isRec
                      ? c.memOnly
                        ? " · ⚠️ في الذاكرة بس"
                        : " · 💾 بيتحفظ أول بأول"
                      : c.memOnly
                        ? " · في الذاكرة"
                        : ` · ${formatBytes(c.bytes)}`}
                    {!isRec && c.source === "record" && (
                      <span title={`قراءات موقع دقتها ${PIN_MAX_ACCURACY_M}م أو أحسن`}>
                        {" · 📍 "}
                        {(c.rawFixes || []).filter((f) => f.acc <= PIN_MAX_ACCURACY_M).length} قراءة دقيقة
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-[11px] text-slate-300">
                  {isRec ? "🔴 بيسجّل…" : clipStatusText({ ...c, memOnly: false })}
                </span>
              </div>

              {/* 🔴 صوته في الذاكرة بس — المساحة مليانة (عيب ١) */}
              {c.memOnly && (
                <p className="mt-1.5 rounded-lg bg-amber-500/20 p-2 text-[11px] font-semibold leading-relaxed text-amber-100">
                  ⚠️ {MEM_ONLY_WARNING}
                </p>
              )}

              {!isRec && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    className="btn-primary btn-sm"
                    disabled={!action.enabled}
                    onClick={() => onTranscribe(c.id)}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                  {/* 🔴 (عيب ٧) صوت في الذاكرة بس (٠ بايت على الجهاز) بيتسمع برضه */}
                  <button className="btn-ghost btn-sm" onClick={() => onPlay(c.id)} disabled={!canPlay(c)}>
                    {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {isPlaying ? "اقفل" : "اسمع"}
                  </button>
                  {c.result && (
                    <>
                      <button
                        className="btn-ghost btn-sm text-sky-300"
                        onClick={() => {
                          // الجدول فيه لوحات ⇒ سؤال الأول (التعديلات اليدوية هتضيع)
                          if (replaceTableWarning(tableRows)) setShowAskId(c.id);
                          else onShow(c.id);
                        }}
                      >
                        اعرض لوحاته في الجدول
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setOpenId((cur) => (cur === c.id ? null : c.id))}
                      >
                        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        اللوحات والموقع
                      </button>
                    </>
                  )}
                  {confirmId === c.id ? (
                    <>
                      <button
                        className="btn-danger btn-sm"
                        disabled={c.status === "queued" || c.status === "working"}
                        onClick={() => {
                          setConfirmId(null);
                          onDelete(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        أيوه امسح
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                        رجوع
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn-ghost btn-sm text-red-300"
                      disabled={c.status === "queued" || c.status === "working"}
                      onClick={() => setConfirmId(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      امسح
                    </button>
                  )}
                </div>
              )}

              {confirmId === c.id && (
                <p className="mt-1.5 rounded-lg bg-red-500/10 p-2 text-[11px] leading-relaxed text-red-100">
                  {deleteWarning(c)}
                </p>
              )}

              {askShow && (
                <div className="mt-1.5 rounded-lg bg-sky-500/10 p-2 text-[11px] leading-relaxed text-sky-100">
                  <p>{askShow}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => {
                        setShowAskId(null);
                        onShow(c.id);
                      }}
                    >
                      أيوه اعرضها
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setShowAskId(null)}>
                      رجوع
                    </button>
                  </div>
                </div>
              )}

              {isPlaying && playing && <audio src={playing.url} controls autoPlay className="mt-2 w-full" />}

              {c.result?.tookSec ? (
                <p className="mt-1 text-[10px] text-slate-500">
                  التفريغ خد {c.result.tookSec.toFixed(1)}ث
                  {c.result.reportId ? " · 📊 تقريره محفوظ تحت في «التقارير»" : ""}
                </p>
              ) : null}

              {open && c.result && (
                <ul className="mt-2 grid gap-1">
                  {c.result.entries.length === 0 && (
                    <li className="text-[11px] text-slate-500">مافيش لوحات طلعت من المقطع ده.</li>
                  )}
                  {c.result.entries.map((e, i) => {
                    const link = pinLink(e.pin);
                    const miss = e.review.notes.find((n) => String(n).startsWith(NO_PRECISE_PIN));
                    return (
                      <li
                        key={e.id || `${c.id}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2 py-1"
                      >
                        <span className="text-slate-200">
                          <span className="font-bold">{e.review.plate}</span>
                          {e.vehicleType ? <span className="text-slate-400"> · {e.vehicleType}</span> : null}
                          {e.note ? <span className="text-slate-400"> · {e.note}</span> : null}
                        </span>
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="qx-accent-tx inline-flex items-center gap-0.5 text-[11px] hover:underline"
                            title={`±${Math.round(e.pin!.accuracy)}م`}
                          >
                            <MapPin className="h-3 w-3" /> الموقع (±{Math.round(e.pin!.accuracy)}م)
                          </a>
                        ) : (
                          <span className="text-[11px] text-amber-300" title={miss}>
                            {NO_PRECISE_PIN}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

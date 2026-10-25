/**
 * 🩺 سطر الصندوق الأسود لحالة صوت Voice PRO (`rv2-mic`) — ٢٥ أكتوبر ٢٠٢٦.
 *
 * مندوب أندرويد: «المايك بيقفل بعد ٣ ثواني» بـ«(السبب: الصوت اتعلّق)»، والمالك أكّد إن مفيش بلوتوث ولا سماعة ولا مكالمة.
 * كل تغيير في حالة الصوت (سياق الصوت `suspended/running` · تراك المايك `track-muted/ended`) بيتكتب: الحالة، بعد كام ثانية
 * من «ابدأ»، الصفحة ظاهرة وفي الواجهة؟ — ولما الصوت يتعلّق، الأجهزة الموجودة (عدد ونوع بس، من غير أسامي).
 * بيكتب للحسابات اللي عليها الصندوق بس (الصفحة بتسأل `diagActive` الأول). مابيرميش أبداً.
 */
import { diagNote } from "./deviceDiag";

export type MicKind = "bluetooth" | "wired" | "builtin" | "unknown";

/** نوع المايك/السماعة من اسمه — الاسم نفسه مابيتسجّلش. */
export function micKind(label?: string | null): MicKind {
  const l = String(label ?? "").toLowerCase().trim();
  if (!l) return "unknown";
  if (/bluetooth|buds|airpods|hands-?free|\bsco\b|\bbt\b/.test(l)) return "bluetooth";
  if (/usb|headset|wired|earpiece|headphone|jack/.test(l)) return "wired";
  return "builtin";
}

/** السطر نفسه — بيتنده من `onAudioState` في Voice PRO. */
export function micDiag(st: string, startedAtMs: number): Record<string, unknown> {
  const out: Record<string, unknown> = { st };
  try {
    out.s = startedAtMs ? Math.round((Date.now() - startedAtMs) / 100) / 10 : null;
    out.vis = typeof document !== "undefined" ? document.visibilityState : null;
    out.focus = typeof document !== "undefined" && typeof document.hasFocus === "function" ? document.hasFocus() : null;
  } catch { /* التشخيص عمره ما يوقّع البرنامج */ }
  if (st === "suspended" || st === "track-muted" || st === "track-ended") void noteMicDevices(st);
  return out;
}

/** الأجهزة ساعة ما الصوت اتعلّق: كام مايك وسماعة ونوعهم. */
async function noteMicDevices(at: string): Promise<void> {
  try {
    const list = await navigator.mediaDevices?.enumerateDevices?.();
    if (!list) return;
    const kinds = (k: MediaDeviceKind) => list.filter((d) => d.kind === k).map((d) => micKind(d.label));
    diagNote("rv2-mic", { st: "devices", at, inputs: kinds("audioinput"), outputs: kinds("audiooutput") });
  } catch { /* مش متاح */ }
}

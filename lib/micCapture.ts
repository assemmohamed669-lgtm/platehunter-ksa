/**
 * 🎙️ هل فيه مايك مفتوح دلوقتي في **أي** صفحة؟ — عشان «يرن حتى لو صامت» على الآيفون (`lib/alertSiren.ts`) مايلمسش نوع
 * الصوت والتسجيل شغّال (تغييره وقت التسجيل ممكن يوقفه).
 *
 * `micBusy` بيتحط من التشييك الصوتي بس — Voice PRO والمجمّع مابيحطّوهوش. فبنراقب `getUserMedia` نفسه: كل خط صوت بيتفتح
 * بنفتكره، و«مفتوح» = لسه `live` (بيبقى `ended` على طول لما الصفحة توقفه). وقبل ما أي مايك يتفتح بننده `beforeCapture`
 * (التنبيه بيرجّع نوع الصوت زي ما كان قبل ما المايك يشتغل).
 */
const tracks = new Set<MediaStreamTrack>();
const before = new Set<() => void>();
let installed = false;

/** يتنده مرة من شِلّ التطبيق (قبل أي صفحة بتسجّل). تكراره آمن. */
export function installMicCaptureWatch(): void {
  if (installed || typeof navigator === "undefined") return;
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== "function") return;
  installed = true;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    if (constraints?.audio) {
      for (const cb of Array.from(before)) { try { cb(); } catch { /* مستمع بايظ مايوقفش المايك */ } }
    }
    const stream = await orig(constraints);
    try { for (const t of stream.getAudioTracks()) tracks.add(t); } catch { /* ignore */ }
    return stream;
  };
}

/** فيه خط صوت من المايك لسه شغّال؟ */
export function isCapturingAudio(): boolean {
  for (const t of Array.from(tracks)) {
    if (t.readyState === "live") return true;
    tracks.delete(t);
  }
  return false;
}

/** بيتنده قبل ما أي مايك يتفتح. بيرجّع إلغاء الاشتراك. */
export function onBeforeCapture(cb: () => void): () => void {
  before.add(cb);
  return () => { before.delete(cb); };
}

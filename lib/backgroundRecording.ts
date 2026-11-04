/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎙️ التسجيل والتشييك يفضلوا شغّالين والمندوب برّه البرنامج — أندرويد 1.8 (٢٤ أكتوبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * المالك: «عايز المندوب لما يحب يشوف الواتس اب او يتصفح التليفون والتسجيل شغال او التشييك يفضل شغال … او عايز يفتح
 * موقع جي بي اس علي الخريطه». أندرويد بيقطع الميك عن البرنامج اللي في الخلفية — إلا لو شغّال «خدمة في المقدمة» بإشعار
 * ظاهر («🎙️ قناص بيسجّل»). الخدمة في تطبيق أندرويد 1.8 (`BackgroundRecordingService.java`)، والجسر `window.PlateHunterBg`.
 *  · من غير الجسر (التطبيق القديم · الآيفون · المتصفح) ⇒ ولا حاجة بتتغيّر.
 *  · 📞 مكالمة بدأت (أندرويد بيبعت `phNativeCall`) ⇒ الصفحة تقفل الميك — «المكالمة ليها الأولوية» (المالك ٢٣ سبتمبر).
 *  · 🟢 للكل (`BG_RECORDING_FOR_ALL`) من ٢٥ أكتوبر — اللي على أندرويد 1.8 من البلاي. الأقدم والآيفون: مفيش جسر ⇒ زي الأول.
 *
 * 🍏 **الآيفون 1.4** (المالك ٤ نوفمبر ٢٠٢٦: «عايز انزل ميزة ان الصوت يشتغل علي الايفون في فويس برو وفي التسجيل زي ما
 * بيحصل علي الاندرويد»): بلجن Capacitor «PlateHunterBackground» (`MainViewController` في `ios/App/App/AppDelegate.swift`).
 * الميك نفسه بيكمّل من إذن «الصوت في الخلفية» في Info.plist؛ البلجن بيشغّل **موقع الآيفون نفسه** وقت التسجيل (مكتبة الموقع
 * بتقف لما البرنامج يخرج ⇒ كل اللوحات كانت هتاخد آخر مكان جوّه البرنامج) وبيبعت «call» لما مكالمة تقطع الصوت.
 *  · نسخة الآيفون الأقدم (1.3) مافيهاش البلجن ⇒ ولا حاجة بتتغيّر.
 *  · 🛑 السوبر أدمن + حساب مراجعين أبل الأول (`BG_RECORDING_IOS_FOR_ALL`) — الفتح للكل من هنا من غير نسخة جديدة.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { gpsService } from "./gps";

type Bridge = { start?: (text: string) => boolean; stop?: () => void; active?: () => boolean; ios?: boolean };

/** 🍏 الآيفون للكل؟ — لأ لحد ما المالك يجرّب من TestFlight. الفتح = true (من غير نسخة جديدة). */
export const BG_RECORDING_IOS_FOR_ALL = false;
/** اسم البلجن في `AppDelegate.swift` (`jsName`) */
export const BG_IOS_PLUGIN = "PlateHunterBackground";

/** 🟢 للكل — 1.8 اتنشرت على البلاي (٢٤ أكتوبر) والمالك: «افتح التسجيل في الخلفيه للكل» (٢٥ أكتوبر ٢٠٢٦). الرجوع = false. */
export const BG_RECORDING_FOR_ALL = true;

/**
 * 🧪 حسابات بعينها شغّالة قبل الفتح للكل — حساب مراجعين جوجل (Play Console «App access»: المالك ٢٤ أكتوبر ٢٠٢٦)
 * عشان المراجع يكرّر فيديو إقرار «الخدمة في المقدمة» بنفس الحساب. حروف صغيرة.
 * + `asemafify40@gmail.com` («Test apple») — ده اللي في Play Console «Sign in details» فعلاً؛ المالك: «سيب دة» بدل ما
 *   نغيّره وسط المراجعة (٢٤ أكتوبر).
 */
export const BG_RECORDING_EMAILS: readonly string[] = ["google.review@qannas-ksa.com", "asemafify40@gmail.com"];

/** نص الإشعار الثابت وقت التسجيل */
export const BG_RECORDING_TEXT = "التسجيل شغّال — قول اللوحات عادي حتى وانت في واتساب أو الخريطة";

type Handle = { remove: () => Promise<void> };
type NativeFix = { lat: number; lng: number; accuracy: number; timestamp: number };
interface IosBgPlugin {
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  addListener(event: "location", fn: (f: NativeFix) => void): Promise<Handle>;
  addListener(event: "call", fn: () => void): Promise<Handle>;
}

let iosPlugin: IosBgPlugin | null = null;
let iosActive = false;
let iosSubs: Promise<Handle>[] = [];

/** 🍏 جسر الآيفون — نفس شكل جسر الأندرويد (`start` بيرجّع على طول؛ البلجن نفسه async) */
function iosBridge(): Bridge | null {
  try {
    if (Capacitor.getPlatform() !== "ios" || !Capacitor.isPluginAvailable(BG_IOS_PLUGIN)) return null;
    iosPlugin ??= registerPlugin<IosBgPlugin>(BG_IOS_PLUGIN);
  } catch {
    return null;
  }
  const p = iosPlugin;
  if (!p) return null;
  return {
    ios: true,
    start: () => {
      if (!iosActive) {
        iosActive = true;
        iosSubs = [
          // 📍 موقع الآيفون نفسه ⇒ نفس خدمة الموقع اللي Voice PRO والتسجيل بيقروا منها
          p.addListener("location", (f) => gpsService.feedNativeFix(f)),
          // 📞 نفس حدث الأندرويد ⇒ الصفحة تقفل الميك
          p.addListener("call", () => window.dispatchEvent(new CustomEvent("phNativeCall"))),
        ];
        for (const s of iosSubs) s.catch(() => {});
      }
      p.start().catch(() => {});
      return true;
    },
    stop: () => {
      const subs = iosSubs;
      iosSubs = [];
      iosActive = false;
      for (const s of subs) s.then((h) => h.remove()).catch(() => {});
      p.stop().catch(() => {});
    },
    active: () => iosActive,
  };
}

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { PlateHunterBg?: Bridge }).PlateHunterBg) ?? iosBridge();
}

/** ينفع التسجيل يكمّل في الخلفية على الجهاز ده ولِلحساب ده؟ */
export function canRecordInBackground(isSuper: boolean, email?: string | null): boolean {
  const listed = !!email && BG_RECORDING_EMAILS.includes(email.trim().toLowerCase());
  const b = bridge();
  if (!b?.start) return false;
  if (b.ios) return isSuper === true || BG_RECORDING_IOS_FOR_ALL || listed;
  return isSuper === true || BG_RECORDING_FOR_ALL || listed;
}

/** لما التسجيل يبدأ — `true` = الإشعار طلع والخدمة شغّالة */
export function startBackgroundRecording(text: string = BG_RECORDING_TEXT): boolean {
  try {
    return bridge()?.start?.(text) === true;
  } catch {
    return false;
  }
}

/** لما التسجيل يقف (أو الصفحة تتقفل) — الإشعار بيختفي */
export function stopBackgroundRecording(): void {
  try {
    bridge()?.stop?.();
  } catch {
    /* الجسر مش موجود/وقع — ولا حاجة */
  }
}

/** 📞 مكالمة بدأت والتسجيل شغّال (أندرويد: وضع الصوت · الآيفون: مكالمة قطعت الصوت) */
export function onNativeCall(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => fn();
  window.addEventListener("phNativeCall", h);
  return () => window.removeEventListener("phNativeCall", h);
}

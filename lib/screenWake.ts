/**
 * قفل الشاشة أثناء التسجيل الصوتي (Screen Wake Lock).
 *
 * المشكلة: المندوب بيبدأ تسجيل، وبعد شوية شاشة التليفون بتطفي لوحدها (مهلة
 * الشاشة العادية) والتسجيل بيقف. السبب إن أندرويد بيعتبر **إطفاء الشاشة**
 * إخفاءً للصفحة (`visibilitychange → hidden`)، فالحارس اللي بيفصل المايك لما
 * التطبيق يروح للخلفية — المقصود بيه المكالمة الجاية وتبديل التطبيقات —
 * بيتنفّذ كمان لما الشاشة تنام لوحدها.
 *
 * الحل: نمسك قفل شاشة طول ما التسجيل شغّال. الشاشة ماتنامش لوحدها ⇒ مافيش
 * إخفاء ⇒ التسجيل بيكمّل. (لو المندوب ضغط زر القفل بإيده، الشاشة بتقفل
 * والتسجيل بيقف — وده السلوك المقصود من الحارس.)
 *
 * الـAPI دي **اختيارية**: مش موجودة على كل ويب-ڤيو، وممكن النظام يرفض الطلب
 * (بطارية ضعيفة مثلاً). فكل حاجة هنا بتفشل بهدوء — التسجيل أهم من القفل،
 * وماينفعش غيابه يمنع المندوب من الشغل.
 */

export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: "release", listener: () => void): void;
}

export interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

export interface ScreenWake {
  /** يمسك القفل لو مش ماسكه. بيعدّي بهدوء لو الـAPI مش موجودة أو الطلب اترفض. */
  acquire(): Promise<void>;
  /** يسيب القفل لو ماسكه. آمن لو مش ماسك حاجة. */
  release(): Promise<void>;
  isHeld(): boolean;
}

export function createScreenWake(getApi: () => WakeLockLike | undefined): ScreenWake {
  let sentinel: WakeLockSentinelLike | null = null;
  let pending = false;

  return {
    async acquire() {
      if (sentinel || pending) return;
      const api = getApi();
      if (!api) return;                 // ويب-ڤيو قديم — نكمّل من غير قفل
      pending = true;
      try {
        const s = await api.request("screen");
        sentinel = s;
        // النظام بيسحب القفل لوحده أحياناً (الشاشة اتقفلت بالزرار، بطارية
        // منخفضة). لازم نعرف عشان أي `acquire` بعدها تاخد قفل جديد بدل ما
        // تفتكر إنها لسه ماسكة.
        s.addEventListener?.("release", () => { sentinel = null; });
      } catch {
        sentinel = null;                // مرفوض — التسجيل بيكمّل عادي
      } finally {
        pending = false;
      }
    },

    async release() {
      const s = sentinel;
      sentinel = null;
      if (!s) return;
      try { await s.release(); } catch { /* اتقفل خلاص */ }
    },

    isHeld() {
      return sentinel !== null;
    },
  };
}

/** المدير الافتراضي للمتصفح — بيقرا `navigator.wakeLock` وقت الطلب. */
export function browserScreenWake(): ScreenWake {
  return createScreenWake(() => {
    if (typeof navigator === "undefined") return undefined;
    return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  });
}

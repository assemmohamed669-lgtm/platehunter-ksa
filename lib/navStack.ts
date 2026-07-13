/**
 * navStack — مكدّس تنقّل داخلي بديل عن الاعتماد على window.history.back().
 *
 * السبب: في تطبيق Capacitor (WebView أندرويد) بيحمّل رابط بعيد، تاريخ المتصفح
 * الفعلي مش موثوق دايماً مع تنقّل عميق (منيو → صفحة → صفحة فرعية) — بيوصل لحالة
 * "مفيش تاريخ" ويطلّع من التطبيق بدل ما يرجع خطوة. هنا بنمسك إحنا بأيدينا قائمة
 * المسارات اللي المستخدم زارها فعلياً، وزر الرجوع (فيزيائي أو زر الهيدر) بيرجع
 * من القائمة دي مباشرة، مش من تخمين الـ WebView.
 */
export interface NavStack {
  /** يسجّل مساراً زُور فعلاً (بعد كل تغيير pathname). */
  track(path: string): void;
  /** يزيل المسار الحالي ويرجّع السابق له، أو null لو مفيش سابق متتبَّع. */
  pop(): string | null;
  /** هل فيه مسار سابق نرجع له؟ */
  canGoBack(): boolean;
}

export function createNavStack(): NavStack {
  const stack: string[] = [];
  // true لما آخر تغيير pathname يكون نتيجة pop() نفسه (router.push للمسار
  // السابق) — عشان track() اللي بعده مايضيفش المسار ده تاني كتكرار.
  let backNavigating = false;

  return {
    track(path: string) {
      if (backNavigating) { backNavigating = false; return; }
      if (stack[stack.length - 1] !== path) stack.push(path);
    },
    pop() {
      if (stack.length <= 1) return null;
      stack.pop();
      backNavigating = true;
      return stack[stack.length - 1];
    },
    canGoBack() {
      return stack.length > 1;
    },
  };
}

/** النسخة الحية الوحيدة اللي التطبيق كله بيستخدمها. */
export const navStack = createNavStack();

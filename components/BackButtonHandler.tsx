"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { runTopBackHandler } from "@/lib/backStack";
import { navStack } from "@/lib/navStack";

// Root pages where the hardware back should background the app (not navigate
// deeper). Everywhere else, back navigates within our own tracked nav stack.
// The landing page is /sorting, so it's a root too — on it, back minimizes
// the app instead of exiting.
const ROOT_PATHS = ["/", "/sorting", "/login"];

/**
 * Handles the Android hardware back button. Without this, Capacitor's default
 * exits the app because the WebView's canGoBack() doesn't reliably see SPA
 * (pushState) navigations — deep navigation (menu → صفحة → صفحة فرعية) could
 * hit a state with no perceived history and exit the app instead of going
 * back one screen. Instead of trusting the WebView's history, we track every
 * pathname change ourselves (navStack) and pop from that on back-press.
 */
export default function BackButtonHandler() {
  const pathname = usePathname();
  const router = useRouter();

  // كل تغيير مسار (تنقّل حقيقي أو نتيجة pop()) بيتسجّل في المكدّس الداخلي.
  useEffect(() => { navStack.track(pathname); }, [pathname]);

  useEffect(() => {
    let remove: (() => void) | undefined;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          // Close any open overlay (menu / modal) first.
          if (runTopBackHandler()) return;
          const path = window.location.pathname;
          if (ROOT_PATHS.includes(path)) {
            App.minimizeApp();
            return;
          }
          const prev = navStack.pop();
          // مفيش مسار متتبَّع (دخول مباشر عميق نادر) — نروح للصفحة الرئيسية
          // بدل ما نطلّع من التطبيق فجأة.
          router.push(prev ?? "/sorting");
        }).then((handle) => { remove = () => handle.remove(); })
      )
      .catch(() => { /* not running natively */ });
    return () => remove?.();
  }, [router]);

  return null;
}

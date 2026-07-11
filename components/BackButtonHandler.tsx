"use client";

import { useEffect } from "react";

// Root pages where the hardware back should background the app (not navigate
// deeper). Everywhere else, back navigates within the SPA history.
const ROOT_PATHS = ["/", "/dashboard", "/login"];

/**
 * Handles the Android hardware back button. Without this, Capacitor's default
 * exits the app because the WebView's canGoBack() doesn't see SPA (pushState)
 * navigations — so every back press killed the app. Here we intercept it and
 * call window.history.back() (which the Next router honours) instead, only
 * minimising the app when already on a root page. No-op on the web.
 */
export default function BackButtonHandler() {
  useEffect(() => {
    let remove: (() => void) | undefined;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          const path = window.location.pathname;
          if (ROOT_PATHS.includes(path)) {
            App.minimizeApp();
          } else {
            window.history.back();
          }
        }).then((handle) => { remove = () => handle.remove(); })
      )
      .catch(() => { /* not running natively */ });
    return () => remove?.();
  }, []);

  return null;
}

"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { navStack } from "@/lib/navStack";

interface Props {
  /** Where to go if there's no previous page in history (e.g. direct link/refresh). */
  fallbackHref?: string;
  label?: string;
}

/**
 * Back button for internal pages. In RTL layouts the natural "back"
 * direction is to the right (mirroring how "forward" reads right-to-left),
 * so this uses ArrowRight rather than the LTR-style ArrowLeft.
 *
 * Uses our own tracked nav stack (navStack) rather than window.history —
 * the WebView's real history isn't reliably queryable in the Capacitor app,
 * the same issue that made the hardware back button exit unexpectedly.
 * Falls back to a fixed route only when there's no tracked history.
 */
export default function BackButton({ fallbackHref = "/sorting", label = "رجوع" }: Props) {
  const router = useRouter();

  function handleBack() {
    const prev = navStack.pop();
    router.push(prev ?? fallbackHref);
  }

  return (
    <button
      onClick={handleBack}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted transition hover:text-ink"
    >
      <ArrowRight size={14} />
      <span>{label}</span>
    </button>
  );
}

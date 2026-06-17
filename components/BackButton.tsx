"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

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
 * Prefers real browser history (router.back()) so it returns exactly
 * where the agent came from — the dashboard grid, the bottom nav, or a
 * deep link — falling back to a fixed route only when there's no
 * history to go back to.
 */
export default function BackButton({ fallbackHref = "/dashboard", label = "رجوع" }: Props) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
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

"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isOled = theme === "oled";

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted transition hover:text-ink"
      aria-pressed={isOled}
      title="توفير البطارية (شاشة سوداء بالكامل)"
    >
      {isOled ? <Moon size={14} /> : <Sun size={14} />}
      <span>{isOled ? "وضع التوفير" : "الوضع العادي"}</span>
    </button>
  );
}

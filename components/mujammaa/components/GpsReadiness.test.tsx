import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * 📍 العلامة جنب زرار التسجيل + التحذير الكبير (١٩ أكتوبر ٢٠٢٦): حمرا «بيجيب الموقع…» لحد ما قراءة
 * حيّة دقيقة توصل ⇒ خضرا «الموقع جاهز ±Xم». والتحذير الكبير بيختفي لوحده أول ما الموقع يجهز.
 */
const g = vi.hoisted(() => ({
  fix: null as null | { lat: number; lng: number; accuracy: number; at: number },
  recvAt: null as number | null,
  status: "requesting" as string,
  listeners: new Set<() => void>(),
}));
vi.mock("../lib/gps", async (orig) => {
  const real = await orig<typeof import("../lib/gps")>();
  return {
    ...real,
    currentFix: () => g.fix,
    lastFixRecvAt: () => g.recvAt,
    gpsStatus: () => g.status,
    subscribeGps: (fn: () => void) => {
      g.listeners.add(fn);
      return () => g.listeners.delete(fn);
    },
  };
});

import { GpsReadyChip, GpsStartWarning } from "./GpsReadiness";

const liveFix = (accuracy: number) => {
  g.fix = { lat: 24.7, lng: 46.7, accuracy, at: Date.now() };
  g.recvAt = Date.now();
  g.status = "active";
  act(() => g.listeners.forEach((fn) => fn()));
};

beforeEach(() => {
  g.fix = null;
  g.recvAt = null;
  g.status = "requesting";
  g.listeners.clear();
});
afterEach(() => cleanup());

describe("GpsReadyChip", () => {
  it("أحمر «بيجيب الموقع…» وبعدين أخضر «الموقع جاهز ±Xم» أول ما قراءة حيّة توصل", () => {
    render(<GpsReadyChip />);
    expect(screen.getByRole("status").textContent).toBe("📍 بيجيب الموقع…");
    expect(screen.getByRole("status").className).toMatch(/red/);
    liveFix(6.4);
    expect(screen.getByRole("status").textContent).toBe("📍 الموقع جاهز ±6م");
    expect(screen.getByRole("status").className).toMatch(/emerald/);
  });

  it("الموقع وقف ⇒ بيرجع أحمر لوحده (من غير قراءة جديدة تحرّكه)", () => {
    vi.useFakeTimers();
    try {
      render(<GpsReadyChip />);
      liveFix(8);
      expect(screen.getByRole("status").textContent).toMatch(/جاهز/);
      act(() => vi.advanceTimersByTime(7_000));
      expect(screen.getByRole("status").textContent).toBe("📍 بيجيب الموقع…");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GpsStartWarning", () => {
  it("كبير وواضح لحد ما الموقع يجهز — وبعدها بيختفي وبيبلّغ", () => {
    const onReady = vi.fn();
    render(<GpsStartWarning onReady={onReady} />);
    expect(screen.getByRole("alert").textContent).toMatch(/الموقع لسه مش جاهز/);
    expect(onReady).not.toHaveBeenCalled();
    liveFix(9);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * 📍 **الموقع يصحى من أول ما البرنامج يفتح — للي يقدر يستخدم المجمّع بس** (١٩ أكتوبر ٢٠٢٦).
 *
 * لوحة المالك اتفرّغت من غير موقع: فتح «التسجيل» وداس على طول والـGPS لسه بيصحى (بارد) — المناديب
 * (`role: agent`) موقعهم شغّال من أول البرنامج أصلاً (`AgentPresenceReporter`)، بس السوبر أدمن لأ.
 * ⇒ خدمة موقع التطبيق نفسها (`gpsService` — مش مراقبة جديدة) تشتغل من أول الفتح لـ`canUseMujammaa` بس
 * (دلوقتي السوبر أدمن — `MUJAMMAA_FOR_DELEGATES=false`). مابتطلبش إذن جديد غير اللي التطبيق بيطلبه.
 */
const svc = vi.hoisted(() => ({ start: vi.fn(() => Promise.resolve()), stop: vi.fn() }));
vi.mock("@/lib/gps", () => ({ gpsService: { startTracking: svc.start, stopTracking: svc.stop } }));

import MujammaaGpsWarmup from "@/components/MujammaaGpsWarmup";

afterEach(() => {
  cleanup();
  svc.start.mockClear();
  svc.stop.mockClear();
});

describe("MujammaaGpsWarmup", () => {
  it("مقفول (مندوب من غير المجمّع) ⇒ ولا حاجة", () => {
    const { unmount } = render(<MujammaaGpsWarmup enabled={false} />);
    unmount();
    expect(svc.start).not.toHaveBeenCalled();
    expect(svc.stop).not.toHaveBeenCalled();
  });

  it("مفتوح ⇒ الموقع يشتغل مرة، ويتقفل مع قفل البرنامج (العدّاد متوازن)", () => {
    const { unmount } = render(<MujammaaGpsWarmup enabled />);
    expect(svc.start).toHaveBeenCalledTimes(1);
    unmount();
    expect(svc.stop).toHaveBeenCalledTimes(1);
  });
});

describe("الربط في اللياوت", () => {
  const SRC = readFileSync(join(process.cwd(), "app", "(app)", "layout.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("بيشتغل بـ`canUseMujammaa` بس (نفس قفل المجمّع) — مش لكل المناديب", () => {
    expect(SRC).toMatch(/import MujammaaGpsWarmup from "@\/components\/MujammaaGpsWarmup"/);
    expect(SRC).toMatch(/import \{ canUseMujammaa \} from "@\/lib\/mujammaaAccess"/);
    expect(SRC).toMatch(/setMjGpsWarm\(canUseMujammaa\(rp\)\)/);
    expect(SRC).toMatch(/<MujammaaGpsWarmup enabled=\{mjGpsWarm\} \/>/);
  });
});

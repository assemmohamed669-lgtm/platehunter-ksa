/**
 * 👁️ «زي المندوب» للسوبر أدمن — `lib/mujammaaPreview.ts` (١٨ أكتوبر ٢٠٢٦). الافتراضي «زي المندوب»
 * لحد ما المالك يقول «رجّع» (المالك: «اظهر ليا انا بس اللي هيظهر للمناديب وبعدين ابقي رجع تاني»).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_PREVIEW_DEFAULT, AGENT_PREVIEW_KEY, loadAgentPreview, saveAgentPreview } from "@/lib/mujammaaPreview";

describe("mujammaaPreview", () => {
  beforeEach(() => localStorage.clear());

  it("بعد الفتح (١٩ أكتوبر) الافتراضي رجع أدوات السوبر أدمن كلها — «وبعدين ابقي رجع تاني التقارير وكل حاجه»", () => {
    expect(AGENT_PREVIEW_DEFAULT).toBe(false);
    expect(loadAgentPreview()).toBe(false);
  });

  it("الاختيار بيتحفظ", () => {
    saveAgentPreview(false);
    expect(localStorage.getItem(AGENT_PREVIEW_KEY)).toBe("0");
    expect(loadAgentPreview()).toBe(false);
    saveAgentPreview(true);
    expect(loadAgentPreview()).toBe(true);
  });

  it("تخزين مقفول ⇒ الافتراضي ومابيوقّعش", () => {
    const g = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const s = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadAgentPreview()).toBe(AGENT_PREVIEW_DEFAULT);
    expect(() => saveAgentPreview(false)).not.toThrow();
    g.mockRestore();
    s.mockRestore();
  });
});

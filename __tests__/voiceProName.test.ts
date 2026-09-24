import { describe, it, expect } from "vitest";
import { voiceProNames } from "@/lib/voiceProName";

/**
 * 🏷️ المالك (٢٤ سبتمبر): «عايزك تغيّرلي اسم الصفحة من الجديد إلى Voice PRO».
 * للكل بعد تجربة المالك كسوبر أدمن.
 */
describe("voiceProNames", () => {
  it("🔴 السوبر أدمن ⇒ Voice PRO في كل مكان", () => {
    const n = voiceProNames(true);
    expect(n.tab).toBe("Voice PRO");
    expect(n.title).toBe("Voice PRO");
    expect(n.menu).toBe("Voice PRO");
    expect(n.share).toBe("لوحات Voice PRO");
  });
  it("🔴 للكل ⇒ Voice PRO (المالك: «يلا ارفع»)", () => {
    const n = voiceProNames(false);
    expect(n.tab).toBe("Voice PRO");
    expect(n.title).toBe("Voice PRO");
    expect(n.menu).toBe("Voice PRO");
    expect(n.share).toBe("لوحات Voice PRO");
  });
});

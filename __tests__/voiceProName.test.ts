import { describe, it, expect } from "vitest";
import { voiceProNames } from "@/lib/voiceProName";

/**
 * 🏷️ المالك (٢٤ سبتمبر): «عايزك تغيّرلي اسم الصفحة من الجديد إلى Voice PRO».
 * 🔒 السوبر أدمن الأول (قاعدته: «متنشرش التعديل غير للسوبر أدمن») — الباقي «الجديد» زي ما هو.
 */
describe("voiceProNames", () => {
  it("🔴 السوبر أدمن ⇒ Voice PRO في كل مكان", () => {
    const n = voiceProNames(true);
    expect(n.tab).toBe("Voice PRO");
    expect(n.title).toBe("Voice PRO");
    expect(n.menu).toBe("Voice PRO");
    expect(n.share).toBe("لوحات Voice PRO");
  });
  it("🔴 باقي المناديب ⇒ الأسامي القديمة بالحرف", () => {
    const n = voiceProNames(false);
    expect(n.tab).toBe("الجديد");
    expect(n.title).toBe("التسجيل الجديد");
    expect(n.menu).toBe("التسجيل الجديد (تجربة)");
    expect(n.share).toBe("لوحات التسجيل الجديد");
  });
});

import { describe, it, expect } from "vitest";
import { voiceProTable } from "@/lib/voiceProTable";

/**
 * 🗑️ جدول Voice PRO — المالك (٢٧ سبتمبر ٢٠٢٦): «إلغاء الترقيم في صفحة voice pro،
 * وبدّل لوجو المسح اللي قدام (x) لشكل لوجو سلة حذف صغيرة».
 * 🔒 السوبر أدمن الأول — الباقي زي ما هو بالحرف لحد ما المالك يجرّب.
 */
describe("voiceProTable", () => {
  it("السوبر أدمن: من غير ترقيم، والمسح سلة", () => {
    expect(voiceProTable(true)).toEqual({ rowNumbers: false, deleteIcon: "trash" });
  });

  it("غير السوبر أدمن: زي ما هو — ترقيم وعلامة ×", () => {
    expect(voiceProTable(false)).toEqual({ rowNumbers: true, deleteIcon: "x" });
  });
});

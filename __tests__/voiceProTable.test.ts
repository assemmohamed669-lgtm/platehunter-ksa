import { describe, it, expect } from "vitest";
import { voiceProTable } from "@/lib/voiceProTable";

/**
 * 🗑️ جدول Voice PRO — المالك (٢٧ سبتمبر ٢٠٢٦): «إلغاء الترقيم في صفحة voice pro،
 * وبدّل لوجو المسح اللي قدام (x) لشكل لوجو سلة حذف صغيرة».
 * 🔓 للكل — المالك جرّبه كسوبر أدمن وقال «انشره للكل».
 */
describe("voiceProTable", () => {
  it("السوبر أدمن: من غير ترقيم، والمسح سلة", () => {
    expect(voiceProTable(true)).toEqual({ rowNumbers: false, deleteIcon: "trash" });
  });

  it("للكل (المالك جرّبه كسوبر أدمن وقال «انشره للكل»): من غير ترقيم، والمسح سلة", () => {
    expect(voiceProTable(false)).toEqual({ rowNumbers: false, deleteIcon: "trash" });
  });
});

import { describe, it, expect } from "vitest";
import { voiceProTable } from "@/lib/voiceProTable";

/**
 * 🗑️ جدول Voice PRO — المالك (٢٧ سبتمبر ٢٠٢٦): «إلغاء الترقيم في صفحة voice pro،
 * وبدّل لوجو المسح اللي قدام (x) لشكل لوجو سلة حذف صغيرة».
 * 🔓 للكل — المالك جرّبه كسوبر أدمن وقال «انشره للكل».
 */
describe("voiceProTable", () => {
  it("السوبر أدمن: من غير ترقيم، والمسح سلة", () => {
    expect(voiceProTable(true)).toMatchObject({ rowNumbers: false, deleteIcon: "trash" });
  });

  it("للكل (المالك جرّبه كسوبر أدمن وقال «انشره للكل»): من غير ترقيم، والمسح سلة", () => {
    expect(voiceProTable(false)).toMatchObject({ rowNumbers: false, deleteIcon: "trash" });
  });

  /**
   * 🔢 المالك: «الترقيم اللي جنب اللوحة تمام اتشال، بس أنا عايز عدد اللوحات
   * اللي بتتشيّك يظهر فوق في المربّع» — العدّاد كان رقم رمادي صغير من غير كلمة.
   * 🔓 للكل على طول بأمر المالك.
   */
  it("🔢 السوبر أدمن: عدد اللوحات واضح بكلمة فوق", () => {
    expect(voiceProTable(true).plateCount).toBe("labeled");
  });

  it("🔢 للكل على طول (المالك: «ارفعه للكل على طول»): عدد اللوحات واضح بكلمة فوق", () => {
    expect(voiceProTable(false).plateCount).toBe("labeled");
  });
});

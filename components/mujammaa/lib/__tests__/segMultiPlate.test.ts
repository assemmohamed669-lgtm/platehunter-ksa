/**
 * محرّك «موديل المقاطع» بيرجّع كل اللوحات في نص واحد مفصولة بمسافة
 * ("ددب9926 رمل4759 …"). الصفحة بتعتمد على extractPlates إنها تطلّعهم كلهم
 * وتدخّلهم واحدة واحدة. الاختبار ده بيحرس السلوك ده — لو parseSaudiPlates
 * وقع لوحة، المحرّك الجديد بيضيّع لوحات صامتة.
 */
import { describe, it, expect } from "vitest";
import { extractPlates } from "../plateReview";

describe("موديل المقاطع — استخراج لوحات متعددة من رد واحد", () => {
  it("بيطلّع كل اللوحات المطبّعة المفصولة بمسافة", () => {
    const resp = "ددب9926 رمل4759 رام1481 ررك8036 سسب9820 سرم2106 سسب9788";
    const plates = extractPlates(resp);
    const norm = plates.map((p) => p.plate.replace(/\s+/g, ""));
    for (const want of resp.split(" ")) {
      expect(norm).toContain(want);
    }
    expect(plates.length).toBeGreaterThanOrEqual(7);
  });

  it("لوحة واحدة برضه بتطلع", () => {
    const plates = extractPlates("ابح1234");
    expect(plates.length).toBe(1);
    expect(plates[0].plate.replace(/\s+/g, "")).toBe("ابح1234");
  });
});

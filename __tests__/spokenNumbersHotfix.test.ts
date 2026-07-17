import { describe, it, expect } from "vitest";
import { parsePlateFromTranscript, extractMultiplePlates } from "@/lib/plateParser";

// لوحة من إملاء ٤ أرقام: "حاء ميم دال <d1> <d2> <d3> <d4>" → حمد####
const plateOf = (digitsSpoken: string): string =>
  parsePlateFromTranscript(`حاء ميم دال ${digitsSpoken}`).plate;

describe("hotfix صيغ الأرقام المنطوقة (ة / ه / مجرّد)", () => {
  it("المثال الحي: «حاء ميم دال واحد اتنين تلاته اربعه» → حمد1234", () => {
    expect(parsePlateFromTranscript("حاء ميم دال واحد اتنين تلاته اربعه").plate).toBe("حمد1234");
    expect(extractMultiplePlates("حاء ميم دال واحد اتنين تلاته اربعه")[0]?.plate).toBe("حمد1234");
  });

  it("٤ بكل صيغها (اربعه كانت بتضيع)", () => {
    expect(plateOf("اربعة اربعه أربعه ربعه")).toBe("حمد4444");
    expect(plateOf("أربعة أربع اربع ربعة")).toBe("حمد4444");
  });

  it("٨ بكل صيغها (تمنيه كانت بتضيع)", () => {
    expect(plateOf("ثمانية تمانيه تمنيه ثمانيه")).toBe("حمد8888");
    expect(plateOf("تمنية تمانية تماني تمان")).toBe("حمد8888");
  });

  it("١ (واحد/وحده فقط — واحده/واحدة اتشالوا لتجنّب اللوحات الوهمية)", () => {
    expect(plateOf("واحد وحده واحد وحده")).toBe("حمد1111");
  });

  it("لوحة كاملة بالهاء: «خمسه سته سبعه تمنيه» → حمد5678", () => {
    expect(parsePlateFromTranscript("حاء ميم دال خمسه سته سبعه تمنيه").plate).toBe("حمد5678");
  });

  it("regression: الصيغ القديمة (ة + هـ الشغّالة + مجرّد) لسه سليمة", () => {
    expect(plateOf("خمسة ستة سبعة تسعة")).toBe("حمد5679");   // ة
    expect(plateOf("خمسه سته سبعه تسعه")).toBe("حمد5679");   // ه (كانت شغّالة)
    expect(plateOf("تلاتة اربعة خمس ست")).toBe("حمد3456");   // مزيج
    expect(plateOf("تلاته خمسه سبعه تسعه")).toBe("حمد3579");  // ه
  });

  it("regression: صفر واتنين زي ما هم", () => {
    expect(plateOf("صفر اتنين صفر اثنين")).toBe("حمد0202");
  });
});

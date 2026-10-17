/**
 * ==========================================================================
 *  اختبار تكامل — السلسلة كلها مع بعض
 * ==========================================================================
 *  الاختبارات التانية بتفحص كل قطعة لوحدها. الاختبار ده بيمثّل سيناريو
 *  حقيقي كامل زي ما بيحصل في الشارع:
 *
 *   شيت بنك مرفوع → مندوب بينطق ٤ لوحات بسرعة → محرك الصوت غلط في حرف
 *   → الطبقات بتصحّح → المطابقة بتشتغل → التصدير بيطلع صف كامل
 *
 *  الاختبار ده هو اللي يمسك لو حد فك التوصيل بين قطعتين وهو بيعدّل.
 */

import { describe, it, expect } from "vitest";
import { buildBankSheet, matchInBankSheet, type BankRow } from "../bankSheet";
import { extractPlates } from "../plateReview";
import { buildExportRows, makePlateEntry } from "../plateEntry";
import type { GpsPin } from "../gps";

/* ------------------------------------------------ شيت بنك زي الحقيقي */

const HEADERS = ["رقم اللوحة", "طراز المركبة", "صانع المركبة", "لون المركبة", "البنك"];

const ROWS: BankRow[] = [
  {
    "رقم اللوحة": "ح ب ك 5212",
    "طراز المركبة": "كامري",
    "صانع المركبة": "تويوتا",
    "لون المركبة": "أبيض",
    البنك: "الأهلي",
  },
  {
    "رقم اللوحة": "أ د س 6238",
    "طراز المركبة": "النترا",
    "صانع المركبة": "هيونداي",
    "لون المركبة": "رمادي",
    البنك: "الراجحي",
  },
  {
    // لوحة بنكية إنجليزية بالتخطيط اللاتيني (أرقام ثم حروف) — حروفها تتعكس
    "رقم اللوحة": "7709 ABS",
    "طراز المركبة": "أكسنت",
    "صانع المركبة": "هيونداي",
    "لون المركبة": "أزرق",
    البنك: "الإنماء",
  },
];

const sheet = buildBankSheet(HEADERS, ROWS, {
  fileName: "إحالة البنك.xlsx",
  sheetName: "إحالة",
});

const FAKE_PIN: GpsPin = {
  lat: 24.712345,
  lng: 46.6753,
  accuracy: 8,
  at: 1_700_000_000_000,
  ageMs: 1200,
  stale: false,
};

describe("سيناريو كامل: مندوب بينطق لوحات والشيت مرفوع", () => {
  it("الشيت اتقرا صح والتخطيط اللاتيني اتعكس", () => {
    expect(sheet.plateColumn).toBe("رقم اللوحة");
    expect(sheet.plates.sort()).toEqual(["ادس6238", "حبك5212", "سبا7709"].sort());
  });

  it("سرد سريع لأربع لوحات: تلاتة مطلوبة وواحدة لأ", () => {
    // المندوب بينطق بسرعة بدون توقف. لاحظ:
    //  - أول لوحة بأسماء حروف مختصرة
    //  - تانية بحروف مفردة
    //  - تالتة أرقامها مركّبة («سبعة آلاف وسبعمية وتسعة»)
    //  - رابعة مش في الشيت
    const spoken =
      "حا با كاف خمسة اتنين واحد اتنين " +
      "أ د س ستة اتنين تلاتة تمانية " +
      "سين باء ألف سبعة آلاف وسبعمية وتسعة " +
      "نون واو ياء تسعة تسعة تسعة تسعة";

    const plates = extractPlates(spoken, { vocabulary: sheet.plates });

    expect(plates.map((p) => p.plate)).toEqual([
      "حبك5212",
      "ادس6238",
      "سبا7709",
      "نوي9999",
    ]);

    const matches = plates.map((p) => matchInBankSheet(sheet, p.plate));
    expect(matches.map((m) => m.kind)).toEqual(["exact", "exact", "exact", "none"]);

    // تفاصيل السيارة وصلت من الشيت
    expect(matches[0].row?.["طراز المركبة"]).toBe("كامري");
    expect(matches[2].row?.["البنك"]).toBe("الإنماء");
  });

  it("محرك الصوت غلط في حرف مستحيل → الطبقة ١ تصحّح والطبقة ٣ تأكّد", () => {
    // «جيم» مستحيلة على لوحة سعودية. الطبقة ١ بتحوّلها «ح»،
    // فتطلع «حبك5212» وهي فعلاً في الشيت → تأكيد قوي.
    const [plate] = extractPlates("جيم باء كاف خمسة اتنين واحد اتنين", {
      vocabulary: sheet.plates,
    });

    expect(plate.heardPlate).toBe("جبك5212");
    expect(plate.plate).toBe("حبك5212");
    expect(plate.corrections[0]).toMatchObject({ from: "ج", to: "ح" });
    expect(plate.confidence).toBeGreaterThanOrEqual(99);
    expect(matchInBankSheet(sheet, plate.plate).kind).toBe("exact");
  });

  it("خطأ في رقم → الطبقة ٣ تصحّحه من الشيت", () => {
    // «تاء» مستحيلة → الطبقة ١ تعمل «ط» فتطلع «طبك5212» وثقتها تنزل.
    // الشيت فيه «حبك5212» على مسافة حرف واحد ومافيش غيرها قريبة → تتصحّح.
    const [plate] = extractPlates("تاء باء كاف خمسة اتنين واحد اتنين", {
      vocabulary: sheet.plates,
    });

    expect(plate.plate).toBe("حبك5212");
    expect(plate.notes.join(" ")).toContain("بتوجيه من شيت البنك");
    expect(matchInBankSheet(sheet, plate.plate).kind).toBe("exact");
  });

  it("لوحة سليمة مش في الشيت ما تتجرّش لأقرب لوحة", () => {
    const [plate] = extractPlates("نون واو ياء تسعة تسعة تسعة تسعة", {
      vocabulary: sheet.plates,
    });
    expect(plate.plate).toBe("نوي9999");
    expect(plate.confidence).toBe(100);
    expect(matchInBankSheet(sheet, plate.plate).kind).toBe("none");
  });

  it("كلام عادي بين اللوحات ما يطلّعش لوحات وهمية", () => {
    const spoken =
      "لا والله يا أستاذ الشارع ده مافيهوش حاجة " +
      "أ ب ح 1234 " +
      "خلاص يلا نمشي";

    const plates = extractPlates(spoken, { vocabulary: sheet.plates });
    expect(plates.map((p) => p.plate)).toEqual(["ابح1234"]);
  });
});

describe("التصدير — الصف بيجمّع كل حاجة", () => {
  it("صف التصدير فيه اللوحة والتفاصيل والدبوس", () => {
    const [review] = extractPlates("حا با كاف خمسة اتنين واحد اتنين", {
      vocabulary: sheet.plates,
    });
    const match = matchInBankSheet(sheet, review.plate);
    const entry = makePlateEntry({
      review,
      pin: FAKE_PIN,
      match,
      source: "live",
      capturedAt: FAKE_PIN.at,
    });

    const [row] = buildExportRows([entry], sheet);

    expect(row["اللوحة كاملة"]).toBe("حبك5212");
    expect(row["شيت البنك"]).toBe("مطلوبة ✓");
    expect(row["دبوس الموقع"]).toContain("google.com/maps");
    expect(row["خط العرض"]).toBe("24.712345");
    expect(row["دقة الموقع (م)"]).toBe("8");
    expect(row["الموقع قديم؟"]).toBe("لا");
    expect(row["تفاصيل السيارة"]).toContain("كامري");
    // أعمدة الشيت بتتفرد كأعمدة مستقلة كذلك عشان الفرز في Excel
    expect(row["[شيت] صانع المركبة"]).toBe("تويوتا");
    expect(row["[شيت] البنك"]).toBe("الأهلي");
  });

  it("لوحة بلا موقع بتتصدّر بلا كراش", () => {
    const [review] = extractPlates("أ ب ح 1234");
    const entry = makePlateEntry({
      review,
      pin: null,
      match: matchInBankSheet(sheet, review.plate),
      source: "batch",
    });

    const [row] = buildExportRows([entry], sheet);
    expect(row["دبوس الموقع"]).toBe("");
    expect(row["الموقع قديم؟"]).toBe("بدون موقع");
    expect(row["شيت البنك"]).toBe("غير مطلوبة");
  });

  it("التصدير بيشتغل بدون شيت بنك خالص", () => {
    const [review] = extractPlates("أ ب ح 1234");
    const entry = makePlateEntry({
      review,
      pin: FAKE_PIN,
      match: { kind: "none", similarity: 0 },
      source: "batch",
    });

    const [row] = buildExportRows([entry], null);
    expect(row["اللوحة كاملة"]).toBe("ابح1234");
    expect(row["تفاصيل السيارة"]).toBe("");
  });
});

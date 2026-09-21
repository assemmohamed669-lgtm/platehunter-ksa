/**
 * اختيار صف العناوين في ملف الإحالة.
 *
 * **الحادثة (محفظة «التيسير المؤتمن الاول»، ٢٠٢٦-٠٩-٢١):** عمود اللوحة في
 * المحفظة **مالوش عنوان** — الخانة فاضية. فصف العناوين الحقيقي فيه ١٦ خانة
 * مليانة وكل صف بيانات فيه ١٧، والاختيار كان «أكتر صف مليان» ⇒ **أول صف
 * بيانات بقى العناوين**، ولوحته (ب ط م 3191) اتاكلت كاسم عمود واختفت من
 * الفرز خالص. عربية مطلوبة بتضيع في صمت.
 *
 * القاعدة الجديدة: أقرب صف كثافته ≥٩٠٪ من أعلى كثافة — فخانة فاضية أو اتنين
 * في العناوين مابيخسّروهاش، والصف اللي فوق الجدول (عنوان/تعليمات، خانة أو
 * اتنين) لسه بعيد عن العتبة.
 */
import { describe, it, expect } from "vitest";
import { pickDenseHeaderRow } from "@/lib/headerRow";

const row = (...cells: string[]) => cells;

describe("pickDenseHeaderRow", () => {
  it("**الحادثة**: عنوان فيه خانة فاضية مايخسرش قدام صفوف الداتا", () => {
    const rows = [
      row("LOANNO", "المنطقة", "حالة الحساب", "", "نوع التسجيل"),      // ٤ مليانة
      row("F-E-36476", "EAST", "Open", "ب ط م 3191", "نقل خاص"),        // ٥
      row("F-E-36477", "EAST", "Open", "ب ط م 3192", "نقل خاص"),        // ٥
    ];
    expect(pickDenseHeaderRow(rows)).toBe(0);
  });

  it("العناوين الكاملة بتفوز عادي", () => {
    const rows = [
      row("رقم اللوحة", "الحي", "اللون"),
      row("ابح1234", "النسيم", "ابيض"),
    ];
    expect(pickDenseHeaderRow(rows)).toBe(0);
  });

  it("صف عنوان/تعليمات فوق الجدول بيتخطّى (خانة واحدة)", () => {
    const rows = [
      row("كشف المطلوبين لشهر ٩", "", "", ""),
      row("رقم اللوحة", "الحي", "اللون", "الموديل"),
      row("ابح1234", "النسيم", "ابيض", "2020"),
    ];
    expect(pickDenseHeaderRow(rows)).toBe(1);
  });

  it("سطرين إيميل/تعليمات فوق الجدول", () => {
    const rows = [
      row("من: البنك", ""),
      row("برجاء السحب", "", ""),
      row("رقم اللوحة", "الحي", "اللون", "الموديل", "السنة"),
      row("ابح1234", "النسيم", "ابيض", "كامري", "2020"),
    ];
    expect(pickDenseHeaderRow(rows)).toBe(2);
  });

  it("عنوان ناقص خانتين من عشرين لسه بيفوز (٩٠٪)", () => {
    const hdr = Array.from({ length: 20 }, (_, i) => (i < 18 ? `ع${i}` : ""));
    const data = Array.from({ length: 20 }, (_, i) => `د${i}`);
    expect(pickDenseHeaderRow([hdr, data, data])).toBe(0);
  });

  it("عنوان ناقص نص أعمدته مابياخدهاش — الصف ده مش عناوين", () => {
    const hdr = Array.from({ length: 20 }, (_, i) => (i < 10 ? `ع${i}` : ""));
    const data = Array.from({ length: 20 }, (_, i) => `د${i}`);
    expect(pickDenseHeaderRow([hdr, data, data])).toBe(1);
  });

  it("شيت بلا عناوين خالص — بيرجّع أول صف وسيبه للكاشف التاني", () => {
    const rows = [row("ابح1234", "النسيم"), row("دهو5678", "الملز")];
    expect(pickDenseHeaderRow(rows)).toBe(0);
  });

  it("بيقف عند حد المسح — جدول تاني مدفون بعدين مابياخدش العناوين", () => {
    const rows: string[][] = [];
    rows.push(row("رقم اللوحة", "الحي", ""));
    for (let i = 0; i < 80; i++) rows.push(row(`ابح${1000 + i}`, "النسيم", "ابيض"));
    rows.push(row("جدول", "تاني", "مدفون", "أوسع", "بكتير", "أوي"));
    expect(pickDenseHeaderRow(rows, 50)).toBe(0);
  });

  it("قايمة فاضية", () => {
    expect(pickDenseHeaderRow([])).toBe(0);
  });
});

// ── عمود اللوحة بلا عنوان لازم يفضل ──
import { readFileSync, existsSync } from "node:fs";
import { parseExcelFile } from "@/lib/excel";
import * as XLSX from "xlsx";
import { detectPlateColumn, detectArabicPlateColumn } from "@/lib/plateParser";

/** محفظة بنفس شكل «التيسير»: عمود اللوحة بلا عنوان، وعمود LOANNO قبله. */
function walletWithUnnamedPlateCol(): File {
  const aoa: (string | number)[][] = [
    ["LOANNO", "المنطقة", "حالة الحساب", "", "نوع التسجيل"],
    ["F-E-36476", "EAST", "Open", "ب ط م 3191", "نقل خاص"],
    ["F-E-36477", "EAST", "Open", "ب ط م 3192", "نقل خاص"],
    ["F-C-38045", "CENT", "Open", "ر ل د 6202", "خاص"],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "محفظة");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([out], "w.xlsx");
}

describe("محفظة عمود لوحاتها بلا عنوان", () => {
  it("صف العناوين الحقيقي بيتاخد — أول لوحة ماتتاكلش كاسم عمود", async () => {
    const t = await parseExcelFile(walletWithUnnamedPlateCol());
    expect(t.rows).toHaveLength(3);                 // مش 2
    expect(t.headers[0]).toBe("LOANNO");
  });

  it("العمود بلا عنوان بيفضل وبياخد اسم «رقم اللوحة»", async () => {
    const t = await parseExcelFile(walletWithUnnamedPlateCol());
    expect(t.headers).toContain("رقم اللوحة");
  });

  it("كشف عمود اللوحة بيقع عليه — مش على LOANNO", async () => {
    const t = await parseExcelFile(walletWithUnnamedPlateCol());
    const col = detectArabicPlateColumn(t.headers) ?? detectPlateColumn(t.headers, t.rows);
    expect(col).toBe("رقم اللوحة");
    expect(t.rows.map((r) => r[col as string])).toEqual(["ب ط م 3191", "ب ط م 3192", "ر ل د 6202"]);
  });

  it("أول عربية في المحفظة موجودة — دي كانت بتضيع في صمت", async () => {
    const t = await parseExcelFile(walletWithUnnamedPlateCol());
    expect(JSON.stringify(t.rows)).toContain("ب ط م 3191");
  });
});

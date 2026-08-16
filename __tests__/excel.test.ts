import { describe, it, expect } from "vitest";
import { toSafeCacheFilename, buildCsvBlob, buildSpreadsheetBlob, bytesToBase64, blobToBase64, buildRowSummaryText, buildColoredSortExcel, contentTypeForFilename } from "@/lib/excel";

describe("buildColoredSortExcel — hyperlink الـGPS جوّه الملف قابل للفتح", () => {
  it("يكتب Target نضيف (بدون &amp;) للرابط المشفّر مزدوجاً — round-trip", { timeout: 30_000 }, async () => {
    const blob = await buildColoredSortExcel(
      [{
        "رقم اللوحة": "سبك2198",
        "GPS": "https://www.google.com/maps/dir/?api=1&amp;amp;destination=21.594202,39.194509",
      }],
      "نتيجة",
      [null],
    );
    const buf = await blob.arrayBuffer();
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    // الصف 1 هيدر، الصف 2 الداتا؛ عمود GPS = التاني
    const cell = ws.getRow(2).getCell(2);
    const val = cell.value as { text?: string; hyperlink?: string } | null;
    expect(val?.hyperlink).toBe("https://www.google.com/maps?q=21.594202,39.194509");
    expect(val?.hyperlink ?? "").not.toContain("&amp;");
  });
});

describe("buildRowSummaryText — تنظيف روابط GPS", () => {
  it("ينضّف GPS بـ& مشفّرة مزدوجة لرابط قابل للفتح", () => {
    const text = buildRowSummaryText({
      "رقم اللوحة": "سبك2198",
      "GPS": "https://www.google.com/maps/dir/?api=1&amp;amp;destination=21.594202,39.194509",
      "الحالة": "مطلوبة",
    });
    expect(text).toContain("GPS: https://www.google.com/maps?q=21.594202,39.194509");
    expect(text).not.toContain("&amp;");
    expect(text).toContain("رقم اللوحة: سبك2198");
    expect(text).toContain("الحالة: مطلوبة");
  });
  it("يسيب النص العادي زي ما هو", () => {
    expect(buildRowSummaryText({ "اللون": "أبيض" })).toBe("اللون: أبيض");
  });
});

describe("bytesToBase64", () => {
  it("encodes an empty array as an empty string", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
  });

  it("matches the reference byte-by-byte encoding for small input", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111, 33]); // "Hello!"
    const reference = btoa(String.fromCharCode(...bytes));
    expect(bytesToBase64(bytes)).toBe(reference);
  });

  it("round-trips large input spanning multiple chunks (>32KB)", () => {
    const size = 100_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const encoded = bytesToBase64(bytes);
    const decoded = atob(encoded);
    expect(decoded.length).toBe(size);
    for (let i = 0; i < size; i++) expect(decoded.charCodeAt(i)).toBe(bytes[i]);
  });
});

// تحويل غير محجوب للشاشة — بيستخدم FileReader (كود أصلي) بدل بناء نص ضخم
// على الخيط الرئيسي، فالتصدير/المشاركة مايجمّدوش التطبيق مهما كبرت السجلات.
describe("blobToBase64 (غير محجوب)", () => {
  it("بيدي نفس ناتج التحويل المتزامن", async () => {
    const bytes = new Uint8Array([0, 1, 2, 200, 255, 128, 64]);
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    expect(await blobToBase64(blob)).toBe(bytesToBase64(bytes));
  });

  it("ملف فاضي → نص فاضي", async () => {
    expect(await blobToBase64(new Blob([]))).toBe("");
  });

  it("ملف كبير (أكتر من دفعة) بيتحوّل صح", async () => {
    const size = 120_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 7) % 256;
    const encoded = await blobToBase64(new Blob([bytes.buffer as ArrayBuffer]));
    const decoded = atob(encoded);
    expect(decoded.length).toBe(size);
    expect(decoded.charCodeAt(0)).toBe(bytes[0]);
    expect(decoded.charCodeAt(size - 1)).toBe(bytes[size - 1]);
  });

  it("لو FileReader مش متاح بيرجع للطريقة اليدوية بنفس الناتج", async () => {
    const bytes = new Uint8Array([9, 8, 7, 250, 3]);
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    const original = globalThis.FileReader;
    // @ts-expect-error — إخفاء FileReader لاختبار المسار الاحتياطي
    delete globalThis.FileReader;
    try {
      expect(await blobToBase64(blob)).toBe(bytesToBase64(bytes));
    } finally {
      globalThis.FileReader = original;
    }
  });
});

describe("buildCsvBlob", () => {
  // Blob.text() strips a leading BOM on decode, so read raw bytes to assert
  // the BOM is really written, and use text() for the (BOM-free) content.
  async function bytes(blob: Blob) { return new Uint8Array(await blob.arrayBuffer()); }
  async function text(blob: Blob) { return await blob.text(); }

  it("starts with the UTF-8 BOM bytes so Excel reads Arabic correctly", async () => {
    const b = await bytes(buildCsvBlob([{ a: "حبل6121" }]));
    expect([b[0], b[1], b[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("writes a header row + data rows", async () => {
    const csv = await text(buildCsvBlob([
      { "رقم اللوحة": "حبل6121", "نوع السيارة": "ملاكي" },
    ]));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("رقم اللوحة,نوع السيارة");
    expect(lines[1]).toBe("حبل6121,ملاكي");
  });

  it("quotes values containing commas, quotes, or newlines", async () => {
    const csv = await text(buildCsvBlob([{ a: 'x,y', b: 'he said "hi"', c: "l1\nl2" }]));
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe('"x,y","he said ""hi""","l1\nl2"');
  });

  it("renders null/undefined as empty cells", async () => {
    const csv = await text(buildCsvBlob([{ a: null, b: undefined, c: "ok" } as any]));
    expect(csv.split("\r\n")[1]).toBe(",,ok");
  });

  it("handles an empty row list", async () => {
    expect(await text(buildCsvBlob([]))).toBe("");
  });
});

describe("buildSpreadsheetBlob", () => {
  it("returns an xlsx blob for normal data", () => {
    const { blob, ext } = buildSpreadsheetBlob([{ "رقم اللوحة": "حبل6121" }], "اللوحات");
    expect(ext).toBe("xlsx");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("toSafeCacheFilename", () => {
  it("strips Arabic from the default export name but keeps the ASCII date + extension", () => {
    expect(toSafeCacheFilename("اكسيل-05-07-2026.xlsx")).toBe("05-07-2026.xlsx");
  });

  it("keeps digits from an all-Arabic-letters plate audio name", () => {
    expect(toSafeCacheFilename("أبح1234.m4a")).toBe("1234.m4a");
  });

  it("leaves an already-ASCII filename essentially intact", () => {
    expect(toSafeCacheFilename("report-2026.xlsx")).toBe("report-2026.xlsx");
  });

  it("never yields an empty base or extension", () => {
    expect(toSafeCacheFilename("لوحة.xlsx")).toBe("file.xlsx"); // all-Arabic base → fallback
    expect(toSafeCacheFilename("اسم")).toBe("file.dat");        // no extension at all
  });

  it("collapses spaces and punctuation runs into single dashes, no leading/trailing dash", () => {
    expect(toSafeCacheFilename("my  file (final).xlsx")).toBe("my-file-final.xlsx");
  });

  it("handles a leading-dot name safely (contrived — real inputs are always name.ext)", () => {
    // lastIndexOf('.') at 0 → treated as no real extension; the leading dot is
    // stripped and the remainder becomes the base. Result is still ASCII-safe,
    // which is all that matters for the cache write.
    expect(toSafeCacheFilename(".xlsx")).toBe("xlsx.dat");
  });
});

/**
 * «رفع للداتا» بيطلّع CSV للملفات الضخمة (فوق ١٥٠ ألف صف — الـ xlsx بياخد
 * ٦ ثواني و٢.٤ جيجا ذاكرة). ترتيب الأعمدة لازم يبقى مربوط بعناوين الداتا،
 * مش مستنتج من أول صف — عشان صف ناقصه عمود مايزحزحش الملف كله.
 */
describe("buildCsvBlob بعناوين محدّدة", () => {
  it("بيلتزم بترتيب العناوين المطلوب", async () => {
    const blob = buildCsvBlob(
      [{ "ب": "2", "ا": "1" }],
      ["ا", "ب"],
    );
    const text = await blob.text();
    expect(text.replace(/^\uFEFF/, "").split("\r\n")).toEqual(["ا,ب", "1,2"]);
  });

  it("صف ناقصه عمود بيطلع فاضي مش مزحزح", async () => {
    const blob = buildCsvBlob(
      [{ "ا": "1", "ب": "2" }, { "ا": "3" }],
      ["ا", "ب"],
    );
    const rows = (await blob.text()).replace(/^\uFEFF/, "").split("\r\n");
    expect(rows[2]).toBe("3,");
  });

  it("من غير عناوين بيفضل زي ما كان (أول صف)", async () => {
    const text = await buildCsvBlob([{ "ا": "1", "ب": "2" }]).text();
    expect(text.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("ا,ب");
  });
});

/**
 * لما البرنامج بيسلّم ملف لتطبيق تاني (زرار «فتح» / «شارك») بيقوله نوعه إيه.
 * كنا بنقول «xlsx» على أي حاجة مش csv ولا xls — يعني محفظة .xlsb بتتسلّم
 * على إنها xlsx. إكسيل بيشم المحتوى وبيفتحها، لكن **جوجل شيتس بيصدّق النوع
 * وبيقول فيه مشكلة**.
 *
 * نفس عيلة مشكلة الـ .xlsb في «فتح بواسطة»: إحنا بنكدب على النظام في نوع
 * الملف، والتطبيق الصارم بيرفض.
 */
describe("نوع المحتوى وقت التسليم لتطبيق تاني", () => {
  const t = (name: string) => contentTypeForFilename(name);

  it("xlsx", () => {
    expect(t("a.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("xlsb بنوعه هو — مش xlsx", () => {
    expect(t("محفظة.xlsb")).toBe("application/vnd.ms-excel.sheet.binary.macroEnabled.12");
  });

  it("xlsm بنوعه هو", () => {
    expect(t("a.xlsm")).toBe("application/vnd.ms-excel.sheet.macroEnabled.12");
  });

  it("ods بنوعه هو", () => {
    expect(t("a.ods")).toBe("application/vnd.oasis.opendocument.spreadsheet");
  });

  it("csv و xls زي ما كانوا", () => {
    expect(t("a.csv")).toBe("text/csv");
    expect(t("a.xls")).toBe("application/vnd.ms-excel");
  });

  it("الامتداد بأي حالة حروف", () => {
    expect(t("A.XLSB")).toBe("application/vnd.ms-excel.sheet.binary.macroEnabled.12");
  });

  it("من غير امتداد → xlsx (الافتراضي زي ما كان)", () => {
    expect(t("file")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
});

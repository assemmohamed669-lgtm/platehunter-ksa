// @vitest-environment jsdom
/**
 * راوت فكّ تشفير الإكسيل بقى مقفول على المناديب المسجّلين — فالعميل لازم:
 *  (١) يبعت توكن الجلسة مع الطلب،
 *  (٢) يفرّق بين 401 «جلسة ساقطة» و401 «كلمة مرور الملف غلط»،
 *  (٣) يعرض رسالة مفهومة لحد الاستهلاك (429) وللملف الكبير (413).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";

// نمنع تحميل supabaseClient الحقيقي (محتاج env) — التوكن مزيّف.
vi.mock("@/lib/authHeader", () => ({
  authHeader: async () => ({ Authorization: "Bearer fake-token" }),
}));

function xlsxBytes(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([["رقم اللوحة", "الحي"], ["ابح1234", "النسيم"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

const protectedFile = () => new File([new Uint8Array([1, 2, 3])], "محمي.xlsx");
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("decryptViaServer — بوابة الجلسة", () => {
  it("بيبعت توكن الجلسة في هيدر Authorization", async () => {
    const bytes = xlsxBytes();
    fetchMock.mockResolvedValue(new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 }));
    const { parseExcelFile } = await import("@/lib/excel");

    const table = await parseExcelFile(protectedFile(), "كلمة-سر");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/excel/decrypt");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
    // وقرا الملف المفكوك عادي بعد كده
    expect(table.headers).toContain("رقم اللوحة");
  });

  it("401 NO_SESSION → رسالة «الجلسة انتهت» مش «كلمة المرور غلط»", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "NO_SESSION" }), { status: 401 }));
    const { parseExcelFile } = await import("@/lib/excel");
    await expect(parseExcelFile(protectedFile(), "أي-حاجة")).rejects.toThrow(/الجلسة/);
  });

  it("401 WRONG_PASSWORD → رسالة كلمة مرور الملف", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "WRONG_PASSWORD" }), { status: 401 }));
    const { parseExcelFile } = await import("@/lib/excel");
    await expect(parseExcelFile(protectedFile(), "غلط")).rejects.toThrow(/كلمة مرور الملف/);
  });

  it("429 → رسالة حد الاستهلاك", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "rate" }), { status: 429 }));
    const { parseExcelFile } = await import("@/lib/excel");
    await expect(parseExcelFile(protectedFile(), "س")).rejects.toThrow(/محاولات كتير/);
  });

  it("413 → رسالة الملف كبير", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "big" }), { status: 413 }));
    const { parseExcelFile } = await import("@/lib/excel");
    await expect(parseExcelFile(protectedFile(), "س")).rejects.toThrow(/كبير/);
  });
});

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { originalToKeep, KEEP_ORIGINAL_MAX_BYTES } from "@/lib/dataStore";

vi.mock("@/lib/excel", async (orig) => ({ ...(await orig<typeof import("@/lib/excel")>()), openExcelBlob: vi.fn(async () => {}) }));
import FileUploadBox from "@/components/FileUploadBox";
import { openExcelBlob } from "@/lib/excel";

/**
 * 📂 «فتح» في مربع الداتا كان بيفتح ملف **فاضي** — المالك (١٤ أكتوبر ٢٠٢٦، «داتا 14 اكتوبر.xlsx»: ورقتين «داتا» ٢٩٢٧٠ صف
 * و«فرز»): «ببعته علي مربع الداتا وبفتحه من هناك مش بيظهر معايا البيانات اللي فيه مع ان البرنامج قاري اللوحات».
 * الملف متعدد الورقات (أو الكبير) بيتخزّن **دفعات** للفرز، والملف الأصلي ماكانش بيتحفظ ⇒ بعد إعادة الفتح/من واتساب
 * المربع كان بيتبني بـ`new Blob()` فاضي. دلوقتي: الأصل بيتحفظ مع الدفعات، ولو مش موجود (اترفع قبل التصليح/اتعدّل)
 * «فتح» بيطلّع الشيت من الدفعات نفسها.
 */
const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

describe("🔴 الملف الأصلي بيتحفظ مع الدفعات", () => {
  it("لحد ٤٠ ميجا · أكبر من كده أو فاضي ⇒ لأ", () => {
    expect(KEEP_ORIGINAL_MAX_BYTES).toBe(40 * 1024 * 1024);
    const f = new File([new Uint8Array(1_795_970)], "داتا 14 اكتوبر.xlsx");
    expect(originalToKeep(f)).toBe(f);
    expect(originalToKeep(new File([], "x.xlsx"))).toBeUndefined();
    expect(originalToKeep({ size: KEEP_ORIGINAL_MAX_BYTES + 1 } as Blob)).toBeUndefined();
    expect(originalToKeep(null)).toBeUndefined();
  });
  it("الاستيرادين (ملف كبير بورقة · متعدد الورقات) بيحطوه في بيانات الملف", () => {
    const s = read("lib/dataStore.ts");
    expect(s.match(/\.\.\.\(keep \? \{ fileBlob: keep \} : \{\}\)/g)?.length).toBe(2);
    expect(s.match(/const keep = originalToKeep\(file\);/g)?.length).toBe(2);
  });
  it("صفحة الفرز بتبني المربع من الأصل المحفوظ (الأساسي والإضافي) بدل ملف فاضي", () => {
    const p = read("app/(app)/sorting/page.tsx");
    expect(p).not.toMatch(/new File\(\[new Blob\(\)\], bigMeta\.fileName/);
    expect(p.match(/new File\(\[bigMeta\.fileBlob \?\? new Blob\(\)\], bigMeta\.fileName/g)?.length).toBe(2);
    expect(p.match(/new File\(\[meta\.fileBlob \?\? new Blob\(\)\], rec\.fileName/g)?.length).toBe(2);
  });
  it("التعديل (#440) بيشيل الأصل القديم — «فتح» يطلّع الشيت بالتعديلات", () => {
    expect(read("lib/dataEdit.ts")).toMatch(/fileBlob: undefined,/);
  });
});

describe("🔴 «فتح» من غير الأصل ⇒ من الدفعات", () => {
  it("المربع بيستخدم onOpen لو اتبعت", async () => {
    const onOpen = vi.fn(async () => {});
    render(<FileUploadBox title="ملف الداتا" parsedFile={new File([], "داتا.xlsx")} parsedRowCount={29269}
      onParsed={() => {}} onClear={() => {}} onOpen={onOpen} />);
    fireEvent.click(screen.getByTitle("فتح الشيت"));
    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    expect(openExcelBlob).not.toHaveBeenCalled();
  });
  it("من غيره ⇒ الملف نفسه زي الأول", async () => {
    const f = new File([new Uint8Array([1])], "داتا.xlsx");
    render(<FileUploadBox title="ملف الداتا" parsedFile={f} parsedRowCount={1} onParsed={() => {}} onClear={() => {}} />);
    fireEvent.click(screen.getByTitle("فتح الشيت"));
    await waitFor(() => expect(openExcelBlob).toHaveBeenCalledWith(f, "داتا.xlsx"));
  });
  it("صفحة الفرز: المربع الأساسي والإضافي بيفتحوا من الدفعات لو الأصل مش موجود", () => {
    const p = read("app/(app)/sorting/page.tsx");
    expect(p).toMatch(/onOpen=\{dataStreamed && !dataFile\?\.size \? \(\) => openStoredData\("data"\) : undefined\}/);
    expect(p).toMatch(/onOpen=\{ed\.streamed && ed\.streamSlot && !ed\.file\?\.size \? \(\) => openStoredData\(ed\.streamSlot!\) : undefined\}/);
    expect(p).toMatch(/async function openStoredData\(store: string\)/);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * 🔒 **ملف داتا كبير ومحمي بكلمة مرور ⇒ خانة كلمة المرور تظهر.**
 *
 * بلاغ المالك (٣٠ سبتمبر ٢٠٢٦): المندوب بيرفع ملف داتا محمي، والبرنامج بيقول
 * «تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور» ومافيش مربع يكتب فيه كلمة
 * المرور. السبب: الملف الكبير (فوق عتبة مربع الداتا) بيروح لـ`onLargeFile`،
 * وغلطه كان بيتعرض زي ما هو — من غير فحص «ده غلط كلمة مرور؟» اللي الملف الصغير
 * بيعمله. وبعد كلمة المرور لازم يرجع للمسار الكبير (دفعات) مش يتفتح في الذاكرة.
 */
const decrypted = new File([new Uint8Array([80, 75, 3, 4])], "data.xlsx");
vi.mock("@/lib/excel", () => ({
  parseExcelFile: vi.fn(async () => { throw new Error("should not open a large file in memory"); }),
  decryptExcelFile: vi.fn(async () => decrypted),
  openExcelBlob: vi.fn(),
}));
import FileUploadBox from "@/components/FileUploadBox";
import { isPasswordErrorMessage } from "@/lib/passwordError";

afterEach(() => cleanup());

describe("isPasswordErrorMessage", () => {
  it("🔴 رسايل البرنامج العربي بتتعرف", () => {
    expect(isPasswordErrorMessage("تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور.")).toBe(true);
    expect(isPasswordErrorMessage("تعذّر فك تشفير الملف — قد يكون محمياً بكلمة مرور.")).toBe(true);
  });
  it("ورسالة SheetJS الإنجليزي", () => {
    expect(isPasswordErrorMessage("File is password-protected")).toBe(true);
  });
  it("غلط تاني عادي مابيتعرفش", () => {
    expect(isPasswordErrorMessage("الملف فارغ أو لا يحتوي على بيانات.")).toBe(false);
  });
});

describe("مربع الداتا — ملف كبير محمي", () => {
  function setup(onLargeFile: (f: File, p: (n: number) => void) => Promise<void>) {
    render(
      <FileUploadBox title="ملف الداتا 1" onParsed={() => {}} parsedFile={null} parsedRowCount={null}
        onClear={() => {}} largeFileThresholdBytes={1} onLargeFile={onLargeFile} />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(50)], "محمي.xlsx")] } });
  }

  it("🔴 غلط كلمة المرور من المسار الكبير بيفتح خانة كلمة المرور", async () => {
    setup(async () => { throw new Error("تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور."); });
    expect(await screen.findByPlaceholderText("كلمة مرور الملف")).toBeTruthy();
  });

  it("🔴 بعد كلمة المرور: النسخة المفكوكة بتروح للمسار الكبير (مش الذاكرة)", async () => {
    const onLarge = vi.fn()
      .mockRejectedValueOnce(new Error("تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور."))
      .mockResolvedValueOnce(undefined);
    setup(onLarge);
    const pw = await screen.findByPlaceholderText("كلمة مرور الملف");
    fireEvent.change(pw, { target: { value: "1234" } });
    fireEvent.keyDown(pw, { key: "Enter" });
    await waitFor(() => expect(onLarge).toHaveBeenCalledTimes(2));
    expect(onLarge.mock.calls[1][0]).toBe(decrypted);
  });

  it("غلط تاني من المسار الكبير بيتعرض زي ما هو (من غير خانة كلمة مرور)", async () => {
    setup(async () => { throw new Error("الملف فارغ أو لا يحتوي على بيانات."); });
    expect(await screen.findByText("الملف فارغ أو لا يحتوي على بيانات.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("كلمة مرور الملف")).toBeNull();
  });
});

/**
 * 📤 زرار مشاركة صغير **جوّه** مربع الرفع على اليمين (المالك ٢٦ أكتوبر ٢٠٢٦: «خليه جوة المربع زر مشاركه علي اليمين»).
 * بيظهر بس لو الصفحة بعتت `onShare` (مربع الإحالة في «فرز جديد») — غير كده المربع زي الأول بالحرف.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FileUploadBox from "@/components/FileUploadBox";

const base = {
  title: "ملف الإحالة", onParsed: () => {}, onClear: () => {},
  parsedFile: new File(["x"], "Copy of Vehicles Details For Repo-83.xlsx"), parsedRowCount: 3413, plateCount: 3251,
  showReplaceButtons: true,
};

describe("📤 زرار المشاركة جوّه المربع", () => {
  it("بيظهر بالاسم ويشغّل المشاركة", () => {
    const onShare = vi.fn();
    render(<FileUploadBox {...base} onShare={onShare} shareLabel="مشاركة اللوحات الجديدة" />);
    fireEvent.click(screen.getByRole("button", { name: "مشاركة اللوحات الجديدة" }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });
  it("وهو بيجهّز ⇒ مقفول (مايتداسش مرتين)", () => {
    render(<FileUploadBox {...base} onShare={() => {}} shareLabel="مشاركة اللوحات الجديدة" sharing />);
    expect(screen.getByRole("button", { name: "مشاركة اللوحات الجديدة" })).toHaveProperty("disabled", true);
  });
  it("من غير onShare ⇒ مفيش زرار (المربع زي الأول)", () => {
    render(<FileUploadBox {...base} />);
    expect(screen.queryByRole("button", { name: /مشاركة/ })).toBeNull();
  });
});

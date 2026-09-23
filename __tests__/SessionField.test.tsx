import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SessionField from "@/components/SessionField";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ✖️ زرّ مسح لكل مربّع — «الحي واسم الشارع» و«اسم المسجّل»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «في المربعين اللي بكتب فيهم الحي واسم الشارع
 *  واسم المسجّل عايزك تحطلي علامة مسح لكل مربع على حدة، تمسح اللي في المربع
 *  كله اللي المندوب كتبه، علشان لو حب يكتب حاجة جديدة تبقى سريعة معاه».
 *
 *  المسح بيفضّي المربّع بس — اللوحات القديمة بتفضل بختمها (ده متغطّي في
 *  `trialRecords`/`trialRowMerge`): الفاضي معناه «مابيتكتبش على الجديد».
 */
describe("SessionField — زرّ المسح", () => {
  afterEach(() => cleanup());

  it("فيه كلام ⇒ فيه زرّ مسح، والضغط بيفضّي المربّع كله مرة واحدة", () => {
    const onChange = vi.fn();
    render(<SessionField label="الحي واسم الشارع" value="النسيم - شارع ٣٠" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "امسح الحي واسم الشارع" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("المربّع فاضي ⇒ مافيش زرّ مسح (مافيش حاجة تتمسح)", () => {
    render(<SessionField label="اسم المسجّل" value="" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "امسح اسم المسجّل" })).toBeNull();
  });

  it("مسافات بس ⇒ بيعتبر فيه كلام ويسمح بالمسح", () => {
    const onChange = vi.fn();
    render(<SessionField label="اسم المسجّل" value="   " onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "امسح اسم المسجّل" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("كل مربّع ليه زرّه لوحده — مسح واحد مابيلمسش التاني", () => {
    const area = vi.fn();
    const rec = vi.fn();
    render(<>
      <SessionField label="الحي واسم الشارع" value="النسيم" onChange={area} />
      <SessionField label="اسم المسجّل" value="أحمد" onChange={rec} />
    </>);
    fireEvent.click(screen.getByRole("button", { name: "امسح اسم المسجّل" }));
    expect(rec).toHaveBeenCalledWith("");
    expect(area).not.toHaveBeenCalled();
  });

  it("الكتابة لسه شغّالة زي الأول", () => {
    const onChange = vi.fn();
    render(<SessionField label="اسم المسجّل" value="" onChange={onChange} placeholder="اسم المندوب" />);
    fireEvent.change(screen.getByPlaceholderText("اسم المندوب"), { target: { value: "محمد" } });
    expect(onChange).toHaveBeenCalledWith("محمد");
  });
});

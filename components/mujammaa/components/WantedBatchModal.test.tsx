import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlateEntry } from "../lib/plateEntry";

/**
 * 🚨 المربع نفسه: صوت أول ما يظهر، «يوجد N سيارات مطلوبة» فوق، كارت لكل عربية ببياناتها كاملة وشهادتها،
 * سحب يمين/شمال (أو الأسهم) للباقيين، و«تم» بيوقّف الصوت ويقفل.
 */
const siren = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), unlock: vi.fn() }));
vi.mock("@/lib/alertSiren", () => ({
  startAlertSiren: siren.start,
  stopAlertSiren: siren.stop,
  ensureSirenAudioUnlocked: siren.unlock,
}));
vi.mock("@/components/CertificateBadge", () => ({
  default: ({ plate, chassis }: { plate?: string; chassis?: string }) => (
    <span data-testid="cert">{`${plate}|${chassis ?? ""}`}</span>
  ),
}));

import WantedBatchModal from "./WantedBatchModal";

const mk = (plate: string, row: Record<string, string>, extra: Record<string, unknown> = {}) =>
  ({
    id: `e-${plate}`,
    review: { plate, letters: [...plate.slice(0, 3)], digits: plate.slice(3) },
    match: { kind: "exact", row },
    pin: { lat: 24.7, lng: 46.7, accuracy: 8, at: 1, ageMs: 0, stale: false },
    capturedAt: new Date(2026, 9, 18, 19, 39).getTime(),
    source: "batch",
    ...extra,
  }) as unknown as PlateEntry;

const A = mk("بسن8921", { "رقم اللوحة": "بسن 8921", "صانع المركبة": "تويوتا", "البنك": "الراجحي", "رقم الهيكل": "MR0FB8CD3K0123456" }, { vehicleType: "ونيت" });
const B = mk("حقل5830", { "رقم اللوحة": "حقل 5830", "صانع المركبة": "هيونداي", "اللون": "فضي" });
const C = mk("ربن8213", { "رقم اللوحة": "ربن 8213", "البنك": "الأهلي" }, { pin: null });

afterEach(() => {
  cleanup();
  siren.start.mockClear();
  siren.stop.mockClear();
});

describe("WantedBatchModal", () => {
  it("بصوت أول ما يظهر — ومكتوب فوق «يوجد 3 سيارات مطلوبة»", () => {
    render(<WantedBatchModal items={[A, B, C]} onClose={() => {}} />);
    expect(siren.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/يوجد 3 سيارات مطلوبة/)).toBeTruthy();
    expect(screen.getByText(/اسحب/)).toBeTruthy();
  });

  it("كارت لكل عربية ببيانات الملف كاملة + الشهادة بالشاص + النوع اللي اتقال + الموقع", () => {
    render(<WantedBatchModal items={[A, B, C]} onClose={() => {}} />);
    expect(screen.getAllByTestId("wanted-card")).toHaveLength(3);
    expect(screen.getByText("تويوتا")).toBeTruthy();
    expect(screen.getByText("الراجحي")).toBeTruthy();
    expect(screen.getByText("هيونداي")).toBeTruthy();
    expect(screen.getByText("فضي")).toBeTruthy();
    expect(screen.getByText("الأهلي")).toBeTruthy();
    const certs = screen.getAllByTestId("cert").map((x) => x.textContent);
    expect(certs).toContain("بسن8921|MR0FB8CD3K0123456");
    expect(certs).toContain("حقل5830|");
    expect(screen.getByText(/ونيت/)).toBeTruthy();
    expect(screen.getAllByText(/مكانها لحظة ما اتقالت/).length).toBe(2);
    expect(screen.getByText(/من غير موقع/)).toBeTruthy();
  });

  it("الأسهم بتتنقّل والعدّاد بيقول «2 من 3»", () => {
    render(<WantedBatchModal items={[A, B, C]} onClose={() => {}} />);
    expect(screen.getByText("1 من 3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("اللي بعدها"));
    expect(screen.getByText("2 من 3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("اللي قبلها"));
    expect(screen.getByText("1 من 3")).toBeTruthy();
  });

  it("«تم» بيوقّف الصوت ويقفل", () => {
    const onClose = vi.fn();
    render(<WantedBatchModal items={[A, B]} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^تم/ }));
    expect(siren.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("عربية واحدة ⇒ من غير «اسحب» ولا أسهم", () => {
    render(<WantedBatchModal items={[A]} onClose={() => {}} />);
    expect(screen.getByText(/يوجد سيارة مطلوبة/)).toBeTruthy();
    expect(screen.queryByText(/اسحب/)).toBeNull();
    expect(screen.queryByLabelText("اللي بعدها")).toBeNull();
  });

  it("«وريني في الجدول» بيبعت معرّف الصف", () => {
    const onShowRow = vi.fn();
    render(<WantedBatchModal items={[A]} onClose={() => {}} onShowRow={onShowRow} />);
    fireEvent.click(screen.getByRole("button", { name: /وريني في الجدول/ }));
    expect(onShowRow).toHaveBeenCalledWith("e-بسن8921");
  });
});

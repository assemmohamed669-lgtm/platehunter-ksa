/**
 * 📥 مربع ملف التشييك في «التسجيل» (المجمّع) — نفس مربع صفحة التشييك و«Voice PRO» (١٨ أكتوبر ٢٠٢٦).
 * المالك: «لو غير الملف بتاع التشييك من صفحه التشييك او من صفحه المجمع يظهر في باقي الصفحات والبرنامج
 * يعتمدة في كل حاجه».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  props: null as null | Record<string, unknown>,
  save: vi.fn(async () => ({ ok: true }) as const),
  clear: vi.fn(async () => {}),
  sync: vi.fn(async () => false),
  get: vi.fn(async () => ({ fileName: "(تشييك) العربي.xlsx", headers: ["اللوحه"], rows: [{}, {}, {}], fileBlob: new Blob(["x"]) })),
  listeners: [] as Array<() => void>,
}));
vi.mock("@/components/FileUploadBox", () => ({
  default: (p: Record<string, unknown>) => {
    m.props = p;
    const f = p.parsedFile as File | null;
    return <div data-testid="upload">{`${f?.name ?? "—"}|${p.parsedRowCount}|${p.plateCount}|${p.title}`}</div>;
  },
}));
vi.mock("@/lib/checkFileOps", () => ({ saveMainCheckFile: m.save, clearMainCheckFile: m.clear }));
vi.mock("@/lib/teamCheck", () => ({
  syncTeamCheckToLocal: m.sync,
  teamCheckShareMessage: (r: unknown) => (r ? "✅ شيت التشييك اترفع للمجموعة — هيوصل لكل الأعضاء" : null),
}));
vi.mock("@/lib/idb", () => ({ getUploadedFile: m.get }));
vi.mock("@/lib/checkSheetSync", () => ({
  onCheckSheetChanged: (cb: () => void) => {
    m.listeners.push(cb);
    return () => {};
  },
  lastCheckSheetStamp: () => null,
}));

import SharedCheckFileBox from "@/components/SharedCheckFileBox";

afterEach(() => {
  cleanup();
  m.listeners = [];
});

describe("SharedCheckFileBox", () => {
  it("نفس المربع: اسم الملف + الصفوف + اللوحات (العدد من المجمّع) — ومزامنة المجموعة أول ما يفتح", async () => {
    render(<SharedCheckFileBox plateCount={50946} extraFiles={0} />);
    await waitFor(() => expect(screen.getByTestId("upload").textContent).toBe("(تشييك) العربي.xlsx|3|50946|ملف التشييك"));
    expect(m.sync).toHaveBeenCalled();
    expect(m.props?.showReplaceButtons).toBe(true);
    expect(m.props?.sky).toBe(true);
  });

  it("رفع ⇒ نفس الحفظ المشترك + رسالة المجموعة؛ مسح ⇒ نفس المسح", async () => {
    render(<SharedCheckFileBox plateCount={null} extraFiles={0} />);
    await waitFor(() => expect(m.props).not.toBeNull());
    const file = new File(["y"], "جديد.xlsx");
    const table = { headers: ["اللوحه"], rows: [{ "اللوحه": "ابح1234" }] };
    await act(async () => {
      await (m.props!.onParsed as (t: unknown, f: File) => Promise<void>)(table, file);
    });
    expect(m.save).toHaveBeenCalledWith(table, file);
    expect(screen.getByText(/اترفع للمجموعة/)).toBeTruthy();
    await act(async () => {
      await (m.props!.onClear as () => Promise<void>)();
    });
    expect(m.clear).toHaveBeenCalled();
  });

  it("بيقرا تاني لما الملف يتغيّر من أي صفحة", async () => {
    render(<SharedCheckFileBox plateCount={1} extraFiles={0} />);
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    const n = m.get.mock.calls.length;
    expect(m.listeners.length).toBeGreaterThan(0);
    await act(async () => {
      m.listeners.forEach((cb) => cb());
    });
    await waitFor(() => expect(m.get.mock.calls.length).toBeGreaterThan(n));
  });

  it("الملفات الإضافية بتتقال (بتشتغل معاه — بتتغيّر من صفحة التشييك)", async () => {
    render(<SharedCheckFileBox plateCount={1} extraFiles={2} />);
    await waitFor(() => expect(screen.getByText(/ملفين تشييك إضافيين/)).toBeTruthy());
  });
});

describe("الربط — «التسجيل» والمجمّع", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("«التسجيل» بيعرض المربع والمجمّع ظاهر، ومربع المجمّع الداخلي بيستخبى", () => {
    const src = read("app/(app)/registration/page.tsx");
    expect(src).toMatch(/import SharedCheckFileBox from "@\/components\/SharedCheckFileBox";/);
    expect(src).toMatch(/\{\(superOk \|\| mjAgentOk\) && mjShown && \(\s*<SharedCheckFileBox plateCount=\{mjCheckInfo\?\.plates \?\? null\} extraFiles=\{Math\.max\(0, \(mjCheckInfo\?\.files \?\? 0\) - 1\)\} \/>/);
    expect(src).toMatch(/hideCheckBox\s*\n?\s*onCheckInfo=\{setMjCheckInfo\}/);
  });

  it("المجمّع بيقرا الملف تاني مع أي تغيير (نفس إشارة Voice PRO) ولما يرجع من الخلفية", () => {
    const hook = read("components/mujammaa/hooks/useAppCheckSheet.ts");
    expect(hook).toMatch(/onCheckSheetChanged\(\(\) => void load\(\), \{ idbEvent: true \}\)/);
    expect(hook).toMatch(/lastCheckSheetStamp\(\) !== loadedStamp/);
  });

  it("الجدول بيتقارن تاني بالملف الجديد — والمربع بصوت للمطلوبة الجديدة بس (مش أول قراية)", () => {
    const page = read("components/mujammaa/pages/BatchPage.tsx");
    expect(page).toMatch(/const r = rematchEntries\(entriesLatestRef\.current, \(p\) => matchInCheckSheet\(sheet, p\)\);/);
    expect(page).toMatch(/if \(prev\) \{\s*const w = newlyWanted\(before, r\.entries\);/);
    // لوحات مقطع قديم بتتعرض بحالتها على الملف الحالي
    expect(page).toMatch(/const fresh = rematchEntries\(c\.result\.entries, \(p\) => matchInCheckSheet\(sheetRef\.current, p\)\)\.entries;/);
    expect(page).toMatch(/\{!hideCheckBox && <CheckSheetBox bank=\{bank\} \/>\}/);
    expect(page).toMatch(/onCheckInfoRef\.current\?\.\(\{ plates: bank\.sheet \? bank\.sheet\.plates\.length : null, files: bank\.files \}\)/);
  });
});

/**
 * 📥 رفع/تغيير/مسح ملف التشييك من أي صفحة (١٨ أكتوبر ٢٠٢٦) — `lib/checkFileOps.ts`.
 *
 * المالك: «انا عايز المندوب لو غير الملف بتاع التشييك من صفحه التشييك او من صفحه المجمع يظهر في باقي
 * الصفحات والبرنامج يعتمدة في كل حاجه».
 *  · نفس خطوات صفحة التشييك و«Voice PRO» بالحرف: نفس السلوت (`local:check`) · إشارة «الشيت اتغيّر» لكل
 *    الصفحات · المسئول بيبعته للمجموعة.
 *  · حارس توافق: الصفحتين التانيين لسه بيعملوا نفس الخطوات (لو حد غيّر واحدة ⇒ الاختبار يقول).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  save: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  notify: vi.fn(),
  share: vi.fn(async () => ({ ok: true }) as const),
}));
vi.mock("@/lib/idb", () => ({ saveUploadedFile: m.save, deleteUploadedFile: m.del }));
vi.mock("@/lib/checkSheetSync", () => ({ notifyCheckSheetChanged: m.notify }));
vi.mock("@/lib/teamCheck", () => ({ shareCheckToTeamIfLeader: m.share }));

import { clearMainCheckFile, saveMainCheckFile } from "@/lib/checkFileOps";

const TABLE = {
  headers: ["اللوحه", "البنك"],
  rows: [{ "اللوحه": "ب س ن 8921", "البنك": "الراجحي" }, { "اللوحه": "ب س ن 8921", "البنك": "الراجحي" }, { "اللوحه": "ح ق ل 5830", "البنك": "الأهلي" }],
};

describe("saveMainCheckFile", () => {
  beforeEach(() => {
    m.save.mockClear();
    m.notify.mockClear();
    m.share.mockClear();
  });

  it("نفس السلوت ونفس شكل السجل — وبعدين إشارة لكل الصفحات — وبعدين المجموعة", async () => {
    const file = new File(["x"], "(تشييك) العربي.xlsx");
    const r = await saveMainCheckFile(TABLE, file);
    expect(m.save).toHaveBeenCalledTimes(1);
    const rec = (m.save.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(rec).toMatchObject({ key: "local:check", agentId: "local", slot: "check", fileName: "(تشييك) العربي.xlsx", headers: TABLE.headers, rows: TABLE.rows, fileBlob: file });
    expect(typeof rec.uploadedAt).toBe("string");
    expect(m.notify).toHaveBeenCalledTimes(1);
    expect(m.save.mock.invocationCallOrder[0]).toBeLessThan(m.notify.mock.invocationCallOrder[0]);
    // المسئول: العدد = الصفوف، واللوحات المختلفة = ٢
    const [f, rows, count] = m.share.mock.calls[0] as unknown as [File, number, () => number];
    expect(f).toBe(file);
    expect(rows).toBe(3);
    expect(count()).toBe(2);
    expect(r).toEqual({ ok: true });
  });

  it("المجموعة وقعت ⇒ الملف اتحفظ برضه ومابيرميش", async () => {
    m.share.mockRejectedValueOnce(new Error("offline"));
    await expect(saveMainCheckFile(TABLE, new File(["x"], "a.xlsx"))).resolves.toBeNull();
    expect(m.save).toHaveBeenCalled();
    expect(m.notify).toHaveBeenCalled();
  });
});

describe("clearMainCheckFile", () => {
  it("بيمسح نفس السلوت وبيبلّغ", async () => {
    m.del.mockClear();
    m.notify.mockClear();
    await clearMainCheckFile();
    expect(m.del).toHaveBeenCalledWith("local", "check");
    expect(m.notify).toHaveBeenCalledTimes(1);
  });
});

describe("🔒 حارس توافق — صفحة التشييك و«Voice PRO» بنفس الخطوات", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  for (const [name, path, fn] of [
    ["التشييك", "app/(app)/instant-check/page.tsx", "async function handleParsed("],
    ["Voice PRO", "app/(app)/registration-v2/page.tsx", "const onCheckParsed = useCallback("],
  ] as const) {
    it(name, () => {
      const src = read(path);
      const i = src.indexOf(fn);
      expect(i).toBeGreaterThan(0);
      const body = src.slice(i, i + 1800);
      expect(body).toMatch(/key: "local:check",\s*agentId: "local",\s*slot: "check",/);
      expect(body).toMatch(/await saveUploadedFile\(record\);\s*\n\s*(\/\/[^\n]*\n\s*)*notifyCheckSheetChanged\(\);/);
      expect(body).toMatch(/shareCheckToTeamIfLeader\(file, table\.rows\.length,/);
    });
  }
});

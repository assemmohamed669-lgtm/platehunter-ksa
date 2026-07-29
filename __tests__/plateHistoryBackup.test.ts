// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordAppearances, setPlateStatus, newHistoryMap, pruneDetail } from "@/lib/plateHistory";

// ── Supabase Storage موهوم: bucket في الذاكرة ────────────────────────────────
const files = new Map<string, Blob>();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string, body: Blob) => { files.set(path, body); return { error: null }; },
        download: async (path: string) => {
          const f = files.get(path);
          return f ? { data: f, error: null } : { data: null, error: { message: "not found" } };
        },
        list: async (prefix: string) => ({
          data: [...files.keys()].filter((k) => k.startsWith(prefix + "/")).map((k) => ({ name: k.slice(prefix.length + 1) })),
          error: null,
        }),
        remove: async (paths: string[]) => { paths.forEach((p) => files.delete(p)); return { error: null }; },
      }),
    },
  },
}));

const { backupHistory, restoreHistory, pruneRemoteMonths, monthKey } = await import("@/lib/plateHistoryBackup");

const AG = "agent-uuid-1";
const P1 = "ابح1234";
const P2 = "دمم5012";

describe("plateHistoryBackup (Storage — نسخة خاصة لكل مندوب)", () => {
  beforeEach(() => { files.clear(); });

  it("monthKey بياخد الشهر من التاريخ", () => {
    expect(monthKey("2026-07-29")).toBe("2026-07");
  });

  it("رفع ثم استرجاع: الملخص والتفاصيل بترجع صح", async () => {
    let m = recordAppearances(newHistoryMap(), [P1, P2], { today: "2026-05-05", fingerprint: "may" }).map;
    m = recordAppearances(m, [P1], { today: "2026-07-02", fingerprint: "jul" }).map;
    m = setPlateStatus(m, P1, "notFound", "2026-07-03");
    m = setPlateStatus(m, P2, "taken", "2026-07-04");

    const res = await backupHistory(AG, m, "2026-07-29");
    expect(res.summaryBytes).toBeGreaterThan(0);
    // الملفات في مجلد المندوب بس
    expect([...files.keys()].every((k) => k.startsWith(`${AG}/`))).toBe(true);
    expect(files.has(`${AG}/summary.json.gz`)).toBe(true);
    expect(files.has(`${AG}/2026-07.json.gz`)).toBe(true);

    const restored = await restoreHistory(AG, "2026-07-29");
    expect(restored.size).toBe(2);
    const e1 = restored.get(P1)!;
    expect(e1.firstSeen).toBe("2026-05-05");   // الملخص الدائم
    expect(e1.count).toBe(2);
    expect(e1.status).toBe("notFound");
    expect(e1.notFoundCount).toBe(1);
    expect(e1.dates).toContain("2026-07-02");  // تفاصيل الشهر
    expect(restored.get(P2)!.status).toBe("taken");
  });

  it("استرجاع مندوب مالوش نسخة بيرجّع فاضي (مش error)", async () => {
    const restored = await restoreHistory("no-such-agent", "2026-07-29");
    expect(restored.size).toBe(0);
  });

  it("الملخص بيتحفظ كامل حتى لو التفاصيل اتقصّت", async () => {
    let m = recordAppearances(newHistoryMap(), [P1], { today: "2025-01-10", fingerprint: "old" }).map;
    m = pruneDetail(m, "2026-07-29");            // التواريخ القديمة اتقصّت محلياً
    await backupHistory(AG, m, "2026-07-29");
    const restored = await restoreHistory(AG, "2026-07-29");
    expect(restored.get(P1)!.firstSeen).toBe("2025-01-10");  // «مطلوبة من سنة» تظل دقيقة
    expect(restored.get(P1)!.dates).toEqual([]);
  });

  it("pruneRemoteMonths بيمسح الشهور الأقدم من ٥ ويسيب الملخص", async () => {
    const m = recordAppearances(newHistoryMap(), [P1], { today: "2026-07-01", fingerprint: "a" }).map;
    await backupHistory(AG, m, "2026-07-29");
    // شهور قديمة مصطنعة
    files.set(`${AG}/2025-01.json.gz`, new Blob(["{}"]));
    files.set(`${AG}/2026-06.json.gz`, new Blob(["{}"]));   // جوه الخمسة → يفضل
    const removed = await pruneRemoteMonths(AG, "2026-07-29", 5);
    expect(removed).toBe(1);
    expect(files.has(`${AG}/2025-01.json.gz`)).toBe(false);
    expect(files.has(`${AG}/2026-06.json.gz`)).toBe(true);
    expect(files.has(`${AG}/summary.json.gz`)).toBe(true);  // الملخص مايتمسحش أبداً
  });

  it("حجم النسخة صغير: ٥٠٠٠ لوحة تتحوّل لكتلة معقولة", async () => {
    const plates = Array.from({ length: 5000 }, (_, i) => `لوح${10000 + i}`);
    const m = recordAppearances(newHistoryMap(), plates, { today: "2026-07-10", fingerprint: "big" }).map;
    const res = await backupHistory(AG, m, "2026-07-29");
    // jsdom مافيهوش CompressionStream فبيرجع JSON غير مضغوط — تحقّق الحد الأعلى
    expect(res.summaryBytes).toBeLessThan(600_000);
    expect(res.summaryBytes / 5000).toBeLessThan(120);   // < ١٢٠ بايت للوحة قبل الضغط
  });
});

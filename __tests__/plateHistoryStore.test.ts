// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { loadHistory, saveHistoryEntries, saveHistoryMap, clearHistory, countHistory } from "@/lib/plateHistoryStore";
import { recordAppearances, setPlateStatus, newHistoryMap, sheetFingerprint } from "@/lib/plateHistory";

const A1 = "agent-one";
const A2 = "agent-two";
const P1 = "ابح1234";
const P2 = "دمم5012";

describe("plateHistoryStore (على الجهاز، خاص لكل مندوب)", () => {
  beforeEach(async () => { await clearHistory(A1); await clearHistory(A2); });

  it("حفظ ثم قراءة السجل بيرجّع نفس البيانات", async () => {
    const fp = sheetFingerprint([P1, P2]);
    const { map } = recordAppearances(newHistoryMap(), [P1, P2], { today: "2026-05-05", fingerprint: fp });
    await saveHistoryMap(A1, map);

    const loaded = await loadHistory(A1);
    expect(loaded.size).toBe(2);
    expect(loaded.get(P1)!.firstSeen).toBe("2026-05-05");
    expect(loaded.get(P1)!.count).toBe(1);
    expect(loaded.get(P1)!.plate).toBe(P1);
  });

  it("سجل كل مندوب معزول تماماً عن التاني", async () => {
    const m1 = recordAppearances(newHistoryMap(), [P1], { today: "2026-05-05", fingerprint: "a" }).map;
    const m2 = recordAppearances(newHistoryMap(), [P2], { today: "2026-06-06", fingerprint: "b" }).map;
    await saveHistoryMap(A1, m1);
    await saveHistoryMap(A2, m2);

    const l1 = await loadHistory(A1);
    const l2 = await loadHistory(A2);
    expect([...l1.keys()]).toEqual([P1]);
    expect([...l2.keys()]).toEqual([P2]);
    // مسح سجل مندوب مايأثرش على التاني
    await clearHistory(A1);
    expect((await loadHistory(A1)).size).toBe(0);
    expect((await loadHistory(A2)).size).toBe(1);
  });

  it("التحديث (upsert) بيستبدل نفس اللوحة مش بيضيف تكرار", async () => {
    let m = recordAppearances(newHistoryMap(), [P1], { today: "2026-05-05", fingerprint: "a" }).map;
    await saveHistoryMap(A1, m);
    m = recordAppearances(m, [P1], { today: "2026-06-02", fingerprint: "b" }).map;
    m = setPlateStatus(m, P1, "taken", "2026-06-03");
    await saveHistoryMap(A1, m);

    const loaded = await loadHistory(A1);
    expect(loaded.size).toBe(1);
    expect(loaded.get(P1)!.count).toBe(2);
    expect(loaded.get(P1)!.status).toBe("taken");
    expect(loaded.get(P1)!.statusAt).toBe("2026-06-03");
    expect(await countHistory(A1)).toBe(1);
  });

  it("حفظ دفعة كبيرة (أكتر من حجم الدفعة) بيشتغل كامل", async () => {
    const plates = Array.from({ length: 2500 }, (_, i) => `لوح${1000 + i}`);
    const { map } = recordAppearances(newHistoryMap(), plates, { today: "2026-07-01", fingerprint: "big" });
    await saveHistoryEntries(A1, [...map.values()]);
    expect(await countHistory(A1)).toBe(2500);
    const loaded = await loadHistory(A1);
    expect(loaded.size).toBe(2500);
  });

  it("قراءة سجل مندوب مالوش سجل بترجّع خريطة فاضية", async () => {
    expect((await loadHistory("nobody")).size).toBe(0);
  });
});

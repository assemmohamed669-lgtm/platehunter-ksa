import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  saveFieldCheckEntries,
  getAllFieldCheckEntries,
  type FieldCheckEntry,
} from "@/lib/idb";

/**
 * الاسترجاع كان بيكتب السجلات واحد واحد (`await` جوّه لوب) — يعني ٦١١٠ معاملة
 * منفصلة على قاعدة الجهاز، وده اللي كان بيخلي المندوب يستنى دقايق لحد ما
 * سجلاته ترجع. الكتابة بالجملة بتخلّيها معاملة واحدة لكل دفعة.
 */
const mk = (i: number, agentId: string): FieldCheckEntry => ({
  id: `e${i}`,
  agentId,
  plate: `ابح${String(1000 + i).slice(0, 4)}`,
  row: { "الحي-الشارع": "العليا - الملك فهد" },
  method: "متشيكة بالكاميرا",
  checkedAt: new Date(2026, 0, 1 + (i % 28)).toISOString(),
});

describe("saveFieldCheckEntries — كتابة بالجملة", () => {
  it("بتكتب كل السجلات في معاملة واحدة", async () => {
    const agent = "agent-bulk-1";
    const entries = Array.from({ length: 500 }, (_, i) => mk(i, agent));
    await saveFieldCheckEntries(entries);
    const back = await getAllFieldCheckEntries(agent);
    expect(back).toHaveLength(500);
  });

  it("بتحافظ على كل الحقول زي ما هي", async () => {
    const agent = "agent-bulk-2";
    const one = mk(7, agent);
    one.lat = 21.5432;
    one.lng = 39.1987;
    one.mapsLink = "https://maps.google.com/?q=21.5432,39.1987";
    await saveFieldCheckEntries([one]);
    const back = (await getAllFieldCheckEntries(agent)).find((e) => e.id === one.id);
    expect(back).toBeTruthy();
    expect(back!.plate).toBe(one.plate);
    expect(back!.lat).toBe(21.5432);
    expect(back!.mapsLink).toBe(one.mapsLink);
    expect(back!.row["الحي-الشارع"]).toBe("العليا - الملك فهد");
  });

  it("نفس المعرّف بيتحدّث مش بيتكرر", async () => {
    const agent = "agent-bulk-3";
    await saveFieldCheckEntries([mk(1, agent)]);
    const updated = { ...mk(1, agent), plate: "دهو9999" };
    await saveFieldCheckEntries([updated]);
    const back = await getAllFieldCheckEntries(agent);
    expect(back).toHaveLength(1);
    expect(back[0].plate).toBe("دهو9999");
  });

  it("قايمة فاضية مابتكسرش", async () => {
    await expect(saveFieldCheckEntries([])).resolves.toBeUndefined();
  });
});

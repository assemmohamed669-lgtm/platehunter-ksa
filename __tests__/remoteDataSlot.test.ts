import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { ingestRemoteData, loadLocalRemoteData, clearRemoteData } from "@/lib/remoteDataSlot";
import { MEMBER_DATA_SLOT } from "@/lib/memberData";

/** 📥 داتا العضو المتنزّلة ⇒ سلوت على الموبايل (زي داتا المجموعة): تتقري وتتحفظ بتاريخ النسخة وتتشال. */
function xlsxFile(rows: Record<string, string>[], name = "مكة.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "داتا");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new File([out], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("🔴 داتا العضو على الموبايل", () => {
  it("ملف صغير ⇒ صفوفه + تاريخ النسخة، وبترجع بعد إعادة الفتح من غير تنزيل", async () => {
    const f = xlsxFile([{ "رقم اللوحة": "رقه9312", "الحي": "العزيزية" }, { "رقم اللوحة": "سحه6216", "الحي": "الشوقية" }]);
    const s = await ingestRemoteData(MEMBER_DATA_SLOT, f, "2026-10-15T08:00:00Z", 12 * 1024 * 1024);
    expect(s.streamed).toBe(false);
    expect(s.table.rows.length).toBe(2);
    const again = await loadLocalRemoteData(MEMBER_DATA_SLOT);
    expect(again).toMatchObject({ fileName: "مكة.xlsx", uploadedAt: "2026-10-15T08:00:00Z", streamed: false });
    expect(again!.table.rows.map((r) => r["الحي"])).toEqual(["العزيزية", "الشوقية"]);
  });
  it("ملف كبير (فوق العتبة) ⇒ دفعات على الموبايل (زي الداتا الكبيرة)", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ "رقم اللوحة": `رقه${1000 + i}`, "الحي": `حي ${i}` }));
    const s = await ingestRemoteData(MEMBER_DATA_SLOT, xlsxFile(rows), "2026-10-15T09:00:00Z", 10);
    expect(s.streamed).toBe(true);
    expect(s.streamMeta?.rowCount).toBe(50);
    expect((await loadLocalRemoteData(MEMBER_DATA_SLOT))?.streamed).toBe(true);
  });
  it("المسئول شاله ⇒ بيتمسح من الموبايل", async () => {
    await clearRemoteData(MEMBER_DATA_SLOT);
    expect(await loadLocalRemoteData(MEMBER_DATA_SLOT)).toBeNull();
  });
});

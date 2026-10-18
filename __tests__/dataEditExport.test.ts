import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";
import { exportDataFile, startXlsxExport, DATA_EDIT_FOR_ALL } from "@/lib/dataEdit";
import { saveUploadedFile } from "@/lib/idb";
import { importRowsToData, clearData } from "@/lib/dataStore";

/**
 * 📗 تصدير الشيت بعد التعديل بالصيغتين — المالك (١٨ أكتوبر ٢٠٢٦): «خليها يبقي فيها الاخيارين انه يختار يصدر الملف باي
 * صيغه» + «لو تقدر تخليه يبقي اسرع» + «راجع كل حاجه … وانشر للكل».
 */
const H = ["رقم اللوحة", "الحي", "رقم العقد"];
const mk = (n: number, plate?: string) => ({ "رقم اللوحة": plate ?? `ر ق ه ${1000 + n}`, "الحي": `حي ${n}`, "رقم العقد": n === 0 ? "0055" : String(n) });
const big = { kind: "large" as const, slot: "data", store: "data" };
const readAoa = async (b: Blob) => {
  const wb = XLSX.read(new Uint8Array(await b.arrayBuffer()), { type: "array" });
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
};

describe("🔴 الملف الكبير بالصيغتين", () => {
  beforeEach(async () => {
    await clearData("data");
    await importRowsToData(Array.from({ length: 12 }, (_, i) => mk(i, i === 3 ? "رقه9312" : undefined)), H, { slot: "data", fileName: "داتا كبيرة.xlsx" });
  });

  it("xlsx ⇒ «حتة حتة» (حتى لو أكبر من حد الـCSV) والقيم نص زي ما هي", async () => {
    const seen: number[] = [];
    const out = await exportDataFile(big, { format: "xlsx", csvAbove: 1, onRows: (n) => seen.push(n) });
    expect(out.ext).toBe("xlsx");
    expect(out.name).toMatch(/^داتا كبيرة-معدّل-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(out.rtlDone).toBe(true);
    const aoa = await readAoa(out.blob);
    expect(aoa[0]).toEqual(H);
    expect(aoa.length).toBe(13);
    expect(aoa[1][2]).toBe("0055");
    expect(aoa.some((r) => r[0] === "رقه9312")).toBe(true);
    expect(seen[seen.length - 1]).toBe(12);
  });

  it("CSV ⇒ CSV (زي الأول)", async () => {
    const out = await exportDataFile(big, { format: "csv" });
    expect(out.ext).toBe("csv");
    expect((await out.blob.text()).split("\r\n")[0]).toBe("رقم اللوحة,الحي,رقم العقد");
  });

  it("موبايل قديم مافيهوش أداة الضغط ⇒ CSV ويتقال إنه اتحوّل", async () => {
    const saved = (globalThis as { CompressionStream?: unknown }).CompressionStream;
    (globalThis as { CompressionStream?: unknown }).CompressionStream = undefined;
    try {
      const out = await exportDataFile(big, { format: "xlsx", csvAbove: 1 });
      expect(out.ext).toBe("csv");
      expect(out.fellBack).toBe(true);
    } finally {
      (globalThis as { CompressionStream?: unknown }).CompressionStream = saved;
    }
  });

  it("من غير صيغة ⇒ زي الأول بالظبط («فتح» في الفرز)", async () => {
    expect((await exportDataFile(big, { csvAbove: 1 })).ext).toBe("csv");
    expect((await exportDataFile(big)).ext).toBe("xlsx");
  });
});

describe("🔴 الملف الصغير بالصيغتين", () => {
  it("xlsx وCSV", async () => {
    await saveUploadedFile({ key: "local:data", agentId: "local", slot: "data", fileName: "داتا.xlsx", headers: H, rows: [mk(0), mk(1)], uploadedAt: "2026-10-18T10:00:00Z" });
    const small = { kind: "small" as const, slot: "data" };
    expect((await exportDataFile(small, { format: "xlsx" })).ext).toBe("xlsx");
    const csv = await exportDataFile(small, { format: "csv" });
    expect(csv.ext).toBe("csv");
    expect(await csv.blob.text()).toContain("0055");
  });
});

describe("🔴 بيتجهّز في الخلفية بعد الحفظ (المشاركة فورية)", () => {
  beforeEach(async () => {
    await clearData("data");
    await importRowsToData([mk(0), mk(1), mk(2)], H, { slot: "data", fileName: "داتا كبيرة.xlsx" });
  });
  it("نفس الملف ونفس النسخة ⇒ نفس التجهيز (مابيبنيش مرتين)", async () => {
    const a = startXlsxExport(big, "v1");
    const b = startXlsxExport(big, "v1");
    expect(a).toBe(b);
    expect((await a.promise).ext).toBe("xlsx");
    expect(a.done).toBe(3);
  });
  it("نسخة جديدة (اتحفظ تعديل تاني) ⇒ تجهيز جديد", async () => {
    const a = startXlsxExport(big, "v1");
    const c = startXlsxExport(big, "v2");
    expect(c).not.toBe(a);
    await Promise.all([a.promise, c.promise]);
  });
});

describe("🔴 الصفحة", () => {
  const P = readFileSync(path.resolve(__dirname, "..", "app/(app)/data-edit/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("زرارين: Excel وCSV", () => {
    expect(P).toMatch(/doExport\("xlsx"\)/);
    expect(P).toMatch(/doExport\("csv"\)/);
    expect(P).toMatch(/تصدير Excel/);
    expect(P).toMatch(/تصدير CSV/);
  });
  it("بعد الحفظ بيبدأ يجهّز الإكسيل في الخلفية", () => {
    expect(P).toMatch(/startXlsxExport\(file\.ref, /);
  });
  it("الملف المتجهّز ماتفتحش تاني في الذاكرة وهو بيتشارك", () => {
    expect(P).toMatch(/rtlDone: out\.rtlDone/);
  });
  it("🔓 «انشر للكل»", () => {
    expect(DATA_EDIT_FOR_ALL).toBe(true);
  });
});

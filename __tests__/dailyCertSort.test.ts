import { describe, it, expect } from "vitest";
import { runDailyCertSort, type CertDataSource, type DailyCertSortInput } from "@/lib/dailyCertSort";
import type { DailyCertEntry } from "@/lib/certDaily";
import type { FieldCheckEntry } from "@/lib/idb";
import type { ChassisRecord } from "@/lib/chassisRecords";
import { bankPlateToArabic } from "@/lib/plateParser";

/** نفس شكل اللوحة في صفوف فرز المطلوب. */
const disp = (p: string) => bankPlateToArabic(p).trim();

/**
 * 📄 محرّك «شهايد النهارده» — المالك (٥ أكتوبر ٢٠٢٦):
 *  · «لما بضيف داتا اضافيه مش بيرفرز عليها بيفرز علي مربع الداتا الاساسيه فقط» ⇒ الملف اللي على
 *    الجهاز (كبير/متعدد الورقات) بيتقري كله، مش العيّنة (٥٠ صف).
 *  · «هل بيفرز بردو علي السجلات ... يدوي او صوتي او شاص او صورة ولو لا خليه يفرز» ⇒ سجلات الشاص
 *    بتتطابق برقم الشاص اللي في الشهادة.
 */
const cert = (o: Partial<DailyCertEntry>): DailyCertEntry => ({
  fileId: "F1", name: "8377.pdf", createdAt: "2026-10-05T05:00:00.000Z", plate: "رقح8377", plateText: "ر ق ح 8377",
  vin: "MR0FA3CD100123456", bank: "مصرف الراجحي", make: "تويوتا", model: "هايلكس", year: "2021", color: "ابيض",
  status: "متعثر", certDate: "05/10/2026", ...o,
});
const dataRow = (plate: string, extra: Record<string, string> = {}) => ({ "رقم اللوحة": plate, "النوع": "ونيت", "العنوان": "شارع الملك فهد", ...extra });

function input(o: Partial<DailyCertSortInput>): DailyCertSortInput {
  return {
    certs: [cert({})], sources: [], iterate: async () => {}, fieldEntries: [], chassisRecords: [],
    checkPlates: new Set(), checkVins: new Set(), fmtDate: (iso) => `تاريخ:${iso.slice(0, 10)}`, ...o,
  };
}

describe("🔴 الداتا اللي على الجهاز بتتقري كلها", () => {
  it("🔴 الملف الكبير: اللوحة في الدفعة التالتة (مش في العيّنة) بتطلع — بموضعها الحقيقي", async () => {
    const batches = [
      [dataRow("ا ب ح 1111"), dataRow("ا ب ح 2222")],
      [dataRow("ا ب ح 3333"), dataRow("ا ب ح 4444")],
      [dataRow("ا ب ح 5555"), dataRow("ر ق ح 8377", { "الحي": "النسيم" })],
    ];
    const slots: string[] = [];
    const src: CertDataSource = { kind: "stream", slot: "xdata-2", headers: Object.keys(dataRow("x")), sample: batches[0], plateCol: "رقم اللوحة" };
    const out = await runDailyCertSort(input({
      sources: [src],
      iterate: async (slot, onBatch) => { slots.push(slot); let base = 0; for (const b of batches) { await onBatch(b, base); base += b.length; } },
    }));
    expect(slots).toEqual(["xdata-2"]);
    expect(out.dataRows).toHaveLength(1);
    expect(out.dataRows[0]).toMatchObject({ plate: disp("ر ق ح 8377"), srcIdx: 0, dataIdx: 5, address: "شارع الملك فهد" });
    expect(out.dataRows[0].dataRow?.["رقم اللوحة"]).toBe("ر ق ح 8377");
    expect(out.plateCols).toEqual(["رقم اللوحة"]);
  });

  it("🔴 الأساسي + الإضافي مع بعض (ذاكرة وجهاز) — كل واحد بمصدره", async () => {
    const mem: CertDataSource = { kind: "mem", headers: Object.keys(dataRow("x")), rows: [dataRow("د ه و 1"), dataRow("ر ق ح 8377")] };
    const big: CertDataSource = { kind: "stream", slot: "xdata-3", headers: ["اللوحه", "الشارع"], sample: [], plateCol: null };
    const out = await runDailyCertSort(input({
      certs: [cert({}), cert({ fileId: "F2", plate: "سصط5678", plateText: "س ص ط 5678", vin: "" })],
      sources: [mem, big],
      iterate: async (_slot, onBatch) => { await onBatch([{ "اللوحه": "س ص ط 5678", "الشارع": "طريق الملك عبدالله" }], 0); },
    }));
    expect(out.dataRows.map((r) => [r.plate, r.srcIdx, r.dataIdx])).toEqual([[disp("ر ق ح 8377"), 0, 1], [disp("س ص ط 5678"), 1, 0]]);
    expect(out.dataRows[1].certFile).toEqual({ id: "F2", name: "8377.pdf" });
  });
});

describe("🔴 السجلات: يدوي/صوتي/صورة باللوحة · الشاص برقم الشاص", () => {
  const entry = (o: Partial<FieldCheckEntry>): FieldCheckEntry => ({
    id: "e1", plate: "ر ق ح 8377", row: { "النوع": "ونيت", "الشارع": "شارع التخصصي", "الحي": "العليا" }, method: "متشيكة بالصوت",
    checkedAt: "2026-10-05T09:00:00.000Z", mapsLink: "https://maps.google.com/?q=1,2", ...o,
  });
  const chassis = (o: Partial<ChassisRecord>): ChassisRecord => ({
    id: "ch1", chassis: "mr0fa3cd100123456", vehicleType: "ونيت", region: "حي الملز", found: false,
    mapsLink: "https://maps.google.com/?q=3,4", checkedAt: "2026-10-05T10:00:00.000Z", ...o,
  });

  it("🔴 سجل الشاص بيتطابق برقم الشاص اللي في الشهادة (واللوحة من الشهادة)", async () => {
    const out = await runDailyCertSort(input({ chassisRecords: [chassis({}), chassis({ id: "ch2", chassis: "JTDBR32E720012345" })] }));
    expect(out.recordRows).toHaveLength(1);
    expect(out.recordRows[0]).toMatchObject({ plate: disp("ر ق ح 8377"), type: "ونيت", address: "حي الملز", date: "تاريخ:2026-10-05", mapsLink: "https://maps.google.com/?q=3,4" });
  });
  it("🔴 سجل يدوي/صوتي/صورة باللوحة — ولو مكتوب فيه رقم شاص بيتطابق بيه", async () => {
    const out = await runDailyCertSort(input({ fieldEntries: [entry({}), entry({ id: "e2", plate: "MR0FA3CD100123456", method: "متشيكة بالشاصي" }), entry({ id: "e3", plate: "ل م ن 4444" })] }));
    expect(out.recordRows.map((r) => r.plate)).toEqual([disp("ر ق ح 8377"), disp("ر ق ح 8377")]);
    expect(out.recordRows[0]).toMatchObject({ type: "ونيت", address: "شارع التخصصي", district: "العليا", date: "تاريخ:2026-10-05" });
  });
});

describe("🔴 الحالة: مطلوبة لو اللوحة أو الشاص في شيت التشييك", () => {
  const src: CertDataSource = { kind: "mem", headers: Object.keys(dataRow("x")), rows: [dataRow("ر ق ح 8377")] };
  it("🔴 باللوحة", async () => {
    const out = await runDailyCertSort(input({ sources: [src], checkPlates: new Set(["رقح8377"]) }));
    expect(out.dataRows[0].wantedStatus).toBe("مطلوبة");
  });
  it("🔴 بالشاص (الشيت فيه الشاص بس)", async () => {
    const out = await runDailyCertSort(input({ sources: [src], checkVins: new Set(["MR0FA3CD100123456"]) }));
    expect(out.dataRows[0].wantedStatus).toBe("مطلوبة");
  });
  it("مش موجودة ⇒ تثبيت", async () => {
    const out = await runDailyCertSort(input({ sources: [src] }));
    expect(out.dataRows[0].wantedStatus).toBe("تثبيت");
  });
});

describe("🔴 بيانات الصف بأعمدة المالك", () => {
  it("🔴 النوع من الداتا · نوع المركبة من الشهادة · المؤجر من الشهادة", async () => {
    const src: CertDataSource = { kind: "mem", headers: Object.keys(dataRow("x")), rows: [dataRow("ر ق ح 8377")] };
    const out = await runDailyCertSort(input({ sources: [src] }));
    expect(out.dataRows[0]).toMatchObject({ type: "ونيت", vehicleModel: "هايلكس", brand: "تويوتا", bank: "مصرف الراجحي", vin: "MR0FA3CD100123456" });
  });
  it("نوع المركبة ناقص من الشهادة ⇒ من ماركة الداتا", async () => {
    const src: CertDataSource = { kind: "mem", headers: ["رقم اللوحة", "الماركة"], rows: [{ "رقم اللوحة": "ر ق ح 8377", "الماركة": "كامري" }] };
    const out = await runDailyCertSort(input({ certs: [cert({ model: "", make: "" })], sources: [src] }));
    expect(out.dataRows[0].vehicleModel).toBe("كامري");
  });
});

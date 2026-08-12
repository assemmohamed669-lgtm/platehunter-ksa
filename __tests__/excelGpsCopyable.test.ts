import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildExcelBlob, buildColoredSortExcel } from "@/lib/excel";

/**
 * المندوب بيفتح الإكسيل اللي البرنامج شاركه، بيعمل **نسخ** لصف سيارة بكل
 * بياناتها ويبعتها على واتساب — والموقع مابيشتغلش عند اللي واصلاه.
 *
 * السبب: خانة الموقع كانت بتتكتب بكلمة «خريطة» والرابط جوّه الـhyperlink بس.
 * الـhyperlink مابيتنسخش مع النص — فاللي بيتلصق في واتساب هو كلمة «خريطة».
 *
 * الحل: نص الخانة نفسه يبقى **الرابط** (ولسه قابل للدوس جوّه إكسيل). كده
 * النسخ بياخد الرابط، وواتساب بيخليه قابل للضغط عند المستقبِل.
 */

const PIN = "https://maps.app.goo.gl/TiYvx13pEkZ7sHFH6";

async function cellsOf(blob: Blob) {
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
  return wb.Sheets[wb.SheetNames[0]];
}

describe("الإكسيل المشارَك — خانة الموقع بتتنسخ كرابط شغّال", () => {
  it("buildExcelBlob: نص الخانة = الرابط مش كلمة «خريطة»", async () => {
    const ws = await cellsOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "GPS": PIN }], "تشييك"));
    expect(ws["B2"].v).toBe(PIN);
    expect(String(ws["B2"].v)).not.toBe("خريطة");
  });

  it("buildExcelBlob: الخانة لسه قابلة للدوس جوّه إكسيل", async () => {
    const ws = await cellsOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "GPS": PIN }], "تشييك"));
    expect(ws["B2"].l?.Target).toBe(PIN);
  });

  it("buildExcelBlob: الرابط المشفّر (&amp;amp;) بيتنضّف قبل ما يتكتب", async () => {
    const dirty = "https://www.google.com/maps?q=21.5,39.2&amp;amp;z=17";
    const ws = await cellsOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "GPS": dirty }], "تشييك"));
    expect(String(ws["B2"].v)).not.toContain("&amp;");
    expect(String(ws["B2"].v)).toContain("21.5,39.2");
  });

  it("buildColoredSortExcel (نتيجة الفرز والمطلوب): نص الخانة = الرابط", { timeout: 30_000 }, async () => {
    const blob = await buildColoredSortExcel(
      [{ "المطلوب": "ابح1234", "GPS": PIN }], "نتائج الفرز", [null],
    );
    const ws = await cellsOf(blob);
    expect(ws["B2"].v).toBe(PIN);
    expect(ws["B2"].l?.Target).toBe(PIN);
  });

  it("خانة من غير موقع بتفضل زي ما هي", async () => {
    const ws = await cellsOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "GPS": "" }], "تشييك"));
    expect(ws["B2"]?.v ?? "").toBe("");
  });

  it("النص العادي في خانة تانية مابيتلمسش", async () => {
    const ws = await cellsOf(buildExcelBlob([{ "رقم اللوحة": "ابح1234", "الحي": "الواحة" }], "تشييك"));
    expect(ws["B2"].v).toBe("الواحة");
    expect(ws["B2"].l).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { indexDailyCerts, certResultRow } from "@/lib/dailyCertMatch";
import { certFullRow, certDataCols } from "@/components/WantedResultsTable";
import { DAILY_CERTS_FOR_ALL, type DailyCertEntry } from "@/lib/certDaily";

/**
 * 📄 «شهايد النهارده» في صفحة المطلوب — المالك (٥ أكتوبر ٢٠٢٦): النتيجة ببيانات الشهادة ومكان
 * العربية، و«اللي في شيت التشييك يتكتب قدامها مطلوبه واللي مش في شيت التشييك يتكتب قدامها تثبيت»
 * في عمود «الحالة» آخر الويندو.
 */
const cert = (o: Partial<DailyCertEntry>): DailyCertEntry => ({
  fileId: "F1", name: "ا ب ح 1234.pdf", createdAt: "2026-10-05T05:00:00.000Z", plate: "ابح1234", plateText: "ا ب ح 1234",
  vin: "1HGCM82633A004352", bank: "مصرف الراجحي", make: "تويوتا", model: "كامري", year: "2021", color: "ابيض",
  status: "متعثر", certDate: "05/10/2026", ...o,
});
const place = { id: "d1", plate: "ا ب ح 1234", norm: "ابح1234", address: "شارع الملك فهد", district: "النسيم", mapsLink: "https://maps.google.com/?q=24.7,46.6", date: "04-10-2026 21:00", color: "", year: "" };

describe("🔴 صف النتيجة", () => {
  it("🔴 بيانات الشهادة + مكان العربية + زرار الشهادة · «مطلوبة» لو في شيت التشييك", () => {
    const r = certResultRow(place, cert({}), true);
    expect(r).toMatchObject({
      plate: "ا ب ح 1234", bank: "مصرف الراجحي", vin: "1HGCM82633A004352", brand: "تويوتا كامري", year: "2021",
      color: "ابيض", contract: "متعثر", certDate: "05/10/2026", address: "شارع الملك فهد", district: "النسيم",
      mapsLink: place.mapsLink, date: place.date, certFile: { id: "F1", name: "ا ب ح 1234.pdf" }, wantedStatus: "مطلوبة",
    });
  });
  it("🔴 مش في شيت التشييك ⇒ «تثبيت» · الناقص من الشهادة بيتاخد من الداتا", () => {
    const r = certResultRow({ ...place, color: "اسود", year: "2019" }, cert({ color: "", year: "", make: "", model: "" }), false);
    expect(r).toMatchObject({ wantedStatus: "تثبيت", color: "اسود", year: "2019" });
  });
  it("🔴 «الحالة» آخر عمود في التصدير", () => {
    const keys = Object.keys(certFullRow(certResultRow(place, cert({}), true)));
    expect(keys[0]).toBe("رقم اللوحة");
    expect(keys[keys.length - 1]).toBe("الحالة");
    expect(certDataCols([certResultRow(place, cert({}), true)])).toEqual([
      "البنك", "الشاص", "الماركة", "سنة الصنع", "اللون", "حالة العقد", "تاريخ الشهادة", "العنوان", "الحي", "GPS", "تاريخ التسجيل",
    ]);
  });
  it("نفس اللوحة من كذا شركة ⇒ شهادة واحدة", () => {
    const m = indexDailyCerts([cert({ fileId: "a", bank: "" }), cert({ fileId: "b" }), cert({ fileId: "c", plate: "دهو5678" })]);
    expect(m.size).toBe(2);
    expect(m.get("ابح1234")?.fileId).toBe("b");
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  it("🔴 صفحة المطلوب: الجملة الخضرا بعدد شهايد النهارده · الزرار · نافذتين · سوبر أدمن الأول", () => {
    expect(DAILY_CERTS_FOR_ALL).toBe(false);
    const p = read("app/(app)/wanted/page.tsx");
    expect(p).toMatch(/DAILY_CERTS_FOR_ALL \|\| isSuper/);
    expect(p).toMatch(/\/api\/certificate\/daily/);
    expect(p).toMatch(/النهارده نزل \{n\(daily\.total\)\} شهادة جديدة — هيتم الفرز عليها/);
    expect(p).toMatch(/text-green/);
    expect(p).toMatch(/افرز على شهايد النهارده/);
    expect(p).toMatch(/شهايد النهارده في الداتا/);
    expect(p).toMatch(/شهايد النهارده في السجلات/);
    expect(p).toMatch(/mode=\{certs \? "certs" : "wanted"\}/);
    expect(p).toMatch(/showNeighbors, true\)/);
    expect(p).toMatch(/certResultRow\(/);
    // فرز المطلوب العادي زي ما هو
    expect(p).toMatch(/async function runSort\(\)/);
    expect(p).toMatch(/فرز المطلوبين/);
  });
  it("الدورة كل دقيقة + الجدول للسيرفر بس", () => {
    const crons = JSON.parse(read("vercel.json")).crons as { path: string }[];
    expect(crons.map((c) => c.path)).toContain("/api/cron/cert-daily");
    const sql = read("docs/sql/cert-daily.sql");
    expect(sql).toMatch(/create table if not exists public\.cert_daily/);
    expect(sql).toMatch(/alter table public\.cert_daily enable row level security/);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.cert_daily to service_role/);
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/national|هوية|tenant|المستأجر text/);
  });
});

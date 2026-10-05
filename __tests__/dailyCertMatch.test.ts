import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { indexDailyCerts, indexDailyCertsByVin, certResultRow } from "@/lib/dailyCertMatch";
import { certDisplayCols, certExportRow, DEFAULT_CERT_COL_PREFS } from "@/lib/certColumns";
import { DAILY_CERTS_FOR_ALL, type DailyCertEntry } from "@/lib/certDaily";

/**
 * 📄 «شهايد النهارده» — المالك (٥ أكتوبر ٢٠٢٦): النتيجة ببيانات الشهادة ومكان العربية، و«اللي في
 * شيت التشييك يتكتب قدامها مطلوبه واللي مش في شيت التشييك يتكتب قدامها تثبيت». وبعدين: نفس الميزة
 * «ل مشتركين الصوت فقط في الصفحه اللي فيها بحث علي الشهايد»، والأعمدة بترتيبه.
 */
const cert = (o: Partial<DailyCertEntry>): DailyCertEntry => ({
  fileId: "F1", name: "ا ب ح 1234.pdf", createdAt: "2026-10-05T05:00:00.000Z", plate: "ابح1234", plateText: "ا ب ح 1234",
  vin: "1HGCM82633A004352", bank: "مصرف الراجحي", make: "تويوتا", model: "كامري", year: "2021", color: "ابيض",
  status: "متعثر", certDate: "05/10/2026", ...o,
});
const place = { id: "d1", plate: "ا ب ح 1234", norm: "ابح1234", type: "سيدان", address: "شارع الملك فهد", district: "النسيم", mapsLink: "https://maps.google.com/?q=24.7,46.6", date: "04-10-2026 21:00", color: "", year: "" };

describe("🔴 صف النتيجة", () => {
  it("🔴 بيانات الشهادة + مكان العربية + زرار الشهادة · «مطلوبة» لو في شيت التشييك", () => {
    const r = certResultRow(place, cert({}), true);
    expect(r).toMatchObject({
      plate: "ا ب ح 1234", type: "سيدان", vehicleModel: "كامري", brand: "تويوتا", bank: "مصرف الراجحي", vin: "1HGCM82633A004352",
      year: "2021", color: "ابيض", contract: "متعثر", certDate: "05/10/2026", address: "شارع الملك فهد", district: "النسيم",
      mapsLink: place.mapsLink, date: place.date, certFile: { id: "F1", name: "ا ب ح 1234.pdf" }, wantedStatus: "مطلوبة",
    });
  });
  it("🔴 مش في شيت التشييك ⇒ «تثبيت» · الناقص من الشهادة بيتاخد من الداتا", () => {
    const r = certResultRow({ ...place, color: "اسود", year: "2019" }, cert({ color: "", year: "", make: "", model: "" }), false);
    expect(r).toMatchObject({ wantedStatus: "تثبيت", color: "اسود", year: "2019" });
  });
  it("🔴 تصدير الأعمدة الأساسية: رقم اللوحة أول، والمؤجر آخر", () => {
    const keys = Object.keys(certExportRow(certResultRow(place, cert({}), true), certDisplayCols(DEFAULT_CERT_COL_PREFS)));
    expect(keys).toEqual(["رقم اللوحة", "النوع", "نوع المركبة", "العنوان", "GPS", "تاريخ التسجيل", "الحالة", "المؤجر"]);
  });
  it("نفس اللوحة من كذا شركة ⇒ شهادة واحدة (باللوحة وبالشاص)", () => {
    const list = [cert({ fileId: "a", bank: "" }), cert({ fileId: "b" }), cert({ fileId: "c", plate: "دهو5678", vin: "JTDBR32E720012345" })];
    const m = indexDailyCerts(list);
    expect(m.size).toBe(2);
    expect(m.get("ابح1234")?.fileId).toBe("b");
    const v = indexDailyCertsByVin(list);
    expect(v.get("1HGCM82633A004352")?.fileId).toBe("b");
    expect(v.get("JTDBR32E720012345")?.fileId).toBe("c");
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  it("🔴 المربع: الجملة الخضرا بعدد شهايد النهارده · الزرار · نافذتين (فبيبان جاية منين)", () => {
    const c = read("components/DailyCertSort.tsx");
    expect(c).toMatch(/\/api\/certificate\/daily/);
    expect(c).toMatch(/النهارده نزل \{n\(daily\.total\)\} شهادة جديدة — هيتم الفرز عليها/);
    expect(c).toMatch(/text-green/);
    expect(c).toMatch(/`افرز على شهايد \$\{label\}`/);
    expect(c).toMatch(/windowBlock\(`شهايد \$\{resultName\} في الداتا`, "dataRows", locate\)/);
    expect(c).toMatch(/windowBlock\(`شهايد \$\{resultName\} في السجلات`, "recordRows"\)/);
    expect(c).toMatch(/\/api\/certificate\/daily\?offset=\$\{offset\}/);
    expect(c).toMatch(/mode="certs" certCols=\{cols\}/);
    expect(c).toMatch(/getChassisRecords\(\)/);
    expect(c).toMatch(/combinedCheckPlates\(checkSources\)/);
  });
  it("🔴 صفحة المطلوب: نفس المربع — السوبر أدمن الأول · فرز المطلوب العادي زي ما هو", () => {
    expect(DAILY_CERTS_FOR_ALL).toBe(false);
    const p = read("app/(app)/wanted/page.tsx");
    expect(p).toMatch(/DAILY_CERTS_FOR_ALL \|\| isSuper/);
    expect(p).toMatch(/\{certsAllowed && <DailyCertSort variant="sorting" \/>\}/);
    expect(p).toMatch(/async function runSort\(\)/);
    expect(p).toMatch(/فرز المطلوبين/);
  });
  it("🔴 تبويب «شهايد» لمشتركين الصوت فقط: نفس المربع على داتا المجموعة", () => {
    const p = read("app/(app)/instant-check/page.tsx");
    expect(p).toMatch(/\{voiceOnly && mode === "cert" && DAILY_CERTS_FOR_ALL && \(\s*<DailyCertSort variant="team" \/>/);
  });
  it("🔴 فرز المطلوب العادي: الداتا الإضافية الكبيرة بتتقري من الجهاز (مش العيّنة)", () => {
    const p = read("app/(app)/wanted/page.tsx");
    const sort = p.slice(p.indexOf("async function runSort()"), p.indexOf("function deleteFromData("));
    expect(sort).toMatch(/if \(rec\.streamed && rec\.streamSlot\) \{/);
    expect(sort).toMatch(/\}, \{ slot \}\);/);
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

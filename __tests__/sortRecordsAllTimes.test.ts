import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { recordResultRows, collapseGroupRecordRepeats } from "@/lib/recordResultDedupe";

/**
 * 👥 الفرز العادي — كل مرة اتسجلت فيها العربية من كل أعضاء المجموعة. المالك (١٣ أكتوبر ٢٠٢٦، مجموعة احمد حسين
 * — «رمر6579» احمد شيّكها ٣ مرات وعلي ومحمد حسين مرة، والفرز كان بيطلّع آخر مرة بس فبتطلع «مع علي ومع احمد لا»):
 * «لو كل واحد فيهم مسجل اللوحه دي مرة او اكثر يطلع في نتيجه الفرز ... وحتي لو فيهم حد مسجلها اكتر من مرة بردو
 * تطلع معاهم المكرر». (زي «لصق نصي» #395 — الفرز العادي كان لسه الأحدث بس من #244.) السوبر أدمن الأول.
 */
type R = { plate: string; date: string; who: string };
const rows: R[] = [
  { plate: "رمر6579", date: "11-08-2026 14:49", who: "احمد" },
  { plate: "حبك1234", date: "05-10-2026 10:00", who: "علي" },
  { plate: "رمر6579", date: "04-10-2026 00:29", who: "علي" },
  { plate: "رمر6579", date: "01-09-2026 12:39", who: "احمد" },
  { plate: "ر م ر 6579", date: "02-10-2026 21:25", who: "محمد" },
  { plate: "رمر6579", date: "28-08-2026 06:18", who: "احمد" },
];
const run = (allTimes: boolean) => recordResultRows(rows, (r) => r.plate, (r) => r.date, allTimes);

describe("🔴 كل المرات (السوبر أدمن)", () => {
  it("🔴 رمر6579: احمد ٣ مرات + علي + محمد ⇒ ٥ صفوف تحت بعض والأحدث فوق", () => {
    const out = run(true);
    expect(out.map((r) => `${r.plate.replace(/ /g, "")}·${r.who}`)).toEqual([
      "رمر6579·علي", "رمر6579·محمد", "رمر6579·احمد", "رمر6579·احمد", "رمر6579·احمد",
      "حبك1234·علي",
    ]);
  });
  it("🔒 غير السوبر أدمن: زي ما هو بالحرف — الأحدث بس لكل لوحة", () => {
    expect(run(false).map((r) => `${r.plate.replace(/ /g, "")}·${r.who}`)).toEqual(["رمر6579·علي", "حبك1234·علي"]);
  });
});

describe("🔴 سجلات الزمايل من السيرفر: الإرسال المكرر لنفس التشييك يتلم (زي سجلاتي على الجهاز)", () => {
  const g = (agent_id: string, checked_at: string, maps_link: string | null = "https://maps.google.com/?q=24.7,46.6") =>
    ({ plate: "رمر6579", agent_id, checked_at, maps_link });
  it("🔴 نفس المندوب · نفس الدقيقة · نفس المكان ⇒ مرة واحدة", () => {
    expect(collapseGroupRecordRepeats([g("علي", "2026-10-04T00:29:10Z"), g("علي", "2026-10-04T00:29:40Z")])).toHaveLength(1);
  });
  it("🔴 مندوبين مختلفين في نفس اللحظة ⇒ الاتنين", () => {
    expect(collapseGroupRecordRepeats([g("علي", "2026-10-04T00:29:10Z"), g("محمد", "2026-10-04T00:29:10Z")])).toHaveLength(2);
  });
  it("🔴 نفس المندوب في يومين ⇒ الاتنين", () => {
    expect(collapseGroupRecordRepeats([g("علي", "2026-10-04T00:29:10Z"), g("علي", "2026-10-02T21:25:00Z")])).toHaveLength(2);
  });
});

describe("🔴 التوصيل في صفحة الفرز", () => {
  const p = readFileSync(path.resolve(__dirname, "..", "app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 الكلي والجديد بيستخدموا «كل المرات» للسوبر أدمن بس", () => {
    expect(p.match(/finalTashyeek = dedupeTashyeek\(finalTashyeek, allRecordTimesRef\.current\);/g)).toHaveLength(2);
    expect(p).toMatch(/allRecordTimesRef\.current = \(sp as \{ is_super\?: boolean \} \| null\)\?\.is_super === true;/);
  });
  it("🔴 الإرسال المكرر من السيرفر بيتلم بس في «كل المرات»", () => {
    expect(p).toMatch(/const clean = allRecordTimesRef\.current \? collapseGroupRecordRepeats\(raw\) : raw;/);
  });
  it("🔴 ويندو السجلات: نفس العربية بلون واحد + «N سيارة (M مرة)» — للسوبر أدمن بس", () => {
    expect(p).toMatch(/const tashDupColorMap = useMemo\(/);
    expect(p).toMatch(/const dupIdx = allRecordTimes \? tashDupColorMap\.map\.get\(/);
    expect(p).toMatch(/\$\{sel \? "bg-primary\/15" : dupIdx !== undefined \? DUPE_COLORS\[dupIdx\]\.tw : "bg-primary\/5 hover:bg-primary\/10"\}/);
    expect(p).toMatch(/allRecordTimes && tashDupColorMap\.unique < tashyeekResults\.length/);
  });
  it("🔒 نداء بيانات المجموعة القديم زي ما هو (مالمسناهوش)", () => {
    expect(p).toMatch(/\.select\("username, team"\)\.eq\("id", au\.user\.id\)\.single\(\);/);
  });
});

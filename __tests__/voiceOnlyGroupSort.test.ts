import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupRecordsToRows, fetchGroupRecordRows, REC_PLATE_COL } from "@/lib/voiceOnlyRecords";

/**
 * 👥 **«صوت فقط» يفرز على سجلات المجموعة كلها** (طلب المالك ١ أكتوبر ٢٠٢٦).
 *
 * تبويب «فرز» جوّه صفحة التشييك (للمشترك صوت فقط) كان بيفرز على سجلاته هو + ملف
 * داتا المجموعة بس — سجلات زمايله ماكانتش بتدخل، ومالوش «فرز على سجلات المجموعة»
 * في القايمة. دلوقتي بيجيب سجلات الزمايل المطابقة من السيرفر (match_group_plates،
 * مربوطة بزرار «مشاركة السجلات») زي صفحة الفرز العادية، وكل صف عليه اسم صاحبه.
 */
const ME = "me-1";
const NAMES = { "a-2": "سامح", "b-3": "بوحه" };
const g = (plate: string, agent: string, extra?: Record<string, string>) => ({
  plate, method: "صوت", maps_link: "https://maps.google.com/?q=1,2",
  checked_at: "2026-10-01T09:30:00Z", agent_id: agent, extra: extra ?? null,
});

describe("groupRecordsToRows", () => {
  it("🔴 سجل الزميل بنفس شكل سجلات المندوب + اسم صاحبه", () => {
    const [r] = groupRecordsToRows([g("ابج1234", "a-2", { "النوع": "ونيت" })], ME, NAMES);
    expect(r[REC_PLATE_COL]).toBe("ابج1234");
    expect(r["الطريقة"]).toBe("صوت");
    expect(r["الموقع"]).toContain("maps");
    expect(r["التاريخ"]).not.toBe("");
    expect(r["المندوب"]).toBe("سامح");
    expect(r["النوع"]).toBe("ونيت");
  });

  it("🔴 سجلاتي أنا مابتتكررش (موجودة أصلاً من الجهاز)", () => {
    expect(groupRecordsToRows([g("ابج1234", ME), g("دهو5678", "b-3")], ME, NAMES).map((r) => r[REC_PLATE_COL]))
      .toEqual(["دهو5678"]);
  });
});

describe("fetchGroupRecordRows", () => {
  it("🔴 بيلفّ على الصفحات لحد آخرها", async () => {
    const all = Array.from({ length: 5 }, (_, i) => g(`ابج${1000 + i}`, "a-2"));
    const calls: [number, number][] = [];
    const rpc = async (from: number, to: number) => { calls.push([from, to]); return { data: all.slice(from, to + 1), error: null }; };
    const rows = await fetchGroupRecordRows(rpc, ME, NAMES, 2);
    expect(rows).toHaveLength(5);
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("غلط من السيرفر مابيوقّفش الفرز — بيرجّع اللي اتجاب", async () => {
    const rpc = async () => ({ data: null, error: { message: "offline" } });
    expect(await fetchGroupRecordRows(rpc, ME, NAMES)).toEqual([]);
  });
});

describe("توصيل فرز «صوت فقط»", () => {
  const code = readFileSync(join(process.cwd(), "components", "VoiceOnlySort.tsx"), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const block = (name: string) => code.slice(code.indexOf(`const ${name} = useCallback`), code.indexOf("}, [", code.indexOf(`const ${name} = useCallback`)));

  it("🔴 الفرز (جديد/كلي) واللصق الاتنين بيدخّلوا سجلات المجموعة", () => {
    for (const b of [block("runSort"), block("runPaste")]) {
      expect(b).toMatch(/groupRowsFor\(/);
      expect(b).toMatch(/\.\.\.groupRows,/);
    }
    const helper = block("groupRowsFor");
    expect(helper).toMatch(/fetchGroupRecordRows\(/);
    expect(helper).toMatch(/match_group_plates/);
  });
});

/**
 * 🔁 سجلات المندوب بترجع زي ما كانت على أي موبايل — وكل نوع في تابه (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «دي أهم نقطه ان سجلات المناديب ترجع زي ماكانت وكل حاجه ترجع منفصله يعني اللي متصدر من علي فويس
 * برو يرجع ل سجلات التشييك واللي متصدر من علي المجمع يرجع ل داتا التسجيلات».
 *  · الرفع بيحفظ معرّف السجل في `local_id` (`serverRowOf`) والاسترجاع بيرجّعه هو هو (`serverRowToEntry`).
 *  · التاب بيتحدد من المعرّف بس (`isMujammaaRecord`: «fc-mj-») — فالسجل بيرجع لتابه من غير أي حاجة زيادة.
 *  صفوف بنفس شكل السيرفر الحقيقي (field_checks — ١٨ أكتوبر: ٥ من المجمّع + سجلات Voice PRO لنفس الحساب).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: () => ({}), auth: {} } }));
import { serverRowToEntry } from "@/lib/syncFieldCheck";
import { isMujammaaRecord } from "@/lib/mujammaaRecords";

const UID = "af40c1a6-0000-4000-8000-000000000000";
const fromMujammaa = {
  local_id: `fc-mj-${UID}-plate-1760805529123-ab12`, agent_id: UID, plate: "بسن8921", method: "متشيكة بالصوت",
  lat: 24.7, lng: 46.7, maps_link: "https://maps.google.com/?q=24.7,46.7", checked_at: "2026-10-18T16:39:01+00:00",
  extra: { "النوع": "ونيت", "اسم المسجّل": "عاصم", "الحالة": "صوتي", "دقة الموقع (م)": "8" }, team: null,
};
const fromVoicePro = {
  local_id: "fc-trial-1760805000000-x1", agent_id: UID, plate: "حقل5830", method: "متشيكة بالصوت",
  lat: 24.7, lng: 46.7, maps_link: "https://maps.google.com/?q=24.7,46.7", checked_at: "2026-10-18T15:00:00+00:00",
  extra: { "النوع": "فان" }, team: null,
};
const manual = { ...fromVoicePro, local_id: "fc-1760805000000-m9", method: "يدوي" };

describe("الاسترجاع على موبايل جديد", () => {
  it("المعرّف بيرجع هو هو — فالمجمّع يرجع «داتا التسجيلات» وVoice PRO واليدوي يرجعوا «سجل التشييك»", () => {
    const a = serverRowToEntry(fromMujammaa, UID);
    const b = serverRowToEntry(fromVoicePro, UID);
    const c = serverRowToEntry(manual, UID);
    expect(a.id).toBe(fromMujammaa.local_id);
    expect(isMujammaaRecord(a)).toBe(true);
    expect(isMujammaaRecord(b)).toBe(false);
    expect(isMujammaaRecord(c)).toBe(false);
  });

  it("كل بيانات السجل بترجع: اللوحة والطريقة والموقع والوقت والنوع والملاحظات", () => {
    const a = serverRowToEntry(fromMujammaa, UID);
    expect(a).toMatchObject({
      plate: "بسن8921", method: "متشيكة بالصوت", lat: 24.7, lng: 46.7,
      mapsLink: fromMujammaa.maps_link, checkedAt: fromMujammaa.checked_at, synced: true,
    });
    expect(a.row).toEqual(fromMujammaa.extra);
  });

  it("الرفع بيحفظ المعرّف في local_id (نفس اللي الاسترجاع بيقراه)", () => {
    const src = readFileSync(join(__dirname, "..", "lib", "syncFieldCheck.ts"), "utf8");
    expect(src).toMatch(/function serverRowOf\(uid: string, e: FieldCheckEntry\) \{\s*return \{\s*local_id: e\.id,/);
    expect(src).toMatch(/id: String\(r\.local_id \?\? ""\),/);
  });

  it("صفحة السجلات بتقسّم بالمعرّف بس", () => {
    const page = readFileSync(join(__dirname, "..", "app", "(app)", "instant-check", "page.tsx"), "utf8");
    expect(page).toMatch(/fieldEntries\.filter\(\(e\) => isMujammaaRecord\(e\) === \(recTab === "mjdata"\)\)/);
  });
});

/**
 * 🔎 الفرز على كل السجلات — المجمّع زي Voice PRO (١٨ أكتوبر ٢٠٢٦). المالك: «لو المندوب مصدر من صفحه المجمع
 * لوحات دلوقتي لما ينزل احاله وفرز هل بردو بيفرز علي اللي متصدر للمجمع» ⇒ أيوه: شيت السجلات في الفرز = كل
 * سجلات الموبايل (من غير فلتر بالتاب)، وسجلات المجموعة من السيرفر كمان من غير فلتر.
 */
describe("الفرز بيشمل سجلات المجمّع", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("شيت السجلات في الفرز = كل سجلات الموبايل — مافيش استبعاد للمجمّع", () => {
    const page = read("app/(app)/sorting/page.tsx");
    expect(page).toMatch(/collapseDuplicateChecks\(await getAllFieldCheckEntries\(\)\)/);
    expect(page).not.toMatch(/isMujammaaRecord|fc-mj-/);
  });

  it("سجلات المجموعة في الفرز (match_group_plates) من غير فلتر على نوع السجل", () => {
    const sql = read("docs/sql/multi-group-6-legacy-pin.sql");
    const fn = sql.slice(sql.indexOf("create function public.match_group_plates"), sql.indexOf("grant execute on function public.match_group_plates"));
    const where = fn.slice(fn.indexOf("where"));
    expect(where.length).toBeGreaterThan(10);
    expect(where).not.toMatch(/local_id|method/);
  });
});

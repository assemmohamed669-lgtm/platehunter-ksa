/**
 * 🛣️ مربع «اسم الشارع» في «التسجيل» (المجمّع) — المالك (٣١ أكتوبر ٢٠٢٦): «عايز في صفحه التسجيل تضيف مربع المشترك
 * يحط فيه اسم الشارع ودة يبقي عامود لوحدو لما المندوب يحط اسم الشارع يظهر قدام اللوحات بعد التفريغ نفس اسم الشارع
 * اللي المستخدم حاطه».
 *  · نفس قاعدة باقي المربعات (الحي/المسجّل/الجراج): كل لوحة بتاخد اللي كان مكتوب **لحظة ما اتقالت** (`sessionStamp`)،
 *    و«مسح» بيوقفه من اللحظة دي، واللوحات اللي قبل الكتابة مابتاخدوش.
 *  · عمود لوحده «اسم الشارع» — نفس عمود «اسم الشارع» بتاع التشييك (`lib/streetName.ts`) فالسجلات والفرز يقروه زي بعض.
 *  · السوبر أدمن الأول (`MJ_STREET_FOR_DELEGATES`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionStamp } from "@/components/mujammaa/lib/sessionStamp";
import { BOXES_KEY, loadBoxes, saveBoxes } from "@/components/mujammaa/lib/stampBoxes";
import { makePlateEntry, buildExportRows, type PlateEntry } from "@/components/mujammaa/lib/plateEntry";
import { mujammaaRecordOf } from "@/lib/mujammaaRecords";
import { MJ_STREET_FOR_DELEGATES } from "@/lib/mujammaaAccess";
import { STREET_KEY } from "@/lib/streetName";
import PlateTable from "@/components/mujammaa/components/PlateTable";
import type { BankSheet } from "@/components/mujammaa/lib/bankSheet";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("🛣️ الختم بلحظة النطق", () => {
  it("اللوحة بتاخد اسم الشارع اللي كان مكتوب لحظة ما اتقالت — واللي قبل الكتابة لأ", () => {
    const s = new SessionStamp({ startedAt: 0 });
    s.typeInto("streetName", "ش", 10_000);
    s.typeInto("streetName", "شارع التحلية", 11_000);           // نفس الكتابة (حرف حرف) ⇒ تعديل واحد من أول حرف
    expect(s.at(5_000).streetName).toBeNull();
    expect(s.at(10_500).streetName).toBe("شارع التحلية");
    expect(s.at(30_000).streetName).toBe("شارع التحلية");
  });
  it("غيّر الشارع ⇒ اللي بعدها بالجديد واللي قبلها بالقديم · «مسح» ⇒ اللي بعده من غير شارع", () => {
    const s = new SessionStamp({ startedAt: 0 });
    s.setStreetName("الأمير سلطان", 0);
    s.setStreetName("صاري", 60_000);
    s.setStreetName("", 120_000);
    expect(s.at(30_000).streetName).toBe("الأمير سلطان");
    expect(s.at(90_000).streetName).toBe("صاري");
    expect(s.at(150_000).streetName).toBeNull();
  });
  it("منفصل عن «اسم الحي» — الاتنين مع بعض كل واحد في خانته", () => {
    const s = new SessionStamp({ startedAt: 0 });
    s.setStreet("النرجس", 0);
    s.setStreetName("شارع التحلية", 0);
    expect(s.at(1_000)).toMatchObject({ street: "النرجس", streetName: "شارع التحلية" });
  });
  it("بيتحفظ مع المقطع ويرجع — والمقاطع القديمة من غيره شغّالة", () => {
    const s = new SessionStamp({ startedAt: 5 });
    s.setStreetName("صاري", 0);
    const back = SessionStamp.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(back.at(1).streetName).toBe("صاري");
    expect(SessionStamp.fromJSON({ startedAt: 1, streets: [], notes: [] }).at(10).streetName).toBeNull();
  });
});

describe("🛣️ المربع بيفضل مكتوب لو البرنامج اتقفل", () => {
  beforeEach(() => localStorage.clear());
  it("بيتحفظ ويرجع مع باقي المربعات — والتخزين القديم من غيره فاضي", () => {
    saveBoxes({ district: "النرجس", recorder: "عاصم", garage: "", street: "شارع التحلية" });
    expect(loadBoxes()).toEqual({ district: "النرجس", recorder: "عاصم", garage: "", street: "شارع التحلية" });
    localStorage.setItem(BOXES_KEY, JSON.stringify({ district: "النرجس", recorder: "", garage: "" }));
    expect(loadBoxes().street).toBe("");
  });
});

const review = {
  plate: "ابح1234", heardPlate: "ابح1234", letters: ["ا", "ب", "ح"], digits: "1234", confidence: 92, status: "solid",
  corrections: [], notes: [], raw: "ابح1234", order: 1, needsAudioReview: false,
} as unknown as PlateEntry["review"];

describe("🛣️ عمود لوحده «اسم الشارع»", () => {
  it("اللوحة بتشيله · وملف الإكسيل فيه عمود «اسم الشارع» جنب «الحي»", () => {
    const e = makePlateEntry({ review, pin: null, match: { kind: "none", similarity: 0 }, source: "batch",
      neighborhood: "النرجس", streetName: "شارع التحلية" });
    expect(e.streetName).toBe("شارع التحلية");
    const row = buildExportRows([e], null)[0];
    expect(row["اسم الشارع"]).toBe("شارع التحلية");
    expect(row["الحي"]).toBe("النرجس");
    const keys = Object.keys(row);
    expect(keys.indexOf("اسم الشارع")).toBe(keys.indexOf("الحي") + 1);
  });
  it("من غير شارع ⇒ مافيش حقل على اللوحة", () => {
    const e = makePlateEntry({ review, pin: null, match: { kind: "none", similarity: 0 }, source: "batch" });
    expect("streetName" in e).toBe(false);
  });
  it("السجلات: نفس عمود «اسم الشارع» بتاع التشييك — وفاضي ⇒ العمود ماينزلش", () => {
    const base = makePlateEntry({ review, pin: null, match: { kind: "none", similarity: 0 }, source: "batch" });
    expect(STREET_KEY).toBe("اسم الشارع");
    expect(mujammaaRecordOf({ ...base, streetName: "شارع التحلية" }, { uid: "u1", clipKey: "c" }).row[STREET_KEY]).toBe("شارع التحلية");
    expect(STREET_KEY in mujammaaRecordOf(base, { uid: "u1", clipKey: "c" }).row).toBe(false);
  });
  it("لوحة مطلوبة وملف التشييك فيه «اسم الشارع» (عنوان صاحب العربية) ⇒ مايبانش كأنه اللي المندوب كتبه", () => {
    const sheet = { headers: ["اللوحة", "اسم الشارع", "البنك"], plateColumn: "اللوحة" } as unknown as BankSheet;
    const wanted = { ...makePlateEntry({ review, pin: null, source: "batch",
      match: { kind: "exact", similarity: 100, row: { "اللوحة": "ابح1234", "اسم الشارع": "عنوان البنك", "البنك": "الراجحي" } } as unknown as PlateEntry["match"] }) };
    const row = mujammaaRecordOf(wanted, { uid: "u1", clipKey: "c", sheet }).row;
    expect(row[STREET_KEY]).toBeUndefined();
    expect(row["البنك"]).toBe("الراجحي");
    expect(mujammaaRecordOf({ ...wanted, streetName: "صاري" }, { uid: "u1", clipKey: "c", sheet }).row[STREET_KEY]).toBe("صاري");
  });
});

describe("🛣️ قدام اللوحات بعد التفريغ (جدول النتيجة)", () => {
  const mk = (plate: string, streetName?: string) =>
    ({ ...makePlateEntry({ review: { ...review, plate } as PlateEntry["review"], pin: null, match: { kind: "none", similarity: 0 }, source: "batch" }),
      ...(streetName ? { streetName } : {}) }) as PlateEntry;
  it("عمود «اسم الشارع» بالاسم اللي اتكتب — ولوحة اتقالت قبل الكتابة «—»", () => {
    render(<PlateTable entries={[mk("ابح1234", "شارع التحلية"), mk("دنر5678")]} sheet={null} onAnnotate={() => {}} />);
    expect(screen.getByRole("columnheader", { name: "اسم الشارع" })).toBeTruthy();
    expect(screen.getByText("شارع التحلية")).toBeTruthy();
  });
  it("محدش كتب شارع ⇒ العمود مايظهرش (الجدول زي الأول)", () => {
    render(<PlateTable entries={[mk("ابح1234")]} sheet={null} onAnnotate={() => {}} />);
    expect(screen.queryByRole("columnheader", { name: "اسم الشارع" })).toBeNull();
  });
});

describe("🛣️ الربط في الصفحة — السوبر أدمن الأول", () => {
  const PAGE = read("components/mujammaa/pages/BatchPage.tsx");
  const SECTION = read("components/mujammaa/MujammaaSection.tsx");
  const REG = read("app/(app)/registration/page.tsx");
  it("مقفول على المناديب لحد تجربة المالك", () => {
    expect(MJ_STREET_FOR_DELEGATES).toBe(false);
    expect(REG).toContain("streetBox={superOk || MJ_STREET_FOR_DELEGATES}");
    expect(SECTION).toContain("streetBox={streetBox}");
    expect(PAGE).toContain("streetBox = false,");
  });
  it("المربع بيظهر لمسموحله بس، وبيكتب في الختم بلحظة الكتابة، و«مسح» بيوقفه", () => {
    expect(PAGE).toContain('["street", "streetName", "اسم الشارع"]');
    expect(PAGE).toMatch(/\.filter\(\(\[k\]\) => k !== "street" \|\| streetBox\)/);
    expect(PAGE).toContain('else if (field === "streetName") stampRef.current.typeInto("streetName", v, elapsedMsRef.current());');
    expect(PAGE).toContain('else if (field === "streetName") stampRef.current.setStreetName("", elapsedMsRef.current());');
  });
  it("كل لوحة بتاخد شارع لحظة نطقها (من ختم المقطع)", () => {
    expect(PAGE).toContain("streetName: stamp.streetName ?? undefined,");
  });
  it("المربع مكتوب من قبل ما يدوس «سجّل» ⇒ التسجيل الجديد بيبدأ بيه (زي الحي والمسجّل والجراج)", () => {
    const start = PAGE.indexOf("stampRef.current = new SessionStamp({ startedAt: Date.now() });");
    expect(start).toBeGreaterThan(0);
    expect(PAGE.slice(start, start + 500)).toContain("if (streetBox && boxes.street.trim()) stampRef.current.setStreetName(boxes.street, 0);");
  });
});

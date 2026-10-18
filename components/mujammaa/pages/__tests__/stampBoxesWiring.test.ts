// @vitest-environment node
// (نص الصفحة بيتقري بـ`import.meta.url` = ملف — في jsdom مش ملف)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 🧾 مربعات المجمّع (١٨ أكتوبر ٢٠٢٦) — «اسم الحي» · «اسم المسجّل» · «اسم أو رقم الجراج» + «مسح» فوق كل مربع.
 * المالك: «الكتابه اللي يكتبها المندوب تتنفذ فقط علي اللوحات اللي قالها بعد الكتابه دي ولما يشيلها ويمسحها
 * ميتحطش في اللوحات اللي بعد كدة … حتي لو في نفس التسجيل».
 */
const SRC = readFileSync(fileURLToPath(new URL("../BatchPage.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const TABLE = readFileSync(fileURLToPath(new URL("../../components/PlateTable.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");

describe("المربعات", () => {
  it("التلاتة بالأسامي دي — والنوع اتشال (بيجي من الصوت أو من الجدول)", () => {
    expect(SRC).toMatch(/\["district", "street", "اسم الحي"\],\s*\["recorder", "recorder", "اسم المسجّل"\],\s*\["garage", "note", "اسم أو رقم الجراج"\],/);
    expect(SRC).toMatch(/placeholder=\{label\}/);
    expect(SRC).not.toMatch(/placeholder="اسم الشارع"/);
    expect(SRC).not.toMatch(/<option value="">النوع \(اختياري\)<\/option>/);
  });

  it("كل حرف بيتسجّل بوقته (typeInto) و«مسح» بيوقف الختم من لحظته", () => {
    for (const f of ["street", "recorder", "note"]) {
      expect(SRC).toMatch(new RegExp(`stampRef\\.current\\.typeInto\\("${f}", v, elapsedMsRef\\.current\\(\\)\\)`));
    }
    expect(SRC).toMatch(/stampRef\.current\.setStreet\("", elapsedMsRef\.current\(\)\)/);
    expect(SRC).toMatch(/stampRef\.current\.setRecorder\("", elapsedMsRef\.current\(\)\)/);
    expect(SRC).toMatch(/stampRef\.current\.setNote\("", elapsedMsRef\.current\(\)\)/);
    // زرار «مسح» فوق كل مربع (جوّه نفس اللفّة على التلاتة)، ومقفول لو المربع فاضي
    expect(SRC).toMatch(/disabled=\{!boxes\[k\]\}[\s\S]{0,600}?>\s*مسح\s*</);
  });

  it("🔴 الوقت من لحظة ما الميك اشتغل فعلاً (نفس ساعة اللوحات) — مش من دوسة «سجّل»", () => {
    expect(SRC).toMatch(/const elapsedMsRef = useRef\(\(\) =>\s*recorderRef\.current && recordingStartedAtRef\.current \? Date\.now\(\) - recordingStartedAtRef\.current : 0/);
  });

  it("المكتوب بيسري من أول التسجيل الجديد ومحفوظ لو البرنامج اتقفل", () => {
    expect(SRC).toMatch(/if \(boxes\.district\.trim\(\)\) stampRef\.current\.setStreet\(boxes\.district, 0\);/);
    expect(SRC).toMatch(/if \(boxes\.recorder\.trim\(\)\) stampRef\.current\.setRecorder\(boxes\.recorder, 0\);/);
    expect(SRC).toMatch(/if \(boxes\.garage\.trim\(\)\) stampRef\.current\.setNote\(boxes\.garage, 0\);/);
    expect(SRC).toMatch(/useState<StampBoxes>\(\(\) => loadBoxes\(\)\)/);
    expect(SRC).toMatch(/saveBoxes\(/);
  });
});

describe("اللوحة بتاخد المربعات لحظة نطقها", () => {
  it("اسم المسجّل من الختم، والجراج + ملاحظة كوهير الاتنين", () => {
    expect(SRC).toMatch(/recorderName: stamp\.recorder \?\? undefined,/);
    expect(SRC).toMatch(/note: joinNotes\(e\.note, fields\[i\]\?\.note\),/);
  });

  it("🏘️ الحي التلقائي بعد التفريغ (في الخلفية) وقبل التصدير (بحد أقصى) — للفاضي بس", () => {
    expect(SRC).toMatch(/new DistrictResolver\(reverseGeocode\)/);
    const rq = SRC.slice(SRC.indexOf("const runQueue = async"), SRC.indexOf("const runTranscription = async"));
    expect(rq).toMatch(/void fillDistricts\(outcome\.entries, districtRef\.current\)\.then\(/);
    const ex = SRC.slice(SRC.indexOf("const exportToRecords = async"), SRC.indexOf("const copyAll = async"));
    expect(ex).toMatch(/const list = await fillDistricts\(entries, districtRef\.current, \{ timeoutMs: 8000 \}\);/);
  });
});

describe("الجدول", () => {
  it("«اسم الحي» — و«المسجّل» يظهر بس لو فيه لوحة ليها اسم مسجّل", () => {
    expect(TABLE).toMatch(/<th className="p-2 font-medium">اسم الحي<\/th>/);
    expect(TABLE).toMatch(/const showRecorder = fieldMode && entries\.some\(\(e\) => !!e\.recorderName\);/);
    expect(TABLE).toMatch(/\{showRecorder && <th className="p-2 font-medium">المسجّل<\/th>\}/);
  });
});

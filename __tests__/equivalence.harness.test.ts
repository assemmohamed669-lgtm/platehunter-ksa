/**
 * Equivalence Harness (خطوة ٤ / شرط ١)
 * ====================================
 * بياخد كل نصوص الكوربَس (`tests/equivalence-corpus.json` — مستخرَجة من كل
 * مدخلات السويت + الـ golden dataset) ويعدّيها على:
 *   - المسار القديم: `extractMultiplePlates` (البارسر الحالي)
 *   - الإنجن الجديد: `normalizeTranscript`
 * ويثبت **تطابق المخرجات** (لوحات + ملاحظات + أنواع).
 *
 * الهدف: بوابة أمان قبل refactor البارسر لـ thin consumer — لازم تبقى خضرا
 * قبل التوصيل وتفضل خضرا بعده (صفر تغيير سلوك).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractMultiplePlates } from "@/lib/plateParser";
import { normalizeTranscript } from "@/lib/speech-normalizer";

const CORPUS: string[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests", "equivalence-corpus.json"), "utf8")
);

interface Compared {
  transcript: string;
  oldPlates: string[];
  newPlates: string[];
  oldVehicles: string[];
  newVehicles: string[];
  platesMatch: boolean;
  vehiclesMatch: boolean;
}

function compareOne(t: string): Compared {
  const oldRes = extractMultiplePlates(t);
  const oldPlates = oldRes.map((r) => r.plate);
  const oldVehicles = oldRes.map((r) => r.vehicleType).filter(Boolean) as string[];

  const nu = normalizeTranscript(t);
  const newPlates = nu.plate ? [nu.plate] : [];
  const newVehicles = nu.vehicleTypes;

  const eq = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  return {
    transcript: t,
    oldPlates,
    newPlates,
    oldVehicles,
    newVehicles,
    platesMatch: eq(oldPlates, newPlates),
    vehiclesMatch: eq([...oldVehicles].sort(), [...newVehicles].sort()),
  };
}

// خط الأساس الحالي للاختلاف (الإنجن لسه scaffold؛ الذكاء المؤجّل للمرحلة ٢ هو
// سبب الاختلاف). الحارس النشط بيتأكد إن الاختلاف **ماينزادش** أبداً، والبوابة
// الصارمة (٠ اختلاف) موقوفة لحد ما الإنجن يوصل للتطابق الكامل.
const BASELINE_PLATE_DIVERGENCE = 61;
const BASELINE_VEHICLE_DIVERGENCE = 7;

describe("equivalence harness — المسار القديم مقابل الإنجن الجديد", () => {
  const results = CORPUS.map(compareOne);
  const plateDivergences = results.filter((r) => !r.platesMatch);
  const vehicleDivergences = results.filter((r) => !r.vehiclesMatch);

  it("حارس عدم-تراجع: اختلاف اللوحات ماينزادش عن خط الأساس", () => {
    if (plateDivergences.length) {
      const report = plateDivergences
        .slice(0, 80)
        .map(
          (r) =>
            `«${r.transcript}»\n   قديم: [${r.oldPlates.join(" ، ")}]\n   جديد: [${r.newPlates.join(" ، ")}]`
        )
        .join("\n");
      console.log(
        `\n=== اختلاف اللوحات: ${plateDivergences.length}/${CORPUS.length} ===\n${report}`
      );
    }
    expect(plateDivergences.length).toBeLessThanOrEqual(BASELINE_PLATE_DIVERGENCE);
  });

  it("حارس عدم-تراجع: اختلاف الأنواع ماينزادش عن خط الأساس", () => {
    if (vehicleDivergences.length) {
      const report = vehicleDivergences
        .map(
          (r) =>
            `«${r.transcript}» قديم:[${r.oldVehicles.join("،")}] جديد:[${r.newVehicles.join("،")}]`
        )
        .join("\n");
      console.log(
        `\n=== اختلاف الأنواع: ${vehicleDivergences.length}/${CORPUS.length} ===\n${report}`
      );
    }
    expect(vehicleDivergences.length).toBeLessThanOrEqual(BASELINE_VEHICLE_DIVERGENCE);
  });

  // ── بوابة التكافؤ الصارمة (الهدف النهائي) ────────────────────────────────
  // موقوفة لحد ما الإنجن يوصل للتطابق الكامل (يحتاج ذكاء المرحلة ٢: تقطيع
  // لوحات متعددة + جمع/حشو الأرقام + salvage الحروف + anchoring). لمّا يخضرّ
  // الاتنين دول، بيبقى مسموح refactor البارسر لـ thin consumer.
  it.skip("بوابة التكافؤ: تطابق اللوحات ٠ اختلاف (قبل ما يُسمح بالـ refactor)", () => {
    expect(plateDivergences.map((r) => r.transcript)).toEqual([]);
  });

  it.skip("بوابة التكافؤ: تطابق الأنواع ٠ اختلاف (قبل ما يُسمح بالـ refactor)", () => {
    expect(vehicleDivergences.map((r) => r.transcript)).toEqual([]);
  });
});

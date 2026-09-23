import { describe, it, expect } from "vitest";
import { backfillMissingGps, GPS_BACKFILL_MAX_AGE_MS } from "../lib/gpsBackfill";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  لوحة اتسجّلت قبل ما الموقع يثبت — بتاخد موقعها بأثر رجعي
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «وتتأكد مليون في الميّة إن كل لوحة بتاخد
 *  موقع دقيق».
 *
 *  🔴 **العلّة**: الموقع بيتختم على الصف **لحظة ما يتعمل**. وأول ٥-٢٠ ثانية
 *  بعد فتح الصفحة الـGPS لسه بيقفل، فأول لوحات المندوب بتتسجّل **بلا موقع
 *  خالص** — و`exportableTrialRows` بترميها من التصدير. يعني شغل ضايع بصمت.
 *
 *  ⚠️ **وليه مهلة**: لو ختمنا أي صف قديم بأول موقع ييجي، اللوحة اللي
 *  اتسجّلت في حي تاني هتاخد موقع الحي ده — **وده أسوأ من مافيش موقع**،
 *  لأنه غلط بيتكتب في داتا المالك في صمت. فالختم للصفوف **الجديدة بس**.
 */
describe("backfillMissingGps", () => {
  const C = { lat: 25.3, lng: 55.37, accuracy: 12 };
  const row = (id: string, atMs: number, lat: number | null = null) =>
    ({ id, shownAt: atMs, lat, lng: lat == null ? null : 55.0 });

  it("الصف اللي مالوش موقع وجديد ⇒ بياخد الموقع", () => {
    const out = backfillMissingGps([row("a", 1000)], C, 2000);
    expect(out[0].lat).toBe(25.3);
    expect(out[0].lng).toBe(55.37);
  });

  it("🔴 الصف اللي عنده موقع **مايتلمسش** — موقعه وقت النطق أدقّ", () => {
    const out = backfillMissingGps([row("a", 1000, 24.9)], C, 2000);
    expect(out[0].lat).toBe(24.9);
  });

  it("⚠️ الصف القديم مايتختمش — ممكن يكون في حي تاني", () => {
    const old = 1000;
    const now = old + GPS_BACKFILL_MAX_AGE_MS + 1;
    const out = backfillMissingGps([row("a", old)], C, now);
    expect(out[0].lat).toBeNull();
  });

  it("مافيش موقع ⇒ الصفوف زي ما هي", () => {
    const rows = [row("a", 1000)];
    expect(backfillMissingGps(rows, null, 2000)).toBe(rows);
  });

  it("مافيش صف محتاج ⇒ **نفس المصفوفة** (مافيش إعادة رسم بلا داعي)", () => {
    const rows = [row("a", 1000, 24.9)];
    expect(backfillMissingGps(rows, C, 2000)).toBe(rows);
  });

  it("بيختم المحتاجين بس ويسيب الباقي", () => {
    const now = 500_000;
    const rows = [
      row("a", now - 1000, 24.9),                          // عنده موقع
      row("b", now - 1500),                                // محتاج وجديد
      row("c", now - GPS_BACKFILL_MAX_AGE_MS - 1),         // محتاج بس **قديم**
    ];
    const out = backfillMissingGps(rows, C, now);
    expect(out[0].lat).toBe(24.9);
    expect(out[1].lat).toBe(25.3);
    expect(out[2].lat).toBeNull();
  });
});

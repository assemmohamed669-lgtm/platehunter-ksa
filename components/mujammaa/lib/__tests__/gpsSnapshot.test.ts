/**
 * الطابور مايضيّعش مكان المقطع اللي مستني.
 *
 * 🔴 السيناريو اللي كان بيكسر: المندوب يدوس «تفريغ» على مقطع، ويبدأ
 * تسجيل جديد فوراً. ‎GpsTrack.start()‎ بتعمل ‎fixes = []‎ ⇒ قراءات المقطع
 * اللي في الطابور بتتمسح، ولوحاته تطلع بلا دبوس أو بدبوس من مكان المندوب
 * الجديد. الصورة المجمّدة بتمنع ده.
 */
import { describe, it, expect } from "vitest";
import { GpsTrack } from "../gps";

describe("صورة مسار الموقع", () => {
  it("بتفضل شايلة القراءات بعد ما المسار الأصلي يتمسح", () => {
    const track = new GpsTrack();
    // نحقن قراءات مباشرة — مافيش GPS في بيئة الاختبار
    const fixes = [
      { lat: 24.7, lng: 46.6, accuracy: 10, at: 1_000 },
      { lat: 24.8, lng: 46.7, accuracy: 10, at: 5_000 },
    ];
    (track as unknown as { fixes: typeof fixes }).fixes = fixes;

    const frozen = track.snapshot();
    expect(frozen.count).toBe(2);

    // المندوب بدأ تسجيل جديد ⇒ المسار الحيّ بيتمسح
    (track as unknown as { fixes: typeof fixes }).fixes = [];
    expect(track.count).toBe(0);

    // الصورة لسه شايلة مكان المقطع القديم
    expect(frozen.count).toBe(2);
    const pin = frozen.pinAt(3_000);
    expect(pin).not.toBeNull();
    expect(pin!.lat).toBeGreaterThan(24.7);
    expect(pin!.lat).toBeLessThan(24.8);
  });

  it("الصورة مستقلة — الإضافة للأصل ما تظهرش فيها", () => {
    const track = new GpsTrack();
    (track as unknown as { fixes: unknown[] }).fixes = [
      { lat: 24.7, lng: 46.6, accuracy: 10, at: 1_000 },
    ];
    const frozen = track.snapshot();
    (track as unknown as { fixes: unknown[] }).fixes.push({
      lat: 25, lng: 47, accuracy: 10, at: 9_000,
    });
    expect(track.count).toBe(2);
    expect(frozen.count).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { activityStatus, shouldSendLocation } from "@/lib/presence";

const NOW = new Date("2026-07-17T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60000;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("activityStatus", () => {
  it("مفيش last_seen → لم يفتح البرنامج", () => {
    expect(activityStatus(null, NOW)).toEqual({ online: false, label: "لم يفتح البرنامج", minsAgo: null });
  });
  it("من دقيقتين → نشط الآن", () => {
    const s = activityStatus(ago(2 * MIN), NOW);
    expect(s.online).toBe(true);
    expect(s.label).toBe("نشط الآن");
  });
  it("بالظبط ٥ دقايق → لسه نشط", () => {
    expect(activityStatus(ago(5 * MIN), NOW).online).toBe(true);
  });
  it("٦ دقايق → مش نشط", () => {
    const s = activityStatus(ago(6 * MIN), NOW);
    expect(s.online).toBe(false);
    expect(s.label).toBe("آخر ظهور من 6 دقيقة");
  });
  it("٣ ساعات → بالساعة", () => {
    expect(activityStatus(ago(3 * HR), NOW).label).toBe("آخر ظهور من 3 ساعة");
  });
  it("يومين → باليوم", () => {
    expect(activityStatus(ago(2 * DAY), NOW).label).toBe("آخر ظهور من 2 يوم");
  });
  it("تاريخ غير صالح → لم يفتح البرنامج", () => {
    expect(activityStatus("not-a-date", NOW).online).toBe(false);
  });
});

describe("shouldSendLocation", () => {
  const p = { lat: 24.7136, lng: 46.6753, at: NOW };
  it("أول مرة (مفيش سابق) → يبعت", () => {
    expect(shouldSendLocation(null, { lat: 24.7, lng: 46.7 }, NOW)).toBe(true);
  });
  it("نفس المكان وخلال المدة → ما يبعتش", () => {
    expect(shouldSendLocation(p, { lat: 24.7136, lng: 46.6753 }, NOW + 10000)).toBe(false);
  });
  it("عدّت المدة (٤٥ث) وهو واقف → يبعت", () => {
    expect(shouldSendLocation(p, { lat: 24.7136, lng: 46.6753 }, NOW + 46000)).toBe(true);
  });
  it("اتحرك أكتر من ٢٥ متر خلال المدة → يبعت", () => {
    // ~0.5 كم شمالاً
    expect(shouldSendLocation(p, { lat: 24.7181, lng: 46.6753 }, NOW + 5000)).toBe(true);
  });
  it("حركة صغيرة جداً (بضعة أمتار) خلال المدة → ما يبعتش", () => {
    expect(shouldSendLocation(p, { lat: 24.71362, lng: 46.67531 }, NOW + 5000)).toBe(false);
  });
});

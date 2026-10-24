import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BG_RECORDING_EMAILS,
  BG_RECORDING_FOR_ALL,
  BG_RECORDING_TEXT,
  canRecordInBackground,
  onNativeCall,
  startBackgroundRecording,
  stopBackgroundRecording,
} from "./backgroundRecording";

/**
 * 🎙️ التسجيل/التشييك والمندوب في واتساب أو الخريطة (المالك ٢٤ أكتوبر ٢٠٢٦). الجسر `window.PlateHunterBg` موجود في
 * تطبيق أندرويد الجديد بس (1.8) — القديم والآيفون والمتصفح: مافيش جسر ⇒ ولا حاجة بتتغيّر.
 */
type W = Window & { PlateHunterBg?: { start: (t: string) => boolean; stop: () => void } };

afterEach(() => {
  delete (window as W).PlateHunterBg;
  vi.restoreAllMocks();
});

describe("canRecordInBackground", () => {
  it("من غير الجسر (تطبيق قديم/آيفون/متصفح) ⇒ لأ لحد", () => {
    expect(canRecordInBackground(true)).toBe(false);
    expect(canRecordInBackground(false)).toBe(false);
  });

  it("بالجسر: السوبر أدمن الأول", () => {
    (window as W).PlateHunterBg = { start: () => true, stop: () => {} };
    expect(BG_RECORDING_FOR_ALL).toBe(false);
    expect(canRecordInBackground(true)).toBe(true);
    expect(canRecordInBackground(false)).toBe(false);
  });

  it("🧪 حساب مراجعين جوجل (Play Console «App access») بيشتغل عنده — عشان يكرّروا فيديو الإقرار", () => {
    (window as W).PlateHunterBg = { start: () => true, stop: () => {} };
    expect(BG_RECORDING_EMAILS).toEqual(["google.review@qannas-ksa.com", "asemafify40@gmail.com"]);
    expect(canRecordInBackground(false, "google.review@qannas-ksa.com")).toBe(true);
    expect(canRecordInBackground(false, "  Google.Review@Qannas-KSA.com ")).toBe(true);
  });

  it("🧪 حساب «Test apple» اللي في Play Console «Sign in details» دلوقتي (المالك ٢٤ أكتوبر: «سيب دة») ⇒ شغّال", () => {
    (window as W).PlateHunterBg = { start: () => true, stop: () => {} };
    expect(canRecordInBackground(false, "asemafify40@gmail.com")).toBe(true);
    expect(canRecordInBackground(false, " AsemAfify40@Gmail.com ")).toBe(true);
  });

  it("🧪 أي إيميل تاني (أو من غير إيميل) ⇒ زي الأول بالحرف، ومن غير الجسر ⇒ لأ", () => {
    (window as W).PlateHunterBg = { start: () => true, stop: () => {} };
    expect(canRecordInBackground(false, "agent@qannas-ksa.com")).toBe(false);
    expect(canRecordInBackground(false, "")).toBe(false);
    expect(canRecordInBackground(false, null)).toBe(false);
    delete (window as W).PlateHunterBg;
    expect(canRecordInBackground(false, "google.review@qannas-ksa.com")).toBe(false);
  });
});

describe("start/stop", () => {
  it("بيبعت نص الإشعار وبيرجّع اللي أندرويد قاله", () => {
    const start = vi.fn(() => true);
    (window as W).PlateHunterBg = { start, stop: () => {} };
    expect(startBackgroundRecording()).toBe(true);
    expect(start).toHaveBeenCalledWith(BG_RECORDING_TEXT);
  });

  it("أندرويد رفض/الجسر رمى ⇒ false ومابيوقّعش الصفحة", () => {
    (window as W).PlateHunterBg = { start: () => { throw new Error("x"); }, stop: () => { throw new Error("y"); } };
    expect(startBackgroundRecording()).toBe(false);
    expect(() => stopBackgroundRecording()).not.toThrow();
  });

  it("من غير الجسر ⇒ false ومابيعملش حاجة", () => {
    expect(startBackgroundRecording()).toBe(false);
    expect(() => stopBackgroundRecording()).not.toThrow();
  });
});

describe("📞 onNativeCall — المكالمة ليها الأولوية", () => {
  it("الحدث من أندرويد بيوصل، والإلغاء بيشيل السامع", () => {
    const fn = vi.fn();
    const off = onNativeCall(fn);
    window.dispatchEvent(new CustomEvent("phNativeCall"));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new CustomEvent("phNativeCall"));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

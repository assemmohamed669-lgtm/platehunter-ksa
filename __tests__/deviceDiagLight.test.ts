/**
 * 🩺 الصندوق الأسود **الخفيف** (المالك ٢٤ أكتوبر ٢٠٢٦: «شغل الصندوق الاسود علي كل المناديب» ⇒ «يلا اعمله» بعد شرح الأثر).
 *
 * القياس على الـ٤ حسابات اللي عليها الكامل: **٨٥٪ من حجمه سطور الموقع** (`gps-plate` ٧٣٪ · `gps-watch` ١١٪) — اتعملت
 * لشكوى «موقع واحد على كل اللوحات» بس. الخفيف من غيرها، ويتمسح بعد يومين، وبحد في اليوم لكل موبايل ⇒ ~٢٠ مرة أصغر.
 *  · السوبر أدمن الأول (`DIAG_LIGHT_FOR_ALL`) — يومين نقيس الحجم الحقيقي وبعدين للمناديب.
 *  · الحساب اللي في قايمة الكامل (`DIAG_AGENT_IDS`) بياخد الكامل زي ما هو.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DIAG_LIGHT_FOR_ALL,
  DIAG_LIGHT_SERVER,
  LIGHT_MAX_EVENTS_PER_DAY,
  LIGHT_MAX_UPLOADS_PER_DAY,
  diagLightFor,
  diagNote,
  lightBudget,
  lightKeepsNote,
  startDeviceDiagLight,
} from "@/lib/deviceDiag";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const BUF = "ph:diag:buf";

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  localStorage.clear();
});

describe("مين ياخد الخفيف", () => {
  it("السوبر أدمن الأول — المناديب لأ لحد ما المالك يوافق بعد يومين", () => {
    expect(DIAG_LIGHT_FOR_ALL).toBe(false);
    expect(diagLightFor(true)).toBe(true);
    expect(diagLightFor(false)).toBe(false);
  });

  it("بيترفع بعلامة لوحده (`diag-lite`) عشان يتمسح بعد يومين من غير ما يلمس الكامل", () => {
    expect(DIAG_LIGHT_SERVER).toBe("diag-lite");
  });
});

describe("بيسجّل المهم بس", () => {
  it("من غير سطور الموقع ولا خطوات المزامنة/الفرز التقيلة", () => {
    for (const k of ["gps-plate", "gps-watch", "gps-restart", "records-probe", "records-sync", "rv2-sheet", "rv2-probe", "wanted-sort", "cert-sort"]) {
      expect(lightKeepsNote(k)).toBe(false);
    }
  });

  it("التسجيل بدأ/وقف · المطلوبة اتأكدت والصفّارة رنّت · الشاشة نامت · التصدير", () => {
    for (const k of ["rv2-rec", "rv2-wanted", "rv2-alert", "rv2-export", "siren", "siren-2s", "siren-stop", "wake", "wake-lost"]) {
      expect(lightKeepsNote(k)).toBe(true);
    }
  });

  it("على الموبايل: الصفّارة تتكتب وسطر الموقع لأ", () => {
    stop = startDeviceDiagLight("11111111-1111-4111-8111-111111111111", { isSuper: true });
    diagNote("gps-plate", { x: 1 });
    diagNote("siren", { ok: true });
    const buf = JSON.parse(localStorage.getItem(BUF) || "[]") as Array<{ k: string }>;
    expect(buf.some((e) => e.k === "siren")).toBe(true);
    expect(buf.some((e) => e.k === "gps-plate")).toBe(false);
  });

  it("مندوب (مش سوبر أدمن) ⇒ ولا سطر", () => {
    stop = startDeviceDiagLight("22222222-2222-4222-8222-222222222222", { isSuper: false });
    diagNote("siren", { ok: true });
    expect(localStorage.getItem(BUF)).toBeNull();
  });
});

describe("lightBudget — حد في اليوم لكل موبايل", () => {
  it("يوم جديد بيبدأ من الصفر", () => {
    expect(lightBudget({ day: "2026-10-23", events: 999, uploads: 99 }, "2026-10-24")).toEqual({ day: "2026-10-24", events: 0, uploads: 0 });
    expect(lightBudget(null, "2026-10-24")).toEqual({ day: "2026-10-24", events: 0, uploads: 0 });
  });

  it("نفس اليوم بيفضل زي ما هو", () => {
    expect(lightBudget({ day: "2026-10-24", events: 5, uploads: 1 }, "2026-10-24")).toEqual({ day: "2026-10-24", events: 5, uploads: 1 });
  });

  it("الحدود صغيرة (سطور ورفعات)", () => {
    expect(LIGHT_MAX_EVENTS_PER_DAY).toBeLessThanOrEqual(500);
    expect(LIGHT_MAX_UPLOADS_PER_DAY).toBeLessThanOrEqual(40);
  });

  it("السطور بعد الحد مابتتكتبش", () => {
    stop = startDeviceDiagLight("11111111-1111-4111-8111-111111111111", { isSuper: true });
    const before = (JSON.parse(localStorage.getItem(BUF) || "[]") as unknown[]).length;
    for (let i = 0; i < LIGHT_MAX_EVENTS_PER_DAY + 50; i++) diagNote("siren", { i });
    const after = (JSON.parse(localStorage.getItem(BUF) || "[]") as unknown[]).length;
    expect(after - before).toBeLessThanOrEqual(LIGHT_MAX_EVENTS_PER_DAY);
  });
});

describe("التوصيل", () => {
  it("الـlayout بيشغّله بعد البروفايل (عشان يعرف السوبر أدمن) وبعد سجل المشاكل", () => {
    const L = read("app/(app)/layout.tsx");
    expect(L).toMatch(/startIssueLog\(userId, \{ isSuper: rp\?\.is_super === true, diagOn: diagActive\(\) \}\);[\s\S]{0,400}startDeviceDiagLight\(userId, \{ isSuper: rp\?\.is_super === true \}\);/);
  });

  it("الكرون بيمسحه بعد يومين (نفس مدة سجل المشاكل)", () => {
    const C = read("app/api/cron/voice-health/route.ts");
    expect(C).toMatch(/\.delete\(\)\.eq\("server", DIAG_LIGHT_SERVER\)\.lt\("started_at", issuesCutoff\(new Date\(\)\)\)/);
  });
});

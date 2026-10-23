/**
 * 🩺 «صندوق أسود» على موبايل مندوب واحد (١٨ أكتوبر ٢٠٢٦).
 *
 * بلاغ المالك: مندوب آيفون بيفتح Voice PRO ويشتغل شوية وبعدين البرنامج يرجع لوحده على «التشييك
 * ← يدوي» — اتكرر كذا مرة، ومن غير السطر الأحمر بتاع حارس اللفّة. الكود مافيهوش أي تحويل لوحده،
 * فالأرجح iOS بيقفل البرنامج ويفتحه من الأول. المالك: «ممكن علي المندوب دة بالظبط نعمل حاجه تراقب
 * التليفون عنده … ونعرف بالظبط السبب» — «عايزه يبقي للمندوب دة فقط لان باقي الناس شغالين تمام».
 *  · شغّال على الحسابات اللي في القايمة بس — أي حد تاني: ولا سطر.
 *  · بيعرف الفتحة الجديدة جات بعد إيه: قفل عادي في الخلفية ولا وقعة وهو قدامه.
 *  · مابيسجّلش صوت ولا لوحات ولا موقع — الأرقام في أسامي الزراير بتتشال.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAG_AGENT_IDS,
  DIAG_MAX_EVENTS,
  appendEvent,
  chunkForUpload,
  classifyPreviousEnd,
  diagEnabledFor,
  safeLabel,
  startDeviceDiag,
  guessIphoneModel,
  freezeGap,
  safeMsg,
  netUrl,
  type DiagEvent,
  type DiagState,
} from "@/lib/deviceDiag";

const NOW = 1_790_000_000_000;

describe("diagEnabledFor — المندوب اللي في القايمة بس", () => {
  it("حساب مش في القايمة ⇒ مقفول، والقايمة بتقبل معرّفات حسابات بس", () => {
    expect(diagEnabledFor("someone-else", ["11111111-1111-4111-8111-111111111111"])).toBe(false);
    expect(diagEnabledFor("11111111-1111-4111-8111-111111111111", ["11111111-1111-4111-8111-111111111111"])).toBe(true);
    expect(diagEnabledFor(null, ["x"])).toBe(false);
    expect(diagEnabledFor("", [""])).toBe(false);
    expect(DIAG_AGENT_IDS.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });
});

describe("classifyPreviousEnd — الفتحة دي جات بعد إيه؟", () => {
  const st = (over: Partial<DiagState>): DiagState => ({ sid: "s1", path: "/registration-v2", beat: NOW - 3000, vis: "visible", ...over });

  it("مافيش جلسة قبلها ⇒ أول فتحة", () => {
    expect(classifyPreviousEnd(null, NOW)).toBe("first");
  });

  it("آخر نبضة من ثواني والبرنامج كان **قدامه** ⇒ اتقفل وهو شغّال (وقعة)", () => {
    expect(classifyPreviousEnd(st({}), NOW)).toBe("killed-visible");
  });

  it("كان في الخلفية ⇒ اتقفل وهو مستخبي (الموبايل قفله)", () => {
    expect(classifyPreviousEnd(st({ vis: "hidden" }), NOW)).toBe("killed-hidden");
  });

  it("المندوب أو البرنامج نفسه عمل إعادة تحميل (بعلامة) ⇒ مش وقعة", () => {
    expect(classifyPreviousEnd(st({ reload: true }), NOW)).toBe("reload");
  });

  it("آخر نبضة من زمان ⇒ فتحة عادية بعد فترة", () => {
    expect(classifyPreviousEnd(st({ beat: NOW - 3 * 60 * 60_000 }), NOW)).toBe("stale");
  });
});

describe("safeLabel — اسم الزرار من غير أرقام (مافيش لوحات في السجل)", () => {
  it("الأرقام بتتشال والطول محدود", () => {
    expect(safeLabel("حطس 5678 مطلوبة")).toBe("حطس # مطلوبة");
    expect(safeLabel("x".repeat(100)).length).toBeLessThanOrEqual(40);
    expect(safeLabel("  ")).toBe("");
  });
});

describe("guessIphoneModel — موديل الآيفون من مقاس الشاشة (تقريبي — iOS مابيقولش الموديل للصفحة)", () => {
  it("المقاسات المعروفة", () => {
    expect(guessIphoneModel(414, 896, 2)).toMatch(/11/);
    expect(guessIphoneModel(390, 844, 3)).toMatch(/12/);
    expect(guessIphoneModel(375, 667, 2)).toMatch(/SE/);
    expect(guessIphoneModel(430, 932, 3)).toMatch(/Pro Max/);
    // الموبايل مقلوب بالعرض ⇒ نفس النتيجة
    expect(guessIphoneModel(896, 414, 2)).toBe(guessIphoneModel(414, 896, 2));
    expect(guessIphoneModel(999, 999, 1)).toBeNull();
  });
});

describe("freezeGap — التهنيج (الصفحة علّقت)", () => {
  it("المؤقّت بتاع الثانية اتأخّر أكتر من ٣ث ⇒ تهنيج بمدته", () => {
    expect(freezeGap(NOW, NOW + 1000)).toBeNull();
    expect(freezeGap(NOW, NOW + 2900)).toBeNull();
    expect(freezeGap(NOW, NOW + 5200)).toBe(4200);
  });
});

describe("safeMsg / netUrl — من غير لوحات ولا توكن ولا استعلامات", () => {
  it("الأرقام الطويلة (لوحات) بتتشال، والكود (٣ أرقام) بيفضل", () => {
    expect(safeMsg("plate حطس5678 failed 503")).toBe("plate حطس#### failed 503");
    expect(safeMsg("x".repeat(400)).length).toBeLessThanOrEqual(200);
  });
  it("الرابط من غير الاستعلام", () => {
    expect(netUrl("https://voice.qannas-ksa.com/transcribe?token=abc&x=1")).toBe("voice.qannas-ksa.com/transcribe");
    expect(netUrl("/api/version")).toBe("/api/version");
  });
});

describe("التوصيل — مرة واحدة في الـlayout، ومراقبة الصوت مابتشوفهوش", () => {
  it("Voice PRO: سجل الصوت شغّال للسوبر أدمن وللمندوب اللي في القايمة بس، وبيبلّغ الصندوق بأحداثه", () => {
    const P = readFileSync(join(__dirname, "..", "app", "(app)", "registration-v2", "page.tsx"), "utf8");
    expect(P).toMatch(/telRef\.current = !\(isSuper \|\| diagEnabledFor\(telAgentId\)\) \? null : startTelemetrySession\(/);
    expect(P).toMatch(/diagNote\("rv2-rec", \{ on: true/);
    expect(P).toMatch(/diagNote\("rv2-rec", \{ on: false/);
    expect(P).toMatch(/diagNote\("rv2-sheet", /);
    expect(P).toMatch(/diagNote\("rv2-probe", /);
  });

  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it("الـlayout بيشغّله بعد ما يعرف الحساب، وبيبلّغه بكل انتقال", () => {
    const L = read("app/(app)/layout.tsx");
    expect(L).toMatch(/const \{ userId \} = await currentSession\(\);\s*if \(!userId\) return;\s*\/\/[^\n]*\n\s*startDeviceDiag\(userId\);/);
    expect(L).toMatch(/useEffect\(\(\) => \{ if \(pathname\) diagNav\(pathname\); \}, \[pathname\]\);/);
  });

  it("صفحة «مراقبة الصوت» بتستبعد صفوف الصندوق (server = diag)", () => {
    const V = read("app/admin/voice-monitor/page.tsx");
    // ومن ٢٣ أكتوبر سجل المشاكل («issues» — `lib/issueLog.ts`) كمان
    expect((V.match(/\.or\("server\.is\.null,server\.not\.in\.\(diag,issues\)"\)/g) ?? []).length).toBe(2);
  });

  it("من غير الحساب في القايمة ⇒ مافيش تشغيل خالص", () => {
    expect(startDeviceDiag("not-listed")()).toBeUndefined();
    expect(localStorage.getItem("ph:diag:buf")).toBeNull();
  });
});

describe("appendEvent / chunkForUpload — مايتملاش ومايعدّيش حد الجدول", () => {
  it("الأقدم بيتشال لما يعدّي الحد", () => {
    let buf: DiagEvent[] = [];
    for (let i = 0; i < DIAG_MAX_EVENTS + 25; i++) buf = appendEvent(buf, { t: i, k: "beat" });
    expect(buf).toHaveLength(DIAG_MAX_EVENTS);
    expect(buf[0].t).toBe(25);
  });

  it("الرفع على دفعات كل واحدة تحت ٦٠ كيلو (الجدول بيرفض فوق ٦٤)", () => {
    const big: DiagEvent[] = Array.from({ length: 900 }, (_, i) => ({ t: i, k: "err", msg: "e".repeat(180) }));
    const chunks = chunkForUpload(big);
    expect(chunks.flat()).toHaveLength(900);
    for (const c of chunks) expect(JSON.stringify(c).length).toBeLessThan(60_000);
  });
});

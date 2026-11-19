import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { decodeSijilText } from "@/lib/sijilGlyphs";
import { SIJIL_GLYPHS } from "@/lib/sijilGlyphs.map";
import { parseCertText } from "@/lib/certParse";
import { certDailyTick, CERT_SIJIL_GLYPHS_AT, type CertDailyDeps } from "@/lib/certDailyJob";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📄 حروف لوحات «السجل» — «أ» كانت بتتقري «ب» و«ح» كانت بتضيع
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (١٩ نوفمبر ٢٠٢٦): «رعب4925 … المندوب … فتح الشهادة بتاعتها لقي ال بي دي اف مكتوب فيه رعا مش رعب»
 *  و«فيه لوحات مش كامله» (ر ع 8970، ر و 5337، ب ق 8499 …).
 *
 *  السطور تحت **منسوخة حرفياً** من `REPO-301-00291063.pdf` (شركة راية للتمويل) اللي بعتها المالك.
 *  اللوحة في صورة الشهادة «ر ع ا 4925»، والمستأجر «هيا صلاح الهزاع».
 *
 *  السبب: كل حرف «لوحده» (زي حروف اللوحة اللي بينها مسافات) ليه رمز، والرموز دي **بترتيب الحروف العربي
 *  بالظبط** من ء (0353) لحد ي (0377). الجدول كان كاتب 0355 «ب» (هي «أ» — بين آ وؤ) وناقصه 035F «ح».
 */
// المصنع: هافل رقم اللوحة باللغة العربية: ر ع ا 4925
const PLATE_LINE = "4925͕ͫͣ :͂௬̗௛̯̺͙ ̲͂ Ͼ̺̗̓ ̜͂ ͵Ͼ̺͙ Ͳ̷ͣ ͱ̴̓̽ :̢̰̼̻̺͙";
// اسم المستأجر: هيا صلاح الهزاع
const TENANT_LINE = "௜̺͙̾ ̢͇͟ ̓ ௬̽ :௛̔̚௪̠̻̺͙ Ͳ̠͙";
const FOOTER = "Riyadh 12361 ± 6858, Saudi Arabia, 920002942, www.sijil.sa";
const cert = (plateLine = PLATE_LINE) => [plateLine, TENANT_LINE, FOOTER].join("\n");

describe("🔴 حروف اللوحة من الشهادة نفسها", () => {
  it("🔴 «ر ع ا 4925» مش «ر ع ب 4925»", () => {
    const f = parseCertText(cert(), "REPO-301-00291063.pdf");
    expect(f.issuer).toBe("sijil");
    expect(f.plate).toBe("رعا4925");
    expect(f.plateText).toBe("ر ع ا 4925");
  });

  it("🔴 «ح» ماتضيعش ⇒ اللوحة ٣ حروف مش حرفين", () => {
    // نفس السطر بالظبط بس الحرف الأولاني (آخر واحد في الملف المقلوب) «ح» بدل «أ»
    const f = parseCertText(cert(PLATE_LINE.replace("4925͕", "8970͟")), "REPO-301-00291036.pdf");
    expect(f.plate).toBe("رعح8970");
    expect(f.plateText).toBe("ر ع ح 8970");
  });

  it("«ب» الحقيقية بتفضل «ب» — `REPO-301-00266264.pdf` صورتها «ر ع ب 1728» (رمز 035A)", () => {
    const f = parseCertText(cert(PLATE_LINE.replace("4925͕", "1728͚")), "REPO-301-00266264.pdf");
    expect(f.plate).toBe("رعب1728");
  });

  it("«ح» من نفس الملف — «صلاح» في اسم المستأجر", () => {
    expect(decodeSijilText(cert())).toContain("صلاح");
  });

  it("🔴 الحروف اللي لوحدها بترتيب الحروف العربي (ء ⇒ ي) — كل خانة في الجدول على حرفها", () => {
    // «ـ» (التطويل) في مكانه بين غ وف — زي ترتيب يونيكود — ومالوش حرف.
    const ORDER = [..."ءآأؤإئابةتثجحخدذرزسشصضطظعغ", "ـ", ..."فقكلمنهوىي"];
    ORDER.forEach((letter, i) => {
      if (letter === "ـ") return;
      expect([String.fromCodePoint(0x353 + i).codePointAt(0)!.toString(16), SIJIL_GLYPHS[String.fromCodePoint(0x353 + i)]])
        .toEqual([(0x353 + i).toString(16), letter]);
    });
  });
});

/**
 * 🔁 بعد الجدول اللي من الخط + قواعد «يا صح يا مفيش» (`certPlateStrict.test.ts`): **كل** شهايد «السجل» من آخر أسبوع
 * بتتقري تاني مرة واحدة (مش المشكوك فيها بس) — والجديد اللي لسه نازل بيتقري **قبلها** عشان مايستناش.
 */
describe("🔁 شهايد «السجل» بتتقري تاني بالقارئ الجديد (مرة واحدة)", () => {
  it("🔴 الدورة بتبعتها بتاريخ الإصلاح — من آخر أسبوع", async () => {
    const requeue = vi.fn(async () => {});
    const d: CertDailyDeps = {
      now: () => new Date("2026-11-19T13:00:00Z"),
      listRange: vi.fn(async () => ({ files: [], next: null })),
      insertNew: vi.fn(async () => {}),
      pending: vi.fn(async () => []),
      requeueSijilGlyphs: requeue,
      download: vi.fn(async () => null),
      extractText: vi.fn(async () => ""),
      saveParsed: vi.fn(async () => {}),
      cleanup: vi.fn(async () => {}),
      budgetMs: 60_000,
      concurrency: 1,
    };
    await certDailyTick(d);
    expect(requeue).toHaveBeenCalledWith("2026-11-12", CERT_SIJIL_GLYPHS_AT);
    // بعد نشر الجدول اللي من الخط (#545 كان ١٣:٠٢)
    expect(Date.parse(CERT_SIJIL_GLYPHS_AT)).toBeGreaterThan(Date.parse("2026-11-19T13:33:00Z"));   // بعد #546 (قراية أوامر الرسم)
  });

  // ١٩ نوفمبر ٢٠٢٦ (بعد «توثيق» كمان — `tawtheeqExact.test.ts`): **كل** الشهايد مش «السجل» بس
  it("🔴 التخزين: كل الشهايد اللي اتقرت قبل الإصلاح («السجل» و«توثيق») — في الجدولين", () => {
    const store = readFileSync("lib/certDailyStore.ts", "utf8");
    const fn = store.slice(store.indexOf("export async function requeueSijilGlyphCerts"), store.indexOf("export async function requeueNoPlateCerts"));
    expect(fn).not.toMatch(/cert_no/);
    expect(fn).toMatch(/\.lt\("updated_at", beforeIso\)/);
    expect(fn).toMatch(/\.eq\("parsed", true\)/);
    expect(fn).not.toMatch(/plate_text/);
    // الجديد اللي لسه نازل قبل المُعاد (المُعاد `updated_at` بتاعه قديم) — من غير كده شهايد النهارده الجديدة تستنى
    const pending = store.slice(store.indexOf("export async function pendingCerts"), store.indexOf("export async function saveParsedCert"));
    expect(pending).toMatch(/\.order\("day", \{ ascending: false \}\)\.order\("updated_at", \{ ascending: false \}\)/);
    expect(readFileSync("app/api/cron/cert-daily/route.ts", "utf8")).toMatch(/requeueSijilGlyphs: requeueSijilGlyphCerts/);
    expect(readFileSync("app/api/cron/cert-daily-private/route.ts", "utf8"))
      .toMatch(/requeueSijilGlyphs: \(fromDay, beforeIso\) => requeueSijilGlyphCerts\(fromDay, beforeIso, T\)/);
  });
});

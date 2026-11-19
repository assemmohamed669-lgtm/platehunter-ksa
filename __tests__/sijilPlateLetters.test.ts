import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { decodeSijilText } from "@/lib/sijilGlyphs";
import { SIJIL_GLYPHS } from "@/lib/sijilGlyphs.map";
import { parseCertText } from "@/lib/certParse";
import { certDailyTick, CERT_SIJIL_GLYPHS_AT, SIJIL_SUSPECT_PLATE_RE, type CertDailyDeps } from "@/lib/certDailyJob";

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

describe("🔁 الشهايد اللي اتقرت غلط بتتقري تاني (مرة واحدة)", () => {
  const re = new RegExp(SIJIL_SUSPECT_PLATE_RE);

  it("المشكوك فيها بس: فيها «ب» أو حرفين بس", () => {
    expect(re.test("ر ع ب 4925")).toBe(true);
    expect(re.test("ر ع 8970")).toBe(true);
    expect(re.test("ب ق 8499")).toBe(true);
    expect(re.test("ر ع ا 4925")).toBe(false);
    expect(re.test("د ل س 8377")).toBe(false);
    expect(re.test("")).toBe(false);
  });

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
    expect(Date.parse(CERT_SIJIL_GLYPHS_AT)).toBeGreaterThan(Date.parse("2026-11-19T12:50:00Z"));
  });

  it("🔴 التخزين: «السجل» بس (CRN-) · اتقرت قبل الإصلاح · لوحتها مشكوك فيها — في الجدولين", () => {
    const store = readFileSync("lib/certDailyStore.ts", "utf8");
    const fn = store.slice(store.indexOf("export async function requeueSijilGlyphCerts"));
    expect(fn).toMatch(/\.like\("cert_no", "CRN-%"\)/);
    expect(fn).toMatch(/\.lt\("updated_at", beforeIso\)/);
    expect(fn).toMatch(/\.eq\("parsed", true\)/);
    expect(fn).toMatch(/\.filter\("plate_text", "match", SIJIL_SUSPECT_PLATE_RE\)/);
    expect(readFileSync("app/api/cron/cert-daily/route.ts", "utf8")).toMatch(/requeueSijilGlyphs: requeueSijilGlyphCerts/);
    expect(readFileSync("app/api/cron/cert-daily-private/route.ts", "utf8"))
      .toMatch(/requeueSijilGlyphs: \(fromDay, beforeIso\) => requeueSijilGlyphCerts\(fromDay, beforeIso, T\)/);
  });
});

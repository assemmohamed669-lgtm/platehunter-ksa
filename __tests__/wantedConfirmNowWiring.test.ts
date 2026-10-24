/**
 * ⚡ نافذة التأكيد الفورية — الربط في المحرّك وصفحة Voice PRO (المالك ٢٤ أكتوبر ٢٠٢٦).
 * المنطق نفسه في `lib/wantedConfirmNow.test.ts`. هنا: المحرّك بيسجّل النوافذ الزاحفة **بالعلم بس** (`wantedConfirm`)
 * ويبعت نافذة التأكيد بالخطة، والصفحة بتطلبها لما قراية تلاقي لوحة في الشيت ولسه ماتأكّدتش — والقاعدة
 * (`confirmWanted` نافذتين) زي ما هي بالحرف.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const ENGINE = read("lib/voicexEngine.ts");
const VP = read("app/(app)/registration-v2/page.tsx");
const IC = read("app/(app)/instant-check/page.tsx");

describe("المحرّك", () => {
  it("العلم `wantedConfirm` في الخيارات، والطريقة `confirmNow` في الكنترولر", () => {
    expect(ENGINE).toMatch(/wantedConfirm\?: boolean;/);
    expect(ENGINE).toMatch(/confirmNow\?: \(tMs: number\) => boolean;/);
  });

  it("النوافذ الزاحفة بتتسجّل بالعلم بس — من غيره المسار القديم بالحرف", () => {
    expect(ENGINE).toMatch(/const CONFIRM = FIXES && opts\.wantedConfirm === true;/);
    expect(ENGINE).toMatch(/if \(CONFIRM\) noteSlide\(slideFrom, elapsed\);\n\s*sliceAndSend\(slideFrom, elapsed\);/);
  });

  it("confirmNow: بالخطة (`planConfirmWindow`)، مرة لكل نافذة، وواحدة في المرة", () => {
    expect(ENGINE).toMatch(/if \(!CONFIRM \|\| stopped \|\| weak \|\| gaveUp \|\| fatalFired\) return false;/);
    expect(ENGINE).toMatch(/planConfirmWindow\(w, mic\.elapsedSec, lastSlideTo, STEP_MS \/ 1000, WIN_S\)/);
    expect(ENGINE).toMatch(/confirmAsked\.has\(tMs\)/);
    expect(ENGINE).toMatch(/confirmInflight >= 1/);
  });
});

describe("صفحة Voice PRO", () => {
  it("المحرّك بياخد العلم للسوبر أدمن بس", () => {
    expect(VP).toMatch(/wantedConfirm: canConfirmNow\(sup\),/);
  });

  it("قراية لاقت لوحة في الشيت ولسه ماتأكّدتش ⇒ اطلب نافذة التأكيد (microtask مش setTimeout — التايمر بيتخنق في الخلفية)", () => {
    expect(VP).toMatch(/const heard = wantedHits\(r, checkIndexRef\.current, \(x\) => normalizePlate\(bankPlateToArabic\(x\)\)\);/);
    expect(VP).toMatch(/const hits = heard\s*\.filter\(\(h\) => confirmWanted\(wantedSeenRef\.current, normalizePlate\(bankPlateToArabic\(h\.plate\)\), r\.tMs\)\);/);
    expect(VP).toMatch(/if \(canConfirmNow\(sup\) && heard\.length > hits\.length\) \{/);
    expect(VP).toMatch(/queueMicrotask\(\(\) => \{[\s\S]{0,200}engineRef\.current\?\.confirmNow\?\.\(tMs\)/);
  });

  it("القاعدة زي ما هي: الصفّارة من `hits` المتأكّدة بس", () => {
    expect(VP).toMatch(/for \(const h of hits\) alertWanted\(h\.plate, h\.row\);/);
  });

  it("الشيت جهز وسط الجلسة ⇒ اللوحات المؤكّدة اللي فاتت تصفّر (السوبر أدمن)", () => {
    expect(VP).toMatch(/if \(!canConfirmNow\(isSuperRef\.current\) \|\| checkIndex\.size === 0\) return;/);
    expect(VP).toMatch(/sheetReadyAlerts\(rowsRef\.current, checkIndex,/);
  });
});

describe("«صوتي» (التشييك) مالمسناهاش", () => {
  it("مابتبعتش العلم ولا بتنده confirmNow", () => {
    expect(IC).not.toMatch(/wantedConfirm/);
    expect(IC).not.toMatch(/confirmNow/);
  });
});

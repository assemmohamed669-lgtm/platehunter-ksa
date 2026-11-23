/**
 * 🔔 **كل عربية مطلوبة بتصفّر** — المالك (٢٣ نوفمبر ٢٠٢٦): «قولت واحده مطلوبه ومظهرتش ولا رن ولا جاب اشعار ولما دخلت
 * جوة علي البرنامج حتي مش مكتوب قدامها انها مطلوبه … ولما قفلت البرنامج وفتحته اتعلم عليها انها مطلوبه … كل سيارة مطلوبه
 * يطلع ليها تنبيه صوتي».
 *
 * الصندوق (af40c1a6، ٤:٣٢:٢٤م): `rv2-wanted via=plate ok=false mult=1 reads=1` — الإجماع طلّع الصف باللوحة المطلوبة من
 * نافذة واحدة ⇒ قاعدة «نافذتين» (٢٥ سبتمبر) خلّته صف عادي من غير «مطلوبة» ولا صفّارة. وبعد إعادة الفتح `rehydrateMatch`
 * بيعلّم من الشيت **من غير** الشرط ده ⇒ اتعلّمت. القاعدة دلوقتي: الصف اللي ظهر في الجدول بلوحة في الشيت = مطلوبة + صفّارة
 * (نفس اللي إعادة الفتح بتعمله). القراية المباشرة (قبل الإجماع) لسه بنافذتين — دي اللي بتصفّر بدري.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sheetReadyAlerts } from "@/lib/wantedConfirmNow";

const VP = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8");

describe("Voice PRO — الصف اللي ظهر بلوحة مطلوبة", () => {
  it("بيتعلّم «مطلوبة» ويصفّر حتى من نافذة واحدة", () => {
    expect(VP).toMatch(/const hit = inSheet;/);
    expect(VP).not.toMatch(/const hit = inSheet && \(meta\.mult >= 2/);
    expect(VP).toMatch(/return placeLiveRow\(prev, fresh, fleetDistinct\);\s*\}\);\s*if \(hit\) alertWanted\(plate, hit\);/);
  });

  it("القراية المباشرة (قبل الإجماع) لسه بالتأكيد — مافيش صفّارة من قراية غلط قبل ما الصف يظهر", () => {
    expect(VP).toMatch(/\.filter\(\(h\) => confirmWanted\(wantedSeenRef\.current, normalizePlate\(bankPlateToArabic\(h\.plate\)\), r\.tMs\)\);/);
  });
});

describe("الشيت جهز وسط الجلسة — نفس القاعدة", () => {
  const now = 1_000_000;
  const start = now - 60_000;
  const idx = new Map([["حبك5813", { "رقم اللوحة": "حبك5813" }]]);
  const key = (p: string) => p;

  it("صف من نافذة واحدة ⇒ يصفّر (زي إعادة الفتح بالظبط)", () => {
    const r = { plate: "حبك5813", provisional: false, mult: 1, shownAt: now - 5_000, match: null };
    expect(sheetReadyAlerts([r], idx, key, start, now).map((h) => h.plate)).toEqual(["حبك5813"]);
  });

  it("المبدئية (🟡 لسه ماظهرتش في الإجماع) ⇒ لأ", () => {
    const r = { plate: "حبك5813", provisional: true, mult: 1, shownAt: now - 5_000, match: null };
    expect(sheetReadyAlerts([r], idx, key, start, now)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  normalizePlate, bankPlateToArabic, matchTokensAgainstRows, buildReferralIndex, matchChunkAgainstIndex,
  parsePlateFromTranscript, collectReferralEntries,
} from "@/lib/plateParser";
import { combinedCheckPlates, buildCombinedCheckIndex } from "@/lib/checkSheets";
import { matchCertFiles } from "@/lib/certificateMatch";
import { batchFindCertificates, clearCertBatchCache } from "@/lib/certBatch";
import { wantedHits } from "@/lib/wantedFastPath";

/**
 * 0️⃣ الأصفار اللي قبل أرقام اللوحة — المالك (٧ أكتوبر ٢٠٢٦): «لما يبقي رقم اللوحه مثلا يهل76 في الفرز
 * يفهم ان اللوحه دي يهل0076 ... يبق816 لو كدة في المحفظه وعند المندوب في الداتا يبق0816 دي هيا نفس
 * اللوحه بس هو البنك بينزلها بدون ال صفر ... عايز دة يتطبق علي الفرز كله ... وعلي التشييك كتابه وصوتي وكله».
 * لوحات حقيقية من شيت التشييك/الإحالة اللي بعتها المالك.
 */
const bankStyle = ["ي ه ل 76", "ي ب ق 816", "و ص ق 57", "أ أ ل 1108", "ي م د 18", "ي ب س 87"];
const delegateStyle = ["يهل0076", "يبق0816", "وصق0057", "اال1108", "يمد0018", "يبس0087"];
const key = (p: string) => normalizePlate(bankPlateToArabic(p));
const rows = (list: string[]) => list.map((p) => ({ "رقم اللوحة": p }));

describe("🔴 نفس اللوحة بالأصفار ومن غيرها", () => {
  it("🔴 المفتاح واحد", () => {
    bankStyle.forEach((b, i) => expect(key(b)).toBe(key(delegateStyle[i])));
    expect(key("يهل76")).toBe("يهل0076");
  });
  it("🔴 الفرز (الإحالة من غير أصفار ⇐ الداتا بالأصفار) — والعكس", () => {
    const idx = buildReferralIndex(rows(bankStyle), "رقم اللوحة");
    expect(matchChunkAgainstIndex(rows(delegateStyle), "رقم اللوحة", idx, 88, false)).toHaveLength(6);
    const back = buildReferralIndex(rows(delegateStyle), "رقم اللوحة");
    expect(matchChunkAgainstIndex(rows(bankStyle), "رقم اللوحة", back, 88, false)).toHaveLength(6);
    const merged = collectReferralEntries([{ rows: rows(bankStyle), plateCol: "رقم اللوحة" } as never]);
    expect(merged.map((e) => e.norm).sort()).toEqual(delegateStyle.map(key).sort());
  });
  it("🔴 لصق نصي", () => {
    expect(matchTokensAgainstRows(["يهل0076", "ي ب ق 816"], rows(["ي ه ل 76", "يبق0816"]), "رقم اللوحة", 88, false)).toHaveLength(2);
  });
  it("🔴 التشييك (كتابة): شيت التشييك من غير أصفار والمندوب يكتبها بالأصفار — أو من غيرها", () => {
    const src = [{ headers: ["رقم اللوحة"], rows: rows(bankStyle) }];
    const set = combinedCheckPlates(src);
    for (const typed of [...delegateStyle, "يهل76", "ي ه ل 0076"]) expect(set.has(key(typed))).toBe(true);
    expect(buildCombinedCheckIndex(src).get(key("يبق0816"))).toBeTruthy();
  });
  it("🔴 «فويس اكس» (صفّارة المطلوب): المندوب قال «يهل0076» والشيت فيه «يهل76» أو «ي ه ل 76»", () => {
    // المالك (٧ أكتوبر ٢٠٢٦): «لو المندوب وهو بيسجل قال هل0076 وهيا في شت التشييك هل76 او ه ل 76 المفروض دي
    // لوحه متطابقه ف تطلع معاه انها مطلوبه» — نفس الفهرس ونفس التطبيع اللي صفحة التسجيل بتستعملهم.
    for (const sheet of [["يهل76"], ["ي ه ل 76"], ["يهل0076"]]) {
      const index = buildCombinedCheckIndex([{ headers: ["رقم اللوحة"], rows: rows(sheet) }]);
      const hits = wantedHits({ plate: "يهل0076", accepted: true, blocked: false, conf: 0.95 }, index, key);
      expect(hits.map((h) => h.plate)).toEqual(["يهل0076"]);
    }
  });
  it("🔴 الصوت: «صفر صفر سبعة ستة» زي «سبعة ستة»", () => {
    const a = parsePlateFromTranscript("ي ه ل صفر صفر سبعة ستة");
    const b = parsePlateFromTranscript("ي ه ل سبعة ستة");
    const plateOf = (r: unknown) => String((r as { plate?: string; plates?: string[] }).plate ?? (r as { plates?: string[] }).plates?.[0] ?? "");
    expect(key(plateOf(a))).toBe("يهل0076");
    expect(key(plateOf(b))).toBe("يهل0076");
  });
});

describe("🔴 الشهايد كمان (عمود «شهايد» والبحث عن الشهادة)", () => {
  it("🔴 ملف «يهل76» لعربية «يهل0076» — والعكس", () => {
    const files = [{ name: "ي ه ل 76.pdf" }, { name: "يبق0816.pdf" }, { name: "يهل7600.pdf" }];
    expect(matchCertFiles("يهل0076", files).map((f) => f.name)).toEqual(["ي ه ل 76.pdf"]);
    expect(matchCertFiles("يبق816", files).map((f) => f.name)).toEqual(["يبق0816.pdf"]);
  });
  it("🔴 الدفعة بتسأل درايف بالشكلين (0076 و76) وبتلاقي الملف", async () => {
    clearCertBatchCache();
    const asked: string[] = [];
    const drive = [{ id: "a", name: "يهل76.pdf" }, { id: "b", name: "يبق0816.pdf" }];
    const r = await batchFindCertificates(["يهل0076", "يبق816"], async (q) => {
      asked.push(q);
      const want = [...q.matchAll(/name contains '(\d+)'/g)].map((m) => m[1]);
      return { files: drive.filter((f) => want.some((d) => f.name.includes(d))) as never, ok: true, truncated: false };
    });
    expect(asked.join(" ")).toMatch(/'0076'/);
    expect(asked.join(" ")).toMatch(/'76'/);
    expect(r.results["يهل0076"].map((h) => h.id)).toEqual(["a"]);
    expect(r.results["يبق816"].map((h) => h.id)).toEqual(["b"]);
  });
});

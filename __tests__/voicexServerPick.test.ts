import { describe, it, expect } from "vitest";
import { pickVoicexServer, parseServers, type VoicexServer } from "@/lib/voicexPointer";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔀 توزيع المناديب على أكتر من صندوق
 * ══════════════════════════════════════════════════════════════════════
 *
 * الصندوق الواحد طاقته **٣.٣ نافذة/ث**، والمندوب الحقيقي بيبعت **١٠.٦
 * نافذة/دقيقة** (مقيس على ٣٠ مندوب · ٣٣ ألف نافذة من حصاد كوريا) ⇒
 * **~١٥-١٨ مندوب للصندوق**. والمالك متوقّع ٢٠-٢٥ ⇒ محتاج صندوقين.
 *
 * 🔴 **والتطبيق كان بيشاور على سيرفر واحد** — فالصندوق التاني مالوش
 * لازمة من غير توزيع.
 *
 * القواعد:
 *   · التوزيع **ثابت** لكل مندوب (نفس الصندوق كل مرة) — عشان الكارت
 *     يفضل ساخن ومانرجّعش المندوب على صندوق بارد كل جلسة.
 *   · لو صندوقه واقع يتحوّل للي بعده — **والباقي مايتحركوش**.
 *   · **فشل-مغلق**: مافيش صندوق شغّال ⇒ `null` ⇒ رجوع لديبجرام.
 */
const up = (u: string): VoicexServer => ({ url: u, isUp: true });
const down = (u: string): VoicexServer => ({ url: u, isUp: false });

describe("اختيار صندوق المندوب", () => {
  it("مافيش صناديق ⇒ null", () => {
    expect(pickVoicexServer([], "a")).toBeNull();
  });

  it("كلهم واقعين ⇒ null (فشل-مغلق)", () => {
    expect(pickVoicexServer([down("https://a"), down("https://b")], "x")).toBeNull();
  });

  it("صندوق واحد ⇒ هو دايماً — نفس سلوك النهاردة بالحرف", () => {
    const one = [up("https://a")];
    for (const id of ["x", "y", "z", ""]) {
      expect(pickVoicexServer(one, id)?.url).toBe("https://a");
    }
  });

  it("🔴 نفس المندوب ⇒ نفس الصندوق كل مرة", () => {
    const s = [up("https://a"), up("https://b"), up("https://c")];
    const first = pickVoicexServer(s, "agent-42")?.url;
    for (let i = 0; i < 20; i++) expect(pickVoicexServer(s, "agent-42")?.url).toBe(first);
  });

  it("🔴 المناديب بيتوزّعوا مش كلهم على واحد", () => {
    const s = [up("https://a"), up("https://b")];
    const hit = new Set<string>();
    for (let i = 0; i < 40; i++) hit.add(pickVoicexServer(s, "agent-" + i)!.url);
    expect(hit.size).toBe(2);
  });

  it("🔴 صندوق وقع ⇒ اللي عليه يتحوّل، **والباقي مكانهم**", () => {
    const all = [up("https://a"), up("https://b"), up("https://c")];
    const before = new Map<string, string>();
    for (let i = 0; i < 30; i++) before.set("g" + i, pickVoicexServer(all, "g" + i)!.url);

    const after = [all[0], down("https://b"), all[2]];
    let moved = 0;
    for (let i = 0; i < 30; i++) {
      const u = pickVoicexServer(after, "g" + i)!.url;
      expect(u).not.toBe("https://b");
      if (u !== before.get("g" + i)) moved += 1;
    }
    // اللي كانوا على b بس هما اللي اتحركوا
    const wasOnB = [...before.values()].filter((u) => u === "https://b").length;
    expect(moved).toBe(wasOnB);
    expect(wasOnB).toBeGreaterThan(0);
  });

  it("بلا معرّف مندوب ⇒ أول صندوق شغّال (سلوك محدَّد مش عشوائي)", () => {
    const s = [down("https://a"), up("https://b"), up("https://c")];
    expect(pickVoicexServer(s, null)?.url).toBe("https://b");
    expect(pickVoicexServer(s, "")?.url).toBe("https://b");
  });
});

describe("قراءة قائمة الصناديق من الصف", () => {
  it("مافيش عمود إضافي ⇒ الصندوق الأساسي بس (توافق كامل)", () => {
    expect(parseServers("https://a", true, undefined)).toEqual([
      { url: "https://a", isUp: true },
    ]);
  });

  it("العمود الإضافي بيتضاف بعد الأساسي", () => {
    expect(parseServers("https://a", true, [
      { url: "https://b", is_up: true },
      { url: "https://c", is_up: false },
    ])).toEqual([
      { url: "https://a", isUp: true },
      { url: "https://b", isUp: true },
      { url: "https://c", isUp: false },
    ]);
  });

  it("الصفوف البايظة بتتشال مش بتكسّر", () => {
    expect(parseServers("https://a", true, [
      { url: "https://b" }, null, { url: 5 }, "x", { is_up: true },
    ] as unknown[])).toEqual([
      { url: "https://a", isUp: true },
      { url: "https://b", isUp: true },   // `is_up` ناقص = شغّال (زي الجدول)
    ]);
  });

  it("المكرّر بيتشال — صندوق مرّتين مايخدش ضعف المناديب", () => {
    expect(parseServers("https://a", true, [{ url: "https://a", is_up: true }])).toEqual([
      { url: "https://a", isUp: true },
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { parseNoticeText, noticePlainText, normalizeLinkInput, linkMarkup } from "@/lib/noticeLinks";
import NoticeText from "@/components/NoticeText";

/**
 * 🔗 اللينكات في رسايل الأدمن للمناديب — المالك (١٤ أكتوبر ٢٠٢٦): «لو فيه اي لينك انا حاطه في الرساله عايزه يتضغط
 * مثلا اضغط هنا وكمان يبقي مفعل لما تدوس عليه يوديه علي مكان الرابط». قبل كده الرسالة نص عادي واللينك مابيتدسش.
 * لينك عادي ⇒ أزرق ويتدس · «[اضغط هنا](لينك)» ⇒ «اضغط هنا» بالأزرق ويودّي على اللينك.
 */
describe("🔴 قراءة اللينكات من الرسالة", () => {
  it("من غير لينك ⇒ نفس النص زي ما هو", () => {
    expect(parseNoticeText("حدّثوا البرنامج النهارده")).toEqual([{ type: "text", value: "حدّثوا البرنامج النهارده" }]);
  });
  it("لينك عادي ⇒ يتدس وبيظهر هو نفسه", () => {
    expect(parseNoticeText("حدّث من هنا https://play.google.com/store/apps/details?id=com.platehunter.ksa شكراً")).toEqual([
      { type: "text", value: "حدّث من هنا " },
      { type: "link", label: "https://play.google.com/store/apps/details?id=com.platehunter.ksa", url: "https://play.google.com/store/apps/details?id=com.platehunter.ksa" },
      { type: "text", value: " شكراً" },
    ]);
  });
  it("«اضغط هنا» ⇒ الكلام ده بس هو اللي بيظهر ويودّي على اللينك", () => {
    expect(parseNoticeText("نزل تحديث [اضغط هنا](https://apps.apple.com/app/id6810736944) وحدّث")).toEqual([
      { type: "text", value: "نزل تحديث " },
      { type: "link", label: "اضغط هنا", url: "https://apps.apple.com/app/id6810736944" },
      { type: "text", value: " وحدّث" },
    ]);
  });
  it("النقطة/الفاصلة في آخر الجملة مش جزء من اللينك", () => {
    const parts = parseNoticeText("الرابط https://x.com/a.");
    expect(parts[1]).toEqual({ type: "link", label: "https://x.com/a", url: "https://x.com/a" });
    expect(parts[2]).toEqual({ type: "text", value: "." });
  });
  it("🔒 javascript: وأي حاجة مش http/https ماتبقاش لينك", () => {
    expect(parseNoticeText("[اضغط](javascript:alert(1))").every((p) => p.type === "text")).toBe(true);
  });
  it("أكتر من لينك في رسالة واحدة", () => {
    const links = parseNoticeText("أندرويد: [هنا](https://a.com) · آيفون: [هنا](https://b.com)").filter((p) => p.type === "link");
    expect(links.map((l) => (l as { url: string }).url)).toEqual(["https://a.com", "https://b.com"]);
  });
});

describe("🔴 اللينك في الشاشة", () => {
  it("أزرق وتحته خط وبيفتح بره البرنامج (البلاي ستور/الآب ستور بيفتحوا تطبيقهم)", () => {
    render(<NoticeText text="نزل تحديث [اضغط هنا](https://play.google.com/store/apps/details?id=com.platehunter.ksa)" />);
    const a = screen.getByRole("link", { name: "اضغط هنا" });
    expect(a.getAttribute("href")).toBe("https://play.google.com/store/apps/details?id=com.platehunter.ksa");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.className).toMatch(/text-blue-/);
    expect(a.className).toMatch(/underline/);
  });
});

describe("🔴 زرار «حط لينك» للأدمن", () => {
  it("اللينك من غير https ⇒ بنكمّله · كلام مش لينك ⇒ لأ", () => {
    expect(normalizeLinkInput("play.google.com/store/apps/details?id=com.platehunter.ksa"))
      .toBe("https://play.google.com/store/apps/details?id=com.platehunter.ksa");
    expect(normalizeLinkInput(" https://a.com ")).toBe("https://a.com");
    expect(normalizeLinkInput("مش لينك")).toBeNull();
    expect(normalizeLinkInput("javascript:alert(1)")).toBeNull();
  });
  it("الكلام فاضي ⇒ «اضغط هنا»", () => {
    expect(linkMarkup("", "https://a.com")).toBe("[اضغط هنا](https://a.com)");
    expect(linkMarkup("حدّث البرنامج", "https://a.com")).toBe("[حدّث البرنامج](https://a.com)");
  });
  it("رسالة واتساب «تواصل معانا» بتاخد الكلام واللينك من غير الأقواس", () => {
    expect(noticePlainText("حدّث [اضغط هنا](https://a.com) بسرعة")).toBe("حدّث اضغط هنا (https://a.com) بسرعة");
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("رسالة البث والرسالة الحمرا بيعرضوا اللينكات", () => {
    expect(read("components/NoticeBanner.tsx")).toMatch(/<NoticeText text=\{notice\.text\} \/>/);
    expect(read("components/NoticeBanner.tsx")).toMatch(/adminWhatsappLink\(noticePlainText\(notice\.text\)\)/);
    expect(read("components/AgentNoticeBanner.tsx")).toMatch(/<NoticeText text=\{x\.text\} \/>/);
  });
  it("زرار «حط لينك» في الرسالتين في لوحة الأدمن", () => {
    expect(read("app/admin/page.tsx")).toMatch(/<LinkInserter onInsert=\{\(m\) => setNoticeText\(/);
    expect(read("app/admin/[id]/page.tsx")).toMatch(/<LinkInserter onInsert=\{\(m\) => setNoticeDraft\(/);
  });
});

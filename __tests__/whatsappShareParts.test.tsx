import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import {
  splitShareText, utf8ByteLength, shareTextViaChooser, copyForWhatsApp, registerSharePartsSheet,
  partPlateRange, arabicDigits, hasSharePartsSheet, SHARE_PARTS_FOR_ALL,
  WHATSAPP_MESSAGE_MAX_BYTES, SHARE_PART_BYTES, SHARE_PART_RECORDS,
  type SharePartsRequest,
} from "@/lib/share";
import SharePartsSheet from "@/components/SharePartsSheet";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

/**
 * 📤 **واتساب بيقص أي رسالة فوق ٤٠٩٦ بايت** — المالك (٢ أكتوبر ٢٠٢٦، أندرويد):
 * «دوست تحديد الكل (٨٨) وبعدين واتساب — وصل ٢٤ بس، وحتى الـ٢٤ مقصوصين… وحتى
 * لما بدوس نسخ الكل والصقهم في واتساب بردو ناقصين».
 *
 * اتقاس على الرسالة اللي وصلت: **٤٠٩٥ بايت + نص حرف «ع»** (آخرها «العنوان: 61ك�»)
 * ومافيش «اقرأ المزيد» — يعني واتساب نفسه قصّ عند ٤٠٩٦ بايت بالظبط. البرنامج
 * كان بيسلّمه الـ٨٨ كاملين (المشاركة والنسخ الاتنين)، والقص في الاتنين في نفس
 * المكان. فالحل: أي نص أطول من الحد يتبعت **أجزاء** كل واحد تحت الحد.
 */

const SEP = "\n\n──────────\n\n";
// نفس شكل رسالة المالك + لينك الموقع (أطول من رسالته — فالأجزاء أصعب).
const block = (i: number) =>
  `${i + 1}. 🚗 بطن${1000 + i}\nنوع السيارة: غلط راجحي\nنوع السيارة (المحفظة): بكب غمارتين\n` +
  `العنوان: 91شوقيه\nالحي: الشوقيه\n📍 https://www.google.com/maps?q=21.412345,39.812345`;
const owner88 = `*السيارات المطلوبة للسحب (88)*\n\n` + Array.from({ length: 88 }, (_, i) => block(i)).join(SEP);
const nums = (t: string) => [...t.matchAll(/(?:^|\n)(\d+)\. /g)].map((m) => Number(m[1]));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("حد رسالة واتساب — ٤٠٩٦ بايت (مقاس)", () => {
  it("حجم الجزء تحت حد واتساب بهامش", () => {
    expect(WHATSAPP_MESSAGE_MAX_BYTES).toBe(4096);
    expect(SHARE_PART_BYTES).toBeLessThanOrEqual(WHATSAPP_MESSAGE_MAX_BYTES * 0.9);
  });

  it("الـ٨٨ لوحة أكبر من رسالة واتساب واحدة (ده اللي اتقص)", () => {
    expect(utf8ByteLength(owner88)).toBeGreaterThan(WHATSAPP_MESSAGE_MAX_BYTES * 4);
  });

  it("٨٨ لوحة ⇐ أجزاء كل واحد تحت الحد، واللوحات ١..٨٨ بالترتيب بلا فجوات", () => {
    const parts = splitShareText(owner88, SHARE_PART_BYTES, SHARE_PART_RECORDS);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(utf8ByteLength(p)).toBeLessThanOrEqual(SHARE_PART_BYTES);
    expect(parts.flatMap(nums)).toEqual(Array.from({ length: 88 }, (_, i) => i + 1));
    for (const p of parts) expect(p.trimEnd().endsWith("39.812345")).toBe(true);   // كل لوحة كاملة بموقعها
  });

  it("🔴 قايمة سطر لكل لوحة (من غير فواصل) بتتقسم عند آخر سطر — مفيش لوحة بتتقطع", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `${i + 1}. أبح${1000 + i} 🔴 مطلوبة`);
    const text = `*لوحات متشيّكة بالصوت (300)*\n\n` + lines.join("\n");
    const parts = splitShareText(text, SHARE_PART_BYTES, SHARE_PART_RECORDS);
    expect(parts.length).toBeGreaterThan(1);
    const original = new Set(lines);
    for (const p of parts) {
      expect(utf8ByteLength(p)).toBeLessThanOrEqual(SHARE_PART_BYTES);
      expect(p).not.toContain("──────────");   // مانحشرش فاصل سجلات في قايمة مالهاش
      for (const l of p.split("\n").filter((x) => /^\d+\. /.test(x))) expect(original.has(l), l).toBe(true);
    }
    expect(parts.flatMap(nums)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
  });

  it("🔴 مدى اللوحات في كل جزء (للشاشة)", () => {
    const parts = splitShareText(owner88, SHARE_PART_BYTES, SHARE_PART_RECORDS);
    expect(partPlateRange(parts[0])).toEqual({ from: 1, to: nums(parts[0]).at(-1) });
    expect(partPlateRange(parts.at(-1)!)?.to).toBe(88);
  });
});

describe("🔴 shareTextViaChooser — الطويلة بتفتح الأجزاء بدل ما واتساب يقصّها", () => {
  const setShare = (fn: unknown) => Object.defineProperty(navigator, "share", { value: fn, configurable: true, writable: true });

  it("فيه شاشة أجزاء ⇒ الطويلة بتروح للشاشة (مش للمشاركة مرة واحدة)", async () => {
    const share = vi.fn().mockResolvedValue(undefined); setShare(share);
    let got: SharePartsRequest | null = null;
    const off = registerSharePartsSheet((r) => { got = r; r.done("shared"); });
    try {
      await expect(shareTextViaChooser(owner88)).resolves.toBe("shared");
      expect(share).not.toHaveBeenCalled();
      expect(got!.mode).toBe("share");
      expect(got!.parts).toEqual(splitShareText(owner88, SHARE_PART_BYTES, SHARE_PART_RECORDS));
    } finally { off(); }
  });

  it("القصيرة بتتبعت على طول زي الأول", async () => {
    const share = vi.fn().mockResolvedValue(undefined); setShare(share);
    const open = vi.fn();
    const off = registerSharePartsSheet(open);
    try {
      await shareTextViaChooser(block(0));
      expect(share).toHaveBeenCalledWith({ text: block(0) });
      expect(open).not.toHaveBeenCalled();
    } finally { off(); }
  });

  it("مافيش شاشة (مش مفعّلة للمندوب) ⇒ زي الحي بالظبط", async () => {
    const share = vi.fn().mockResolvedValue(undefined); setShare(share);
    await shareTextViaChooser(owner88);
    expect(share).toHaveBeenCalledWith({ text: owner88 });
  });
});

describe("🔴 copyForWhatsApp — «نسخ الكل» بيتقص برضه لما يتلزق في واتساب", () => {
  it("الطويل + الشاشة ⇒ أجزاء للنسخ", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    let got: SharePartsRequest | null = null;
    const off = registerSharePartsSheet((r) => { got = r; });
    try {
      await expect(copyForWhatsApp(owner88)).resolves.toBe("parts");
      expect(got!.mode).toBe("copy");
      expect(writeText).not.toHaveBeenCalled();
    } finally { off(); }
  });

  it("القصير (أو مافيش شاشة) ⇒ بيتنسخ كامل زي الأول", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    await expect(copyForWhatsApp(block(0))).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(block(0));
    await expect(copyForWhatsApp(owner88)).resolves.toBe(true);   // مافيش شاشة مسجّلة
    expect(writeText).toHaveBeenLastCalledWith(owner88);
  });
});

describe("🔴 شاشة الأجزاء", () => {
  it("بتعرض كل جزء ومداه، وكل «ابعت» بيبعت جزءه وبيتعلّم «اتبعت»", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    render(<SharePartsSheet enabled />);
    const parts = splitShareText(owner88, SHARE_PART_BYTES, SHARE_PART_RECORDS);
    let outcome: Promise<unknown> | null = null;
    await act(async () => { outcome = shareTextViaChooser(owner88); });
    expect(screen.getByText(new RegExp(`${arabicDigits(parts.length)} أجزاء`))).toBeTruthy();
    expect(screen.getAllByText(/^الجزء /)).toHaveLength(parts.length);

    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^ابعت/ })[0]); });
    expect(share).toHaveBeenCalledWith({ text: parts[0] });
    expect(screen.getAllByText(/اتبعت/)).toHaveLength(1);

    // قفل وفيه أجزاء لسه ماتبعتتش ⇒ بيسأل الأول (عشان مافيش لوحة تضيع في صمت)
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "قفل" }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getAllByText(/^الجزء /)).toHaveLength(parts.length);   // لسه مفتوحة
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "قفل" }));
    await expect(outcome).resolves.toBe("shared");
    expect(screen.queryAllByText(/^الجزء /)).toHaveLength(0);
  });

  it("🔴 مفتوحة للكل — المالك قال «ارفعه للكل» (٢ أكتوبر ٢٠٢٦)", async () => {
    expect(SHARE_PARTS_FOR_ALL).toBe(true);
    // من غير `enabled` ومن غير مستخدم سوبر: الشاشة بتسجّل نفسها لأي مندوب.
    render(<SharePartsSheet />);
    await act(async () => {});
    expect(hasSharePartsSheet()).toBe(true);
  });

  it("مش مفعّلة ⇒ مابتسجّلش، والمشاركة زي الحي", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    render(<SharePartsSheet enabled={false} />);
    await act(async () => { await shareTextViaChooser(owner88); });
    expect(share).toHaveBeenCalledWith({ text: owner88 });
    expect(screen.queryAllByText(/^الجزء /)).toHaveLength(0);
  });
});

describe("🔴 التوصيل في البرنامج", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const fn = (src: string, head: string) => { const i = src.indexOf(head); return src.slice(i, src.indexOf("\n  }\n", i)); };

  it("الشاشة متركّبة في كل صفحات البرنامج", () => {
    expect(read("app/(app)/layout.tsx")).toContain("<SharePartsSheet");
  });

  it("صفحة الفرز: «واتساب» و«نسخ الكل» بيعدّوا على الأجزاء", () => {
    const s = read("app/(app)/sorting/page.tsx");
    expect(fn(s, "async function shareBulk(")).toContain("hasSharePartsSheet()");
    expect(fn(s, "async function copyBulk(")).toContain("copyForWhatsApp(");
  });

  it("التشييك: «نسخ الكل» بيعدّي على الأجزاء", () => {
    expect(fn(read("app/(app)/instant-check/page.tsx"), "async function copyPttSelected(")).toContain("copyForWhatsApp(");
  });

  it("صوت فقط: التحديد بيتصفّر لما سجلات المجموعة تتضاف (مايبعتش جزء من القايمة)", () => {
    const s = read("components/VoiceOnlySort.tsx");
    const merges = s.split("if (groupRows.length) {").slice(1).map((b) => b.slice(0, b.indexOf("\n      }")));
    expect(merges.length).toBe(2);
    for (const m of merges) expect(m).toContain("setSel(new Set())");
  });
});

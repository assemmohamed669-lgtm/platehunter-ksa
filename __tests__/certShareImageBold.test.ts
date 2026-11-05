import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderTableImages, wrapText } from "@/lib/plateImage";
import { CERT_SHARE_BOLD_FOR_ALL } from "@/lib/certDaily";

/**
 * 🅱️ صورة «شهايد النهارده» أوضح — المالك (٥ نوفمبر ٢٠٢٦) على صورة حقيقية لـ«شهايد النهارده في الداتا»:
 * «الالوان فيها باهته والخطه صغير خليه كبير شوي مش كتير وبولد علشان يبقي واضح».
 *  · كل الخانات عريضة (bold) وأكبر شوية (~١٢٪) · الكتابة غامقة (كانت رمادي) · خطوط الجدول أوضح.
 *  · ألوان المكرر = نفس ألوان الإكسيل الواضحة (`vividDupColor`) بدل الباهتة.
 *  · رقم الشهادة «CRN0000110583319» (من غير مسافات) كان بيركب على عمود «الحالة» ⇒ بيتكسر جوّه خانته.
 *  · 🛑 السوبر أدمن الأول (`CERT_SHARE_BOLD_FOR_ALL = false`) — باقي الصفحات والمناديب زي الأول بالحرف.
 */

type Call = { text: string; font: string; fill: string };
let texts: Call[];
let rects: string[];
let strokes: string[];
const realGetContext = HTMLCanvasElement.prototype.getContext;
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;

function fakeCtx() {
  const ctx = {
    font: "10px x", fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, textAlign: "right", textBaseline: "middle", direction: "rtl",
    scale() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { strokes.push(String(ctx.strokeStyle)); },
    fillRect() { rects.push(String(ctx.fillStyle)); },
    fillText(t: string) { texts.push({ text: t, font: ctx.font, fill: String(ctx.fillStyle) }); },
    // عرض تقريبي: كل حرف ≈ ٠٫٥٥ من حجم الخط
    measureText(t: string) { const px = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 10); return { width: Array.from(t).length * px * 0.55 }; },
  };
  return ctx;
}

beforeEach(() => {
  texts = []; rects = []; strokes = [];
  HTMLCanvasElement.prototype.getContext = function () { return fakeCtx(); } as unknown as typeof realGetContext;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
});

const CRN = "CRN0000110583319";
const table = (bold?: boolean) => ({
  title: "شهايد النهارده في الداتا",
  columns: ["رقم اللوحة", "نوع المركبة", "الشهادة", "الحالة", "المؤجر"],
  rows: [
    ["دسب 6631", "تشارجر", CRN, "تثبيت", "مصرف الراجحي"],
    ["دسب 6631", "تشارجر", CRN, "تثبيت", "مصرف الراجحي"],
    ["دعص 3965", "سبارك", "CRN0000110441696", "تثبيت", "مصرف الراجحي"],
  ],
  rowColors: ["#FDE047", "#FDE047", null],
  ...(bold === undefined ? {} : { bold }),
});
const cellTexts = () => texts.filter((c) => c.text !== "شهايد النهارده في الداتا" && !/لوحة$/.test(c.text));
const px = (font: string) => Number(/(\d+)px/.exec(font)?.[1]);

describe("🅱️ الصورة بالخط العريض (bold)", () => {
  it("🔴 كل الخانات عريضة وأكبر شوية — مش كتير (≤ ٢٠٪)", () => {
    renderTableImages(table(true));
    const cells = cellTexts();
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.font.startsWith("bold ")).toBe(true);
    const detail = cells.find((c) => c.text === "تشارجر")!;
    expect(px(detail.font)).toBeGreaterThan(34);
    expect(px(detail.font)).toBeLessThanOrEqual(34 * 1.2);
    const plate = cells.find((c) => c.text === "دسب 6631")!;
    expect(px(plate.font)).toBeGreaterThan(37);
  });

  it("🔴 الكتابة غامقة (مش رمادي) + خطوط الجدول أوضح", () => {
    renderTableImages(table(true));
    const detail = cellTexts().find((c) => c.text === "تشارجر")!;
    expect(detail.fill).toBe("#0f172a");
    expect(strokes.every((s) => s !== "#e2e8f0")).toBe(true);
  });

  it("🔴 رقم الشهادة الطويل بيتكسر جوّه خانته (مايركبش على «الحالة»)", () => {
    renderTableImages(table(true));
    const parts = cellTexts().filter((c) => c.text.startsWith("CRN") || /^\d+$/.test(c.text));
    expect(parts.some((c) => c.text === CRN)).toBe(false);
    expect(parts.map((c) => c.text).join("")).toContain(CRN);
    // «تثبيت» لسه مرسومة لوحدها
    expect(cellTexts().filter((c) => c.text === "تثبيت").length).toBe(3);
  });

  it("🔴 لون المكرر اللي اتبعت بيترسم زي ما هو (الصفحة بتبعته واضح)", () => {
    renderTableImages(table(true));
    expect(rects.filter((r) => r === "#FDE047").length).toBe(2);
  });
});

describe("باقي الصفحات (من غير bold) ⇒ زي الأول بالحرف", () => {
  it("الخط ٣٤ عادي · الكتابة رمادي · رقم الشهادة سطر واحد", () => {
    renderTableImages(table());
    const detail = cellTexts().find((c) => c.text === "تشارجر")!;
    expect(detail.font.startsWith("34px")).toBe(true);
    expect(detail.fill).toBe("#475569");
    expect(cellTexts().filter((c) => c.text === CRN).length).toBe(2);
    expect(strokes.every((s) => s === "#e2e8f0")).toBe(true);
  });
});

describe("wrapText — تكسير الكلمة الطويلة بس لما نطلبه", () => {
  const m = { measureText: (t: string) => ({ width: Array.from(t).length * 10 }) } as unknown as CanvasRenderingContext2D;
  it("🔴 breakLong ⇒ كل سطر جوّه العرض، والحروف كلها موجودة بالترتيب", () => {
    const lines = wrapText(m, CRN, 80, true);
    expect(lines).toEqual(["CRN00001", "10583319"]);   // نصّين متساويين — مش حتة طويلة وذيل صغير
    expect(wrapText(m, CRN, 100, true)).toEqual(["CRN00001", "10583319"]);
    for (const l of lines) expect(l.length * 10).toBeLessThanOrEqual(80);
    expect(lines.join("")).toBe(CRN);
  });
  it("من غيره ⇒ الكلمة سطر واحد زي الأول", () => {
    expect(wrapText(m, CRN, 80)).toEqual([CRN]);
    expect(wrapText(m, "مصرف الراجحي", 80)).toEqual(["مصرف", "الراجحي"]);
  });
});

describe("🛑 التوصيل — السوبر أدمن الأول", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 المفتاح مقفول للكل لحد تجربة المالك", () => {
    expect(CERT_SHARE_BOLD_FOR_ALL).toBe(false);
  });
  it("🔴 مربع الشهايد: bold + الألوان الواضحة للسوبر أدمن بس (النافذتين + «مشاركة الكل»)", () => {
    const c = read("components/DailyCertSort.tsx");
    expect(c).toMatch(/const boldShare = CERT_SHARE_BOLD_FOR_ALL \|\| isSuper;/);
    expect(c).toMatch(/boldShare \? c\.map\(\(x\) => x && vividDupColor\(x\)\) : c/);
    expect(c.match(/rowColors: imageColors\((rows|all)\)/g)?.length).toBe(2);
    expect(c.match(/bold: boldShare/g)?.length).toBe(2);
  });
  it("🔴 الصفحتين بيبعتوا isSuper · والزرار بيعدّي bold للرسم", () => {
    expect(read("app/(app)/wanted/page.tsx")).toMatch(/<DailyCertSort variant="sorting" isSuper=\{isSuper\} \/>/);
    expect(read("app/(app)/instant-check/page.tsx")).toMatch(/<DailyCertSort variant="team" isSuper=\{isSuper\} \/>/);
    expect(read("components/ShareSortButton.tsx")).toMatch(/bold: t\.bold/);
  });
});

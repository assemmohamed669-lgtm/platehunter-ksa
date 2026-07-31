import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPlateShareText, dataUrlToBlob, shareTextViaChooser, trimShareText, SAFE_SHARE_TEXT_CHARS } from "@/lib/share";

describe("shareTextViaChooser — قائمة النظام بدل واتساب المباشر", () => {
  const hadShare = "share" in navigator;
  const origShare = (navigator as unknown as { share?: unknown }).share;
  const origOpen = window.open;
  afterEach(() => {
    if (hadShare) Object.defineProperty(navigator, "share", { value: origShare, configurable: true, writable: true });
    else delete (navigator as unknown as { share?: unknown }).share;
    window.open = origOpen;
    vi.restoreAllMocks();
  });

  it("يستخدم Web Share API لو متاح (قائمة النظام تظهر)", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    const openMock = vi.fn();
    window.open = openMock as unknown as typeof window.open;
    const outcome = await shareTextViaChooser("نتيجة اختبار");
    expect(shareMock).toHaveBeenCalledWith({ text: "نتيجة اختبار" });
    expect(openMock).not.toHaveBeenCalled();
    expect(outcome).toBe("shared");
  });

  it("يرجع لرابط wa.me النصي لو مفيش مشاركة نظام", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true, writable: true });
    const openMock = vi.fn();
    window.open = openMock as unknown as typeof window.open;
    const outcome = await shareTextViaChooser("لوحة أبح1234");
    expect(openMock).toHaveBeenCalledTimes(1);
    const url = String((openMock.mock.calls[0] ?? [])[0] ?? "");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("لوحة أبح1234");
    expect(outcome).toBe("whatsapp-text");
  });
});

describe("buildPlateShareText", () => {
  it("starts with the plate line", () => {
    const t = buildPlateShareText({ plate: "أبح1234" });
    expect(t.split("\n")[0]).toBe("🚗 لوحة مطلوبة: أبح1234");
  });

  it("adds the status line right after the plate", () => {
    const t = buildPlateShareText({ plate: "أبح1234", status: "متشيكة بالكاميرا" });
    const lines = t.split("\n");
    expect(lines[1]).toBe("✅ متشيكة بالكاميرا");
  });

  it("includes non-empty detail pairs and skips blank ones", () => {
    const t = buildPlateShareText({
      plate: "أبح1234",
      details: [["الطراز", "كامري"], ["الحي", "  "], ["اللون", "أبيض"]],
    });
    expect(t).toContain("الطراز: كامري");
    expect(t).toContain("اللون: أبيض");
    expect(t).not.toContain("الحي:");
  });

  it("adds a maps link line when provided", () => {
    const t = buildPlateShareText({ plate: "أبح1234", mapsLink: "https://maps.google.com/?q=24.7,46.7" });
    expect(t).toContain("📍 الموقع: https://maps.google.com/?q=24.7,46.7");
  });

  it("omits the location line when no maps link", () => {
    const t = buildPlateShareText({ plate: "أبح1234" });
    expect(t).not.toContain("📍");
  });

  it("appends the date line last when provided", () => {
    const t = buildPlateShareText({ plate: "أبح1234", dateText: "07-07-2026 12:00" });
    const lines = t.split("\n");
    expect(lines[lines.length - 1]).toBe("التاريخ: 07-07-2026 12:00");
  });

  it("keeps order: plate → status → details → location → date", () => {
    const t = buildPlateShareText({
      plate: "أبح1234",
      status: "متشيكة بالكاميرا",
      details: [["الطراز", "كامري"]],
      mapsLink: "https://m/x",
      dateText: "07-07-2026",
    });
    expect(t.split("\n")).toEqual([
      "🚗 لوحة مطلوبة: أبح1234",
      "✅ متشيكة بالكاميرا",
      "الطراز: كامري",
      "📍 الموقع: https://m/x",
      "التاريخ: 07-07-2026",
    ]);
  });
});

describe("dataUrlToBlob", () => {
  it("decodes a base64 data URL into a Blob with the right type and bytes", async () => {
    // "SGVsbG8=" is base64 for "Hello" (5 bytes)
    const blob = dataUrlToBlob("data:image/jpeg;base64,SGVsbG8=");
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(5);
    expect(await blob.text()).toBe("Hello");
  });

  it("defaults to image/jpeg when the mime is absent", () => {
    const blob = dataUrlToBlob("data:;base64,SGVsbG8=");
    expect(blob.type).toBe("image/jpeg");
  });
});

// أندرويد بيرفض نقل بيانات ضخمة بين التطبيقات (TransactionTooLargeException)،
// وواتساب نفسه بيقطع الرسايل الطويلة. لو المندوب حدّد آلاف اللوحات، النص
// بيوصل مئات الكيلوبايت والتطبيق كان بيتجمّد — فبنقصّه عند حد آمن.
describe("trimShareText — حماية من تجميد المشاركة النصية", () => {
  const SEP = "\n\n──────────\n\n";
  const rec = (i: number) => `${i}. لوحة: سسع ${1000 + i}\nالحالة: مطلوبة\nالحي: النسيم الغربي`;
  const many = (n: number) => Array.from({ length: n }, (_, i) => rec(i)).join(SEP);

  it("النص القصير بيعدّي زي ما هو", () => {
    const t = many(5);
    const r = trimShareText(t);
    expect(r.trimmed).toBe(false);
    expect(r.text).toBe(t);
  });

  it("النص الطويل بيتقصّ لحد آمن", () => {
    const r = trimShareText(many(5000));
    expect(r.trimmed).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(SAFE_SHARE_TEXT_CHARS);
  });

  it("بيضيف سطر بيوضّح إن فيه باقي", () => {
    const r = trimShareText(many(5000));
    expect(r.text).toMatch(/الملف|أطول/);
  });

  it("بيقطع عند حدود سجل مش نص سجل", () => {
    const r = trimShareText(many(5000));
    // آخر سطر قبل التنويه لازم يكون سجل كامل (مش مقطوع في نص كلمة)
    const body = r.text.slice(0, r.text.lastIndexOf("\n\n"));
    expect(body.trimEnd().endsWith("النسيم الغربي")).toBe(true);
  });

  it("بيحترم حد مخصّص", () => {
    const r = trimShareText(many(500), 1000);
    expect(r.text.length).toBeLessThanOrEqual(1000);
    expect(r.trimmed).toBe(true);
  });

  it("نص بلا فواصل سجلات بيتقصّ برضه (مايعلّقش)", () => {
    const r = trimShareText("ا".repeat(200_000));
    expect(r.trimmed).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(SAFE_SHARE_TEXT_CHARS);
  });
});

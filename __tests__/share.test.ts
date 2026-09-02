import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPlateShareText, dataUrlToBlob, shareTextViaChooser, trimShareText, copyShareText, utf8ByteLength, splitShareText, isIosDevice, SAFE_SHARE_TEXT_BYTES } from "@/lib/share";

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
    expect(r.text.length).toBeLessThanOrEqual(SAFE_SHARE_TEXT_BYTES);
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
    expect(r.text.length).toBeLessThanOrEqual(SAFE_SHARE_TEXT_BYTES);
  });
});

// ── الحد الحقيقي بالبايت مش بالحروف ────────────────────────────────────────
// آيفون (PWA) بيمرّر نص المشاركة عبر share sheet بتاعة iOS، وهي بتقطع عند
// ~١٦ كيلوبايت **بايت**. العربي = ٢ بايت للحرف، فرسالة ٦٧ لوحة = ١٥٬٣٥٢ حرف
// (تحت حدنا القديم ٦٠ ألف حرف بكتير) لكن ٢٣٬٥٢٧ بايت — فوق الحيطة.
// النتيجة: واتساب كان بيستلم ٤٥ لوحة من ٦٧ **من غير ما يعرف إن فيه ناقص**.
describe("trimShareText — الحد بالبايت (قطع الآيفون الصامت)", () => {
  const SEP = "\n\n──────────\n\n";
  // سجل بحجم السجل الحقيقي في نتيجة الفرز (~٣٥٠ بايت: لوحة + ٧ أعمدة + لينك GPS)
  const rec = (i: number) =>
    `${i + 1}. 🚗 أبح ${1000 + i}\nالبنك: بنك الراجحي\nطراز المركبة: اكسبلوررر\n` +
    `صانع المركبة: فورد\nسنة الصنع: 2019\nلون المركبة: ابيض\nالحي: حي النهضة\n` +
    `نوع السيارة (صالون)\n📍 https://www.google.com/maps/search/?api=1&query=24.713552,46.675297`;
  const many = (n: number) =>
    `*السيارات المطلوبة للسحب (${n})*\n\n` + Array.from({ length: n }, (_, i) => rec(i)).join(SEP);

  it("بيعدّ بايت UTF-8 مش حروف — العربي حرفه ٢ بايت", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("لوحة")).toBe(8);   // ٤ حروف × ٢ بايت
  });

  it("حدّ الأمان أقل من حيطة الآيفون ١٦٣٨٤ بايت", () => {
    expect(SAFE_SHARE_TEXT_BYTES).toBeLessThan(16_384);
  });

  it("🐞 رسالة ٦٧ لوحة بتتقصّ — كانت بتعدّي صامتة وتوصل ٤٥ بس", () => {
    const t = many(67);
    expect(t.length).toBeLessThan(60_000);          // تحت الحد القديم بالحروف
    expect(utf8ByteLength(t)).toBeGreaterThan(16_384); // بس فوق حيطة الآيفون
    expect(trimShareText(t).trimmed).toBe(true);
  });

  it("الناتج المقصوص تحت الحد الآمن بالبايت", () => {
    expect(utf8ByteLength(trimShareText(many(67)).text)).toBeLessThanOrEqual(SAFE_SHARE_TEXT_BYTES);
  });

  it("التنويه بيقول للمندوب يستخدم «نسخ»", () => {
    expect(trimShareText(many(67)).text).toContain("نسخ");
  });

  it("مابيقطعش في نص حرف — النص يفضل صالح", () => {
    const out = trimShareText(many(67)).text;
    // الإيموجي أزواج surrogate صحيحة — الممنوع هو الفردي (نص حرف مقطوع)
    expect(out).not.toMatch(/[�-�](?![�-�])|(?<![�-�])[�-�]/);
    expect(Buffer.from(out, "utf8").toString("utf8")).toBe(out);
  });

  it("رسالة صغيرة بالعربي بتعدّي زي ما هي", () => {
    const t = many(5);
    expect(trimShareText(t)).toEqual({ text: t, trimmed: false });
  });
});

// النسخ مابيعدّيش على share sheet خالص — فمالوش حيطة الـ١٦ كيلوبايت.
// ده الطريق الوحيد اللي بيوصّل الـ٦٧ لوحة **في رسالة واحدة**.
describe("copyShareText — الطريق الكامل (نسخ ولصق)", () => {
  const long = "لوحة أبح 1234 مطلوبة للسحب من حي النهضة\n\n".repeat(2000); // ~١٦٠ كيلوبايت

  it("بينسخ النص كامل من غير أي قص", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    expect(utf8ByteLength(long)).toBeGreaterThan(SAFE_SHARE_TEXT_BYTES * 5);
    await expect(copyShareText(long)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(long);   // كامل — مش مقصوص
  });

  it("بيرجع false لو الحافظة مش متاحة بدل ما يرمي", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true, writable: true });
    await expect(copyShareText("أي نص")).resolves.toBe(false);
  });

  it("بيرجع false لو الحافظة رفضت (بدون صلاحية)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true, writable: true });
    await expect(copyShareText("أي نص")).resolves.toBe(false);
  });
});

// ── تقسيم على أجزاء (آيفون بس) ──────────────────────────────────────────────
// النسخ ما نفعش مع المندوب، فالحل: نبعت القائمة على رسالتين كل واحدة تحت
// حيطة الـ١٦ كيلوبايت. الأندرويد مابيحتاجش ده (حده ~١ ميجا) فمانقسّمش عنده
// عشان مانحوّلش رسالة واحدة شغّالة لرسالتين من غير سبب.
describe("splitShareText — القائمة الكبيرة على أجزاء", () => {
  const SEP = "\n\n──────────\n\n";
  const rec = (i: number) =>
    `${i + 1}. 🚗 أبح ${1000 + i}\nالبنك: بنك الراجحي\nطراز المركبة: اكسبلوررر\n` +
    `صانع المركبة: فورد\nسنة الصنع: 2019\nلون المركبة: ابيض\nالحي: حي النهضة\n` +
    `نوع السيارة (صالون)\n📍 https://www.google.com/maps/search/?api=1&query=24.713552,46.675297`;
  const many = (n: number) =>
    `*السيارات المطلوبة للسحب (${n})*\n\n` + Array.from({ length: n }, (_, i) => rec(i)).join(SEP);

  it("النص اللي داخل في رسالة واحدة مابيتقسّمش", () => {
    const t = many(5);
    expect(splitShareText(t)).toEqual([t]);
  });

  it("🐞 ٦٧ لوحة بتتقسّم لجزئين، كل جزء تحت الحد", () => {
    const parts = splitShareText(many(67));
    expect(parts.length).toBe(2);
    for (const p of parts) expect(utf8ByteLength(p)).toBeLessThanOrEqual(SAFE_SHARE_TEXT_BYTES);
  });

  it("مفيش ولا لوحة بتضيع — الـ٦٧ كلهم موجودين", () => {
    const parts = splitShareText(many(67));
    const joined = parts.join("\n");
    for (let i = 1; i <= 67; i++) expect(joined).toContain(`أبح ${999 + i}`);
  });

  it("مفيش سجل بيتقطع في نصّه بين جزئين", () => {
    for (const p of splitShareText(many(67))) {
      // كل جزء لازم ينتهي بسجل كامل (آخر سطر فيه = سطر الموقع)
      expect(p.trimEnd().endsWith("46.675297")).toBe(true);
    }
  });

  it("كل جزء مكتوب عليه رقمه", () => {
    const parts = splitShareText(many(67));
    expect(parts[0]).toContain("١ من ٢");
    expect(parts[1]).toContain("٢ من ٢");
  });

  it("قائمة ضخمة بتتقسّم لأجزاء كتير وكلها تحت الحد", () => {
    const parts = splitShareText(many(400));
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) expect(utf8ByteLength(p)).toBeLessThanOrEqual(SAFE_SHARE_TEXT_BYTES);
  });

  it("سجل واحد أكبر من الحد لوحده مابيكسرش الحد", () => {
    const huge = "ا".repeat(20_000);            // ٤٠ ألف بايت في سجل واحد
    const parts = splitShareText(huge + SEP + "سجل صغير");
    for (const p of parts) expect(utf8ByteLength(p)).toBeLessThanOrEqual(SAFE_SHARE_TEXT_BYTES);
  });
});

// التقسيم للآيفون بس — الأندرويد حده ~١ ميجا فرسالة واحدة بتوصل عنده عادي.
describe("isIosDevice — نفرّق الآيفون عن الأندرويد", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const IPAD_OLD = "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

  it("آيفون وآيباد = آيفون", () => {
    expect(isIosDevice(IPHONE, 5)).toBe(true);
    expect(isIosDevice(IPAD_OLD, 5)).toBe(true);
  });

  it("آيباد الجديد بيقول إنه ماك — نكشفه باللمس", () => {
    expect(isIosDevice(MAC, 5)).toBe(true);    // ماك بلمس = آيباد
    expect(isIosDevice(MAC, 0)).toBe(false);   // ماك حقيقي
  });

  it("أندرويد = لأ (مايتقسّمش عنده)", () => {
    expect(isIosDevice(ANDROID, 5)).toBe(false);
  });
});

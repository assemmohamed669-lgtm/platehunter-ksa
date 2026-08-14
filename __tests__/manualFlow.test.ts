import { describe, it, expect, vi } from "vitest";
import { clampManualPlate, manualStatus, manualHint } from "@/lib/manualPlateInput";
import { isValidManualPlate } from "@/lib/plateParser";

/**
 * محاكاة أمينة لمربع التشييك اليدوي بعد التعديل — بنفس ترتيب الخطوات اللي في
 * الصفحة: قصّ الكتابة → تشييك تلقائي بعد ٤٥٠ ملّي → قفل ضد الدوس المتكرر →
 * تفضية فورية → جلب الموقع بإعادة محاولة ولحاقه بالصف بمعرّفه.
 */
function makeBox(gpsPlan: (Array<{ lat: number; lng: number } | null>)) {
  const rows: Array<{ id: string; plate: string; mapsLink?: string }> = [];
  let input = "", error: string | null = null, busy = false, timer: NodeJS.Timeout | null = null;
  let gpsCalls = 0;
  let seq = 0;

  const clearAuto = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const getGps = async () => { const v = gpsPlan[Math.min(gpsCalls, gpsPlan.length - 1)]; gpsCalls++; return v; };

  async function attachGps(id: string) {
    for (let i = 0; i < 5; i++) {
      const gps = await getGps();
      if (gps) {
        const r = rows.find((x) => x.id === id);
        if (r) r.mapsLink = `https://maps/${gps.lat},${gps.lng}`;
        return;
      }
      await new Promise((r) => setTimeout(r, 5));   // فواصل مختصرة في الاختبار
    }
  }

  async function submit() {
    clearAuto();
    if (busy) return "متجاهَل";
    const raw = input.trim();
    if (!raw || error) return "متجاهَل";
    if (!isValidManualPlate(raw)) { error = manualHint(raw); return "رسالة"; }
    busy = true;
    input = ""; error = null;                 // تفضية فورية
    const id = `man-${seq++}`;
    rows.unshift({ id, plate: raw });
    busy = false;                             // القفل بيتفك قبل الموقع
    await attachGps(id);
    return "اتسجّلت";
  }

  function type(val: string) {
    const { text, blocked } = clampManualPlate(val);
    input = text; error = blocked ? manualHint(text, true) : null;
    clearAuto();
    if (!blocked && manualStatus(text) === "ok") {
      timer = setTimeout(() => { void submit(); }, 450);
    }
  }

  return { type, submit, clearAuto, rows,
    get input() { return input; }, get error() { return error; }, get gpsCalls() { return gpsCalls; },
    get pending() { return timer !== null; } };
}

const GPS = { lat: 21.5, lng: 39.2 };

describe("مربع التشييك اليدوي — الرحلة كاملة", () => {
  it("اللوحة بتتشيّك لوحدها بعد ما تكمل من غير إنتر", async () => {
    vi.useFakeTimers();
    const b = makeBox([GPS]);
    b.type("قنص1234");
    expect(b.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    expect(b.rows.map((r) => r.plate)).toEqual(["قنص1234"]);
    expect(b.input).toBe("");
  });

  it("لوحة الموتوسيكل مابتتشيّكش بدري وهو لسه بيكتب الحرف التالت", async () => {
    vi.useFakeTimers();
    const b = makeBox([GPS]);
    b.type("قن1234");            // كاملة كموتوسيكل
    await vi.advanceTimersByTimeAsync(200);
    b.type("قنص1234");           // كمّل الحرف التالت قبل ما المؤقّت يخلص
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    expect(b.rows.map((r) => r.plate)).toEqual(["قنص1234"]);   // واحدة بس والصح
  });

  it("الدوس المتكرر مابيكررش اللوحة", async () => {
    const b = makeBox([GPS]);
    b.type("قنص1234"); b.clearAuto();
    const res = await Promise.all([b.submit(), b.submit(), b.submit(), b.submit()]);
    expect(res.filter((r) => r === "اتسجّلت")).toHaveLength(1);
    expect(b.rows).toHaveLength(1);
  });

  it("كل لوحة بتاخد موقعها هي بمعرّفها", async () => {
    const b = makeBox([GPS]);
    b.type("قنص1234"); b.clearAuto(); await b.submit();
    b.type("دنر5678"); b.clearAuto(); await b.submit();
    expect(b.rows).toHaveLength(2);
    expect(b.rows.every((r) => r.mapsLink)).toBe(true);
  });

  it("الموقع بيتعاد لحد ما يجي (فشل مرتين ثم نجح)", async () => {
    const b = makeBox([null, null, GPS]);
    b.type("قنص1234"); b.clearAuto(); await b.submit();
    expect(b.gpsCalls).toBe(3);
    expect(b.rows[0].mapsLink).toContain("21.5");
  });

  it("الموقع مارجعش خالص → بيبطّل بعد ٥ محاولات (مافيش لفّة لا نهائية)", async () => {
    const b = makeBox([null]);
    b.type("قنص1234"); b.clearAuto(); await b.submit();
    expect(b.gpsCalls).toBe(5);
    expect(b.rows[0].mapsLink).toBeUndefined();   // ظاهر «جاري...» للمندوب
  });

  it("الخروج من الوضع بيلغي التشييك المعلّق", async () => {
    vi.useFakeTimers();
    const b = makeBox([GPS]);
    b.type("قنص1234");
    b.clearAuto();                    // زي ما بيحصل لما يغيّر الوضع
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    expect(b.rows).toHaveLength(0);
  });

  it("الزيادة مابتتكتبش والرسالة بتروح لما يصحّح", () => {
    const b = makeBox([GPS]);
    b.type("قنصر12345");
    expect(b.input).toBe("قنص1234");
    expect(b.error).toContain("زيادة");
    b.type("دنر5678");
    expect(b.error).toBeNull();
  });
});

/**
 * **قرار المالك (٢٠٢٦-٠٩-٢١): كل لوحة مطلوبة بتطابق تام لازم تطلّع صفّارة
 * وبياناتها — حتى لو المندوب قال ٥٠ لوحة مطلوبة ورا بعض.**
 *
 * كان الإنذار **سلوت واحد**: كل لوحة جديدة بتدوس على اللي قبلها، فالمندوب
 * يشوف الأخيرة بس وصفّارة واحدة متصلة — و٤٩ عربية مطلوبة بتعدّي من غير ما
 * يعرف عنها حاجة. بقى **طابور**: واحدة ورا التانية، وكل واحدة صفّارتها.
 */
import { describe, it, expect } from "vitest";
import { pushAlert, dropCurrent, type QueuedAlert } from "@/lib/wantedAlertQueue";

const a = (plate: string): QueuedAlert => ({ plate, matchType: "exact" });

describe("pushAlert", () => {
  it("أول لوحة بتبقى المعروضة", () => {
    expect(pushAlert([], a("ابح1234")).map((x) => x.plate)).toEqual(["ابح1234"]);
  });

  it("**اللوحة الجديدة مابتدوسش على اللي معروضة** — بتتحط في الطابور وراها", () => {
    const q = pushAlert(pushAlert([], a("ابح1234")), a("دهو5678"));
    expect(q.map((x) => x.plate)).toEqual(["ابح1234", "دهو5678"]);
  });

  it("٥٠ لوحة ورا بعض = ٥٠ في الطابور، ولا واحدة بتضيع", () => {
    let q: QueuedAlert[] = [];
    for (let i = 0; i < 50; i++) q = pushAlert(q, a(`ابح${1000 + i}`));
    expect(q).toHaveLength(50);
    expect(q[0].plate).toBe("ابح1000");
    expect(q[49].plate).toBe("ابح1049");
  });

  it("نفس اللوحة مرتين ورا بعض مابتتكررش في الطابور", () => {
    // نفس العربية اتشيّكت مرتين في ثانية — إنذار واحد يكفي.
    const q = pushAlert(pushAlert([], a("ابح1234")), a("ابح1234"));
    expect(q).toHaveLength(1);
  });

  it("بس نفس اللوحة بعد ما اتقفلت بترجع تنبّه", () => {
    let q = pushAlert([], a("ابح1234"));
    q = dropCurrent(q);
    expect(q).toHaveLength(0);
    q = pushAlert(q, a("ابح1234"));
    expect(q).toHaveLength(1);
  });

  it("فروق المسافات مابتعملش إنذارين لنفس اللوحة", () => {
    const q = pushAlert(pushAlert([], a("ا ب ح 1234")), a("ابح1234"));
    expect(q).toHaveLength(1);
  });

  it("لوحة فاضية بتتجاهل", () => {
    expect(pushAlert([], a(""))).toEqual([]);
  });
});

describe("dropCurrent", () => {
  it("«تم» بتشيل المعروضة وتوري اللي بعدها", () => {
    let q = pushAlert(pushAlert([], a("أولى1111")), a("تانية2222"));
    q = dropCurrent(q);
    expect(q.map((x) => x.plate)).toEqual(["تانية2222"]);
  });

  it("آخر واحدة → الطابور يفضى والشاشة تتقفل", () => {
    expect(dropCurrent(pushAlert([], a("ابح1234")))).toEqual([]);
  });

  it("طابور فاضي مابيرميش", () => {
    expect(dropCurrent([])).toEqual([]);
  });
});
